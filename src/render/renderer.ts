import {
  Color3, Color4, DefaultRenderingPipeline, DirectionalLight, Engine, HemisphericLight, ImageProcessingConfiguration,
  MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Vector3,
} from './babylon';
import type { Mesh } from './babylon';
import { CELL, TEAM_COLORS, TEAM_NEUTRAL, TEAM_PLAYER } from '../core/config';
import type { ThemeId } from '../core/config';
import { BUILDING_DEFS } from '../data/buildings';
import type { Building } from '../sim/building';
import type { Entity } from '../sim/entity';
import type { World } from '../sim/world';
import { Batch } from './batch';
import { RtsCamera } from './camera';
import { FogView } from './fogview';
import { Fx } from './fx';
import { buildBuildingModel, buildCrystalModel, buildUnitModel } from './models';
import type { ModelParts } from './models';
import { THEMES, TerrainView } from './terrain';
import type { Theme } from './terrain';

interface ModelBatch {
  parts: ModelParts;
  body: Batch;
  turret: Batch | null;
}

export interface Ghost {
  defId: string;
  cx: number;
  cz: number;
  ok: boolean;
}

export interface FrameView {
  selection: readonly Entity[];
  ghost: Ghost | null;
  /** Targeting reticle for abilities / powers: ground point, radius, colour, optional cast range from a hero. */
  reticle: { x: number; z: number; radius: number; color: readonly [number, number, number]; range: number; fromX: number; fromZ: number } | null;
}

