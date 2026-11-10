// Verification suite: main menu, every HUD button, construction and production queues.
// All interaction goes through real DOM clicks / canvas mouse events.
//   node scripts/verify/hud.mjs            (starts its own dev server)
//   URL=http://localhost:5173/ node scripts/verify/hud.mjs
import { Checker, findSite, frameErrors, frames, launch, look, openMatch, project, screenOf, serve, sim } from './lib.mjs';

const { base, close } = await serve(5192);
const { browser, page, problems } = await launch();
const c = new Checker('hud');
const P = () => page.evaluate(() => {
  const p = window.__game.world.players[0];
  return { credits: p.credits, made: p.powerMade, used: p.powerUsed, low: p.lowPower, req: p.req };
});
const lastNotice = () => page.evaluate(() => [...document.querySelectorAll('.notice')].pop()?.textContent ?? '');
const waitGame = () => page.waitForFunction(() => window.__game && window.__game.frames > 3 && !window.__game.world.result, null, { timeout: 240000 });
const lookHq = async () => {
  const hq = await page.evaluate(() => {
    const b = window.__game.world.buildings.find((x) => x.team === 0 && x.def.id === 'hq');
    return { x: b.x, z: b.z };
  });
  await look(page, hq.x + 8, hq.z + 6);
};

/** Build a structure through the sidebar and place it with the mouse. */
async function buildStructure(tab, id) {
  const kind = tab === 'defense' ? 'defense' : 'structure';
  await page.click(`[data-testid="tab-${tab}"]`);
  await page.click(`[data-testid="build-${id}"]`);
  for (let i = 0; i < 80; i++) {
    await sim(page, 1);
    if (await page.evaluate((k) => window.__game.world.players[0].queues[k].ready, kind)) break;
  }
  await frames(page, 2);
  await page.click(`[data-testid="build-${id}"]`);
  if (!(await page.evaluate(() => !!window.__game.input.placing))) return false;
  const site = await findSite(page, id);
  if (!site) return false;
  await page.mouse.move(site.x, site.y);
  await frames(page, 1);
  await page.mouse.click(site.x, site.y);
  await sim(page, 2.5);
  return page.evaluate((b) => window.__game.world.buildings.some((x) => x.team === 0 && x.def.id === b && x.rise >= 1), id);
}

