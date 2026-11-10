import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, VertexData } from './babylon';
import type { Scene } from './babylon';
import { CELL, GRID, WORLD } from '../core/config';
import type { ThemeId } from '../core/config';
import { fbm } from '../core/rng';
import { T_DIRT, T_FOREST, T_ROCK, T_WATER } from '../sim/map';
import type { GameMap } from '../sim/map';
import { Batch } from './batch';
import { buildBushModel, buildRockModel, buildTreeModel } from './models';
import type { Col } from './modelkit';

export interface Theme {
  name: string;
  grass: Col;
  grass2: Col;
  dirt: Col;
  rock: Col;
  forest: Col;
  shore: Col;
  water: Col;
  leaf: Col;
  leaf2: Col;
  trunk: Col;
  snow: boolean;
  sun: Col;
  sky: Col;
  ground: Col;
  clear: Col;
}

export const THEMES: Record<ThemeId, Theme> = {
  verdant: {
    name: 'Verdant Basin',
    grass: [0.34, 0.5, 0.19], grass2: [0.45, 0.57, 0.23], dirt: [0.55, 0.44, 0.29], rock: [0.5, 0.48, 0.46],
    forest: [0.17, 0.3, 0.13], shore: [0.6, 0.55, 0.4], water: [0.1, 0.36, 0.5],
    leaf: [0.13, 0.36, 0.15], leaf2: [0.22, 0.42, 0.13], trunk: [0.3, 0.2, 0.13], snow: false,
    sun: [1.0, 0.95, 0.84], sky: [0.62, 0.74, 0.95], ground: [0.32, 0.3, 0.26], clear: [0.02, 0.03, 0.05],
  },
  scorched: {
    name: 'Scorched Dunes',
    grass: [0.7, 0.54, 0.33], grass2: [0.78, 0.62, 0.38], dirt: [0.56, 0.39, 0.25], rock: [0.5, 0.33, 0.25],
    forest: [0.5, 0.42, 0.24], shore: [0.62, 0.52, 0.34], water: [0.08, 0.4, 0.42],
    leaf: [0.34, 0.42, 0.16], leaf2: [0.46, 0.44, 0.18], trunk: [0.36, 0.25, 0.15], snow: false,
    sun: [1.0, 0.86, 0.66], sky: [0.9, 0.78, 0.66], ground: [0.42, 0.3, 0.22], clear: [0.05, 0.03, 0.02],
  },
  frost: {
    name: 'Frostline',
    grass: [0.62, 0.67, 0.75], grass2: [0.52, 0.59, 0.7], dirt: [0.4, 0.42, 0.47], rock: [0.34, 0.38, 0.47],
    forest: [0.46, 0.55, 0.6], shore: [0.56, 0.66, 0.76], water: [0.14, 0.36, 0.58],
    leaf: [0.13, 0.32, 0.28], leaf2: [0.2, 0.36, 0.34], trunk: [0.26, 0.2, 0.17], snow: true,
    sun: [0.9, 0.95, 1.0], sky: [0.7, 0.8, 1.0], ground: [0.36, 0.4, 0.48], clear: [0.02, 0.03, 0.06],
  },
};

/** Static world geometry: height-mapped ground, water sheet and instanced props. */
export class TerrainView {
  readonly ground: Mesh;
  readonly water: Mesh;
  readonly propBatches: Batch[] = [];
  /** Pre-rendered top-down image of the terrain for the minimap. */
  readonly minimapImage: HTMLCanvasElement;

