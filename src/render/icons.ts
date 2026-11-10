import { BUILDING_DEFS } from '../data/buildings';
import { HERO_DEFS } from '../data/heroes';
import { UNIT_DEFS } from '../data/units';

/**
 * HUD portraits. They are rendered offline in Blender from the same models the game draws
 * (`npm run assets` writes them to public/art/icons), keyed here by unit / structure id.
 */
export function portraitUrls(): Record<string, string> {
  const base = `${import.meta.env.BASE_URL}art/icons/`;
  const icons: Record<string, string> = {};
  for (const d of Object.values(UNIT_DEFS)) icons[d.id] = `${base}${d.model}.webp`;
  for (const h of Object.values(HERO_DEFS)) icons[h.unit.id] = `${base}${h.unit.model}.webp`;
  for (const d of Object.values(BUILDING_DEFS)) icons[d.id] = `${base}${d.model}.webp`;
  return icons;
}

/** Fetch and decode every portrait so build buttons never pop in late. */
export async function preloadPortraits(icons: Record<string, string>): Promise<void> {
  await Promise.all(
    [...new Set(Object.values(icons))].map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  );
}
