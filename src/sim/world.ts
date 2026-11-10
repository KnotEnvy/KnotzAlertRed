import {
  CELL, GRID, MAX_QUEUE, MAX_REQUISITION, REQ_SECONDS, SELL_REFUND, TEAM_ENEMY, TEAM_NEUTRAL, TEAM_PLAYER, WORLD,
  HERO_MAX_LEVEL, HERO_SHARE_RADIUS, HERO_XP,
} from '../core/config';
import type { GameConfig } from '../core/config';
import { clamp, dist } from '../core/math';
import { Rng } from '../core/rng';
import { BUILDING_DEFS } from '../data/buildings';
import { HERO_DEFS, HERO_ORDER, UPGRADE_DEFS } from '../data/heroes';
import { DAMAGE_TABLE } from '../data/types';
import type { BuildingDef, DamageType, QueueKind, WeaponDef } from '../data/types';
import { UNIT_DEFS } from '../data/units';
import { castAbility, updateEffects, usePower } from './abilities';
import type { Effect } from './abilities';
import { AIController } from './ai';
import { Building } from './building';
import { Entity, ResourceNode } from './entity';
import { FogGrid } from './fog';
import { NULL_HOOKS } from './hooks';
import type { Hooks } from './hooks';
import { GameMap } from './map';
import { NavGrid } from './nav';
import { Player, QUEUE_KINDS } from './player';
import { Projectile } from './projectile';
import { Unit, makeOrder } from './unit';

const BUCKET = 8;
const BDIM = Math.ceil(WORLD / BUCKET);

const PRODUCER: Record<QueueKind, string> = {
  structure: 'hq',
  defense: 'hq',
  infantry: 'barracks',
  vehicle: 'factory',
  air: 'airpad',
  tech: 'techlab',
};

export interface QueueDef {
  id: string;
  name: string;
  cost: number;
  buildTime: number;
  requires?: string[];
}

export function queueDef(kind: QueueKind, id: string): QueueDef | undefined {
  if (kind === 'structure' || kind === 'defense') return BUILDING_DEFS[id];
  if (kind === 'tech') return UPGRADE_DEFS[id];
  return UNIT_DEFS[id];
}

/** The complete simulation state of one match. */
export class World {
  time = 0;
  readonly map: GameMap;
  readonly nav = new NavGrid();
  readonly fog = new FogGrid();
  readonly players: Player[];
  units: Unit[] = [];
  buildings: Building[] = [];
  nodes: ResourceNode[] = [];
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  hooks: Hooks = NULL_HOOKS;
  readonly ai: AIController;
  result: '' | 'victory' | 'defeat' = '';
  readonly rng: Rng;
  private buckets: Entity[][] = [];
  private fogT = 0;
  private checkT = 1;
  /** Bumped whenever the set of resource nodes changes (views rebuild crystal batches). */
  nodesVersion = 0;

  constructor(readonly config: GameConfig) {
    this.rng = new Rng(config.seed ^ 0x9e3779b9);
    this.map = new GameMap(config.seed);
    for (let i = 0; i < BDIM * BDIM; i++) this.buckets.push([]);
    for (let z = 0; z < GRID; z++) {
      for (let x = 0; x < GRID; x++) {
        if (this.map.isBlockedTerrain(x, z)) this.nav.blocked[z * GRID + x] = 1;
      }
    }
    const others = HERO_ORDER.filter((h) => h !== config.hero);
    const aiHero = others[Math.floor(this.rng.next() * others.length)];
    this.players = [new Player(TEAM_PLAYER, HERO_DEFS[config.hero] ?? HERO_DEFS.rook), new Player(TEAM_ENEMY, HERO_DEFS[aiHero])];
    this.ai = new AIController(this, TEAM_ENEMY, config.difficulty);
    this.setup();
  }

  private setup(): void {
    for (const n of this.map.nodes) this.nodes.push(new ResourceNode(n.x, n.z, n.amount));
    for (const o of this.map.outposts) {
      const b = new Building(BUILDING_DEFS[o.defId], TEAM_NEUTRAL, o.cx, o.cz);
      b.rise = 1;
      b.seen = true; // outposts are landmarks: always drawn, even before they are scouted
      this.nav.setRect(b.cx, b.cz, b.w, b.h, 2);
      this.buildings.push(b);
    }
    const diff = this.config.difficulty;
    this.players[0].credits = 5000;
    const ai = this.players[1];
    ai.credits = diff === 'easy' ? 4000 : diff === 'normal' ? 5500 : 8000;
    ai.incomeMul = diff === 'easy' ? 0.7 : diff === 'normal' ? 1.0 : 1.4;
    ai.buildSpeedMul = diff === 'easy' ? 0.8 : diff === 'normal' ? 1.0 : 1.25;

    for (let team = 0; team < 2; team++) {
      const s = this.map.starts[team];
      const hq = this.placeBuilding(BUILDING_DEFS.hq, team, s.cx - 2, s.cz - 2, true);
      const dirX = Math.sign(WORLD / 2 - hq.x);
      const dirZ = Math.sign(WORLD / 2 - hq.z);
      const bx = hq.x + dirX * 9;
      const bz = hq.z + dirZ * 9;
      this.spawnHero(team, bx, bz);
      const starters = ['trooper', 'trooper', 'trooper', 'tank'];
      starters.forEach((id, i) => {
        this.spawnUnit(id, team, bx + dirX * (2 + (i % 2) * 3) - dirZ * (i - 1.5) * 2.4, bz + dirZ * (2 + (i % 2) * 3) + dirX * (i - 1.5) * 2.4);
      });
    }
    this.recount();
    this.updateFog();
  }

