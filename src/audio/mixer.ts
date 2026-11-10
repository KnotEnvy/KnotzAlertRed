/**
 * The mix graph:
 *
 *   voices ─┬─> sfx bus ──────────────┐
 *           └─> sfx reverb send ─> convolver ─> (sfx bus)
 *   ui voices ──> ui bus ─────────────┤
 *   ambience ──> amb bus ─────────────┼─> master ─> limiter ─> ceiling ─> destination
 *   music ──> duck ──> music bus ─────┘
 *        └─> music reverb ─> (duck)
 *
 * The limiter is a fast, hard-knee DynamicsCompressor; the ceiling is a WaveShaper whose
 * curve is linear to -3 dBFS and saturates smoothly to -1 dBFS, so the output can never
 * clip however many explosions stack up.
 */
import type { ThemeId } from '../core/config';
import { db, Rng } from './dsp';

/** Level trims per bus (applied on top of the player's volume sliders). */
export const TRIM = { sfx: 0.8, ui: 0.9, amb: 0.7, music: 1.5 };
/** Output ceiling of the safety shaper (linear). */
export const CEILING = db(-1);

interface IrOpts {
  dur: number;
  rt60: number;
  pre: number;
  lp0: number;
  lp1: number;
  er: number;
  echoes: [number, number][];
  seed: number;
}

/** Outdoor spaces per battlefield: valley, open dunes with a rock slap, ice cliffs. */
const SPACES: Record<ThemeId | 'music', IrOpts> = {
  verdant: { dur: 1.9, rt60: 1.3, pre: 0.008, lp0: 6000, lp1: 1200, er: 8, echoes: [[0.23, 0.12], [0.47, 0.06]], seed: 11 },
  scorched: { dur: 1.6, rt60: 0.9, pre: 0.006, lp0: 7000, lp1: 1800, er: 5, echoes: [[0.31, 0.16], [0.62, 0.07]], seed: 23 },
  frost: { dur: 2.4, rt60: 1.8, pre: 0.01, lp0: 8000, lp1: 2200, er: 10, echoes: [[0.19, 0.1], [0.41, 0.07], [0.8, 0.04]], seed: 37 },
  music: { dur: 3.2, rt60: 2.5, pre: 0.02, lp0: 9000, lp1: 2600, er: 14, echoes: [], seed: 51 },
};

/** Generate a stereo impulse response: early reflections, a darkening diffuse tail, echoes. */
export function makeIR(ctx: BaseAudioContext, o: IrOpts): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.ceil(o.dur * sr);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = new Rng(o.seed * 7 + ch * 101);
    const d = buf.getChannelData(ch);
    const k = 6.91 / o.rt60;
    let lp = 0;
    for (let i = Math.floor(o.pre * sr); i < n; i++) {
      const t = i / sr - o.pre;
      const fc = o.lp1 + (o.lp0 - o.lp1) * Math.exp(-t / (o.rt60 * 0.3));
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lp += a * (r.bi() - lp);
      d[i] = lp * Math.exp(-k * t) * Math.min(1, t / 0.012);
    }
    for (let j = 0; j < o.er; j++) {
      const tj = o.pre + r.range(0.002, 0.085);
      const idx = Math.floor(tj * sr);
      if (idx < n) d[idx] += r.range(0.25, 0.8) * Math.exp(-tj * 14) * (r.chance(0.5) ? 1 : -1);
    }
    for (const [te, g] of o.echoes) {
      const start = Math.floor((te + r.range(-0.004, 0.004)) * sr);
      const L = Math.floor(0.006 * sr);
      let s = 0;
      for (let m = 0; m < L && start + m < n; m++) {
        s += 0.3 * (r.bi() - s);
        d[start + m] += g * 4 * s * Math.exp((-3 * m) / L);
      }
    }
    let e = 0;
    for (let i = 0; i < n; i++) e += d[i] * d[i];
    const g = e > 0 ? 1 / Math.sqrt(e) : 0;
    for (let i = 0; i < n; i++) d[i] *= g;
    // fade the very end
    const f = Math.floor(0.05 * sr);
    for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f;
  }
  return buf;
}

function ceilingCurve(): Float32Array<ArrayBuffer> {
  // input is pre-scaled by 1/2, so the curve's x in [-1, 1] covers ±2 (+6 dBFS)
  const N = 4097;
  const c = new Float32Array(N);
  const k = db(-3);
  const span = CEILING - k;
  for (let i = 0; i < N; i++) {
    const a = ((i / (N - 1)) * 2 - 1) * 2;
    const m = Math.abs(a);
    const y = m <= k ? m : k + span * Math.tanh((m - k) / span);
    c[i] = Math.sign(a) * y;
  }
  return c;
}

export class Mixer {
  readonly sfx: GainNode;
  readonly ui: GainNode;
  readonly amb: GainNode;
  readonly music: GainNode;
  /** Music engine output goes here (through the sidechain duck). */
  readonly musicIn: GainNode;
  readonly musicDuck: GainNode;
  readonly sfxVerbIn: GainNode;
  readonly musicVerbIn: GainNode;
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode | null = null;
  private sfxVerb: ConvolverNode | null = null;
  private theme: ThemeId | null = null;

  constructor(
    readonly ctx: BaseAudioContext,
    bypass = false,
  ) {
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.master = g(1);
    this.sfx = g();
    this.ui = g();
    this.amb = g();
    this.music = g();
    this.musicIn = g();
    this.musicDuck = g();
    this.sfxVerbIn = g();
    this.musicVerbIn = g();
    this.sfx.connect(this.master);
    this.ui.connect(this.master);
    this.amb.connect(this.master);
    this.musicIn.connect(this.musicDuck);
    this.musicDuck.connect(this.music);
    this.music.connect(this.master);

    try {
      this.sfxVerb = ctx.createConvolver();
      this.sfxVerb.normalize = false;
      this.sfxVerbIn.connect(this.sfxVerb);
      this.sfxVerb.connect(this.sfx);
      this.setSpace('verdant');
      const mv = ctx.createConvolver();
      mv.normalize = false;
      mv.buffer = makeIR(ctx, SPACES.music);
      this.musicVerbIn.connect(mv);
      mv.connect(this.musicDuck);
    } catch {
      this.sfxVerb = null;
    }

    if (bypass) {
      this.master.connect(ctx.destination);
      return;
    }
    let tail: AudioNode = this.master;
    try {
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -4;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = 0.15;
      tail.connect(lim);
      tail = lim;
      this.limiter = lim;
    } catch {
      /* no compressor: the ceiling still protects the output */
    }
    try {
      const pre = g(0.5);
      const sh = ctx.createWaveShaper();
      sh.curve = ceilingCurve();
      sh.oversample = 'none';
      tail.connect(pre);
      pre.connect(sh);
      tail = sh;
    } catch {
      /* ignore */
    }
    tail.connect(ctx.destination);
  }

  /** Swap the shared SFX reverb to the battlefield's space. */
  setSpace(theme: ThemeId): void {
    if (!this.sfxVerb || this.theme === theme) return;
    this.theme = theme;
    try {
      this.sfxVerb.buffer = makeIR(this.ctx, SPACES[theme] ?? SPACES.verdant);
    } catch {
      /* ignore */
    }
  }

  /** Set a gain param smoothly (or instantly on an offline context). */
  static ramp(p: AudioParam, v: number, t: number, tau = 0.05): void {
    try {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(v, t, tau);
    } catch {
      p.value = v;
    }
  }
}
