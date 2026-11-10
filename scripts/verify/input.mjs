// Verification suite: unit commands and player input, driven by real mouse / keyboard events
// on the game canvas. Evidence is read back from simulation state.
//   node scripts/verify/input.mjs            (starts its own dev server)
//   URL=http://localhost:5173/ node scripts/verify/input.mjs
import { Checker, frameErrors, frames, launch, look, openMatch, project, screenOf, serve, sim } from './lib.mjs';

const { base, close } = await serve(5191);
const { browser, page, problems } = await launch();
const c = new Checker('input');
const ids = (sel) => page.evaluate(() => window.__game.input.selection.map((e) => e.id).sort((a, b) => a - b));
const orders = () => page.evaluate(() => window.__game.input.selection.map((u) => u.order.type));
const rclick = (x, y, opts = {}) => page.mouse.click(x, y, { button: 'right', ...opts });

try {
  await openMatch(page, base, 'hero=rook&difficulty=easy&theme=verdant&seed=1337');
  await page.click('[data-testid="objectives-close"]');

  // Stage: an open patch of ground next to the starting army.
  const stage = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const hero = w.players[0].hero;
    const own = w.units.filter((u) => u.team === 0);
    return {
      heroId: hero.id,
      hx: hero.x,
      hz: hero.z,
      tankId: own.find((u) => u.def.id === 'tank').id,
      trooperIds: own.filter((u) => u.def.id === 'trooper').map((u) => u.id),
      all: own.map((u) => u.id),
    };
  });
  await look(page, stage.hx + 4, stage.hz + 4);

  // ---- 1. click select / deselect
  let sp = await screenOf(page, stage.tankId);
  await page.mouse.click(sp.x, sp.y);
  c.check('1a left-click selects exactly that unit', JSON.stringify(await ids()) === JSON.stringify([stage.tankId]), await ids());
  const empty = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const h = w.players[0].hero;
    for (let r = 14; r < 30; r += 2) {
      for (let a = 0; a < 6.28; a += 0.4) {
        const x = h.x + Math.cos(a) * r;
        const z = h.z + Math.sin(a) * r;
        if (w.nav.blockedAt(x, z)) continue;
        if (w.units.some((u) => Math.hypot(u.x - x, u.z - z) < 5) || w.buildings.some((b) => b.contains(x, z, 4)) || w.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 4)) continue;
        const s = g.renderer.cam.project(x, 0, z, { x: 0, y: 0, w: 0 });
        if (s.x > 300 && s.x < 1300 && s.y > 80 && s.y < 720) return { x, z, sx: s.x, sy: s.y };
      }
    }
    return null;
  });
  await page.mouse.click(empty.sx, empty.sy);
  c.check('1b clicking empty ground clears the selection', (await ids()).length === 0);

  // ---- 2. box select (harvester excluded when combat units are boxed)
  const harvId = await page.evaluate(([x, z]) => window.__game.world.spawnUnit('harvester', 0, x, z).id, [stage.hx + 3, stage.hz - 3]);
  await page.evaluate((id) => {
    const u = window.__game.world.units.find((x) => x.id === id);
    u.setOrder({ type: 'hold', x: 0, z: 0, target: null, ability: -1 });
  }, harvId);
  await frames(page, 2);
  const box = await page.evaluate((list) => {
    const g = window.__game;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const id of list) {
      const u = g.world.units.find((x) => x.id === id);
      const s = g.renderer.cam.project(u.x, g.world.groundY(u.x, u.z) + u.height * 0.4, u.z, { x: 0, y: 0, w: 0 });
      x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y);
    }
    return { x0: x0 - 25, y0: y0 - 25, x1: x1 + 25, y1: y1 + 25 };
  }, [...stage.all, harvId]);
  await page.mouse.move(Math.max(275, box.x0), Math.max(60, box.y0));
  await page.mouse.down();
  await page.mouse.move(Math.min(1335, box.x1), Math.min(745, box.y1), { steps: 8 });
  await page.mouse.up();
  let sel = await ids();
  c.check('2a box select grabs every combat unit in the box', stage.all.every((id) => sel.includes(id)), `${sel.length} selected`);
  c.check('2b box select leaves the harvester out when combat units are present', !sel.includes(harvId));

  // ---- 3. shift-click and double-click
  sp = await screenOf(page, stage.tankId);
  await page.mouse.click(sp.x, sp.y);
  sp = await screenOf(page, stage.trooperIds[0]);
  await page.keyboard.down('Shift');
  await page.mouse.click(sp.x, sp.y);
  const added = await ids();
  await page.waitForTimeout(450); // avoid being read as a double-click
  await page.mouse.click(sp.x, sp.y);
  await page.keyboard.up('Shift');
  const removed = await ids();
  c.check('3a shift-click adds a unit', added.length === 2 && added.includes(stage.trooperIds[0]), added);
  c.check('3b shift-click again removes it', removed.length === 1 && removed[0] === stage.tankId, removed);
  await page.waitForTimeout(450);
  await page.mouse.dblclick(sp.x, sp.y);
  sel = await ids();
  c.check('3c double-click selects all units of that type on screen', sel.length === stage.trooperIds.length && stage.trooperIds.every((id) => sel.includes(id)), sel);

  // ---- 4. move orders + waypoint queue
  await page.keyboard.press('F2');
  const army = await ids();
  await rclick(empty.sx, empty.sy);
  let o = await orders();
  c.check('4a right-click ground gives every selected unit a move order', o.length === army.length && o.every((t) => t === 'move'), o.join(','));
  await sim(page, 14);
  const arrived = await page.evaluate(([x, z]) => window.__game.input.selection.map((u) => ({ d: Math.hypot(u.x - x, u.z - z), t: u.order.type })), [empty.x, empty.z]);
  c.check('4b units travel to the point and go idle', arrived.every((a) => a.d < 9 && a.t === 'idle'), `max dist ${Math.max(...arrived.map((a) => a.d)).toFixed(1)}`);
  await look(page, empty.x, empty.z);
  sp = await screenOf(page, stage.tankId);
  await page.mouse.click(sp.x, sp.y);
  const wp = [await project(page, empty.x + 10, empty.z), await project(page, empty.x + 10, empty.z + 9), await project(page, empty.x, empty.z + 9)];
  await rclick(wp[0].x, wp[0].y);
  await page.keyboard.down('Shift');
  await rclick(wp[1].x, wp[1].y);
  await rclick(wp[2].x, wp[2].y);
  await page.keyboard.up('Shift');
  const q = await page.evaluate(() => window.__game.input.selection[0].queue.length);
  c.check('4c shift + right-click queues waypoints', q === 2, `queue ${q}`);
  await sim(page, 12);
  const endPos = await page.evaluate(([x, z]) => {
    const u = window.__game.input.selection[0];
    return { d: Math.hypot(u.x - x, u.z - z), t: u.order.type, q: u.queue.length };
  }, [empty.x, empty.z + 9]);
  c.check('4d the unit walks the whole queue', endPos.d < 4 && endPos.t === 'idle' && endPos.q === 0, endPos);

  // ---- 5. attack order
  const foe = await page.evaluate(() => {
    const g = window.__game;
    const t = g.input.selection[0];
    const e = g.world.spawnUnit('buggy', 1, t.x + 9, t.z + 5);
    e.aiRole = 'dummy'; // keep the AI director from re-tasking the target
    e.setOrder({ type: 'hold', x: 0, z: 0, target: null, ability: -1 });
    e.hp = e.maxHp = 5000;
    g.world.updateFog();
    return e.id;
  });
  await frames(page, 2);
  sp = await screenOf(page, foe);
  await rclick(sp.x, sp.y);
  const atk = await page.evaluate(() => {
    const u = window.__game.input.selection[0];
    return { t: u.order.type, target: u.order.target?.id };
  });
  c.check('5a right-click an enemy issues an attack order on it', atk.t === 'attack' && atk.target === foe, atk);
  await sim(page, 6);
  const foeHp = await page.evaluate((id) => window.__game.world.units.find((u) => u.id === id)?.hp, foe);
  c.check('5b the target takes damage', foeHp < 5000, `hp ${Math.round(foeHp)}`);

  // ---- 6. attack-move / stop / hold by key and by command card
  await page.keyboard.press('F2');
  const gp = await project(page, empty.x - 8, empty.z - 6);
  await page.keyboard.press('KeyA');
  const targeting = await page.evaluate(() => window.__game.input.targeting?.type);
  await page.mouse.click(gp.x, gp.y);
  o = await orders();
  c.check('6a A then click issues attack-move', targeting === 'attackMove' && o.every((t) => t === 'attackMove' || t === 'attack'), o.join(','));
  await page.keyboard.press('KeyS');
  o = await orders();
  c.check('6b S stops (idle)', o.every((t) => t === 'idle'), o.join(','));
  await page.keyboard.press('KeyH');
  o = await orders();
  c.check('6c H holds position', o.every((t) => t === 'hold'), o.join(','));
  await page.keyboard.down('Control');
  await rclick(gp.x, gp.y);
  await page.keyboard.up('Control');
  o = await orders();
  c.check('6d Ctrl + right-click issues attack-move', o.every((t) => t === 'attackMove'), o.join(','));
  await frames(page, 2);
  await page.click('[data-testid="cmd-stop"]');
  o = await orders();
  c.check('6e command card Stop', o.every((t) => t === 'idle'), o.join(','));
  await page.click('[data-testid="cmd-hold"]');
  o = await orders();
  c.check('6f command card Hold', o.every((t) => t === 'hold'), o.join(','));
  await page.click('[data-testid="cmd-attackMove"]');
  await page.mouse.click(gp.x, gp.y);
  o = await orders();
  c.check('6g command card Attack-Move then click', o.every((t) => t === 'attackMove'), o.join(','));
  await page.keyboard.press('KeyS');
  await page.evaluate((id) => {
    const w = window.__game.world;
    const e = w.units.find((u) => u.id === id);
    if (e) w.kill(e, null, 0);
  }, foe);

  // ---- 8. control groups, F1, F2, Esc (before the harvester test moves things around)
  await page.keyboard.press('F2');
  const grp = await ids();
  await page.keyboard.press('Control+1');
  await page.keyboard.press('Escape');
  const cleared = (await ids()).length;
  await page.keyboard.press('1');
  c.check('8a Ctrl+1 assigns, Esc clears, 1 recalls the same units', cleared === 0 && JSON.stringify(await ids()) === JSON.stringify(grp), `${grp.length} units`);
  await look(page, 120, 120);
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await frames(page, 6);
  const camAfter = await page.evaluate(() => {
    const g = window.__game;
    const s = g.input.selection;
    const cx = s.reduce((a, u) => a + u.x, 0) / s.length;
    const cz = s.reduce((a, u) => a + u.z, 0) / s.length;
    return Math.hypot(g.renderer.cam.focusX - cx, g.renderer.cam.focusZ - cz);
  });
  c.check('8b double-tapping the group number centres the camera on it', camAfter < 6, `off by ${camAfter.toFixed(1)}`);
  await page.keyboard.press('F1');
  sel = await ids();
  c.check('8c F1 selects the hero', sel.length === 1 && sel[0] === stage.heroId, sel);
  await page.keyboard.press('F2');
  const f2 = await page.evaluate(() => window.__game.input.selection.map((u) => u.def.id));
  c.check('8d F2 selects the whole army without harvesters', f2.length >= 5 && !f2.includes('harvester'), f2.join(','));

  // ---- 7. harvester: right-click a crystal, then full harvest cycle with a refinery
  const hv = await page.evaluate((id) => {
    const g = window.__game;
    const w = g.world;
    const u = w.units.find((x) => x.id === id);
    let best = null;
    let bd = 1e9;
    for (const n of w.nodes) {
      const d = Math.hypot(n.x - u.x, n.z - u.z);
      if (d < bd) { bd = d; best = n; }
    }
    // put a refinery down next to the HQ (instant), like the player would have by now
    const def = g.defs.buildings.refinery;
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    let placed = false;
    for (let r = 4; r < 20 && !placed; r++) {
      for (let oz = -r; oz <= r && !placed; oz++) {
        for (let ox = -r; ox <= r && !placed; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          const cx = hq.cx + ox;
          const cz = hq.cz + oz;
          if (w.nav.rectFree(cx - 1, cz - 1, def.w + 2, def.h + 2) && w.canPlace(def, 0, cx, cz) === '') {
            w.placeBuilding(def, 0, cx, cz, true);
            placed = true;
          }
        }
      }
    }
    w.recount();
    return { nodeId: best.id, nx: best.x, nz: best.z, ux: u.x, uz: u.z, placed };
  }, harvId);
  await look(page, (hv.nx + hv.ux) / 2, (hv.nz + hv.uz) / 2);
  sp = await screenOf(page, harvId);
  await page.mouse.click(sp.x, sp.y);
  c.check('7a clicking the harvester selects it', JSON.stringify(await ids()) === JSON.stringify([harvId]));
  sp = await screenOf(page, hv.nodeId);
  await rclick(sp.x, sp.y);
  const ho = await page.evaluate(() => {
    const u = window.__game.input.selection[0];
    return { t: u.order.type, node: u.hNode?.id };
  });
  c.check('7b right-click a crystal orders it to harvest that crystal', ho.t === 'harvest' && ho.node === hv.nodeId, ho);
  const before = await page.evaluate(() => window.__game.world.players[0].stats.harvested);
  const states = new Set();
  for (let i = 0; i < 16; i++) {
    await sim(page, 5);
    states.add(await page.evaluate((id) => window.__game.world.units.find((u) => u.id === id)?.hState, harvId));
  }
  const after = await page.evaluate(() => window.__game.world.players[0].stats.harvested);
  c.check('7c the harvester mines, returns and unloads (credits delivered)', hv.placed && after > before, `harvested ${before} -> ${after}, states ${[...states].join('/')}`);

  // ---- 9. rally point
  const br = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const def = g.defs.buildings.barracks;
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    for (let r = 4; r < 22; r++) {
      for (let oz = -r; oz <= r; oz++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          const cx = hq.cx + ox;
          const cz = hq.cz + oz;
          if (w.nav.rectFree(cx - 2, cz - 2, def.w + 4, def.h + 4) && w.canPlace(def, 0, cx, cz) === '') {
            const b = w.placeBuilding(def, 0, cx, cz, true);
            w.recount();
            return { id: b.id, x: b.x, z: b.z, rx: b.rallyX, rz: b.rallyZ };
          }
        }
      }
    }
    return null;
  });
  await look(page, br.x, br.z);
  sp = await screenOf(page, br.id);
  await page.mouse.click(sp.x, sp.y);
  c.check('9a clicking a building selects it', JSON.stringify(await ids()) === JSON.stringify([br.id]));
  const rp = await page.evaluate(([bx, bz]) => {
    const g = window.__game;
    const w = g.world;
    for (let a = 0; a < 6.28; a += 0.5) {
      const x = bx + Math.cos(a) * 13;
      const z = bz + Math.sin(a) * 13;
      if (w.nav.blockedAt(x, z) || w.units.some((u) => Math.hypot(u.x - x, u.z - z) < 4)) continue;
      const s = g.renderer.cam.project(x, 0, z, { x: 0, y: 0, w: 0 });
      if (s.x > 300 && s.x < 1300 && s.y > 80 && s.y < 720) return { x, z, sx: s.x, sy: s.y };
    }
    return null;
  }, [br.x, br.z]);
  await rclick(rp.sx, rp.sy);
  const rally = await page.evaluate((id) => {
    const b = window.__game.world.buildings.find((x) => x.id === id);
    return { x: b.rallyX, z: b.rallyZ };
  }, br.id);
  c.check('9b right-click with a production building selected moves its rally point', Math.hypot(rally.x - rp.x, rally.z - rp.z) < 1.5, rally);
  await page.evaluate(() => {
    const w = window.__game.world;
    w.players[0].credits += 2000;
    w.enqueue(0, 'infantry', 'trooper');
  });
  await sim(page, 12);
  const atRally = await page.evaluate(([x, z]) => window.__game.world.units.filter((u) => u.team === 0 && u.def.id === 'trooper' && Math.hypot(u.x - x, u.z - z) < 6).length, [rp.x, rp.z]);
  c.check('9c a newly trained unit walks to the rally point', atRally >= 1, `${atRally} trooper(s) at rally`);

  // ---- 10. camera + minimap
  await page.keyboard.press('Escape');
  const cam0 = await page.evaluate(() => ({ ...['focusX', 'focusZ', 'dist', 'yaw'].reduce((a, k) => ({ ...a, [k]: window.__game.renderer.cam[k] }), {}) }));
  await page.mouse.move(800, 400);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await frames(page, 5);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');
  await frames(page, 3);
  const cam1 = await page.evaluate(() => ({ x: window.__game.renderer.cam.focusX, z: window.__game.renderer.cam.focusZ }));
  c.check('10a arrow keys pan the camera', cam1.x > cam0.focusX + 1 && cam1.z > cam0.focusZ + 1, `dx ${(cam1.x - cam0.focusX).toFixed(1)} dz ${(cam1.z - cam0.focusZ).toFixed(1)}`);
  await page.mouse.wheel(0, 600);
  await frames(page, 6);
  const d1 = await page.evaluate(() => window.__game.renderer.cam.dist);
  await page.mouse.wheel(0, -900);
  await frames(page, 6);
  const d2 = await page.evaluate(() => window.__game.renderer.cam.dist);
  c.check('10b mouse wheel zooms out and in', d1 > cam0.dist + 3 && d2 < d1 - 3, `${cam0.dist.toFixed(0)} -> ${d1.toFixed(0)} -> ${d2.toFixed(0)}`);
  await page.keyboard.down('BracketRight');
  await frames(page, 5);
  await page.keyboard.up('BracketRight');
  const yaw1 = await page.evaluate(() => window.__game.renderer.cam.yaw);
  await page.keyboard.press('Backspace');
  const yaw2 = await page.evaluate(() => window.__game.renderer.cam.yaw);
  c.check('10c ] rotates the camera and Backspace resets it', Math.abs(yaw1) > 0.05 && yaw2 === 0, `yaw ${yaw1.toFixed(2)} -> ${yaw2}`);
  await look(page, 120, 120);
  await page.keyboard.press('KeyB');
  await frames(page, 8);
  const toHq = await page.evaluate(() => {
    const g = window.__game;
    const hq = g.world.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    return Math.hypot(g.renderer.cam.focusX - hq.x, g.renderer.cam.focusZ - hq.z);
  });
  c.check('10d B jumps to the Command Center', toHq < 4, `off by ${toHq.toFixed(1)}`);
  const mm = await page.evaluate(() => {
    const r = document.querySelector('canvas.minimap').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  await page.mouse.click(mm.x + mm.w * 0.5, mm.y + mm.h * 0.5);
  await frames(page, 8);
  const mid = await page.evaluate(() => ({ x: window.__game.renderer.cam.focusX, z: window.__game.renderer.cam.focusZ }));
  c.check('10e minimap left-click moves the camera there', Math.hypot(mid.x - 120, mid.z - 120) < 6, mid);
  await page.keyboard.press('F2');
  await page.mouse.click(mm.x + mm.w * 0.3, mm.y + mm.h * 0.62, { button: 'right' });
  const mmOrder = await page.evaluate(() => window.__game.input.selection.map((u) => ({ t: u.order.type, x: u.order.x, z: u.order.z })));
  c.check('10f minimap right-click issues a move order to that map position', mmOrder.every((m) => m.t === 'move' && Math.hypot(m.x - 72, m.z - 91) < 14), mmOrder[0]);
  await page.keyboard.press('KeyS');
  await page.evaluate(() => {
    window.__game.hud.notify('Test alert', 'bad', 200, 60);
  });
  await page.keyboard.press('Space');
  await frames(page, 8);
  const sp2 = await page.evaluate(() => ({ x: window.__game.renderer.cam.focusX, z: window.__game.renderer.cam.focusZ }));
  c.check('10g Space jumps to the last alert location', Math.hypot(sp2.x - 200, sp2.z - 60) < 6, sp2);
  await page.keyboard.press('KeyB');
  await frames(page, 6);

  // ---- 11. Esc ladder, pause, manual
  await page.keyboard.press('F2');
  await page.keyboard.press('KeyA');
  await page.keyboard.press('Escape');
  const e1 = await page.evaluate(() => ({ t: window.__game.input.targeting, n: window.__game.input.selection.length, p: window.__game.paused }));
  await page.keyboard.press('Escape');
  const e2 = await page.evaluate(() => ({ n: window.__game.input.selection.length, p: window.__game.paused }));
  await page.keyboard.press('Escape');
  const e3 = await page.evaluate(() => window.__game.paused);
  c.check('11a Esc cancels targeting, then clears selection, then opens the pause menu', e1.t === null && e1.n > 0 && !e1.p && e2.n === 0 && !e2.p && e3 === true, { e1, e2, e3 });
  const t0 = await page.evaluate(() => window.__game.world.time);
  await frames(page, 4);
  const t1 = await page.evaluate(() => window.__game.world.time);
  c.check('11b the simulation is frozen while paused', t1 === t0, `${t0.toFixed(2)} -> ${t1.toFixed(2)}`);
  await page.keyboard.press('Escape');
  c.check('11c Esc resumes', (await page.evaluate(() => window.__game.paused)) === false);
  await page.keyboard.press('KeyP');
  const p1 = await page.evaluate(() => window.__game.paused);
  await page.keyboard.press('KeyP');
  const p2 = await page.evaluate(() => window.__game.paused);
  c.check('11d P toggles pause', p1 === true && p2 === false);
  await page.keyboard.press('Slash');
  const helpOpen = await page.evaluate(() => !!document.querySelector('.help'));
  await page.click('[data-testid="btn-help-close"]');
  const helpClosed = await page.evaluate(() => !document.querySelector('.help'));
  c.check('11e / opens the field manual and it closes again', helpOpen && helpClosed);

  // ---- 12. selecting enemy units and neutral buildings
  const en = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const h = w.players[0].hero;
    const e = w.spawnUnit('tank', 1, h.x + 10, h.z - 8);
    e.aiRole = 'dummy';
    e.setOrder({ type: 'hold', x: 0, z: 0, target: null, ability: -1 });
    e.hp = e.maxHp = 9000;
    for (const u of w.units) if (u.team === 0) u.setOrder({ type: 'hold', x: 0, z: 0, target: null, ability: -1 });
    w.updateFog();
    return { id: e.id, x: e.x, z: e.z };
  });
  await look(page, en.x, en.z);
  sp = await screenOf(page, en.id);
  await page.mouse.click(sp.x, sp.y);
  await frames(page, 3);
  const enSel = await page.evaluate(() => ({ team: window.__game.input.selection[0]?.team, text: document.querySelector('.selection').textContent }));
  c.check('12a clicking an enemy unit selects it and shows its card', enSel.team === 1 && enSel.text.includes('Mauler Tank'), enSel.text.slice(0, 60));
  const gp2 = await project(page, en.x + 8, en.z + 6);
  await rclick(gp2.x, gp2.y);
  const enOrder = await page.evaluate((id) => window.__game.world.units.find((u) => u.id === id).order.type, en.id);
  c.check('12b right-click cannot command an enemy unit', enOrder === 'hold', enOrder);
  await page.evaluate((id) => {
    const w = window.__game.world;
    w.kill(w.units.find((u) => u.id === id), null, 0);
  }, en.id);
  const ex = await page.evaluate(() => {
    const b = window.__game.world.buildings.find((x) => x.def.id === 'extractor');
    return { id: b.id, x: b.x, z: b.z };
  });
  await look(page, ex.x, ex.z);
  sp = await screenOf(page, ex.id);
  await page.mouse.click(sp.x, sp.y);
  await frames(page, 3);
  const exSel = await page.evaluate(() => ({ id: window.__game.input.selection[0]?.id, text: document.querySelector('.selection').textContent }));
  c.check('12c clicking a neutral outpost selects it and shows its card', exSel.id === ex.id && exSel.text.includes('Aurium Extractor'), exSel.text.slice(0, 70));

  // ---- 13. long group move across the map (ordered through the minimap)
  const bigGroup = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    const types = ['tank', 'tank', 'titan', 'buggy', 'artillery', 'trooper', 'lancer', 'grenadier', 'tank', 'buggy', 'trooper', 'tank'];
    const made = types.map((t, i) => w.spawnUnit(t, 0, hq.x + 14 + (i % 4) * 3.2, hq.z + 14 + Math.floor(i / 4) * 3.2));
    g.input.select(made);
    return made.map((u) => u.id);
  });
  await page.mouse.click(mm.x + mm.w * 0.5, mm.y + mm.h * 0.5, { button: 'right' });
  await sim(page, 45);
  const march = await page.evaluate((list) => {
    const w = window.__game.world;
    const us = list.map((id) => w.units.find((u) => u.id === id)).filter(Boolean);
    return { alive: us.length, near: us.filter((u) => Math.hypot(u.x - 120, u.z - 120) < 15).length, moving: us.filter((u) => u.order.type === 'move').length };
  }, bigGroup);
  c.check('13 a 12-unit mixed group crosses ~90 units of terrain and arrives', march.near >= march.alive - 1 && march.moving === 0, march);

  // ---- 14. gunship and hero commands
  const air = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const h = w.players[0].hero;
    for (const u of w.units) if (u.team === 0) u.setOrder({ type: 'hold', x: 0, z: 0, target: null, ability: -1 });
    const gs = w.spawnUnit('gunship', 0, h.x + 8, h.z + 8);
    return { id: gs.id, x: gs.x, z: gs.z, hx: h.x, hz: h.z };
  });
  await look(page, air.x, air.z);
  sp = await screenOf(page, air.id);
  await page.mouse.click(sp.x, sp.y);
  c.check('14a clicking a flying unit selects it', JSON.stringify(await ids()) === JSON.stringify([air.id]));
  const dest = await project(page, air.x + 14, air.z + 4);
  await rclick(dest.x, dest.y);
  await sim(page, 5);
  const gpos = await page.evaluate(([id, x, z]) => {
    const u = window.__game.world.units.find((v) => v.id === id);
    return { d: Math.hypot(u.x - x, u.z - z), t: u.order.type };
  }, [air.id, air.x + 14, air.z + 4]);
  c.check('14b gunship flies to a right-clicked point', gpos.d < 3 && gpos.t === 'idle', gpos);
  const foe2 = await page.evaluate((id) => {
    const g = window.__game;
    const w = g.world;
    const u = w.units.find((v) => v.id === id);
    const e = w.spawnUnit('tank', 1, u.x + 6, u.z - 9);
    e.aiRole = 'dummy';
    e.setOrder({ type: 'hold', x: 0, z: 0, target: null, ability: -1 });
    e.hp = e.maxHp = 6000;
    w.updateFog();
    return e.id;
  }, air.id);
  await frames(page, 2);
  sp = await screenOf(page, foe2);
  await rclick(sp.x, sp.y);
  await sim(page, 6);
  const foe2Hp = await page.evaluate((id) => window.__game.world.units.find((u) => u.id === id)?.hp, foe2);
  c.check('14c gunship attacks a right-clicked enemy', foe2Hp < 6000, `hp ${Math.round(foe2Hp)}`);
  await page.keyboard.press('F1');
  await look(page, air.hx, air.hz);
  const hd = await page.evaluate(() => {
    const g = window.__game;
    const h = g.world.players[0].hero;
    h.setOrder({ type: 'idle', x: 0, z: 0, target: null, ability: -1 });
    for (let a = 0; a < 6.28; a += 0.5) {
      const x = h.x + Math.cos(a) * 12;
      const z = h.z + Math.sin(a) * 12;
      if (g.world.nav.blockedAt(x, z)) continue;
      const s = g.renderer.cam.project(x, 0, z, { x: 0, y: 0, w: 0 });
      if (s.x > 300 && s.x < 1300 && s.y > 80 && s.y < 720 && !g.world.units.some((u) => Math.hypot(u.x - x, u.z - z) < 4)) return { x, z, sx: s.x, sy: s.y };
    }
    return null;
  });
  await rclick(hd.sx, hd.sy);
  await sim(page, 6);
  const hpos = await page.evaluate(([x, z]) => {
    const h = window.__game.world.players[0].hero;
    return { d: Math.hypot(h.x - x, h.z - z), t: h.order.type };
  }, [hd.x, hd.z]);
  c.check('14d hero moves to a right-clicked point', hpos.d < 3 && hpos.t === 'idle', hpos);
  await page.keyboard.press('KeyA');
  await page.mouse.click(hd.sx, hd.sy + 60);
  c.check('14e hero accepts attack-move', (await orders())[0] === 'attackMove');
  await page.keyboard.press('KeyH');
  c.check('14f hero accepts hold', (await orders())[0] === 'hold');
} catch (err) {
  c.check(`suite aborted: ${err.message.split('\n')[0]}`, false);
}

const fe = await frameErrors(page).catch(() => []);
await browser.close();
await close();
process.exit(c.finish(problems, fe));
