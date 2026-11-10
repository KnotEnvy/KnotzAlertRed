// Headless browser smoke test.
// Boots the game (own Vite dev server unless URL is given), plays a scripted opening through
// the real HUD, runs a battle, and fails on any console error, page error or frame exception.
//
//   node scripts/smoke.mjs            # full run
//   URL=http://localhost:5173/ node scripts/smoke.mjs
//   SHOTS=1 node scripts/smoke.mjs    # also write screenshots to scripts/out/
//   PREVIEW=1 node scripts/smoke.mjs  # test the production build in dist/
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const shots = !!process.env.SHOTS;
const outDir = new URL('./out/', import.meta.url).pathname;
if (shots) mkdirSync(outDir, { recursive: true });

let server = null;
let base = process.env.URL;
if (!base && process.env.PREVIEW) {
  // PREVIEW=1 tests the production bundle in dist/ (run `npm run build` first)
  server = await preview({ preview: { port: 5197 }, logLevel: 'error' });
  base = server.resolvedUrls.local[0];
} else if (!base) {
  server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
  await server.listen();
  base = server.resolvedUrls.local[0];
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  // WebGL state errors surface as warnings; treat them as failures too
  else if (m.type() === 'warning' && /GL_INVALID|WebGL: INVALID/.test(m.text())) problems.push(`webgl: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  if (!r.url().includes('keyart')) problems.push(`requestfailed: ${r.url()}`);
});

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const shot = async (name) => {
  if (shots) await page.screenshot({ path: `${outDir}${name}.png` });
};
const sim = (seconds) =>
  page.evaluate((s) => {
    const g = window.__game;
    for (let i = 0; i < s * 20; i++) g.world.update(0.05);
  }, seconds);

try {
  // ---------------------------------------------------------------- menu
  await page.goto(base);
  await page.waitForSelector('[data-testid="btn-start"]', { timeout: 60000 });
  await shot('01-menu');
  await page.click('[data-testid="hero-nyx"]');
  await page.click('[data-testid="hero-rook"]');
  await page.click('[data-testid="difficulty-easy"]');
  await page.click('[data-testid="theme-verdant"]');
  await page.click('[data-testid="btn-howto"]');
  await page.click('[data-testid="btn-help-close"]');
  await page.click('[data-testid="btn-start"]');
  await page.waitForFunction(() => window.__game && window.__game.frames > 3, null, { timeout: 180000 });
  check('match boots from the main menu', true);
  await page.waitForTimeout(500);
  await shot('02-start');

  const iconCount = await page.evaluate(() => Object.keys(window.__game.icons).length);
  check('3D unit portraits rendered', iconCount >= 20, `${iconCount} icons`);

  // ---------------------------------------------------------------- HUD: build a base through the sidebar
  const build = async (tab, id, kind) => {
    await page.click(`[data-testid="tab-${tab}"]`);
    await page.click(`[data-testid="build-${id}"]`);
    for (let i = 0; i < 60; i++) {
      await sim(1);
      if (await page.evaluate((k) => window.__game.world.players[0].queues[k].ready, kind)) break;
    }
    await page.click(`[data-testid="build-${id}"]`); // enter placement mode
    // find a valid site near the HQ and click it on the canvas
    const pos = await page.evaluate((defId) => {
      const g = window.__game;
      const w = g.world;
      if (!g.input.placing) return null;
      const def = g.defs.buildings[defId];
      const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
      for (let r = 4; r < 22; r++) {
        for (let oz = -r; oz <= r; oz++) {
          for (let ox = -r; ox <= r; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
            const cx = hq.cx + 2 + ox;
            const cz = hq.cz + 2 + oz;
            if (!w.nav.rectFree(cx - 1, cz - 1, def.w + 2, def.h + 2)) continue;
            if (w.canPlace(def, 0, cx, cz) !== '') continue;
            const x = (cx + def.w / 2) * 2;
            const z = (cz + def.h / 2) * 2;
            const sp = g.renderer.cam.project(x, 0, z, { x: 0, y: 0, w: 0 });
            if (sp.w <= 0 || sp.x < 230 || sp.x > 1300 || sp.y < 90 || sp.y > 600) continue;
            return { x: sp.x, y: sp.y, cx, cz };
          }
        }
      }
      return null;
    }, id);
    if (!pos) return false;
    await page.mouse.move(pos.x, pos.y);
    await page.waitForTimeout(60);
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(60);
    await sim(2.5); // let the structure finish deploying
    return page.evaluate((defId) => window.__game.world.buildings.some((b) => b.team === 0 && b.def.id === defId && b.rise >= 1), id);
  };

  check('build + place Fusion Reactor via sidebar', await build('structure', 'power', 'structure'));
  check('build + place Refinery', await build('structure', 'refinery', 'structure'));
  check('build + place Barracks', await build('structure', 'barracks', 'structure'));
  await page.evaluate(() => (window.__game.world.players[0].credits += 20000));
  check('build + place War Factory', await build('structure', 'factory', 'structure'));
  check('build + place second Reactor', await build('structure', 'power', 'structure'));
  check('build + place Sentry Gun', await build('defense', 'sentry', 'defense'));
  check('build + place Tech Lab', await build('structure', 'techlab', 'structure'));
  check('build + place third Reactor', await build('structure', 'power', 'structure'));
  check('build + place Sky Dock', await build('structure', 'airpad', 'structure'));
  await sim(3);
  await shot('03-base');

  // ---------------------------------------------------------------- unit production queues
  await page.click('[data-testid="tab-infantry"]');
  for (const id of ['trooper', 'trooper', 'grenadier', 'lancer']) await page.click(`[data-testid="build-${id}"]`);
  await page.click('[data-testid="tab-vehicle"]');
  for (const id of ['tank', 'tank', 'buggy', 'artillery', 'titan']) await page.click(`[data-testid="build-${id}"]`);
  await page.click('[data-testid="build-buggy"]', { button: 'right' }); // cancel one
  await page.click('[data-testid="tab-air"]');
  await page.click('[data-testid="build-gunship"]');
  await page.click('[data-testid="tab-tech"]');
  await page.click('[data-testid="build-ap_rounds"]');
  const before = await page.evaluate(() => window.__game.world.units.filter((u) => u.team === 0).length);
  await sim(75);
  const after = await page.evaluate(() => window.__game.world.units.filter((u) => u.team === 0).length);
  check('production queues deliver units', after >= before + 7, `${before} -> ${after}`);
  check('research completes', await page.evaluate(() => window.__game.world.players[0].upgrades.has('ap_rounds')));
  check('harvesters bring in credits', await page.evaluate(() => window.__game.world.players[0].stats.harvested > 0));

  // ---------------------------------------------------------------- selection + commands
  await page.keyboard.press('F2');
  const selected = await page.evaluate(() => window.__game.input.selection.length);
  check('F2 selects the army', selected >= 8, `${selected} selected`);
  await page.click('[data-testid="cmd-hold"]');
  await page.click('[data-testid="cmd-stop"]');
  await page.click('[data-testid="cmd-attackMove"]');
  await page.mouse.click(800, 300);
  await page.keyboard.press('Control+1');
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  check('control group recall', (await page.evaluate(() => window.__game.input.selection.length)) === selected);
  await page.mouse.click(700, 380, { button: 'right' });
  await sim(4);
  check('right-click move order', await page.evaluate(() => window.__game.input.selection.some((u) => u.order.type === 'move' || u.moving || u.order.type === 'idle')));
  // box select
  await page.mouse.move(300, 120);
  await page.mouse.down();
  await page.mouse.move(1300, 640, { steps: 6 });
  await page.mouse.up();
  check('box select', (await page.evaluate(() => window.__game.input.selection.length)) > 0);
  await shot('04-army');

  // ---------------------------------------------------------------- hero abilities + support powers
  await page.click('[data-testid="hero-portrait"]');
  check('hero portrait selects hero', await page.evaluate(() => !!window.__game.input.selection[0]?.hero));
  await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const p = w.players[0];
    p.heroLevel = 3;
    p.req = 5;
    // drop a few hostiles next to the hero so abilities have targets
    for (let i = 0; i < 4; i++) w.spawnUnit('tank', 1, p.hero.x + 7 + i * 2.5, p.hero.z + 6);
    w.updateFog();
    g.renderer.cam.jumpTo(p.hero.x, p.hero.z, true);
  });
  await page.waitForTimeout(300);
  for (const i of [0, 1, 2]) {
    await page.click(`[data-testid="ability-${i}"]`);
    await page.waitForTimeout(80);
    if (await page.evaluate(() => !!window.__game.input.targeting)) {
      const tp = await page.evaluate(() => {
        const g = window.__game;
        const h = g.world.players[0].hero;
        const e = g.world.units.find((u) => u.team === 1 && Math.hypot(u.x - h.x, u.z - h.z) < 18);
        const t = e ?? h;
        return g.renderer.cam.project(t.x, 0, t.z, { x: 0, y: 0, w: 0 });
      });
      await page.mouse.move(tp.x, tp.y);
      await page.mouse.click(tp.x, tp.y);
    }
    await sim(1);
    await page.waitForTimeout(80);
  }
  const cds = await page.evaluate(() => window.__game.world.players[0].abilityCooldowns.map((c) => c > 0));
  check('hero abilities cast (Q/W/E buttons)', cds.every(Boolean), JSON.stringify(cds));
  await shot('05-abilities');
  for (const id of ['cache', 'recon', 'drop', 'lance']) {
    await page.click(`[data-testid="power-${id}"]`);
    await page.waitForTimeout(50);
    if (await page.evaluate(() => !!window.__game.input.targeting)) await page.mouse.click(860, 400);
    await sim(1);
  }
  const pcd = await page.evaluate(() => Object.values(window.__game.world.players[0].powerCooldowns).filter((c) => c > 0).length);
  check('support powers fire', pcd >= 3, `${pcd} on cooldown`);
  await sim(6);
  await shot('06-powers');

  // ---------------------------------------------------------------- combat loop
  const kills0 = await page.evaluate(() => window.__game.world.players[0].stats.unitsKilled);
  await page.evaluate(() => {
    const w = window.__game.world;
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    for (let i = 0; i < 8; i++) w.spawnUnit(i % 2 ? 'tank' : 'trooper', 1, hq.x + 30 + (i % 4) * 3, hq.z + 26 + Math.floor(i / 4) * 3);
    for (const u of w.units) if (u.team === 1 && !u.def.harvester && Math.hypot(u.x - hq.x, u.z - hq.z) < 60) u.setOrder({ type: 'attackMove', x: hq.x, z: hq.z, target: null, ability: -1 });
  });
  for (let i = 0; i < 8; i++) {
    await sim(4);
    await page.waitForTimeout(120);
    if (i === 2) await shot('07-battle');
  }
  const kills1 = await page.evaluate(() => window.__game.world.players[0].stats.unitsKilled);
  check('combat loop resolves kills', kills1 > kills0, `${kills0} -> ${kills1}`);

  // ---------------------------------------------------------------- building commands, pause, help
  await page.evaluate(() => {
    const g = window.__game;
    const b = g.world.buildings.find((x) => x.team === 0 && x.def.id === 'barracks');
    b.hp = b.maxHp * 0.5;
    g.input.select([b]);
  });
  await page.waitForTimeout(150);
  await page.click('[data-testid="cmd-repair"]');
  await page.click('[data-testid="cmd-primary"]');
  await sim(3);
  check('repair command heals', await page.evaluate(() => {
    const b = window.__game.world.buildings.find((x) => x.team === 0 && x.def.id === 'barracks');
    return b.hp > b.maxHp * 0.5;
  }));
  const credits0 = await page.evaluate(() => window.__game.world.players[0].credits);
  await page.click('[data-testid="cmd-sell"]');
  check('sell command refunds', (await page.evaluate(() => window.__game.world.players[0].credits)) > credits0);

  await page.click('[data-testid="btn-help"]');
  await page.click('[data-testid="btn-help-close"]');
  await page.click('[data-testid="btn-menu"]');
  check('pause menu opens', await page.evaluate(() => window.__game.paused));
  // toggle every graphics / audio setting off and on again while rendering
  for (const id of ['shadows', 'bloom', 'voice', 'edgeScroll']) {
    await page.click(`[data-testid="set-${id}"]`);
    await page.waitForTimeout(350);
  }
  await shot('08a-settings-off');
  for (const id of ['shadows', 'bloom', 'voice', 'edgeScroll']) {
    await page.click(`[data-testid="set-${id}"]`);
    await page.waitForTimeout(350);
  }
  await page.click('[data-testid="btn-resume"]');
  check('resume works', await page.evaluate(() => !window.__game.paused));

  // ---------------------------------------------------------------- long soak with the AI, then victory screen
  await sim(240);
  await page.waitForTimeout(300);
  await shot('08-late');
  await page.evaluate(() => {
    const w = window.__game.world;
    for (const b of w.buildings) if (b.team === 1) w.kill(b, null, 0);
  });
  await sim(2);
  await page.waitForSelector('[data-testid="btn-again"]', { timeout: 20000 });
  check('victory screen appears', await page.evaluate(() => window.__game.world.result === 'victory'));
  await shot('09-victory');
  await page.click('[data-testid="btn-mainmenu"]');
  await page.waitForSelector('[data-testid="btn-start"]', { timeout: 20000 });
  check('returns to main menu', true);

  // ---------------------------------------------------------------- second match: other hero + theme, then defeat
  await page.click('[data-testid="hero-nyx"]');
  await page.click('[data-testid="difficulty-hard"]');
  await page.click('[data-testid="theme-frost"]');
  await page.click('[data-testid="btn-start"]');
  await page.waitForFunction(() => window.__game && window.__game.frames > 3, null, { timeout: 180000 });
  check('second match boots (engine re-created cleanly)', await page.evaluate(() => window.__game.world.players[0].heroDef.id === 'nyx'));
  await page.keyboard.press('F1');
  await page.keyboard.press('KeyQ');
  await page.mouse.click(900, 400);
  await page.keyboard.press('KeyW');
  await page.mouse.click(820, 420);
  await page.keyboard.press('Escape');
  await sim(20);
  await shot('10-second-match');
  await page.evaluate(() => {
    const w = window.__game.world;
    for (const b of w.buildings) if (b.team === 0) w.kill(b, null, 1);
  });
  await sim(2);
  await page.waitForSelector('[data-testid="btn-again"]', { timeout: 20000 });
  check('defeat screen appears', await page.evaluate(() => window.__game.world.result === 'defeat'));
  await page.click('[data-testid="btn-again"]');
  await page.waitForFunction(() => window.__game && window.__game.frames > 3 && !window.__game.world.result, null, { timeout: 180000 });
  check('play again restarts the match', true);

} catch (err) {
  problems.push(`test aborted: ${err.message}`);
  try {
    await page.screenshot({ path: `${outDir}zz-failure.png` });
  } catch {
    /* ignore */
  }
}

const frameErrs = await page.evaluate(() => (window.__game ? window.__game.errors : [])).catch(() => []);
for (const e of frameErrs) problems.push(`frame exception: ${e}`);

await browser.close();
if (server) await server.close();

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed, ${problems.length} runtime problem(s)`);
for (const p of problems) console.log(`  ! ${p}`);
process.exit(failed || problems.length ? 1 : 0);
