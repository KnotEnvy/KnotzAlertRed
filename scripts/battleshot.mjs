// Art review harness: stages a head-on battle beside the enemy base and captures a burst of
// frames so explosions, wrecks, debris and collapsing structures can be judged.
//
//   node scripts/battleshot.mjs            # verdant
//   THEME=scorched node scripts/battleshot.mjs
import { mkdirSync } from 'node:fs';
import { frames, launch, openMatch, serve } from './verify/lib.mjs';

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const theme = process.env.THEME ?? 'verdant';
const { base, close } = await serve(5195);
const { browser, page, problems } = await launch();
try {
  await openMatch(page, base, `hero=rook&difficulty=easy&theme=${theme}&seed=${process.env.SEED ?? 1337}`);
  const spot = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    w.fog.revealAll = true;
    const target = w.buildings.find((b) => b.team === 1 && b.def.id === 'power') ?? w.buildings.find((b) => b.team === 1);
    const hq = w.buildings.find((b) => b.team === 1 && b.def.id === 'hq');
    const dx = 120 - hq.x;
    const dz = 120 - hq.z;
    const len = Math.hypot(dx, dz) || 1;
    const ax = hq.x + (dx / len) * 27;
    const az = hq.z + (dz / len) * 27;
    const mine = ['tank', 'tank', 'tank', 'tank', 'titan', 'titan', 'artillery', 'trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'grenadier', 'gunship', 'gunship', 'buggy'];
    mine.forEach((id, i) => {
      const u = w.spawnUnit(id, 0, ax + ((i % 6) - 2.5) * 4, az + Math.floor(i / 6) * 4);
      u.hp = u.maxHp = u.maxHp * 2.5;
    });
    const foes = ['tank', 'tank', 'tank', 'titan', 'buggy', 'trooper', 'trooper', 'lancer', 'gunship'];
    foes.forEach((id, i) => w.spawnUnit(id, 1, hq.x + (dx / len) * 16 + ((i % 5) - 2) * 4, hq.z + (dz / len) * 16 + Math.floor(i / 5) * 4));
    return { x: (ax + hq.x) / 2, z: (az + hq.z) / 2, hq: { x: hq.x, z: hq.z } };
  });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.game > :not(canvas)')) el.style.display = 'none';
  });
  const cam = (x, z, dist) =>
    page.evaluate(([px, pz, d]) => {
      const c = window.__game.renderer.cam;
      c.dist = c.goalDist = d;
      c.jumpTo(px, pz, true);
    }, [x, z, dist]);
  await cam(spot.x, spot.z, 58);
  for (let i = 0; i < 9; i++) {
    await frames(page, 22);
    if (i === 4) await cam(spot.hq.x, spot.hq.z, 52);
    // keep the pressure on: level a structure while the camera watches
    if (i === 5) {
      await page.evaluate(() => {
        const w = window.__game.world;
        const b = w.buildings.find((x) => x.team === 1 && x.alive && x.def.id !== 'hq');
        if (b) w.kill(b, null, 0);
        const u = w.units.find((x) => x.team === 1 && x.alive && x.def.id === 'gunship');
        if (u) w.kill(u, null, 0);
      });
    }
    await page.screenshot({ path: `${out}battle-${theme}-${i}.png` });
  }
  const errs = await page.evaluate(() => window.__game.errors.slice());
  console.log(`battleshot ${theme}: problems=${problems.length} frameErrors=${errs.length}`);
  for (const p of [...problems, ...errs]) console.log('  !', p);
} finally {
  await browser.close();
  await close();
}
