/** Static definition types for everything that can exist on the battlefield. */

export type ArmorClass = 'infantry' | 'light' | 'heavy' | 'building' | 'air';
export type DamageType = 'bullet' | 'shell' | 'rocket' | 'energy' | 'explosive';
export type ProjectileKind = 'bullet' | 'shell' | 'rocket' | 'lob' | 'arc';
export type QueueKind = 'structure' | 'defense' | 'infantry' | 'vehicle' | 'air' | 'tech';

/** Damage multiplier of each damage type against each armour class. */
export const DAMAGE_TABLE: Record<DamageType, Record<ArmorClass, number>> = {
  bullet: { infantry: 1.0, light: 0.6, heavy: 0.16, building: 0.15, air: 0.7 },
  shell: { infantry: 0.5, light: 1.0, heavy: 1.0, building: 0.75, air: 0.0 },
  rocket: { infantry: 0.3, light: 1.0, heavy: 1.15, building: 0.8, air: 1.3 },
  energy: { infantry: 1.0, light: 1.0, heavy: 0.9, building: 0.6, air: 0.9 },
  explosive: { infantry: 1.0, light: 0.75, heavy: 0.5, building: 1.35, air: 0.0 },
};

export interface WeaponDef {
  damage: number;
  range: number;
  minRange?: number;
  cooldown: number;
  type: DamageType;
  projectile: ProjectileKind;
  speed?: number; // projectile speed (world units / s)
  splash?: number; // splash radius
  burst?: number; // shots per salvo
  burstDelay?: number;
  chain?: number; // extra arc bounces
  hitsAir: boolean;
  hitsGround: boolean;
  sfx: string;
}

export interface UnitDef {
  id: string;
  name: string;
  role: string;
  desc: string;
  category: 'infantry' | 'vehicle' | 'air' | 'hero';
  cost: number;
  buildTime: number;
  hp: number;
  speed: number;
  turnRate: number; // rad / s
  radius: number;
  height: number; // for health bar placement
  armor: ArmorClass;
  sight: number;
  weapon?: WeaponDef;
  turret?: boolean; // weapon tracks independently of the hull
  flying?: boolean;
  harvester?: boolean;
  canCapture?: boolean;
  requires?: string[];
  model: string;
  hero?: boolean;
}

export interface BuildingDef {
  id: string;
  name: string;
  role: string;
  desc: string;
  category: 'structure' | 'defense' | 'neutral';
  cost: number;
  buildTime: number;
  hp: number;
  w: number; // footprint in cells (x)
  h: number; // footprint in cells (z)
  height: number;
  power: number; // positive = generates, negative = consumes
  sight: number;
  requires?: string[];
  weapon?: WeaponDef;
  needsPower?: boolean; // goes offline during a power shortage
  produces?: QueueKind;
  buildable: boolean;
  capturable?: boolean;
  invulnerable?: boolean;
  income?: number; // credits per second while owned
  model: string;
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  buildTime: number;
  requires: string[];
  glyph: string;
}

export type AbilityTargeting = 'point' | 'self';

export interface AbilityDef {
  id: string;
  name: string;
  desc: string;
  key: 'Q' | 'W' | 'E';
  cooldown: number;
  range: number; // cast range for point abilities
  radius: number; // area indicator radius
  targeting: AbilityTargeting;
  unlockLevel: number;
  glyph: string;
  color: string;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  lore: string;
  unit: UnitDef;
  abilities: [AbilityDef, AbilityDef, AbilityDef];
  accent: string;
}

export interface PowerDef {
  id: string;
  name: string;
  desc: string;
  cost: number; // requisition tokens
  cooldown: number;
  targeting: AbilityTargeting;
  radius: number;
  glyph: string;
  color: string;
}
