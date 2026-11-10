// Verification suite: combat loops, defences, veterancy, hero kits and progression, support
// powers, outposts, the enemy AI, match endings and long soaks — all while the page renders.
//   node scripts/verify/combat.mjs            (starts its own dev server)
//   URL=http://localhost:5173/ node scripts/verify/combat.mjs
//   SHOTS=1 …   also writes screenshots to scripts/verify/shots/
import { mkdirSync } from 'node:fs';
import { Checker, frameErrors, frames, launch, look, openMatch, serve, sim } from './lib.mjs';

const { base, close } = await serve(5194);
const { browser, page, problems } = await launch();
const c = new Checker('combat');
const shotsDir = new URL('./shots/', import.meta.url).pathname;
if (process.env.SHOTS) mkdirSync(shotsDir, { recursive: true });
const shot = async (name) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${shotsDir}${name}.png` });
};

/** Helpers injected into the page for staging fights. */
const install = (quietAi = false) =>
  page.evaluate((quietAi) => {
    const g = window.__game;
    const w = g.world;
    const T = (window.__t = {});
    // an open arena far from both bases and from the AI's rally point
    T.arena = () => {
      for (const [x, z] of [[70, 170], [170, 70], [60, 150], [150, 60], [90, 180], [180, 90]]) {
        let ok = true;
        for (let dx = -18; dx <= 18 && ok; dx += 3) for (let dz = -14; dz <= 14 && ok; dz += 3) if (w.nav.blockedAt(x + dx, z + dz)) ok = false;
        if (ok && !w.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < 30)) return { x, z };
      }
      return { x: 70, z: 170 };
    };
    T.clear = () => {
      // remove leftovers of the previous fight (anything tagged by spawn)
      for (const u of w.units) if (u.aiRole === 'test' || u.testTag) u.alive = false;
      for (const b of w.buildings) if (b.testTag) { b.alive = false; w.nav.setRect(b.cx, b.cz, b.w, b.h, 0); }
      w.projectiles.length = 0;
      w.update(0.05);
    };
    T.spawn = (id, team, x, z, n, order) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const u = w.spawnUnit(id, team, x + (i % 4) * 3 - 4.5, z + Math.floor(i / 4) * 3);
        u.aiRole = 'test';
        u.testTag = true;
        if (order) u.setOrder({ type: order.type, x: order.x ?? 0, z: order.z ?? 0, target: null, ability: -1 });
        out.push(u);
      }
      w.updateFog();
      return out;
    };
    T.build = (id, team, x, z) => {
      const def = g.defs.buildings[id];
      const cx = Math.round(x / 2 - def.w / 2);
      const cz = Math.round(z / 2 - def.h / 2);
      const b = w.placeBuilding(def, team, cx, cz, true);
      b.testTag = true;
      w.recount();
      return b;
    };
    T.run = (seconds) => {
      for (let i = 0; i < Math.round(seconds * 20); i++) w.update(0.05);
    };
    // staged fights must not be joined by the AI director's own army
    if (quietAi) {
      w.ai.update = () => {};
      w.ai.onDamaged = () => {};
      w.ai.onUnitBuilt = () => {};
      for (const u of w.units) if (u.team === 1 && !u.def.harvester) u.alive = false;
    }
    w.fog.revealAll = true;
    w.updateFog();
  }, quietAi);

/** 4v4 (or NvM) attack-move duel; returns survivors and combat evidence. */
const duel = (a, an, b, bn, seconds = 40) =>
  page.evaluate(
    ([a, an, b, bn, seconds]) => {
      const T = window.__t;
      const w = window.__game.world;
      T.clear();
      const { x, z } = T.arena();
      const A = T.spawn(a, 0, x, z - 9, an, { type: 'attackMove', x, z: z + 9 });
      const B = T.spawn(b, 1, x, z + 9, bn, { type: 'attackMove', x, z: z - 9 });
      let peakProj = 0;
      let t = 0;
      for (; t < seconds; t += 0.5) {
        T.run(0.5);
        peakProj = Math.max(peakProj, w.projectiles.length);
        if (!A.some((u) => u.alive) || !B.some((u) => u.alive)) break;
      }
      T.run(2);
      const hpA = A.filter((u) => u.alive).reduce((s, u) => s + u.hp / u.maxHp, 0);
      const hpB = B.filter((u) => u.alive).reduce((s, u) => s + u.hp / u.maxHp, 0);
      return {
        aAlive: A.filter((u) => u.alive).length, bAlive: B.filter((u) => u.alive).length, time: t, peakProj, projLeft: w.projectiles.length,
        hpA: +hpA.toFixed(2), hpB: +hpB.toFixed(2), killsA: A.reduce((s, u) => s + u.kills, 0), killsB: B.reduce((s, u) => s + u.kills, 0),
        ranks: [...A, ...B].filter((u) => u.alive).map((u) => u.rank).join(''),
      };
    },
    [a, an, b, bn, seconds],
  );

try {
  // ================================================================ 1. unit vs unit combat matrix
  await openMatch(page, base, 'hero=rook&difficulty=easy&theme=verdant&seed=2024');
  await install(true);
  const arena = await page.evaluate(() => window.__t.arena());
  await look(page, arena.x, arena.z);

  let r = await duel('trooper', 4, 'trooper', 4);
  c.check('1a trooper v trooper: one side is wiped out, kills are credited', (r.aAlive === 0) !== (r.bAlive === 0) && r.killsA + r.killsB >= 4, r);
  r = await duel('tank', 4, 'tank', 4);
  c.check('1b tank v tank: shells fly and resolve, one side wins', (r.aAlive === 0) !== (r.bAlive === 0) && r.peakProj > 0 && r.projLeft === 0, r);
  r = await duel('lancer', 6, 'tank', 2);
  c.check('1c lancers (anti-armour) beat tanks of equal cost', r.bAlive === 0 && r.aAlive >= 2 && r.peakProj > 0, r);
  r = await duel('buggy', 3, 'trooper', 8);
  c.check('1d buggies (anti-infantry) beat troopers', r.bAlive === 0 && r.aAlive >= 1, r);
  r = await duel('titan', 2, 'tank', 4, 60);
  c.check('1e titans v tanks: twin-barrel bursts land, fight resolves', (r.aAlive === 0) !== (r.bAlive === 0) && r.peakProj >= 2, r);
  r = await duel('gunship', 2, 'tank', 4, 50);
  c.check('1f gunships destroy tanks, which cannot shoot back', r.bAlive === 0 && r.aAlive === 2 && r.hpA === 2, r);
  r = await duel('lancer', 6, 'gunship', 2, 50);
  c.check('1g lancers shoot gunships down (anti-air)', r.bAlive === 0 && r.aAlive >= 1, r);
  r = await duel('grenadier', 6, 'trooper', 8, 50);
  c.check('1h grenadier lobs explode among infantry', r.peakProj > 0 && (r.aAlive === 0) !== (r.bAlive === 0), r);
  await page.evaluate(() => window.__t.run(1));
  await shot('01-duel');

  // artillery out-ranges a sentry gun
  r = await page.evaluate(() => {
    const T = window.__t;
    T.clear();
    const { x, z } = T.arena();
    const s = T.build('sentry', 1, x, z + 12);
    const art = T.spawn('artillery', 0, x, z - 14, 3, null);
    for (const u of art) u.setOrder({ type: 'attack', x: s.x, z: s.z, target: s, ability: -1 });
    T.run(45);
    return { sentryAlive: s.alive, sentryHp: Math.round(s.hp), artAlive: art.filter((u) => u.alive).length, artHp: art.reduce((a, u) => a + (u.alive ? u.hp / u.maxHp : 0), 0), dist: Math.round(Math.hypot(art[0].x - s.x, art[0].z - s.z)) };
  });
  c.check('1i artillery destroys a Sentry Gun from beyond its range without taking damage', !r.sentryAlive && r.artAlive === 3 && r.artHp === 3 && r.dist > 17, r);

  // grenadiers level a building
  r = await page.evaluate(() => {
    const T = window.__t;
    T.clear();
    const { x, z } = T.arena();
    const b = T.build('power', 1, x, z + 10);
    const g = T.spawn('grenadier', 0, x, z - 6, 6, null);
    for (const u of g) u.setOrder({ type: 'attack', x: b.x, z: b.z, target: b, ability: -1 });
    const razed0 = window.__game.world.players[0].stats.buildingsRazed;
    T.run(40);
    return { alive: b.alive, razed: window.__game.world.players[0].stats.buildingsRazed - razed0, navFreed: !window.__game.world.nav.blockedAt(b.x, b.z) };
  });
  c.check('1j grenadiers raze a structure; its footprint becomes walkable again', !r.alive && r.razed === 1 && r.navFreed, r);

  // ================================================================ 2. defences
  r = await page.evaluate(() => {
    const T = window.__t;
    const w = window.__game.world;
    T.clear();
    const { x, z } = T.arena();
    for (let i = 0; i < 4; i++) T.build('power', 0, x - 12 + i * 8, z - 14);
    const sentry = T.build('sentry', 0, x - 8, z);
    const cannon = T.build('cannon', 0, x, z);
    const arc = T.build('arc', 0, x + 8, z);
    T.run(0.5);
    const lowBefore = w.players[0].lowPower;
    const foes = [...T.spawn('trooper', 1, x - 8, z + 13, 6, { type: 'attackMove', x: x - 8, z }), ...T.spawn('tank', 1, x + 3, z + 14, 4, { type: 'attackMove', x: x + 4, z })];
    let arcMulti = 0;
    let targets = 0;
    for (let t = 0; t < 40; t += 0.25) {
      const hp0 = foes.map((u) => u.hp);
      const cd0 = arc.cooldown;
      T.run(0.25);
      if (arc.cooldown > cd0) arcMulti = Math.max(arcMulti, foes.filter((u, i) => u.hp < hp0[i]).length);
      targets = Math.max(targets, [sentry, cannon, arc].filter((b) => b.target).length);
      if (!foes.some((u) => u.alive)) break;
    }
    const out = { lowBefore, foesAlive: foes.filter((u) => u.alive).length, defencesAlive: [sentry, cannon, arc].filter((b) => b.alive).length, targets, arcMulti };
    // now starve the grid
    for (const b of w.buildings) if (b.testTag && b.def.id === 'power') { b.alive = false; w.nav.setRect(b.cx, b.cz, b.w, b.h, 0); }
    w.recount();
    T.run(1);
    out.lowAfter = w.players[0].lowPower;
    out.arcOffline = arc.offline;
    return out;
  });
  c.check('2a Sentry, Cannon and Arc Pylon acquire targets and repel an assault', r.foesAlive === 0 && r.targets === 3 && !r.lowBefore, r);
  c.check('2b Arc Pylon lightning chains to several units in one shot', r.arcMulti >= 2, `hit ${r.arcMulti} units at once`);
  c.check('2c the Arc Pylon shuts down when power runs short', r.lowAfter && r.arcOffline, r);

  // ================================================================ 3. veterancy
  r = await page.evaluate(() => {
    const T = window.__t;
    T.clear();
    const { x, z } = T.arena();
    const [ace] = T.spawn('tank', 0, x, z - 6, 1, { type: 'hold' });
    const hp0 = ace.maxHp;
    const log = [];
    for (let wave = 0; wave < 8 && ace.rank < 2; wave++) {
      const prey = T.spawn('buggy', 1, x, z + 3, 2, { type: 'hold' });
      for (const p of prey) p.hp = 30;
      ace.hp = ace.maxHp;
      T.run(8);
      log.push(`${ace.kills}k/r${ace.rank}`);
    }
    return { rank: ace.rank, kills: ace.kills, hp0, hp1: Math.round(ace.maxHp), log: log.join(' ') };
  });
  c.check('3 a tank earns Veteran then Elite rank from kills and gains max HP', r.rank === 2 && r.hp1 > r.hp0 * 1.25, r);

  // ================================================================ 5. support powers (engine level)
  r = await page.evaluate(() => {
    const T = window.__t;
    const w = window.__game.world;
    const p = w.players[0];
    T.clear();
    const { x, z } = T.arena();
    const out = {};
    p.req = 0.4;
    out.refused = w.usePower(0, 'lance', x, z);
    p.req = 5;
    p.powerCooldowns = {};
    const c0 = p.credits;
    out.cache = w.usePower(0, 'cache', 0, 0) === '' && p.credits - c0;
    w.fog.revealAll = false;
    w.updateFog();
    const visBefore = w.fog.isVisible(x, z);
    out.recon = w.usePower(0, 'recon', x, z);
    w.updateFog();
    out.visBefore = visBefore;
    out.visAfter = w.fog.isVisible(x, z);
    const n0 = w.units.filter((u) => u.team === 0).length;
    out.drop = w.usePower(0, 'drop', x - 6, z - 5);
    T.run(4);
    out.dropped = w.units.filter((u) => u.team === 0).length - n0;
    out.dropVeteran = w.units.filter((u) => u.team === 0 && Math.hypot(u.x - (x - 6), u.z - (z - 5)) < 9).every((u) => u.rank >= 1);
    out.reqLeft = +p.req.toFixed(2);
    p.req = 3;
    const foes = T.spawn('tank', 1, x + 4, z + 6, 4, { type: 'hold' });
    const bld = T.build('barracks', 1, x + 12, z + 8);
    out.lance = w.usePower(0, 'lance', x + 5, z + 7);
    T.run(1);
    out.midAlive = foes.filter((u) => u.alive).length;
    T.run(3);
    out.lanceKilled = foes.filter((u) => !u.alive).length;
    out.bldDamaged = bld.hp < bld.maxHp;
    out.cooldowns = Object.entries(p.powerCooldowns).filter(([, v]) => v > 0).map(([k]) => k).sort().join(',');
    out.again = w.usePower(0, 'cache', 0, 0);
    w.fog.revealAll = true;
    w.updateFog();
    return out;
  });
  c.check('5a a power without enough requisition is refused with a reason', r.refused === 'Not enough Requisition', r.refused);
  c.check('5b Supply Cache grants exactly 800 credits', r.cache === 800, r.cache);
  c.check('5c Recon Sweep lifts the fog at the target', r.recon === '' && !r.visBefore && r.visAfter);
  c.check('5d Armor Drop lands 5 veteran units after its delay', r.drop === '' && r.dropped === 5 && r.dropVeteran, `+${r.dropped}`);
  c.check('5e Orbital Lance strikes after a delay, killing units and damaging buildings', r.lance === '' && r.midAlive === 4 && r.lanceKilled >= 3 && r.bldDamaged, `killed ${r.lanceKilled}/4`);
  c.check('5f tokens are deducted and cooldowns start; a cooling power is refused', r.reqLeft < 1.2 && r.cooldowns === 'cache,drop,lance,recon' && r.again === 'Still recharging', r);

  // ================================================================ 6. outposts
  r = await page.evaluate(() => {
    const T = window.__t;
    const w = window.__game.world;
    const p = w.players[0];
    T.clear();
    const out = {};
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    const posts = w.buildings.filter((b) => b.def.capturable);
    const ex = posts.filter((b) => b.def.id === 'extractor').sort((a, b) => Math.hypot(a.x - hq.x, a.z - hq.z) - Math.hypot(b.x - hq.x, b.z - hq.z))[0];
    const ob = posts.find((b) => b.def.id === 'obelisk');
    const capture = (post) => {
      const squad = T.spawn('trooper', 0, post.x + post.radius + 3, post.z, 3, { type: 'hold' });
      let t = 0;
      let peak = 0;
      for (; t < 40 && post.team !== 0; t += 0.5) {
        T.run(0.5);
        peak = Math.max(peak, post.capProgress);
      }
      return { team: post.team, t, peak: +peak.toFixed(2), squad };
    };
    const e = capture(ex);
    out.extractor = { team: e.team, seconds: e.t, peak: e.peak };
    // income from the extractor alone: park harvesters and compare credits
    for (const u of w.units) if (u.team === 0 && u.def.harvester) u.setOrder({ type: 'hold', x: 0, z: 0, target: null, ability: -1 });
    const c0 = p.credits;
    T.run(10);
    out.income = +(p.credits - c0).toFixed(0);
    const r0 = p.req = 0;
    T.run(20);
    out.reqNoObelisk = +(p.req - r0).toFixed(3);
    const o = capture(ob);
    out.obelisk = { team: o.team, seconds: o.t };
    p.req = 0;
    T.run(20);
    out.reqWithObelisk = +p.req.toFixed(3);
    out.counts = { extractor: p.buildingCounts.extractor, obelisk: p.buildingCounts.obelisk };
    // contested capture does not progress
    const other = posts.find((b) => b.def.id === 'extractor' && b !== ex);
    other.team = 2;
    other.capProgress = 0;
    T.spawn('trooper', 0, other.x + other.radius + 3, other.z, 2, { type: 'hold' });
    const foes = T.spawn('trooper', 1, other.x - other.radius - 3, other.z, 2, { type: 'hold' });
    for (const u of w.units) if (u.testTag) { u.hp = u.maxHp = 100000; }
    T.run(6);
    out.contested = +other.capProgress.toFixed(2);
    for (const f of foes) f.alive = false;
    return out;
  });
  c.check('6a three troopers capture a neutral Aurium Extractor', r.extractor.team === 0 && r.extractor.peak > 0.3, r.extractor);
  c.check('6b the captured Extractor pays about 9 credits per second', r.income >= 80 && r.income <= 100, `+${r.income} in 10 s`);
  c.check('6c capturing the Signal Obelisk speeds up requisition (x1.8)', r.obelisk.team === 0 && r.reqWithObelisk / r.reqNoObelisk > 1.6 && r.reqWithObelisk / r.reqNoObelisk < 2.0, `${r.reqNoObelisk} -> ${r.reqWithObelisk} per 20 s`);
  c.check('6d a contested outpost does not flip', r.contested === 0, `progress ${r.contested}`);

  // ================================================================ 4. heroes: every ability's effect, XP, death and revival
  const heroTests = {
    rook: () =>
      page.evaluate(() => {
        const T = window.__t;
        const w = window.__game.world;
        const p = w.players[0];
        const h = p.hero;
        const out = {};
        p.heroLevel = 3;
        const foes = T.spawn('tank', 1, h.x + 4, h.z + 16, 4, { type: 'hold' });
        for (const f of foes) f.hp = f.maxHp = 3000;
        const allies = T.spawn('tank', 0, h.x - 4, h.z - 2, 3, { type: 'hold' });
        h.hp = h.maxHp = 1e6;
        T.run(0.1);
        const hp0 = foes.reduce((s, u) => s + u.hp, 0);
        out.q = w.castAbility(h, 0, foes[1].x, foes[1].z);
        T.run(0.2);
        out.barrageProj = w.projectiles.filter((x) => x.type === 'lob').length;
        T.run(4);
        out.barrageDamage = Math.round(hp0 - foes.reduce((s, u) => s + u.hp, 0));
        out.w = w.castAbility(h, 1, h.x, h.z);
        out.haste = allies.every((u) => u.haste > 9) && h.haste > 9;
        out.e = w.castAbility(h, 2, h.x, h.z);
        out.shield = allies.every((u) => u.shield > 7);
        const a = allies[0];
        a.hp = a.maxHp;
        const dealt = w.damage(a, 100, 'shell', null, 1);
        out.shielded = Math.round(dealt);
        out.cds = p.abilityCooldowns.map((x) => Math.round(x));
        return out;
      }),
    nyx: () =>
      page.evaluate(() => {
        const T = window.__t;
        const w = window.__game.world;
        const p = w.players[0];
        const h = p.hero;
        const out = {};
        p.heroLevel = 3;
        const foes = T.spawn('tank', 1, h.x + 4, h.z + 14, 6, { type: 'hold' });
        for (const f of foes) f.hp = f.maxHp = 3000;
        h.hp = h.maxHp = 1e6;
        T.run(0.1);
        out.q = w.castAbility(h, 0, foes[0].x, foes[0].z);
        out.chainHit = foes.filter((u) => u.hp < 3000).length;
        const from = { x: h.x, z: h.z };
        out.w = w.castAbility(h, 1, foes[2].x, foes[2].z + 3);
        out.blinked = +Math.hypot(h.x - from.x, h.z - from.z).toFixed(1);
        out.stunned = foes.filter((u) => u.stun > 1).length;
        const hp1 = foes.reduce((s, u) => s + u.hp, 0);
        out.e = w.castAbility(h, 2, foes[2].x, foes[2].z);
        T.run(3);
        out.tempestActive = w.effects.some((x) => x.type === 'tempest');
        out.slowed = foes.filter((u) => u.slow > 0).length;
        T.run(6);
        out.tempestDamage = Math.round(hp1 - foes.reduce((s, u) => s + u.hp, 0));
        out.tempestEnded = !w.effects.some((x) => x.type === 'tempest');
        return out;
      }),
    kade: () =>
      page.evaluate(() => {
        const T = window.__t;
        const w = window.__game.world;
        const p = w.players[0];
        const h = p.hero;
        const out = {};
        p.heroLevel = 3;
        const foes = T.spawn('tank', 1, h.x + 4, h.z + 14, 4, { type: 'hold' });
        const inf = T.spawn('trooper', 1, h.x - 6, h.z + 14, 2, { type: 'hold' });
        for (const f of [...foes, ...inf]) f.hp = f.maxHp = 3000;
        h.hp = h.maxHp = 1e6;
        T.run(0.1);
        out.q = w.castAbility(h, 0, foes[0].x, foes[0].z);
        out.deadeye = Math.round(3000 - Math.min(...foes.map((u) => u.hp)));
        out.w = w.castAbility(h, 1, foes[1].x, foes[1].z);
        out.empVehicles = foes.filter((u) => u.stun > 4).length;
        out.empInfantry = inf.filter((u) => u.stun > 0).length;
        const base = w.damage(foes[3], 100, 'energy', null, 0);
        out.e = w.castAbility(h, 2, foes[2].x, foes[2].z);
        const marked = w.damage(foes[3], 100, 'energy', null, 0);
        out.ratio = +(marked / base).toFixed(2);
        T.run(13);
        out.zoneEnded = !w.effects.some((x) => x.type === 'killzone');
        return out;
      }),
  };
  for (const hero of ['rook', 'nyx', 'kade']) {
    await openMatch(page, base, `hero=${hero}&difficulty=easy&theme=${hero === 'rook' ? 'verdant' : hero === 'nyx' ? 'scorched' : 'frost'}&seed=${hero.length * 101}`);
    await install(true);
    const h = await page.evaluate(() => ({ x: window.__game.world.players[0].hero.x, z: window.__game.world.players[0].hero.z }));
    await look(page, h.x + 4, h.z + 8);
    r = await heroTests[hero]();
    await frames(page, 2);
    await shot(`02-hero-${hero}`);
    if (hero === 'rook') {
      c.check('4a Rook · Thunder Barrage rains six shells that damage the area', r.q && r.barrageProj >= 1 && r.barrageDamage > 300, `damage ${r.barrageDamage}`);
      c.check('4a Rook · Rally Cry hastes nearby allies', r.w && r.haste);
      c.check('4a Rook · Bastion Protocol shields allies (60% less damage)', r.e && r.shield && r.shielded === 40, `100 shell dmg -> ${r.shielded}`);
    } else if (hero === 'nyx') {
      c.check('4b Nyx · Chain Lightning jumps across six enemies', r.q && r.chainHit === 6, `hit ${r.chainHit}`);
      c.check('4b Nyx · Phase Blink teleports and stuns on arrival', r.w && r.blinked > 8 && r.stunned >= 2, `moved ${r.blinked}, stunned ${r.stunned}`);
      c.check('4b Nyx · Tempest shocks and slows for 8 seconds, then ends', r.e && r.tempestActive && r.slowed >= 3 && r.tempestDamage > 500 && r.tempestEnded, `damage ${r.tempestDamage}, slowed ${r.slowed}`);
    } else {
      c.check('4c Kade · Deadeye deals heavy single-target damage', r.q && r.deadeye > 400, `damage ${r.deadeye}`);
      c.check('4c Kade · EMP disables vehicles but not infantry', r.w && r.empVehicles >= 3 && r.empInfantry === 0, `vehicles ${r.empVehicles}, infantry ${r.empInfantry}`);
      c.check('4c Kade · Kill Zone makes enemies take +50% damage, then expires', r.e && r.ratio === 1.5 && r.zoneEnded, `x${r.ratio}`);
    }
    // XP, level-up, death and revival
    r = await page.evaluate(() => {
      const T = window.__t;
      const w = window.__game.world;
      const p = w.players[0];
      T.clear();
      p.heroLevel = 1;
      p.heroXp = 0;
      const h = p.hero;
      h.maxHp = h.def.hp;
      h.hp = h.maxHp;
      const out = { hp1: Math.round(h.maxHp) };
      for (let wave = 0; wave < 14 && p.heroLevel < 3; wave++) {
        const prey = T.spawn('tank', 1, h.x + 3, h.z + 9, 3, { type: 'hold' });
        for (const q of prey) q.hp = 20;
        h.hp = h.maxHp;
        h.setOrder({ type: 'idle', x: 0, z: 0, target: null, ability: -1 });
        T.run(7);
      }
      out.level = p.heroLevel;
      out.xp = Math.round(p.heroXp);
      out.hp3 = Math.round(p.hero.maxHp);
      w.kill(p.hero, null, 1);
      out.respawn = Math.round(p.heroRespawn);
      out.goneNow = p.hero === null;
      T.run(out.respawn + 2);
      const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
      out.back = !!p.hero && p.hero.alive;
      out.nearHq = p.hero ? Math.round(Math.hypot(p.hero.x - hq.x, p.hero.z - hq.z)) : -1;
      out.levelKept = p.heroLevel;
      out.hpBack = p.hero ? Math.round(p.hero.maxHp) : 0;
      return out;
    });
    c.check(`4d ${hero}: hero gains XP from kills and levels up with more HP`, r.level >= 3 && r.hp3 > r.hp1 * 1.25, `level ${r.level}, xp ${r.xp}, hp ${r.hp1} -> ${r.hp3}`);
    c.check(`4e ${hero}: hero dies, then revives at the Command Center with its level`, r.goneNow && r.respawn > 20 && r.back && r.nearHq < 14 && r.levelKept === r.level && r.hpBack === r.hp3, r);
  }

  // ================================================================ 7 + 9. enemy AI and soak on each difficulty
  const soak = async (difficulty, hero, theme, seed, minutes, keepAlive) => {
    await openMatch(page, base, `hero=${hero}&difficulty=${difficulty}&theme=${theme}&seed=${seed}`);
    await install();
    const log = [];
    let peakUnits = 0;
    let firstLoss = -1;
    let ms = 0;
    let calls = 0;
    for (let m = 0; m < minutes * 2; m++) {
      const step = await page.evaluate((keep) => {
        const g = window.__game;
        const w = g.world;
        const T = window.__t;
        if (w.result) return null;
        if (keep) {
          // a standing defence so the match lasts the full soak
          const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
          const mine = w.units.filter((u) => u.team === 0 && !u.def.harvester).length;
          // the soak measures stability, not balance: patch the base up between waves
          for (const b of w.buildings) if (b.team === 0) b.hp = b.maxHp;
          if (hq && mine < 40) {
            const d = [...T.spawn('tank', 0, hq.x + 12, hq.z + 12, 3, null), ...T.spawn('titan', 0, hq.x + 12, hq.z + 16, 1, null), ...T.spawn('lancer', 0, hq.x + 16, hq.z + 12, 2, null)];
            for (const u of d) { u.aiRole = ''; u.testTag = false; }
          }
        }
        const t0 = performance.now();
        for (let i = 0; i < 600; i++) w.update(0.05);
        const dt = performance.now() - t0;
        const ai = w.players[1];
        const me = w.players[0];
        return {
          dt, t: w.time, result: w.result, units: w.units.length,
          ai: { b: w.buildings.filter((b) => b.team === 1 && b.def.category !== 'neutral').length, u: w.units.filter((u) => u.team === 1).length, credits: Math.round(ai.credits), harv: ai.stats.harvested, lvl: ai.heroLevel, ups: ai.upgrades.size, posts: (ai.buildingCounts.extractor ?? 0) + (ai.buildingCounts.obelisk ?? 0), built: ai.stats.unitsBuilt, counts: ai.buildingCounts },
          me: { lostB: me.stats.buildingsLost, lostU: me.stats.unitsLost, killed: me.stats.unitsKilled },
        };
      }, keepAlive);
      if (!step) break;
      ms += step.dt;
      calls += 600;
      peakUnits = Math.max(peakUnits, step.units);
      if (firstLoss < 0 && step.me.lostB + step.me.lostU > 0) firstLoss = step.t;
      if (m % 4 === 3 || step.result) log.push(`${(step.t / 60).toFixed(0)}m b${step.ai.b} u${step.ai.u} $${step.ai.credits} harv${step.ai.harv} L${step.ai.lvl} up${step.ai.ups} posts${step.ai.posts}`);
      await frames(page, 2);
      if (m === 11) {
        const hq = await page.evaluate(() => {
          const b = window.__game.world.buildings.find((x) => x.team === 1 && x.def.id === 'hq');
          return b ? { x: b.x, z: b.z } : null;
        });
        if (hq) {
          await look(page, hq.x - 6, hq.z - 8);
          await shot(`03-ai-base-${difficulty}`);
        }
      }
      if (step.result) {
        log.push(`ended: ${step.result} at ${(step.t / 60).toFixed(1)}m`);
        break;
      }
    }
    const end = await page.evaluate(() => {
      const w = window.__game.world;
      return { t: w.time, result: w.result, ai: w.players[1].buildingCounts, aiBuilt: w.players[1].stats.unitsBuilt, aiHarv: w.players[1].stats.harvested, ups: w.players[1].upgrades.size, errors: window.__game.errors.length };
    });
    return { log, peakUnits, firstLoss, msPerStep: +(ms / calls).toFixed(3), end };
  };

  const easy = await soak('easy', 'rook', 'verdant', 11, 16, true);
  console.log('   easy  ', easy.log.join(' | '));
  c.check('7a/9 easy: 15+ simulated minutes of soak, AI builds a base and an economy', easy.end.t > 15 * 60 && (easy.end.ai.refinery ?? 0) >= 1 && (easy.end.ai.factory ?? 0) >= 1 && easy.end.aiHarv > 5000 && easy.end.errors === 0, `peak ${easy.peakUnits} units, ${easy.msPerStep} ms/step, first player loss at ${(easy.firstLoss / 60).toFixed(1)}m`);
  const normal = await soak('normal', 'nyx', 'scorched', 22, 16, true);
  console.log('   normal', normal.log.join(' | '));
  c.check('7b/9 normal: 15+ simulated minutes of soak, full tech tree, research and attack waves', normal.end.t > 15 * 60 && (normal.end.ai.techlab ?? 0) >= 1 && (normal.end.ai.airpad ?? 0) >= 1 && normal.end.ups >= 3 && normal.firstLoss > 0 && normal.end.errors === 0, `peak ${normal.peakUnits} units, ${normal.msPerStep} ms/step, first attack lands at ${(normal.firstLoss / 60).toFixed(1)}m`);
  const hard = await soak('hard', 'kade', 'frost', 33, 16, true);
  console.log('   hard  ', hard.log.join(' | '));
  c.check('7c/9 hard: 15+ simulated minutes of soak, bigger army sooner than normal', hard.end.t > 15 * 60 && hard.end.aiBuilt > normal.end.aiBuilt && hard.firstLoss > 0 && hard.firstLoss < normal.firstLoss && hard.end.errors === 0, `peak ${hard.peakUnits} units, ${hard.msPerStep} ms/step, first attack lands at ${(hard.firstLoss / 60).toFixed(1)}m, built ${hard.end.aiBuilt} vs normal ${normal.end.aiBuilt}`);
  c.check('7d easy AI is clearly slower than normal', easy.end.aiBuilt < normal.end.aiBuilt && (easy.firstLoss < 0 || easy.firstLoss > normal.firstLoss), `easy built ${easy.end.aiBuilt}, normal ${normal.end.aiBuilt}`);
  c.check('7e the AI captures outposts', normal.log.some((l) => /posts[1-3]/.test(l)) || hard.log.some((l) => /posts[1-3]/.test(l)));

  // ================================================================ 8. match endings
  const passive = await soak('hard', 'rook', 'verdant', 44, 14, false);
  console.log('   passive', passive.log.join(' | '));
  await page.waitForSelector('[data-testid="btn-again"]', { timeout: 90000 }).catch(() => {});
  r = await page.evaluate(() => ({ result: window.__game.world.result, title: document.querySelector('.end-title')?.textContent }));
  await shot('04-defeat');
  c.check('8a a passive player on hard is overrun: defeat screen appears', r.result === 'defeat' && r.title === 'DEFEAT', `ended at ${(passive.end.t / 60).toFixed(1)}m`);
  await openMatch(page, base, 'hero=rook&difficulty=normal&theme=verdant&seed=55');
  await install();
  r = await page.evaluate(() => {
    const T = window.__t;
    const w = window.__game.world;
    const hq = w.buildings.find((b) => b.team === 1 && b.def.id === 'hq');
    const army = [...T.spawn('titan', 0, hq.x - 30, hq.z - 30, 8, null), ...T.spawn('artillery', 0, hq.x - 36, hq.z - 30, 4, null)];
    for (const u of army) { u.aiRole = ''; u.setOrder({ type: 'attackMove', x: hq.x, z: hq.z, target: null, ability: -1 }); }
    let t = 0;
    for (; t < 400 && !w.result; t += 1) {
      T.run(1);
      // keep pushing onto whatever is left
      if (t % 10 === 0) {
        const left = w.buildings.find((b) => b.team === 1 && b.alive && b.def.category !== 'neutral');
        if (left) for (const u of army) if (u.alive && u.order.type === 'idle') u.setOrder({ type: 'attackMove', x: left.x, z: left.z, target: null, ability: -1 });
      }
    }
    return { result: w.result, t, razed: w.players[0].stats.buildingsRazed, armyLeft: army.filter((u) => u.alive).length };
  });
  await page.waitForSelector('[data-testid="btn-again"]', { timeout: 90000 }).catch(() => {});
  const title = await page.evaluate(() => document.querySelector('.end-title')?.textContent);
  await shot('05-victory');
  c.check('8b an army that razes the enemy base wins: victory screen appears', r.result === 'victory' && title === 'VICTORY', r);
} catch (err) {
  c.check(`suite aborted: ${err.message.split('\n')[0]}`, false);
}

const fe = await frameErrors(page).catch(() => []);
await browser.close();
await close();
process.exit(c.finish(problems, fe));
