import { CELL, GRID, WORLD } from '../core/config';
import { Rng, fbm } from '../core/rng';
import { clamp } from '../core/math';

export const T_GRASS = 0;
export const T_DIRT = 1;
export const T_ROCK = 2;
export const T_WATER = 3;
export const T_FOREST = 4;

export interface NodeSpawn {
  x: number;
  z: number;
  amount: number;
}
export interface OutpostSpawn {
  defId: string;
  cx: number;
  cz: number;
}
export interface PropSpawn {
  type: 'tree' | 'rock' | 'bush';
  x: number;
  z: number;
  scale: number;
  rot: number;
  variant: number;
}

function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Procedurally generated, point-symmetric skirmish map: rock ridges, lakes and forests form
 * chokepoints between two bases, with Aurium fields and capturable outposts in between.
 */
export class GameMap {
  readonly terrain = new Uint8Array(GRID * GRID);
  readonly starts: { cx: number; cz: number }[] = [
    { cx: 20, cz: 20 },
    { cx: GRID - 21, cz: GRID - 21 },
  ];
  readonly nodes: NodeSpawn[] = [];
  readonly outposts: OutpostSpawn[] = [];
  readonly props: PropSpawn[] = [];
  private rockF = new Float32Array(GRID * GRID);
  private waterF = new Float32Array(GRID * GRID);
  private protectedMask = new Uint8Array(GRID * GRID);
  seed: number;

  constructor(seed: number) {
    this.seed = seed;
    for (let attempt = 0; attempt < 12; attempt++) {
      this.generate(seed + attempt * 7919);
      if (this.connected()) break;
      if (attempt === 11) this.carveCorridor();
    }
    this.finish();
  }

