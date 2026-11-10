/**
 * Custom SVG cursors (CSS cursor strings). Each is a 32×32 vector with a dark outline so it reads
 * over snow and shadow alike, and a plain CSS fallback.
 */
function cur(svg: string, x: number, y: number, fallback: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${svg}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(doc)}") ${x} ${y}, ${fallback}`;
}

const ARROW = '<path d="M4 3l18.5 11.2-8.3 1.6 5 9.4-3.6 1.9-5-9.5L5 23.2z" fill="#0a1018" stroke="#0a1018" stroke-width="3" stroke-linejoin="round"/><path d="M4 3l18.5 11.2-8.3 1.6 5 9.4-3.6 1.9-5-9.5L5 23.2z" fill="#dce7ec"/><path d="M4 3l1 20.2 5.6-5.6" fill="none" stroke="#42e6ef" stroke-width="1.2"/>';

export const CURSORS = {
  default: cur(ARROW, 4, 3, 'default'),
  /** Pointer for clickable interface controls. */
  pointer: cur(`${ARROW}<circle cx="24" cy="24" r="4" fill="#0a1018"/><circle cx="24" cy="24" r="2.4" fill="#42e6ef"/>`, 4, 3, 'pointer'),
  /** Hovering something selectable. */
  select: cur(
    `${ARROW}<path d="M19 19h-1v-2h4v4h-2zM29 19v-2h-4v2h2v2h2zM19 29h-1v2h4v-2h-2v-2h-2zM29 29v2h-4v-2h2v-2h2z" fill="#42e6ef" stroke="#0a1018" stroke-width="0.8"/>`,
    4,
    3,
    'pointer',
  ),
  /** Units selected, pointing at open ground. */
  move: cur(
    '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5l6 6 6-6M10 27l6-6 6 6M5 10l6 6-6 6M27 10l-6 6 6 6" stroke="#0a1018" stroke-width="5"/><path d="M10 5l6 6 6-6M10 27l6-6 6 6M5 10l6 6-6 6M27 10l-6 6 6 6" stroke="#42e6ef" stroke-width="2.2"/></g><circle cx="16" cy="16" r="2.2" fill="#dce7ec" stroke="#0a1018" stroke-width="1.5"/>',
    16,
    16,
    'crosshair',
  ),
  /** Pointing at an enemy with units selected, or attack-move armed. */
  attack: cur(
    '<g fill="none"><circle cx="16" cy="16" r="9" stroke="#0a1018" stroke-width="5"/><path d="M16 2v8M16 22v8M2 16h8M22 16h8" stroke="#0a1018" stroke-width="5" stroke-linecap="round"/><circle cx="16" cy="16" r="9" stroke="#ff4d5c" stroke-width="2.2"/><path d="M16 2v8M16 22v8M2 16h8M22 16h8" stroke="#ff4d5c" stroke-width="2.2" stroke-linecap="round"/></g><circle cx="16" cy="16" r="2" fill="#ffd0d4"/>',
    16,
    16,
    'crosshair',
  ),
  /** Ability / support-power targeting. */
  target: cur(
    '<g fill="none" stroke-linecap="square"><path d="M4 11V4h7M21 4h7v7M28 21v7h-7M11 28H4v-7" stroke="#0a1018" stroke-width="5"/><path d="M4 11V4h7M21 4h7v7M28 21v7h-7M11 28H4v-7" stroke="#ffa63d" stroke-width="2.2"/><circle cx="16" cy="16" r="5.5" stroke="#0a1018" stroke-width="4.5"/><circle cx="16" cy="16" r="5.5" stroke="#ffd18f" stroke-width="1.8"/></g><circle cx="16" cy="16" r="1.6" fill="#fff"/>',
    16,
    16,
    'crosshair',
  ),
  /** Valid building placement. */
  place: cur(
    '<g fill="none"><rect x="5" y="5" width="22" height="22" stroke="#0a1018" stroke-width="5"/><rect x="5" y="5" width="22" height="22" stroke="#42e6ef" stroke-width="2" stroke-dasharray="6 4"/><path d="M16 10v12M10 16h12" stroke="#0a1018" stroke-width="5"/><path d="M16 10v12M10 16h12" stroke="#dce7ec" stroke-width="2"/></g>',
    16,
    16,
    'cell',
  ),
  /** Invalid placement / no valid target. */
  invalid: cur(
    '<g fill="none"><circle cx="16" cy="16" r="10" stroke="#0a1018" stroke-width="5.5"/><path d="M9 23L23 9" stroke="#0a1018" stroke-width="5.5"/><circle cx="16" cy="16" r="10" stroke="#ff4d5c" stroke-width="2.6"/><path d="M9 23L23 9" stroke="#ff4d5c" stroke-width="2.6"/></g>',
    16,
    16,
    'not-allowed',
  ),
};

/** Expose the interface cursors to CSS (`--cur-default`, `--cur-pointer`). */
export function installCursorVars(): void {
  const s = document.documentElement.style;
  s.setProperty('--cur-default', CURSORS.default);
  s.setProperty('--cur-pointer', CURSORS.pointer);
}
