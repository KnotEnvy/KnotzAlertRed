/**
 * Battlefield ambience: a seamless stereo bed per theme (breeze and leaves, dry wind and
 * sand, howling ice wind) rendered once at half sample rate and looped quietly.
 */
import type { ThemeId } from '../core/config';
import { db, maxMomentary, Mix, Rng } from './dsp';

const LEN = 14;
const XFADE = 2;
const BED_LEVEL = -31;
const cache = new Map<string, Float32Array[]>();

function genBed(m: Mix, theme: ThemeId): void {
  const T = m.dur;
  if (theme === 'verdant') {
    m.add(m.L(T).noise('pink').lp(650).flutter(0.12, 0.6).flutter(0.6, 0.3), 0, 1);
    m.add(m.L(T).noise('white').hp(2500).lp(5500).flutter(5, 0.85).flutter(0.15, 0.7), 0, 0.1);
  } else if (theme === 'scorched') {
    m.add(m.L(T).noise('pink').bp(520, 0.6).flutter(0.18, 0.75).flutter(0.9, 0.3), 0, 1);
    m.add(m.L(T).noise('white').hp(4200).lp(7000).flutter(11, 0.8).flutter(0.18, 0.8), 0, 0.12);
  } else {
    m.add(
      m
        .L(T)
        .noise('white')
        .bp((t) => 520 + 200 * Math.sin((2 * Math.PI * t) / 7) + 120 * Math.sin((2 * Math.PI * t) / 3.1), 5)
        .flutter(0.2, 0.7),
      0,
      1.4,
    );
    m.add(m.L(T).noise('brown').lp(160).flutter(0.1, 0.5), 0, 0.6);
    m.add(m.L(T).noise('pink').hp(1500).lp(4000).flutter(0.3, 0.6), 0, 0.2);
  }
}

/** Render (cached) the looping stereo bed for a theme at sample rate `sr`. */
export function renderBed(theme: ThemeId, sr: number): Float32Array[] {
  const key = `${theme}|${sr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const n = Math.floor(LEN * sr);
  const x = Math.floor(XFADE * sr);
  const chans = [0, 1].map((ch) => {
    const m = new Mix(sr, new Rng(theme.length * 1000 + ch * 77 + 5), LEN + XFADE);
    genBed(m, theme);
    const out = new Float32Array(n);
    out.set(m.out.subarray(0, n));
    // crossfade the overhang into the start so the loop is seamless
    for (let i = 0; i < x; i++) {
      const a = i / x;
      out[i] = m.out[i] * Math.sqrt(a) + m.out[n + i] * Math.sqrt(1 - a);
    }
    return out;
  });
  const loud = maxMomentary(chans, sr);
  if (Number.isFinite(loud)) {
    const g = db(BED_LEVEL - loud);
    for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
  }
  cache.set(key, chans);
  return chans;
}

export class Ambience {
  theme: ThemeId | null = null;
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;

  constructor(
    private ctx: BaseAudioContext,
    private bus: AudioNode,
  ) {}

  /** `phase` (0..1) picks where in the loop to begin. */
  start(theme: ThemeId, at: number, phase = 0): void {
    if (this.src && this.theme === theme) return;
    this.stop(at);
    const ctx = this.ctx;
    try {
      const sr = Math.max(8000, Math.round(ctx.sampleRate / 2));
      const chans = renderBed(theme, sr);
      const buf = ctx.createBuffer(2, chans[0].length, sr);
      buf.getChannelData(0).set(chans[0]);
      buf.getChannelData(1).set(chans[1]);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.setTargetAtTime(1, at, 1.2);
      src.connect(g);
      g.connect(this.bus);
      src.start(at, phase * LEN);
      this.src = src;
      this.gain = g;
      this.theme = theme;
    } catch {
      this.src = null;
    }
  }

  stop(at: number): void {
    const src = this.src;
    const g = this.gain;
    if (!src || !g) return;
    this.src = null;
    this.gain = null;
    this.theme = null;
    try {
      g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(0, at, 0.3);
      src.stop(at + 1.5);
      src.onended = () => {
        src.disconnect();
        g.disconnect();
      };
    } catch {
      /* ignore */
    }
  }
}
