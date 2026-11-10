// Plumbing shared by the verification scripts in this folder (not part of the game).
import { chromium } from 'playwright';

/** Launch headless Chromium with software WebGL and collect every runtime problem. */
export async function launch() {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const problems = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') problems.push(`console.error: ${t}`);
    else if (m.type() === 'warning' && /GL_INVALID|WebGL: INVALID/.test(t)) problems.push(`webgl: ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
  return { browser, page, problems };
}

/** Open a match directly (skips the main menu) and wait until it is rendering. */
export async function openMatch(page, base, query = 'hero=rook&difficulty=easy&theme=verdant&seed=1337') {
  await page.goto(`${base}?autostart=1&${query}`);
  await page.waitForFunction(() => window.__game && window.__game.frames > 3, null, { timeout: 240000 });
  await page.waitForTimeout(300);
}

/** Advance the simulation by `seconds` of game time without waiting in real time. */
export function sim(page, seconds) {
  return page.evaluate((s) => {
    const g = window.__game;
    for (let i = 0; i < Math.round(s * 20); i++) g.world.update(0.05);
  }, seconds);
}

/** Exceptions caught inside the game's frame loop (must stay empty). */
export function frameErrors(page) {
  return page.evaluate(() => (window.__game ? window.__game.errors.slice() : []));
}

/** Screen position (CSS px) of a world point. */
export function project(page, x, z, y = 0) {
  return page.evaluate(([px, py, pz]) => window.__game.renderer.cam.project(px, py, pz, { x: 0, y: 0, w: 0 }), [x, y, z]);
}

/**
 * Find a valid, on-screen (not under the HUD) build site near the player's HQ for the
 * structure currently in placement mode. Returns {x, y, cx, cz} in screen px / cells, or null.
 */
export function findSite(page, defId) {
  return page.evaluate((id) => {
    const g = window.__game;
    const w = g.world;
    const def = g.defs.buildings[id];
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    if (!hq) return null;
    for (let r = 4; r < 24; r++) {
      for (let oz = -r; oz <= r; oz++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          const cx = hq.cx + 2 + ox;
          const cz = hq.cz + 2 + oz;
          if (!w.nav.rectFree(cx - 1, cz - 1, def.w + 2, def.h + 2)) continue;
          if (w.canPlace(def, 0, cx, cz) !== '') continue;
          const sp = g.renderer.cam.project((cx + def.w / 2) * 2, 0, (cz + def.h / 2) * 2, { x: 0, y: 0, w: 0 });
          if (sp.w <= 0 || sp.x < 270 || sp.x > 1320 || sp.y < 70 || sp.y > 700) continue;
          return { x: sp.x, y: sp.y, cx, cz };
        }
      }
    }
    return null;
  }, defId);
}

/** Wait until the game has rendered `n` more frames (so camera matrices and HUD are current). */
export async function frames(page, n = 2) {
  const start = await page.evaluate(() => window.__game.frames);
  await page.waitForFunction(([s, k]) => window.__game.frames >= s + k, [start, n], { timeout: 120000 });
}

/** Centre the camera on a world point and wait for the view to update. */
export async function look(page, x, z) {
  await page.evaluate(([px, pz]) => window.__game.renderer.cam.jumpTo(px, pz, true), [x, z]);
  await frames(page, 2);
}

/** Screen position of an entity (by id), aimed at the middle of its body. */
export function screenOf(page, id) {
  return page.evaluate((eid) => {
    const g = window.__game;
    const w = g.world;
    const e = w.units.find((u) => u.id === eid) ?? w.buildings.find((b) => b.id === eid) ?? w.nodes.find((n) => n.id === eid);
    if (!e) return null;
    const y = w.groundY(e.x, e.z) + e.alt + (e.kind === 'node' ? 0 : e.height * 0.5);
    return g.renderer.cam.project(e.x, y, e.z, { x: 0, y: 0, w: 0 });
  }, id);
}

/** Start a Vite dev server unless URL is set; returns { base, close }. */
export async function serve(port) {
  if (process.env.URL) return { base: process.env.URL, close: async () => {} };
  const { createServer } = await import('vite');
  const server = await createServer({ server: { port }, logLevel: 'error' });
  await server.listen();
  return { base: server.resolvedUrls.local[0], close: () => server.close() };
}

/** Tiny assertion recorder with a summary and process exit code. */
export class Checker {
  constructor(name) {
    this.name = name;
    this.results = [];
  }
  check(label, ok, evidence = '') {
    this.results.push({ label, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${evidence !== '' ? `  [${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}]` : ''}`);
    return !!ok;
  }
  finish(problems, frameErrs) {
    const failed = this.results.filter((r) => !r.ok);
    console.log(`\n${this.name}: ${this.results.length - failed.length}/${this.results.length} checks passed`);
    console.log(`runtime problems: ${problems.length}, frame exceptions: ${frameErrs.length}`);
    for (const p of problems) console.log(`  ! ${p}`);
    for (const e of frameErrs) console.log(`  ! frame exception: ${e}`);
    for (const f of failed) console.log(`  x ${f.label}`);
    return failed.length || problems.length || frameErrs.length ? 1 : 0;
  }
}
