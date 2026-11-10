import { MUZZLES } from '../data/muzzles';
import { FLY_HEIGHT, GRID, TEAM_PLAYER, WORLD } from '../core/config';
import { clamp, dist, turnToward, wrapAngle, yawOf } from '../core/math';
import type { HeroDef, UnitDef, WeaponDef } from '../data/types';
import type { Building } from './building';
import { Entity, ResourceNode } from './entity';
import { NavGrid, UNREACHABLE } from './nav';
import type { World } from './world';

export type OrderType = 'idle' | 'move' | 'attackMove' | 'attack' | 'hold' | 'harvest' | 'cast';

export interface Order {
  type: OrderType;
  x: number;
  z: number;
  target: Entity | null;
  ability: number;
}

export function makeOrder(type: OrderType, x = 0, z = 0, target: Entity | null = null, ability = -1): Order {
  return { type, x, z, target, ability };
}

const RANK_DAMAGE = [1, 1.2, 1.45];
const RANK_HP = [1, 1.15, 1.3];
export const RANK_NAMES = ['Regular', 'Veteran', 'Elite'];
const HARVEST_CAPACITY = 450;
const HARVEST_RATE = 60;

export class Unit extends Entity {
  readonly kind = 'unit' as const;
  readonly def: UnitDef;
  hero: HeroDef | null = null;

  heading = 0;
  turretYaw = 0;
  order: Order = makeOrder('idle');
  queue: Order[] = [];
  target: Entity | null = null;
  cooldown = 0;
  private scanT = Math.random() * 0.3;
  private burstLeft = 0;
  private burstTimer = 0;
  private burstTarget: Entity | null = null;
  private burstSide = 1;
  private aiming = false;

  // movement
  moving = false;
  private anchorX = 0;
  private anchorZ = 0;
  private strayed = false;
  private goalX = 0;
  private goalZ = 0;
  private goalB: Building | null = null;
  private wpX = 0;
  private wpZ = 0;
  private wpGoalX = -999;
  private wpGoalZ = -999;
  private wpT = 0;
  private unreachable = false;
  private progT = 0;
  private progX = 0;
  private progZ = 0;
  private stuckT = 0;

  // harvesting
  cargo = 0;
  hState: 'seek' | 'mine' | 'return' | 'unload' = 'seek';
  hNode: ResourceNode | null = null;
  private hTimer = 0;
  private hSearchT = 0;

  // veterancy
  xp = 0;
  rank = 0;
  kills = 0;

  // status effects & presentation
  haste = 0;
  shield = 0;
  slow = 0;
  recoil = 0;
  /** Seconds left of being 'provoked': an idle unit will chase its attacker much further. */
  provoked = 0;
  dropT = 0;
  age = 0;
  /** AI bookkeeping: which squad/task this unit currently belongs to. */
  aiRole = '';
  aiPost: Building | null = null;

  constructor(def: UnitDef, team: number, x: number, z: number) {
    super();
    this.def = def;
    this.team = team;
    this.x = x;
    this.z = z;
    this.anchorX = x;
    this.anchorZ = z;
    this.progX = x;
    this.progZ = z;
    this.hp = this.maxHp = def.hp;
    this.radius = def.radius;
    this.height = def.height;
    this.armor = def.armor;
    this.sight = def.sight;
    this.flying = !!def.flying;
    this.alt = this.flying ? FLY_HEIGHT : 0;
    this.name = def.name;
    this.heading = team === TEAM_PLAYER ? 0.8 : -2.3;
    this.turretYaw = this.heading;
  }

  // ---------------------------------------------------------------- orders
  setOrder(o: Order, queue = false): void {
    if (queue && this.order.type !== 'idle') {
      if (this.queue.length < 12) this.queue.push(o);
      return;
    }
    this.queue.length = 0;
    this.order = o;
    this.target = null;
    this.stuckT = 0;
    this.wpT = 0;
    this.unreachable = false;
    this.strayed = false;
    if (o.type === 'harvest') {
      this.hNode = o.target instanceof ResourceNode ? o.target : null;
      this.hState = this.cargo >= this.capacityFor(null) ? 'return' : 'seek';
    }
    if (o.type === 'idle' || o.type === 'hold') {
      this.anchorX = this.x;
      this.anchorZ = this.z;
    }
  }

