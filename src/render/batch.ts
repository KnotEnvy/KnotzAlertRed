import { BoundingInfo, Vector3 } from './babylon';
import type { Mesh } from './babylon';
import { WORLD } from '../core/config';

/**
 * A dynamic thin-instance batch: every frame the view rebuilds the matrix (and colour)
 * buffers from simulation state, so thousands of objects cost one draw call per mesh
 * and there is no per-entity scene-graph bookkeeping.
 */
export class Batch {
  matrices: Float32Array;
  colors: Float32Array;
  count = 0;
  private cap: number;

  constructor(
    readonly mesh: Mesh,
    cap = 32,
  ) {
    this.cap = cap;
    this.matrices = new Float32Array(cap * 16);
    this.colors = new Float32Array(cap * 4);
    mesh.doNotSyncBoundingInfo = true;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isPickable = false;
    this.bind();
    mesh.setBoundingInfo(new BoundingInfo(new Vector3(-20, -10, -20), new Vector3(WORLD + 20, 60, WORLD + 20)));
    mesh.thinInstanceCount = 0;
    mesh.setEnabled(false);
  }

  private bind(): void {
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.mesh.thinInstanceSetBuffer('color', this.colors, 4, false);
  }

  private grow(): void {
    this.cap *= 2;
    const m = new Float32Array(this.cap * 16);
    m.set(this.matrices);
    this.matrices = m;
    const c = new Float32Array(this.cap * 4);
    c.set(this.colors);
    this.colors = c;
    this.bind();
  }

  begin(): void {
    this.count = 0;
  }

  /** Yaw-only transform with per-axis scale. */
  push(x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1, r = 1, g = 1, b = 1, a = 1): void {
    if (this.count >= this.cap) this.grow();
    const m = this.matrices;
    const o = this.count * 16;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    m[o] = c * sx;
    m[o + 1] = 0;
    m[o + 2] = -s * sx;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = sy;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = s * sz;
    m[o + 9] = 0;
    m[o + 10] = c * sz;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    const k = this.count * 4;
    const col = this.colors;
    col[k] = r;
    col[k + 1] = g;
    col[k + 2] = b;
    col[k + 3] = a;
    this.count++;
  }

  /** Arbitrary basis: rows are the (already scaled) local X, Y and Z axes. */
  pushBasis(
    x: number, y: number, z: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    r = 1, g = 1, b = 1, a = 1,
  ): void {
    if (this.count >= this.cap) this.grow();
    const m = this.matrices;
    const o = this.count * 16;
    m[o] = ax;
    m[o + 1] = ay;
    m[o + 2] = az;
    m[o + 3] = 0;
    m[o + 4] = bx;
    m[o + 5] = by;
    m[o + 6] = bz;
    m[o + 7] = 0;
    m[o + 8] = cx;
    m[o + 9] = cy;
    m[o + 10] = cz;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    const k = this.count * 4;
    const col = this.colors;
    col[k] = r;
    col[k + 1] = g;
    col[k + 2] = b;
    col[k + 3] = a;
    this.count++;
  }

  end(): void {
    const mesh = this.mesh;
    mesh.thinInstanceCount = this.count;
    mesh.setEnabled(this.count > 0);
    if (this.count > 0) {
      mesh.thinInstanceBufferUpdated('matrix');
      mesh.thinInstanceBufferUpdated('color');
    }
  }

  dispose(): void {
    this.mesh.dispose();
  }
}
