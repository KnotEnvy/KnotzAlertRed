/**
 * Inline SVG icon set for abilities, powers and upgrades. Drawn as vectors so the HUD does
 * not depend on which symbol fonts happen to be installed on the player's machine.
 */
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor" stroke="none"';

const PATHS: Record<string, string> = {
  // hero abilities
  barrage: `<path ${F} d="M12 1.5l2.1 6.4 6-3-3 6 6.4 2.1-6.4 2.1 3 6-6-3L12 22.5l-2.1-6.4-6 3 3-6L.5 13l6.4-2.1-3-6 6 3z"/>`,
  rally: `<path ${S} d="M6 3v18"/><path ${F} d="M6 4h12l-3 4 3 4H6z"/>`,
  bastion: `<path ${S} d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10.5-4.6-1.9-8-5.5-8-10.5v-6z"/><path ${S} d="M12 7v9M8 11h8"/>`,
  chain: `<path ${F} d="M13.5 1.5L4 13.5h6.2L8.8 22.5 20 9.5h-6.5z"/>`,
  blink: `<path ${S} d="M3 12h9M9 6l6 6-6 6M15 6l6 6-6 6"/>`,
  tempest: `<path ${S} d="M7 14a4.2 4.2 0 01-.3-8.4A5.3 5.3 0 0117 6.2 4 4 0 0117.5 14"/><path ${F} d="M12.5 11l-4 6h3l-1.2 5.5 4.7-7h-3z"/>`,
  deadeye: `<circle ${S} cx="12" cy="12" r="7"/><path ${S} d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle ${F} cx="12" cy="12" r="1.6"/>`,
  emp: `<circle ${S} cx="12" cy="12" r="9.5" stroke-dasharray="4 3"/><circle ${S} cx="12" cy="12" r="5.5"/><circle ${F} cx="12" cy="12" r="2"/>`,
  killzone: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M8 8l8 8M16 8l-8 8"/>`,
  // support powers
  cache: `<path ${S} d="M3 8l9-5 9 5v8.5l-9 5-9-5z"/><path ${S} d="M3 8l9 5 9-5M12 13v8.5"/>`,
  recon: `<path ${S} d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle ${F} cx="12" cy="12" r="3"/>`,
  drop: `<path ${S} d="M12 2.5v12M6.5 9.5l5.5 5.5 5.5-5.5M4 20.5h16"/>`,
  lance: `<path ${F} d="M10 1.5h4L13.2 15h-2.4z"/><path ${S} d="M4 21.5l3.5-4M20 21.5l-3.5-4M12 22.5v-4M2.5 16.5h4.5M17 16.5h4.5"/>`,
  // upgrades
  ap_rounds: `<path ${S} d="M12 2c3 2.6 4 5.6 4 9v10H8V11c0-3.4 1-6.4 4-9z"/><path ${S} d="M8 16h8"/>`,
  plating: `<path ${S} d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10.5-4.6-1.9-8-5.5-8-10.5v-6z"/><path ${S} d="M12 6.5l4.5 1.7v3.6c0 2.8-1.8 4.9-4.5 6.2-2.7-1.3-4.5-3.4-4.5-6.2V8.2z"/>`,
  turbo: `<path ${S} d="M5 13l7-7 7 7M5 20l7-7 7 7"/>`,
  nanites: `<circle ${S} cx="12" cy="12" r="9.5"/><path ${S} d="M12 7v10M7 12h10"/>`,
  // misc
  lock: `<path ${S} d="M7.5 11V8a4.5 4.5 0 019 0v3"/><rect ${F} x="5" y="11" width="14" height="10" rx="1.5"/>`,
  crystal: `<path ${S} d="M12 2l6 8-6 12-6-12z"/><path ${S} d="M6 10h12"/>`,
};

export function glyph(id: string, fallback = ''): string {
  const p = PATHS[id];
  if (!p) return fallback;
  return `<svg class="svg-glyph" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}
