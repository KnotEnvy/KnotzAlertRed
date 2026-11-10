import type { HeroDef, QueueKind } from '../data/types';
import type { Unit } from './unit';

export interface QueueItem {
  defId: string;
  paid: number;
  progress: number; // 0..1
}

export class ProductionQueue {
  items: QueueItem[] = [];
  /** Structure/defence queues: the finished item is waiting to be placed. */
  ready = false;
  /** Set when progress stopped this tick (no funds or no producer). */
  stalled: '' | 'funds' | 'producer' = '';
  constructor(readonly kind: QueueKind) {}
  count(defId: string): number {
    let n = 0;
    for (const it of this.items) if (it.defId === defId) n++;
    return n;
  }
}

export const QUEUE_KINDS: QueueKind[] = ['structure', 'defense', 'infantry', 'vehicle', 'air', 'tech'];

export interface PlayerStats {
  unitsBuilt: number;
  unitsLost: number;
  unitsKilled: number;
  buildingsBuilt: number;
  buildingsLost: number;
  buildingsRazed: number;
  harvested: number;
  damageDealt: number;
}

/** Per-faction economy, production, tech and hero progression. */
export class Player {
  credits = 0;
  powerMade = 0;
  powerUsed = 0;
  lowPower = false;
  queues: Record<QueueKind, ProductionQueue>;
  upgrades = new Set<string>();
  /** Requisition tokens (fractional part is progress toward the next one). */
  req = 0.5;
  powerCooldowns: Record<string, number> = {};
  hero: Unit | null = null;
  heroLevel = 1;
  heroXp = 0;
  heroRespawn = 0;
  abilityCooldowns = [0, 0, 0];
  buildingCounts: Record<string, number> = {};
  incomeMul = 1;
  buildSpeedMul = 1;
  defeated = false;
  lastAlert = -999;
  stats: PlayerStats = {
    unitsBuilt: 0, unitsLost: 0, unitsKilled: 0, buildingsBuilt: 0, buildingsLost: 0, buildingsRazed: 0,
    harvested: 0, damageDealt: 0,
  };

  constructor(
    readonly team: number,
    readonly heroDef: HeroDef,
  ) {
    this.queues = {} as Record<QueueKind, ProductionQueue>;
    for (const k of QUEUE_KINDS) this.queues[k] = new ProductionQueue(k);
  }

  has(defId: string): boolean {
    return (this.buildingCounts[defId] ?? 0) > 0;
  }

  meets(requires?: string[]): boolean {
    if (!requires) return true;
    for (const r of requires) if (!this.has(r)) return false;
    return true;
  }
}
