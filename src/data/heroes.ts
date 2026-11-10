import type { HeroDef, PowerDef, UpgradeDef } from './types';

/** Three commanders with distinct kits. Each side fields one; it levels up and revives at the HQ. */
export const HERO_DEFS: Record<string, HeroDef> = {
  rook: {
    id: 'rook',
    name: 'Commander Rook',
    title: 'The Iron Bulwark',
    lore: 'Leads from the front in a command tank. Turns a tank column into a battering ram.',
    accent: '#ffb347',
    unit: {
      id: 'hero_rook',
      name: 'Commander Rook',
      role: 'Hero · Command tank',
      desc: 'Armoured hero who empowers nearby forces.',
      category: 'hero',
      cost: 0,
      buildTime: 0,
      hp: 1500,
      speed: 7.2,
      turnRate: 2.8,
      radius: 1.9,
      height: 3.0,
      armor: 'heavy',
      sight: 20,
      turret: true,
      hero: true,
      weapon: {
        damage: 78, range: 15, cooldown: 1.5, type: 'shell', projectile: 'shell', speed: 75, splash: 1.5,
        hitsAir: false, hitsGround: true, sfx: 'cannon_heavy',
      },
      model: 'hero_rook',
    },
    abilities: [
      {
        id: 'barrage', name: 'Thunder Barrage', key: 'Q', cooldown: 16, range: 24, radius: 6.5, targeting: 'point',
        unlockLevel: 1, glyph: '✸', color: '#ffb347',
        desc: 'Calls six heavy shells onto the target area.',
      },
      {
        id: 'rally', name: 'Rally Cry', key: 'W', cooldown: 30, range: 0, radius: 16, targeting: 'self',
        unlockLevel: 1, glyph: '⚑', color: '#ffe27a',
        desc: 'Nearby allies gain +35% fire rate and +25% speed for 10 seconds.',
      },
      {
        id: 'bastion', name: 'Bastion Protocol', key: 'E', cooldown: 65, range: 0, radius: 15, targeting: 'self',
        unlockLevel: 3, glyph: '⛨', color: '#7fd4ff',
        desc: 'ULTIMATE · Nearby allies take 60% less damage and are repaired for 8 seconds.',
      },
    ],
  },
  nyx: {
    id: 'nyx',
    name: 'Seraph Nyx',
    title: 'The Stormcaller',
    lore: 'An Aurium-attuned battle mage. Fragile, mobile, and catastrophic to clumped armies.',
    accent: '#b58cff',
    unit: {
      id: 'hero_nyx',
      name: 'Seraph Nyx',
      role: 'Hero · Stormcaller',
      desc: 'Arc-wielding hero with burst damage and a blink.',
      category: 'hero',
      cost: 0,
      buildTime: 0,
      hp: 850,
      speed: 8.2,
      turnRate: 10,
      radius: 0.9,
      height: 3.2,
      armor: 'light',
      sight: 21,
      hero: true,
      canCapture: true,
      weapon: {
        damage: 46, range: 14, cooldown: 1.1, type: 'energy', projectile: 'arc', chain: 2,
        hitsAir: true, hitsGround: true, sfx: 'arc',
      },
      model: 'hero_nyx',
    },
    abilities: [
      {
        id: 'chain', name: 'Chain Lightning', key: 'Q', cooldown: 10, range: 20, radius: 5, targeting: 'point',
        unlockLevel: 1, glyph: 'ϟ', color: '#b58cff',
        desc: 'A bolt strikes the nearest enemy to the target point and leaps to five more.',
      },
      {
        id: 'blink', name: 'Phase Blink', key: 'W', cooldown: 14, range: 26, radius: 5.5, targeting: 'point',
        unlockLevel: 1, glyph: '➹', color: '#8ef0ff',
        desc: 'Teleport instantly. Enemies at the arrival point are stunned for 1.5 seconds.',
      },
      {
        id: 'tempest', name: 'Tempest', key: 'E', cooldown: 70, range: 22, radius: 9.5, targeting: 'point',
        unlockLevel: 3, glyph: '☈', color: '#d2a8ff',
        desc: 'ULTIMATE · An 8 second storm that shocks and slows everything hostile inside it.',
      },
    ],
  },
  kade: {
    id: 'kade',
    name: 'Warden Kade',
    title: 'The Ghost',
    lore: 'A long-range operative. Picks apart high-value targets and sets up the kill.',
    accent: '#7dffb0',
    unit: {
      id: 'hero_kade',
      name: 'Warden Kade',
      role: 'Hero · Marksman',
      desc: 'Sniper hero who disables armour and marks kill zones.',
      category: 'hero',
      cost: 0,
      buildTime: 0,
      hp: 700,
      speed: 7.6,
      turnRate: 10,
      radius: 0.85,
      height: 2.9,
      armor: 'infantry',
      sight: 25,
      hero: true,
      canCapture: true,
      weapon: {
        damage: 95, range: 21, cooldown: 1.6, type: 'energy', projectile: 'bullet',
        hitsAir: true, hitsGround: true, sfx: 'sniper',
      },
      model: 'hero_kade',
    },
    abilities: [
      {
        id: 'deadeye', name: 'Deadeye', key: 'Q', cooldown: 12, range: 30, radius: 4, targeting: 'point',
        unlockLevel: 1, glyph: '⌖', color: '#7dffb0',
        desc: 'A single armour-piercing round for massive damage to the enemy nearest the target point.',
      },
      {
        id: 'emp', name: 'EMP Charge', key: 'W', cooldown: 22, range: 18, radius: 7.5, targeting: 'point',
        unlockLevel: 1, glyph: '◎', color: '#6fd8ff',
        desc: 'Disables enemy vehicles, aircraft and defences in the area for 5 seconds.',
      },
      {
        id: 'killzone', name: 'Kill Zone', key: 'E', cooldown: 60, range: 28, radius: 11, targeting: 'point',
        unlockLevel: 3, glyph: '☠', color: '#ff6b6b',
        desc: 'ULTIMATE · Marks an area for 12 seconds. Enemies inside are revealed and take +50% damage.',
      },
    ],
  },
};