try {
  // ================================================================ 1. main menu
  await page.goto(base);
  await page.waitForSelector('[data-testid="btn-start"]', { timeout: 120000 });
  const menuButtons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.dataset.testid ?? b.textContent.trim().slice(0, 20)));
  c.check('1a main menu lists hero, difficulty, battlefield, settings and action buttons', menuButtons.length === 12, menuButtons.join(' '));
  for (const id of ['hero-rook', 'hero-kade', 'hero-nyx', 'difficulty-normal', 'difficulty-hard', 'difficulty-easy', 'theme-verdant', 'theme-scorched', 'theme-frost']) {
    await page.click(`[data-testid="${id}"]`);
    const active = await page.evaluate((t) => document.querySelector(`[data-testid="${t}"]`).classList.contains('active'), id);
    c.check(`1b menu option ${id} becomes active`, active);
  }
  await page.click('[data-testid="btn-howto"]');
  const manual = await page.evaluate(() => document.querySelector('.help')?.textContent.includes('Field Manual'));
  await page.click('[data-testid="btn-help-close"]');
  c.check('1c How to play opens the field manual and closes', manual && (await page.evaluate(() => !document.querySelector('.help'))));
  await page.click('[data-testid="btn-start"]');
  await waitGame();
  const cfg = await page.evaluate(() => window.__game.config);
  c.check('1d Deploy starts a match with the chosen hero / difficulty / battlefield', cfg.hero === 'nyx' && cfg.difficulty === 'easy' && cfg.theme === 'frost', cfg);

  const hudButtons = await page.evaluate(() => [...document.querySelectorAll('.hud button')].map((b) => b.dataset.testid ?? `?${b.className}`));
  c.check('1e every HUD button carries a test id', hudButtons.every((t) => !t.startsWith('?')), `${hudButtons.length} buttons`);

  // ================================================================ 10. objectives + tooltips
  for (const sel of ['[data-testid="build-power"]', '[data-testid="power-lance"]', '[data-testid="ability-2"]', '[data-testid="hero-portrait"]', '.res.power']) {
    await page.hover(sel);
    await frames(page, 2);
    const tip = await page.evaluate(() => {
      const t = document.querySelector('.tooltip');
      return t.classList.contains('show') ? t.textContent.slice(0, 40) : '';
    });
    c.check(`10a tooltip appears on ${sel}`, tip.length > 5, tip);
  }
  await page.mouse.move(800, 400);
  await page.click('[data-testid="objectives-close"]');
  c.check('10b objectives panel closes', await page.evaluate(() => !document.querySelector('.objectives')));

  // ================================================================ 2. top bar, pause menu, settings
  await page.click('[data-testid="btn-help"]');
  const h1 = await page.evaluate(() => !!document.querySelector('.help'));
  await page.click('[data-testid="btn-help-close"]');
  c.check('2a top-bar help button opens the manual', h1 && (await page.evaluate(() => !document.querySelector('.help'))));
  await page.click('[data-testid="btn-menu"]');
  c.check('2b top-bar menu button pauses the match', await page.evaluate(() => window.__game.paused));
  for (const key of ['sfx', 'music']) {
    const v0 = await page.evaluate((k) => window.__game.settings[k], key);
    await page.focus(`[data-testid="set-${key}"]`);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    const v1 = await page.evaluate((k) => ({ s: window.__game.settings[k], a: window.__game.audio.settings[k] }), key);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    const v2 = await page.evaluate((k) => window.__game.settings[k], key);
    c.check(`2c ${key} volume slider changes the setting and the audio engine`, Math.abs(v1.s - (v0 - 0.2)) < 0.001 && v1.a === v1.s && Math.abs(v2 - v0) < 0.001, `${v0} -> ${v1.s} -> ${v2}`);
  }
  for (const key of ['voice', 'shadows', 'bloom', 'edgeScroll']) {
    const v0 = await page.evaluate((k) => window.__game.settings[k], key);
    await page.click(`[data-testid="set-${key}"]`);
    await frames(page, 2);
    const v1 = await page.evaluate((k) => window.__game.settings[k], key);
    await page.click(`[data-testid="set-${key}"]`);
    await frames(page, 2);
    const v2 = await page.evaluate((k) => window.__game.settings[k], key);
    c.check(`2d ${key} toggle flips and restores`, v1 === !v0 && v2 === v0);
  }
  c.check('2e shadow setting reaches the renderer', await page.evaluate(() => window.__game.renderer.shadowsEnabled === window.__game.settings.shadows));
  await page.click('[data-testid="btn-controls"]');
  const h2 = await page.evaluate(() => !!document.querySelector('.help'));
  await page.click('[data-testid="btn-help-close"]');
  c.check('2f pause-menu Controls button opens the manual on top', h2 && (await page.evaluate(() => window.__game.paused)));
  await page.click('[data-testid="btn-resume"]');
  c.check('2g Resume unpauses', await page.evaluate(() => !window.__game.paused));

  // ================================================================ 3. sidebar: every tab + button
  const tabs = { structure: ['power', 'refinery', 'barracks', 'factory', 'airpad', 'techlab'], defense: ['sentry', 'cannon', 'arc'], infantry: ['trooper', 'grenadier', 'lancer'], vehicle: ['harvester', 'buggy', 'tank', 'artillery', 'titan'], air: ['gunship'], tech: ['ap_rounds', 'plating', 'turbo', 'nanites'] };
  let locked = 0;
  let listed = 0;
  for (const [tab, items] of Object.entries(tabs)) {
    await page.click(`[data-testid="tab-${tab}"]`);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.grid .build')].map((b) => b.dataset.testid.replace('build-', '')));
    listed += shown.length;
    c.check(`3a tab ${tab} lists its items`, JSON.stringify(shown) === JSON.stringify(items), shown.join(','));
    for (const id of items) {
      if (id === 'power') continue;
      await page.click(`[data-testid="build-${id}"]`);
      await frames(page, 1);
      const note = await lastNotice();
      if (/Requires/.test(note)) locked++;
    }
  }
  const queuedNothing = await page.evaluate(() => Object.values(window.__game.world.players[0].queues).every((q) => q.items.length === 0));
  c.check('3b with only a Command Center every other item is refused with a "Requires …" notice', locked === 21 && queuedNothing, `${locked}/21 refused of ${listed} buttons`);
  await page.click('[data-testid="tab-structure"]');
  await page.click('[data-testid="build-power"]');
  await sim(page, 3);
  await frames(page, 3);
  const mid = await page.evaluate(() => {
    const q = window.__game.world.players[0].queues.structure;
    return { progress: q.items[0]?.progress, paid: q.items[0]?.paid, credits: window.__game.world.players[0].credits, cls: document.querySelector('[data-testid="build-power"]').className };
  });
  c.check('3c a queued structure shows progress and drains credits gradually', mid.progress > 0.2 && mid.progress < 1 && Math.abs(mid.credits + mid.paid - 5000) < 1 && mid.cls.includes('active'), `progress ${mid.progress?.toFixed(2)}, paid ${Math.round(mid.paid)}`);
  await page.click('[data-testid="build-power"]', { button: 'right' });
  const afterCancel = await page.evaluate(() => ({ n: window.__game.world.players[0].queues.structure.items.length, credits: window.__game.world.players[0].credits }));
  c.check('3d right-click cancels and refunds in full', afterCancel.n === 0 && Math.abs(afterCancel.credits - 5000) < 1, afterCancel);

  // ================================================================ 4. full base through the UI
  await lookHq();
  const powerLog = [];
  const order = [['structure', 'power'], ['structure', 'refinery'], ['structure', 'barracks'], ['structure', 'factory'], ['structure', 'power'], ['structure', 'techlab'], ['structure', 'airpad'], ['structure', 'power'], ['defense', 'sentry'], ['defense', 'cannon'], ['defense', 'arc']];
  let i = 0;
  for (const [tab, id] of order) {
    if (i === 2) await page.evaluate(() => (window.__game.world.players[0].credits += 60000));
    const ok = await buildStructure(tab, id);
    const p = await P();
    powerLog.push(`${id}:${p.made}/${p.used}`);
    c.check(`4a build + place ${id} via sidebar`, ok, `power ${p.made}/${p.used}`);
    i++;
  }
  const counts = await page.evaluate(() => window.__game.world.players[0].buildingCounts);
  c.check('4b the finished base has every structure', counts.power === 3 && counts.refinery === 1 && counts.barracks === 1 && counts.factory === 1 && counts.techlab === 1 && counts.airpad === 1 && counts.sentry === 1 && counts.cannon === 1 && counts.arc === 1, counts);
  const p4 = await P();
  c.check('4c power accounting matches the building list', p4.made === 340 && p4.used === 315 && !p4.low, powerLog.join(' '));
  c.check('4d the refinery delivered a free harvester', await page.evaluate(() => window.__game.world.units.filter((u) => u.team === 0 && u.def.harvester).length === 1));

  // ================================================================ 5. every unit + every upgrade
  const unitIds = [...tabs.infantry.map((u) => ['infantry', u]), ...tabs.vehicle.map((u) => ['vehicle', u]), ['air', 'gunship']];
  for (const [tab, id] of unitIds) {
    await page.click(`[data-testid="tab-${tab}"]`);
    await page.click(`[data-testid="build-${id}"]`);
  }
  await page.click('[data-testid="tab-tech"]');
  for (const id of tabs.tech) await page.click(`[data-testid="build-${id}"]`);
  const queued = await page.evaluate(() => Object.fromEntries(Object.entries(window.__game.world.players[0].queues).map(([k, q]) => [k, q.items.length])));
  c.check('5a every unit type and upgrade is accepted into its queue', queued.infantry === 3 && queued.vehicle === 5 && queued.air === 1 && queued.tech === 4, queued);
  for (let t = 0; t < 40; t++) {
    await sim(page, 5);
    if (await page.evaluate(() => Object.values(window.__game.world.players[0].queues).every((q) => q.items.length === 0))) break;
  }
  await frames(page, 2);
  const made = await page.evaluate(() => {
    const out = {};
    for (const u of window.__game.world.units) if (u.team === 0) out[u.def.id] = (out[u.def.id] ?? 0) + 1;
    return out;
  });
  c.check('5b one of every unit type rolled out', ['trooper', 'grenadier', 'lancer', 'buggy', 'tank', 'artillery', 'titan', 'gunship'].every((id) => made[id] >= 1) && made.harvester >= 2, made);
  const ups = await page.evaluate(() => [...window.__game.world.players[0].upgrades].sort());
  c.check('5c all four upgrades researched', ups.length === 4, ups.join(','));
  const doneCls = await page.evaluate(() => [...document.querySelectorAll('.grid .build')].every((b) => b.classList.contains('owned')));
  c.check('5d research buttons show as done', doneCls);
  c.check('5e harvesters have delivered credits', await page.evaluate(() => window.__game.world.players[0].stats.harvested > 0), await page.evaluate(() => window.__game.world.players[0].stats.harvested));
  // unit-queue cancel with a partial refund
  await page.click('[data-testid="tab-vehicle"]');
  const c0 = (await P()).credits;
  await page.click('[data-testid="build-titan"]');
  await page.click('[data-testid="build-titan"]');
  await sim(page, 4);
  const paid = await page.evaluate(() => window.__game.world.players[0].queues.vehicle.items.map((x) => x.paid));
  await page.click('[data-testid="build-titan"]', { button: 'right' });
  await page.click('[data-testid="build-titan"]', { button: 'right' });
  const c1 = (await P()).credits;
  const leftover = await page.evaluate(() => window.__game.world.players[0].queues.vehicle.items.length);
  const income = await page.evaluate(() => window.__game.world.players[0].stats.harvested);
  c.check('5f cancelling queued units refunds what was paid', leftover === 0 && paid[0] > 100 && c1 >= c0 - 1, `paid ${Math.round(paid[0])}, credits ${Math.round(c0)} -> ${Math.round(c1)} (harvest income continues: ${income})`);

  // ================================================================ 6. low power
  const reactor = await page.evaluate(() => window.__game.world.buildings.find((b) => b.team === 0 && b.def.id === 'power').id);
  let sp = await screenOf(page, reactor);
  if (!(sp.x > 280 && sp.x < 1330 && sp.y > 60 && sp.y < 740)) {
    const r = await page.evaluate((id) => {
      const b = window.__game.world.buildings.find((x) => x.id === id);
      return { x: b.x, z: b.z };
    }, reactor);
    await look(page, r.x, r.z);
    sp = await screenOf(page, reactor);
  }
  await page.mouse.click(sp.x, sp.y);
  await frames(page, 2);
  const credBefore = (await P()).credits;
  await page.click('[data-testid="cmd-sell"]');
  await sim(page, 1);
  await frames(page, 3);
  const low = await page.evaluate(() => {
    const w = window.__game.world;
    const p = w.players[0];
    return { low: p.lowPower, made: p.powerMade, used: p.powerUsed, arcOffline: w.buildings.find((b) => b.team === 0 && b.def.id === 'arc').offline, credits: p.credits, hudLow: document.querySelector('.res.power').classList.contains('low') };
  });
  c.check('6a selling a reactor refunds credits', low.credits > credBefore + 200, `${Math.round(credBefore)} -> ${Math.round(low.credits)}`);
  c.check('6b demand above supply triggers low power, the HUD warning and Arc Pylon shutdown', low.low && low.arcOffline && low.hudLow && low.made === 240 && low.used === 315, low);
  await lookHq();
  const rebuilt = await buildStructure('structure', 'power');
  await sim(page, 1);
  const ok6 = await page.evaluate(() => {
    const w = window.__game.world;
    return { low: w.players[0].lowPower, arcOffline: w.buildings.find((b) => b.team === 0 && b.def.id === 'arc').offline };
  });
  c.check('6c rebuilding the reactor restores power', rebuilt && !ok6.low && !ok6.arcOffline, ok6);

  // ================================================================ 7. building command card
  const second = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const def = g.defs.buildings.barracks;
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    for (let r = 5; r < 26; r++) {
      for (let oz = -r; oz <= r; oz++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          const cx = hq.cx + ox;
          const cz = hq.cz + oz;
          if (w.nav.rectFree(cx - 1, cz - 1, def.w + 2, def.h + 2) && w.canPlace(def, 0, cx, cz) === '') {
            const b = w.placeBuilding(def, 0, cx, cz, true);
            w.recount();
            b.hp = b.maxHp * 0.5;
            return { id: b.id, x: b.x, z: b.z };
          }
        }
      }
    }
    return null;
  });
  await look(page, second.x, second.z);
  sp = await screenOf(page, second.id);
  await page.mouse.click(sp.x, sp.y);
  await frames(page, 2);
  const cmdButtons = await page.evaluate(() => [...document.querySelectorAll('.cmds .cmd')].map((b) => b.dataset.testid));
  c.check('7a a selected production building offers Repair, Primary and Sell', JSON.stringify(cmdButtons) === JSON.stringify(['cmd-repair', 'cmd-primary', 'cmd-sell']), cmdButtons.join(','));
  await page.click('[data-testid="cmd-repair"]');
  await sim(page, 3);
  const rep = await page.evaluate((id) => {
    const b = window.__game.world.buildings.find((x) => x.id === id);
    return b.hp / b.maxHp;
  }, second.id);
  c.check('7b Repair restores hit points', rep > 0.6, `hp ${(rep * 100).toFixed(0)}%`);
  await page.click('[data-testid="cmd-primary"]');
  const prim = await page.evaluate((id) => window.__game.world.buildings.filter((b) => b.team === 0 && b.def.id === 'barracks').map((b) => `${b.id === id ? 'new' : 'old'}:${b.primary}`), second.id);
  c.check('7c Primary moves the primary flag to this building', prim.includes('new:true') && prim.includes('old:false'), prim.join(' '));
  const cs0 = (await P()).credits;
  await page.click('[data-testid="cmd-sell"]');
  const sold = await page.evaluate((id) => !window.__game.world.buildings.some((b) => b.id === id && b.alive), second.id);
  c.check('7d Sell removes the building and refunds', sold && (await P()).credits > cs0, `+${Math.round((await P()).credits - cs0)}`);

  // ================================================================ 8. support powers
  await lookHq();
  await page.evaluate(() => (window.__game.world.players[0].req = 5));
  await frames(page, 3);
  const pc0 = (await P()).credits;
  await page.click('[data-testid="power-cache"]');
  const pc1 = await P();
  c.check('8a Supply Cache adds 800 credits and spends one token', Math.abs(pc1.credits - pc0 - 800) < 30 && pc1.req < 4.1, `+${Math.round(pc1.credits - pc0)}, req ${pc1.req.toFixed(2)}`);
  const ground = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    for (let r = 16; r < 34; r += 2) {
      for (let a = 0; a < 6.28; a += 0.35) {
        const x = hq.x + Math.cos(a) * r;
        const z = hq.z + Math.sin(a) * r;
        if (w.nav.blockedAt(x, z) || !w.fog.isExplored(x, z)) continue;
        if (w.buildings.some((b) => b.contains(x, z, 5)) || w.units.some((u) => Math.hypot(u.x - x, u.z - z) < 5)) continue;
        const s = g.renderer.cam.project(x, 0, z, { x: 0, y: 0, w: 0 });
        if (s.x > 300 && s.x < 1300 && s.y > 80 && s.y < 720) return { x, z, sx: s.x, sy: s.y };
      }
    }
    return null;
  });
  for (const id of ['recon', 'drop', 'lance']) {
    if (id === 'lance') await page.evaluate(() => (window.__game.world.players[0].req = 3.2));
    const unitsBefore = await page.evaluate(() => window.__game.world.units.filter((u) => u.team === 0).length);
    await page.click(`[data-testid="power-${id}"]`);
    const armed = await page.evaluate(() => window.__game.input.targeting?.type === 'power');
    await page.mouse.move(ground.sx, ground.sy);
    await page.mouse.click(ground.sx, ground.sy);
    const st = await page.evaluate((k) => ({ cd: window.__game.world.players[0].powerCooldowns[k] ?? 0, fx: window.__game.world.effects.map((e) => e.type) }), id);
    await sim(page, 4);
    const unitsAfter = await page.evaluate(() => window.__game.world.units.filter((u) => u.team === 0).length);
    const extra = id === 'drop' ? unitsAfter - unitsBefore === 5 : true;
    c.check(`8b ${id} arms targeting, fires on click and starts its cooldown`, armed && st.cd > 0 && extra, `cooldown ${st.cd.toFixed(0)}s, effects ${st.fx.join('/')}${id === 'drop' ? `, units +${unitsAfter - unitsBefore}` : ''}`);
  }
  const reqLeft = (await P()).req;
  c.check('8c requisition was spent (lance took 3 of the remaining 3.2)', reqLeft < 1, reqLeft.toFixed(2));
  await page.click('[data-testid="power-lance"]');
  await frames(page, 1);
  c.check('8d a power without requisition / on cooldown is refused with a notice', /recharging|Requisition/.test(await lastNotice()) && (await page.evaluate(() => !window.__game.input.targeting)), await lastNotice());

  // ================================================================ 9. hero panels for all three heroes
  for (const hero of ['nyx', 'rook', 'kade']) {
    await openMatch(page, base, `hero=${hero}&difficulty=easy&theme=verdant&seed=77`);
    await page.click('[data-testid="hero-portrait"]');
    const selHero = await page.evaluate(() => window.__game.input.selection[0]?.hero?.id);
    c.check(`9a ${hero}: portrait selects the hero`, selHero === hero);
    const setup = await page.evaluate(() => {
      const g = window.__game;
      const w = g.world;
      const p = w.players[0];
      p.heroLevel = 3;
      p.abilityCooldowns = [0, 0, 0];
      const h = p.hero;
      const foes = [];
      for (let k = 0; k < 4; k++) {
        const e = w.spawnUnit('tank', 1, h.x + 7 + k * 2.4, h.z + 6);
        e.aiRole = 'dummy';
        e.hp = e.maxHp = 9000; // sturdy practice targets
        e.setOrder({ type: 'hold', x: 0, z: 0, target: null, ability: -1 });
        foes.push(e.id);
      }
      w.updateFog();
      g.renderer.cam.jumpTo(h.x + 6, h.z + 4, true);
      return { foe: foes[1], kinds: p.heroDef.abilities.map((a) => a.targeting), names: p.heroDef.abilities.map((a) => a.name) };
    });
    await frames(page, 3);
    for (let k = 0; k < 3; k++) {
      await page.click(`[data-testid="ability-${k}"]`);
      const armed = await page.evaluate(() => window.__game.input.targeting?.type === 'ability');
      if (setup.kinds[k] === 'point') {
        const t = (await screenOf(page, setup.foe)) ?? (await project(page, 0, 0));
        await page.mouse.move(t.x, t.y);
        await page.mouse.click(t.x, t.y);
      }
      const cd = await page.evaluate((n) => window.__game.world.players[0].abilityCooldowns[n], k);
      c.check(`9b ${hero}: ${setup.names[k]} (${setup.kinds[k]}) casts from its button`, cd > 0 && armed === (setup.kinds[k] === 'point'), `cooldown ${cd.toFixed(0)}s`);
      await sim(page, 1.5);
      await frames(page, 2);
    }
    const cooling = await page.evaluate(() => [...document.querySelectorAll('.ability')].map((b) => b.classList.contains('cooling')));
    c.check(`9c ${hero}: ability buttons show their cooldowns`, cooling.every(Boolean));
    await page.click('[data-testid="ability-0"]');
    await frames(page, 1);
    c.check(`9d ${hero}: pressing an ability on cooldown is refused with a notice`, /recharging/.test(await lastNotice()), await lastNotice());
  }

  // ================================================================ 11. results screens, view, quit, play again, restart
  await page.evaluate(() => {
    const w = window.__game.world;
    for (const b of w.buildings) if (b.team === 1) w.kill(b, null, 0);
  });
  await sim(page, 2);
  await page.waitForSelector('[data-testid="btn-again"]', { timeout: 60000 });
  const win = await page.evaluate(() => ({ r: window.__game.world.result, title: document.querySelector('.end-title').textContent, rows: document.querySelectorAll('.stats tr').length }));
  c.check('11a destroying every enemy structure shows the victory screen with stats', win.r === 'victory' && win.title === 'VICTORY' && win.rows === 8, win);
  await page.click('[data-testid="btn-view"]');
  const f0 = await page.evaluate(() => window.__game.frames);
  await frames(page, 3);
  c.check('11b View battlefield dismisses the screen and keeps rendering', await page.evaluate((f) => !document.querySelector('.end') && window.__game.frames > f, f0));
  await page.click('[data-testid="btn-menu"]');
  await page.click('[data-testid="btn-quit"]');
  await page.waitForSelector('[data-testid="btn-start"]', { timeout: 60000 });
  c.check('11c Quit returns to the main menu and tears the match down', await page.evaluate(() => window.__game === null && !document.querySelector('.game')));
  await page.click('[data-testid="hero-kade"]');
  await page.click('[data-testid="difficulty-hard"]');
  await page.click('[data-testid="theme-scorched"]');
  await page.click('[data-testid="btn-start"]');
  await waitGame();
  await page.evaluate(() => {
    const w = window.__game.world;
    for (const b of w.buildings) if (b.team === 0) w.kill(b, null, 1);
  });
  await sim(page, 2);
  await page.waitForSelector('[data-testid="btn-again"]', { timeout: 60000 });
  const loss = await page.evaluate(() => ({ r: window.__game.world.result, title: document.querySelector('.end-title').textContent }));
  c.check('11d losing every structure shows the defeat screen', loss.r === 'defeat' && loss.title === 'DEFEAT', loss);
  await page.click('[data-testid="btn-again"]');
  await waitGame();
  const again = await page.evaluate(() => ({ hero: window.__game.config.hero, diff: window.__game.config.difficulty, t: window.__game.world.time }));
  c.check('11e Play again starts a fresh match with the same setup', again.hero === 'kade' && again.diff === 'hard' && again.t < 5, again);
  await page.click('[data-testid="btn-menu"]');
  await page.click('[data-testid="btn-restart"]');
  await waitGame();
  await frames(page, 2);
  c.check('11f Restart mission from the pause menu boots a new match', await page.evaluate(() => !window.__game.paused && window.__game.world.time < 5 && window.__game.config.hero === 'kade'));
  await page.click('[data-testid="btn-menu"]');
  await page.click('[data-testid="btn-quit"]');
  await page.waitForSelector('[data-testid="btn-start"]', { timeout: 60000 });
  c.check('11g Quit from a later match returns to the menu', true);
} catch (err) {
  c.check(`suite aborted: ${err.message.split('\n')[0]}`, false);
}

const fe = await frameErrors(page).catch(() => []);
await browser.close();
await close();
process.exit(c.finish(problems, fe));
