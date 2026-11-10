import { Mesh, VertexData } from './babylon';
import type { Scene } from './babylon';

/**
 * Loader for the binary model pack built in Blender (`assets/blender/build.py`).
 *
 * Every vertex stores a palette slot instead of a colour, so one mesh serves every faction:
 * colours are resolved against the team palette when a mesh is instantiated. Emissive slots
 * are written with vertex alpha 0, which the object material's glow plugin renders unlit.
 */
export interface PackPart {
  name: string;
  /** body | walk | turret | barrel | spin | cargo | rock */
  role: string;
  /** Rest position of the part's origin in model space (game axes). */
  pivot: [number, number, number];
  meta: Record<string, number | string | boolean | number[]>;
  vcount: number;
  icount: number;
  pos: Float32Array;
  /** x, y, z normal (int8, /127) + palette slot. */
  ns: Int8Array;
  col: Uint8Array;
  idx: Uint16Array | Uint32Array;
  min: [number, number, number];
  max: [number, number, number];
}

export interface PackModel {
  kind: string;
  meta: Record<string, unknown>;
  parts: PackPart[];
}

interface RawPart extends Omit<PackPart, 'pos' | 'ns' | 'col' | 'idx'> {
  pos: number;
  ns: number;
  col: number;
  idx: number;
  idx32: boolean;
}

const MAGIC = 0x504d5a4b; // 'KZMP'

export class ModelPack {
  readonly models = new Map<string, PackModel>();
  private palettes: Record<string, number[][]> = {};
  private emissive: boolean[] = [];
  private slots: string[] = [];

  static async load(url: string): Promise<ModelPack> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Model pack ${url}: HTTP ${res.status}`);
    return ModelPack.parse(await res.arrayBuffer());
  }

  static parse(buf: ArrayBuffer): ModelPack {
    const head = new Uint32Array(buf, 0, 3);
    if (head[0] !== MAGIC) throw new Error('Not a KnotZ model pack');
    const jsonLen = head[2];
    const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, jsonLen))) as {
      palettes: Record<string, number[][]>;
      emissive: boolean[];
      slots: string[];
      models: Record<string, { kind: string; meta: Record<string, unknown>; parts: RawPart[] }>;
    };
    const base = 12 + jsonLen;
    const pack = new ModelPack();
    pack.palettes = manifest.palettes;
    pack.emissive = manifest.emissive;
    pack.slots = manifest.slots;
    for (const [name, m] of Object.entries(manifest.models)) {
      pack.models.set(name, {
        kind: m.kind,
        meta: m.meta,
        parts: m.parts.map((p) => ({
          ...p,
          pos: new Float32Array(buf, base + p.pos, p.vcount * 3),
          ns: new Int8Array(buf, base + p.ns, p.vcount * 4),
          col: new Uint8Array(buf, base + p.col, p.vcount * 4),
          idx: p.idx32 ? new Uint32Array(buf, base + p.idx, p.icount) : new Uint16Array(buf, base + p.idx, p.icount),
        })),
      });
    }
    return pack;
  }

  /** A faction-specific variant (`tank@1`) wins over the shared model. */
  get(name: string, team: number): PackModel | undefined {
    return this.models.get(`${name}@${team}`) ?? this.models.get(name);
  }

  /**
   * Instantiate one part as a mesh with colours resolved for `team`. `overrides` replaces
   * named palette slots (scenery is recoloured per battlefield theme this way).
   */
  buildMesh(scene: Scene, name: string, part: PackPart, team: number, overrides?: Record<string, readonly number[]>): Mesh {
    let pal = this.palettes[String(team)] ?? this.palettes['0'];
    if (overrides) {
      pal = pal.slice();
      for (const [slot, rgb] of Object.entries(overrides)) {
        const i = this.slots.indexOf(slot);
        if (i >= 0) pal[i] = rgb as number[];
      }
    }
    const n = part.vcount;
    const normals = new Float32Array(n * 3);
    const colors = new Float32Array(n * 4);
    const ns = part.ns;
    const col = part.col;
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      normals[i * 3] = ns[k] / 127;
      normals[i * 3 + 1] = ns[k + 1] / 127;
      normals[i * 3 + 2] = ns[k + 2] / 127;
      const slot = ns[k + 3];
      const c = pal[slot];
      colors[k] = (c[0] * col[k]) / 255;
      colors[k + 1] = (c[1] * col[k + 1]) / 255;
      colors[k + 2] = (c[2] * col[k + 2]) / 255;
      colors[k + 3] = this.emissive[slot] ? 0 : 1;
    }
    const vd = new VertexData();
    vd.positions = new Float32Array(part.pos);
    vd.normals = normals;
    vd.colors = colors;
    vd.indices = part.idx.slice();
    const mesh = new Mesh(name, scene);
    vd.applyToMesh(mesh);
    mesh.hasVertexAlpha = false;
    mesh.isPickable = false;
    return mesh;
  }
}

let cached: Promise<ModelPack> | null = null;

/** The pack is fetched once and shared by every match. */
export function loadModelPack(): Promise<ModelPack> {
  cached ??= ModelPack.load(`${import.meta.env.BASE_URL}models/models.kzm`).catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}