export const HERO_ORDER = ['rook', 'nyx', 'kade'];

/** Support powers bought with Requisition tokens (earned over time and through combat). */
export const POWER_DEFS: Record<string, PowerDef> = {
  cache: {
    id: 'cache', name: 'Supply Cache', cost: 1, cooldown: 20, targeting: 'self', radius: 0, glyph: '⬙', color: '#ffd24a',
    desc: 'An emergency shipment of 800 credits.',
  },
  recon: {
    id: 'recon', name: 'Recon Sweep', cost: 1, cooldown: 30, targeting: 'point', radius: 24, glyph: '◉', color: '#7fd4ff',
    desc: 'Reveals a large area anywhere on the map for 25 seconds.',
  },
  drop: {
    id: 'drop', name: 'Armor Drop', cost: 2, cooldown: 60, targeting: 'point', radius: 6, glyph: '⤓', color: '#9dff8a',
    desc: 'Orbital pods deliver two veteran Mauler Tanks and three Troopers to the target.',
  },
  lance: {
    id: 'lance', name: 'Orbital Lance', cost: 3, cooldown: 90, targeting: 'point', radius: 9, glyph: '☄', color: '#ff7a5c',
    desc: 'After a short delay, an orbital beam devastates everything in the area.',
  },
};

export const POWER_ORDER = ['cache', 'recon', 'drop', 'lance'];

export const UPGRADE_DEFS: Record<string, UpgradeDef> = {
  ap_rounds: {
    id: 'ap_rounds', name: 'AP Munitions', cost: 1000, buildTime: 28, requires: ['techlab'], glyph: '➶',
    desc: 'All units and defences deal +20% damage.',
  },
  plating: {
    id: 'plating', name: 'Composite Plating', cost: 1000, buildTime: 28, requires: ['techlab'], glyph: '⛊',
    desc: 'Vehicles and aircraft gain +20% hit points.',
  },
  turbo: {
    id: 'turbo', name: 'Turbo Harvesting', cost: 800, buildTime: 22, requires: ['techlab'], glyph: '⛏',
    desc: 'Harvesters carry 50% more Aurium and move 20% faster.',
  },
  nanites: {
    id: 'nanites', name: 'Nanite Repair', cost: 1200, buildTime: 32, requires: ['techlab'], glyph: '✚',
    desc: 'Units out of combat slowly repair themselves.',
  },
};

export const UPGRADE_ORDER = ['ap_rounds', 'plating', 'turbo', 'nanites'];