  constructor(scene: Scene, map: GameMap, theme: Theme, objectMaterial: StandardMaterial) {
    const n = GRID * 2; // quads per side (1 world unit each)
    const verts = n + 1;
    const positions = new Float32Array(verts * verts * 3);
    const colors = new Float32Array(verts * verts * 4);
    const uvs = new Float32Array(verts * verts * 2);
    const indices = new Uint32Array(n * n * 6);

    const typeColor = (t: number): Col => {
      if (t === T_DIRT) return theme.dirt;
      if (t === T_ROCK) return theme.rock;
      if (t === T_WATER) return theme.shore;
      if (t === T_FOREST) return theme.forest;
      return theme.grass;
    };
    const colorAt = (x: number, z: number): [number, number, number] => {
      // blend the four surrounding cells for soft biome borders
      const fx = x / CELL - 0.5;
      const fz = z / CELL - 0.5;
      const x0 = Math.floor(fx);
      const z0 = Math.floor(fz);
      const tx = fx - x0;
      const tz = fz - z0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dz = 0; dz <= 1; dz++) {
        for (let dx = 0; dx <= 1; dx++) {
          const cx = Math.min(GRID - 1, Math.max(0, x0 + dx));
          const cz = Math.min(GRID - 1, Math.max(0, z0 + dz));
          const w = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
          const t = map.terrain[cz * GRID + cx];
          let c = typeColor(t);
          if (t === 0) {
            const k = fbm(x * 0.05, z * 0.05, map.seed + 41, 3);
            c = [
              theme.grass[0] + (theme.grass2[0] - theme.grass[0]) * k,
              theme.grass[1] + (theme.grass2[1] - theme.grass[1]) * k,
              theme.grass[2] + (theme.grass2[2] - theme.grass[2]) * k,
            ];
          }
          r += c[0] * w;
          g += c[1] * w;
          b += c[2] * w;
        }
      }
      const h = map.height(x, z);
      // cliffs go to bare rock, lake beds darken
      const rk = Math.min(1, Math.max(0, (h - 0.9) / 1.2));
      r += (theme.rock[0] - r) * rk;
      g += (theme.rock[1] - g) * rk;
      b += (theme.rock[2] - b) * rk;
      const wet = Math.min(1, Math.max(0, (-h - 0.35) / 1.2));
      r *= 1 - wet * 0.45;
      g *= 1 - wet * 0.35;
      b *= 1 - wet * 0.25;
      const noise = 0.82 + fbm(x * 0.55, z * 0.55, map.seed + 5, 2) * 0.36;
      return [r * noise, g * noise, b * noise];
    };

    for (let iz = 0; iz < verts; iz++) {
      for (let ix = 0; ix < verts; ix++) {
        const i = iz * verts + ix;
        const x = ix;
        const z = iz;
        positions[i * 3] = x;
        positions[i * 3 + 1] = map.height(x, z);
        positions[i * 3 + 2] = z;
        const c = colorAt(x, z);
        colors[i * 4] = c[0];
        colors[i * 4 + 1] = c[1];
        colors[i * 4 + 2] = c[2];
        colors[i * 4 + 3] = 1;
        uvs[i * 2] = x / 9;
        uvs[i * 2 + 1] = z / 9;
      }
    }
    let k = 0;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const a = iz * verts + ix;
        const b = a + 1;
        const c = a + verts;
        const d = c + 1;
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = b;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    if (normals[1] < 0) {
      // winding was back-facing for this engine convention: flip every triangle
      for (let i = 0; i < indices.length; i += 3) {
        const tmp = indices[i + 1];
        indices[i + 1] = indices[i + 2];
        indices[i + 2] = tmp;
      }
      VertexData.ComputeNormals(positions, indices, normals);
    }
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.colors = colors;
    vd.uvs = uvs;
    this.ground = new Mesh('ground', scene);
    vd.applyToMesh(this.ground);
    this.ground.receiveShadows = true;
    this.ground.isPickable = false;
    this.ground.freezeWorldMatrix();

