/**
 * Base, economy, hero and match events, end-of-match stingers and the announcer earcons.
 * These are the "reward" sounds: tonal, short and pleasant, never shrill.
 */
import { expTo, gate, glide, midiHz as hz, perc, perc2, swell } from '../dsp';
import { bell, blip, body, brass, clank, crunch, squelch, thud } from './kit';
import type { SoundTable } from './types';

/** A soft sustained chord bed under chimes. */
function bed(m: Parameters<SoundTable[string]['gen']>[0], at: number, notes: number[], len: number, amp: number, lp = 1600): void {
  const l = m.L(len + 1.2);
  const env = swell(0.05, len, 0.35);
  for (const n of notes) l.osc('tri', hz(n), env, { drift: 3 });
  m.add(l.lp(lp).fade(0.001, 0.05), at, amp);
}

export const EVENTS: SoundTable = {
  // -------------------------------------------------------------- construction & economy
  /** Production started: a ratchet and a small rising confirm. */
  build_start: {
    bus: 'ui', dur: 0.35, level: -26.3, variants: 2, gap: 0.08, maxInst: 2, prio: 60,
    gen: (m) => {
      for (const t of [0, 0.032, 0.064]) {
        m.add(m.L(0.03).noise('white').env(perc(0.0003, 0.004)).bp(2500, 1.5), t, 0.45);
      }
      thud(m, 0.09, 220, 120, 0.03, 0.5, 1.3, 0.01);
      blip(m, 0.09, 700, 1050, 0.06, 0.22);
    },
  },

  /** Structure placed: a foundation thud, latches clanking shut and a hydraulic hiss. */
  place: {
    bus: 'sfx', dur: 0.95, level: -19, variants: 2, gap: 0.1, maxInst: 3, prio: 70, verb: 0.2,
    gen: (m) => {
      const r = m.r;
      thud(m, 0, r.vary(130, 0.05), 45, 0.12, 0.55, 1.8, 0.04);
      body(m, 0, 0.8, { lp0: 2500, lp1: 300, ftau: 0.05, tau: 0.07 });
      crunch(m, 0, 0.4, 900, 0.05);
      clank(m, 0.12, 0.45, [[r.vary(540, 0.04), 0.6, 0.06], [1290, 0.35, 0.04], [2100, 0.15, 0.02]]);
      m.add(m.L(0.4).noise('white').bp(2800, 1.2).env(swell(0.02, 0.08, 0.12)), 0.18, 0.12);
      clank(m, 0.32, 0.18, [[r.vary(610, 0.04), 0.6, 0.05], [1480, 0.3, 0.03]]);
    },
  },

  /** Sold / refunded: servo winding down and a two-coin chime. */
  sell: {
    bus: 'sfx', dur: 0.85, level: -22.2, variants: 1, gap: 0.1, maxInst: 2, prio: 65, verb: 0.2,
    gen: (m) => {
      thud(m, 0, 160, 80, 0.05, 0.4, 1.2);
      m.add(m.L(0.5).osc('saw', glide(600, 180, 0.35), swell(0.02, 0.2, 0.1)).lp(1200), 0, 0.18);
      bell(m, 0.1, hz(84), 0.3, 0.25);
      bell(m, 0.18, hz(88), 0.3, 0.35);
    },
  },

  /** Credits ticking in (harvester unload, supply cache): a quick ascending run of coins. */
  cash: {
    bus: 'sfx', dur: 0.65, level: -22.4, variants: 3, gap: 0.22, maxInst: 2, prio: 50, verb: 0.18, pitchVar: 0.02,
    gen: (m) => {
      const r = m.r;
      thud(m, 0, 180, 110, 0.03, 0.3, 1.2);
      const notes = [72, 74, 76, 79, 84];
      const n = r.int(4, 5);
      for (let i = 0; i < n; i++) bell(m, i * 0.05 + r.range(0, 0.008), hz(notes[i]), 0.26, 0.09, 3.5, 1.2);
    },
  },

  /** Construction complete: a three-note chime with a warm bed. */
  ready: {
    bus: 'ui', dur: 1.1, level: -21.5, variants: 1, gap: 0.3, maxInst: 2, prio: 80, announces: true,
    gen: (m) => {
      bell(m, 0, hz(72), 0.35, 0.4, 2, 1.5);
      bell(m, 0.07, hz(76), 0.32, 0.4, 2, 1.5);
      bell(m, 0.14, hz(79), 0.34, 0.55, 2, 1.5);
      bed(m, 0, [60, 64, 67], 0.25, 0.1);
      thud(m, 0, 150, 90, 0.04, 0.25, 1.2);
    },
  },

  /** Research complete: four rising notes, brass underneath and a shimmer. */
  upgrade: {
    bus: 'ui', dur: 1.5, level: -20.4, variants: 1, gap: 0.3, maxInst: 2, prio: 80, announces: true,
    gen: (m) => {
      [67, 71, 74, 79].forEach((n, i) => bell(m, i * 0.08, hz(n), 0.3, 0.5, 2, 1.6));
      brass(m, 0.24, hz(55), 0.5, 0.18, 0.6, 0.3);
      brass(m, 0.24, hz(62), 0.5, 0.14, 0.6, 0.3);
      m.add(m.L(0.9).noise('white').bp(glide(2000, 7000, 0.7), 8).env(swell(0.3, 0.1, 0.25)), 0.1, 0.12);
    },
  },

  /** Unit ready: the factory door clunks and a crisp two-note blip. */
  unit_ready: {
    bus: 'sfx', dur: 0.55, level: -22.4, variants: 2, gap: 0.2, maxInst: 2, prio: 72, verb: 0.15, announces: true,
    gen: (m) => {
      thud(m, 0, 150, 70, 0.05, 0.6, 1.4);
      clank(m, 0.01, 0.15, [[480, 0.5, 0.05], [1100, 0.3, 0.03]]);
      blip(m, 0.08, hz(81), hz(81), 0.06, 0.3, 'square', 2600);
      blip(m, 0.16, hz(88), hz(88), 0.1, 0.3, 'square', 2800);
    },
  },

  /** Insufficient funds: two dull descending tones. */
  no_funds: {
    bus: 'ui', dur: 0.4, level: -23.5, variants: 1, gap: 0.6, maxInst: 1, prio: 70, announces: true,
    gen: (m) => {
      blip(m, 0, 330, 320, 0.08, 0.5, 'tri', 1500);
      blip(m, 0.11, 247, 235, 0.12, 0.5, 'tri', 1300);
      thud(m, 0, 140, 90, 0.04, 0.25, 1.1);
    },
  },

  /** Low power: a relay drops out and the generators wind down with a fizzle. */
  powerdown: {
    bus: 'ui', dur: 1.4, level: -21, variants: 1, gap: 0.5, maxInst: 1, prio: 80, announces: true,
    gen: (m) => {
      clank(m, 0, 0.4, [[300, 0.6, 0.03], [900, 0.3, 0.02]]);
      const env = perc2(0.005, 0.3, 0.6, 0.5);
      m.add(m.L(1.3).osc('saw', glide(120, 30, 1), env).osc('saw', glide(240, 55, 1), (t) => env(t) * 0.5).lp(glide(2000, 200, 1)), 0, 0.45);
      m.add(m.L(0.9).crackle((t) => 300 * Math.exp(-t / 0.25), 1).hp(2000).lp(6000), 0.02, 0.25);
    },
  },

  /** Power restored: generators wind up and a relay latches. */
  powerup: {
    bus: 'ui', dur: 1.0, level: -22, variants: 1, gap: 0.5, maxInst: 1, prio: 70, announces: true,
    gen: (m) => {
      const env = (t: number) => Math.min(1, t / 0.5) * (t > 0.62 ? Math.exp(-(t - 0.62) / 0.06) : 1);
      m.add(m.L(0.9).osc('saw', glide(40, 120, 0.6), env).osc('saw', glide(80, 240, 0.6), (t) => env(t) * 0.5).lp(glide(250, 1800, 0.6)), 0, 0.35);
      clank(m, 0.62, 0.35, [[420, 0.6, 0.03], [1250, 0.3, 0.02]]);
      blip(m, 0.66, hz(76), hz(76), 0.08, 0.15, 'sine');
    },
  },

  // -------------------------------------------------------------- outposts, heroes, veterancy
  /** Outpost captured: a rising four-note claim with a drum hit. */
  capture: {
    bus: 'sfx', dur: 1.2, level: -19.2, variants: 1, gap: 0.3, maxInst: 2, prio: 80, verb: 0.25, announces: true,
    gen: (m) => {
      [69, 73, 76, 81].forEach((n, i) => {
        m.add(m.L(0.5).osc('square', hz(n), perc(0.004, 0.16)).lp(2600), i * 0.09, 0.22);
        bell(m, i * 0.09, hz(n + 12), 0.08, 0.25, 2, 1);
      });
      thud(m, 0, 120, 60, 0.12, 0.6, 1.5);
      bed(m, 0.27, [57, 64, 69], 0.3, 0.1);
    },
  },

  /** Outpost lost: a falling minor figure over a low thud. */
  capture_lost: {
    bus: 'ui', dur: 1.0, level: -21.5, variants: 1, gap: 0.3, maxInst: 1, prio: 80, announces: true,
    gen: (m) => {
      [76, 72, 69].forEach((n, i) => m.add(m.L(0.5).osc('square', hz(n), perc(0.004, 0.2)).lp(1800), i * 0.12, 0.22));
      thud(m, 0, 110, 50, 0.15, 0.6, 1.4);
      bed(m, 0.24, [57, 60, 64], 0.25, 0.1, 1100);
    },
  },

  /** Veterancy promotion: a quick sparkle of bells and a metallic shimmer. */
  promote: {
    bus: 'sfx', dur: 0.95, level: -20.7, variants: 2, gap: 0.15, maxInst: 2, prio: 70, verb: 0.25, announces: true,
    gen: (m) => {
      [76, 80, 83, 88].forEach((n, i) => bell(m, i * 0.055, hz(n), 0.25, 0.3, 3.5, 1.4));
      m.add(m.L(0.6).noise('white').bp(5200, 6).env(swell(0.08, 0.05, 0.15)), 0.05, 0.08);
    },
  },

  /** Hero level up: a rising arpeggio over brass, a boom and a shimmer sweep. */
  levelup: {
    bus: 'ui', dur: 1.7, level: -19.4, variants: 1, gap: 0.3, maxInst: 2, prio: 85, announces: true,
    gen: (m) => {
      [67, 71, 74, 79, 83].forEach((n, i) => bell(m, i * 0.07, hz(n), 0.3, 0.5, 2, 1.6));
      brass(m, 0.28, hz(55), 0.6, 0.22, 0.8, 0.35);
      brass(m, 0.28, hz(59), 0.6, 0.16, 0.8, 0.35);
      brass(m, 0.28, hz(62), 0.6, 0.16, 0.8, 0.35);
      thud(m, 0, 90, 45, 0.2, 0.5, 1.5);
      m.add(m.L(1).noise('white').bp(glide(1500, 7000, 0.8), 8).env(swell(0.4, 0.1, 0.3)), 0, 0.12);
    },
  },

  /** Hero revived: a two-note horn call with a drum hit and a bell. */
  hero_ready: {
    bus: 'ui', dur: 1.5, level: -19.5, variants: 1, gap: 0.3, maxInst: 1, prio: 85, announces: true,
    gen: (m) => {
      brass(m, 0, hz(62), 0.18, 0.4, 1, 0.12);
      brass(m, 0.22, hz(69), 0.6, 0.45, 1.1, 0.35);
      brass(m, 0.22, hz(62), 0.6, 0.2, 0.8, 0.35);
      thud(m, 0, 100, 50, 0.15, 0.55, 1.5);
      bell(m, 0.22, hz(81), 0.15, 0.6, 2, 1.2);
    },
  },

  // -------------------------------------------------------------- alerts, objectives, stingers
  /** Base / harvester under attack: three two-tone pulses, urgent but not harsh. */
  alert: {
    bus: 'ui', dur: 1.0, level: -20.4, variants: 1, gap: 1, maxInst: 1, prio: 95, announces: true,
    gen: (m) => {
      for (let i = 0; i < 3; i++) {
        const t = i * 0.26;
        m.add(m.L(0.12).osc('square', 740, gate(0.004, 0.1)).lp(2200).drive(1.3), t, 0.3);
        m.add(m.L(0.12).osc('square', 554, gate(0.004, 0.1)).lp(2000).drive(1.3), t + 0.11, 0.3);
      }
    },
  },

  /** Objective complete (checklist): a soft rising chime with a tick. */
  objective: {
    bus: 'ui', dur: 0.9, level: -22.2, variants: 1, gap: 0.3, maxInst: 1, prio: 75, announces: true,
    gen: (m) => {
      m.add(m.L(0.03).noise('white').env(perc(0.0003, 0.003)).bp(3000, 1.2), 0, 0.3);
      bell(m, 0.01, hz(81), 0.3, 0.35, 2, 1.4);
      bell(m, 0.1, hz(88), 0.3, 0.5, 2, 1.4);
    },
  },

  /** Victory stinger: drum hit, cymbal and a bright brass chord (the music cue follows). */
  victory: {
    bus: 'ui', dur: 3.2, level: -13.7, variants: 1, gap: 2, maxInst: 1, prio: 100, announces: true,
    gen: (m) => {
      thud(m, 0, 95, 42, 0.45, 1, 1.8, 0.08);
      m.add(m.L(3).noise('white').hp(3500).lp(10000).env(perc2(0.002, 0.15, 1.1, 0.6)), 0, 0.22);
      for (const n of [50, 57, 62, 66, 69]) brass(m, 0.01, hz(n), 1.4, 0.2, 1, 0.8);
      [74, 78, 81, 86].forEach((n, i) => bell(m, 0.1 + i * 0.08, hz(n), 0.15, 0.7, 2, 1.4));
    },
  },

  /** Defeat stinger: a low boom and a dark, falling minor chord. */
  defeat: {
    bus: 'ui', dur: 3.2, level: -15.3, variants: 1, gap: 2, maxInst: 1, prio: 100, announces: true,
    gen: (m) => {
      thud(m, 0, 70, 30, 0.6, 1, 1.8, 0.15);
      for (const n of [38, 45, 50, 53]) {
        const l = m.L(3.1).osc('saw', glide(hz(n), hz(n - 1), 2.5), swell(0.05, 1.1, 0.7), { drift: 6 }).lp(expTo(1400, 300, 1)).drive(1.3);
        m.add(l.fade(0.001, 0.1), 0, 0.16);
      }
      m.add(m.L(3).noise('brown').lp(300).env(perc2(0.02, 0.4, 1.2, 0.5)), 0, 0.5);
    },
  },

  // -------------------------------------------------------------- announcer earcons
  /** Earcon: alert (danger, attack, incoming strike). */
  vo_alert: {
    bus: 'ui', dur: 0.5, level: -21.4, variants: 1, gap: 0.5, maxInst: 1, prio: 95,
    gen: (m) => {
      squelch(m, 0, 0.3);
      for (const t of [0.03, 0.19]) {
        m.add(m.L(0.1).osc('square', 988, gate(0.003, 0.06)).lp(2400), t, 0.25);
        m.add(m.L(0.1).osc('square', 740, gate(0.003, 0.06)).lp(2200), t + 0.07, 0.25);
      }
    },
  },
  /** Earcon: good news (complete, captured, ready). */
  vo_good: {
    bus: 'ui', dur: 0.6, level: -22.1, variants: 1, gap: 0.5, maxInst: 1, prio: 90,
    gen: (m) => {
      squelch(m, 0, 0.25);
      bell(m, 0.03, hz(79), 0.35, 0.25, 2, 1.2);
      bell(m, 0.12, hz(86), 0.35, 0.35, 2, 1.2);
    },
  },
  /** Earcon: bad news (lost, destroyed, failed). */
  vo_bad: {
    bus: 'ui', dur: 0.6, level: -22, variants: 1, gap: 0.5, maxInst: 1, prio: 92,
    gen: (m) => {
      squelch(m, 0, 0.25);
      blip(m, 0.03, hz(69), hz(69), 0.1, 0.4, 'tri', 1600);
      blip(m, 0.16, hz(65), hz(64), 0.18, 0.4, 'tri', 1400);
    },
  },
  /** Earcon: information (reinforcements, orbital lance charging, battle start). */
  vo_info: {
    bus: 'ui', dur: 0.4, level: -23.2, variants: 1, gap: 0.5, maxInst: 1, prio: 88,
    gen: (m) => {
      squelch(m, 0, 0.25);
      blip(m, 0.03, hz(81), hz(81), 0.04, 0.3, 'sine', 3000);
      blip(m, 0.11, hz(81), hz(81), 0.06, 0.3, 'sine', 3000);
    },
  },
};

