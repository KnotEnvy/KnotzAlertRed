export interface Settings {
  sfx: number;
  music: number;
  voice: boolean;
  shadows: boolean;
  bloom: boolean;
  edgeScroll: boolean;
  lastHero: string;
  lastDifficulty: string;
  lastTheme: string;
}

const KEY = 'knotz-alert-red-settings-v1';

const DEFAULTS: Settings = {
  sfx: 0.7,
  music: 0.35,
  voice: true,
  shadows: true,
  bloom: true,
  edgeScroll: true,
  lastHero: 'rook',
  lastDifficulty: 'normal',
  lastTheme: 'verdant',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage may be unavailable */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
