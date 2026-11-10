import { CELL, GRID, WORLD } from '../core/config';
import { clamp } from '../core/math';

// Local copies: imported bindings resolve through getters under Vite SSR (headless tests),
// which is measurably slow inside the pathfinding loops.
const G = GRID;
const W = WORLD;
const C = CELL;
const N = G * G;
export const UNREACHABLE = 0xffff;

/** Integration field: walking "downhill" along `dist` leads to the goal. */
export interface FlowField {
  dist: Uint16Array;
  version: number;
  lastUsed: number;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [10, 10, 10, 10, 14, 14, 14, 14];
const BUCKETS = 15;
const BUCKET_CAP = N * 2;

/**
 * Walkability grid plus cached flow fields. A move order for a whole group shares one
 * field, so path cost does not scale with army size.
 */
export class NavGrid {
  readonly blocked = new Uint8Array(N); // 1 = terrain, 2 = structure
  version = 1;
  private fields = new Map<number, FlowField>();
  private clock = 0;
  private bucketNodes = new Int32Array(BUCKETS * BUCKET_CAP);
  private bucketCount = new Int32Array(BUCKETS);

  static cellOf(v: number): number {
    return clamp(Math.floor(v / C), 0, G - 1);
  }
  static center(c: number): number {
    return (c + 0.5) * C;
  }

  isBlocked(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= G || cz >= G) return true;
    return this.blocked[cz * G + cx] !== 0;
  }
  blockedAt(x: number, z: number): boolean {
    if (x < 0 || z < 0 || x >= W || z >= W) return true;
    return this.blocked[Math.floor(z / C) * G + Math.floor(x / C)] !== 0;
  }

  setRect(cx: number, cz: number, w: number, h: number, value: number): void {
    for (let z = cz; z < cz + h; z++) {
      for (let x = cx; x < cx + w; x++) {
        if (x < 0 || z < 0 || x >= G || z >= G) continue;
        this.blocked[z * G + x] = value;
      }
    }
    this.version++;
  }

  rectFree(cx: number, cz: number, w: number, h: number): boolean {
    for (let z = cz; z < cz + h; z++) {
      for (let x = cx; x < cx + w; x++) {
        if (this.isBlocked(x, z)) return false;
      }
    }
    return true;
  }

  /** Spiral search for the closest walkable cell. Returns a cell index or -1. */
  nearestFree(cx: number, cz: number, maxR = 14): number {
    cx = clamp(cx, 0, G - 1);
    cz = clamp(cz, 0, G - 1);
    if (!this.isBlocked(cx, cz)) return cz * G + cx;
    for (let r = 1; r <= maxR; r++) {
      let best = -1;
      let bestD = 1e9;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (this.isBlocked(x, z)) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = z * G + x;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Straight-line walkability test with a little lateral clearance. */
  lineClear(x0: number, z0: number, x1: number, z1: number, radius = 0): boolean {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return !this.blockedAt(x0, z0);
    const steps = Math.ceil(d / 0.9);
    const sx = dx / steps;
    const sz = dz / steps;
    const px = (-dz / d) * radius;
    const pz = (dx / d) * radius;
    for (let i = 0; i <= steps; i++) {
      const x = x0 + sx * i;
      const z = z0 + sz * i;
      if (this.blockedAt(x, z)) return false;
      if (radius > 0 && (this.blockedAt(x + px, z + pz) || this.blockedAt(x - px, z - pz))) return false;
    }
    return true;
  }

  /** Field toward a single cell (snapped to the nearest walkable cell). */
  fieldToCell(cx: number, cz: number): FlowField | null {
    const idx = this.nearestFree(cx, cz, 20);
    if (idx < 0) return null;
    return this.getField(idx, [idx]);
  }

  /** Field toward the perimeter of a rectangular footprint (for attacking / docking). */
  fieldToRect(key: number, cx: number, cz: number, w: number, h: number): FlowField {
    const cached = this.fields.get(1_000_000 + key);
    if (cached && cached.version === this.version) {
      cached.lastUsed = ++this.clock;
      return cached;
    }
    const seeds: number[] = [];
    for (let z = cz; z < cz + h; z++) {
      for (let x = cx; x < cx + w; x++) {
        if (x >= 0 && z >= 0 && x < G && z < G) seeds.push(z * G + x);
      }
    }
    return this.getField(1_000_000 + key, seeds);
  }

  private getField(key: number, seeds: number[]): FlowField {
    let f = this.fields.get(key);
    if (f && f.version === this.version) {
      f.lastUsed = ++this.clock;
      return f;
    }
    if (!f) {
      if (this.fields.size >= 72) this.evict();
      f = { dist: new Uint16Array(N), version: 0, lastUsed: 0 };
      this.fields.set(key, f);
    }
    this.compute(f.dist, seeds);
    f.version = this.version;
    f.lastUsed = ++this.clock;
    return f;
  }

  private evict(): void {
    let oldestKey = -1;
    let oldest = Infinity;
    for (const [k, f] of this.fields) {
      if (f.lastUsed < oldest) {
        oldest = f.lastUsed;
        oldestKey = k;
      }
    }
    if (oldestKey >= 0) this.fields.delete(oldestKey);
  }

  /**
   * Multi-source Dijkstra (8-connected, no corner cutting). Edge costs are only 10 or 14,
   * so a 15-slot circular bucket queue (Dial's algorithm) replaces a heap: O(cells), ~10x faster.
   */
  private compute(dist: Uint16Array, seeds: number[]): void {
    dist.fill(UNREACHABLE);
    const bn = this.bucketNodes;
    const bc = this.bucketCount;
    bc.fill(0);
    let pending = 0;
    for (const s of seeds) {
      dist[s] = 0;
      bn[bc[0]++] = s;
      pending++;
    }
    const blocked = this.blocked;
    let c = 0;
    while (pending > 0) {
      const b = c % BUCKETS;
      const base = b * BUCKET_CAP;
      // nothing can be pushed into the bucket being drained (all edge costs are 1..14 mod 15)
      let n = bc[b];
      while (n > 0) {
        const cur = bn[base + --n];
        pending--;
        if (dist[cur] !== c) continue;
        const x = cur % G;
        const z = (cur / G) | 0;
        const curBlocked = blocked[cur] !== 0;
        for (let d = 0; d < 8; d++) {
          const nx = x + DX[d];
          const nz = z + DZ[d];
          if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
          const ni = nz * G + nx;
          if (blocked[ni]) continue;
          // forbid corner cutting, except when stepping out of a seeded (blocked) footprint
          if (d >= 4 && !curBlocked && (blocked[z * G + nx] || blocked[nz * G + x])) continue;
          const nd = c + COST[d];
          if (nd < dist[ni] && nd < UNREACHABLE) {
            const nb = nd % BUCKETS;
            if (bc[nb] >= BUCKET_CAP) continue;
            dist[ni] = nd;
            bn[nb * BUCKET_CAP + bc[nb]++] = ni;
            pending++;
          }
        }
      }
      bc[b] = 0;
      c++;
    }
  }

  /** Next cell when descending a field from `idx`, or -1 if already at a minimum. */
  descend(f: FlowField, idx: number): number {
    const x = idx % G;
    const z = (idx / G) | 0;
    const blocked = this.blocked;
    let best = -1;
    let bestD = f.dist[idx];
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
      const ni = nz * G + nx;
      const nd = f.dist[ni];
      if (nd >= bestD) continue;
      if (d >= 4 && (blocked[z * G + nx] || blocked[nz * G + x])) continue;
      bestD = nd;
      best = ni;
    }
    return best;
  }
}
