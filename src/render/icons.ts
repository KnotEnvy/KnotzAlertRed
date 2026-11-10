import { Color4, CreateScreenshotUsingRenderTargetAsync, FreeCamera, Vector3 } from './babylon';
import { BUILDING_DEFS } from '../data/buildings';
import { HERO_DEFS } from '../data/heroes';
import { UNIT_DEFS } from '../data/units';
import { buildBuildingModel, buildUnitModel } from './models';
import type { ModelParts } from './models';
import type { Renderer } from './renderer';

const ICON_LAYER = 0x20000000;

/**
 * Renders a small 3D portrait of every unit and structure into data URLs for the HUD,
 * so build buttons show the actual in-game models instead of placeholder glyphs.
 */
export async function renderIcons(renderer: Renderer, onProgress?: (f: number) => void): Promise<Record<string, string>> {
  const scene = renderer.scene;
  const engine = renderer.engine;
  const icons: Record<string, string> = {};
  const cam = new FreeCamera('iconCam', new Vector3(0, 0, -10), scene);
  cam.layerMask = ICON_LAYER;
  cam.fov = 0.5;
  cam.minZ = 0.5;
  cam.maxZ = 200;
  cam.inputs.clear();
  const prevClear = scene.clearColor;
  scene.clearColor = new Color4(0, 0, 0, 0);

  const jobs: { key: string; make: () => ModelParts; yaw: number }[] = [];
  for (const d of Object.values(UNIT_DEFS)) jobs.push({ key: d.id, make: () => buildUnitModel(scene, d.model, 0), yaw: 2.5 });
  for (const h of Object.values(HERO_DEFS)) jobs.push({ key: h.unit.id, make: () => buildUnitModel(scene, h.unit.model, 0), yaw: 2.5 });
  for (const d of Object.values(BUILDING_DEFS)) {
    jobs.push({ key: d.id, make: () => buildBuildingModel(scene, d.model, d.category === 'neutral' ? 2 : 0), yaw: 2.6 });
  }

  const origin = new Vector3(0, 900, 0);
  try {
    let done = 0;
    for (const job of jobs) {
      const parts = job.make();
      const meshes = [parts.body];
      parts.body.position.copyFrom(origin);
      if (parts.turret && parts.mode !== 'cargo') {
        parts.turret.position.set(origin.x + parts.pivot[0], origin.y + parts.pivot[1], origin.z + parts.pivot[2]);
        meshes.push(parts.turret);
      } else if (parts.turret) {
        parts.turret.dispose();
      }
      let radius = 1;
      const center = new Vector3();
      for (const m of meshes) {
        m.material = renderer.objectMat;
        m.layerMask = ICON_LAYER;
        m.computeWorldMatrix(true);
        m.refreshBoundingInfo();
      }
      const bi = parts.body.getBoundingInfo();
      center.copyFrom(bi.boundingBox.centerWorld);
      radius = bi.boundingSphere.radiusWorld;
      const dist = (radius / Math.sin(cam.fov / 2)) * 0.92;
      const pitch = 0.62;
      cam.position.set(
        center.x + Math.sin(job.yaw) * Math.cos(pitch) * dist,
        center.y + Math.sin(pitch) * dist,
        center.z + Math.cos(job.yaw) * Math.cos(pitch) * dist,
      );
      cam.setTarget(center);
      const shot = CreateScreenshotUsingRenderTargetAsync(engine, cam, { width: 128, height: 128 }, 'image/png', 4, true);
      const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(''), 5000));
      const url = await Promise.race([shot, timeout]);
      if (url) icons[job.key] = url;
      for (const m of meshes) m.dispose();
      done++;
      onProgress?.(done / jobs.length);
    }
  } catch (err) {
    console.warn('Icon rendering failed, falling back to glyphs', err);
  } finally {
    scene.clearColor = prevClear;
    cam.dispose();
  }
  return icons;
}