  private nextOrder(): void {
    const next = this.queue.shift();
    if (next) {
      this.order = next;
      this.target = null;
    } else {
      this.order = makeOrder(this.def.harvester ? 'harvest' : 'idle');
      if (this.def.harvester) this.hState = 'seek';
      this.target = null;
    }
    this.anchorX = this.x;
    this.anchorZ = this.z;
    this.strayed = false;
    this.stuckT = 0;
    this.wpT = 0;
    this.unreachable = false;
  }

  // ---------------------------------------------------------------- stats
  damageMul(w: World): number {
    let m = RANK_DAMAGE[this.rank];
    if (this.hero) m *= 1 + 0.1 * (w.players[this.team].heroLevel - 1);
    return m;
  }

  speed(w: World): number {
    let s = this.def.speed;
    if (this.haste > 0) s *= 1.25;
    if (this.slow > 0) s *= 0.55;
    if (this.def.harvester && w.players[this.team]?.upgrades.has('turbo')) s *= 1.2;
    return s;
  }

  private capacityFor(w: World | null): number {
    return HARVEST_CAPACITY * (w && w.players[this.team].upgrades.has('turbo') ? 1.5 : 1);
  }
  capacity(w: World): number {
    return this.capacityFor(w);
  }

  addXp(amount: number, w: World): void {
    if (this.hero || !this.def.weapon) return;
    this.xp += amount;
    const cost = Math.max(150, this.def.cost);
    const want = this.xp >= cost * 5 ? 2 : this.xp >= cost * 2 ? 1 : 0;
    while (this.rank < want) this.promote(w);
  }

  promote(w: World, quiet = false): void {
    if (this.rank >= 2) return;
    const before = RANK_HP[this.rank];
    this.rank++;
    const ratio = RANK_HP[this.rank] / before;
    this.maxHp *= ratio;
    this.hp = Math.min(this.maxHp, this.hp * ratio + this.maxHp * 0.25);
    if (!quiet && (this.team === TEAM_PLAYER || this.visible)) {
      w.hooks.sparkle(this.x, w.groundY(this.x, this.z) + this.alt + this.height, this.z, [1, 0.85, 0.3], 14);
      if (this.team === TEAM_PLAYER) {
        w.hooks.text(this.x, this.height + this.alt + 1, this.z, this.rank === 2 ? 'ELITE' : 'VETERAN', '#ffd966');
        w.hooks.sound('promote', this.x, this.z);
      }
    }
  }

  canHit(t: Entity): boolean {
    const wpn = this.def.weapon;
    if (!wpn || t.invulnerable) return false;
    return t.flying ? wpn.hitsAir : wpn.hitsGround;
  }

  private validTarget(w: World, t: Entity | null): Entity | null {
    if (!t || !t.alive || !w.hostile(this.team, t.team) || !this.canHit(t)) return null;
    if (this.team === TEAM_PLAYER && !t.visible) return null;
    return t;
  }

