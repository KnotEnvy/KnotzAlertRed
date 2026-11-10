/**
 * Interface sounds and unit acknowledgements. They repeat constantly, so they are short,
 * quiet, rounded (little energy above 5 kHz) and centred.
 */
import { expTo, gate, glide, midiHz as hz, perc } from '../dsp';
import { bell, blip, brass, squelch, thud, whoosh } from './kit';
import type { SoundTable } from './types';

export const UI: SoundTable = {
  /** Pointer over a control: a barely-there wooden tick. Fires very often. */
  ui_hover: {
    bus: 'ui', dur: 0.06, level: -41.6, variants: 3, gap: 0.045, maxInst: 1, prio: 10, pitchVar: 0.03,
    gen: (m) => {
      blip(m, 0, m.r.vary(1150, 0.03), 1000, 0.01, 0.6, 'tri', 3500);
    },
  },
  /** Generic menu button press. */
  ui_click: {
    bus: 'ui', dur: 0.09, level: -30.5, variants: 3, gap: 0.03, maxInst: 2, prio: 40, pitchVar: 0.02,
    gen: (m) => {
      m.add(m.L(0.02).noise('white').env(perc(0.0002, 0.0015)).hp(2000).lp(6500), 0, 0.5);
      m.add(m.L(0.08).osc('sine', expTo(m.r.vary(1300, 0.04), 900, 0.01), perc(0.0005, 0.015)), 0, 0.5);
      m.add(m.L(0.05).osc('sine', 300, perc(0.001, 0.01)), 0, 0.3);
    },
  },
  /** Switching tabs: a two-step tick, the second higher. */
  ui_tab: {
    bus: 'ui', dur: 0.12, level: -30, variants: 2, gap: 0.04, maxInst: 2, prio: 40,
    gen: (m) => {
      blip(m, 0, 1000, 950, 0.012, 0.5, 'sine', 4000);
      blip(m, 0.03, 1400, 1350, 0.015, 0.5, 'sine', 4000);
      m.add(m.L(0.02).noise('white').env(perc(0.0002, 0.0012)).bp(3000, 1), 0, 0.2);
    },
  },
  /** Panel / dialog opening: an upward swoosh and a two-note rise. */
  ui_open: {
    bus: 'ui', dur: 0.45, level: -28.4, variants: 1, gap: 0.08, maxInst: 2, prio: 45,
    gen: (m) => {
      whoosh(m, 0, 0.16, 400, 2500, 0.3, 1.5);
      bell(m, 0.04, hz(81), 0.25, 0.12, 2, 0.8);
      bell(m, 0.1, hz(88), 0.22, 0.18, 2, 0.8);
    },
  },
  /** Panel / dialog closing: a downward swoosh and a two-note fall. */
  ui_close: {
    bus: 'ui', dur: 0.4, level: -29.5, variants: 1, gap: 0.08, maxInst: 2, prio: 45,
    gen: (m) => {
      whoosh(m, 0, 0.14, 2500, 450, 0.3, 1.5);
      bell(m, 0.03, hz(88), 0.22, 0.1, 2, 0.8);
      bell(m, 0.09, hz(81), 0.22, 0.16, 2, 0.8);
    },
  },
  /** Big positive confirmation (Deploy / Start): a punch, a bright chord bloom and a sparkle. */
  ui_confirm: {
    bus: 'ui', dur: 1.5, level: -19.5, variants: 1, gap: 0.5, maxInst: 1, prio: 90,
    gen: (m) => {
      whoosh(m, 0, 0.12, 300, 3000, 0.25, 1.2, (t) => (t < 0.12 ? (t / 0.12) ** 2 : 0));
      thud(m, 0.1, 150, 55, 0.15, 0.9, 1.8, 0.04);
      for (const n of [45, 52, 57, 61, 64]) brass(m, 0.1, hz(n), 0.45, 0.13, 1, 0.5);
      bell(m, 0.18, hz(81), 0.18, 0.5, 2, 1.4);
      bell(m, 0.26, hz(88), 0.16, 0.6, 2, 1.4);
      bell(m, 0.34, hz(93), 0.1, 0.6, 2, 1.2);
    },
  },
  /** Back / cancel: a soft falling blip. */
  ui_back: {
    bus: 'ui', dur: 0.15, level: -30.4, variants: 1, gap: 0.05, maxInst: 2, prio: 40,
    gen: (m) => {
      blip(m, 0, 900, 600, 0.05, 0.6, 'sine', 3000);
      m.add(m.L(0.02).noise('white').env(perc(0.0002, 0.0012)).bp(2500, 1), 0, 0.2);
    },
  },

  // -------------------------------------------------------------- legacy interface ids
  /** HUD button press (sidebar, powers). Slightly more mechanical than ui_click. */
  click: {
    bus: 'ui', dur: 0.09, level: -30, variants: 3, gap: 0.03, maxInst: 2, prio: 40, pitchVar: 0.02,
    gen: (m) => {
      m.add(m.L(0.02).noise('white').env(perc(0.0002, 0.002)).bp(3000, 1.2), 0, 0.5);
      m.add(m.L(0.08).osc('sine', expTo(m.r.vary(950, 0.04), 700, 0.012), perc(0.0005, 0.02)), 0, 0.5);
    },
  },
  /** Not allowed: a dull double buzz, low and short. */
  error: {
    bus: 'ui', dur: 0.26, level: -26.2, variants: 1, gap: 0.15, maxInst: 1, prio: 55,
    gen: (m) => {
      m.add(m.L(0.26).osc('square', 180, (t) => gate(0.004, 0.07)(t) + gate(0.105, 0.175)(t)).lp(900).drive(1.4), 0, 0.5);
    },
  },
  /** Unit selected: a soft rising radio blip. */
  select: {
    bus: 'ui', dur: 0.12, level: -29.3, variants: 3, gap: 0.05, maxInst: 2, prio: 40, pitchVar: 0.03,
    gen: (m) => {
      squelch(m, 0, 0.12);
      blip(m, 0.005, m.r.vary(900, 0.03), 1200, 0.035, 0.5, 'sine', 3500);
    },
  },
  /** Move order acknowledged: two quick rising radio blips. */
  ack: {
    bus: 'ui', dur: 0.17, level: -27.3, variants: 3, gap: 0.05, maxInst: 2, prio: 45, pitchVar: 0.03,
    gen: (m) => {
      squelch(m, 0, 0.15);
      blip(m, 0.005, 700, 900, 0.03, 0.45, 'tri', 3000);
      blip(m, 0.06, 1050, 1080, 0.04, 0.4, 'tri', 3000);
    },
  },
  /** Attack order acknowledged: a harder, falling pair with a low punch. */
  ack_attack: {
    bus: 'ui', dur: 0.2, level: -27.1, variants: 3, gap: 0.05, maxInst: 2, prio: 45, pitchVar: 0.03,
    gen: (m) => {
      squelch(m, 0, 0.15);
      m.add(m.L(0.1).osc('square', glide(520, 420, 0.05), perc(0.002, 0.04)).lp(2000), 0.004, 0.35);
      m.add(m.L(0.12).osc('square', glide(390, 300, 0.06), perc(0.002, 0.05)).lp(1800), 0.06, 0.35);
      thud(m, 0.004, 150, 90, 0.03, 0.35, 1.3);
    },
  },
};
