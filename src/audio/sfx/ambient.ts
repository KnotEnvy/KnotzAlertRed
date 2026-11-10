/** Occasional ambience one-shots scattered around the camera (per battlefield theme). */
import { glide, perc, swell } from '../dsp';
import type { SoundTable } from './types';

export const AMBIENT: SoundTable = {
  /** Verdant Basin: a small bird calling a few times. */
  amb_bird: {
    bus: 'amb', dur: 1.2, level: -31.3, variants: 4, gap: 2, maxInst: 2, prio: 5, verb: 0.35,
    gen: (m) => {
      const r = m.r;
      const n = r.int(2, 4);
      const base = r.range(2400, 3400);
      let t = 0;
      for (let i = 0; i < n; i++) {
        const len = r.range(0.05, 0.11);
        const up = r.chance(0.5);
        const f0 = up ? base * 0.85 : base * 1.15;
        const f1 = up ? base * 1.2 : base * 0.8;
        m.add(
          m.L(len + 0.02).osc('sine', (tt) => glide(f0, f1, len)(tt) * (1 + 0.04 * Math.sin(2 * Math.PI * 45 * tt)), (tt) => Math.sin(Math.PI * Math.min(1, tt / len))).lp(6500),
          t,
          0.5,
        );
        t += len + r.range(0.04, 0.16);
      }
    },
  },
  /** Scorched Dunes / Frostline: a passing gust of wind. */
  amb_gust: {
    bus: 'amb', dur: 3.2, level: -28.8, variants: 3, gap: 3, maxInst: 2, prio: 5, verb: 0.2,
    gen: (m) => {
      const r = m.r;
      const f = r.range(400, 900);
      m.add(m.L(3.2).noise('pink').bp(glide(f, f * r.range(1.3, 2), 1.6), 1.2).env(swell(r.range(0.6, 1.1), 0.3, 0.7)).flutter(3, 0.5).fade(0.01, 0.2), 0, 1);
      m.add(m.L(3.2).noise('white').hp(3000).lp(6000).env(swell(1, 0.2, 0.5)).flutter(9, 0.7).fade(0.01, 0.2), 0, 0.06);
    },
  },
  /** Frostline: ice creaking under strain (stick-slip pulses through a resonance). */
  amb_creak: {
    bus: 'amb', dur: 1.3, level: -29.4, variants: 3, gap: 3, maxInst: 1, prio: 5, verb: 0.35,
    gen: (m) => {
      const r = m.r;
      const len = r.range(0.5, 0.9);
      const l = m.L(1.3).crackle((t) => (t < len ? 70 + 50 * Math.sin((t / len) * Math.PI) : 0), 1, 0.003);
      l.bp(r.range(500, 900), 4).bp(r.range(1100, 1600), 2);
      m.add(l.fade(0.002, 0.05), 0, 1);
      m.add(m.L(0.4).osc('sine', r.range(1800, 2600), perc(0.002, 0.1)).lp(4000), len * 0.8, 0.05);
    },
  },
};
