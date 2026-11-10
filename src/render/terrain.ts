import { Color3, DirectionalLight, Mesh, MeshBuilder, StandardMaterial, Vector3, VertexData } from './babylon';
import type { Scene } from './babylon';
import { GRID, WORLD } from '../core/config';
import type { ThemeId } from '../core/config';
import { fbm } from '../core/rng';
import { T_DIRT, T_FOREST, T_GRASS, T_ROCK, T_WATER } from '../sim/map';
import type { GameMap } from '../sim/map';
import { Batch } from './batch';
import type { ModelPack } from './modelpack';
import { buildModel } from './models';

export type Col = readonly [number, number, number];

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
  private glint: DirectionalLight;
  /** Pre-rendered top-down image of the terrain for the minimap. */
  readonly minimapImage: HTMLCanvasElement;

  constructor(scene: Scene, map: GameMap, theme: Theme, objectMaterial: StandardMaterial, pack: ModelPack) {
    // Faceted low-poly ground: a jittered 2-unit grid, flat-shaded, one colour per triangle.
    // A skirt continues the landscape past the playable area so the map never ends in a void.
    const STEP = 2;
    const SKIRT = 26; // cells of scenery beyond each edge
    const n = GRID + SKIRT * 2;
    const verts = n + 1;
    const hash = (ix: number, iz: number, k: number) => {
      let h = (ix * 374761393 + iz * 668265263 + k * 2147483647 + map.seed * 69069) | 0;
      h = (h ^ (h >>> 13)) * 1274126177;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const gx = new Float32Array(verts * verts);
    const gy = new Float32Array(verts * verts);
    const gz = new Float32Array(verts * verts);
    for (let iz = 0; iz < verts; iz++) {
      for (let ix = 0; ix < verts; ix++) {
        const i = iz * verts + ix;
        const edge = ix === 0 || iz === 0 || ix === n || iz === n;
        const x = (ix - SKIRT) * STEP + (edge ? 0 : (hash(ix, iz, 1) - 0.5) * 1.1);
        const z = (iz - SKIRT) * STEP + (edge ? 0 : (hash(ix, iz, 2) - 0.5) * 1.1);
        gx[i] = x;
        gz[i] = z;
        // outside the map the land rolls away into low hills
        const out = Math.max(0, -x, -z, x - WORLD, z - WORLD);
        gy[i] = map.height(Math.min(WORLD, Math.max(0, x)), Math.min(WORLD, Math.max(0, z))) + (out > 0 ? fbm(x * 0.045, z * 0.045, map.seed + 77, 3) * Math.min(1, out / 14) * 5 : 0);
      }
    }

    const sampleColor = (x: number, z: number, h: number): [number, number, number] => {
      const cx = Math.min(WORLD - 0.01, Math.max(0, x));
      const cz = Math.min(WORLD - 0.01, Math.max(0, z));
      const t = map.terrainAt(cx, cz);
      let r: number;
      let g: number;
      let b: number;
      if (t === T_GRASS) {
        // broad patches of the two grass tones, like mown and wild ground
        const k = Math.min(1, Math.max(0, (fbm(x * 0.045, z * 0.045, map.seed + 41, 3) - 0.3) * 2.4));
        r = theme.grass[0] + (theme.grass2[0] - theme.grass[0]) * k;
        g = theme.grass[1] + (theme.grass2[1] - theme.grass[1]) * k;
        b = theme.grass[2] + (theme.grass2[2] - theme.grass[2]) * k;
      } else {
        const c = t === T_DIRT ? theme.dirt : t === T_ROCK ? theme.rock : t === T_WATER ? theme.shore : theme.forest;
        r = c[0];
        g = c[1];
        b = c[2];
      }
      // cliffs go to bare rock, lake beds darken
      const rk = Math.min(1, Math.max(0, (h - 0.9) / 1.2));
      r += (theme.rock[0] - r) * rk;
      g += (theme.rock[1] - g) * rk;
      b += (theme.rock[2] - b) * rk;
      const wet = Math.min(1, Math.max(0, (-h - 0.3) / 1.2));
      r *= 1 - wet * 0.5;
      g *= 1 - wet * 0.38;
      b *= 1 - wet * 0.25;
      return [r, g, b];
    };

    const tris = n * n * 2;
    const positions = new Float32Array(tris * 9);
    const normals = new Float32Array(tris * 9);
    const colors = new Float32Array(tris * 12);
    const indices = new Uint32Array(tris * 3);
    let tv = 0; // vertex cursor
    const tri = (a: number, b: number, c: number, seed: number) => {
      const ax = gx[a], ay = gy[a], az = gz[a];
      const bx = gx[b], by = gy[b], bz = gz[b];
      const cx = gx[c], cy = gy[c], cz = gz[c];
      // face normal (ordered so it points up)
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // colour: average of three interior samples so biome borders get one in-between facet
      const mx = (ax + bx + cx) / 3;
      const my = (ay + by + cy) / 3;
      const mz = (az + bz + cz) / 3;
      let r = 0;
      let g = 0;
      let bl = 0;
      for (const [px, pz] of [[ax, az], [bx, bz], [cx, cz]] as const) {
        const col = sampleColor(px + (mx - px) * 0.45, pz + (mz - pz) * 0.45, my);
        r += col[0] / 3;
        g += col[1] / 3;
        bl += col[2] / 3;
      }
      // per-facet tone variation is what gives the ground its low-poly sparkle
      const tone = 0.9 + hash(a, seed, 3) * 0.2;
      const steep = 1 - Math.min(0.25, (1 - Math.abs(ny)) * 0.9);
      const out = Math.max(0, -mx, -mz, mx - WORLD, mz - WORLD);
      const dim = tone * steep * (out > 0 ? Math.max(0.5, 1 - out / 40) : 1);
      const flip = ny < 0;
      const order = flip ? [a, c, b] : [a, b, c];
      for (const v of order) {
        positions[tv * 3] = gx[v];
        positions[tv * 3 + 1] = gy[v];
        positions[tv * 3 + 2] = gz[v];
        normals[tv * 3] = flip ? -nx : nx;
        normals[tv * 3 + 1] = Math.abs(ny);
        normals[tv * 3 + 2] = flip ? -nz : nz;
        colors[tv * 4] = r * dim;
        colors[tv * 4 + 1] = g * dim;
        colors[tv * 4 + 2] = bl * dim;
        colors[tv * 4 + 3] = 1;
        indices[tv] = tv;
        tv++;
      }
    };
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const a = iz * verts + ix;
        const b = a + 1;
        const c = a + verts;
        const d = c + 1;
        // alternate the diagonal so the facets do not line up into stripes
        if ((ix + iz) & 1) {
          tri(a, c, b, 0);
          tri(b, c, d, 1);
        } else {
          tri(a, c, d, 0);
          tri(a, d, b, 1);
        }
      }
    }
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.colors = colors;
    this.ground = new Mesh('ground', scene);
    vd.applyToMesh(this.ground);
    // Babylon culls by winding: make sure the top side is the visible one
    this.ground.receiveShadows = true;
    this.ground.isPickable = false;
    this.ground.freezeWorldMatrix();
    const gm = new StandardMaterial('groundMat', scene);
    gm.specularColor = new Color3(0.02, 0.02, 0.02);
    gm.backFaceCulling = false;
    this.ground.material = gm;

    // Water sheet.
    this.water = MeshBuilder.CreateGround('water', { width: WORLD + 104, height: WORLD + 104 }, scene);
    this.water.position.set(WORLD / 2, -0.55, WORLD / 2);
    const wm = new StandardMaterial('waterMat', scene);
    wm.diffuseColor = new Color3(theme.water[0] * 1.5, theme.water[1] * 1.5, theme.water[2] * 1.5);
    wm.emissiveColor = new Color3(theme.water[0] * 0.3, theme.water[1] * 0.3, theme.water[2] * 0.3);
    wm.specularColor = new Color3(1, 1, 1);
    wm.specularPower = 56;
    wm.alpha = 0.72;
    // A specular-only light aimed so the sun glints toward the camera, whichever way it faces.
    this.glint = new DirectionalLight('glint', new Vector3(0, -0.7, -0.7), scene);
    this.glint.diffuse = new Color3(0, 0, 0);
    this.glint.specular = new Color3(0.5, 0.56, 0.62);
    this.glint.includedOnlyMeshes = [this.water];
    this.water.material = wm;
    this.water.isPickable = false;
    this.water.alphaIndex = 0;
    this.water.freezeWorldMatrix();

    // Props: Blender-built scenery, recoloured for this battlefield through palette slots.
    const mix = (p: Col, q: Col, t: number): Col => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    const snow: Col = [0.9, 0.94, 1.0];
    const foliage = {
      leaf: theme.leaf,
      leaf2: theme.leaf2,
      trunk: theme.trunk,
      cap: theme.snow ? snow : mix(theme.leaf2, [1, 0.95, 0.5], 0.22),
    };
    const stone = {
      rock: mix(theme.rock, [1, 1, 1], 0.18),
      rock2: theme.rock,
      cap: theme.snow ? snow : mix(theme.rock, theme.grass, 0.3),
    };
    const make = (name: string, overrides: Record<string, Col>, cap: number) => {
      const b = new Batch(buildModel(scene, pack, name, 0, overrides).body, cap);
      b.mesh.material = objectMaterial;
      b.mesh.receiveShadows = true;
      b.begin();
      return b;
    };
    const rocks = ['rock0', 'rock1', 'rock2'].map((n) => make(n, stone, 256));
    const trees = ['tree0', 'tree1', 'tree2'].map((n) => make(n, foliage, 512));
    const bush = make('bush', foliage, 256);
    const frac = (v: number) => v - Math.floor(v);
    for (const p of map.props) {
      const y = map.height(p.x, p.z);
      if (p.type === 'rock') {
        const tint = 0.88 + frac(p.rot * 7) * 0.24;
        rocks[p.variant % 3].push(p.x, y - 0.12, p.z, p.rot, p.scale, p.scale * (0.85 + frac(p.rot * 3) * 0.4), p.scale, tint, tint, tint);
      } else if (p.type === 'tree') {
        const tint = 0.84 + frac(p.rot * 5) * 0.32;
        // conifers come in two shapes; broadleaf trees fill in the rest
        const kind = p.variant % 2 === 1 ? 1 : frac(p.rot * 13) < 0.4 ? 2 : 0;
        const s = p.scale * (kind === 1 ? 0.8 : 0.82);
        trees[kind].push(p.x, y - 0.1, p.z, p.rot, s, s * (0.9 + frac(p.rot * 11) * 0.3), s, tint, tint, tint);
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

  /** Keep the water's sheen facing the camera, with a slow swell so it never sits still. */
  update(time: number, camFwd: readonly [number, number, number]): void {
    this.glint.direction.set(-camFwd[0] + Math.sin(time * 0.6) * 0.08, camFwd[1] * 0.75, -camFwd[2] + Math.cos(time * 0.45) * 0.08);
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
