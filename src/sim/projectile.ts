import type { DamageType } from '../data/types';
import type { Entity } from './entity';
import type { World } from './world';

export type ProjectileType = 'shell' | 'rocket' | 'lob';

/** A travelling shot. Shells and rockets track their target; lobbed rounds fly a fixed arc. */
export class Projectile {
  x: number;
  y: number;
  z: number;
  /** Direction of travel (unit vector), used by the renderer to orient the model. */
  dx = 0;
  dy = 0;
  dz = 1;
  private sx: number;
  private sy: number;
  private sz: number;
  private tx: number;
  private ty: number;
  private tz: number;
  private t = 0;
  private duration = 1;
  private arc = 0;
  speed: number;
  alive = true;
  trailT = 0;

  constructor(
    readonly type: ProjectileType,
    x: number,
    y: number,
    z: number,
    private target: Entity | null,
    tx: number,
    ty: number,
    tz: number,
    speed: number,
    readonly damage: number,
    readonly dtype: DamageType,
    readonly splash: number,
    readonly team: number,
    readonly source: Entity | null,
    readonly big = false,
  ) {
    this.x = this.sx = x;
    this.y = this.sy = y;
    this.z = this.sz = z;
    this.tx = tx;
    this.ty = ty;
    this.tz = tz;
    this.speed = speed;
    if (type === 'lob') {
      const d = Math.hypot(tx - x, tz - z);
      this.duration = Math.max(0.35, d / speed);
      this.arc = Math.min(14, 2 + d * 0.28);
    }
    const len = Math.hypot(tx - x, ty - y, tz - z) || 1;
    this.dx = (tx - x) / len;
    this.dy = (ty - y) / len;
    this.dz = (tz - z) / len;
  }

  update(w: World, dt: number): void {
    if (this.type === 'lob') {
      this.t += dt / this.duration;
      const t = Math.min(1, this.t);
      const px = this.x;
      const py = this.y;
      const pz = this.z;
      this.x = this.sx + (this.tx - this.sx) * t;
      this.z = this.sz + (this.tz - this.sz) * t;
      this.y = this.sy + (this.ty - this.sy) * t + Math.sin(Math.PI * t) * this.arc;
      const len = Math.hypot(this.x - px, this.y - py, this.z - pz);
      if (len > 1e-4) {
        this.dx = (this.x - px) / len;
        this.dy = (this.y - py) / len;
        this.dz = (this.z - pz) / len;
      }
      if (this.t >= 1) this.hit(w, null);
      return;
    }
    // homing: follow the target while it lives, otherwise fly to its last position
    const tg = this.target;
    if (tg && tg.alive) {
      this.tx = tg.x;
      this.tz = tg.z;
      this.ty = w.groundY(tg.x, tg.z) + tg.alt + tg.height * 0.5;
    }
    if (this.type === 'rocket') this.speed += dt * 30;
    const ex = this.tx - this.x;
    const ey = this.ty - this.y;
    const ez = this.tz - this.z;
    const d = Math.hypot(ex, ey, ez);
    const step = this.speed * dt;
    if (d <= step + 0.4) {
      this.x = this.tx;
      this.y = this.ty;
      this.z = this.tz;
      this.hit(w, tg && tg.alive ? tg : null);
      return;
    }
    this.dx = ex / d;
    this.dy = ey / d;
    this.dz = ez / d;
    this.x += this.dx * step;
    this.y += this.dy * step;
    this.z += this.dz * step;
  }

  private hit(w: World, direct: Entity | null): void {
    this.alive = false;
    const ground = w.groundY(this.x, this.z);
    if (direct) w.damage(direct, this.damage, this.dtype, this.source, this.team);
    if (this.splash > 0) w.splash(this.x, this.z, this.splash, this.damage, this.dtype, this.source, this.team, direct);
    const size = this.type === 'lob' ? (this.big ? 2.4 : 1.5) : this.type === 'rocket' ? 1.0 : this.splash > 0 ? 1.1 : 0.75;
    w.hooks.explosion(this.x, Math.max(this.y, ground + 0.3), this.z, size);
    if (this.type === 'lob') {
      w.hooks.scorch(this.x, this.z, this.big ? 3 : 2);
      w.hooks.sound(this.big ? 'explosion_l' : 'explosion_m', this.x, this.z, 1, this.team);
      if (this.big) w.hooks.shake(this.x, this.z, 0.5);
    } else {
      w.hooks.sound('explosion_s', this.x, this.z, 0.7, this.team);
    }
  }
}
