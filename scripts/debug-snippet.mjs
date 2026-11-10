// Scratch pad for scripts/debug.mjs: receives a Playwright page with a match already running.
const out = new URL('./out/', import.meta.url).pathname;

export default async function run(page) {
  await page.waitForTimeout(800);
  console.log(
    await page.evaluate(() => {
      const g = window.__game;
      const r = g.renderer;
      const sc = r.scene;
      const ground = sc.getMeshByName('ground');
      const sun = sc.lights.find((l) => l.name === 'sun');
      const sg = sun.getShadowGenerator();
      const sm = sg.getShadowMap();
      const mat = ground.material;
      const sub = ground.subMeshes[0];
      const defs = sub.materialDefines ?? sub._materialDefines;
      return JSON.stringify({
        receive: ground.receiveShadows, shadowEnabled: sun.shadowEnabled, renderList: sm.renderList.length,
        enabledCasters: sm.renderList.filter((m) => m.isEnabled()).length,
        SHADOW0: defs?.SHADOW0, SHADOWS: defs?.SHADOWS, LIGHT0: defs?.LIGHT0, LIGHT1: defs?.LIGHT1, pcf: defs?.SHADOWPCF0, SHADOW1: defs?.SHADOW1,
        lights: sc.lights.map((l) => l.name), sunPos: [sun.position.x, sun.position.y, sun.position.z], dir: [sun.direction.x, sun.direction.y, sun.direction.z],
        ortho: [sun.orthoLeft, sun.orthoRight, sun.orthoTop, sun.orthoBottom], minZ: sun.shadowMinZ, maxZ: sun.shadowMaxZ,
        focus: [r.cam.focusX, r.cam.focusZ], matName: mat.name, maxLights: mat.maxSimultaneousLights,
      });
    }),
  );
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.game > :not(canvas)')) el.style.display = 'none';
    const c = window.__game.renderer.cam; c.dist = c.goalDist = 40;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}debug.png` });
}
