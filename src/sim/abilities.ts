import { GRID, TEAM_PLAYER, WORLD } from '../core/config';
import { clamp, dist } from '../core/math';
import { POWER_DEFS } from '../data/heroes';
import type { Building } from './building';
import type { Entity } from './entity';
import type { Rgb } from './hooks';
import { NavGrid } from './nav';
import { Projectile } from './projectile';
import type { Unit } from './unit';
import type { World } from './world';

export interface Effect {
  type: 'barrage' | 'tempest' | 'killzone' | 'reveal' | 'lance' | 'drop';
  x: number;
  z: number;
  radius: number;
  team: number;
  t: number;
  dur: number;
  tick: number;
  power: number;
  count: number;
  source: Unit | null;
}

function effect(type: Effect['type'], x: number, z: number, radius: number, team: number, dur: number, power = 0, source: Unit | null = null): Effect {
  return { type, x, z, radius, team, t: 0, dur, tick: 0, power, count: 0, source };
}

const GOLD: Rgb = [1, 0.75, 0.3];
const VIOLET: Rgb = [0.75, 0.55, 1];
const CYAN: Rgb = [0.45, 0.9, 1];
const RED: Rgb = [1, 0.35, 0.3];
const GREEN: Rgb = [0.5, 1, 0.65];

function enemiesNear(w: World, team: number, x: number, z: number, r: number): Entity[] {
  const out: Entity[] = [];
  w.forEachNear(x, z, r, (e) => {
    if (w.hostile(team, e.team) && !e.invulnerable) out.push(e);
  });
  return out;
}

