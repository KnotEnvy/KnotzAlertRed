/**
 * Inline SVG icon set for abilities, powers, upgrades and interface chrome. Drawn as vectors so
 * the interface never depends on which symbol fonts happen to be installed on the player's machine.
 */
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const T = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor" stroke="none"';
const H = 'fill="currentColor" stroke="none" opacity="0.35"';

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

  // resources
  credits: `<path ${H} d="M12 2l6.5 8.5L12 22 5.5 10.5z"/><path ${T} d="M12 2l6.5 8.5L12 22 5.5 10.5zM5.5 10.5h13M12 2l-2.6 8.5L12 22l2.6-11.5z"/>`,
  power: `<path ${F} d="M13.6 1.8L5 13.4h5.6l-1.4 8.8 8.8-12h-5.8z"/>`,
  star: `<path ${F} d="M12 2.2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.1l-6.1 3.5 1.5-6.8-5.2-4.6 6.9-.7z"/>`,
  clock: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 7v5.5l3.5 2"/>`,

  // sidebar tabs
  tab_structure: `<path ${S} d="M3 21V10l9-6 9 6v11z"/><path ${S} d="M9 21v-6h6v6"/>`,
  tab_defense: `<path ${S} d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10.5-4.6-1.9-8-5.5-8-10.5v-6z"/><path ${F} d="M12 7l1.5 3.2 3.4.4-2.5 2.3.7 3.4-3.1-1.7-3.1 1.7.7-3.4-2.5-2.3 3.4-.4z"/>`,
  tab_infantry: `<circle ${S} cx="12" cy="6" r="3"/><path ${S} d="M5.5 21v-4.5A6.5 6.5 0 0112 10a6.5 6.5 0 016.5 6.5V21"/>`,
  tab_vehicle: `<path ${S} d="M2.5 15.5h19l-2 4h-15z"/><path ${S} d="M5 15.5l1.5-4h9l1.5 4M10 11.5V9h5.5M15.5 9h6"/>`,
  tab_air: `<path ${S} d="M12 3v18M3 11l9-3 9 3M8 21h8M12 3l-2 2.5M12 3l2 2.5"/><circle ${S} cx="12" cy="11" r="2"/>`,
  tab_tech: `<path ${S} d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 001.3 2.2h12.4a1.5 1.5 0 001.3-2.2L14 9V3"/><path ${S} d="M7 15h10"/>`,

  // commands
  attackMove: `<path ${S} d="M4 20L18 6M13 5.5h5.5V11"/><path ${S} d="M4 14l6 6"/>`,
  stop: `<rect ${S} x="5" y="5" width="14" height="14" rx="1.5"/>`,
  hold: `<path ${S} d="M12 21V8M7 13l5-5 5 5"/><path ${S} d="M5 3.5h14"/>`,
  repair: `<path ${S} d="M14.5 6.5a4.5 4.5 0 015.7 5.7L11 21.4a2 2 0 01-2.8 0l-.6-.6a2 2 0 010-2.8l9.2-9.2"/><path ${S} d="M4 4l5 5M3 8l5-5"/>`,
  primary: `<path ${F} d="M12 2.5l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 16.9 6.3 20l1.2-6.4-4.7-4.4 6.4-.8z"/>`,
  sell: `<path ${S} d="M12 3v18M16.5 7H10a3 3 0 000 6h4a3 3 0 010 6H7"/>`,

  // interface chrome
  menu: `<path ${S} d="M4 6.5h16M4 12h16M4 17.5h16"/>`,
  help: `<circle ${S} cx="12" cy="12" r="9.5"/><path ${S} d="M9.2 9.2a2.9 2.9 0 015.6 1c0 2-2.8 2.4-2.8 4.2"/><circle ${F} cx="12" cy="17.4" r="1.2"/>`,
  manual: `<path ${S} d="M4 4.5A1.5 1.5 0 015.5 3H11v17H5.5A1.5 1.5 0 014 18.5zM20 4.5A1.5 1.5 0 0018.5 3H13v17h5.5a1.5 1.5 0 001.5-1.5z"/>`,
  settings: `<circle ${S} cx="12" cy="12" r="3.2"/><path ${S} d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>`,
  play: `<path ${F} d="M7 3.5v17l14-8.5z"/>`,
  back: `<path ${S} d="M15 5l-7 7 7 7"/>`,
  restart: `<path ${S} d="M4 12a8 8 0 108-8 8.4 8.4 0 00-5.8 2.4L4 8.5"/><path ${S} d="M4 3.5v5h5"/>`,
  exit: `<path ${S} d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>`,
  eye: `<path ${S} d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle ${S} cx="12" cy="12" r="3"/>`,
  close: `<path ${S} d="M6 6l12 12M18 6L6 18"/>`,
  check: `<path ${S} d="M4.5 12.5l5 5 10-11"/>`,
  arrow: `<path ${S} d="M5 12h14M13 6l6 6-6 6"/>`,
  speaker: `<path ${F} d="M3 9h4l5-4.5v15L7 15H3z"/><path ${S} d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/>`,
  monitor: `<rect ${S} x="2.5" y="4" width="19" height="13" rx="1.5"/><path ${S} d="M8 21h8M12 17v4"/>`,
  mouse: `<rect ${S} x="6" y="2.5" width="12" height="19" rx="6"/><path ${S} d="M12 6.5v4"/>`,
  // notices
  info: `<circle ${S} cx="12" cy="12" r="9.5"/><path ${S} d="M12 11v6"/><circle ${F} cx="12" cy="7.5" r="1.3"/>`,
  warn: `<path ${S} d="M12 3L2 20.5h20z"/><path ${S} d="M12 9.5v5"/><circle ${F} cx="12" cy="17.3" r="1.2"/>`,
  bad: `<path ${S} d="M8 2.5h8L21.5 8v8L16 21.5H8L2.5 16V8z"/><path ${S} d="M12 7v6.5"/><circle ${F} cx="12" cy="16.8" r="1.3"/>`,
  good: `<circle ${S} cx="12" cy="12" r="9.5"/><path ${S} d="M7.5 12.5l3 3 6-6.5"/>`,
  // misc
  lock: `<path ${S} d="M7.5 11V8a4.5 4.5 0 019 0v3"/><rect ${F} x="5" y="11" width="14" height="10" rx="1.5"/>`,
  crystal: `<path ${S} d="M12 2l6 8-6 12-6-12z"/><path ${S} d="M6 10h12"/>`,
  trophy: `<path ${S} d="M7 3.5h10v5a5 5 0 01-10 0zM12 13.5V18M8 21h8M7 5.5H3.5v1.5A3.5 3.5 0 007 10.5M17 5.5h3.5v1.5a3.5 3.5 0 01-3.5 3.5"/>`,
  skull: `<path ${S} d="M5 11a7 7 0 1114 0v3.5l-2 1V20H7v-4.5l-2-1z"/><circle ${F} cx="9" cy="11.5" r="1.8"/><circle ${F} cx="15" cy="11.5" r="1.8"/><path ${S} d="M10.5 20v-2.5M13.5 20v-2.5"/>`,
  target: `<circle ${S} cx="12" cy="12" r="8"/><circle ${S} cx="12" cy="12" r="3.5"/><path ${S} d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>`,
};

export function glyph(id: string, fallback = ''): string {
  const p = PATHS[id];
  if (!p) return fallback;
  return `<svg class="svg-glyph" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}

/**
 * The Aegis emblem: a chamfered cobalt shield carrying a cyan Aurium core under a crimson
 * alert chevron. Used by the logo lockup, loading screen and favicon.
 */
export function emblem(cls = 'emblem'): string {
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="emb-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a6fe0"/><stop offset="1" stop-color="#16367f"/></linearGradient>
      <linearGradient id="emb-core" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8fbff"/><stop offset="1" stop-color="#2bc6d6"/></linearGradient>
    </defs>
    <path d="M18 3h28l14 14v20L32 61 4 37V17z" fill="#0b1220" stroke="#dce7ec" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M20 9h24l10 10v16L32 54 10 35V19z" fill="url(#emb-plate)"/>
    <path d="M32 18l8 11-8 15-8-15z" fill="url(#emb-core)"/>
    <path d="M32 18l8 11h-16z" fill="#ffffff" opacity="0.45"/>
    <path d="M14 22l18 10 18-10v6L32 38 14 28z" fill="#e2434f"/>
  </svg>`;
}
