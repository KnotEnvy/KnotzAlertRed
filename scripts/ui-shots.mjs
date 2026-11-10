// Screenshot tour of every interface surface, for visual review (not a test).
//   node scripts/ui-shots.mjs                       # 1600x900 full tour
//   SIZES=1280x720,1920x1080 ONLY=menu,battle node scripts/ui-shots.mjs
// Writes PNGs to scripts/out/ui/.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve, sim } from './verify/lib.mjs';

const outDir = new URL('./out/ui/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const sizes = (process.env.SIZES ?? '1600x900').split(',').map((s) => s.split('x').map(Number));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (k) => !only || only.has(k);

const { base, close } = await serve(5185);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const problems = [];

for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (m) => m.type() === 'error' && problems.push(`${w}x${h} console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`${w}x${h} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`${w}x${h} requestfailed: ${r.url()}`));
  const tag = `${w}x${h}`;
  const shot = (name) => page.screenshot({ path: `${outDir}${name}-${tag}.png` });

  await page.goto(base);
  await page.waitForSelector('[data-testid="btn-start"]', { timeout: 120000 });
  await page.waitForTimeout(2200);
  if (want('menu')) await shot('01-menu');
  if (want('settings')) {
    await page.click('[data-testid="btn-settings"]');
    await page.waitForTimeout(500);
    await shot('01b-menu-settings');
    await page.click('[data-testid="btn-settings-close"]');
  }
  await page.click('[data-testid="hero-nyx"]');
  await page.click('[data-testid="difficulty-hard"]');
  await page.click('[data-testid="theme-frost"]');
  if (want('menu')) {
    await page.waitForTimeout(600);
    await shot('01c-menu-nyx');
  }
  // hold the model pack back a little so the loading screen can be photographed
  await page.route('**/models/**', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.click('[data-testid="btn-start"]');
  await page.waitForSelector('.loading', { timeout: 20000 });
  await page.waitForTimeout(1600);
  if (want('loading')) await shot('02-loading');
  await page.waitForFunction(() => window.__game && window.__game.frames > 3, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  if (want('start')) await shot('03-hud-start');

  if (want('battle') || want('pause') || want('help') || want('end')) {
    // stage a mid-game base with queues, a fight and a selection
    await page.evaluate(() => {
      const g = window.__game;
      const w = g.world;
      const p = w.players[0];
      p.credits += 9000;
      const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
      const place = (id) => {
        const def = g.defs.buildings[id];
        for (let r = 5; r < 30; r++) {
          for (let oz = -r; oz <= r; oz++) {
            for (let ox = -r; ox <= r; ox++) {
              if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
              const cx = hq.cx + ox;
              const cz = hq.cz + oz;
              if (w.nav.rectFree(cx - 1, cz - 1, def.w + 2, def.h + 2) && w.canPlace(def, 0, cx, cz) === '') {
                w.placeBuilding(def, 0, cx, cz, true);
                w.recount();
                return;
              }
            }
          }
        }
      };
      for (const id of ['power', 'power', 'refinery', 'barracks', 'factory', 'techlab', 'sentry']) place(id);
      for (const b of w.buildings) if (b.team === 0) b.rise = 1;
      p.heroLevel = 3;
      p.heroXp = 620;
      p.req = 3.4;
      w.updateFog();
    });
    await sim(page, 2);
    await page.click('[data-testid="tab-vehicle"]');
    for (const id of ['tank', 'tank', 'artillery', 'buggy']) await page.click(`[data-testid="build-${id}"]`);
    await page.click('[data-testid="tab-infantry"]');
    for (const id of ['trooper', 'trooper', 'lancer']) await page.click(`[data-testid="build-${id}"]`);
    await page.click('[data-testid="tab-structure"]');
    await page.click('[data-testid="build-airpad"]');
    await sim(page, 4);
    await page.evaluate(() => {
      const g = window.__game;
      const w = g.world;
      const p = w.players[0];
      const h = p.hero;
      for (let i = 0; i < 6; i++) w.spawnUnit(i % 2 ? 'tank' : 'trooper', 0, h.x + 4 + (i % 3) * 3, h.z + 4 + Math.floor(i / 3) * 3);
      for (let i = 0; i < 6; i++) {
        const e = w.spawnUnit(i % 3 ? 'tank' : 'grenadier', 1, h.x + 18 + (i % 3) * 3, h.z + 14 + Math.floor(i / 3) * 3);
        e.aiRole = 'dummy';
      }
      w.updateFog();
      g.renderer.cam.jumpTo(h.x + 9, h.z + 8, true);
      const army = w.units.filter((u) => u.team === 0 && !u.def.harvester && Math.hypot(u.x - h.x, u.z - h.z) < 20);
      g.input.select(army);
      p.abilityCooldowns = [6, 0, 30];
    });
    await sim(page, 3.5);
    await page.waitForTimeout(800);
    await page.hover('[data-testid="build-techlab"]').catch(() => {});
    await page.hover('[data-testid="tab-vehicle"]');
    await page.click('[data-testid="tab-vehicle"]');
    await page.waitForTimeout(500);
    await page.hover('[data-testid="build-titan"]');
    await page.waitForTimeout(500);
    if (want('battle')) await shot('04-hud-battle');
    await page.mouse.move(w / 2, h / 2);
    await page.evaluate(() => {
      const g = window.__game;
      const t = g.world.units.find((u) => u.team === 0 && u.def.id === 'tank');
      if (t) {
        t.rank = 2;
        t.kills = 7;
        t.hp = t.maxHp * 0.55;
        g.input.select([t]);
      }
    });
    await page.waitForTimeout(800);
    if (want('battle')) await shot('04b-hud-single');
  }
  if (want('alerts')) {
    // freeze the sim and fake a tense moment: shortage, alerts, placement mode
    await page.evaluate(() => {
      const g = window.__game;
      const w = g.world;
      const p = w.players[0];
      g.paused = true;
      p.lowPower = true;
      p.powerUsed = p.powerMade + 75;
      g.hud.notify('Research complete: AP Munitions', 'good');
      g.hud.notify('Requires War Factory', 'warn');
      g.hud.notify('Requires War Factory', 'warn');
      const far = w.buildings.find((b) => b.team === 1);
      g.hud.notify('Our base is under attack!', 'bad', far.x, far.z);
      g.input.select([]);
      g.input.startPlacing('structure', 'power');
    });
    await page.waitForTimeout(450);
    await shot('04c-hud-alerts');
    await page.evaluate(() => {
      const g = window.__game;
      g.input.cancelModes();
      g.paused = false;
    });
  }
  if (want('pause')) {
    await page.click('[data-testid="btn-menu"]');
    await page.waitForTimeout(2500);
    await shot('05-pause');
    await page.click('[data-testid="btn-resume"]');
  }
  if (want('help')) {
    await page.click('[data-testid="btn-help"]');
    await page.waitForTimeout(2500);
    await shot('06-help');
    await page.click('[data-testid="btn-help-close"]');
  }
  if (want('end')) {
    await page.evaluate(() => {
      const w = window.__game.world;
      for (const b of w.buildings) if (b.team === 1) w.kill(b, null, 0);
    });
    await sim(page, 2);
    await page.waitForSelector('[data-testid="btn-again"]', { timeout: 60000 });
    await page.waitForTimeout(2600);
    await shot('07-victory');
    await page.click('[data-testid="btn-again"]');
    await page.waitForFunction(() => window.__game && window.__game.frames > 3 && !window.__game.world.result, null, { timeout: 240000 });
    await page.evaluate(() => {
      const w = window.__game.world;
      for (const b of w.buildings) if (b.team === 0) w.kill(b, null, 1);
    });
    await sim(page, 2);
    await page.waitForSelector('[data-testid="btn-again"]', { timeout: 60000 });
    await page.waitForTimeout(2600);
    await shot('08-defeat');
  }
  await page.close();
}

await browser.close();
await close();
console.log(`shots in ${outDir}; ${problems.length} problem(s)`);
for (const p of problems) console.log(`  ! ${p}`);