function nearestEnemy(w: World, team: number, x: number, z: number, r: number, needVisible: boolean): Entity | null {
  let best: Entity | null = null;
  let bd = 1e9;
  for (const e of enemiesNear(w, team, x, z, r)) {
    if (needVisible && !e.visible) continue;
    const d = dist(e.x, e.z, x, z);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function midY(w: World, e: Entity): number {
  return w.groundY(e.x, e.z) + e.alt + e.height * 0.5;
}

/** Execute a hero ability. Returns false (without spending the cooldown) if it had no valid target. */
export function castAbility(w: World, hero: Unit, index: number, x: number, z: number): boolean {
  const p = w.players[hero.team];
  const def = hero.hero?.abilities[index];
  if (!def || !hero.alive || hero.stun > 0) return false;
  if (p.abilityCooldowns[index] > 0 || p.heroLevel < def.unlockLevel) return false;
  const lvl = 1 + 0.12 * (p.heroLevel - 1);
  const mine = hero.team === TEAM_PLAYER;
  const hy = w.groundY(hero.x, hero.z) + hero.height * 0.7;
  x = clamp(x, 1, WORLD - 1);
  z = clamp(z, 1, WORLD - 1);

  switch (def.id) {
    case 'barrage': {
      const e = effect('barrage', x, z, def.radius, hero.team, 1.6, 95 * lvl, hero);
      w.effects.push(e);
      w.hooks.zone(x, z, def.radius, GOLD, 1.8);
      w.hooks.sound('artillery', hero.x, hero.z);
      break;
    }
    case 'rally': {
      w.forEachNear(hero.x, hero.z, def.radius, (e) => {
        if (e.team === hero.team && e.kind === 'unit') (e as Unit).haste = 10;
      });
      w.hooks.ring(hero.x, hero.z, def.radius, GOLD, 0.9);
      w.hooks.sparkle(hero.x, hy, hero.z, GOLD, 26);
      w.hooks.sound('rally', hero.x, hero.z);
      break;
    }
    case 'bastion': {
      w.forEachNear(hero.x, hero.z, def.radius, (e) => {
        if (e.team === hero.team && e.kind === 'unit') (e as Unit).shield = 8;
      });
      w.hooks.ring(hero.x, hero.z, def.radius, CYAN, 1.1);
      w.hooks.zone(hero.x, hero.z, def.radius, CYAN, 1.5);
      w.hooks.sound('shield', hero.x, hero.z);
      break;
    }
    case 'chain': {
      let cur = nearestEnemy(w, hero.team, x, z, def.radius, mine);
      if (!cur) return false;
      let dmg = 170 * lvl;
      let fx = hero.x;
      let fy = hy;
      let fz = hero.z;
      const hit = new Set<Entity>();
      for (let i = 0; i < 6 && cur; i++) {
        hit.add(cur);
        const cy = midY(w, cur);
        w.hooks.lightning(fx, fy, fz, cur.x, cy, cur.z, VIOLET);
        w.hooks.impact(cur.x, cy, cur.z, 1.4);
        fx = cur.x;
        fy = cy;
        fz = cur.z;
        w.damage(cur, dmg, 'energy', hero, hero.team);
        dmg *= 0.85;
        let next: Entity | null = null;
        let bd = 9;
        for (const e of enemiesNear(w, hero.team, fx, fz, 9)) {
          if (hit.has(e) || !e.alive) continue;
          const d = dist(e.x, e.z, fx, fz);
          if (d < bd) {
            bd = d;
            next = e;
          }
        }
        cur = next;
      }
      w.hooks.sound('arc_big', hero.x, hero.z);
      break;
    }
    case 'blink': {
      let nx = x;
      let nz = z;
      if (w.nav.blockedAt(nx, nz)) {
        const free = w.nav.nearestFree(NavGrid.cellOf(nx), NavGrid.cellOf(nz));
        if (free < 0) return false;
        nx = NavGrid.center(free % GRID);
        nz = NavGrid.center((free / GRID) | 0);
      }
      w.hooks.ring(hero.x, hero.z, 3, CYAN, 0.45);
      w.hooks.sparkle(hero.x, hy, hero.z, CYAN, 18);
      w.hooks.lightning(hero.x, hy, hero.z, nx, w.groundY(nx, nz) + 1.5, nz, CYAN);
      hero.x = nx;
      hero.z = nz;
      w.hooks.ring(nx, nz, def.radius, CYAN, 0.6);
      w.hooks.sparkle(nx, w.groundY(nx, nz) + 1.5, nz, CYAN, 24);
      for (const e of enemiesNear(w, hero.team, nx, nz, def.radius)) {
        e.stun = Math.max(e.stun, 1.5);
        w.damage(e, 40 * lvl, 'energy', hero, hero.team);
      }
      w.hooks.sound('blink', nx, nz);
      break;
    }
    case 'tempest': {
      w.effects.push(effect('tempest', x, z, def.radius, hero.team, 8, 42 * lvl, hero));
      w.hooks.zone(x, z, def.radius, VIOLET, 8);
      w.hooks.sound('arc_big', x, z);
      break;
    }
    case 'deadeye': {
      const t = nearestEnemy(w, hero.team, x, z, def.radius, mine);
      if (!t) return false;
      const ty = midY(w, t);
      w.hooks.tracer(hero.x, hy, hero.z, t.x, ty, t.z, true);
      w.hooks.lightning(hero.x, hy, hero.z, t.x, ty, t.z, GREEN);
      w.hooks.impact(t.x, ty, t.z, 2.2);
      w.hooks.explosion(t.x, ty, t.z, 0.8);
      w.hooks.sound('sniper_big', hero.x, hero.z);
      w.damage(t, 460 * lvl, 'energy', hero, hero.team);
      break;
    }
    case 'emp': {
      for (const e of enemiesNear(w, hero.team, x, z, def.radius)) {
        const mech = e.kind === 'building' ? !!(e as Building).def.weapon : e.armor !== 'infantry';
        if (mech) e.stun = Math.max(e.stun, 5);
      }
      w.hooks.ring(x, z, def.radius, CYAN, 0.7);
      w.hooks.zone(x, z, def.radius, CYAN, 5);
      w.hooks.sparkle(x, w.groundY(x, z) + 1, z, CYAN, 40);
      w.hooks.sound('emp', x, z);
      break;
    }
    case 'killzone': {
      w.effects.push(effect('killzone', x, z, def.radius, hero.team, 12, 0, hero));
      w.hooks.zone(x, z, def.radius, RED, 12);
      w.hooks.ring(x, z, def.radius, RED, 0.8);
      w.hooks.sound('mark', x, z);
      break;
    }
    default:
      return false;
  }
  p.abilityCooldowns[index] = def.cooldown;
  return true;
}

/** Spend requisition on a support power. Returns '' on success or the reason it failed. */
export function usePower(w: World, team: number, id: string, x: number, z: number): string {
  const def = POWER_DEFS[id];
  const p = w.players[team];
  if (!def) return 'Unknown power';
  if ((p.powerCooldowns[id] ?? 0) > 0) return 'Still recharging';
  if (Math.floor(p.req) < def.cost) return 'Not enough Requisition';
  const mine = team === TEAM_PLAYER;
  x = clamp(x, 2, WORLD - 2);
  z = clamp(z, 2, WORLD - 2);
  switch (id) {
    case 'cache': {
      p.credits += 800;
      if (mine) {
        const hq = w.nearestBuilding(team, 'hq', 0, 0);
        if (hq) w.hooks.text(hq.x, hq.height + 1, hq.z, '+$800', '#ffd24a');
        w.hooks.notify('Supply cache delivered: +$800', 'good');
        w.hooks.sound('cash');
      }
      break;
    }
    case 'recon': {
      w.effects.push(effect('reveal', x, z, def.radius, team, 25));
      if (mine) {
        w.hooks.ring(x, z, def.radius, CYAN, 1.2);
        w.hooks.sound('scan');
        w.updateFog();
      }
      break;
    }
    case 'drop': {
      if (mine && !w.fog.isExplored(x, z)) return 'Target must be explored';
      if (w.nav.blockedAt(x, z)) {
        // snap to open ground right next to the click rather than refusing outright
        const free = w.nav.nearestFree(NavGrid.cellOf(x), NavGrid.cellOf(z), 3);
        if (free < 0) return 'Drop zone is blocked';
        x = NavGrid.center(free % GRID);
        z = NavGrid.center((free / GRID) | 0);
      }
      w.effects.push(effect('drop', x, z, def.radius, team, 0.9));
      w.hooks.zone(x, z, def.radius, GREEN, 2.2);
      if (mine) w.hooks.voice('Reinforcements inbound');
      w.hooks.sound('scan', x, z);
      break;
    }
    case 'lance': {
      w.effects.push(effect('lance', x, z, def.radius, team, 2.6, 950));
      w.hooks.zone(x, z, def.radius, RED, 2.8);
      w.hooks.sound('lance_charge', x, z, 1.2);
      if (mine) w.hooks.voice('Orbital lance charging');
      else if (w.fog.isVisible(x, z)) {
        w.hooks.notify('Enemy orbital strike incoming!', 'bad', x, z);
        w.hooks.ping(x, z, '#ff4444');
        w.hooks.voice('Warning. Orbital strike detected');
      }
      break;
    }
  }
  p.req -= def.cost;
  p.powerCooldowns[id] = def.cooldown;
  return '';
}

/** Tick lingering area effects (barrages, storms, pending strikes and drops). */
export function updateEffects(w: World, dt: number): void {
  let expired = false;
  for (const e of w.effects) {
    e.t += dt;
    e.tick -= dt;
    switch (e.type) {
      case 'barrage': {
        if (e.tick <= 0 && e.count < 6) {
          e.tick = 0.26;
          e.count++;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * e.radius * 0.85;
          const gx = e.x + Math.cos(a) * r;
          const gz = e.z + Math.sin(a) * r;
          w.projectiles.push(
            new Projectile('lob', gx - 6, w.groundY(gx, gz) + 42, gz - 4, null, gx, w.groundY(gx, gz) + 0.2, gz, 42, e.power, 'explosive', 3.4, e.team, e.source, true),
          );
        }
        break;
      }
      case 'tempest': {
        if (e.tick <= 0) {
          e.tick = 0.5;
          const victims: Entity[] = [];
          w.forEachNear(e.x, e.z, e.radius, (v) => {
            if (w.hostile(e.team, v.team) && !v.invulnerable) victims.push(v);
          });
          for (const v of victims) {
            w.damage(v, e.power * 0.5, 'energy', e.source, e.team);
            if (v.kind === 'unit') (v as Unit).slow = 1;
          }
          // visual strikes
          for (let i = 0; i < 2; i++) {
            const tgt = victims.length && Math.random() < 0.7 ? victims[Math.floor(Math.random() * victims.length)] : null;
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * e.radius;
            const sx = tgt ? tgt.x : e.x + Math.cos(a) * r;
            const sz = tgt ? tgt.z : e.z + Math.sin(a) * r;
            const gy = w.groundY(sx, sz);
            w.hooks.lightning(sx + (Math.random() - 0.5) * 5, gy + 26, sz + (Math.random() - 0.5) * 5, sx, gy + 0.5, sz, VIOLET);
            w.hooks.impact(sx, gy + 0.6, sz, 1.3);
          }
          w.hooks.sound('arc', e.x, e.z, 0.6);
        }
        break;
      }
      case 'lance': {
        if (e.t >= e.dur && e.count === 0) {
          e.count = 1;
          const victims: Entity[] = [];
          w.forEachNear(e.x, e.z, e.radius, (v) => {
            if (v.team !== e.team && v.team < 2 && !v.invulnerable) victims.push(v);
          });
          for (const v of victims) {
            const d = Math.max(0, dist(v.x, v.z, e.x, e.z) - v.radius);
            w.damage(v, e.power * (1 - 0.55 * clamp(d / e.radius, 0, 1)), 'energy', null, e.team);
          }
          w.hooks.beam(e.x, e.z, e.radius);
          w.hooks.explosion(e.x, w.groundY(e.x, e.z) + 1, e.z, e.radius * 0.8, true);
          w.hooks.ring(e.x, e.z, e.radius * 1.5, [1, 0.7, 0.4], 0.8);
          w.hooks.scorch(e.x, e.z, e.radius * 0.9);
          w.hooks.shake(e.x, e.z, 2);
          w.hooks.sound('lance', e.x, e.z, 1.5);
        }
        break;
      }
      case 'drop': {
        if (e.t >= e.dur && e.count === 0) {
          e.count = 1;
          const ids = ['tank', 'tank', 'trooper', 'trooper', 'trooper'];
          ids.forEach((id, i) => {
            const a = (i / ids.length) * Math.PI * 2;
            const u = w.spawnUnit(id, e.team, e.x + Math.cos(a) * 3.2, e.z + Math.sin(a) * 3.2);
            u.dropT = 1.0 + i * 0.12;
            u.promote(w, true); // arrive as veterans without five overlapping pop-ups
            if (e.team !== TEAM_PLAYER) w.ai.onUnitBuilt(u);
          });
          if (e.team === TEAM_PLAYER) w.hooks.notify('Reinforcements have arrived', 'good', e.x, e.z);
        }
        break;
      }
      default:
        break;
    }
    if (e.t >= e.dur + (e.type === 'drop' || e.type === 'lance' ? 0.1 : 0)) expired = true;
  }
  if (expired) w.effects = w.effects.filter((e) => e.t < e.dur + (e.type === 'drop' || e.type === 'lance' ? 0.1 : 0));
}
