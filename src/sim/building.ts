import { CELL, TEAM_NEUTRAL, TEAM_PLAYER, WORLD } from '../core/config';
import { clamp, turnToward, wrapAngle, yawOf } from '../core/math';
import type { BuildingDef } from '../data/types';
import { Entity } from './entity';
import type { World } from './world';

export class Building extends Entity {
  readonly kind = 'building' as const;
  readonly def: BuildingDef;
  readonly cx: number;
  readonly cz: number;
  readonly w: number;
  readonly h: number;
  /** 0..1 deployment animation; the structure only functions once it reaches 1. */
  rise = 0;
  turretYaw = 0;
  cooldown = 0;
  recoil = 0;
  target: Entity | null = null;
  private scanT = 0;
  exitX = 0;
  exitZ = 0;
  rallyX = 0;
  rallyZ = 0;
  repairing = false;
  capTeam = -1;
  capProgress = 0;
  private capT = 0;
  private capCount = [0, 0];
  offline = false;
  private smokeT = 0;
  pendingHarvester = false;
  primary = false;

  constructor(def: BuildingDef, team: number, cx: number, cz: number) {
    super();
    this.def = def;
    this.team = team;
    this.cx = cx;
    this.cz = cz;
    this.w = def.w;
    this.h = def.h;
    this.x = (cx + def.w / 2) * CELL;
    this.z = (cz + def.h / 2) * CELL;
    this.hp = this.maxHp = def.hp;
    this.radius = (Math.min(def.w, def.h) * CELL) / 2;
    this.height = def.height;
    this.armor = 'building';
    this.sight = def.sight;
    this.invulnerable = !!def.invulnerable;
    this.name = def.name;

    // The exit/dock faces the map centre so bases open toward the battlefield.
    const dx = WORLD / 2 - this.x;
    const dz = WORLD / 2 - this.z;
    const hw = (def.w * CELL) / 2;
    const hh = (def.h * CELL) / 2;
    if (Math.abs(dx) > Math.abs(dz)) {
      this.exitX = this.x + Math.sign(dx || 1) * (hw + 1.6);
      this.exitZ = this.z;
    } else {
      this.exitX = this.x;
      this.exitZ = this.z + Math.sign(dz || 1) * (hh + 1.6);
    }
    this.exitX = clamp(this.exitX, 2, WORLD - 2);
    this.exitZ = clamp(this.exitZ, 2, WORLD - 2);
    this.rallyX = clamp(this.exitX + (this.exitX - this.x) * 0.9, 2, WORLD - 2);
    this.rallyZ = clamp(this.exitZ + (this.exitZ - this.z) * 0.9, 2, WORLD - 2);
    this.turretYaw = yawOf(dx, dz);
  }

  get built(): boolean {
    return this.rise >= 1;
  }

