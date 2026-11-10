import { Color3, Constants, DynamicTexture, Material, MeshBuilder, StandardMaterial } from './babylon';
import type { Mesh, Scene } from './babylon';
import type { Rgb } from '../sim/hooks';
import { Batch } from './batch';

const MAX_PARTICLES = 5000;

interface Beam {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  width: number;
  r: number; g: number; b: number;
  life: number;
  max: number;
}
interface Tracer {
  x0: number; y0: number; z0: number;
  dx: number; dy: number; dz: number;
  len: number;
  t: number;
  dur: number;
  heavy: boolean;
}
interface Ring {
  x: number; z: number; y: number;
  r0: number; r1: number;
  r: number; g: number; b: number;
  life: number;
  max: number;
  zone: boolean;
}
interface Scorch {
  x: number; z: number; y: number;
  size: number;
  life: number;
  rot: number;
}

function makeTexture(scene: Scene, name: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): DynamicTexture {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

function fxMaterial(scene: Scene, name: string, tex: DynamicTexture | null, additive: boolean): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.emissiveColor = new Color3(1, 1, 1);
  m.diffuseColor = new Color3(0, 0, 0);
  m.specularColor = new Color3(0, 0, 0);
  if (tex) {
    m.diffuseTexture = tex;
    m.useAlphaFromDiffuseTexture = true;
  }
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.transparencyMode = Material.MATERIAL_ALPHABLEND;
  m.alphaMode = additive ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
  return m;
}

/**
 * All transient visuals: a CPU particle system drawn as camera-facing thin instances,
 * tracers, lightning, beams, shockwave rings, zone markers and scorch decals.
 */
export class Fx {
  // particle pool (struct of arrays)
  private px = new Float32Array(MAX_PARTICLES);
  private py = new Float32Array(MAX_PARTICLES);
  private pz = new Float32Array(MAX_PARTICLES);
  private vx = new Float32Array(MAX_PARTICLES);
  private vy = new Float32Array(MAX_PARTICLES);
  private vz = new Float32Array(MAX_PARTICLES);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private s0 = new Float32Array(MAX_PARTICLES);
  private s1 = new Float32Array(MAX_PARTICLES);
  private cr = new Float32Array(MAX_PARTICLES);
  private cg = new Float32Array(MAX_PARTICLES);
  private cb = new Float32Array(MAX_PARTICLES);
  private ca = new Float32Array(MAX_PARTICLES);
  private grav = new Float32Array(MAX_PARTICLES);
  private drag = new Float32Array(MAX_PARTICLES);
  private kind = new Uint8Array(MAX_PARTICLES); // 0 additive, 1 smoke
  private count = 0;

  private beams: Beam[] = [];
  private tracers: Tracer[] = [];
  private rings: Ring[] = [];
  private scorches: Scorch[] = [];
  /** One-frame segments (projectiles, rally lines): 11 numbers each, cleared every update. */
  private segs: number[] = [];

  private glowBatch: Batch;
  private smokeBatch: Batch;
  private beamBatch: Batch;
  private ringBatch: Batch;
  private discBatch: Batch;
  private scorchBatch: Batch;
  /** Thin ground rings (selection circles etc.) pushed by the renderer each frame. */
  readonly markBatch: Batch;

  shakeAmount = 0;
  private meshes: Mesh[] = [];

