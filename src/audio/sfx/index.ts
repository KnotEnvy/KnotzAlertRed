import { ABILITIES } from './abilities';
import { AMBIENT } from './ambient';
import { EVENTS } from './events';
import { EXPLOSIONS } from './explosions';
import type { SoundTable } from './types';
import { UI } from './ui';
import { WEAPONS } from './weapons';

export type { Bus, SoundDef, SoundTable } from './types';

/** Every sound id the game can play. */
export const SOUNDS: SoundTable = { ...WEAPONS, ...EXPLOSIONS, ...ABILITIES, ...EVENTS, ...UI, ...AMBIENT };

/** Sound ids grouped for the soundboard and the render report. */
export const SOUND_GROUPS: { name: string; ids: string[] }[] = [
  { name: 'Weapons', ids: Object.keys(WEAPONS) },
  { name: 'Explosions & destruction', ids: Object.keys(EXPLOSIONS) },
  { name: 'Abilities & support powers', ids: Object.keys(ABILITIES) },
  { name: 'Base & economy', ids: ['build_start', 'place', 'sell', 'cash', 'ready', 'upgrade', 'unit_ready', 'no_funds', 'powerdown', 'powerup'] },
  { name: 'Outposts, heroes & veterancy', ids: ['capture', 'capture_lost', 'promote', 'levelup', 'hero_ready'] },
  { name: 'Alerts & stingers', ids: ['alert', 'objective', 'victory', 'defeat'] },
  { name: 'Announcer earcons', ids: ['vo_alert', 'vo_good', 'vo_bad', 'vo_info'] },
  { name: 'Interface', ids: Object.keys(UI) },
  { name: 'Ambience one-shots', ids: Object.keys(AMBIENT) },
];

/** Order in which buffers are pre-rendered after the audio unlocks (most urgent first). */
export const WARM_ORDER: string[] = [
  ...Object.keys(UI),
  'vo_alert', 'vo_good', 'vo_bad', 'vo_info',
  ...Object.keys(WEAPONS),
  'explosion_s', 'explosion_m', 'death', 'explosion_l',
  ...Object.keys(SOUNDS),
];

/** One-line descriptions of where each sound is used (soundboard and report). */
export const SOUND_NOTES: Record<string, string> = {
  rifle: 'Trooper rifle',
  mg: 'Lynx Buggy MG, Sentry Gun',
  sniper: 'Warden Kade rifle',
  sniper_big: 'Kade ultimate shot',
  cannon: 'Mauler tank, Rampart Cannon',
  cannon_heavy: 'Titan, Commander Rook',
  artillery: 'Longbow launch, Rook barrage call',
  rocket: 'Lancer, Kestrel Gunship',
  thump: 'Grenadier launcher',
  arc: 'Arc Pylon, Seraph Nyx, storm ticks',
  arc_big: 'Nyx chain lightning / storm cast',
  explosion_s: 'Rocket and shell impacts',
  explosion_m: 'Vehicle destroyed, light lob impact',
  explosion_l: 'Heavy vehicle destroyed, heavy shell impact',
  collapse: 'Structure destroyed',
  death: 'Infantry casualty',
  drop_land: 'Armor Drop landing',
  lance_charge: 'Orbital Lance charging (2.6 s)',
  lance: 'Orbital Lance strike',
  emp: 'Kade EMP',
  blink: 'Nyx Blink',
  shield: 'Rook Bastion shield',
  rally: 'Rook Rally',
  mark: 'Kade Mark Target',
  scan: 'Recon Sweep, drop beacon',
  build_start: 'Production started',
  place: 'Structure placed',
  sell: 'Sold / cancelled (refund)',
  cash: 'Credits in: harvester unload, supply cache',
  ready: 'Construction complete',
  upgrade: 'Research complete',
  unit_ready: 'Unit ready at factory',
  no_funds: 'Insufficient funds',
  powerdown: 'Low power',
  powerup: 'Power restored',
  capture: 'Outpost captured',
  capture_lost: 'Outpost lost',
  promote: 'Veterancy promotion',
  levelup: 'Hero level up',
  hero_ready: 'Hero revived',
  alert: 'Base / harvester / hero under attack',
  objective: 'Objective complete (checklist)',
  victory: 'Victory stinger',
  defeat: 'Defeat stinger',
  vo_alert: 'Announcer earcon: alert',
  vo_good: 'Announcer earcon: good news',
  vo_bad: 'Announcer earcon: bad news',
  vo_info: 'Announcer earcon: information',
  ui_hover: 'Pointer over a control (rate-limited)',
  ui_click: 'Menu button press',
  ui_tab: 'Tab switch',
  ui_open: 'Panel opens',
  ui_close: 'Panel closes',
  ui_confirm: 'Big confirm (Deploy)',
  ui_back: 'Back / cancel',
  click: 'HUD button press',
  error: 'Not allowed',
  select: 'Unit selected',
  ack: 'Move order acknowledged',
  ack_attack: 'Attack order acknowledged',
  amb_bird: 'Verdant ambience: bird',
  amb_gust: 'Scorched / Frost ambience: gust',
  amb_creak: 'Frost ambience: ice creak',
};
