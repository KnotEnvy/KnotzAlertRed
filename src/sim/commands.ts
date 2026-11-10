import { GRID, WORLD } from '../core/config';
import { clamp } from '../core/math';
import type { Entity, ResourceNode } from './entity';
import { NavGrid } from './nav';
import { makeOrder } from './unit';
import type { Unit } from './unit';
import type { World } from './world';

/**
 * Group orders. A group shares one flow field toward the destination; each unit gets its
 * own formation slot so the army arrives in a block instead of fighting for one point.
 */
export function orderMove(w: World, units: Unit[], x: number, z: number, queue = false, attack = false): void {
  const list = units.filter((u) => u.alive);
  if (!list.length) return;
  x = clamp(x, 1.5, WORLD - 1.5);
  z = clamp(z, 1.5, WORLD - 1.5);
  const type = attack ? 'attackMove' : 'move';
  if (list.length === 1) {
    const [gx, gz] = snap(w, list[0], x, z);
    list[0].setOrder(makeOrder(type, gx, gz), queue);
    return;
  }
  let cx = 0;
  let cz = 0;
  let maxR = 0;
  for (const u of list) {
    cx += u.x;
    cz += u.z;
    maxR = Math.max(maxR, u.radius);
  }
  cx /= list.length;
  cz /= list.length;
  let fx = x - cx;
  let fz = z - cz;
  const fl = Math.hypot(fx, fz);
  if (fl < 0.01) {
    fx = 0;
    fz = 1;
  } else {
    fx /= fl;
    fz /= fl;
  }
  const rx = fz;
  const rz = -fx;
  const spacing = maxR * 2 + 0.7;
  const cols = Math.ceil(Math.sqrt(list.length * 1.4));
  const rows = Math.ceil(list.length / cols);
  const slots: [number, number][] = [];
  for (let i = 0; i < list.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = row === rows - 1 ? list.length - row * cols : cols;
    const lx = (col - (inRow - 1) / 2) * spacing;
    const lz = ((rows - 1) / 2 - row) * spacing;
    slots.push([x + rx * lx + fx * lz, z + rz * lx + fz * lz]);
  }
  // Greedy assignment: each slot takes the closest remaining unit.
  const remaining = list.slice();
  for (const [sx, sz] of slots) {
    let bi = 0;
    let bd = 1e12;
    for (let i = 0; i < remaining.length; i++) {
      const u = remaining[i];
      const d = (u.x - sx) ** 2 + (u.z - sz) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const u = remaining.splice(bi, 1)[0];
    const [gx, gz] = snap(w, u, sx, sz);
    u.setOrder(makeOrder(type, gx, gz), queue);
  }
}

function snap(w: World, u: Unit, x: number, z: number): [number, number] {
  x = clamp(x, 1.5, WORLD - 1.5);
  z = clamp(z, 1.5, WORLD - 1.5);
  if (u.flying || !w.nav.blockedAt(x, z)) return [x, z];
  const free = w.nav.nearestFree(NavGrid.cellOf(x), NavGrid.cellOf(z));
  if (free < 0) return [x, z];
  return [NavGrid.center(free % GRID), NavGrid.center((free / GRID) | 0)];
}

export function orderAttack(units: Unit[], target: Entity, queue = false): void {
  for (const u of units) {
    if (!u.alive) continue;
    if (u.canHit(target)) u.setOrder(makeOrder('attack', target.x, target.z, target), queue);
    else u.setOrder(makeOrder('move', target.x, target.z), queue);
  }
}

export function orderStop(units: Unit[]): void {
  for (const u of units) {
    if (u.alive) u.setOrder(makeOrder(u.def.harvester ? 'hold' : 'idle'));
  }
}

export function orderHold(units: Unit[]): void {
  for (const u of units) {
    if (u.alive) u.setOrder(makeOrder('hold'));
  }
}

export function orderHarvest(units: Unit[], node: ResourceNode | null): void {
  for (const u of units) {
    if (u.alive && u.def.harvester) u.setOrder(makeOrder('harvest', node?.x ?? u.x, node?.z ?? u.z, node));
  }
}
