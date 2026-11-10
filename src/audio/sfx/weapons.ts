/**
 * Weapon reports. Each one is built from a transient (crack), a body (the shot's weight) and
 * a tail (its decay into the landscape), and each has a distinguishing detail so it can be
 * recognised with eyes closed.
 */
import { expTo, glide, perc, perc2, pts, swell } from '../dsp';
import { body, clank, crack, crunch, debris, rumble, snap, thud } from './kit';
import type { SoundTable } from './types';

export const WEAPONS: SoundTable = {
  /** Trooper rifle: light, dry snap with a short papery tail. */
  rifle: {
    bus: 'sfx', dur: 0.4, level: -25.2, variants: 5, gap: 0.06, maxInst: 6, prio: 20, verb: 0.16, pitchVar: 0.05, delayVar: 0.012, heat: 0.25, duck: 0.04,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 0.9, { hp: 1900, lp: 7000, tau: r.vary(0.0015, 0.25) });
      m.add(m.L(0.14).noise('white').env(perc(0.0005, r.vary(0.016, 0.2))).bp(r.vary(1350, 0.15), 0.9).drive(2.2), 0, 0.75);
      thud(m, 0, r.vary(230, 0.08), 90, 0.024, 0.45, 1.8, 0.01);
      snap(m, 0, 0.5, r.vary(3200, 0.1), 0.006);
      body(m, 0.003, 0.32, { lp0: 2600, lp1: 650, ftau: 0.06, tau: r.vary(0.065, 0.25), color: 'pink', attack: 0.004 });
    },
  },

  /** Buggy MG / Sentry Gun: heavier, lower thump with a mechanical action click. */
  mg: {
    bus: 'sfx', dur: 0.38, level: -21, variants: 5, gap: 0.05, maxInst: 6, prio: 24, verb: 0.15, pitchVar: 0.045, delayVar: 0.01, heat: 0.3, duck: 0.05,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 0.75, { hp: 1200, lp: 6000, tau: 0.002, drive: 1.5 });
      m.add(m.L(0.16).noise('white').env(perc(0.0006, r.vary(0.024, 0.2))).bp(r.vary(1000, 0.12), 0.8).drive(2.6), 0, 1);
      thud(m, 0, r.vary(175, 0.08), 62, 0.034, 0.45, 2.2, 0.012);
      snap(m, 0, 0.45, r.vary(2600, 0.1), 0.005);
      clank(m, r.range(0.035, 0.05), 0.16, [
        [r.vary(2350, 0.05), 0.5, 0.012],
        [r.vary(3500, 0.05), 0.3, 0.008],
        [r.vary(1450, 0.05), 0.4, 0.02],
      ]);
      body(m, 0.004, 0.35, { lp0: 2000, lp1: 480, ftau: 0.08, tau: r.vary(0.085, 0.2), color: 'pink', attack: 0.005 });
    },
  },

  /** Kade's marksman rifle: supersonic crack, deep boom, rolling echo, then the bolt cycling. */
  sniper: {
    bus: 'sfx', dur: 1.05, level: -15.4, variants: 3, gap: 0.1, maxInst: 3, prio: 55, verb: 0.3, pitchVar: 0.025, heat: 0.6, duck: 0.25,
    gen: (m) => {
      const r = m.r;
      m.add(m.L(0.0009).osc('sine', 1100, 1, { phase: 0 }), 0, 0.7);
      crack(m, 0, 1, { hp: 2600, lp: 8000, tau: 0.0025, drive: 2 });
      snap(m, 0, 1, 3000, 0.012);
      thud(m, 0.001, r.vary(135, 0.06), 46, 0.11, 0.4, 2.2, 0.04);
      crunch(m, 0, 0.6, 1500, 0.03);
      m.add(m.L(0.3).noise('white').env(perc(0.0008, 0.05)).bp(900, 0.7).drive(2), 0, 0.9);
      m.add(m.L(0.85).noise('pink').lp(expTo(2600, 600, 0.3)).env(perc2(0.012, 0.12, 0.42, 0.5)).flutter(14, 0.5).fade(0.002, 0.04), 0.045, 0.5);
      crack(m, 0.21, 0.18, { hp: 800, lp: 2400, tau: 0.004 });
      // bolt action: back, then forward
      clank(m, 0.55, 0.22, [[r.vary(1900, 0.04), 0.5, 0.01], [3100, 0.3, 0.007], [820, 0.4, 0.02]]);
      clank(m, 0.67, 0.26, [[r.vary(2200, 0.04), 0.5, 0.012], [3500, 0.25, 0.006], [960, 0.45, 0.022]]);
    },
  },

  /** Kade's ultimate: an overcharged shot with an electric discharge and a thunderous echo. */
  sniper_big: {
    bus: 'sfx', dur: 1.9, level: -12.2, variants: 2, gap: 0.2, maxInst: 2, prio: 85, verb: 0.35, heat: 1, duck: 0.6,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 1, { hp: 1600, lp: 8000, tau: 0.002, drive: 3 });
      thud(m, 0, 115, 34, 0.2, 0.5, 2.6, 0.06);
      thud(m, 0.005, 60, 30, 0.3, 0.3, 1.2, 0.1);
      crunch(m, 0, 1, 1200, 0.06);
      snap(m, 0, 0.7, 3000, 0.01);
      m.add(
        m.L(0.4).osc('saw', expTo(2400, 280, 0.07), perc(0.001, 0.13)).ring(r.vary(70, 0.1), 0.6).bp(2000, 0.8).drive(2),
        0,
        0.35,
      );
      m.add(m.L(1.7).noise('brown').lp(expTo(900, 140, 0.6)).env(perc2(0.02, 0.25, 0.75, 0.55)).flutter(9, 0.55).fade(0.002, 0.05), 0.04, 0.4);
      crack(m, 0.26, 0.2, { hp: 700, lp: 2200, tau: 0.006 });
      debris(m, 0.02, 0.5, 0.25, { rate: 600, tau: 0.08, band: 3000 });
    },
  },

  /** Mauler tank / Rampart cannon: a solid boom with a breech clank behind it. */
  cannon: {
    bus: 'sfx', dur: 1.3, level: -16.8, variants: 4, gap: 0.07, maxInst: 4, prio: 45, verb: 0.22, pitchVar: 0.04, delayVar: 0.01, heat: 0.6, duck: 0.3,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 0.7, { hp: 900, lp: 6000, tau: 0.003, drive: 3 });
      body(m, 0, 1, { lp0: 3200, lp1: 380, ftau: 0.035, tau: r.vary(0.06, 0.15), drive: 2.5, attack: 0.0008 });
      m.add(
        m.L(0.9).osc('sine', expTo(r.vary(108, 0.06), 42, 0.05), perc(0.002, 0.13)).osc('sine', expTo(216, 84, 0.05), perc(0.002, 0.06), {}).drive(1.6),
        0,
        0.7,
      );
      crunch(m, 0, 0.75, r.vary(750, 0.1), 0.06);
      rumble(m, 0.01, 1.1, 0.45, { lp0: 900, lp1: 180, tau1: 0.15, tau2: 0.45, flutter: 9 });
      clank(m, r.range(0.15, 0.2), 0.12, [[r.vary(640, 0.05), 0.5, 0.04], [1170, 0.35, 0.03], [1980, 0.2, 0.02]]);
    },
  },

  /** Titan / Commander Rook: a deeper, wider blast with a pressure "whump" and a shell clang. */
  cannon_heavy: {
    bus: 'sfx', dur: 1.8, level: -14.6, variants: 3, gap: 0.09, maxInst: 3, prio: 58, verb: 0.25, pitchVar: 0.035, delayVar: 0.008, heat: 0.8, duck: 0.45,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 0.8, { hp: 700, lp: 6000, tau: 0.004, drive: 3 });
      body(m, 0, 1, { lp0: 2600, lp1: 260, ftau: 0.05, tau: r.vary(0.09, 0.12), drive: 3, attack: 0.001 });
      thud(m, 0, r.vary(82, 0.06), 31, 0.2, 0.55, 2.2, 0.07);
      m.add(m.L(0.6).osc('sine', 38, perc(0.005, 0.25)), 0, 0.3);
      body(m, 0.002, 0.5, { lp0: 320, lp1: 200, ftau: 0.1, tau: 0.08, attack: 0.004 });
      crunch(m, 0, 1, r.vary(560, 0.1), 0.09);
      rumble(m, 0.015, 1.6, 0.4, { lp0: 700, lp1: 140, tau1: 0.25, tau2: 0.8, flutter: 7 });
      m.add(m.L(0.3).noise('white').bp(3000, 2).env(swell(0.02, 0.05, 0.08)), 0.22, 0.08);
      clank(m, 0.25, 0.14, [[r.vary(420, 0.05), 0.6, 0.05], [1130, 0.4, 0.035], [1890, 0.25, 0.02]]);
    },
  },

  /** Longbow artillery launch: a muffled, distant-sounding thoomp that rolls on and on. */
  artillery: {
    bus: 'sfx', dur: 2.6, level: -14.6, variants: 3, gap: 0.14, maxInst: 3, prio: 55, verb: 0.3, pitchVar: 0.03, heat: 0.7, duck: 0.4,
    gen: (m) => {
      const r = m.r;
      thud(m, 0, r.vary(72, 0.06), 26, 0.3, 0.55, 2, 0.1);
      body(m, 0, 0.9, { lp0: 1500, lp1: 150, ftau: 0.06, tau: 0.12, drive: 2, attack: 0.002 });
      crack(m, 0, 0.5, { hp: 600, lp: 3500, tau: 0.004 });
      crunch(m, 0, 1, r.vary(450, 0.1), 0.12, 0.7);
      rumble(m, 0.02, 2.5, 0.5, { lp0: 520, lp1: 90, tau1: 0.4, tau2: 1.2, flutter: 5 });
      m.add(m.L(1.4).noise('pink').lp(350).env(perc(0.05, 0.5)).fade(0.002, 0.05), r.range(0.34, 0.42), 0.3);
    },
  },

  /** Lancer / Kestrel rocket: ignition pop, then a fluttering hiss that streaks away. */
  rocket: {
    bus: 'sfx', dur: 0.8, level: -20.3, variants: 4, gap: 0.08, maxInst: 5, prio: 35, verb: 0.2, pitchVar: 0.06, delayVar: 0.01, heat: 0.45, duck: 0.12,
    gen: (m) => {
      const r = m.r;
      m.add(m.L(0.05).noise('white').env(perc(0.0005, 0.006)).bp(1800, 1).drive(2), 0, 0.7);
      thud(m, 0, 300, 120, 0.02, 0.4, 1.2, 0.01);
      m.add(
        m
          .L(0.75)
          .noise('white')
          .bp(glide(r.vary(520, 0.15), r.vary(2500, 0.15), 0.45), 1.6)
          .env(pts([[0, 0], [0.035, 1], [0.18, 0.7], [0.6, 0.12], [0.75, 0]]))
          .flutter(r.vary(36, 0.2), 0.4),
        0.004,
        0.85,
      );
      m.add(m.L(0.45).noise('brown').lp(420).env(swell(0.02, 0.06, 0.14)).fade(0.001, 0.02), 0.003, 0.6);
      m.add(m.L(0.5).noise('white').hp(3000).lp(6000).env(perc(0.02, 0.18)), 0.01, 0.12);
    },
  },

  /** Grenadier launcher: a hollow tube "bloop". Short and round. */
  thump: {
    bus: 'sfx', dur: 0.4, level: -22.9, variants: 4, gap: 0.09, maxInst: 4, prio: 30, verb: 0.18, pitchVar: 0.05, delayVar: 0.01, heat: 0.35, duck: 0.08,
    gen: (m) => {
      const r = m.r;
      thud(m, 0, r.vary(330, 0.08), 110, 0.042, 0.9, 1.6, 0.012);
      m.add(m.L(0.25).noise('white').env(perc(0.001, 0.05)).bp(r.vary(430, 0.1), 5), 0, 0.8);
      crack(m, 0, 0.25, { hp: 2000, lp: 6000, tau: 0.0015 });
      body(m, 0.002, 0.3, { lp0: 900, lp1: 500, ftau: 0.05, tau: 0.06, color: 'pink', attack: 0.003 });
    },
  },

  /** Arc Pylon / Nyx: a buzzing electric zap with crackle. */
  arc: {
    bus: 'sfx', dur: 0.4, level: -21.8, variants: 4, gap: 0.09, maxInst: 4, prio: 32, verb: 0.22, pitchVar: 0.06, delayVar: 0.008, heat: 0.4, duck: 0.1,
    gen: (m) => {
      const r = m.r;
      const base = r.vary(110, 0.12);
      m.add(
        m
          .L(0.35)
          .osc('saw', (t) => base * (1 + 0.12 * Math.sin(2 * Math.PI * 31 * t)), perc(0.001, 0.08))
          .ring(r.vary(1700, 0.2), 0.6)
          .bp(1800, 0.8)
          .drive(2),
        0,
        0.7,
      );
      m.add(m.L(0.35).crackle((t) => 900 * Math.exp(-t / 0.08), 1, 0.0012).hp(2200).lp(6500), 0, 0.55);
      crack(m, 0, 0.75, { hp: 1500, lp: 7000, tau: 0.003 });
      m.add(m.L(0.2).osc('sine', glide(r.vary(2400, 0.1), 600, 0.12), perc(0.001, 0.05)), 0, 0.18);
    },
  },

  /** Nyx's chain lightning / storm: a thunder-crack with a long sizzle and rumble. */
  arc_big: {
    bus: 'sfx', dur: 1.4, level: -14.9, variants: 2, gap: 0.12, maxInst: 3, prio: 75, verb: 0.3, heat: 0.8, duck: 0.4,
    gen: (m) => {
      const r = m.r;
      crack(m, 0, 1, { hp: 800, lp: 7500, tau: 0.006, drive: 3 });
      m.add(m.L(1.2).crackle((t) => 2400 * Math.exp(-t / 0.25), 1, 0.0015).hp(1500).lp(7000).fade(0.001, 0.05), 0, 0.6);
      m.add(
        m
          .L(0.9)
          .osc('saw', 82, 1)
          .osc('saw', 87, 0.8)
          .ring(r.vary(900, 0.1), 0.7)
          .bp(glide(3000, 500, 0.6), 1.2)
          .env(perc(0.002, 0.25))
          .drive(2),
        0,
        0.55,
      );
      rumble(m, 0.03, 1.3, 0.85, { lp0: 600, lp1: 120, tau1: 0.2, tau2: 0.6, flutter: 8 });
    },
  },
};