    // Subtle tiling detail so large flat areas do not look like plain gradients.
    const detail = new DynamicTexture('groundDetail', { width: 256, height: 256 }, scene, true);
    const ctx = detail.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(0, 0, 256, 256);
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 5200; i++) {
      const dark = rnd() < 0.55;
      const v = dark ? 150 + Math.floor(rnd() * 60) : 235 + Math.floor(rnd() * 20);
      ctx.fillStyle = `rgba(${v},${v},${v},${0.2 + rnd() * 0.45})`;
      const sz = 1 + rnd() * 3.2;
      ctx.fillRect(rnd() * 256, rnd() * 256, sz, sz * (0.6 + rnd()));
    }
    for (let i = 0; i < 160; i++) {
      // little tufts / cracks
      ctx.strokeStyle = `rgba(110,110,110,${0.12 + rnd() * 0.22})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x = rnd() * 256;
      const y = rnd() * 256;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 9, y - 3 - rnd() * 7);
      ctx.stroke();
    }
    detail.update();
    const gm = new StandardMaterial('groundMat', scene);
    gm.diffuseTexture = detail;
    gm.specularColor = new Color3(0.03, 0.03, 0.03);
    this.ground.material = gm;

    // Water sheet.
    this.water = MeshBuilder.CreateGround('water', { width: WORLD, height: WORLD }, scene);
    this.water.position.set(WORLD / 2, -0.55, WORLD / 2);
    const wm = new StandardMaterial('waterMat', scene);
    wm.diffuseColor = new Color3(theme.water[0], theme.water[1], theme.water[2]);
    wm.emissiveColor = new Color3(theme.water[0] * 0.25, theme.water[1] * 0.25, theme.water[2] * 0.25);
    wm.specularColor = new Color3(0.9, 0.9, 0.9);
    wm.specularPower = 90;
    wm.alpha = 0.86;
    this.water.material = wm;
    this.water.isPickable = false;
    this.water.alphaIndex = 0;
    this.water.freezeWorldMatrix();

    // Props.
    const rocks = [0, 1, 2].map((v) => new Batch(buildRockModel(scene, v, theme.rock), 256));
    const trees = [0, 1].map((v) => new Batch(buildTreeModel(scene, v, v === 0 ? theme.leaf : theme.leaf2, theme.trunk, theme.snow), 512));
    const bush = new Batch(buildBushModel(scene, theme.leaf2), 256);
    for (const b of [...rocks, ...trees, bush]) {
      b.mesh.material = objectMaterial;
      b.mesh.receiveShadows = true;
      b.begin();
    }
    for (const p of map.props) {
      const y = map.height(p.x, p.z);
      if (p.type === 'rock') {
        const tint = 0.85 + ((p.rot * 7) % 1) * 0.3;
        rocks[p.variant % 3].push(p.x, y - 0.15, p.z, p.rot, p.scale, p.scale * (0.8 + ((p.rot * 3) % 1) * 0.5), p.scale, tint, tint, tint);
      } else if (p.type === 'tree') {
        const tint = 0.8 + ((p.rot * 5) % 1) * 0.4;
        trees[p.variant % 2].push(p.x, y - 0.1, p.z, p.rot, p.scale, p.scale * (0.9 + ((p.rot * 11) % 1) * 0.35), p.scale, tint, tint, tint);
      } else {
        bush.push(p.x, y - 0.05, p.z, p.rot, p.scale, p.scale, p.scale);
      }
    }
    for (const b of [...rocks, ...trees, bush]) {
      b.end();
      this.propBatches.push(b);
    }

    this.minimapImage = this.renderMinimap(map, theme);
  }

  private renderMinimap(map: GameMap, theme: Theme): HTMLCanvasElement {
    const size = 240;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const to = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255 * 1.25)));
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = ((px + 0.5) / size) * WORLD;
        const z = (1 - (py + 0.5) / size) * WORLD;
        const t = map.terrainAt(x, z);
        let col: Col;
        if (t === T_WATER) col = theme.water;
        else if (t === T_ROCK) col = [theme.rock[0] * 0.75, theme.rock[1] * 0.75, theme.rock[2] * 0.75];
        else if (t === T_FOREST) col = theme.leaf;
        else if (t === T_DIRT) col = theme.dirt;
        else col = theme.grass;
        const shade = 0.85 + fbm(x * 0.08, z * 0.08, map.seed, 2) * 0.3;
        const i = (py * size + px) * 4;
        img.data[i] = to(col[0] * shade);
        img.data[i + 1] = to(col[1] * shade);
        img.data[i + 2] = to(col[2] * shade);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  dispose(): void {
    this.ground.dispose(false, true);
    this.water.dispose(false, true);
    for (const b of this.propBatches) b.dispose();
  }
}
