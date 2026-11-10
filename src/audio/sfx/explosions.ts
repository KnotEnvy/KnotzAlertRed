/**
 * Explosions in three clear sizes (sub thump + noise body + debris / rumble tail), plus
 * structure collapse, infantry deaths and the armor-drop landing.
 */
import { expTo, glide, perc, swell } from '../dsp';
import { body, clank, crack, crunch, debris, rumble, thud } from './kit';
import type { SoundTable } from './types';

export const EXPLOSIONS: SoundTable = {
  /** Rocket / shell impact: a tight pop and crunch. */
  explosion_s: {
    bus: 'sfx', dur: 0.9, level: -19.1, variants: 4, gap: 0.06, maxInst: 5, prio: 35, verb: 0.22, pitchVar: 0.06, delayVar: 0.01, heat: 0.4, duck: 0.15,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 0.8, { hp: 700, lp: 7000, tau: 0.004, drive: 2 });
      body(m, 0, 1, { lp0: r.vary(4000, 0.15), lp1: 500, ftau: 0.04, tau: r.vary(0.06, 0.2), drive: 2.5 });
      thud(m, 0, r.vary(130, 0.1), 45, 0.08, 0.6, 1.5, 0.03);
      crunch(m, 0, 0.7, r.vary(1100, 0.15), 0.07);
      debris(m, 0.03, 0.6, 0.55, { rate: 170, tau: 0.15, band: 2500 });
      rumble(m, 0.005, 0.8, 0.3, { lp0: 600, lp1: 200, tau1: 0.08, tau2: 0.2, flutter: 10 });
    },
  },

  /** Vehicle death / grenade or light-shell impact: a full blast with a secondary burst. */
  explosion_m: {
    bus: 'sfx', dur: 1.9, level: -15.8, variants: 4, gap: 0.08, maxInst: 4, prio: 60, verb: 0.26, pitchVar: 0.05, delayVar: 0.012, heat: 0.7, duck: 0.45,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 0.85, { hp: 600, lp: 7000, tau: 0.005, drive: 2.5 });
      body(m, 0, 1, { lp0: 3000, lp1: 300, ftau: 0.07, tau: r.vary(0.13, 0.15), drive: 3 });
      thud(m, 0, r.vary(90, 0.1), 32, 0.18, 0.75, 1.8, 0.07);
      crunch(m, 0, 0.8, r.vary(800, 0.15), 0.14);
      body(m, r.range(0.04, 0.09), 0.5, { lp0: 1800, lp1: 250, ftau: 0.06, tau: 0.09, drive: 2 });
      debris(m, 0.05, 1.4, 0.6, { rate: 220, tau: 0.35, band: 1800 });
      for (let i = 0; i < 3; i++) {
        clank(m, r.range(0.15, 0.7), 0.06, [[r.range(1800, 3500), 0.6, 0.03], [r.range(900, 1600), 0.4, 0.04]]);
      }
      rumble(m, 0.02, 1.8, 0.55, { lp0: 700, lp1: 120, tau1: 0.2, tau2: 0.6, flutter: 7 });
    },
  },

  /** Heavy vehicle death / heavy shell: deep, wide and long, with fireball roar and debris. */
  explosion_l: {
    bus: 'sfx', dur: 3.2, level: -11.9, variants: 3, gap: 0.11, maxInst: 3, prio: 80, verb: 0.3, pitchVar: 0.04, delayVar: 0.01, heat: 1, duck: 0.8,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 0.9, { hp: 500, lp: 7000, tau: 0.007, drive: 3 });
      body(m, 0, 1, { lp0: 2600, lp1: 200, ftau: 0.1, tau: r.vary(0.22, 0.12), drive: 3.5, attack: 0.003 });
      thud(m, 0, r.vary(70, 0.1), 24, 0.35, 0.85, 2, 0.12);
      m.add(m.L(1.4).osc('sine', 30, perc(0.01, 0.4)), 0, 0.3);
      crunch(m, 0, 0.85, r.vary(650, 0.15), 0.25);
      body(m, r.range(0.07, 0.12), 0.55, { lp0: 1500, lp1: 220, ftau: 0.08, tau: 0.14, drive: 2 });
      body(m, r.range(0.18, 0.28), 0.35, { lp0: 1200, lp1: 200, ftau: 0.1, tau: 0.16, drive: 2 });
      m.add(m.L(1.6).noise('pink').lp(expTo(1400, 300, 0.4)).env(swell(0.03, 0.1, 0.4)).flutter(12, 0.6).fade(0.002, 0.05), 0.02, 0.6);
      debris(m, 0.08, 2.6, 0.55, { rate: 300, tau: 0.6, band: 1600 });
      for (let i = 0; i < 5; i++) {
        clank(m, r.range(0.25, 1.6), 0.05, [[r.range(1500, 3200), 0.6, 0.035], [r.range(700, 1300), 0.4, 0.05]]);
      }
      rumble(m, 0.03, 3.1, 0.65, { lp0: 500, lp1: 80, tau1: 0.4, tau2: 1.2, flutter: 5 });
    },
  },

  /** Structure destroyed: a large blast followed by a staggered collapse and settling dust. */
  collapse: {
    bus: 'sfx', dur: 4.4, level: -11.8, variants: 2, gap: 0.2, maxInst: 2, prio: 90, verb: 0.32, pitchVar: 0.03, heat: 1, duck: 0.9,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 0.9, { hp: 500, lp: 7000, tau: 0.007, drive: 3 });
      body(m, 0, 1, { lp0: 2400, lp1: 180, ftau: 0.1, tau: 0.24, drive: 3.5, attack: 0.003 });
      thud(m, 0, 66, 24, 0.38, 0.7, 2, 0.12);
      crunch(m, 0, 1, 600, 0.25);
      // the structure gives way: a few heavy impacts at widening intervals
      let t = r.range(0.35, 0.5);
      for (let i = 0; i < 5; i++) {
        thud(m, t, r.vary(62, 0.15), 30, 0.13, 0.65 - i * 0.08, 1.8, 0.05);
        body(m, t, 0.4 - i * 0.05, { lp0: 900, lp1: 200, ftau: 0.06, tau: 0.1, drive: 1.6 });
        crunch(m, t, 0.3 - i * 0.04, r.range(500, 1100), 0.08);
        t += r.range(0.22, 0.42) * (1 + i * 0.25);
      }
      // twisting metal groan
      m.add(
        m.L(2).osc('saw', glide(r.vary(74, 0.1), 52, 1.6), 1, { drift: 20 }).bp(420, 4).env(swell(0.35, 0.4, 0.5)).fade(0.002, 0.05),
        0.45,
        0.22,
      );
      debris(m, 0.1, 3.8, 0.5, { rate: 260, tau: 1.2, band: 1500 });
      for (let i = 0; i < 6; i++) {
        clank(m, r.range(0.4, 2.6), 0.05, [[r.range(1200, 2800), 0.6, 0.04], [r.range(500, 1000), 0.5, 0.06]]);
      }
      rumble(m, 0.03, 4.3, 0.45, { lp0: 450, lp1: 70, tau1: 0.6, tau2: 1.6, flutter: 4 });
    },
  },

  /** Infantry casualty: a muffled thud and a rattle of gear (deliberately not gory). */
  death: {
    bus: 'sfx', dur: 0.45, level: -24.6, variants: 4, gap: 0.08, maxInst: 4, prio: 26, verb: 0.15, pitchVar: 0.08, delayVar: 0.015, heat: 0.2, duck: 0.03,
    gen: (m) => {
      const r = m.r;
      thud(m, 0, r.vary(150, 0.1), 70, 0.05, 0.35, 1.3, 0.02);
      m.add(m.L(0.35).crackle((t) => 520 * Math.exp(-t / 0.06), 1, 0.0018).bp(r.vary(2200, 0.15), 0.8), 0.01, 0.8);
      body(m, 0, 0.7, { lp0: 1800, lp1: 500, ftau: 0.05, tau: 0.05 });
      crunch(m, 0.005, 0.35, r.vary(1500, 0.2), 0.04);
    },
  },

  /** Armor Drop landing: heavy metal impact, ringing hull, hydraulic settle and dust. */
  drop_land: {
    bus: 'sfx', dur: 1.5, level: -15.7, variants: 2, gap: 0.1, maxInst: 3, prio: 65, verb: 0.28, pitchVar: 0.05, heat: 0.4, duck: 0.4,
    gen: (m) => {
      const r = m.r;
      thud(m, 0, r.vary(92, 0.08), 35, 0.18, 0.75, 2, 0.06);
      crunch(m, 0, 0.7, 900, 0.08);
      body(m, 0, 0.9, { lp0: 2500, lp1: 250, ftau: 0.06, tau: 0.1, drive: 2 });
      clank(m, 0.002, 0.5, [[r.vary(182, 0.05), 0.5, 0.25], [431, 0.4, 0.18], [692, 0.3, 0.12], [1210, 0.18, 0.08]]);
      m.add(m.L(0.4).noise('white').bp(2500, 1.5).env(swell(0.03, 0.1, 0.12)), 0.25, 0.12);
      rumble(m, 0.01, 1.4, 0.35, { lp0: 450, lp1: 120, tau1: 0.15, tau2: 0.45, flutter: 8 });
    },
  },
};
