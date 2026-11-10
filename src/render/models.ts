import type { Mesh, Scene } from './babylon';
import type { ModelPack } from './modelpack';

/** A moving piece of a model, drawn in its own thin-instance batch. */
export interface PartInst {
  mesh: Mesh;
  /** turret | barrel | spin | cargo | rock */
  role: string;
  pivot: [number, number, number];
  meta: Record<string, number | string | boolean | number[]>;
}

export interface ModelParts {
  body: Mesh;
  /** Extra body poses (infantry walk cycle); the renderer swaps between them. */
  frames: Mesh[];
  parts: PartInst[];
  meta: Record<string, unknown>;
  /** Top of the body mesh above its origin. */
  height: number;
}

/**
 * Instantiate a model from the Blender-built pack (see `assets/blender`). Slots are resolved
 * against the faction palette; `overrides` swaps individual palette slots.
 */
export function buildModel(scene: Scene, pack: ModelPack, name: string, team: number, overrides?: Record<string, readonly number[]>): ModelParts {
  const src = pack.get(name, team);
  if (!src) throw new Error(`Model "${name}" is not in the model pack — rebuild it with npm run assets`);
  let body: Mesh | null = null;
  let height = 0;
  const frames: Mesh[] = [];
  const parts: PartInst[] = [];
  for (const p of src.parts) {
    const mesh = pack.buildMesh(scene, `${name}_${p.name}_${team}`, p, team, overrides);
    if (p.role === 'body') {
      body = mesh;
      height = p.max[1];
    }
    else if (p.role === 'walk') frames.push(mesh);
    else parts.push({ mesh, role: p.role, pivot: p.pivot, meta: p.meta });
  }
  if (!body) throw new Error(`Model "${name}" has no body part`);
  return { body, frames, parts, meta: src.meta, height };
}
