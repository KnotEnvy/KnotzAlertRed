// Headless simulation soak test: runs the sim without rendering and prints a summary.
// Usage: node scripts/simtest.mjs [minutes] [easy|normal|hard] [seed]
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { World } = await server.ssrLoadModule('/src/sim/world.ts');
  const { BUILDING_DEFS } = await server.ssrLoadModule('/src/data/buildings.ts');
  const minutes = Number(process.argv[2] ?? 12);
  const difficulty = process.argv[3] ?? 'normal';
  const w = new World({ hero: 'rook', difficulty, theme: 'verdant', seed: Number(process.argv[4] ?? 1337) });
  const t0 = performance.now();
  // Scripted "player": follows a simple opening so harvesting and production paths are exercised.
  const plan = ['power', 'refinery', 'barracks', 'factory', 'power', 'sentry', 'techlab', 'power', 'airpad', 'cannon', 'arc'];
  let planI = 0;
  const p = w.players[0];
  const findSpot = (def) => {
    const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
    if (!hq) return null;
    for (let r = 3; r < 22; r++) {
      for (let oz = -r; oz <= r; oz++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          const cx = hq.cx + 2 + ox;
          const cz = hq.cz + 2 + oz;
          if (!w.nav.rectFree(cx - 1, cz - 1, def.w + 2, def.h + 2)) continue;
          if (!w.canPlace(def, 0, cx, cz)) return [cx, cz];
        }
      }
    }
    return null;
  };
  let maxStep = 0;
  const steps = Math.round((minutes * 60) / 0.05);
  for (let i = 0; i < steps && !w.result; i++) {
    const s0 = performance.now();
    w.update(0.05);
    maxStep = Math.max(maxStep, performance.now() - s0);
    if (i % 20 === 0) {
      for (const kind of ['structure', 'defense']) {
        const q = p.queues[kind];
        if (q.ready) {
          const d = BUILDING_DEFS[q.items[0].defId];
          const s = findSpot(d);
          if (s) w.placeReady(0, kind, s[0], s[1]);
        }
      }
      if (planI < plan.length) {
        const id = plan[planI];
        const d = BUILDING_DEFS[id];
        const kind = d.category === 'defense' ? 'defense' : 'structure';
        if (!w.enqueue(0, kind, id)) planI++;
      }
      const harvesters = w.units.filter((u) => u.team === 0 && u.def.harvester).length;
      if (p.has('factory') && p.queues.vehicle.items.length < 2) w.enqueue(0, 'vehicle', harvesters < 4 ? 'harvester' : 'tank');
      if (p.has('barracks') && p.queues.infantry.items.length < 1) w.enqueue(0, 'infantry', 'lancer');
    }
    if (i % 1200 === 0) {
      const line = w.players
        .map((pl, t) => {
          const b = w.buildings.filter((x) => x.team === t).length;
          const u = w.units.filter((x) => x.team === t).length;
          return `T${t} $${Math.round(pl.credits)} pw ${pl.powerMade}/${pl.powerUsed} b${b} u${u} L${pl.heroLevel} req${pl.req.toFixed(1)} harv$${pl.stats.harvested}`;
        })
        .join(' | ');
      console.log(`${(w.time / 60).toFixed(1)}m ${line}`);
    }
  }
  const ms = performance.now() - t0;
  console.log(
    `result=${w.result || 'ongoing'} simTime=${(w.time / 60).toFixed(1)}m wall=${ms.toFixed(0)}ms avgStep=${(ms / steps).toFixed(3)}ms maxStep=${maxStep.toFixed(1)}ms`,
  );
  for (const pl of w.players) {
    console.log(`team ${pl.team}`, JSON.stringify(pl.stats), 'buildings', JSON.stringify(pl.buildingCounts), 'upgrades', [...pl.upgrades]);
  }
} catch (e) {
  console.error('SIM ERROR', e);
  process.exitCode = 1;
} finally {
  await server.close();
}
