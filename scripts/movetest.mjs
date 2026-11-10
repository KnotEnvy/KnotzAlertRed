// Pathing regression check: march a mixed group across several maps and report arrivals.
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { World } = await server.ssrLoadModule('/src/sim/world.ts');
const { orderMove } = await server.ssrLoadModule('/src/sim/commands.ts');
let bad = 0;
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 1337, 4242]) {
  const w = new World({ hero: 'rook', difficulty: 'easy', theme: 'verdant', seed });
  const hq = w.buildings.find((b) => b.team === 0 && b.def.id === 'hq');
  const ids = ['tank', 'tank', 'tank', 'titan', 'buggy', 'trooper', 'trooper', 'lancer', 'grenadier', 'artillery', 'tank', 'tank', 'trooper', 'trooper', 'buggy', 'titan'];
  const group = ids.map((id, i) => w.spawnUnit(id, 0, hq.x + 12 + (i % 4) * 3, hq.z + 12 + Math.floor(i / 4) * 3));
  // destinations: map centre, then the far corner near the enemy base
  const legs = [[120, 120], [w.buildings.find((b) => b.team === 1).x - 26, w.buildings.find((b) => b.team === 1).z - 26]];
  // keep the AI passive so the march is undisturbed
  for (const u of w.units) if (u.team === 1) u.alive = false;
  const out = [];
  for (const [gx, gz] of legs) {
    orderMove(w, group, gx, gz);
    let t = 0;
    for (; t < 150; t += 0.05) {
      w.update(0.05);
      if (group.every((u) => !u.alive || u.order.type === 'idle')) break;
    }
    const alive = group.filter((u) => u.alive);
    const far = alive.filter((u) => Math.hypot(u.x - gx, u.z - gz) > 16);
    const moving = alive.filter((u) => u.order.type !== 'idle').length;
    if (far.length || moving) bad++;
    out.push(`leg(${gx.toFixed(0)},${gz.toFixed(0)}) t=${t.toFixed(0)}s far=${far.length} stillMoving=${moving}${far.length ? ' [' + far.map((u) => `${u.def.id}@${u.x.toFixed(0)},${u.z.toFixed(0)}`).join(' ') + ']' : ''}`);
  }
  console.log(`seed ${seed}: ${out.join(' | ')}`);
}
console.log(bad ? `${bad} problem legs` : 'all groups arrived');
await server.close();