/** Owns the Babylon engine/scene and draws the simulation state every frame. */
export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly cam: RtsCamera;
  readonly fx: Fx;
  readonly terrain: TerrainView;
  readonly theme: Theme;
  readonly objectMat: StandardMaterial;
  private fogView: FogView;
  private sun: DirectionalLight;
  private shadows: ShadowGenerator;
  private pipeline: DefaultRenderingPipeline;
  private unitBatches = new Map<string, ModelBatch>();
  private buildingBatches = new Map<string, ModelBatch>();
  private crystals: Batch;
  private ghostMeshes = new Map<string, Mesh>();
  private ghostMat: StandardMaterial;
  private ghostPad: Mesh;
  private ghostPadMat: StandardMaterial;
  private activeGhost: Mesh | null = null;
  private time = 0;
  shadowsEnabled = true;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private world: World,
    themeId: ThemeId,
  ) {
    this.theme = THEMES[themeId] ?? THEMES.verdant;
    const theme = this.theme;
    this.engine = new Engine(canvas, true, { stencil: false, powerPreference: 'high-performance' }, false);
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
    const scene = (this.scene = new Scene(this.engine));
    scene.clearColor = new Color4(theme.clear[0], theme.clear[1], theme.clear[2], 1);
    scene.skipPointerMovePicking = true;
    scene.preventDefaultOnPointerDown = false;
    scene.preventDefaultOnPointerUp = false;
    scene.detachControl(); // input is handled by src/input, not Babylon's picking pipeline
    scene.autoClear = true;
    scene.blockMaterialDirtyMechanism = false;

    this.cam = new RtsCamera(scene);

    const hemi = new HemisphericLight('hemi', new Vector3(0.1, 1, 0.2), scene);
    hemi.diffuse = new Color3(theme.sky[0], theme.sky[1], theme.sky[2]);
    hemi.groundColor = new Color3(theme.ground[0], theme.ground[1], theme.ground[2]);
    hemi.specular = new Color3(0, 0, 0);
    hemi.intensity = 0.95;

    this.sun = new DirectionalLight('sun', new Vector3(-0.55, -1, 0.42).normalize(), scene);
    this.sun.diffuse = new Color3(theme.sun[0], theme.sun[1], theme.sun[2]);
    this.sun.specular = new Color3(theme.sun[0] * 0.6, theme.sun[1] * 0.6, theme.sun[2] * 0.6);
    this.sun.intensity = 1.75;
    this.sun.autoUpdateExtends = false;
    this.sun.autoCalcShadowZBounds = false;
    this.sun.shadowMinZ = 10;
    this.sun.shadowMaxZ = 420;

    this.shadows = new ShadowGenerator(2048, this.sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadows.bias = 0.0012;
    this.shadows.normalBias = 0.035;
    this.shadows.setDarkness(0.38);

    this.objectMat = new StandardMaterial('objects', scene);
    this.objectMat.specularColor = new Color3(0.16, 0.16, 0.16);
    this.objectMat.specularPower = 24;

    this.terrain = new TerrainView(scene, world.map, theme, this.objectMat);
    for (const b of this.terrain.propBatches) this.shadows.addShadowCaster(b.mesh);

    this.fx = new Fx(scene, (x, z) => world.groundY(x, z));
    this.fogView = new FogView(scene);

    const crystal = buildCrystalModel(scene);
    crystal.material = this.objectMat;
    this.crystals = new Batch(crystal, 128);

    this.ghostMat = new StandardMaterial('ghost', scene);
    this.ghostMat.alpha = 0.55;
    this.ghostMat.disableLighting = true;
    this.ghostMat.emissiveColor = new Color3(0.3, 1, 0.5);
    this.ghostPad = MeshBuilder.CreateGround('ghostPad', { width: 1, height: 1 }, scene);
    this.ghostPadMat = new StandardMaterial('ghostPadMat', scene);
    this.ghostPadMat.alpha = 0.35;
    this.ghostPadMat.disableLighting = true;
    this.ghostPadMat.emissiveColor = new Color3(0.2, 1, 0.4);
    this.ghostPadMat.zOffset = -4;
    this.ghostPad.material = this.ghostPadMat;
    this.ghostPad.isPickable = false;
    this.ghostPad.setEnabled(false);

    this.pipeline = new DefaultRenderingPipeline('pipeline', true, scene, [this.cam.camera]);
    this.pipeline.fxaaEnabled = true;
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomThreshold = 0.88;
    this.pipeline.bloomWeight = 0.3;
    this.pipeline.bloomKernel = 56;
    this.pipeline.bloomScale = 0.5;
    this.pipeline.imageProcessingEnabled = true;
    const ip = this.pipeline.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.5;
    ip.contrast = 1.18;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.6;
    ip.vignetteColor = new Color4(0, 0, 0, 0);
  }

  setQuality(shadows: boolean, bloom: boolean): void {
    this.shadowsEnabled = shadows;
    this.sun.shadowEnabled = shadows;
    this.pipeline.bloomEnabled = bloom;
  }

  resize(): void {
    this.engine.resize();
  }

  // ------------------------------------------------------------------ batches
  private unitBatch(model: string, team: number): ModelBatch {
    const key = `${model}:${team}`;
    let mb = this.unitBatches.get(key);
    if (!mb) {
      mb = this.makeBatch(buildUnitModel(this.scene, model, team));
      this.unitBatches.set(key, mb);
    }
    return mb;
  }

  private buildingBatch(model: string, team: number): ModelBatch {
    const key = `${model}:${team}`;
    let mb = this.buildingBatches.get(key);
    if (!mb) {
      mb = this.makeBatch(buildBuildingModel(this.scene, model, team));
      this.buildingBatches.set(key, mb);
    }
    return mb;
  }

  private makeBatch(parts: ModelParts): ModelBatch {
    const setup = (m: Mesh) => {
      m.material = this.objectMat;
      m.receiveShadows = true;
      this.shadows.addShadowCaster(m);
      return new Batch(m, 16);
    };
    return { parts, body: setup(parts.body), turret: parts.turret ? setup(parts.turret) : null };
  }

  /** Build every model up front so the first battle does not hitch. */
  warmup(unitModels: string[], buildingModels: string[]): void {
    for (const team of [0, 1]) {
      for (const m of unitModels) this.unitBatch(m, team);
      for (const m of buildingModels) this.buildingBatch(m, team);
    }
  }

  // ------------------------------------------------------------------ frame
  render(dt: number, view: FrameView): void {
    const world = this.world;
    this.time += dt;
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.cam.update(dt, this.fx.shakeAmount, w, h);
    this.updateSun();

    for (const mb of this.unitBatches.values()) {
      mb.body.begin();
      mb.turret?.begin();
    }
    for (const mb of this.buildingBatches.values()) {
      mb.body.begin();
      mb.turret?.begin();
    }
    this.fx.markBatch.begin();
    this.drawUnits(world, dt);
    this.drawBuildings(world);
    this.drawSelection(world, view);
    this.drawProjectiles(world, dt);
    for (const mb of this.unitBatches.values()) {
      mb.body.end();
      mb.turret?.end();
    }
    for (const mb of this.buildingBatches.values()) {
      mb.body.end();
      mb.turret?.end();
    }
    this.fx.markBatch.end();

    // crystals
    const cb = this.crystals;
    cb.begin();
    for (const n of world.nodes) {
      const f = 0.36 + 0.36 * (n.amount / n.initial);
      const pulse = 0.92 + Math.sin(this.time * 2 + n.id) * 0.08;
      cb.push(n.x, world.groundY(n.x, n.z) - 0.1, n.z, n.rot, f, f, f, pulse, pulse, pulse);
    }
    cb.end();

    this.updateGhost(view.ghost);
    this.fx.update(dt, this.cam.right, this.cam.up, this.time);
    this.fogView.update(world.fog, dt);
    this.scene.render();
    this.cam.syncMatrix();
  }

  /** Keep the shadow frustum centred on the camera focus, snapped to texels to avoid shimmer. */
  private updateSun(): void {
    const d = this.sun.direction;
    const R = Math.min(120, 44 * this.cam.zoomFactor + 26);
    const texel = (2 * R) / 2048;
    // light-space basis
    const rx = d.z;
    const rz = -d.x;
    const rl = Math.hypot(rx, rz);
    const r: [number, number, number] = [rx / rl, 0, rz / rl];
    const u: [number, number, number] = [d.y * r[2] - d.z * r[1], d.z * r[0] - d.x * r[2], d.x * r[1] - d.y * r[0]];
    const fx = this.cam.focusX + this.cam.fwd[0] * R * 0.25;
    const fz = this.cam.focusZ + this.cam.fwd[2] * R * 0.25;
    let a = fx * r[0] + fz * r[2];
    let b = fx * u[0] + fz * u[2];
    const c = fx * d.x + fz * d.z;
    a = Math.round(a / texel) * texel;
    b = Math.round(b / texel) * texel;
    const tx = r[0] * a + u[0] * b + d.x * c;
    const ty = r[1] * a + u[1] * b + d.y * c;
    const tz = r[2] * a + u[2] * b + d.z * c;
    this.sun.position.set(tx - d.x * 200, ty - d.y * 200, tz - d.z * 200);
    this.sun.orthoLeft = -R;
    this.sun.orthoRight = R;
    this.sun.orthoTop = R;
    this.sun.orthoBottom = -R;
  }

  private drawUnits(world: World, dt: number): void {
    const dirt = this.theme.dirt;
    for (const u of world.units) {
      if (!u.visible || !u.alive) continue;
      const mb = this.unitBatch(u.def.model, u.team);
      let y = world.groundY(u.x, u.z) + u.alt;
      const infantry = u.radius < 1;
      if (u.flying) y += Math.sin(this.time * 2.2 + u.id) * 0.25;
      else if (u.hero && u.def.id === 'hero_nyx') y += 0.35 + Math.sin(this.time * 2 + u.id) * 0.15;
      else if (infantry && u.moving) y += Math.abs(Math.sin(u.age * 11 + u.id)) * 0.16;

      let r = 1;
      let g = 1;
      let b = 1;
      if (u.flash > 0) {
        r = 2.6;
        g = 2.2;
        b = 2.0;
      } else if (u.stun > 0) {
        r = 0.5;
        g = 0.6;
        b = 1.1;
      } else if (u.shield > 0) {
        r = 0.9;
        g = 1.25;
        b = 1.6;
      } else if (u.haste > 0) {
        r = 1.3;
        g = 1.15;
        b = 0.85;
      }
      // foot heroes are drawn larger than life so they read at a glance
      const s = (u.dropT > 0 ? 1 : Math.min(1, 0.4 + u.age * 2.4)) * (u.hero && infantry ? 1.3 : 1);
      mb.body.push(u.x, y, u.z, u.heading, s, s, s, r, g, b);

      const tb = mb.turret;
      if (tb) {
        const p = mb.parts.pivot;
        const sh = Math.sin(u.heading);
        const ch = Math.cos(u.heading);
        const px = u.x + (p[0] * ch + p[2] * sh) * s;
        const pz = u.z + (-p[0] * sh + p[2] * ch) * s;
        const py = y + p[1] * s;
        if (mb.parts.mode === 'aim') {
          const k = u.recoil * 0.32;
          tb.push(px - Math.sin(u.turretYaw) * k, py, pz - Math.cos(u.turretYaw) * k, u.turretYaw, s, s, s, r, g, b);
        } else if (mb.parts.mode === 'spin') {
          tb.push(px, py, pz, this.time * mb.parts.spin + u.id, s, s, s, r, g, b);
        } else if (mb.parts.mode === 'cargo') {
          const fill = u.cargo / u.capacity(world);
          if (fill > 0.03) tb.push(px, py - 0.75 + fill * 0.75, pz, u.heading, 1, 0.35 + fill * 0.65, 1, 1, 1, 1);
        }
      }

      // ambient effects
      if (u.moving && !u.flying && !infantry && Math.random() < dt * 7) {
        this.fx.dust(u.x - Math.sin(u.heading) * u.radius, y + 0.2, u.z - Math.cos(u.heading) * u.radius, dirt[0] * 1.1, dirt[1] * 1.1, dirt[2] * 1.1);
      }
      if (u.dropT > 0 && Math.random() < dt * 40) this.fx.trail(u.x, y + 1, u.z);
      if (u.stun > 0 && Math.random() < dt * 6) this.fx.sparkle(u.x, y + u.height * 0.7, u.z, [0.4, 0.8, 1], 1);
      if (!u.hero && u.hp < u.maxHp * 0.35 && !infantry && Math.random() < dt * 4) this.fx.smoke(u.x, y + u.height * 0.6, u.z, 0.7);
      if (u.hero) {
        const a = 0.55 + Math.sin(this.time * 3) * 0.2;
        const hs = u.radius * 3.4;
        this.fx.markBatch.pushBasis(u.x, world.groundY(u.x, u.z) + 0.2, u.z, hs, 0, 0, 0, 0, hs, 0, 1, 0, 1.6, 1.2, 0.35, a);
      }
    }
  }

  private drawBuildings(world: World): void {
    for (const b of world.buildings) {
      if (!b.alive || !(b.visible || b.seen)) continue;
      const mb = this.buildingBatch(b.def.model, b.team);
      const y = world.groundY(b.x, b.z) + 0.3;
      const rise = b.rise >= 1 ? 1 : Math.max(0.04, 1 - (1 - b.rise) * (1 - b.rise));
      let r = 1;
      let g = 1;
      let bl = 1;
      if (b.flash > 0) {
        r = 2.2;
        g = 1.9;
        bl = 1.8;
      } else if (b.stun > 0) {
        r = 0.5;
        g = 0.6;
        bl = 1.1;
      } else if (b.offline) {
        r = g = bl = 0.5;
      } else if (b.rise < 1) {
        r = 0.7;
        g = 0.95;
        bl = 1.3;
      }
      mb.body.push(b.x, y, b.z, 0, 1, rise, 1, r, g, bl);
      const tb = mb.turret;
      if (tb && b.rise >= 1) {
        const p = mb.parts.pivot;
        if (mb.parts.mode === 'aim') {
          const k = b.recoil * 0.35;
          tb.push(b.x + p[0] - Math.sin(b.turretYaw) * k, y + p[1], b.z + p[2] - Math.cos(b.turretYaw) * k, b.turretYaw, 1, 1, 1, r, g, bl);
        } else {
          tb.push(b.x + p[0], y + p[1] + (b.def.id === 'obelisk' ? Math.sin(this.time * 1.5) * 0.3 : 0), b.z + p[2], this.time * mb.parts.spin, 1, 1, 1, r, g, bl);
        }
      }
      if (b.def.capturable) {
        const c = TEAM_COLORS[b.team].rgb;
        const rs = (b.radius + 6) * 2.27;
        const a = 0.3 + Math.sin(this.time * 2 + b.id) * 0.1;
        this.fx.markBatch.pushBasis(b.x, y, b.z, rs, 0, 0, 0, 0, rs, 0, 1, 0, c[0] * 1.5, c[1] * 1.5, c[2] * 1.5, a);
      }
      if (b.rise < 1 && Math.random() < 0.35) {
        this.fx.sparkle(b.x + (Math.random() - 0.5) * b.w * CELL, y + rise * b.height * 0.8, b.z + (Math.random() - 0.5) * b.h * CELL, [0.5, 0.85, 1], 1);
      }
    }
  }

  private drawSelection(world: World, view: FrameView): void {
    const mark = this.fx.markBatch;
    for (const e of view.selection) {
      if (!e.alive) continue;
      const col: [number, number, number] = e.team === TEAM_PLAYER ? [0.35, 1.5, 0.55] : e.team === TEAM_NEUTRAL ? [1.5, 1.3, 0.4] : [1.7, 0.35, 0.3];
      const y = world.groundY(e.x, e.z) + 0.22;
      if (e.kind === 'building') {
        const b = e as Building;
        const s = Math.max(b.w, b.h) * CELL * 1.5;
        mark.pushBasis(e.x, y, e.z, s, 0, 0, 0, 0, s, 0, 1, 0, col[0], col[1], col[2], 0.9);
        const wpn = b.def.weapon;
        if (wpn && b.team === TEAM_PLAYER) {
          const rs = (wpn.range + b.radius) * 2.27;
          mark.pushBasis(e.x, y, e.z, rs, 0, 0, 0, 0, rs, 0, 1, 0, 1.2, 1.0, 0.5, 0.28);
        }
        if (b.def.produces && b.team === TEAM_PLAYER && b.def.produces !== 'tech') {
          this.fx.segment(b.exitX, y + 0.3, b.exitZ, b.rallyX, world.groundY(b.rallyX, b.rallyZ) + 0.5, b.rallyZ, 0.08, 0.5, 1.4, 0.7, 0.7);
          mark.pushBasis(b.rallyX, world.groundY(b.rallyX, b.rallyZ) + 0.25, b.rallyZ, 2.2, 0, 0, 0, 0, 2.2, 0, 1, 0, 0.5, 1.6, 0.8, 0.9);
        }
      } else {
        const s = e.radius * 2.7 + 0.5;
        mark.pushBasis(e.x, y, e.z, s, 0, 0, 0, 0, s, 0, 1, 0, col[0], col[1], col[2], 0.95);
      }
    }
    const rt = view.reticle;
    if (rt) {
      const y = world.groundY(rt.x, rt.z) + 0.3;
      const s = Math.max(1.5, rt.radius) * 2.27;
      const pulse = 0.75 + Math.sin(this.time * 8) * 0.25;
      mark.pushBasis(rt.x, y, rt.z, s, 0, 0, 0, 0, s, 0, 1, 0, rt.color[0] * 1.8, rt.color[1] * 1.8, rt.color[2] * 1.8, pulse);
      if (rt.range > 0) {
        const rs = rt.range * 2.27;
        mark.pushBasis(rt.fromX, world.groundY(rt.fromX, rt.fromZ) + 0.25, rt.fromZ, rs, 0, 0, 0, 0, rs, 0, 1, 0, 1, 1, 1, 0.22);
      }
    }
  }

  private drawProjectiles(world: World, dt: number): void {
    const fx = this.fx;
    for (const p of world.projectiles) {
      if (!p.alive || !world.fog.isVisible(p.x, p.z)) continue;
      if (p.type === 'shell') {
        const l = p.big ? 2.6 : 1.8;
        fx.segment(p.x - p.dx * l, p.y - p.dy * l, p.z - p.dz * l, p.x, p.y, p.z, p.big ? 0.3 : 0.22, 2.6, 1.9, 0.8, 1);
      } else if (p.type === 'rocket') {
        fx.segment(p.x - p.dx * 1.2, p.y - p.dy * 1.2, p.z - p.dz * 1.2, p.x, p.y, p.z, 0.2, 2.2, 2.0, 1.6, 1);
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.03;
          fx.trail(p.x - p.dx * 1.2, p.y - p.dy * 1.2, p.z - p.dz * 1.2);
        }
      } else {
        const l = p.big ? 1.4 : 0.8;
        fx.segment(p.x - p.dx * l, p.y - p.dy * l, p.z - p.dz * l, p.x, p.y, p.z, p.big ? 0.42 : 0.3, 2.4, 1.3, 0.5, 1);
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = p.big ? 0.035 : 0.06;
          fx.trail(p.x, p.y, p.z);
        }
      }
    }
  }

  private updateGhost(ghost: Ghost | null): void {
    if (this.activeGhost) {
      this.activeGhost.setEnabled(false);
      this.activeGhost = null;
    }
    this.ghostPad.setEnabled(false);
    if (!ghost) return;
    const def = BUILDING_DEFS[ghost.defId];
    let mesh = this.ghostMeshes.get(ghost.defId);
    if (!mesh) {
      const parts = buildBuildingModel(this.scene, def.model, TEAM_PLAYER);
      parts.turret?.dispose();
      mesh = parts.body;
      mesh.material = this.ghostMat;
      mesh.useVertexColors = false;
      this.ghostMeshes.set(ghost.defId, mesh);
    }
    const x = (ghost.cx + def.w / 2) * CELL;
    const z = (ghost.cz + def.h / 2) * CELL;
    const y = this.world.groundY(x, z) + 0.3;
    const col = ghost.ok ? new Color3(0.25, 1, 0.45) : new Color3(1, 0.22, 0.18);
    this.ghostMat.emissiveColor = col;
    this.ghostPadMat.emissiveColor = col;
    mesh.position.set(x, y, z);
    mesh.setEnabled(true);
    this.activeGhost = mesh;
    this.ghostPad.position.set(x, y + 0.15, z);
    this.ghostPad.scaling.set(def.w * CELL, 1, def.h * CELL);
    this.ghostPad.setEnabled(true);
  }

  /** World-space trapezoid of the visible ground, for the minimap. */
  viewCorners(): ({ x: number; z: number } | null)[] {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return [this.cam.screenToGround(0, 0), this.cam.screenToGround(w, 0), this.cam.screenToGround(w, h), this.cam.screenToGround(0, h)];
  }

  centerOnStart(): void {
    const s = this.world.map.starts[TEAM_PLAYER];
    this.cam.jumpTo(s.cx * CELL + 8, s.cz * CELL + 6, true);
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}

