// Scratch pad for scripts/debug.mjs: receives a Playwright page with a match already running.
// Edit freely; `window.__game` exposes the world, renderer, input and HUD.
const out = new URL('./out/', import.meta.url).pathname;

export default async function run(page) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}debug.png` });
  console.log(
    await page.evaluate(() => {
      const g = window.__game;
      return JSON.stringify({ time: g.world.time, units: g.world.units.length, buildings: g.world.buildings.length, errors: g.errors });
    }),
  );
}
