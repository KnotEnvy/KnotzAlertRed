/**
 * Music instruments, synthesised sample-by-sample into short multi-sampled buffers once,
 * then played back at any pitch with playbackRate (one source + one gain per note).
 */
import { db, expTo, maxMomentary, midiHz, Mix, perc, perc2, Rng, swell } from '../dsp';
import { limitPeak } from '../bank';

export type InstId =
  | 'kick' | 'snare' | 'rim' | 'hat' | 'ohat' | 'shaker' | 'tom' | 'boom' | 'crash' | 'rev' | 'timp'
  | 'bass' | 'pluck' | 'bell' | 'glass' | 'brass' | 'flute';

interface InstDef {
  /** MIDI roots that get their own sample (null = unpitched, root 60). */
  roots: number[] | null;
  dur: number;
  /** Max-momentary loudness of each sample (sets the instrument balance). */
  level: number;
  gen: (m: Mix, f: number) => void;
}

const HAT_RATIOS = [1, 1.4823, 1.8, 2.546, 2.63, 3.897];

export const INSTRUMENTS: Record<InstId, InstDef> = {
  kick: {
    roots: null, dur: 0.6, level: -15,
    gen: (m) => {
      m.add(m.L(0.6).osc('sine', expTo(165, 47, 0.035), perc(0.001, 0.2)).drive(1.4), 0, 1);
      m.add(m.L(0.02).noise('white', perc(0.0002, 0.003)).hp(2500).lp(7000), 0, 0.3);
    },
  },
  snare: {
    roots: null, dur: 0.45, level: -18,
    gen: (m) => {
      m.add(m.L(0.3).osc('sine', expTo(240, 185, 0.02), perc(0.001, 0.06)).osc('sine', 330, perc(0.001, 0.04)), 0, 0.5);
      m.add(m.L(0.45).noise('white').hp(1300).lp(7500).env(perc(0.001, 0.11)), 0, 0.75);
      m.add(m.L(0.2).noise('white').bp(900, 1).env(perc(0.001, 0.04)), 0, 0.35);
      m.out.forEach((v, i) => (m.out[i] = Math.tanh(v * 1.3)));
    },
  },
  rim: {
    roots: null, dur: 0.12, level: -25,
    gen: (m) => {
      m.add(m.L(0.12).modes([[1700, 0.5, 0.012], [820, 0.4, 0.018]]), 0, 1);
      m.add(m.L(0.01).noise('white', perc(0.0002, 0.0015)).bp(3000, 1), 0, 0.4);
    },
  },
  hat: {
    roots: null, dur: 0.15, level: -29,
    gen: (m) => {
      const l = m.L(0.15);
      for (const r of HAT_RATIOS) l.osc('square', 330 * r, 1);
      l.bp(8000, 0.8).lp(10500).env(perc(0.0005, 0.028));
      m.add(l, 0, 0.3);
    },
  },
  ohat: {
    roots: null, dur: 0.6, level: -29,
    gen: (m) => {
      const l = m.L(0.6);
      for (const r of HAT_RATIOS) l.osc('square', 330 * r, 1);
      l.bp(7500, 0.8).lp(10000).env(perc(0.002, 0.17));
      m.add(l, 0, 0.3);
    },
  },
  shaker: {
    roots: null, dur: 0.14, level: -31,
    gen: (m) => {
      m.add(m.L(0.14).noise('white').bp(5500, 1.2).lp(8000).env((t) => (t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.03))), 0, 1);
    },
  },
  tom: {
    roots: [45], dur: 0.8, level: -18,
    gen: (m, f) => {
      m.add(m.L(0.8).osc('sine', expTo(f * 1.6, f, 0.04), perc(0.001, 0.22)).drive(1.3), 0, 1);
      m.add(m.L(0.05).noise('white').lp(1500).env(perc(0.001, 0.025)), 0, 0.3);
    },
  },
  boom: {
    roots: null, dur: 1.8, level: -14,
    gen: (m) => {
      m.add(m.L(1.8).osc('sine', expTo(96, 42, 0.08), perc(0.002, 0.45)).drive(1.6), 0, 1);
      m.add(m.L(0.5).noise('brown').lp(700).env(perc(0.002, 0.12)), 0, 0.6);
      m.add(m.L(0.03).noise('white').bp(1500, 1).env(perc(0.0005, 0.008)), 0, 0.3);
    },
  },
  crash: {
    roots: null, dur: 2.8, level: -23,
    gen: (m) => {
      const l = m.L(2.8).noise('white').hp(3500).lp(10500);
      const p: [number, number, number][] = [];
      for (let i = 0; i < 14; i++) p.push([m.r.range(3000, 9000), m.r.range(0.02, 0.06), m.r.range(0.4, 1.4)]);
      l.modes(p).env(perc2(0.002, 0.12, 1.1, 0.6));
      m.add(l.fade(0.0005, 0.1), 0, 1);
    },
  },
  rev: {
    roots: null, dur: 1.6, level: -23,
    gen: (m) => {
      const l = m.L(1.6).noise('white').hp(3000).lp(9500).env((t) => Math.pow(t / 1.6, 2.5));
      l.d[l.n - 1] = 0;
      m.add(l.fade(0.05, 0.004), 0, 1);
    },
  },
  timp: {
    roots: [38, 45], dur: 2.2, level: -16,
    gen: (m, f) => {
      m.add(
        m.L(2.2).osc('sine', f, perc(0.003, 0.8)).osc('sine', f * 1.5, perc(0.003, 0.35)).osc('sine', f * 2.0, perc(0.003, 0.2)).drive(1.2),
        0,
        1,
      );
      m.add(m.L(0.1).noise('white').lp(500).env(perc(0.002, 0.04)), 0, 0.4);
    },
  },
  bass: {
    roots: [28, 34, 40, 46], dur: 2.2, level: -17,
    gen: (m, f) => {
      m.add(
        m
          .L(2.2)
          .osc('saw', f, 1)
          .osc('sine', f, 0.9)
          .osc('saw', f * 1.003, 0.5)
          .lp((t) => 140 + 1300 * Math.exp(-t / 0.08) + f, 1.1)
          .env(perc2(0.004, 0.25, 1.4, 0.55))
          .drive(1.5)
          .fade(0.001, 0.05),
        0,
        1,
      );
    },
  },
  pluck: {
    roots: [48, 54, 60, 66, 72, 78], dur: 1.8, level: -21,
    gen: (m, f) => {
      m.add(m.L(1.8).pluck(f, 1, 1.3, 0.55).lp(5000).fade(0.0005, 0.05), 0, 1);
    },
  },
  bell: {
    roots: [60, 66, 72, 78, 84], dur: 2.6, level: -22,
    gen: (m, f) => {
      m.add(
        m
          .L(2.6)
          .osc('sine', f, perc(0.001, 1.0), { pm: { ratio: 3.5, index: (t) => 2.2 * Math.exp(-t / 0.35) } })
          .osc('sine', f * 2.76, perc(0.001, 0.3), {})
          .lp(7000)
          .fade(0.0005, 0.05),
        0,
        1,
      );
    },
  },
  glass: {
    roots: [60, 66, 72, 78, 84], dur: 2.2, level: -22,
    gen: (m, f) => {
      m.add(
        m
          .L(2.2)
          .osc('sine', f, perc(0.002, 0.7), { pm: { ratio: 2, index: (t) => 1.3 * Math.exp(-t / 0.2) } })
          .osc('sine', f * 4.01, perc(0.002, 0.15), {})
          .lp(7000)
          .fade(0.0005, 0.05),
        0,
        1,
      );
    },
  },
  brass: {
    roots: [43, 49, 55, 61, 67, 73], dur: 2.0, level: -19,
    gen: (m, f) => {
      m.add(
        m
          .L(2.0)
          .osc('saw', f, 1, { drift: 4 })
          .osc('saw', f * 1.004, 0.8)
          .osc('saw', f * 0.996, 0.7)
          .lp((t) => f * 1.5 + 2600 * (1 - Math.exp(-t / 0.04)) * Math.exp(-t / 0.9), 0.9)
          .env(swell(0.03, 1.4, 0.25))
          .drive(1.2)
          .fade(0.001, 0.05),
        0,
        1,
      );
    },
  },
  flute: {
    roots: [60, 66, 72, 78, 84], dur: 2.0, level: -21,
    gen: (m, f) => {
      const vib = (t: number) => f * (1 + 0.006 * Math.min(1, t / 0.4) * Math.sin(2 * Math.PI * 5.2 * t));
      const env = swell(0.07, 1.4, 0.3);
      m.add(m.L(2.0).osc('sine', vib, env).osc('tri', (t) => vib(t) * 2, (t) => env(t) * 0.12).fade(0.001, 0.05), 0, 1);
      m.add(m.L(2.0).noise('white').bp(f * 2, 2).env((t) => env(t) * 0.5), 0, 0.06);
    },
  },
};

