import { CELL, GRID, TEAM_PLAYER, WORLD } from '../core/config';
import type { Difficulty } from '../core/config';
import { clamp, dist } from '../core/math';
import { BUILDING_DEFS } from '../data/buildings';
import { UPGRADE_ORDER } from '../data/heroes';
import type { BuildingDef } from '../data/types';
import { UNIT_DEFS } from '../data/units';
import type { Building } from './building';
import { orderMove } from './commands';
import type { Entity } from './entity';
import { makeOrder } from './unit';
import type { Unit } from './unit';
import type { World } from './world';

const BUILD_ORDER = [
  'power', 'refinery', 'barracks', 'factory', 'power', 'sentry', 'refinery', 'techlab', 'cannon', 'power',
  'airpad', 'arc', 'sentry', 'power', 'cannon', 'arc', 'power', 'sentry', 'cannon',
];

interface Tuning {
  thinkDelay: number; // seconds between construction decisions
  firstAttack: number;
  attackEvery: number;
  waveBase: number;
  waveGrowth: number;
  armyCap: number;
  armyBase: number; // army size allowed at the start of the match
  armyPerMin: number; // growth of the allowed army size
  surplusArmy: number; // extra army slots bought with banked credits (1 per 5000)
  maxHarvesters: number;
  useLance: boolean;
  useDrop: boolean;
  heroSkill: number; // 0..1 chance per think to use an available ability
}

const TUNING: Record<Difficulty, Tuning> = {
  easy: { thinkDelay: 14, firstAttack: 330, attackEvery: 170, waveBase: 4, waveGrowth: 1, armyCap: 16, armyBase: 4, armyPerMin: 1.6, surplusArmy: 0, maxHarvesters: 3, useLance: false, useDrop: false, heroSkill: 0.25 },
  normal: { thinkDelay: 6, firstAttack: 270, attackEvery: 125, waveBase: 6, waveGrowth: 2, armyCap: 30, armyBase: 6, armyPerMin: 3, surplusArmy: 6, maxHarvesters: 5, useLance: true, useDrop: true, heroSkill: 0.6 },
  hard: { thinkDelay: 2, firstAttack: 160, attackEvery: 85, waveBase: 8, waveGrowth: 3, armyCap: 46, armyBase: 9, armyPerMin: 5, surplusArmy: 14, maxHarvesters: 6, useLance: true, useDrop: true, heroSkill: 1 },
};

/**
 * Skirmish opponent. Plays by the same economy and production rules as the human player:
 * follows a build order, keeps harvesters alive, masses a mixed army, defends its base,
 * contests outposts and launches escalating attack waves led by its hero.
 */
export class AIController {
  private t: Tuning;
  private thinkT = 2;
  private buildT = 3;
  private armyT = 1;
  private nextAttack: number;
  private wave = 0;
  private attacking = false;
  private attackTarget: Entity | null = null;
  private threatX = 0;
  private threatZ = 0;
  private threatTime = -999;
  private defendT = 0;
  private captureT = 50;
  private heroRetreat = false;
  private baseX = 0;
  private baseZ = 0;
  private rallyX = 0;
  private rallyZ = 0;

  constructor(
    private w: World,
    private team: number,
    difficulty: Difficulty,
  ) {
    this.t = TUNING[difficulty];
    this.nextAttack = this.t.firstAttack;
  }

  private get p() {
    return this.w.players[this.team];
  }

  onDamaged(target: Entity, src: Entity | null): void {
    if (!src || !src.alive) return;
    const important = target.kind === 'building' || (target as Unit).def.harvester || dist(target.x, target.z, this.baseX, this.baseZ) < 45;
    if (!important) return;
    this.threatX = src.x;
    this.threatZ = src.z;
    this.threatTime = this.w.time;
  }

  onUnitBuilt(u: Unit): void {
    if (u.def.harvester) return;
    u.aiRole = 'defend';
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 17;
    u.setOrder(makeOrder('attackMove', clamp(this.rallyX + Math.cos(a) * r, 2, WORLD - 2), clamp(this.rallyZ + Math.sin(a) * r, 2, WORLD - 2)));
  }

