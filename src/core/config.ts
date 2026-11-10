/** Global tuning constants shared by simulation, rendering and UI. */
export const CELL = 2; // world units per nav cell
export const GRID = 120; // cells per map side
export const WORLD = CELL * GRID; // world units per map side

export const TEAM_PLAYER = 0;
export const TEAM_ENEMY = 1;
export const TEAM_NEUTRAL = 2;

export const FLY_HEIGHT = 7.5;
export const BUILD_RADIUS = 20; // max distance from an owned structure when placing
export const SELL_REFUND = 0.5;
export const MAX_QUEUE = 9;
export const MAX_REQUISITION = 5;
export const REQ_SECONDS = 70; // base seconds per requisition token
export const HERO_SHARE_RADIUS = 22;
export const HERO_MAX_LEVEL = 5;
export const HERO_XP = [0, 180, 480, 950, 1600]; // xp needed to reach level index+1

export const TEAM_COLORS = [
  { name: 'Aegis Coalition', hex: '#2f8bff', rgb: [0.18, 0.52, 1.0] as const, dark: [0.07, 0.2, 0.45] as const },
  { name: 'Crimson Dominion', hex: '#ff3d2e', rgb: [1.0, 0.2, 0.14] as const, dark: [0.42, 0.06, 0.05] as const },
  { name: 'Neutral', hex: '#c9b27a', rgb: [0.72, 0.66, 0.5] as const, dark: [0.3, 0.28, 0.22] as const },
];

export type Difficulty = 'easy' | 'normal' | 'hard';
export type ThemeId = 'verdant' | 'scorched' | 'frost';

export interface GameConfig {
  hero: string;
  difficulty: Difficulty;
  theme: ThemeId;
  seed: number;
}