  isBlockedTerrain(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) return true;
    const t = this.terrain[cz * GRID + cx];
    return t === T_ROCK || t === T_WATER || t === T_FOREST;
  }

  private protect(cx: number, cz: number, r: number): void {
    for (let z = Math.floor(cz - r); z <= cz + r; z++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || z < 0 || x >= GRID || z >= GRID) continue;
        if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) this.protectedMask[z * GRID + x] = 1;
      }
    }
  }

  private protectBoth(cx: number, cz: number, r: number): void {
    this.protect(cx, cz, r);
    this.protect(GRID - 1 - cx, GRID - 1 - cz, r);
  }

  private blob(cx: number, cz: number, r: number, type: number, seed: number): void {
    for (let z = Math.floor(cz - r - 2); z <= cz + r + 2; z++) {
      for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        if (x < 1 || z < 1 || x >= GRID - 1 || z >= GRID - 1) continue;
        const d = Math.hypot(x - cx, z - cz) + (fbm(x * 0.35, z * 0.35, seed, 2) - 0.5) * 3;
        if (d > r) continue;
        const i = z * GRID + x;
        const j = (GRID - 1 - z) * GRID + (GRID - 1 - x);
        if (this.protectedMask[i] || this.protectedMask[j]) continue;
        this.terrain[i] = type;
        this.terrain[j] = type;
      }
    }
  }

  private generate(seed: number): void {
    const rng = new Rng(seed);
    this.terrain.fill(T_GRASS);
    this.protectedMask.fill(0);
    this.nodes.length = 0;
    this.outposts.length = 0;
    const s = this.starts[0];

    // --- Reserved areas: bases, ore fields, outposts -------------------------------
    this.protectBoth(s.cx, s.cz, 17);
    const fields: { cx: number; cz: number; n: number; rich: number }[] = [];
    const a1 = rng.range(0.15, 0.55);
    fields.push({ cx: s.cx + Math.cos(a1) * 15, cz: s.cz + Math.sin(a1) * 15, n: 14, rich: 1 });
    const a2 = a1 + rng.range(0.75, 1.0);
    fields.push({ cx: s.cx + Math.cos(a2) * 27, cz: s.cz + Math.sin(a2) * 27, n: 11, rich: 1.1 });
    const a3 = a1 - rng.range(0.35, 0.5);
    fields.push({ cx: clamp(s.cx + Math.cos(a3) * 34, 8, GRID - 9), cz: clamp(s.cz + Math.sin(a3) * 34, 8, GRID - 9), n: 10, rich: 1.1 });
    // contested centre fields
    const ca = rng.range(0, Math.PI);
    fields.push({ cx: GRID / 2 + Math.cos(ca + 2.4) * 13, cz: GRID / 2 + Math.sin(ca + 2.4) * 13, n: 12, rich: 1.5 });
    for (const f of fields) this.protectBoth(f.cx, f.cz, 6.5);

    const ex = { cx: Math.round(GRID * 0.24 + rng.range(-3, 3)), cz: Math.round(GRID * 0.74 + rng.range(-3, 3)) };
    this.protectBoth(ex.cx + 1, ex.cz + 1, 6);
    this.protect(GRID / 2, GRID / 2, 7);
    this.outposts.push({ defId: 'extractor', cx: ex.cx, cz: ex.cz });
    this.outposts.push({ defId: 'extractor', cx: GRID - 1 - ex.cx - 2, cz: GRID - 1 - ex.cz - 2 });
    this.outposts.push({ defId: 'obelisk', cx: GRID / 2 - 1, cz: GRID / 2 - 1 });

    // --- Obstacles (mirrored through the map centre) -------------------------------
    const ridges = rng.int(7, 9);
    for (let i = 0; i < ridges; i++) {
      let x = rng.range(6, GRID - 6);
      let z = rng.range(6, GRID - 6);
      const ang = rng.range(0, Math.PI * 2);
      const len = rng.int(3, 6);
      for (let k = 0; k < len; k++) {
        this.blob(x, z, rng.range(2.2, 3.8), T_ROCK, seed + i * 31 + k);
        x += Math.cos(ang + rng.range(-0.5, 0.5)) * 3.6;
        z += Math.sin(ang + rng.range(-0.5, 0.5)) * 3.6;
      }
    }
    for (let i = 0; i < 2; i++) {
      this.blob(rng.range(10, GRID - 10), rng.range(10, GRID - 10), rng.range(4.5, 7), T_WATER, seed + 500 + i);
    }
    for (let i = 0; i < 9; i++) {
      this.blob(rng.range(5, GRID - 5), rng.range(5, GRID - 5), rng.range(2.5, 4.6), T_FOREST, seed + 900 + i);
    }

    // --- Ore nodes ---------------------------------------------------------------
    for (const f of fields) {
      const placed: { x: number; z: number }[] = [];
      let guard = 0;
      while (placed.length < f.n && guard++ < 400) {
        const r = Math.sqrt(rng.next()) * 9.5;
        const a = rng.range(0, Math.PI * 2);
        const x = (f.cx + 0.5) * CELL + Math.cos(a) * r;
        const z = (f.cz + 0.5) * CELL + Math.sin(a) * r;
        if (x < 6 || z < 6 || x > WORLD - 6 || z > WORLD - 6) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 3.4)) continue;
        placed.push({ x, z });
        const amount = Math.round(rng.range(1700, 2600) * f.rich);
        this.nodes.push({ x, z, amount });
        this.nodes.push({ x: WORLD - x, z: WORLD - z, amount });
      }
    }
  }

  /** Flood fill between the two start positions over walkable terrain. */
  private connected(): boolean {
    const seen = new Uint8Array(GRID * GRID);
    const q: number[] = [this.starts[0].cz * GRID + this.starts[0].cx];
    seen[q[0]] = 1;
    const goal = this.starts[1].cz * GRID + this.starts[1].cx;
    let count = 0;
    while (q.length) {
      const i = q.pop()!;
      count++;
      const x = i % GRID;
      const z = (i / GRID) | 0;
      const nb = [
        [x + 1, z],
        [x - 1, z],
        [x, z + 1],
        [x, z - 1],
      ];
      for (const [nx, nz] of nb) {
        if (this.isBlockedTerrain(nx, nz)) continue;
        const j = nz * GRID + nx;
        if (seen[j]) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    if (!seen[goal]) return false;
    // every ore node and outpost must be reachable too
    for (const n of this.nodes) {
      if (!seen[Math.floor(n.z / CELL) * GRID + Math.floor(n.x / CELL)]) return false;
    }
    return count > GRID * GRID * 0.55;
  }

  private carveCorridor(): void {
    for (let i = 0; i < GRID; i++) {
      for (let w = -3; w <= 3; w++) {
        const x = clamp(i + w, 0, GRID - 1);
        this.terrain[i * GRID + x] = T_GRASS;
      }
    }
  }

  private finish(): void {
    const rng = new Rng(this.seed ^ 0x5bd1e995);
    // Blurred obstacle masks drive terrain height (cliffs up, lake beds down).
    const blur = (type: number, out: Float32Array) => {
      for (let z = 0; z < GRID; z++) {
        for (let x = 0; x < GRID; x++) {
          let sum = 0;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = clamp(x + dx, 0, GRID - 1);
              const nz = clamp(z + dz, 0, GRID - 1);
              if (this.terrain[nz * GRID + nx] === type) sum++;
            }
          }
          out[z * GRID + x] = sum / 9;
        }
      }
    };
    blur(T_ROCK, this.rockF);
    blur(T_WATER, this.waterF);

    // Dirt patches: purely cosmetic, around bases and along noise bands.
    for (let z = 0; z < GRID; z++) {
      for (let x = 0; x < GRID; x++) {
        const i = z * GRID + x;
        if (this.terrain[i] !== T_GRASS) continue;
        const n = fbm(x * 0.09, z * 0.09, this.seed + 77, 3);
        const nearBase = this.starts.some((s) => Math.hypot(s.cx - x, s.cz - z) < 6 + n * 6);
        if (nearBase || n > 0.62) this.terrain[i] = T_DIRT;
      }
    }

    // Props.
    this.props.length = 0;
    for (let z = 0; z < GRID; z++) {
      for (let x = 0; x < GRID; x++) {
        const t = this.terrain[z * GRID + x];
        const wx = (x + 0.5) * CELL;
        const wz = (z + 0.5) * CELL;
        if (t === T_ROCK) {
          if (rng.chance(0.42)) {
            this.props.push({
              type: 'rock', x: wx + rng.range(-0.7, 0.7), z: wz + rng.range(-0.7, 0.7),
              scale: rng.range(0.9, 2.1), rot: rng.range(0, 6.28), variant: rng.int(0, 2),
            });
          }
        } else if (t === T_FOREST) {
          const n = rng.chance(0.55) ? 2 : 1;
          for (let k = 0; k < n; k++) {
            this.props.push({
              type: 'tree', x: wx + rng.range(-0.8, 0.8), z: wz + rng.range(-0.8, 0.8),
              scale: rng.range(0.8, 1.5), rot: rng.range(0, 6.28), variant: rng.int(0, 1),
            });
          }
        } else if (t === T_GRASS && rng.chance(0.035)) {
          this.props.push({
            type: 'bush', x: wx + rng.range(-0.8, 0.8), z: wz + rng.range(-0.8, 0.8),
            scale: rng.range(0.5, 1.0), rot: rng.range(0, 6.28), variant: rng.int(0, 1),
          });
        }
      }
    }
  }

  private sample(field: Float32Array, x: number, z: number): number {
    const fx = clamp(x / CELL - 0.5, 0, GRID - 1.001);
    const fz = clamp(z / CELL - 0.5, 0, GRID - 1.001);
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const a = field[z0 * GRID + x0];
    const b = field[z0 * GRID + x0 + 1];
    const c = field[(z0 + 1) * GRID + x0];
    const d = field[(z0 + 1) * GRID + x0 + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  /** Terrain height at a world position. Walkable ground stays within roughly ±0.5. */
  height(x: number, z: number): number {
    const base = (fbm(x * 0.03, z * 0.03, this.seed + 3, 3) - 0.5) * 1.0;
    const rock = smoothstep(0.3, 0.85, this.sample(this.rockF, x, z));
    const water = smoothstep(0.3, 0.8, this.sample(this.waterF, x, z));
    const crag = rock > 0 ? fbm(x * 0.22, z * 0.22, this.seed + 9, 2) * 1.6 : 0;
    return base + rock * (2.6 + crag) - water * 2.0;
  }

  rockiness(x: number, z: number): number {
    return this.sample(this.rockF, x, z);
  }
  wetness(x: number, z: number): number {
    return this.sample(this.waterF, x, z);
  }
  terrainAt(x: number, z: number): number {
    const cx = clamp(Math.floor(x / CELL), 0, GRID - 1);
    const cz = clamp(Math.floor(z / CELL), 0, GRID - 1);
    return this.terrain[cz * GRID + cx];
  }
}
