import { CELL, GRID } from '../core/config';
import { clamp } from '../core/math';

/** Fog of war for the human player: per-cell "visible now" and "explored" flags. */
export class FogGrid {
  readonly visible = new Uint8Array(GRID * GRID);
  readonly explored = new Uint8Array(GRID * GRID);
  revealAll = false;
  /** Bumped every time visibility is recomputed so views know when to refresh. */
  version = 0;

  begin(): void {
    this.visible.fill(this.revealAll ? 1 : 0);
    if (this.revealAll) this.explored.fill(1);
  }

  stamp(x: number, z: number, radius: number): void {
    const cx = x / CELL;
    const cz = z / CELL;
    const r = radius / CELL;
    const r2 = r * r;
    const x0 = clamp(Math.floor(cx - r), 0, GRID - 1);
    const x1 = clamp(Math.ceil(cx + r), 0, GRID - 1);
    const z0 = clamp(Math.floor(cz - r), 0, GRID - 1);
    const z1 = clamp(Math.ceil(cz + r), 0, GRID - 1);
    for (let iz = z0; iz <= z1; iz++) {
      const dz = iz + 0.5 - cz;
      for (let ix = x0; ix <= x1; ix++) {
        const dx = ix + 0.5 - cx;
        if (dx * dx + dz * dz <= r2) {
          const i = iz * GRID + ix;
          this.visible[i] = 1;
          this.explored[i] = 1;
        }
      }
    }
  }

  end(): void {
    this.version++;
  }

  isVisible(x: number, z: number): boolean {
    const cx = clamp(Math.floor(x / CELL), 0, GRID - 1);
    const cz = clamp(Math.floor(z / CELL), 0, GRID - 1);
    return this.visible[cz * GRID + cx] === 1;
  }
  isExplored(x: number, z: number): boolean {
    const cx = clamp(Math.floor(x / CELL), 0, GRID - 1);
    const cz = clamp(Math.floor(z / CELL), 0, GRID - 1);
    return this.explored[cz * GRID + cx] === 1;
  }
}
