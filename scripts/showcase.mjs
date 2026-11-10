// Art review harness: boots a match, lines up every unit (both factions) and every structure
// on open ground with the fog lifted, and writes close-up screenshots to scripts/out/.
//
//   node scripts/showcase.mjs                 # verdant
//   THEME=frost node scripts/showcase.mjs
//   URL=http://localhost:5173/ node scripts/showcase.mjs
import { mkdirSync } from 'node:fs';
import { frames, launch, openMatch, serve } from './verify/lib.mjs';

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const theme = process.env.THEME ?? 'verdant';
const tag = process.env.TAG ?? theme;
const { base, close } = await serve(5196);
const { browser, page, problems } = await launch();
try {
  await openMatch(page, base, `hero=rook&difficulty=easy&theme=${theme}&seed=${process.env.SEED ?? 1337}`);
  const spot = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    w.fog.revealAll = true;
    g.paused = false;
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    // find a flat open strip between the base and the map centre for the parade
    let best = null;
    const dirX = 120 - hq.cx;
    const dirZ = 120 - hq.cz;
    const len = Math.hypot(dirX, dirZ) || 1;
    for (let r = 16; r < 70 && !best; r += 3) {
      for (const side of [0, 6, -6, 12, -12, 18, -18]) {
        const cx = Math.round(hq.cx + (dirX / len) * r * 0.5 - (dirZ / len) * side);
        const cz = Math.round(hq.cz + (dirZ / len) * r * 0.5 + (dirX / len) * side);
        if (w.nav.rectFree(cx - 13, cz - 6, 26, 12)) {
          best = { x: cx * 2, z: cz * 2 };
          break;
        }
      }
    }
    best ??= { x: hq.x + 30, z: hq.z + 30 };
    const units = ['trooper', 'grenadier', 'lancer', 'buggy', 'tank', 'artillery', 'titan', 'harvester', 'gunship'];
    units.forEach((id, i) => {
      for (const team of [0, 1]) {
        const u = w.spawnUnit(id, team, best.x - 20 + i * 5, best.z + (team === 0 ? -4 : 4));
        u.heading = u.turretYaw = team === 0 ? 0.6 : 2.6;
        u.holdFire = true;
      }
    });
    // stop the two lines from shooting each other while we take pictures
    for (const u of w.units) {
      u.hp = u.maxHp = 1e9;
      if (u.def.weapon) u.cooldown = 1e9;
    }
    return { best, hq: { x: hq.x, z: hq.z } };
  });
  const cam = (x, z, dist, yaw = 0) =>
    page.evaluate(([px, pz, d, y]) => {
      const c = window.__game.renderer.cam;
      c.yaw = y;
      c.dist = c.goalDist = d;
      c.jumpTo(px, pz, true);
    }, [x, z, dist, yaw]);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.game > :not(canvas)')) el.style.display = 'none';
  });
  // let the fog sheet finish fading in before the first picture
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 4; i++) g.world.update(0.05);
  });
  await cam(spot.best.x - 10, spot.best.z, 34);
  await frames(page, 14);
  await page.screenshot({ path: `${out}show-${tag}-units-a.png` });
  await cam(spot.best.x + 10, spot.best.z, 34);
  await frames(page, 4);
  await page.screenshot({ path: `${out}show-${tag}-units-b.png` });
  await cam(spot.best.x, spot.best.z, 62, 0.5);
  await frames(page, 4);
  await page.screenshot({ path: `${out}show-${tag}-units-wide.png` });
  await cam(spot.hq.x, spot.hq.z, 46);
  await frames(page, 4);
  await page.screenshot({ path: `${out}show-${tag}-base.png` });
  const enemy = await page.evaluate(() => {
    const hq = window.__game.world.buildings.find((b) => b.team === 1 && b.def.id === 'hq');
    return hq ? { x: hq.x, z: hq.z } : null;
  });
  if (enemy) {
    await cam(enemy.x, enemy.z, 60);
    await frames(page, 4);
    await page.screenshot({ path: `${out}show-${tag}-enemy.png` });
  }
  const errs = await page.evaluate(() => window.__game.errors.slice());
  console.log(`showcase ${tag}: problems=${problems.length} frameErrors=${errs.length}`);
  for (const p of [...problems, ...errs]) console.log('  !', p);
} finally {
  await browser.close();
  await close();
}