  update(dt: number): void {
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    const step = 0.5;
    this.thinkT = step;
    const w = this.w;
    const hq = w.nearestBuilding(this.team, 'hq', 0, 0);
    if (hq) {
      this.baseX = hq.x;
      this.baseZ = hq.z;
    } else if (this.baseX === 0) {
      const s = w.map.starts[this.team];
      this.baseX = s.cx * CELL;
      this.baseZ = s.cz * CELL;
    }
    const dx = WORLD / 2 - this.baseX;
    const dz = WORLD / 2 - this.baseZ;
    const dl = Math.hypot(dx, dz) || 1;
    this.rallyX = this.baseX + (dx / dl) * 20;
    this.rallyZ = this.baseZ + (dz / dl) * 20;

    this.buildT -= step;
    this.manageConstruction();
    this.manageProduction();
    this.armyT -= step;
    if (this.armyT <= 0) {
      this.armyT = 1.5;
      this.manageArmy();
    }
    this.manageHero();
    this.managePowers();
    this.manageRepairs();
  }

  // ---------------------------------------------------------------- construction
  private manageConstruction(): void {
    const w = this.w;
    const p = this.p;
    for (const kind of ['structure', 'defense'] as const) {
      const q = p.queues[kind];
      if (!q.ready || !q.items[0]) continue;
      const def = BUILDING_DEFS[q.items[0].defId];
      const spot = this.findSpot(def);
      if (spot) w.placeReady(this.team, kind, spot[0], spot[1]);
      else w.cancel(this.team, kind, def.id);
    }
    if (this.buildT > 0 || !p.has('hq')) return;

    // What do we want next?
    const have: Record<string, number> = {};
    for (const b of w.buildings) {
      if (b.team === this.team && b.alive && b.def.category !== 'neutral') have[b.def.id] = (have[b.def.id] ?? 0) + 1;
    }
    for (const kind of ['structure', 'defense'] as const) {
      for (const it of p.queues[kind].items) have[it.defId] = (have[it.defId] ?? 0) + 1;
    }
    let want = '';
    if (p.powerMade - p.powerUsed < 25 && (have.power ?? 0) < 9) want = 'power';
    if (!want) {
      const need: Record<string, number> = {};
      for (const id of BUILD_ORDER) {
        need[id] = (need[id] ?? 0) + 1;
        if ((have[id] ?? 0) < need[id]) {
          want = id;
          break;
        }
      }
    }
    if (!want) return;
    const def = BUILDING_DEFS[want];
    if (!p.meets(def.requires)) {
      // fall back to the first missing prerequisite
      const missing = (def.requires ?? []).find((r) => !p.has(r) && !(have[r] ?? 0));
      if (!missing) return;
      want = missing;
    }
    const d = BUILDING_DEFS[want];
    const kind = d.category === 'defense' ? 'defense' : 'structure';
    if (p.queues[kind].items.length) return;
    if (p.credits < d.cost * 0.4) return;
    if (!w.enqueue(this.team, kind, want)) this.buildT = this.t.thinkDelay;
  }