  constructor(
    scene: Scene,
    private heightAt: (x: number, z: number) => number,
  ) {
    const glowTex = makeTexture(scene, 'fxGlow', 64, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    });
    const smokeTex = makeTexture(scene, 'fxSmoke', 128, (c, s) => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i === 0 ? 0 : s * 0.17;
        const x = s / 2 + Math.cos(a) * r;
        const y = s / 2 + Math.sin(a) * r;
        const rad = s * (0.22 + ((i * 37) % 10) * 0.008);
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, s, s);
      }
    });
    const ringTex = makeTexture(scene, 'fxRing', 256, (c, s) => {
      c.strokeStyle = 'rgba(255,255,255,1)';
      c.lineWidth = s * 0.035;
      c.beginPath();
      c.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = s * 0.08;
      c.beginPath();
      c.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
      c.stroke();
    });
    const markTex = makeTexture(scene, 'fxMark', 128, (c, s) => {
      c.strokeStyle = 'rgba(255,255,255,1)';
      c.lineWidth = s * 0.05;
      c.beginPath();
      c.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
      c.stroke();
    });
    const discTex = makeTexture(scene, 'fxDisc', 128, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.1)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.3)');
      g.addColorStop(0.96, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    });
    const scorchTex = makeTexture(scene, 'fxScorch', 128, (c, s) => {
      for (let i = 0; i < 22; i++) {
        const a = i * 2.4;
        const r = i === 0 ? 0 : s * (0.06 + ((i * 53) % 17) * 0.011);
        const x = s / 2 + Math.cos(a) * r;
        const y = s / 2 + Math.sin(a) * r;
        const rad = s * (0.14 + ((i * 29) % 9) * 0.012);
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(0,0,0,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, s, s);
      }
    });

    const quad = (name: string, mat: StandardMaterial, alphaIndex: number, cap: number): Batch => {
      const mesh = MeshBuilder.CreatePlane(name, { size: 1 }, scene);
      mesh.material = mat;
      mesh.hasVertexAlpha = true;
      mesh.alphaIndex = alphaIndex;
      this.meshes.push(mesh);
      return new Batch(mesh, cap);
    };
    const groundMat = (name: string, tex: DynamicTexture, additive: boolean) => {
      const m = fxMaterial(scene, name, tex, additive);
      m.zOffset = -3;
      return m;
    };
    this.scorchBatch = quad('fxScorchQ', groundMat('fxScorchM', scorchTex, false), 1, 64);
    this.discBatch = quad('fxDiscQ', groundMat('fxDiscM', discTex, true), 2, 16);
    this.ringBatch = quad('fxRingQ', groundMat('fxRingM', ringTex, true), 3, 32);
    this.markBatch = quad('fxMarkQ', groundMat('fxMarkM', markTex, true), 4, 128);
    this.smokeBatch = quad('fxSmokeQ', fxMaterial(scene, 'fxSmokeM', smokeTex, false), 5, 1024);
    this.glowBatch = quad('fxGlowQ', fxMaterial(scene, 'fxGlowM', glowTex, true), 6, 2048);

    const box = MeshBuilder.CreateBox('fxBeam', { size: 1 }, scene);
    box.material = fxMaterial(scene, 'fxBeamM', null, true);
    box.hasVertexAlpha = true;
    box.alphaIndex = 7;
    this.meshes.push(box);
    this.beamBatch = new Batch(box, 512);
  }

  // ------------------------------------------------------------------ emitters
  private spawn(
    kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number,
    life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, grav = 0, drag = 0,
  ): void {
    let i = this.count;
    if (i >= MAX_PARTICLES) {
      i = (Math.random() * MAX_PARTICLES) | 0; // recycle a random old particle
    } else {
      this.count++;
    }
    this.kind[i] = kind;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.cr[i] = r;
    this.cg[i] = g;
    this.cb[i] = b;
    this.ca[i] = a;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  muzzle(x: number, y: number, z: number, yaw: number, scale: number): void {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    this.spawn(0, x, y, z, fx * 3, 0, fz * 3, 0.07, 1.5 * scale, 0.5 * scale, 1.6, 1.25, 0.6, 1);
    this.spawn(0, x + fx * 0.5 * scale, y, z + fz * 0.5 * scale, fx * 9, 0, fz * 9, 0.08, 0.9 * scale, 0.2, 1.6, 1.0, 0.4, 1);
    if (scale >= 1) {
      this.spawn(1, x, y, z, fx * 2 + (Math.random() - 0.5), 0.8, fz * 2 + (Math.random() - 0.5), 0.7, 0.6 * scale, 1.8 * scale, 0.75, 0.72, 0.68, 0.35, 0, 2);
    }
  }

  impact(x: number, y: number, z: number, scale: number): void {
    this.spawn(0, x, y, z, 0, 0, 0, 0.1, 0.9 * scale, 0.2, 1.5, 1.2, 0.7, 0.9);
    const n = 2 + Math.round(scale * 2);
    for (let i = 0; i < n; i++) {
      this.spawn(0, x, y, z, (Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9, 0.2 + Math.random() * 0.2, 0.22, 0.05, 1.6, 1.2, 0.5, 1, -20);
    }
  }

  explosion(x: number, y: number, z: number, size: number, energy = false): void {
    const s = Math.min(size, 9);
    const hot: Rgb = energy ? [0.7, 1.2, 2.0] : [2.0, 1.15, 0.4];
    const mid: Rgb = energy ? [0.5, 0.8, 1.8] : [1.6, 0.55, 0.12];
    this.spawn(0, x, y, z, 0, 0, 0, 0.14, 5.5 * s, 2 * s, 1.8, 1.6, 1.2, 0.9);
    const fire = Math.min(26, Math.round(7 + s * 5));
    for (let i = 0; i < fire; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9;
      const sp = (2 + Math.random() * 5) * Math.sqrt(s);
      const c = Math.random() < 0.5 ? hot : mid;
      this.spawn(
        0, x + (Math.random() - 0.5) * s * 0.6, y + Math.random() * s * 0.4, z + (Math.random() - 0.5) * s * 0.6,
        Math.cos(a) * sp * (1 - up * 0.5), up * sp * 1.2, Math.sin(a) * sp * (1 - up * 0.5),
        0.3 + Math.random() * 0.45, 1.1 * s, 2.3 * s, c[0], c[1], c[2], 0.85, 0, 2.5,
      );
    }
    const smoke = Math.min(14, Math.round(3 + s * 3));
    for (let i = 0; i < smoke; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 2.2 * Math.sqrt(s);
      const v = energy ? 0.5 : 0.16 + Math.random() * 0.14;
      this.spawn(
        1, x + (Math.random() - 0.5) * s, y + Math.random() * s * 0.5, z + (Math.random() - 0.5) * s,
        Math.cos(a) * sp, 1.2 + Math.random() * 2.6, Math.sin(a) * sp,
        1.1 + Math.random() * 1.3, 1.3 * s, 3.4 * s, v, v, energy ? v * 1.4 : v * 1.05, 0.55, 0, 1.2,
      );
    }
    const sparks = Math.min(20, Math.round(5 + s * 4));
    for (let i = 0; i < sparks; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (5 + Math.random() * 11) * Math.sqrt(s);
      this.spawn(0, x, y, z, Math.cos(a) * sp, 3 + Math.random() * 9 * Math.sqrt(s), Math.sin(a) * sp, 0.4 + Math.random() * 0.6, 0.3, 0.06, hot[0], hot[1], hot[2], 1, -22, 0.6);
    }
  }

  smoke(x: number, y: number, z: number, size: number): void {
    const v = 0.14 + Math.random() * 0.1;
    this.spawn(1, x, y, z, (Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 1.4, (Math.random() - 0.5) * 0.8, 1.6 + Math.random(), 0.9 * size, 2.8 * size, v, v, v, 0.5, 0, 0.4);
    if (size > 1.2 && Math.random() < 0.6) {
      this.spawn(0, x, y - 0.3, z, (Math.random() - 0.5) * 0.6, 1.5, (Math.random() - 0.5) * 0.6, 0.4, 1.1, 0.3, 1.8, 0.8, 0.2, 0.8);
    }
  }

  dust(x: number, y: number, z: number, r: number, g: number, b: number): void {
    this.spawn(1, x, y, z, (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.5, 0.5, 1.7, r, g, b, 0.28, 0, 1.5);
  }

  trail(x: number, y: number, z: number): void {
    this.spawn(1, x, y, z, (Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5, 0.55, 0.35, 1.0, 0.8, 0.8, 0.8, 0.4);
    this.spawn(0, x, y, z, 0, 0, 0, 0.12, 0.7, 0.2, 1.7, 1.0, 0.4, 0.9);
  }

  sparkle(x: number, y: number, z: number, color: Rgb, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3.5;
      this.spawn(
        0, x + (Math.random() - 0.5) * 1.2, y + (Math.random() - 0.5) * 1.2, z + (Math.random() - 0.5) * 1.2,
        Math.cos(a) * sp, 1.5 + Math.random() * 4, Math.sin(a) * sp, 0.5 + Math.random() * 0.6, 0.4, 0.05,
        color[0] * 1.6, color[1] * 1.6, color[2] * 1.6, 1, -3, 1.5,
      );
    }
  }

  tracer(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, heavy = false): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz) || 1;
    this.tracers.push({ x0, y0, z0, dx: dx / len, dy: dy / len, dz: dz / len, len, t: 0, dur: len / (heavy ? 260 : 170), heavy });
  }

  lightning(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Rgb): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    const segs = Math.max(3, Math.min(18, Math.round(len / 1.6)));
    let px = x0;
    let py = y0;
    let pz = z0;
    const amp = Math.min(1.1, 0.25 + len * 0.04);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const last = i === segs;
      const nx = x0 + dx * t + (last ? 0 : (Math.random() - 0.5) * 2 * amp);
      const ny = y0 + dy * t + (last ? 0 : (Math.random() - 0.5) * 2 * amp);
      const nz = z0 + dz * t + (last ? 0 : (Math.random() - 0.5) * 2 * amp);
      this.beams.push({ x0: px, y0: py, z0: pz, x1: nx, y1: ny, z1: nz, width: 0.2, r: color[0] * 2.2, g: color[1] * 2.2, b: color[2] * 2.2, life: 0.2, max: 0.2 });
      this.beams.push({ x0: px, y0: py, z0: pz, x1: nx, y1: ny, z1: nz, width: 0.07, r: 2.5, g: 2.5, b: 2.5, life: 0.16, max: 0.16 });
      px = nx;
      py = ny;
      pz = nz;
    }
    this.spawn(0, x1, y1, z1, 0, 0, 0, 0.18, 2.6, 0.6, color[0] * 1.8, color[1] * 1.8, color[2] * 1.8, 0.9);
    this.spawn(0, x0, y0, z0, 0, 0, 0, 0.14, 1.6, 0.4, color[0] * 1.8, color[1] * 1.8, color[2] * 1.8, 0.8);
  }

  /** Orbital strike column. */
  beam(x: number, z: number, radius: number): void {
    const y = this.heightAt(x, z);
    this.beams.push({ x0: x, y0: y, z0: z, x1: x + 6, y1: y + 90, z1: z + 3, width: radius * 0.55, r: 2.4, g: 0.9, b: 0.35, life: 0.9, max: 0.9 });
    this.beams.push({ x0: x, y0: y, z0: z, x1: x + 6, y1: y + 90, z1: z + 3, width: radius * 0.22, r: 3, g: 2.6, b: 2.2, life: 0.75, max: 0.75 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.spawn(0, x + Math.cos(a) * r, y + 0.5, z + Math.sin(a) * r, Math.cos(a) * 6, 4 + Math.random() * 14, Math.sin(a) * 6, 0.6 + Math.random() * 0.8, 2.2, 0.4, 2.2, 1.1, 0.4, 0.9, -6, 1);
    }
  }

  ring(x: number, z: number, radius: number, color: Rgb, duration: number): void {
    this.rings.push({ x, z, y: this.heightAt(x, z) + 0.25, r0: radius * 0.15, r1: radius, r: color[0], g: color[1], b: color[2], life: duration, max: duration, zone: false });
  }

  zone(x: number, z: number, radius: number, color: Rgb, duration: number): void {
    this.rings.push({ x, z, y: this.heightAt(x, z) + 0.3, r0: radius, r1: radius, r: color[0], g: color[1], b: color[2], life: duration, max: duration, zone: true });
  }

  scorch(x: number, z: number, size: number): void {
    if (this.scorches.length >= 60) this.scorches.shift();
    this.scorches.push({ x, z, y: this.heightAt(x, z) + 0.08, size: size * 2.2, life: 45, rot: Math.random() * 6.28 });
  }

  /** Draw a glowing segment for this frame only. */
  segment(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, r: number, g: number, b: number, a: number): void {
    this.segs.push(x0, y0, z0, x1, y1, z1, w, r, g, b, a);
  }

  shake(amount: number): void {
    this.shakeAmount = Math.min(2.5, Math.max(this.shakeAmount, amount));
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, right: readonly [number, number, number], up: readonly [number, number, number], time: number): void {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 3.2);

    // particles
    const glow = this.glowBatch;
    const smoke = this.smokeBatch;
    glow.begin();
    smoke.begin();
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.count;
        if (i !== l) {
          this.kind[i] = this.kind[l];
          this.px[i] = this.px[l];
          this.py[i] = this.py[l];
          this.pz[i] = this.pz[l];
          this.vx[i] = this.vx[l];
          this.vy[i] = this.vy[l];
          this.vz[i] = this.vz[l];
          this.life[i] = this.life[l];
          this.maxLife[i] = this.maxLife[l];
          this.s0[i] = this.s0[l];
          this.s1[i] = this.s1[l];
          this.cr[i] = this.cr[l];
          this.cg[i] = this.cg[l];
          this.cb[i] = this.cb[l];
          this.ca[i] = this.ca[l];
          this.grav[i] = this.grav[l];
          this.drag[i] = this.drag[l];
        }
        continue;
      }
      const d = this.drag[i];
      if (d > 0) {
        const f = Math.max(0, 1 - d * dt);
        this.vx[i] *= f;
        this.vy[i] *= f;
        this.vz[i] *= f;
      }
      this.vy[i] += this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const additive = this.kind[i] === 0;
      const fade = additive ? (1 - t) * (1 - t) : t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      const a = this.ca[i] * fade;
      // additive particles cool from bright to deep orange as they age
      const cool = additive ? 1 - t * 0.55 : 1;
      (additive ? glow : smoke).pushBasis(
        this.px[i], this.py[i], this.pz[i],
        right[0] * size, right[1] * size, right[2] * size,
        up[0] * size, up[1] * size, up[2] * size,
        0, 0, 1,
        this.cr[i], this.cg[i] * cool, this.cb[i] * cool * cool, a,
      );
      i++;
    }
    glow.end();
    smoke.end();

    // beams, lightning and tracers
    const bb = this.beamBatch;
    bb.begin();
    for (let k = this.beams.length - 1; k >= 0; k--) {
      const b = this.beams[k];
      b.life -= dt;
      if (b.life <= 0) {
        this.beams[k] = this.beams[this.beams.length - 1];
        this.beams.pop();
        continue;
      }
      const f = b.life / b.max;
      this.pushSegment(bb, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, b.width * (0.4 + 0.6 * f), b.r, b.g, b.b, f);
    }
    for (let k = this.tracers.length - 1; k >= 0; k--) {
      const t = this.tracers[k];
      t.t += dt;
      if (t.t >= t.dur) {
        this.tracers[k] = this.tracers[this.tracers.length - 1];
        this.tracers.pop();
        continue;
      }
      const head = (t.t / t.dur) * t.len;
      const tail = Math.max(0, head - (t.heavy ? 9 : 4.5));
      const w = t.heavy ? 0.16 : 0.09;
      this.pushSegment(
        bb,
        t.x0 + t.dx * tail, t.y0 + t.dy * tail, t.z0 + t.dz * tail,
        t.x0 + t.dx * head, t.y0 + t.dy * head, t.z0 + t.dz * head,
        w, 2.4, t.heavy ? 2.2 : 1.7, t.heavy ? 1.6 : 0.6, 1,
      );
    }
    const sg = this.segs;
    for (let k = 0; k < sg.length; k += 11) {
      this.pushSegment(bb, sg[k], sg[k + 1], sg[k + 2], sg[k + 3], sg[k + 4], sg[k + 5], sg[k + 6], sg[k + 7], sg[k + 8], sg[k + 9], sg[k + 10]);
    }
    sg.length = 0;
    bb.end();

    // ground rings / zones
    const rb = this.ringBatch;
    const db = this.discBatch;
    rb.begin();
    db.begin();
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const r = this.rings[k];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(k, 1);
        continue;
      }
      const f = 1 - r.life / r.max;
      if (r.zone) {
        const fadeIn = Math.min(1, (r.max - r.life) * 4);
        const fadeOut = Math.min(1, r.life * 2.5);
        const pulse = 0.7 + Math.sin(time * 7) * 0.3;
        const a = fadeIn * fadeOut;
        const s = r.r0 * 2.17;
        rb.pushBasis(r.x, r.y, r.z, s, 0, 0, 0, 0, s, 0, 1, 0, r.r * 1.6, r.g * 1.6, r.b * 1.6, a * pulse);
        const ds = r.r0 * 2;
        db.pushBasis(r.x, r.y - 0.05, r.z, ds, 0, 0, 0, 0, ds, 0, 1, 0, r.r, r.g, r.b, a * 0.55);
      } else {
        const ease = 1 - (1 - f) * (1 - f);
        const s = (r.r0 + (r.r1 - r.r0) * ease) * 2.17;
        rb.pushBasis(r.x, r.y, r.z, s, 0, 0, 0, 0, s, 0, 1, 0, r.r * 1.8, r.g * 1.8, r.b * 1.8, (1 - f) * (1 - f));
      }
    }
    rb.end();
    db.end();

    const sb = this.scorchBatch;
    sb.begin();
    for (let k = this.scorches.length - 1; k >= 0; k--) {
      const s = this.scorches[k];
      s.life -= dt;
      if (s.life <= 0) {
        this.scorches.splice(k, 1);
        continue;
      }
      const c = Math.cos(s.rot) * s.size;
      const sn = Math.sin(s.rot) * s.size;
      sb.pushBasis(s.x, s.y, s.z, c, 0, sn, -sn, 0, c, 0, 1, 0, 1, 1, 1, Math.min(1, s.life / 10) * 0.85);
    }
    sb.end();
  }

  /** Stretch the unit box between two points. */
  private pushSegment(bb: Batch, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, r: number, g: number, b: number, a: number): void {
    const fx = x1 - x0;
    const fy = y1 - y0;
    const fz = z1 - z0;
    const len = Math.hypot(fx, fy, fz);
    if (len < 1e-4) return;
    // pick any perpendicular pair
    let ux = 0;
    let uy = 1;
    let uz = 0;
    if (Math.abs(fy) > len * 0.95) {
      ux = 1;
      uy = 0;
    }
    let rx = uy * fz - uz * fy;
    let ry = uz * fx - ux * fz;
    let rz = ux * fy - uy * fx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl;
    ry /= rl;
    rz /= rl;
    let vx = fy * rz - fz * ry;
    let vy = fz * rx - fx * rz;
    let vz = fx * ry - fy * rx;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl;
    vy /= vl;
    vz /= vl;
    bb.pushBasis((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, rx * w, ry * w, rz * w, vx * w, vy * w, vz * w, fx, fy, fz, r, g, b, a);
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose(false, true);
  }
}
