/**
 * Objective measurements of rendered audio, for the render report (nobody on the team can
 * listen, so levels and spectra have to be checked by numbers).
 */
import { db, kFilter, maxMomentary } from './dsp';

export interface Metrics {
  duration: number;
  /** Seconds from the first to the last sample within 50 dB of the peak. */
  active: number;
  peakDb: number;
  truePeakDb: number;
  rmsDb: number;
  /** Integrated, gated loudness (BS.1770). */
  lufs: number;
  /** Maximum momentary (400 ms) loudness. */
  lufsMax: number;
  crest: number;
  centroid: number;
  /** Share of spectral energy below 120 Hz, 120 Hz-2 kHz, above 2 kHz, and above 6 kHz. */
  low: number;
  mid: number;
  high: number;
  air: number;
  dc: number;
  nan: number;
  flags: string[];
}

const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** 4x oversampled peak (windowed-sinc interpolation around the loudest samples). */
function truePeak(x: Float32Array, peak: number): number {
  const taps = 16;
  let best = peak;
  const thr = peak * 0.6;
  for (let i = taps; i < x.length - taps; i++) {
    if (Math.abs(x[i]) < thr) continue;
    for (let ph = 1; ph < 4; ph++) {
      const f = ph / 4;
      let s = 0;
      for (let k = -taps + 1; k <= taps; k++) {
        const d = k - f;
        const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / taps);
        s += x[i + k] * (Math.sin(Math.PI * d) / (Math.PI * d)) * w;
      }
      if (Math.abs(s) > best) best = Math.abs(s);
    }
  }
  return best;
}

/** Integrated loudness with the BS.1770 absolute (-70) and relative (-10 LU) gates. */
function integrated(chans: Float32Array[], sr: number): number {
  const W = Math.floor(0.4 * sr);
  const hop = Math.floor(0.1 * sr);
  const n = chans[0].length;
  const cum = chans.map((c) => {
    const k = kFilter(c, sr);
    const p = new Float64Array(k.length + 1);
    for (let i = 0; i < k.length; i++) p[i + 1] = p[i] + k[i] * k[i];
    return p;
  });
  const blocks: number[] = [];
  for (let s = 0; s === 0 || s + W <= n; s += hop) {
    const e = Math.min(n, s + W);
    let ms = 0;
    for (const p of cum) ms += (p[e] - p[s]) / W;
    blocks.push(ms);
    if (s + W >= n) break;
  }
  const L = (ms: number) => -0.691 + 10 * Math.log10(ms + 1e-20);
  const abs = blocks.filter((b) => L(b) > -70);
  if (!abs.length) return -Infinity;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((b) => L(b) > rel);
  return L(gated.reduce((a, b) => a + b, 0) / gated.length);
}

export function analyze(input: Float32Array[], sr: number, opts: { tailWindow?: number; checkTail?: boolean } = {}): Metrics {
  let nan = 0;
  const chans = input.map((c) => {
    const y = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) {
      const v = c[i];
      if (Number.isFinite(v)) y[i] = v;
      else nan++;
    }
    return y;
  });
  const n = chans[0].length;
  let peak = 0;
  for (const c of chans) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]));
  let tp = peak;
  if (peak > 0) for (const c of chans) tp = Math.max(tp, truePeak(c, peak));

  const mono = new Float32Array(n);
  for (const c of chans) for (let i = 0; i < n; i++) mono[i] += c[i] / chans.length;
  const thr = peak * db(-50);
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (Math.abs(mono[i]) > thr) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) {
    first = 0;
    last = n - 1;
  }
  let ss = 0;
  let dc = 0;
  for (const c of chans) for (let i = first; i <= last; i++) ss += c[i] * c[i];
  for (let i = 0; i < n; i++) dc += mono[i];
  const rms = Math.sqrt(ss / ((last - first + 1) * chans.length));

  // averaged power spectrum
  const N = 4096;
  const hop = n > N * 64 ? N * 2 : N / 2;
  const pow = new Float64Array(N / 2);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let s = 0; s < Math.max(1, n - N / 2); s += hop) {
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = (mono[s + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
  }
  let tot = 0;
  let lowE = 0;
  let midE = 0;
  let highE = 0;
  let airE = 0;
  let cen = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    const p = pow[k];
    tot += p;
    cen += f * p;
    if (f < 120) lowE += p;
    else if (f < 2000) midE += p;
    else highE += p;
    if (f >= 6000) airE += p;
  }
  tot = tot || 1;

  const tw = Math.floor((opts.tailWindow ?? 0.25) * sr);
  let tailSs = 0;
  for (const c of chans) for (let i = Math.max(0, n - tw); i < n; i++) tailSs += c[i] * c[i];
  const tailDb = toDb(Math.sqrt(tailSs / Math.max(1, tw * chans.length)));

  const m: Metrics = {
    duration: n / sr,
    active: (last - first + 1) / sr,
    peakDb: toDb(peak),
    truePeakDb: toDb(tp),
    rmsDb: toDb(rms),
    lufs: integrated(chans, sr),
    lufsMax: maxMomentary(chans, sr),
    crest: toDb(tp) - toDb(rms),
    centroid: cen / tot,
    low: lowE / tot,
    mid: midE / tot,
    high: highE / tot,
    air: airE / tot,
    dc: dc / n,
    nan,
    flags: [],
  };
  if (nan > 0) m.flags.push('NaN');
  if (m.truePeakDb > -0.3) m.flags.push('CLIP');
  if (m.peakDb < -50) m.flags.push('SILENT');
  if (opts.checkTail !== false && tailDb > -60) m.flags.push('LONG-TAIL');
  if (Math.abs(m.dc) > 0.01) m.flags.push('DC');
  return m;
}