  update(w: World, dt: number): void {
    if (this.flash > 0) this.flash -= dt;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 5);
    if (this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / 1.4);
      if (this.rise >= 1 && this.pendingHarvester) {
        this.pendingHarvester = false;
        w.spawnUnit('harvester', this.team, this.exitX, this.exitZ);
      }
      return;
    }
    const p = this.team < TEAM_NEUTRAL ? w.players[this.team] : null;

    if (this.def.income && p) p.credits += this.def.income * p.incomeMul * dt;
    if (this.def.capturable) this.updateCapture(w, dt);

    // Repair (toggled by the owner).
    if (this.repairing && p) {
      if (this.hp >= this.maxHp) {
        this.repairing = false;
      } else {
        const heal = this.maxHp * 0.07 * dt;
        const cost = (heal / this.maxHp) * this.def.cost * 0.35;
        if (p.credits >= cost) {
          p.credits -= cost;
          this.hp = Math.min(this.maxHp, this.hp + heal);
        } else {
          this.repairing = false;
        }
      }
    }

    // Damage smoke.
    if (this.hp < this.maxHp * 0.5 && !this.invulnerable && this.visible) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = this.hp < this.maxHp * 0.25 ? 0.12 : 0.3;
        const ox = (Math.random() - 0.5) * this.w * CELL * 0.6;
        const oz = (Math.random() - 0.5) * this.h * CELL * 0.6;
        w.hooks.smoke(this.x + ox, w.groundY(this.x, this.z) + this.height * 0.6, this.z + oz, this.hp < this.maxHp * 0.25 ? 1.5 : 1);
      }
    }

    if (this.stun > 0) {
      this.stun -= dt;
      return;
    }

    const wpn = this.def.weapon;
    if (!wpn || !p) return;
    this.offline = !!this.def.needsPower && p.lowPower;
    if (this.offline) return;
    if (this.cooldown > 0) this.cooldown -= dt * (p.lowPower ? 0.6 : 1);
    this.scanT -= dt;
    let t = this.target;
    if (t && (!t.alive || !w.hostile(this.team, t.team) || (this.team === TEAM_PLAYER && !t.visible))) t = this.target = null;
    if (t && Math.hypot(t.x - this.x, t.z - this.z) - t.radius > wpn.range) t = this.target = null;
    if (!t && this.scanT <= 0) {
      this.scanT = 0.3;
      t = this.target = w.findTarget(this, wpn, wpn.range);
    }
    if (!t) return;
    const aim = yawOf(t.x - this.x, t.z - this.z);
    this.turretYaw = turnToward(this.turretYaw, aim, 6 * dt);
    if (Math.abs(wrapAngle(aim - this.turretYaw)) < 0.14 && this.cooldown <= 0) {
      this.cooldown = wpn.cooldown;
      this.recoil = 1;
      const top = wpn.projectile === 'arc';
      const f = top ? 0 : 1.9;
      const mx = this.x + Math.sin(this.turretYaw) * f;
      const mz = this.z + Math.cos(this.turretYaw) * f;
      const my = w.groundY(this.x, this.z) + this.height * (top ? 0.95 : 0.62);
      w.fireWeapon(this, wpn, t, mx, my, mz, this.turretYaw, 1);
    }
  }

  /** Outposts flip to whichever side keeps infantry next to them uncontested. */
  private updateCapture(w: World, dt: number): void {
    this.capT -= dt;
    if (this.capT <= 0) {
      this.capT = 0.25;
      this.capCount[0] = 0;
      this.capCount[1] = 0;
      const r = this.radius + 6;
      w.forEachNear(this.x, this.z, r, (e) => {
        if (e.kind !== 'unit' || e.flying || e.team > 1) return;
        const u = e as import('./unit').Unit;
        if (u.def.canCapture && u.dropT <= 0) this.capCount[e.team]++;
      });
    }
    const [a, b] = this.capCount;
    let capturer = -1;
    if (a > 0 && b === 0) capturer = 0;
    else if (b > 0 && a === 0) capturer = 1;
    if (capturer >= 0 && capturer !== this.team) {
      if (this.capTeam !== capturer) {
        this.capTeam = capturer;
        this.capProgress = 0;
      }
      this.capProgress += (dt / 9) * Math.sqrt(Math.min(4, this.capCount[capturer]));
      if (this.capProgress >= 1) {
        this.capProgress = 0;
        this.capTeam = -1;
        w.captureBuilding(this, capturer);
      }
    } else if (a + b === 0 || capturer === this.team) {
      this.capProgress = Math.max(0, this.capProgress - dt / 5);
      if (this.capProgress <= 0) this.capTeam = -1;
    }
  }

  /** True when the world point lies inside the footprint (with a small margin). */
  contains(x: number, z: number, margin = 0): boolean {
    return (
      Math.abs(x - this.x) <= (this.w * CELL) / 2 + margin && Math.abs(z - this.z) <= (this.h * CELL) / 2 + margin
    );
  }
}
