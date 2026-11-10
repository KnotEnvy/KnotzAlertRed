import { FreeCamera, Vector3 } from './babylon';
import type { Scene } from './babylon';
import { WORLD } from '../core/config';
import { clamp } from '../core/math';

export interface ScreenPoint {
  x: number;
  y: number;
  /** Depth in clip space; <= 0 means behind the camera. */
  w: number;
}

/**
 * Classic RTS camera: looks down at a focus point on the ground, pans with keys / screen
 * edges / minimap, zooms with the wheel and can be rotated with the middle mouse button.
 */
export class RtsCamera {
  readonly camera: FreeCamera;
  focusX = WORLD / 2;
  focusZ = WORLD / 2;
  private goalX = WORLD / 2;
  private goalZ = WORLD / 2;
  yaw = 0;
  pitch = 0.96;
  dist = 80;
  private goalDist = 80;
  readonly minDist = 30;
  readonly maxDist = 135;
  // cached basis (world space)
  px = 0;
  py = 0;
  pz = 0;
  right: [number, number, number] = [1, 0, 0];
  up: [number, number, number] = [0, 1, 0];
  fwd: [number, number, number] = [0, 0, 1];
  private width = 1;
  private height = 1;
  private m = new Float32Array(16);

  constructor(private scene: Scene) {
    this.camera = new FreeCamera('rts', new Vector3(0, 50, -50), scene);
    this.camera.fov = 0.62;
    this.camera.minZ = 1;
    this.camera.maxZ = 600;
    this.camera.inputs.clear();
    scene.activeCamera = this.camera;
  }

  jumpTo(x: number, z: number, instant = false): void {
    this.goalX = clamp(x, 0, WORLD);
    this.goalZ = clamp(z, 0, WORLD);
    if (instant) {
      this.focusX = this.goalX;
      this.focusZ = this.goalZ;
    }
  }

  /** Pan in screen-relative ground directions (right, forward) in world units. */
  pan(dRight: number, dForward: number): void {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    this.goalX = clamp(this.goalX + c * dRight + s * dForward, 0, WORLD);
    this.goalZ = clamp(this.goalZ - s * dRight + c * dForward, 0, WORLD);
  }

  zoom(delta: number): void {
    this.goalDist = clamp(this.goalDist * (1 + delta), this.minDist, this.maxDist);
  }

  rotate(dYaw: number): void {
    this.yaw += dYaw;
  }

  resetRotation(): void {
    this.yaw = 0;
  }

  get zoomFactor(): number {
    return this.dist / 80;
  }

  update(dt: number, shake: number, width: number, height: number): void {
    const k = 1 - Math.exp(-dt * 14);
    this.focusX += (this.goalX - this.focusX) * k;
    this.focusZ += (this.goalZ - this.focusZ) * k;
    this.dist += (this.goalDist - this.dist) * (1 - Math.exp(-dt * 10));
    this.width = width;
    this.height = height;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    let fx = this.focusX;
    let fz = this.focusZ;
    if (shake > 0.01) {
      fx += (Math.random() - 0.5) * shake * 1.2;
      fz += (Math.random() - 0.5) * shake * 1.2;
    }
    this.px = fx - sy * cp * this.dist;
    this.py = sp * this.dist;
    this.pz = fz - cy * cp * this.dist;
    this.camera.position.set(this.px, this.py, this.pz);
    this.camera.setTarget(new Vector3(fx, 0, fz));

    // basis vectors
    const f: [number, number, number] = [sy * cp, -sp, cy * cp];
    const r: [number, number, number] = [cy, 0, -sy];
    const u: [number, number, number] = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    this.fwd = f;
    this.right = r;
    this.up = u;
  }

  /** Cache the view-projection matrix. Call after the scene has updated its matrices. */
  syncMatrix(): void {
    this.camera.getViewMatrix(true);
    const m = this.scene.getTransformMatrix().m;
    for (let i = 0; i < 16; i++) this.m[i] = m[i];
  }

  /** World point to CSS-pixel screen coordinates. */
  project(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
    const m = this.m;
    const cx = x * m[0] + y * m[4] + z * m[8] + m[12];
    const cy = x * m[1] + y * m[5] + z * m[9] + m[13];
    const cw = x * m[3] + y * m[7] + z * m[11] + m[15];
    out.w = cw;
    if (cw <= 0.0001) {
      out.x = -9999;
      out.y = -9999;
      return out;
    }
    out.x = (cx / cw * 0.5 + 0.5) * this.width;
    out.y = (1 - (cy / cw * 0.5 + 0.5)) * this.height;
    return out;
  }

  /** Intersect the pick ray through a screen pixel with the ground plane. */
  screenToGround(sx: number, sy: number, planeY = 0): { x: number; z: number } | null {
    const ndcX = (sx / this.width) * 2 - 1;
    const ndcY = 1 - (sy / this.height) * 2;
    const tanV = Math.tan(this.camera.fov / 2);
    const aspect = this.width / this.height;
    const dx = this.fwd[0] + this.right[0] * ndcX * tanV * aspect + this.up[0] * ndcY * tanV;
    const dy = this.fwd[1] + this.right[1] * ndcX * tanV * aspect + this.up[1] * ndcY * tanV;
    const dz = this.fwd[2] + this.right[2] * ndcX * tanV * aspect + this.up[2] * ndcY * tanV;
    if (dy >= -1e-4) return null;
    const t = (planeY - this.py) / dy;
    return { x: this.px + dx * t, z: this.pz + dz * t };
  }
}
