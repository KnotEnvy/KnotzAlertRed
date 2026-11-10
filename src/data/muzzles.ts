/**
 * Where each model's weapon ends: [forward, up, side] from the entity origin, in world units,
 * along the aim direction. `side` is the lateral offset alternated between shots of a burst.
 * Kept beside the data (not in the model pack) so the headless simulation can read it.
 */
export const MUZZLES: Record<string, readonly [number, number, number?]> = {
  trooper: [1.2, 1.38],
  lancer: [1.0, 1.9],
  grenadier: [0.95, 1.36],
  buggy: [0.95, 1.8],
  tank: [3.4, 1.56],
  artillery: [3.3, 3.7],
  titan: [4.6, 1.98, 0.46],
  gunship: [1.0, -0.1, 1.25],
  hero_rook: [5.3, 2.14],
  hero_nyx: [0.8, 4.6],
  hero_kade: [4.6, 2.6],
  sentry: [2.5, 2.8, 0.26],
  cannon: [4.5, 2.75],
  arc: [0, 6.65],
};