const PCM = new Map<string, Float32Array>();

function renderInst(id: InstId, root: number, sr: number): Float32Array {
  const key = `${id}|${root}|${sr}`;
  const hit = PCM.get(key);
  if (hit) return hit;
  const def = INSTRUMENTS[id];
  const m = new Mix(sr, new Rng(root * 131 + id.length * 977 + id.charCodeAt(0)), def.dur);
  def.gen(m, midiHz(root));
  const out = m.out;
  const loud = maxMomentary([out], sr);
  if (Number.isFinite(loud)) {
    const g = db(def.level - loud);
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  limitPeak(out, sr, db(-1));
  PCM.set(key, out);
  return out;
}

export interface Sample {
  buf: AudioBuffer;
  rate: number;
}

/** AudioBuffers of every instrument sample for one context, built incrementally. */
export class InstrumentBank {
  private bufs = new Map<string, AudioBuffer>();
  private queue: [InstId, number][] = [];

  constructor(readonly ctx: BaseAudioContext) {
    for (const id of Object.keys(INSTRUMENTS) as InstId[]) {
      for (const root of INSTRUMENTS[id].roots ?? [60]) this.queue.push([id, root]);
    }
  }

  get ready(): boolean {
    return this.queue.length === 0;
  }

  /** Render pending samples for up to `ms` milliseconds (Infinity = all). Returns ready. */
  prepare(ms = Infinity): boolean {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < ms) {
      const [id, root] = this.queue.shift()!;
      this.buffer(id, root);
    }
    return this.ready;
  }

  private buffer(id: InstId, root: number): AudioBuffer {
    const key = `${id}|${root}`;
    let b = this.bufs.get(key);
    if (!b) {
      const pcm = renderInst(id, root, this.ctx.sampleRate);
      b = this.ctx.createBuffer(1, pcm.length, this.ctx.sampleRate);
      b.getChannelData(0).set(pcm);
      this.bufs.set(key, b);
    }
    return b;
  }

  /** The sample and playback rate for an instrument at a MIDI pitch. */
  sample(id: InstId, midi: number): Sample {
    const roots = INSTRUMENTS[id].roots;
    if (!roots) return { buf: this.buffer(id, 60), rate: Math.pow(2, (midi - 60) / 12) };
    let best = roots[0];
    for (const r of roots) if (Math.abs(r - midi) < Math.abs(best - midi)) best = r;
    return { buf: this.buffer(id, best), rate: Math.pow(2, (midi - best) / 12) };
  }
}