  /** Spiral outward from the HQ looking for a padded, valid footprint. */
  private findSpot(def: BuildingDef): [number, number] | null {
    const w = this.w;
    const bcx = Math.floor(this.baseX / CELL);
    const bcz = Math.floor(this.baseZ / CELL);
    const dx = WORLD / 2 - this.baseX;
    const dz = WORLD / 2 - this.baseZ;
    const dl = Math.hypot(dx, dz) || 1;
    let px: number;
    let pz: number;
    if (def.category === 'defense') {
      const lat = (w.rng.next() - 0.5) * 26;
      const fwd = 13 + w.rng.next() * 8;
      px = this.baseX + (dx / dl) * fwd - (dz / dl) * lat;
      pz = this.baseZ + (dz / dl) * fwd + (dx / dl) * lat;
    } else {
      const a = w.rng.next() * Math.PI * 2;
      const r = 8 + w.rng.next() * 12;
      px = this.baseX + Math.cos(a) * r - (dx / dl) * 4;
      pz = this.baseZ + Math.sin(a) * r - (dz / dl) * 4;
    }
    let best: [number, number] | null = null;
    let bs = 1e9;
    for (let r = 2; r <= 24; r++) {
      for (let oz = -r; oz <= r; oz++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          const cx = bcx + ox - (def.w >> 1);
          const cz = bcz + oz - (def.h >> 1);
          if (cx < 2 || cz < 2 || cx + def.w > GRID - 2 || cz + def.h > GRID - 2) continue;
          if (!w.nav.rectFree(cx - 1, cz - 1, def.w + 2, def.h + 2)) continue;
          if (w.canPlace(def, this.team, cx, cz)) continue;
          const x = (cx + def.w / 2) * CELL;
          const z = (cz + def.h / 2) * CELL;
          // keep harvesting lanes clear
          let nearOre = false;
          for (const n of w.nodes) {
            if (dist(n.x, n.z, x, z) < 9) {
              nearOre = true;
              break;
            }
          }
          if (nearOre) continue;
          const s = dist(x, z, px, pz);
          if (s < bs) {
            bs = s;
            best = [cx, cz];
          }
        }
      }
      if (best && r > 8 && bs < 10) break;
    }
    return best;
  }

  // ---------------------------------------------------------------- production
  private manageProduction(): void {
    const w = this.w;
    const p = this.p;
    let harvesters = 0;
    let army = 0;
    let gunships = 0;
    for (const u of w.units) {
      if (u.team !== this.team) continue;
      if (u.def.harvester) harvesters++;
      else if (!u.hero) {
        army++;
        if (u.def.flying) gunships++;
      }
    }
    const vq = p.queues.vehicle;
    const refineries = p.buildingCounts.refinery ?? 0;
    const wantHarv = Math.min(this.t.maxHarvesters, refineries * 2 + (refineries > 0 ? 1 : 0));
    if (p.has('factory') && harvesters + vq.count('harvester') < wantHarv && vq.items.length < 3) {
      // harvesters jump the queue
      if (!w.enqueue(this.team, 'vehicle', 'harvester')) {
        const it = vq.items.pop();
        if (it) vq.items.splice(vq.items[0] && vq.items[0].progress > 0 ? 1 : 0, 0, it);
      }
    }
    // spend surplus on research (independent of the army cap)
    if (p.has('techlab') && p.queues.tech.items.length === 0 && p.credits > 2200) {
      const next = UPGRADE_ORDER.find((id) => !p.upgrades.has(id));
      if (next) w.enqueue(this.team, 'tech', next);
    }
    const queued = p.queues.infantry.items.length + vq.items.length + p.queues.air.items.length;
    // a rich AI converts its surplus into a larger standing army
    const surplus = Math.min(this.t.surplusArmy, Math.floor(p.credits / 5000));
    const cap = Math.min(this.t.armyCap, this.t.armyBase + (w.time / 60) * this.t.armyPerMin) + surplus;
    if (army + queued >= cap) return;
    const saving = p.queues.structure.items.length > 0 && p.credits < 800;
    if (saving) return;

    const pick = (table: [string, number][]): string => {
      const ok = table.filter(([id]) => p.meets(UNIT_DEFS[id].requires));
      let total = 0;
      for (const [, wt] of ok) total += wt;
      let r = w.rng.next() * total;
      for (const [id, wt] of ok) {
        r -= wt;
        if (r <= 0) return id;
      }
      return ok.length ? ok[0][0] : '';
    };
    const late = w.time > 420;
    if (p.has('barracks') && p.queues.infantry.items.length < 2 && p.credits > 250) {
      const id = pick([
        ['trooper', late ? 3 : 5],
        ['grenadier', 2],
        ['lancer', 3],
      ]);
      if (id) w.enqueue(this.team, 'infantry', id);
    }
    if (p.has('factory') && vq.items.length < 2 && p.credits > 700) {
      const id = pick([
        ['buggy', late ? 1 : 2],
        ['tank', 5],
        ['artillery', 2],
        ['titan', late ? 4 : 2],
      ]);
      if (id) w.enqueue(this.team, 'vehicle', id);
    }
    if (p.has('airpad') && p.queues.air.items.length < 1 && gunships < 5 && p.credits > 1300) {
      w.enqueue(this.team, 'air', 'gunship');
    }
  }

  // ---------------------------------------------------------------- army
  private manageArmy(): void {
    const w = this.w;
    const defenders: Unit[] = [];
    const attackers: Unit[] = [];
    for (const u of w.units) {
      if (u.team !== this.team || !u.alive || u.def.harvester || u.hero) continue;
      if (!u.aiRole) this.onUnitBuilt(u);
      if (u.aiRole === 'attack') attackers.push(u);
      else if (u.aiRole === 'defend') defenders.push(u);
      else if (u.aiRole === 'capture') this.driveCapturer(u);
    }

    // Respond to raids on the base.
    this.defendT -= 1.5;
    if (w.time - this.threatTime < 8 && this.defendT <= 0 && defenders.length) {
      this.defendT = 4;
      const idle = defenders.filter((u) => !u.target);
      orderMove(w, idle, this.threatX, this.threatZ, false, true);
    } else if (w.time - this.threatTime > 14) {
      // drift back to the rally point when things are quiet
      for (const u of defenders) {
        if (u.order.type === 'idle' && !u.target && dist(u.x, u.z, this.rallyX, this.rallyZ) > 22) {
          u.setOrder(makeOrder('attackMove', this.rallyX + (Math.random() - 0.5) * 12, this.rallyZ + (Math.random() - 0.5) * 12));
        }
      }
    }

    // Outpost capture squads.
    this.captureT -= 1.5;
    if (this.captureT <= 0) {
      this.captureT = 45;
      const post = this.pickOutpost();
      if (post) {
        const squad = defenders.filter((u) => u.def.canCapture).slice(0, 3);
        for (const u of squad) {
          u.aiRole = 'capture';
          u.order.target = null;
          const a = Math.random() * Math.PI * 2;
          u.setOrder(makeOrder('move', post.x + Math.cos(a) * (post.radius + 3), post.z + Math.sin(a) * (post.radius + 3)));
          u.aiPost = post;
        }
      }
    }

    // Attack waves.
    const waveSize = this.t.waveBase + this.wave * this.t.waveGrowth;
    if (!this.attacking && w.time >= this.nextAttack && defenders.length >= Math.min(waveSize, this.t.armyCap - 4)) {
      this.attacking = true;
      this.wave++;
      this.attackTarget = this.pickTarget();
      // Send the wave, but always leave a home guard behind.
      const keep = Math.max(2, Math.floor(defenders.length * 0.25));
      const squad = defenders.slice(keep, keep + waveSize + 3);
      for (const u of squad) u.aiRole = 'attack';
      if (this.attackTarget) orderMove(w, squad, this.attackTarget.x, this.attackTarget.z, false, true);
      attackers.push(...squad);
    }
    if (this.attacking) {
      if (attackers.length < 3) {
        this.attacking = false;
        this.nextAttack = w.time + this.t.attackEvery;
        for (const u of attackers) {
          u.aiRole = 'defend';
          u.setOrder(makeOrder('move', this.rallyX, this.rallyZ));
        }
      } else {
        if (!this.attackTarget || !this.attackTarget.alive) this.attackTarget = this.pickTarget(attackers[0]);
        const tgt = this.attackTarget;
        if (tgt) {
          const idle = attackers.filter((u) => u.order.type === 'idle' && !u.target);
          if (idle.length) orderMove(w, idle, tgt.x, tgt.z, false, true);
        }
      }
    }
  }

  private driveCapturer(u: Unit): void {
    const post = u.aiPost;
    if (!post || !post.alive || post.team === this.team) {
      u.aiRole = 'defend';
      u.setOrder(makeOrder('attackMove', this.rallyX, this.rallyZ));
      return;
    }
    if (u.order.type === 'idle' && dist(u.x, u.z, post.x, post.z) > post.radius + 5) {
      u.setOrder(makeOrder('move', post.x + (Math.random() - 0.5) * 4, post.z + post.radius + 3));
    }
  }

  private pickOutpost(): Building | null {
    let best: Building | null = null;
    let bd = 1e9;
    for (const b of this.w.buildings) {
      if (!b.def.capturable || b.team === this.team) continue;
      const d = dist(b.x, b.z, this.baseX, this.baseZ);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  private pickTarget(from?: Unit): Entity | null {
    const fx = from ? from.x : this.baseX;
    const fz = from ? from.z : this.baseZ;
    let best: Entity | null = null;
    let bs = 1e9;
    for (const b of this.w.buildings) {
      if (b.team !== TEAM_PLAYER || !b.alive || b.def.category === 'neutral') continue;
      let s = dist(b.x, b.z, fx, fz);
      if (b.def.id === 'refinery' || b.def.id === 'power') s -= 15;
      if (s < bs) {
        bs = s;
        best = b;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- hero
  private manageHero(): void {
    const w = this.w;
    const p = this.p;
    const h = p.hero;
    if (!h || !h.alive || h.dropT > 0) return;
    const frac = h.hp / h.maxHp;
    if (frac < 0.3) this.heroRetreat = true;
    else if (frac > 0.75) this.heroRetreat = false;

    const foes: Entity[] = [];
    w.forEachNear(h.x, h.z, 30, (e) => {
      if (e.team === TEAM_PLAYER && !e.invulnerable) foes.push(e);
    });

    if (this.heroRetreat) {
      // Stormcaller blinks out of danger.
      const blink = p.heroDef.abilities.findIndex((a) => a.id === 'blink');
      if (blink >= 0 && p.abilityCooldowns[blink] <= 0 && foes.length) {
        const dx = this.baseX - h.x;
        const dz = this.baseZ - h.z;
        const dl = Math.hypot(dx, dz) || 1;
        const r = Math.min(dl, p.heroDef.abilities[blink].range);
        w.castAbility(h, blink, h.x + (dx / dl) * r, h.z + (dz / dl) * r);
      }
      if (h.order.type !== 'move') h.setOrder(makeOrder('move', this.baseX + (Math.random() - 0.5) * 8, this.baseZ + (Math.random() - 0.5) * 8 + 9));
      return;
    }

    if (foes.length && w.rng.next() < this.t.heroSkill) {
      for (let i = 0; i < 3; i++) {
        const ab = p.heroDef.abilities[i];
        if (p.abilityCooldowns[i] > 0 || p.heroLevel < ab.unlockLevel || ab.id === 'blink') continue;
        if (ab.targeting === 'self') {
          let allies = 0;
          w.forEachNear(h.x, h.z, ab.radius, (e) => {
            if (e.team === this.team && e.kind === 'unit') allies++;
          });
          const close = foes.some((f) => dist(f.x, f.z, h.x, h.z) < 18);
          if (allies >= 4 && close) w.castAbility(h, i, h.x, h.z);
          continue;
        }
        // point abilities: aim at the densest reachable cluster
        let best: Entity | null = null;
        let bc = 0;
        for (const f of foes) {
          if (dist(f.x, f.z, h.x, h.z) > ab.range) continue;
          let c = f.kind === 'unit' && (f as Unit).hero ? 2 : 1;
          for (const g of foes) {
            if (g !== f && dist(g.x, g.z, f.x, f.z) <= ab.radius) c++;
          }
          if (c > bc) {
            bc = c;
            best = f;
          }
        }
        const single = ab.id === 'deadeye' || ab.id === 'chain';
        if (best && (bc >= 3 || (single && bc >= 1))) {
          const b = best as Entity;
          if (w.castAbility(h, i, b.x, b.z)) break;
        }
      }
    }

    // Follow the army: lead attacks, otherwise hold the rally point.
    if (h.order.type === 'idle' && !h.target) {
      if (this.attacking && this.attackTarget && this.attackTarget.alive) {
        h.setOrder(makeOrder('attackMove', this.attackTarget.x, this.attackTarget.z));
      } else if (w.time - this.threatTime < 8) {
        h.setOrder(makeOrder('attackMove', this.threatX, this.threatZ));
      } else if (dist(h.x, h.z, this.rallyX, this.rallyZ) > 16) {
        h.setOrder(makeOrder('attackMove', this.rallyX, this.rallyZ));
      }
    }
  }

  // ---------------------------------------------------------------- support powers
  private managePowers(): void {
    const w = this.w;
    const p = this.p;
    const tokens = Math.floor(p.req);
    if (tokens < 1) return;
    const ready = (id: string) => (p.powerCooldowns[id] ?? 0) <= 0;
    if (this.t.useLance && tokens >= 3 && ready('lance') && w.time > 300) {
      // strike the most valuable cluster of player assets
      let best: Entity | null = null;
      let bv = 900;
      for (const b of w.buildings) {
        if (b.team !== TEAM_PLAYER || !b.alive) continue;
        let v = b.def.cost * (b.def.weapon ? 1.6 : 0.8);
        w.forEachNear(b.x, b.z, 9, (e) => {
          if (e.team === TEAM_PLAYER && e !== b) v += e.kind === 'unit' ? (e as Unit).def.cost * 0.7 : (e as Building).def.cost * 0.4;
        });
        if (v > bv) {
          bv = v;
          best = b;
        }
      }
      if (best) {
        const b = best as Entity;
        w.usePower(this.team, 'lance', b.x, b.z);
        return;
      }
    }
    if (this.t.useDrop && tokens >= 2 && ready('drop') && (this.attacking || w.time - this.threatTime < 6)) {
      const x = this.attacking && this.attackTarget ? (this.attackTarget.x + this.baseX * 2) / 3 : this.threatX;
      const z = this.attacking && this.attackTarget ? (this.attackTarget.z + this.baseZ * 2) / 3 : this.threatZ;
      if (!w.usePower(this.team, 'drop', x, z)) return;
    }
    if (ready('cache') && (p.credits < 1200 || tokens >= 4)) w.usePower(this.team, 'cache', 0, 0);
  }

  private manageRepairs(): void {
    const p = this.p;
    if (p.credits < 600) return;
    for (const b of this.w.buildings) {
      if (b.team === this.team && b.alive && b.built && !b.repairing && b.hp < b.maxHp * 0.6 && this.w.time - b.lastHit > 4) b.repairing = true;
    }
  }
}
