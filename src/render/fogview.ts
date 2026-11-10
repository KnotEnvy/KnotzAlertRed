import { Color3, Constants, Material, Mesh, RawTexture, StandardMaterial, Texture, VertexData } from './babylon';
import type { Scene } from './babylon';
import { CELL, GRID, WORLD } from '../core/config';
import type { FogGrid } from '../sim/fog';

const SIZE = GRID + 2; // one-cell border of solid fog so the map edge fades to black
const UNEXPLORED = 0.74; // terrain stays faintly readable, like a satellite map
const EXPLORED = 0.46;

/**
 * Fog of war drawn as a single screen-projected ground sheet: a low-res alpha texture
 * (one texel per nav cell, bilinear filtered and temporally smoothed) darkens everything
 * the player cannot currently see and blacks out what was never explored.
 */
export class FogView {
  private mesh: Mesh;
  private tex: RawTexture;
  private data = new Uint8Array(SIZE * SIZE * 4);
  private current = new Float32Array(SIZE * SIZE).fill(0.82);
  private target = new Float32Array(SIZE * SIZE).fill(0.82);
  private raw = new Float32Array(SIZE * SIZE).fill(0.82);
  private tmp = new Float32Array(SIZE * SIZE).fill(0.82);
  private lastVersion = -1;
  private uploadT = 0;

  constructor(scene: Scene) {
    for (let i = 0; i < SIZE * SIZE; i++) {
      this.data[i * 4] = 3;
      this.data[i * 4 + 1] = 5;
      this.data[i * 4 + 2] = 9;
      this.data[i * 4 + 3] = 255;
    }
    this.tex = RawTexture.CreateRGBATexture(this.data, SIZE, SIZE, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
    this.tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.tex.hasAlpha = true;

    // Oversized quad; UVs run past [0,1] so the clamped border texel fills the outside.
    const M = 400;
    const lo = -CELL - M;
    const hi = WORLD + CELL + M;
    const span = WORLD + CELL * 2;
    const u0 = -M / span;
    const u1 = 1 + M / span;
    const vd = new VertexData();
    vd.positions = [lo, 0.05, lo, hi, 0.05, lo, hi, 0.05, hi, lo, 0.05, hi];
    vd.uvs = [u0, u0, u1, u0, u1, u1, u0, u1];
    vd.indices = [0, 1, 2, 0, 2, 3];
    vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    this.mesh = new Mesh('fog', scene);
    vd.applyToMesh(this.mesh);

    const mat = new StandardMaterial('fogMat', scene);
    mat.diffuseTexture = this.tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.depthFunction = Constants.ALWAYS;
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    this.mesh.material = mat;
    this.mesh.renderingGroupId = 1;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  update(fog: FogGrid, dt: number): void {
    if (fog.version !== this.lastVersion) {
      this.lastVersion = fog.version;
      const raw = this.raw;
      for (let z = 0; z < GRID; z++) {
        for (let x = 0; x < GRID; x++) {
          const i = z * GRID + x;
          raw[(z + 1) * SIZE + x + 1] = fog.visible[i] ? 0 : fog.explored[i] ? EXPLORED : UNEXPLORED;
        }
      }
      // two box-blur passes soften the cell grid into smooth sight circles
      this.blur(raw, this.tmp);
      this.blur(this.tmp, this.target);
    }
    this.uploadT -= dt;
    if (this.uploadT > 0) return;
    const step = 0.05;
    this.uploadT = step;
    const k = Math.min(1, step * 7);
    const cur = this.current;
    const tgt = this.target;
    const data = this.data;
    let changed = false;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const d = tgt[i] - cur[i];
      if (d === 0) continue;
      cur[i] = Math.abs(d) < 0.01 ? tgt[i] : cur[i] + d * k;
      data[i * 4 + 3] = (cur[i] * 255) | 0;
      changed = true;
    }
    if (changed) this.tex.update(data);
  }

  private blur(src: Float32Array, dst: Float32Array): void {
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const i = z * SIZE + x;
        if (x === 0 || z === 0 || x === SIZE - 1 || z === SIZE - 1) {
          dst[i] = 0.82;
          continue;
        }
        dst[i] =
          (src[i - SIZE - 1] + src[i - SIZE] + src[i - SIZE + 1] + src[i - 1] + src[i] * 2 + src[i + 1] + src[i + SIZE - 1] + src[i + SIZE] + src[i + SIZE + 1]) / 10;
      }
    }
  }

  dispose(): void {
    this.mesh.dispose(false, true);
  }
}
