/** Hero abilities and support powers. */
import { expTo, glide, gate, perc, pts, swell } from '../dsp';
import { bell, blip, body, brass, crack, crunch, debris, rumble, thud, whoosh } from './kit';
import type { SoundTable } from './types';

export const ABILITIES: SoundTable = {
  /** Orbital Lance charging (2.6 s): a rising drone, accelerating targeting ticks and a final inhale. */
  lance_charge: {
    bus: 'sfx', dur: 2.75, level: -19.1, variants: 1, gap: 0.5, maxInst: 2, prio: 88, verb: 0.3, heat: 0.3,
    gen: (m) => {
      const env = pts([[0, 0], [0.3, 0.35], [2.3, 1], [2.55, 0.3], [2.7, 0]]);
      m.add(m.L(2.75).osc('saw', glide(55, 220, 2.5), env).osc('saw', glide(55.4, 221.5, 2.5), env).lp(glide(200, 3200, 2.5), 4).drive(1.5), 0, 0.4);
      m.add(m.L(2.75).osc('sine', glide(440, 1760, 2.5), env, { pm: { ratio: 2.01, index: 2.5 } }), 0, 0.1);
      m.add(m.L(2.75).noise('white').bp(glide(300, 5000, 2.5), 3).env((t) => env(t) * env(t)), 0, 0.35);
      // targeting ticks speed up as the beam locks
      let t = 0.15;
      let gap = 0.28;
      while (t < 2.45) {
        blip(m, t, 1250, 1250, 0.012, 0.22, 'sine', 6000);
        t += gap;
        gap = Math.max(0.045, gap * 0.86);
      }
      whoosh(m, 2.2, 0.42, 6000, 800, 0.35, 1.2, (t) => (t < 0.35 ? (t / 0.35) ** 2 : 0));
    },
  },

  /** Orbital Lance impact: a searing beam on top of the biggest blast in the game. */
  lance: {
    bus: 'sfx', dur: 4.8, level: -8.4, variants: 1, gap: 0.5, maxInst: 2, prio: 98, verb: 0.35, heat: 1, duck: 1,
    gen: (m) => {
      m.add(
        m
          .L(1)
          .osc('saw', 110, 1)
          .osc('saw', 111.3, 1)
          .osc('saw', 165, 0.7)
          .ring(37, 0.5)
          .bp(glide(4000, 800, 0.8), 0.7)
          .env(perc(0.005, 0.45))
          .drive(2),
        0,
        0.55,
      );
      crack(m, 0, 1, { hp: 400, lp: 7500, tau: 0.01, drive: 4 });
      body(m, 0, 1, { lp0: 3000, lp1: 150, ftau: 0.15, tau: 0.35, drive: 3, attack: 0.004 });
      thud(m, 0, 60, 20, 0.6, 0.9, 2, 0.2);
      crunch(m, 0, 0.8, 700, 0.3);
      m.add(m.L(2.2).noise('pink').lp(expTo(1500, 250, 0.6)).env(swell(0.05, 0.3, 0.7)).flutter(10, 0.6).fade(0.002, 0.05), 0.02, 0.6);
      debris(m, 0.1, 3.5, 0.45, { rate: 320, tau: 1, band: 1500 });
      rumble(m, 0.04, 4.7, 0.65, { lp0: 400, lp1: 60, tau1: 0.6, tau2: 1.8, flutter: 4 });
    },
  },

  /** Kade EMP: a falling discharge, a whomp and systems shutting down. */
  emp: {
    bus: 'sfx', dur: 1.1, level: -17.3, variants: 2, gap: 0.2, maxInst: 2, prio: 75, verb: 0.3, heat: 0.4, duck: 0.3,
    gen: (m) => {
      m.add(m.L(0.8).osc('sine', glide(1400, 55, 0.5), perc(0.002, 0.25), { pm: { ratio: 0.5, index: 2 } }), 0, 0.7);
      thud(m, 0, 160, 40, 0.15, 0.8, 1.4, 0.05);
      m.add(m.L(0.7).noise('white').bp(glide(4000, 250, 0.5), 4).env(perc(0.002, 0.2)), 0, 0.5);
      m.add(m.L(0.9).crackle((t) => 400 * Math.exp(-t / 0.3), 1).hp(2000).lp(6500), 0.05, 0.35);
      blip(m, 0.16, 880, 860, 0.05, 0.14, 'square', 2500);
      blip(m, 0.27, 660, 640, 0.05, 0.13, 'square', 2200);
      blip(m, 0.38, 495, 470, 0.08, 0.12, 'square', 1800);
    },
  },

  /** Nyx Blink: whoosh out, shimmer pop back in. */
  blink: {
    bus: 'sfx', dur: 0.6, level: -19.5, variants: 2, gap: 0.15, maxInst: 2, prio: 70, verb: 0.3,
    gen: (m) => {
      whoosh(m, 0, 0.13, 500, 5000, 0.6, 2, (t) => (t < 0.09 ? t / 0.09 : Math.max(0, 1 - (t - 0.09) / 0.04)));
      m.add(m.L(0.3).osc('sine', glide(2200, 500, 0.12), perc(0.001, 0.08)), 0.13, 0.4);
      m.add(m.L(0.45).osc('sine', 1800, perc(0.002, 0.15), { pm: { ratio: 3.5, index: (t) => 3 * Math.exp(-t / 0.05) } }).lp(6500), 0.13, 0.2);
      m.add(m.L(0.3).noise('white').bp(glide(4000, 600, 0.2), 1.5).env(perc(0.002, 0.1)), 0.13, 0.3);
    },
  },

  /** Rook Bastion: an energy dome shimmering up around the squad. */
  shield: {
    bus: 'sfx', dur: 1.4, level: -20.9, variants: 1, gap: 0.2, maxInst: 2, prio: 70, verb: 0.35,
    gen: (m) => {
      const vib = (f: number) => (t: number) => f * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t));
      const env = swell(0.12, 0.15, 0.4);
      const l = m.L(1.4);
      [
        [330, 1],
        [495, 0.7],
        [660, 0.5],
        [990, 0.25],
      ].forEach(([f, a]) => l.osc('sine', vib(f), (t) => env(t) * a));
      m.add(l.fade(0.001, 0.05), 0, 0.3);
      m.add(m.L(1.2).osc('saw', 110, swell(0.1, 0.1, 0.3)).lp(600), 0, 0.22);
      m.add(m.L(1.2).noise('white').bp(glide(2000, 6000, 0.6), 6).env(swell(0.15, 0.1, 0.3)), 0, 0.18);
      thud(m, 0, 200, 80, 0.08, 0.4, 1.2, 0.03);
    },
  },

  /** Rook Rally: a short rising horn call over a drum flam. */
  rally: {
    bus: 'sfx', dur: 1.2, level: -20.7, variants: 1, gap: 0.2, maxInst: 2, prio: 70, verb: 0.35,
    gen: (m) => {
      brass(m, 0, 293.66, 0.11, 0.45);
      brass(m, 0.14, 440, 0.11, 0.45);
      brass(m, 0.28, 587.33, 0.45, 0.5, 1.1, 0.25);
      for (const t of [0, 0.028]) {
        m.add(m.L(0.2).noise('white').bp(1800, 0.8).env(perc(0.001, 0.05)), t, 0.25);
        thud(m, t, 210, 170, 0.05, 0.3, 1.2);
      }
    },
  },

  /** Kade Mark Target: two lock-on beeps and a descending "locked" chirp. */
  mark: {
    bus: 'sfx', dur: 0.6, level: -19.7, variants: 1, gap: 0.2, maxInst: 2, prio: 65, verb: 0.2,
    gen: (m) => {
      m.add(m.L(0.2).osc('square', 1760, (t) => gate(0, 0.045)(t) * 0.6 + gate(0.085, 0.13)(t) * 0.6).lp(3200), 0, 0.3);
      m.add(m.L(0.3).osc('square', glide(1400, 700, 0.15), perc(0.002, 0.1)).lp(2500), 0.19, 0.35);
      thud(m, 0.19, 140, 100, 0.07, 0.4, 1.2);
    },
  },

  /** Recon Sweep / drop beacon: a radar ping, its echo and a sweeping resonance. */
  scan: {
    bus: 'sfx', dur: 1.4, level: -20.4, variants: 1, gap: 0.3, maxInst: 2, prio: 60, verb: 0.4,
    gen: (m) => {
      m.add(m.L(1).osc('sine', 1250, perc(0.003, 0.25), { pm: { ratio: 2, index: (t) => 1.5 * Math.exp(-t / 0.05) } }), 0, 0.5);
      m.add(m.L(0.8).osc('sine', 1250, perc(0.003, 0.2)).lp(1800), 0.32, 0.2);
      m.add(m.L(0.6).noise('white').bp(glide(600, 3000, 0.5), 8).env(swell(0.05, 0.2, 0.2)), 0, 0.3);
      m.add(m.L(0.5).osc('sine', 220, perc(0.004, 0.15)), 0, 0.25);
      bell(m, 0.6, 2500, 0.05, 0.2, 1.4, 1);
    },
  },
};