  // ---------------------------------------------------------------- update
  update(w: World, dt: number): void {
    this.age += dt;
    if (this.cooldown > 0) this.cooldown -= dt * (this.haste > 0 ? 1.35 : 1);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 5);
    if (this.flash > 0) this.flash -= dt;
    if (this.haste > 0) this.haste -= dt;
    if (this.slow > 0) this.slow -= dt;
    if (this.provoked > 0) this.provoked -= dt;
    if (this.shield > 0) {
      this.shield -= dt;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.035 * dt);
    }
    this.moving = false;
    this.aiming = false;
    this.scanT -= dt;

    if (this.dropT > 0) {
      this.dropT -= dt;
      const base = this.flying ? FLY_HEIGHT : 0;
      this.alt = base + Math.max(0, this.dropT) * 46;
      if (this.dropT <= 0) {
        this.alt = base;
        w.hooks.explosion(this.x, w.groundY(this.x, this.z) + 0.3, this.z, 1.2);
        w.hooks.ring(this.x, this.z, 4, [1, 0.8, 0.4], 0.5);
        w.hooks.sound('thump', this.x, this.z);
      }
      return;
    }
    if (this.stun > 0) {
      this.stun -= dt;
      return;
    }

    // out-of-combat regeneration
    if (this.hp < this.maxHp && w.time - this.lastHit > 6) {
      let rate = 0;
      if (this.rank >= 2) rate += 0.01;
      if (this.hero) rate += 0.012;
      if (w.players[this.team].upgrades.has('nanites')) rate += 0.014;
      if (rate > 0) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * rate * dt);
    }

    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstLeft--;
        this.burstTimer = this.def.weapon?.burstDelay ?? 0.15;
        const bt = this.burstTarget;
        if (bt && bt.alive) this.shoot(w, bt);
        else this.burstLeft = 0;
      }
    }

    if (this.def.harvester && this.order.type === 'harvest') this.updateHarvester(w, dt);
    else this.updateOrder(w, dt);

    if (this.def.turret) {
      if (!this.aiming) this.turretYaw = turnToward(this.turretYaw, this.heading, 2.5 * dt);
    } else {
      this.turretYaw = this.heading;
    }
  }

  private scan(w: World, range: number): Entity | null {
    const cur = this.validTarget(w, this.target);
    if (cur) return cur;
    this.target = null;
    const wpn = this.def.weapon;
    if (!wpn || this.scanT > 0) return null;
    this.scanT = 0.28 + (this.id % 7) * 0.02;
    this.target = w.findTarget(this, wpn, range);
    return this.target;
  }

  private acquireRange(): number {
    const wpn = this.def.weapon;
    if (!wpn) return 0;
    return Math.max(wpn.range + 1, Math.min(this.sight, wpn.range + 6));
  }

  private updateOrder(w: World, dt: number): void {
    const o = this.order;
    const wpn = this.def.weapon;
    switch (o.type) {
      case 'idle': {
        const acq = this.acquireRange();
        const t = this.scan(w, acq);
        if (t) {
          const leash = this.provoked > 0 ? 46 : acq + 8;
          if (dist(t.x, t.z, this.anchorX, this.anchorZ) > leash + t.radius) {
            this.target = null;
          } else {
            const before = this.moving;
            this.engage(w, dt, t, true);
            if (this.moving && !before) this.strayed = true;
            break;
          }
        }
        if (this.strayed) {
          if (this.steerTo(w, this.anchorX, this.anchorZ, dt, 1.2)) {
            this.strayed = false;
            this.anchorX = this.x;
            this.anchorZ = this.z;
          }
        }
        break;
      }
      case 'hold': {
        if (!wpn) break;
        const t = this.scan(w, wpn.range);
        if (t) this.engage(w, dt, t, false);
        break;
      }
      case 'move': {
        const arrived = this.steerTo(w, o.x, o.z, dt, 0.7);
        if (this.def.turret && wpn) {
          const t = this.scan(w, wpn.range);
          if (t) this.engage(w, dt, t, false);
        }
        if (arrived) this.nextOrder();
        break;
      }
      case 'attackMove': {
        const acq = this.acquireRange();
        const t = this.scan(w, acq);
        if (t) {
          if (dist(t.x, t.z, this.x, this.z) > acq * 1.6 + t.radius) this.target = null;
          else {
            this.engage(w, dt, t, true);
            break;
          }
        }
        if (this.steerTo(w, o.x, o.z, dt, 1.2)) this.nextOrder();
        break;
      }
      case 'attack': {
        const t = o.target;
        const hidden = this.team === TEAM_PLAYER && t !== null && !t.visible && t.kind === 'unit';
        if (!t || !t.alive || !this.canHit(t) || hidden || !w.hostile(this.team, t.team)) {
          this.nextOrder();
          break;
        }
        this.engage(w, dt, t, true);
        break;
      }
      case 'cast': {
        const ab = this.hero?.abilities[o.ability];
        if (!ab) {
          this.nextOrder();
          break;
        }
        const d = dist(this.x, this.z, o.x, o.z);
        if (d <= ab.range) {
          w.castAbility(this, o.ability, o.x, o.z);
          this.nextOrder();
        } else if (this.steerTo(w, o.x, o.z, dt, ab.range * 0.95)) {
          if (dist(this.x, this.z, o.x, o.z) > ab.range + 1) this.nextOrder();
        }
        break;
      }
      case 'harvest':
        // non-harvesters cannot harvest
        this.nextOrder();
        break;
    }
  }

  /** Aim and fire at `t`, optionally closing the distance. Returns true when in range. */
  private engage(w: World, dt: number, t: Entity, chase: boolean): boolean {
    const wpn = this.def.weapon;
    if (!wpn) return false;
    const dx = t.x - this.x;
    const dz = t.z - this.z;
    const d = Math.hypot(dx, dz) - t.radius;
    if (d > wpn.range) {
      if (chase) {
        this.goalB = t.kind === 'building' ? (t as Building) : null;
        this.steerTo(w, t.x, t.z, dt, 0.5);
      }
      return false;
    }
    if (wpn.minRange && d < wpn.minRange) return false;
    const aim = yawOf(dx, dz);
    let aligned: boolean;
    if (this.def.turret) {
      this.turretYaw = turnToward(this.turretYaw, aim, 7 * dt);
      aligned = Math.abs(wrapAngle(aim - this.turretYaw)) < 0.12;
      this.aiming = true;
    } else {
      this.heading = turnToward(this.heading, aim, this.def.turnRate * dt);
      aligned = Math.abs(wrapAngle(aim - this.heading)) < 0.15;
    }
    if (aligned && this.cooldown <= 0) this.fire(w, wpn, t);
    return true;
  }

  private fire(w: World, wpn: WeaponDef, t: Entity): void {
    this.cooldown = wpn.cooldown;
    this.shoot(w, t);
    if (wpn.burst && wpn.burst > 1) {
      this.burstLeft = wpn.burst - 1;
      this.burstTimer = wpn.burstDelay ?? 0.15;
      this.burstTarget = t;
    }
  }

  private shoot(w: World, t: Entity): void {
    const wpn = this.def.weapon;
    if (!wpn) return;
    const yaw = this.def.turret ? this.turretYaw : this.heading;
    const mz0 = MUZZLES[this.def.model];
    let lat = 0;
    if (wpn.burst && wpn.burst > 1) {
      this.burstSide = -this.burstSide;
      lat = this.burstSide * (mz0?.[2] ?? this.radius * 0.28);
    }
    const fwd = mz0 ? mz0[0] : this.radius * 1.2;
    const mx = this.x + Math.sin(yaw) * fwd + Math.cos(yaw) * lat;
    const mz = this.z + Math.cos(yaw) * fwd - Math.sin(yaw) * lat;
    const my = w.groundY(this.x, this.z) + this.alt + (mz0 ? mz0[1] : this.height * 0.6);
    w.fireWeapon(this, wpn, t, mx, my, mz, yaw, this.damageMul(w));
    this.recoil = 1;
  }

  // ---------------------------------------------------------------- movement
  /** Move toward a goal using flow-field waypoints. Returns true on arrival (or giving up). */
  steerTo(w: World, gx: number, gz: number, dt: number, tol: number): boolean {
    const dg = Math.hypot(gx - this.x, gz - this.z);
    if (dg <= tol) {
      this.stuckT = 0;
      this.goalB = null;
      return true;
    }
    let tx = gx;
    let tz = gz;
    if (!this.flying) {
      this.goalX = gx;
      this.goalZ = gz;
      this.wpT -= dt;
      if (this.wpT <= 0 || Math.abs(gx - this.wpGoalX) + Math.abs(gz - this.wpGoalZ) > 3) {
        this.computeWaypoint(w);
        this.wpT = 0.2 + (this.id % 5) * 0.03;
      }
      if (this.unreachable) {
        this.goalB = null;
        return true;
      }
      tx = this.wpX;
      tz = this.wpZ;
    }
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dw = Math.hypot(dx, dz);
    if (dw > 0.02) {
      const desired = yawOf(dx, dz);
      this.heading = turnToward(this.heading, desired, this.def.turnRate * dt);
      const diff = Math.abs(wrapAngle(desired - this.heading));
      const f = diff > 1.3 ? 0 : diff > 0.6 ? 0.4 : 1;
      const step = Math.min(this.speed(w) * f * dt, dw);
      const nx = this.x + Math.sin(this.heading) * step;
      const nz = this.z + Math.cos(this.heading) * step;
      if (this.flying) {
        this.x = clamp(nx, 1, WORLD - 1);
        this.z = clamp(nz, 1, WORLD - 1);
      } else {
        w.tryMove(this, nx, nz);
      }
    }
    this.moving = true;

    this.progT += dt;
    if (this.progT >= 0.8) {
      const moved = Math.hypot(this.x - this.progX, this.z - this.progZ);
      this.progX = this.x;
      this.progZ = this.z;
      this.progT = 0;
      if (moved < this.def.speed * 0.1) this.stuckT += 0.8;
      else this.stuckT = 0;
      if (this.stuckT >= 1.6 && dg < 7 + this.radius * 2) {
        this.stuckT = 0;
        this.goalB = null;
        return true;
      }
      if (this.stuckT >= 3.2 && !this.flying) {
        this.wpT = 0;
        w.tryMove(this, this.x + (Math.random() - 0.5) * 1.6, this.z + (Math.random() - 0.5) * 1.6);
        if (this.stuckT >= 9) {
          this.stuckT = 0;
          this.goalB = null;
          return true;
        }
      }
    }
    return false;
  }

  private computeWaypoint(w: World): void {
    const nav = w.nav;
    this.wpGoalX = this.goalX;
    this.wpGoalZ = this.goalZ;
    this.unreachable = false;
    const r = Math.min(this.radius * 0.7, 0.9);
    const cx = NavGrid.cellOf(this.x);
    const cz = NavGrid.cellOf(this.z);
    if (nav.isBlocked(cx, cz)) {
      // Standing inside an obstacle (e.g. a structure was placed on top): walk out.
      const free = nav.nearestFree(cx, cz);
      if (free >= 0) {
        this.wpX = NavGrid.center(free % GRID);
        this.wpZ = NavGrid.center((free / GRID) | 0);
        this.x += (this.wpX - this.x) * 0.2;
        this.z += (this.wpZ - this.z) * 0.2;
      }
      return;
    }
    const gb = this.goalB && this.goalB.alive ? this.goalB : null;
    if (!gb && nav.lineClear(this.x, this.z, this.goalX, this.goalZ, r)) {
      this.wpX = this.goalX;
      this.wpZ = this.goalZ;
      return;
    }
    const field = gb
      ? nav.fieldToRect(gb.id, gb.cx, gb.cz, gb.w, gb.h)
      : nav.fieldToCell(NavGrid.cellOf(this.goalX), NavGrid.cellOf(this.goalZ));
    let cur = cz * GRID + cx;
    if (!field || field.dist[cur] === UNREACHABLE) {
      this.unreachable = true;
      this.wpX = this.x;
      this.wpZ = this.z;
      return;
    }
    if (field.dist[cur] === 0) {
      this.wpX = this.goalX;
      this.wpZ = this.goalZ;
      return;
    }
    let found = false;
    for (let step = 0; step < 14; step++) {
      const next = nav.descend(field, cur);
      if (next < 0) break;
      cur = next;
      const wx = NavGrid.center(cur % GRID);
      const wz = NavGrid.center((cur / GRID) | 0);
      if (step === 0 || nav.lineClear(this.x, this.z, wx, wz, r)) {
        this.wpX = wx;
        this.wpZ = wz;
        found = true;
      } else {
        break;
      }
      if (field.dist[cur] === 0) {
        // the goal cell is in direct reach: head for the exact goal point
        if (!gb && nav.lineClear(this.x, this.z, this.goalX, this.goalZ, 0)) {
          this.wpX = this.goalX;
          this.wpZ = this.goalZ;
        }
        break;
      }
    }
    if (!found) {
      this.wpX = this.goalX;
      this.wpZ = this.goalZ;
    }
  }

  // ---------------------------------------------------------------- harvesting
  private updateHarvester(w: World, dt: number): void {
    const p = w.players[this.team];
    const cap = this.capacity(w);
    switch (this.hState) {
      case 'seek': {
        if (this.cargo >= cap) {
          this.hState = 'return';
          break;
        }
        if (!this.hNode || !this.hNode.alive) {
          this.hNode = null;
          this.hSearchT -= dt;
          if (this.hSearchT <= 0) {
            this.hSearchT = 0.5;
            this.hNode = w.findNode(this);
          }
          if (!this.hNode) {
            if (this.cargo > 0) this.hState = 'return';
            break;
          }
        }
        const n = this.hNode;
        if (dist(this.x, this.z, n.x, n.z) > 2.9) {
          if (this.steerTo(w, n.x, n.z, dt, 2.6) && dist(this.x, this.z, n.x, n.z) > 5) {
            // could not reach this crystal: pick another
            this.hNode = null;
          }
        } else {
          this.hState = 'mine';
        }
        break;
      }
      case 'mine': {
        const n = this.hNode;
        if (!n || !n.alive) {
          this.hNode = null;
          this.hState = 'seek';
          break;
        }
        this.heading = turnToward(this.heading, yawOf(n.x - this.x, n.z - this.z), this.def.turnRate * dt);
        const take = Math.min(HARVEST_RATE * dt, n.amount, cap - this.cargo);
        this.cargo += take;
        n.amount -= take;
        this.hTimer -= dt;
        if (this.hTimer <= 0) {
          this.hTimer = 0.22;
          if (this.visible) w.hooks.sparkle(n.x, w.groundY(n.x, n.z) + 0.8, n.z, [0.3, 1, 0.95], 2);
        }
        if (n.amount <= 0.5) {
          n.alive = false;
          this.hNode = null;
          this.hState = this.cargo >= cap ? 'return' : 'seek';
        } else if (this.cargo >= cap - 0.01) {
          this.hState = 'return';
        }
        break;
      }
      case 'return': {
        const ref = w.nearestBuilding(this.team, 'refinery', this.x, this.z);
        if (!ref) break;
        const d = dist(this.x, this.z, ref.exitX, ref.exitZ);
        if (d > 2.6) {
          this.steerTo(w, ref.exitX, ref.exitZ, dt, 2.2);
        } else {
          this.hState = 'unload';
          this.hTimer = 1.6;
        }
        break;
      }
      case 'unload': {
        this.hTimer -= dt;
        if (this.hTimer <= 0) {
          const value = Math.round(this.cargo * p.incomeMul);
          p.credits += value;
          p.stats.harvested += value;
          if (this.team === TEAM_PLAYER) {
            w.hooks.text(this.x, this.height + 1.2, this.z, `+$${value}`, '#7dffb0');
            w.hooks.sound('cash', this.x, this.z, 0.5);
          }
          this.cargo = 0;
          this.hState = 'seek';
        }
        break;
      }
    }
  }

  /** Cell index under the unit (used by formation / AI helpers). */
  cellIndex(): number {
    return NavGrid.cellOf(this.z) * GRID + NavGrid.cellOf(this.x);
  }
}

