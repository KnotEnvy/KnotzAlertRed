/**
 * Renders sound recipes into PCM once (several seeded variations each), normalises them to
 * their designed loudness and hands out AudioBuffers. PCM is cached per sample rate so the
 * live game, the soundboard and offline renders all share the same data.
 */
import { db, maxMomentary, Mix, Rng } from './dsp';
import { SOUNDS, WARM_ORDER } from './sfx';

const PCM = new Map<string, Float32Array>();
/** Milliseconds spent rendering each id (all variants), for the audio report. */
export const RENDER_MS: Record<string, number> = {};

function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function variantCount(id: string): number {
  const d = SOUNDS[id];
  if (!d) return 0;
  return d.variants ?? (d.bus === 'ui' ? 1 : 2);
}

/**
 * Transparent look-ahead peak limiter: gain never lets |x| exceed `ceil`, ramps down ~1.5 ms
 * ahead of a peak and recovers over ~60 ms.
 */
export function limitPeak(x: Float32Array, sr: number, ceil: number): void {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak <= ceil) return;
  const n = x.length;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    g[i] = a > ceil ? ceil / a : 1;
  }
  const la = Math.max(1, Math.floor(0.0015 * sr));
  for (let i = n - 2; i >= 0; i--) g[i] = Math.min(g[i], g[i + 1] + (1 - g[i + 1]) / la);
  const rel = 1 - Math.exp(-1 / (0.06 * sr));
  for (let i = 1; i < n; i++) g[i] = Math.min(g[i], g[i - 1] + (1 - g[i - 1]) * rel);
  for (let i = 0; i < n; i++) x[i] *= g[i];
}

/** Drop trailing samples below -72 dBFS and fade the last 10 ms. */
function trimTail(x: Float32Array, sr: number): Float32Array {
  const thr = db(-72);
  let end = x.length;
  while (end > 1 && Math.abs(x[end - 1]) < thr) end--;
  end = Math.min(x.length, end + Math.floor(0.005 * sr));
  const y = x.slice(0, Math.max(1, end));
  const f = Math.min(y.length, Math.floor(0.01 * sr));
  for (let i = 0; i < f; i++) y[y.length - 1 - i] *= i / f;
  return y;
}

/** Render (or fetch from cache) the PCM of one variant of a sound. */
export function renderPcm(id: string, v: number, sr: number): Float32Array {
  const key = `${id}|${sr}|${v}`;
  const hit = PCM.get(key);
  if (hit) return hit;
  const def = SOUNDS[id];
  const t0 = performance.now();
  const m = new Mix(sr, new Rng(hashId(id) + v * 7919 + 17), def.dur);
  def.gen(m);
  let out = m.out;
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) out[i] = 0;
  const loud = maxMomentary([out], sr);
  if (Number.isFinite(loud)) {
    const g = db(def.level - loud);
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  limitPeak(out, sr, db(-1));
  out = trimTail(out, sr);
  PCM.set(key, out);
  RENDER_MS[id] = (RENDER_MS[id] ?? 0) + performance.now() - t0;
  return out;
}

/** AudioBuffers of every variant for one rendering context. */
export class SoundBank {
  private bufs = new Map<string, AudioBuffer>();
  private warmTimer: number | null = null;

  constructor(readonly ctx: BaseAudioContext) {}

  get(id: string, v: number): AudioBuffer | null {
    const key = `${id}|${v}`;
    let b = this.bufs.get(key);
    if (b) return b;
    if (!SOUNDS[id]) return null;
    const pcm = renderPcm(id, v, this.ctx.sampleRate);
    b = this.ctx.createBuffer(1, pcm.length, this.ctx.sampleRate);
    b.getChannelData(0).set(pcm);
    this.bufs.set(key, b);
    return b;
  }

  /** Pre-render everything in small idle slices so first triggers never stall a frame. */
  warm(): void {
    if (this.warmTimer !== null) return;
    const queue: [string, number][] = [];
    const seen = new Set<string>();
    for (const id of WARM_ORDER) {
      if (seen.has(id) || !SOUNDS[id]) continue;
      seen.add(id);
      for (let v = 0; v < variantCount(id); v++) queue.push([id, v]);
    }
    const step = () => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 6) {
        const [id, v] = queue.shift()!;
        this.get(id, v);
      }
      this.warmTimer = queue.length ? window.setTimeout(step, 16) : null;
    };
    this.warmTimer = window.setTimeout(step, 50);
  }

  stopWarm(): void {
    if (this.warmTimer !== null) window.clearTimeout(this.warmTimer);
    this.warmTimer = null;
  }
}