  // ------------------------------------------------------------------ helpers
  groundY(x: number, z: number): number {
    return this.map.height(x, z);
  }

  hostile(a: number, b: number): boolean {
    return a !== b && a < 2 && b < 2;
  }

  forEachNear(x: number, z: number, r: number, fn: (e: Entity) => void): void {
    const x0 = clamp(Math.floor((x - r - BUCKET) / BUCKET), 0, BDIM - 1);
    const x1 = clamp(Math.floor((x + r + BUCKET) / BUCKET), 0, BDIM - 1);
    const z0 = clamp(Math.floor((z - r - BUCKET) / BUCKET), 0, BDIM - 1);
    const z1 = clamp(Math.floor((z + r + BUCKET) / BUCKET), 0, BDIM - 1);
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) {
        const cell = this.buckets[bz * BDIM + bx];
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          if (!e.alive) continue;
          if (Math.hypot(e.x - x, e.z - z) - e.radius <= r) fn(e);
        }
      }
    }
  }

  private rebuildBuckets(): void {
    for (const b of this.buckets) b.length = 0;
    const add = (e: Entity) => {
      const bx = clamp(Math.floor(e.x / BUCKET), 0, BDIM - 1);
      const bz = clamp(Math.floor(e.z / BUCKET), 0, BDIM - 1);
      this.buckets[bz * BDIM + bx].push(e);
    };
    for (const u of this.units) add(u);
    for (const b of this.buildings) add(b);
  }

  findTarget(src: Entity, wpn: WeaponDef, range: number): Entity | null {
    let best: Entity | null = null;
    let bestScore = 1e9;
    this.forEachNear(src.x, src.z, range, (e) => {
      if (e.team === src.team || e.team > 1 || e.invulnerable) return;
      if (e.flying ? !wpn.hitsAir : !wpn.hitsGround) return;
      if (src.team === TEAM_PLAYER && !e.visible) return;
      if (e.kind === 'unit' && (e as Unit).dropT > 0) return;
      const d = Math.hypot(e.x - src.x, e.z - src.z) - e.radius;
      if (wpn.minRange && d < wpn.minRange) return;
      let score = d - DAMAGE_TABLE[wpn.type][e.armor] * 4;
      if (e.kind === 'building') score += (e as Building).def.weapon ? 1 : 9;
      else if (!(e as Unit).def.weapon) score += 5;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    });
    return best;
  }

  nearestBuilding(team: number, defId: string, x: number, z: number): Building | null {
    let best: Building | null = null;
    let bd = 1e9;
    for (const b of this.buildings) {
      if (b.team !== team || !b.alive || b.def.id !== defId || !b.built) continue;
      const d = dist(b.x, b.z, x, z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  /** Best crystal for a harvester: close, and not already crowded by other harvesters. */
  findNode(h: Unit): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bs = 1e9;
    const ref = this.nearestBuilding(h.team, 'refinery', h.x, h.z);
    const hintX = h.order.target ? h.order.target.x : h.x;
    const hintZ = h.order.target ? h.order.target.z : h.z;
    for (const n of this.nodes) {
      if (!n.alive || n.amount <= 0) continue;
      let s = dist(n.x, n.z, hintX, hintZ);
      if (ref) s += dist(n.x, n.z, ref.x, ref.z) * 0.6;
      for (const u of this.units) {
        if (u !== h && u.def.harvester && u.hNode === n) s += 14;
      }
      if (s < bs) {
        bs = s;
        best = n;
      }
    }
    return best;
  }

  tryMove(u: Unit, nx: number, nz: number): boolean {
    const nav = this.nav;
    nx = clamp(nx, 0.8, WORLD - 0.8);
    nz = clamp(nz, 0.8, WORLD - 0.8);
    const rr = Math.min(u.radius * 0.5, 0.62);
    const ok = (x: number, z: number) =>
      !nav.blockedAt(x - rr, z - rr) && !nav.blockedAt(x + rr, z - rr) && !nav.blockedAt(x - rr, z + rr) && !nav.blockedAt(x + rr, z + rr);
    if (ok(nx, nz)) {
      u.x = nx;
      u.z = nz;
      return true;
    }
    if (!ok(u.x, u.z)) {
      if (!nav.blockedAt(nx, nz)) {
        u.x = nx;
        u.z = nz;
        return true;
      }
      return false;
    }
    if (ok(nx, u.z)) {
      u.x = nx;
      return true;
    }
    if (ok(u.x, nz)) {
      u.z = nz;
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ spawning
  spawnUnit(defId: string, team: number, x: number, z: number): Unit {
    const def = UNIT_DEFS[defId];
    return this.addUnit(new Unit(def, team, x, z));
  }

  private addUnit(u: Unit): Unit {
    if (!u.flying) {
      const free = this.nav.nearestFree(NavGrid.cellOf(u.x), NavGrid.cellOf(u.z));
      if (free >= 0 && this.nav.blockedAt(u.x, u.z)) {
        u.x = NavGrid.center(free % GRID);
        u.z = NavGrid.center((free / GRID) | 0);
      }
    }
    const p = this.players[u.team];
    if (p && p.upgrades.has('plating') && (u.def.category === 'vehicle' || u.def.category === 'air')) {
      u.maxHp *= 1.2;
      u.hp = u.maxHp;
    }
    if (u.def.harvester) u.setOrder(makeOrder('harvest'));
    else u.setOrder(makeOrder('idle'));
    u.visible = u.team === TEAM_PLAYER || this.fog.isVisible(u.x, u.z);
    this.units.push(u);
    return u;
  }

  spawnHero(team: number, x: number, z: number): Unit {
    const p = this.players[team];
    const u = new Unit(p.heroDef.unit, team, x, z);
    u.hero = p.heroDef;
    u.maxHp = p.heroDef.unit.hp * (1 + 0.15 * (p.heroLevel - 1));
    u.hp = u.maxHp;
    p.hero = u;
    return this.addUnit(u);
  }

  /** Reason a footprint cannot be placed, or '' when it is valid. */
  canPlace(def: BuildingDef, team: number, cx: number, cz: number): string {
    if (cx < 1 || cz < 1 || cx + def.w > GRID - 1 || cz + def.h > GRID - 1) return 'Out of bounds';
    if (!this.nav.rectFree(cx, cz, def.w, def.h)) return 'Blocked';
    const x = (cx + def.w / 2) * CELL;
    const z = (cz + def.h / 2) * CELL;
    const hw = (def.w * CELL) / 2;
    const hh = (def.h * CELL) / 2;
    if (team === TEAM_PLAYER) {
      for (let iz = cz; iz < cz + def.h; iz++) {
        for (let ix = cx; ix < cx + def.w; ix++) {
          if (!this.fog.explored[iz * GRID + ix]) return 'Unexplored';
        }
      }
    }
    for (const n of this.nodes) {
      if (n.alive && Math.abs(n.x - x) < hw + 1.2 && Math.abs(n.z - z) < hh + 1.2) return 'Crystal in the way';
    }
    let near = false;
    for (const b of this.buildings) {
      if (b.team !== team || !b.alive || b.def.category === 'neutral') continue;
      const gx = Math.max(0, Math.abs(b.x - x) - (b.w * CELL) / 2 - hw);
      const gz = Math.max(0, Math.abs(b.z - z) - (b.h * CELL) / 2 - hh);
      if (Math.hypot(gx, gz) <= 10) {
        near = true;
        break;
      }
    }
    if (!near) return 'Too far from your base';
    return '';
  }

  placeBuilding(def: BuildingDef, team: number, cx: number, cz: number, instant = false): Building {
    const b = new Building(def, team, cx, cz);
    if (instant) b.rise = 1;
    this.nav.setRect(cx, cz, def.w, def.h, 2);
    // Shove any unit standing on the site out of the way.
    for (const u of this.units) {
      if (u.flying || !b.contains(u.x, u.z, 0.2)) continue;
      const free = this.nav.nearestFree(NavGrid.cellOf(u.x), NavGrid.cellOf(u.z));
      if (free >= 0) {
        u.x = NavGrid.center(free % GRID);
        u.z = NavGrid.center((free / GRID) | 0);
      }
    }
    if (def.id === 'refinery') b.pendingHarvester = true;
    b.visible = team === TEAM_PLAYER;
    b.seen = b.visible;
    this.buildings.push(b);
    const p = this.players[team];
    if (p) {
      p.stats.buildingsBuilt++;
      if (def.produces && !this.buildings.some((o) => o !== b && o.team === team && o.alive && o.def.produces === def.produces && o.primary)) {
        b.primary = true;
      }
    }
    if (team === TEAM_PLAYER || this.fog.isVisible(b.x, b.z)) {
      this.hooks.ring(b.x, b.z, Math.max(def.w, def.h) * CELL * 0.75, [0.6, 0.85, 1], 0.6);
      this.hooks.sound('place', b.x, b.z);
    }
    return b;
  }

  sellBuilding(b: Building): void {
    if (!b.alive || b.def.category === 'neutral') return;
    const p = this.players[b.team];
    const refund = Math.round(b.def.cost * SELL_REFUND * (b.hp / b.maxHp));
    p.credits += refund;
    b.alive = false;
    this.nav.setRect(b.cx, b.cz, b.w, b.h, 0);
    if (b.team === TEAM_PLAYER) {
      this.hooks.text(b.x, b.height, b.z, `+$${refund}`, '#7dffb0');
      this.hooks.sound('sell', b.x, b.z);
    }
    this.hooks.smoke(b.x, this.groundY(b.x, b.z) + 1, b.z, 2.5);
    this.recount();
  }

  captureBuilding(b: Building, team: number): void {
    const prev = b.team;
    b.team = team;
    b.visible = team === TEAM_PLAYER || b.visible;
    this.recount();
    this.hooks.ring(b.x, b.z, 9, team === TEAM_PLAYER ? [0.3, 0.6, 1] : [1, 0.3, 0.2], 1.0);
    if (team === TEAM_PLAYER) {
      this.hooks.notify(`${b.def.name} captured`, 'good', b.x, b.z);
      this.hooks.voice('Outpost captured');
      this.hooks.sound('capture', b.x, b.z);
    } else if (prev === TEAM_PLAYER) {
      this.hooks.notify(`${b.def.name} lost to the enemy`, 'bad', b.x, b.z);
      this.hooks.voice('Outpost lost');
      this.hooks.sound('capture_lost', b.x, b.z);
    } else if (b.seen) {
      this.hooks.notify(`Enemy captured the ${b.def.name}`, 'warn', b.x, b.z);
    }
  }

  // ------------------------------------------------------------------ combat
  fireWeapon(src: Entity, wpn: WeaponDef, t: Entity, mx: number, my: number, mz: number, yaw: number, mul: number): void {
    const dmg = wpn.damage * mul;
    const ty = this.groundY(t.x, t.z) + t.alt + t.height * 0.5;
    const big = wpn.damage >= 60;
    if (wpn.projectile !== 'arc') this.hooks.muzzle(mx, my, mz, yaw, big ? 1.5 : wpn.damage >= 30 ? 1 : 0.55);
    this.hooks.sound(wpn.sfx, mx, mz, undefined, src.team);
    switch (wpn.projectile) {
      case 'bullet': {
        const j = t.radius * 0.35;
        const hx = t.x + (Math.random() - 0.5) * j;
        const hz = t.z + (Math.random() - 0.5) * j;
        this.hooks.tracer(mx, my, mz, hx, ty, hz, wpn.damage >= 50);
        this.hooks.impact(hx, ty, hz, wpn.damage >= 50 ? 1.2 : 0.5);
        this.damage(t, dmg, wpn.type, src, src.team);
        break;
      }
      case 'arc': {
        const color = src.team === TEAM_PLAYER ? ([0.45, 0.8, 1] as const) : ([1, 0.45, 0.35] as const);
        this.hooks.lightning(mx, my, mz, t.x, ty, t.z, color);
        this.hooks.impact(t.x, ty, t.z, 1);
        this.damage(t, dmg, wpn.type, src, src.team);
        let last = t;
        const hit = new Set<Entity>([t]);
        let d = dmg;
        for (let i = 0; i < (wpn.chain ?? 0); i++) {
          d *= 0.7;
          let next: Entity | null = null;
          let bd = 7.5;
          this.forEachNear(last.x, last.z, 7.5, (e) => {
            if (hit.has(e) || !this.hostile(src.team, e.team) || e.invulnerable) return;
            const dd = dist(e.x, e.z, last.x, last.z);
            if (dd < bd) {
              bd = dd;
              next = e;
            }
          });
          if (!next) break;
          const n = next as Entity;
          hit.add(n);
          const ly = this.groundY(last.x, last.z) + last.alt + last.height * 0.5;
          const ny = this.groundY(n.x, n.z) + n.alt + n.height * 0.5;
          this.hooks.lightning(last.x, ly, last.z, n.x, ny, n.z, color);
          this.damage(n, d, wpn.type, src, src.team);
          last = n;
        }
        break;
      }
      case 'shell':
        this.projectiles.push(new Projectile('shell', mx, my, mz, t, t.x, ty, t.z, wpn.speed ?? 70, dmg, wpn.type, wpn.splash ?? 0, src.team, src, big));
        break;
      case 'rocket':
        this.projectiles.push(new Projectile('rocket', mx, my, mz, t, t.x, ty, t.z, wpn.speed ?? 26, dmg, wpn.type, wpn.splash ?? 0, src.team, src));
        break;
      case 'lob': {
        const sc = (wpn.splash ?? 2) * 0.3;
        const gx = t.x + (Math.random() - 0.5) * sc;
        const gz = t.z + (Math.random() - 0.5) * sc;
        this.projectiles.push(
          new Projectile('lob', mx, my, mz, null, gx, this.groundY(gx, gz) + 0.2, gz, wpn.speed ?? 22, dmg, wpn.type, wpn.splash ?? 2.5, src.team, src, wpn.damage >= 100),
        );
        break;
      }
    }
  }

  damage(t: Entity, amount: number, dtype: DamageType, src: Entity | null, srcTeam: number): number {
    if (!t.alive || t.invulnerable || amount <= 0) return 0;
    let d = amount * DAMAGE_TABLE[dtype][t.armor];
    const ap = srcTeam === 0 || srcTeam === 1 ? this.players[srcTeam] : null;
    if (ap && ap.upgrades.has('ap_rounds')) d *= 1.2;
    if (t.kind === 'unit') {
      const u = t as Unit;
      if (u.dropT > 0) return 0;
      if (u.shield > 0) d *= 0.4;
    }
    for (const e of this.effects) {
      if (e.type === 'killzone' && e.team !== t.team && dist(e.x, e.z, t.x, t.z) <= e.radius) {
        d *= 1.5;
        break;
      }
    }
    if (d <= 0) return 0;
    t.hp -= d;
    t.lastHit = this.time;
    t.flash = 0.12;
    if (ap) {
      ap.stats.damageDealt += d;
      ap.req = Math.min(MAX_REQUISITION, ap.req + d / 5000);
    }
    if (t.kind === 'unit' && src && src.alive) {
      const u = t as Unit;
      if (!u.target && (u.order.type === 'idle' || u.order.type === 'hold') && u.canHit(src) && this.hostile(u.team, src.team)) {
        if (u.team !== TEAM_PLAYER || src.visible) {
          u.target = src;
          u.provoked = 7;
        }
      }
    }
    if (t.team === TEAM_PLAYER) this.alertPlayer(t);
    else if (t.team === TEAM_ENEMY) this.ai.onDamaged(t, src);
    if (t.hp <= 0) this.kill(t, src, srcTeam);
    return d;
  }

  splash(x: number, z: number, r: number, dmg: number, dtype: DamageType, src: Entity | null, team: number, exclude: Entity | null): void {
    const victims: Entity[] = [];
    this.forEachNear(x, z, r, (e) => {
      if (e !== exclude && this.hostile(team, e.team) && !e.flying) victims.push(e);
    });
    for (const e of victims) {
      const d = Math.max(0, dist(e.x, e.z, x, z) - e.radius * 0.5);
      this.damage(e, dmg * (1 - 0.6 * clamp(d / r, 0, 1)), dtype, src, team);
    }
  }

  private alertPlayer(t: Entity): void {
    const p = this.players[TEAM_PLAYER];
    if (this.time - p.lastAlert < 14) return;
    let msg = '';
    if (t.kind === 'building') msg = 'Our base is under attack!';
    else if ((t as Unit).def.harvester) msg = 'Harvester under attack!';
    else if ((t as Unit).hero && t.hp < t.maxHp * 0.4) msg = `${t.name} is in danger!`;
    if (!msg) return;
    p.lastAlert = this.time;
    this.hooks.notify(msg, 'bad', t.x, t.z);
    this.hooks.voice(msg.replace('!', ''));
    this.hooks.ping(t.x, t.z, '#ff4444');
    this.hooks.sound('alert');
  }

  kill(t: Entity, src: Entity | null, srcTeam: number): void {
    if (!t.alive) return;
    t.alive = false;
    t.hp = 0;
    const gy = this.groundY(t.x, t.z);
    const owner = t.team < 2 ? this.players[t.team] : null;
    const killer = srcTeam === 0 || srcTeam === 1 ? this.players[srcTeam] : null;
    let value = 0;
    if (t.kind === 'unit') {
      const u = t as Unit;
      value = u.hero ? 600 : u.def.cost;
      if (owner) owner.stats.unitsLost++;
      if (killer) killer.stats.unitsKilled++;
      if (u.radius < 1) {
        this.hooks.explosion(u.x, gy + 0.7, u.z, 0.5);
        this.hooks.sound('death', u.x, u.z, 0.6);
      } else {
        this.hooks.explosion(u.x, gy + u.alt + 1, u.z, u.radius * 1.25);
        this.hooks.sound(u.radius > 1.6 ? 'explosion_l' : 'explosion_m', u.x, u.z);
        this.hooks.shake(u.x, u.z, 0.35);
        if (!u.flying) this.hooks.scorch(u.x, u.z, u.radius * 1.6);
      }
      if (u.hero && owner) {
        owner.hero = null;
        owner.heroRespawn = 26 + 7 * owner.heroLevel;
        if (u.team === TEAM_PLAYER) {
          this.hooks.notify(`${u.name} has fallen — reviving in ${Math.round(owner.heroRespawn)}s`, 'bad', u.x, u.z);
          this.hooks.voice('Hero down');
        } else if (u.visible) {
          this.hooks.notify(`Enemy hero ${u.name} eliminated!`, 'good', u.x, u.z);
        }
      }
    } else if (t.kind === 'building') {
      const b = t as Building;
      value = b.def.cost * 0.4;
      this.nav.setRect(b.cx, b.cz, b.w, b.h, 0);
      if (owner) owner.stats.buildingsLost++;
      if (killer) killer.stats.buildingsRazed++;
      const span = Math.max(b.w, b.h) * CELL * 0.5;
      this.hooks.explosion(b.x, gy + b.height * 0.4, b.z, span * 0.9);
      for (let i = 0; i < 3; i++) {
        this.hooks.explosion(b.x + (Math.random() - 0.5) * span * 1.4, gy + Math.random() * b.height * 0.7, b.z + (Math.random() - 0.5) * span * 1.4, span * 0.5);
      }
      this.hooks.scorch(b.x, b.z, span * 1.5);
      this.hooks.sound('collapse', b.x, b.z, 1.2);
      this.hooks.shake(b.x, b.z, 1);
      if (b.team === TEAM_PLAYER) {
        this.hooks.notify(`${b.def.name} destroyed`, 'bad', b.x, b.z);
        this.hooks.voice('Structure lost');
      } else if (b.visible) {
        this.hooks.notify(`Enemy ${b.def.name} destroyed`, 'good', b.x, b.z);
      }
      this.recount();
    }
    // experience
    if (src && src.alive && src.kind === 'unit') {
      const su = src as Unit;
      su.kills++;
      su.addXp(value, this);
    }
    if (killer && killer.hero && killer.hero.alive) {
      const h = killer.hero;
      if (h === src) this.heroXp(killer, value * 0.12);
      else if (dist(h.x, h.z, t.x, t.z) <= HERO_SHARE_RADIUS) this.heroXp(killer, value * 0.05);
    }
  }

  heroXp(p: Player, amount: number): void {
    if (p.heroLevel >= HERO_MAX_LEVEL) return;
    p.heroXp += amount;
    while (p.heroLevel < HERO_MAX_LEVEL && p.heroXp >= HERO_XP[p.heroLevel]) {
      p.heroLevel++;
      const h = p.hero;
      if (h) {
        h.maxHp = h.def.hp * (1 + 0.15 * (p.heroLevel - 1));
        h.hp = h.maxHp;
        this.hooks.ring(h.x, h.z, 7, [1, 0.85, 0.3], 0.9);
        this.hooks.sparkle(h.x, this.groundY(h.x, h.z) + 2, h.z, [1, 0.85, 0.3], 30);
        if (p.team === TEAM_PLAYER) {
          this.hooks.text(h.x, h.height + 1.5, h.z, `LEVEL ${p.heroLevel}`, '#ffd966');
          this.hooks.sound('levelup');
          const unlocked = p.heroDef.abilities.find((a) => a.unlockLevel === p.heroLevel);
          this.hooks.notify(
            unlocked ? `${p.heroDef.name} reached level ${p.heroLevel} — ${unlocked.name} unlocked!` : `${p.heroDef.name} reached level ${p.heroLevel}`,
            'good',
          );
        }
      }
    }
  }

  castAbility(hero: Unit, index: number, x: number, z: number): boolean {
    return castAbility(this, hero, index, x, z);
  }

  usePower(team: number, id: string, x: number, z: number): string {
    return usePower(this, team, id, x, z);
  }

  // ------------------------------------------------------------------ production
  producers(team: number, kind: QueueKind): number {
    return this.players[team].buildingCounts[PRODUCER[kind]] ?? 0;
  }

  /** Why an item cannot be queued right now ('' = it can). */
  queueBlock(team: number, kind: QueueKind, defId: string): string {
    const def = queueDef(kind, defId);
    const p = this.players[team];
    if (!def) return 'Unknown item';
    if (!p.meets(def.requires)) {
      const missing = (def.requires ?? []).filter((r) => !p.has(r)).map((r) => BUILDING_DEFS[r].name);
      return `Requires ${missing.join(', ')}`;
    }
    if (this.producers(team, kind) === 0) return `Requires ${BUILDING_DEFS[PRODUCER[kind]].name}`;
    const q = p.queues[kind];
    if (kind === 'structure' || kind === 'defense') {
      if (q.items.length) return q.ready ? 'Place the finished structure first' : 'Construction already in progress';
    } else if (kind === 'tech') {
      if (p.upgrades.has(defId)) return 'Already researched';
      if (q.count(defId)) return 'Already queued';
    }
    if (q.items.length >= MAX_QUEUE) return 'Queue is full';
    return '';
  }

  enqueue(team: number, kind: QueueKind, defId: string): string {
    const why = this.queueBlock(team, kind, defId);
    if (why) return why;
    this.players[team].queues[kind].items.push({ defId, paid: 0, progress: 0 });
    if (team === TEAM_PLAYER) this.hooks.sound('build_start');
    return '';
  }

  cancel(team: number, kind: QueueKind, defId: string): boolean {
    const p = this.players[team];
    const q = p.queues[kind];
    for (let i = q.items.length - 1; i >= 0; i--) {
      if (q.items[i].defId !== defId) continue;
      p.credits += q.items[i].paid;
      q.items.splice(i, 1);
      if (i === 0) q.ready = false;
      return true;
    }
    return false;
  }

  /** Place the finished structure waiting in a construction queue. */
  placeReady(team: number, kind: 'structure' | 'defense', cx: number, cz: number): string {
    const q = this.players[team].queues[kind];
    const item = q.items[0];
    if (!q.ready || !item) return 'Nothing ready to place';
    const def = BUILDING_DEFS[item.defId];
    const why = this.canPlace(def, team, cx, cz);
    if (why) return why;
    this.placeBuilding(def, team, cx, cz);
    q.items.shift();
    q.ready = false;
    return '';
  }

  primaryProducer(team: number, kind: QueueKind): Building | null {
    let first: Building | null = null;
    for (const b of this.buildings) {
      if (b.team !== team || !b.alive || !b.built || b.def.id !== PRODUCER[kind]) continue;
      if (b.primary) return b;
      if (!first) first = b;
    }
    return first;
  }

  setPrimary(b: Building): void {
    for (const o of this.buildings) {
      if (o.team === b.team && o.def.id === b.def.id) o.primary = false;
    }
    b.primary = true;
  }

  recount(): void {
    for (const p of this.players) {
      p.buildingCounts = {};
      p.powerMade = 0;
      p.powerUsed = 0;
    }
    for (const b of this.buildings) {
      if (!b.alive || b.team > 1 || !b.built) continue;
      const p = this.players[b.team];
      p.buildingCounts[b.def.id] = (p.buildingCounts[b.def.id] ?? 0) + 1;
      if (b.def.power > 0) p.powerMade += b.def.power;
      else p.powerUsed -= b.def.power;
    }
  }

  private updatePlayer(p: Player, dt: number): void {
    const wasLow = p.lowPower;
    p.lowPower = p.powerUsed > p.powerMade;
    if (p.team === TEAM_PLAYER && p.lowPower !== wasLow && this.time > 1) {
      if (p.lowPower) {
        this.hooks.notify('Low power — production slowed, Arc Pylons offline', 'warn');
        this.hooks.voice('Low power');
        this.hooks.sound('powerdown');
      } else {
        this.hooks.notify('Power restored', 'good');
        this.hooks.sound('powerup');
      }
    }
    const reqRate = p.has('obelisk') ? 1.8 : 1;
    p.req = Math.min(MAX_REQUISITION, p.req + (dt / REQ_SECONDS) * reqRate);
    for (const k in p.powerCooldowns) {
      if (p.powerCooldowns[k] > 0) p.powerCooldowns[k] -= dt;
    }
    for (let i = 0; i < 3; i++) {
      if (p.abilityCooldowns[i] > 0) p.abilityCooldowns[i] -= dt;
    }

    // hero revival
    if (!p.hero && p.heroRespawn > 0) {
      p.heroRespawn -= dt;
      if (p.heroRespawn <= 0) {
        const hq = this.nearestBuilding(p.team, 'hq', 0, 0) ?? this.buildings.find((b) => b.team === p.team && b.alive && b.def.category !== 'neutral');
        if (hq) {
          const h = this.spawnHero(p.team, hq.exitX, hq.exitZ);
          this.hooks.ring(h.x, h.z, 6, [1, 0.9, 0.5], 0.8);
          if (p.team === TEAM_PLAYER) {
            this.hooks.notify(`${h.name} has returned to the fight`, 'good', h.x, h.z);
            this.hooks.voice('Hero ready');
            this.hooks.sound('hero_ready');
          }
        } else {
          p.heroRespawn = 5;
        }
      }
    }

    // production queues
    for (const kind of QUEUE_KINDS) {
      const q = p.queues[kind];
      q.stalled = '';
      const item = q.items[0];
      if (!item || q.ready) continue;
      const def = queueDef(kind, item.defId);
      if (!def) {
        q.items.shift();
        continue;
      }
      const n = this.producers(p.team, kind);
      if (n === 0) {
        q.stalled = 'producer';
        continue;
      }
      const rate = Math.min(2.2, 1 + 0.5 * (n - 1)) * (p.lowPower ? 0.5 : 1) * p.buildSpeedMul;
      let dp = Math.min((dt * rate) / def.buildTime, 1 - item.progress);
      const cost = dp * def.cost;
      if (cost > p.credits) {
        dp = def.cost > 0 ? p.credits / def.cost : dp;
        q.stalled = 'funds';
      }
      p.credits -= dp * def.cost;
      item.paid += dp * def.cost;
      item.progress += dp;
      if (item.progress >= 0.9999) this.completeItem(p, kind, item.defId);
    }
  }

  private completeItem(p: Player, kind: QueueKind, defId: string): void {
    const q = p.queues[kind];
    const mine = p.team === TEAM_PLAYER;
    if (kind === 'structure' || kind === 'defense') {
      q.ready = true;
      if (mine) {
        this.hooks.notify(`${BUILDING_DEFS[defId].name} ready — choose a site`, 'good');
        this.hooks.voice('Construction complete');
        this.hooks.sound('ready');
      }
      return;
    }
    q.items.shift();
    if (kind === 'tech') {
      p.upgrades.add(defId);
      if (defId === 'plating') {
        for (const u of this.units) {
          if (u.team === p.team && (u.def.category === 'vehicle' || u.def.category === 'air')) {
            u.maxHp *= 1.2;
            u.hp *= 1.2;
          }
        }
      }
      if (mine) {
        this.hooks.notify(`Research complete: ${UPGRADE_DEFS[defId].name}`, 'good');
        this.hooks.voice('Research complete');
        this.hooks.sound('upgrade');
      }
      return;
    }
    const prod = this.primaryProducer(p.team, kind);
    if (!prod) return;
    const u = this.spawnUnit(defId, p.team, prod.exitX, prod.exitZ);
    u.heading = Math.atan2(prod.exitX - prod.x, prod.exitZ - prod.z);
    u.turretYaw = u.heading;
    p.stats.unitsBuilt++;
    if (!u.def.harvester) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(0, 3.5);
      u.setOrder(makeOrder('move', clamp(prod.rallyX + Math.cos(a) * r, 2, WORLD - 2), clamp(prod.rallyZ + Math.sin(a) * r, 2, WORLD - 2)));
    }
    if (mine) {
      this.hooks.voice(u.def.harvester ? 'Harvester ready' : 'Unit ready');
      this.hooks.sound('unit_ready', prod.x, prod.z, 0.6);
    } else {
      this.ai.onUnitBuilt(u);
    }
  }

  // ------------------------------------------------------------------ frame update
  update(dt: number): void {
    this.time += dt;
    for (const p of this.players) this.updatePlayer(p, dt);
    this.rebuildBuckets();
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.alive) u.update(this, dt);
    }
    let risen = false;
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (!b.alive) continue;
      const wasBuilt = b.built;
      b.update(this, dt);
      if (!wasBuilt && b.built) risen = true;
    }
    if (risen) this.recount();
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.alive) p.update(this, dt);
    }
    updateEffects(this, dt);
    this.separate();

    this.fogT -= dt;
    if (this.fogT <= 0) {
      this.fogT = 0.2;
      this.updateFog();
    }

    this.cleanup();
    if (!this.result) {
      this.ai.update(dt);
      this.checkT -= dt;
      if (this.checkT <= 0) {
        this.checkT = 1;
        this.checkVictory();
      }
    }
  }

  private separate(): void {
    const units = this.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.dropT > 0) continue;
      this.forEachNear(u.x, u.z, u.radius + 0.2, (e) => {
        if (e.kind !== 'unit' || e.id <= u.id) return;
        const v = e as Unit;
        if (v.flying !== u.flying || v.dropT > 0) return;
        const min = (u.radius + v.radius) * 0.92;
        let dx = u.x - v.x;
        let dz = u.z - v.z;
        let d = Math.hypot(dx, dz);
        if (d >= min) return;
        if (d < 0.01) {
          const a = (u.id * 12.9898) % 6.283;
          dx = Math.cos(a);
          dz = Math.sin(a);
          d = 1;
        }
        const push = (min - d) * 0.6;
        const mu = u.radius * u.radius * (u.moving ? 1 : 0.45);
        const mv = v.radius * v.radius * (v.moving ? 1 : 0.45);
        const fu = mv / (mu + mv);
        const nx = dx / d;
        const nz = dz / d;
        if (u.flying) {
          u.x = clamp(u.x + nx * push * fu, 1, WORLD - 1);
          u.z = clamp(u.z + nz * push * fu, 1, WORLD - 1);
          v.x = clamp(v.x - nx * push * (1 - fu), 1, WORLD - 1);
          v.z = clamp(v.z - nz * push * (1 - fu), 1, WORLD - 1);
        } else {
          this.tryMove(u, u.x + nx * push * fu, u.z + nz * push * fu);
          this.tryMove(v, v.x - nx * push * (1 - fu), v.z - nz * push * (1 - fu));
        }
      });
    }
  }

  updateFog(): void {
    const fog = this.fog;
    fog.begin();
    for (const u of this.units) {
      if (u.team === TEAM_PLAYER && u.alive) fog.stamp(u.x, u.z, u.sight);
    }
    for (const b of this.buildings) {
      if (b.team === TEAM_PLAYER && b.alive) fog.stamp(b.x, b.z, b.sight * (b.built ? 1 : 0.5));
    }
    for (const e of this.effects) {
      if (e.team === TEAM_PLAYER && (e.type === 'reveal' || e.type === 'killzone')) fog.stamp(e.x, e.z, e.radius);
    }
    fog.end();
    for (const u of this.units) {
      u.visible = u.team === TEAM_PLAYER || fog.isVisible(u.x, u.z);
    }
    for (const b of this.buildings) {
      if (b.team === TEAM_PLAYER) {
        b.visible = b.seen = true;
        continue;
      }
      const hw = b.w * CELL * 0.5 - 0.5;
      const hh = b.h * CELL * 0.5 - 0.5;
      b.visible =
        fog.isVisible(b.x, b.z) || fog.isVisible(b.x - hw, b.z - hh) || fog.isVisible(b.x + hw, b.z - hh) ||
        fog.isVisible(b.x - hw, b.z + hh) || fog.isVisible(b.x + hw, b.z + hh);
      if (b.visible) b.seen = true;
    }
  }

  private cleanup(): void {
    let dead = false;
    for (const u of this.units) {
      if (!u.alive) {
        dead = true;
        break;
      }
    }
    if (dead) this.units = this.units.filter((u) => u.alive);
    if (this.buildings.some((b) => !b.alive)) this.buildings = this.buildings.filter((b) => b.alive);
    if (this.projectiles.some((p) => !p.alive)) this.projectiles = this.projectiles.filter((p) => p.alive);
    if (this.nodes.some((n) => !n.alive)) {
      this.nodes = this.nodes.filter((n) => n.alive);
      this.nodesVersion++;
    }
  }

  private checkVictory(): void {
    const alive = [0, 0];
    for (const b of this.buildings) {
      if (b.alive && b.team < 2 && b.def.category !== 'neutral') alive[b.team]++;
    }
    if (alive[TEAM_PLAYER] === 0) this.finish('defeat');
    else if (alive[TEAM_ENEMY] === 0) this.finish('victory');
  }

  finish(result: 'victory' | 'defeat'): void {
    if (this.result) return;
    this.result = result;
    this.fog.revealAll = true;
    this.updateFog();
  }
}
