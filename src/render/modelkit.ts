import { Mesh, MeshBuilder, VertexBuffer } from './babylon';
import type { Scene } from './babylon';

export type Col = readonly [number, number, number];

export interface Rot {
  rx?: number;
  ry?: number;
  rz?: number;
}

/**
 * Tiny procedural modelling kit. Primitives are baked into place with a flat vertex
 * colour and merged into a single mesh, so a whole vehicle or building is one draw call
 * and needs no textures or external assets.
 */
export class ModelBuilder {
  private parts: Mesh[] = [];
  private n = 0;
  constructor(private scene: Scene) {}

  private add(m: Mesh, color: Col, x: number, y: number, z: number, rot?: Rot, sx = 1, sy = 1, sz = 1): this {
    m.position.set(x, y, z);
    m.rotation.set(rot?.rx ?? 0, rot?.ry ?? 0, rot?.rz ?? 0);
    m.scaling.set(sx, sy, sz);
    m.bakeCurrentTransformIntoVertices();
    const count = m.getTotalVertices();
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      colors[i * 4] = color[0];
      colors[i * 4 + 1] = color[1];
      colors[i * 4 + 2] = color[2];
      colors[i * 4 + 3] = 1;
    }
    m.setVerticesData(VertexBuffer.ColorKind, colors);
    this.parts.push(m);
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: Col, rot?: Rot): this {
    return this.add(MeshBuilder.CreateBox(`p${this.n++}`, { width: w, height: h, depth: d }, this.scene), color, x, y, z, rot);
  }

  /** Cylinder / cone along +Y (rotate with `rot`). */
  cyl(d: number, h: number, x: number, y: number, z: number, color: Col, opts: Rot & { dTop?: number; tess?: number } = {}): this {
    const m = MeshBuilder.CreateCylinder(
      `p${this.n++}`,
      { diameterBottom: d, diameterTop: opts.dTop ?? d, height: h, tessellation: opts.tess ?? 12 },
      this.scene,
    );
    return this.add(m, color, x, y, z, opts);
  }

  /** Box whose top face is smaller than its base (sloped armour, roofs, pylons). */
  taper(wBottom: number, wTop: number, h: number, depthRatio: number, x: number, y: number, z: number, color: Col, rot?: Rot): this {
    const m = MeshBuilder.CreateCylinder(
      `p${this.n++}`,
      { diameterBottom: wBottom * Math.SQRT2, diameterTop: wTop * Math.SQRT2, height: h, tessellation: 4 },
      this.scene,
    );
    m.rotation.y = Math.PI / 4;
    m.bakeCurrentTransformIntoVertices();
    m.convertToFlatShadedMesh();
    return this.add(m, color, x, y, z, rot, 1, 1, depthRatio);
  }

  sphere(d: number, x: number, y: number, z: number, color: Col, sx = 1, sy = 1, sz = 1, segments = 8): this {
    return this.add(MeshBuilder.CreateSphere(`p${this.n++}`, { diameter: d, segments }, this.scene), color, x, y, z, undefined, sx, sy, sz);
  }

  /** Faceted rock / crystal blob. */
  ico(radius: number, x: number, y: number, z: number, color: Col, sx = 1, sy = 1, sz = 1, rot?: Rot): this {
    const m = MeshBuilder.CreateIcoSphere(`p${this.n++}`, { radius, subdivisions: 1, flat: true }, this.scene);
    return this.add(m, color, x, y, z, rot, sx, sy, sz);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  build(name: string): Mesh {
    const merged = Mesh.MergeMeshes(this.parts, true, true);
    this.parts = [];
    if (!merged) throw new Error(`Failed to build model ${name}`);
    merged.name = name;
    merged.isPickable = false;
    return merged;
  }
}

export function scaleCol(c: Col, f: number): Col {
  return [c[0] * f, c[1] * f, c[2] * f];
}
export function mixCol(a: Col, b: Col, t: number): Col {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
