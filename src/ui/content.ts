import type { Difficulty, ThemeId } from '../core/config';

export const DIFFICULTIES: { id: Difficulty; name: string; blurb: string; level: number }[] = [
  { id: 'easy', name: 'Recruit', blurb: 'Slow, small attack waves. Learn the ropes.', level: 1 },
  { id: 'normal', name: 'Commander', blurb: 'A fair fight with escalating assaults.', level: 2 },
  { id: 'hard', name: 'Warlord', blurb: 'Rich, fast and relentless. Expect orbital strikes.', level: 3 },
];

export const THEMES: { id: ThemeId; name: string; blurb: string }[] = [
  { id: 'verdant', name: 'Verdant Basin', blurb: 'Temperate valleys and pine forests.' },
  { id: 'scorched', name: 'Scorched Dunes', blurb: 'Sun-baked canyons and red rock.' },
  { id: 'frost', name: 'Frostline', blurb: 'Snowfields under a pale sky.' },
];

export function themeName(id: string): string {
  return THEMES.find((t) => t.id === id)?.name ?? id;
}

export function difficultyName(id: string): string {
  return DIFFICULTIES.find((d) => d.id === id)?.name ?? id;
}

/** Rotating field tips for the loading screen. */
export const TIPS: string[] = [
  'Build a <b>Fusion Reactor</b> first, then an <b>Aurium Refinery</b> — it arrives with a free Harvester.',
  'Keep power demand below supply. A shortage halves production and shuts down Arc Pylons.',
  'Production is pay-as-you-build: if credits run dry, the queue simply waits.',
  'Park infantry beside a neutral <b>Aurium Extractor</b> to capture it for steady income.',
  'Holding the <b>Signal Obelisk</b> nearly doubles Requisition and reveals the centre of the map.',
  'Bullets shred infantry. Shells and rockets crack armour. Explosives level buildings.',
  'Units earn veterancy from kills — Elite units hit harder and repair themselves.',
  'Your hero gains XP from nearby kills. The ultimate ability unlocks at level 3.',
  'A fallen hero revives at the Command Center. Keep it standing.',
  'Press <b>Space</b> to jump to the last alert and <b>B</b> to return to your base.',
  'Ctrl + a number assigns a control group; tap the number twice to jump to it.',
  'Shift + right-click queues waypoints. <b>A</b> then click orders an attack-move.',
  'Several factories of the same type speed up that queue.',
];
