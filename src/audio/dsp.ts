/**
 * Sample-level synthesis toolkit. Every sound effect and music instrument is computed here
 * into plain Float32Arrays (no Web Audio nodes), so the same code renders identically in the
 * live game, in an OfflineAudioContext and in the audio test harness.
 */
export const TAU = Math.PI * 2;

/** A number, or a function of local time in seconds. */
export type Curve = number | ((t: number) => number);
export const cv = (c: Curve, t: number): number => (typeof c === 'number' ? c : c(t));

export const db = (x: number): number => Math.pow(10, x / 20);
export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

/** Small seeded PRNG (mulberry32) so sound variants are reproducible. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** x scaled by a random factor in [1 - amt, 1 + amt]. */
  vary(x: number, amt: number): number {
    return x * (1 + (this.next() * 2 - 1) * amt);
  }
  bi(): number {
    return this.next() * 2 - 1;
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Weighted pick: weights[i] for arr[i]. */
  weighted<T>(arr: readonly T[], weights: readonly number[]): T {
    let sum = 0;
    for (const w of weights) sum += w;
    let r = this.next() * sum;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
}

// ---------------------------------------------------------------------------- envelopes
/** Linear attack, then exponential decay with time constant `d`. */
export const perc = (a: number, d: number) => (t: number): number => (t < a ? t / a : Math.exp(-(t - a) / d));
/** Attack then a two-stage decay: fast `d1` blended with a slow tail `d2` (weight w). */
export const perc2 = (a: number, d1: number, d2: number, w: number) => (t: number): number =>
  t < a ? t / a : (1 - w) * Math.exp(-(t - a) / d1) + w * Math.exp(-(t - a) / d2);
/** Smooth (squared) attack, hold, exponential release. */
export const swell = (a: number, hold: number, r: number) => (t: number): number => {
  if (t < a) {
    const x = t / a;
    return x * x;
  }
  if (t < a + hold) return 1;
  return Math.exp(-(t - a - hold) / r);
};
/** Exponential glide from f0 to f1 over `dur`, then hold f1. */
export const glide = (f0: number, f1: number, dur: number) => (t: number): number =>
  t >= dur ? f1 : f0 * Math.pow(f1 / f0, t / dur);
/** Asymptotic approach from f0 towards f1 with time constant tau (drum pitch drop). */
export const expTo = (f0: number, f1: number, tau: number) => (t: number): number => f1 + (f0 - f1) * Math.exp(-t / tau);
export const lin = (a: number, b: number, dur: number) => (t: number): number => (t >= dur ? b : a + ((b - a) * t) / dur);
/** Piecewise-linear curve through [time, value] points. */
export const pts = (p: readonly (readonly [number, number])[]) => (t: number): number => {
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      const [t0, v0] = p[i - 1];
      const [t1, v1] = p[i];
      return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-9, t1 - t0);
    }
  }
  return p[p.length - 1][1];
};
/** Window that is 1 between start and end with short linear fades. */
export const gate = (start: number, end: number, fade = 0.004) => (t: number): number => {
  if (t < start - fade || t > end + fade) return 0;
  if (t < start) return 1 - (start - t) / fade;
  if (t > end) return 1 - (t - end) / fade;
  return 1;
};

export type Wave = 'sine' | 'tri' | 'saw' | 'square';
export type FilterType = 'lp' | 'hp' | 'bp' | 'notch';

function polyBlep(ph: number, dt: number): number {
  if (ph < dt) {
    const x = ph / dt;
    return x + x - x * x - 1;
  }
  if (ph > 1 - dt) {
    const x = (ph - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

interface OscOpts {
  phase?: number;
  /** Pulse width for square. */
  pw?: number;
  /** Phase modulation (sine only): modulator at freq * ratio with the given index. */
  pm?: { ratio: number; index: Curve };
  /** Random pitch wander in cents (slow). */
  drift?: number;
}

/**
 * A mono signal buffer with chainable generators and processors. Generators add into the
 * buffer (so several can be layered), processors transform it in place.
 */
export class Layer {
  readonly d: Float32Array;
  readonly n: number;
  constructor(
    readonly sr: number,
    readonly dur: number,
    readonly r: Rng,
  ) {
    this.n = Math.max(1, Math.ceil(dur * sr));
    this.d = new Float32Array(this.n);
  }

  // ------------------------------------------------------------------ generators
  osc(wave: Wave, freq: Curve, amp: Curve = 1, o: OscOpts = {}): this {
    const { sr, d, n } = this;
    let ph = o.phase ?? this.r.next();
    let mph = 0;
    const pw = o.pw ?? 0.5;
    let drift = 0;
    let driftTarget = 0;
    const driftAmt = o.drift ?? 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let f = cv(freq, t);
      if (driftAmt) {
        if ((i & 1023) === 0) driftTarget = this.r.bi() * driftAmt;
        drift += (driftTarget - drift) * 0.0005;
        f *= Math.pow(2, drift / 1200);
      }
      const dt = Math.min(0.49, Math.max(1e-7, f / sr));
      let v: number;
      switch (wave) {
        case 'sine':
          if (o.pm) {
            mph += (f * o.pm.ratio) / sr;
            if (mph >= 1) mph -= Math.floor(mph);
            v = Math.sin(TAU * ph + cv(o.pm.index, t) * Math.sin(TAU * mph));
          } else {
            v = Math.sin(TAU * ph);
          }
          break;
        case 'tri':
          v = 1 - 4 * Math.abs(ph - 0.5);
          break;
        case 'saw':
          v = 2 * ph - 1 - polyBlep(ph, dt);
          break;
        case 'square': {
          v = ph < pw ? 1 : -1;
          v += polyBlep(ph, dt);
          let p2 = ph + 1 - pw;
          if (p2 >= 1) p2 -= 1;
          v -= polyBlep(p2, dt);
          break;
        }
      }
      d[i] += v * cv(amp, t);
      ph += dt;
      if (ph >= 1) ph -= Math.floor(ph);
    }
    return this;
  }

  /** White, pink or brown noise. */
  noise(color: 'white' | 'pink' | 'brown' = 'white', amp: Curve = 1): this {
    const { sr, d, n, r } = this;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let br = 0;
    for (let i = 0; i < n; i++) {
      const w = r.next() * 2 - 1;
      let v = w;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        v = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (color === 'brown') {
        br = (br + 0.02 * w) / 1.02;
        v = br * 3.5;
      }
      d[i] += v * (typeof amp === 'number' ? amp : amp(i / sr));
    }
    return this;
  }

  /** Sum of exponentially decaying sine partials: [freq, amp, decay tau]. Metal, bells, glass. */
  modes(partials: readonly (readonly [number, number, number])[], at = 0, pitch: Curve = 1): this {
    const { sr, d, n } = this;
    const start = Math.floor(at * sr);
    for (const [f, a, tau] of partials) {
      let ph = this.r.next();
      const len = Math.min(n - start, Math.ceil(tau * 7 * sr));
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        d[start + i] += Math.sin(TAU * ph) * a * Math.exp(-t / tau);
        ph += (f * cv(pitch, t)) / sr;
        if (ph >= 1) ph -= 1;
      }
    }
    return this;
  }

  /**
   * Sparse random impulses ("crackle"): `rate` events per second, each a tiny decaying
   * noise click of `len` seconds with random amplitude.
   */
  crackle(rate: Curve, amp: Curve, len = 0.0016): this {
    const { sr, d, n, r } = this;
    const L = Math.max(2, Math.floor(len * sr));
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (r.next() < cv(rate, t) / sr) {
        const a = cv(amp, t) * (0.25 + 0.75 * r.next()) * (r.next() < 0.5 ? -1 : 1);
        const k = Math.min(L, n - i);
        for (let j = 0; j < k; j++) d[i + j] += a * (r.next() * 2 - 1) * Math.exp((-4 * j) / L);
      }
    }
    return this;
  }

  /** Karplus-Strong plucked string. `decay` ~ seconds to fade, `bright` 0..1. */
  pluck(freq: number, amp = 1, decay = 1.5, bright = 0.5): this {
    const { sr, d, n, r } = this;
    const period = sr / freq;
    const N = Math.max(2, Math.floor(period));
    const frac = period - N;
    const line = new Float32Array(N + 2);
    // excitation: filtered noise burst
    let lpState = 0;
    const exLp = 0.15 + 0.8 * bright;
    for (let i = 0; i < line.length; i++) {
      lpState += exLp * (r.bi() - lpState);
      line[i] = lpState;
    }
    const loss = Math.pow(0.001, 1 / (decay * freq));
    const damp = 0.5 - 0.45 * bright;
    let idx = 0;
    let prev = 0;
    let ap = 0;
    const apC = (1 - frac) / (1 + frac);
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      const nxt = line[(idx + 1) % line.length];
      // lowpass in the loop (damping), then a fractional all-pass for tuning
      const lpv = (1 - damp) * cur + damp * nxt;
      const y = apC * (lpv - ap) + prev;
      ap = y;
      prev = lpv;
      line[idx] = y * loss;
      d[i] += cur * amp;
      idx++;
      if (idx >= N) idx = 0;
    }
    return this;
  }

  // ------------------------------------------------------------------ processors
  /** State-variable (TPT) filter with time-varying cutoff. */
  filter(type: FilterType, fc: Curve, q: Curve = 0.707): this {
    const { sr, d, n } = this;
    let ic1 = 0, ic2 = 0;
    let a1 = 0, a2 = 0, a3 = 0, k = 1;
    const nyq = sr * 0.45;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) {
        const t = i / sr;
        const f = clamp(cv(fc, t), 10, nyq);
        const g = Math.tan((Math.PI * f) / sr);
        k = 1 / Math.max(0.05, cv(q, t));
        a1 = 1 / (1 + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
      }
      const x = d[i];
      const v3 = x - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;
      switch (type) {
        case 'lp':
          d[i] = v2;
          break;
        case 'bp':
          d[i] = v1 * k;
          break;
        case 'hp':
          d[i] = x - k * v1 - v2;
          break;
        case 'notch':
          d[i] = x - k * v1;
          break;
      }
    }
    return this;
  }
  lp(fc: Curve, q: Curve = 0.707): this {
    return this.filter('lp', fc, q);
  }
  hp(fc: Curve, q: Curve = 0.707): this {
    return this.filter('hp', fc, q);
  }
  bp(fc: Curve, q: Curve = 1): this {
    return this.filter('bp', fc, q);
  }

  /** Multiply by an envelope. */
  env(c: Curve): this {
    const { sr, d, n } = this;
    if (typeof c === 'number') {
      for (let i = 0; i < n; i++) d[i] *= c;
    } else {
      for (let i = 0; i < n; i++) d[i] *= c(i / sr);
    }
    return this;
  }
  gain(g: number): this {
    return this.env(g);
  }

  /** tanh saturation; `amt` > 1 adds harmonics. Output keeps roughly the same peak. */
  drive(amt: number): this {
    const { d, n } = this;
    const norm = 1 / Math.tanh(amt);
    for (let i = 0; i < n; i++) d[i] = Math.tanh(d[i] * amt) * norm;
    return this;
  }

  /** Asymmetric saturation (even harmonics, "tube" grit). */
  grit(amt: number): this {
    const { d, n } = this;
    for (let i = 0; i < n; i++) {
      const x = d[i] * amt;
      d[i] = (x >= 0 ? Math.tanh(x) : Math.tanh(x * 0.6) / 0.6) / amt;
    }
    return this;
  }

  /** Amplitude modulation (tremolo / flutter) with depth 0..1. */
  am(freq: Curve, depth: Curve): this {
    const { sr, d, n } = this;
    let ph = this.r.next();
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const dep = cv(depth, t);
      d[i] *= 1 - dep * 0.5 * (1 + Math.sin(TAU * ph));
      ph += cv(freq, t) / sr;
    }
    return this;
  }

  /** Random-amplitude flutter (smoothed noise modulation), for rumble and fire. */
  flutter(rate: number, depth: number): this {
    const { sr, d, n, r } = this;
    const step = Math.max(1, Math.floor(sr / rate));
    let a = r.next();
    let b = r.next();
    for (let i = 0; i < n; i++) {
      const k = i % step;
      if (k === 0) {
        a = b;
        b = r.next();
      }
      const x = k / step;
      const s = a + (b - a) * (x * x * (3 - 2 * x));
      d[i] *= 1 - depth + depth * s;
    }
    return this;
  }

  /** Ring modulation with a sine. */
  ring(freq: Curve, mix = 1): this {
    const { sr, d, n } = this;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const m = Math.sin(TAU * ph);
      d[i] = d[i] * (1 - mix) + d[i] * m * mix;
      ph += cv(freq, i / sr) / sr;
    }
    return this;
  }

  /** Feedback delay (echo / comb). */
  echo(time: number, fb: number, mix: number, damp = 0.3): this {
    const { sr, d, n } = this;
    const L = Math.max(1, Math.floor(time * sr));
    const line = new Float32Array(L);
    let idx = 0;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const y = line[idx];
      lp += (1 - damp) * (y - lp);
      line[idx] = d[i] + lp * fb;
      d[i] += y * mix;
      idx++;
      if (idx >= L) idx = 0;
    }
    return this;
  }

  /** Scale so the absolute peak equals `peak`. */
  norm(peak = 1): this {
    let m = 0;
    for (let i = 0; i < this.n; i++) m = Math.max(m, Math.abs(this.d[i]));
    if (m > 0) this.gain(peak / m);
    return this;
  }

  /** Short fade in/out to kill clicks. */
  fade(inS = 0.001, outS = 0.01): this {
    const { sr, d, n } = this;
    const fi = Math.min(n, Math.floor(inS * sr));
    const fo = Math.min(n, Math.floor(outS * sr));
    for (let i = 0; i < fi; i++) d[i] *= i / fi;
    for (let i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
    return this;
  }

  reverse(): this {
    this.d.reverse();
    return this;
  }
}

/** The output buffer of one sound: layers are rendered and mixed in at time offsets. */
export class Mix {
  readonly out: Float32Array;
  constructor(
    readonly sr: number,
    readonly r: Rng,
    readonly dur: number,
  ) {
    this.out = new Float32Array(Math.max(1, Math.ceil(dur * sr)));
  }
  /** A new empty layer of the given length. */
  L(dur: number): Layer {
    return new Layer(this.sr, dur, this.r);
  }
  /** Mix a layer into the output starting at `at` seconds. */
  add(l: Layer, at = 0, g = 1): this {
    const o = Math.floor(at * this.sr);
    const out = this.out;
    const len = Math.min(l.n, out.length - o);
    for (let i = Math.max(0, -o); i < len; i++) out[o + i] += l.d[i] * g;
    return this;
  }
}

// ---------------------------------------------------------------------------- loudness
/** ITU-R BS.1770 K-weighting coefficients for an arbitrary sample rate. */
export function kWeights(sr: number): { b: number[]; a: number[] }[] {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sr);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / sr);
  a0 = 1 + K / Q + K * K;
  const hp = { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  return [shelf, hp];
}

/** K-weighted copy of a channel. */
export function kFilter(x: Float32Array, sr: number): Float32Array {
  const y = new Float32Array(x.length);
  y.set(x);
  for (const { b, a } of kWeights(sr)) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const xi = y[i];
      const yi = b[0] * xi + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1;
      x1 = xi;
      y2 = y1;
      y1 = yi;
      y[i] = yi;
    }
  }
  return y;
}

/**
 * Maximum momentary loudness (LUFS, 400 ms window, zero-padded for short sounds) of a set of
 * channels. Used to normalise every sound effect to a designed level.
 */
export function maxMomentary(chans: Float32Array[], sr: number): number {
  const W = Math.floor(0.4 * sr);
  const hop = Math.floor(0.05 * sr);
  const sq = chans.map((c) => {
    const k = kFilter(c, sr);
    for (let i = 0; i < k.length; i++) k[i] *= k[i];
    return k;
  });
  const n = chans[0].length;
  let best = -Infinity;
  for (let s = 0; s < Math.max(1, n - W + hop); s += hop) {
    let sum = 0;
    for (const c of sq) {
      const e = Math.min(n, s + W);
      for (let i = s; i < e; i++) sum += c[i];
    }
    const l = -0.691 + 10 * Math.log10(sum / W + 1e-20);
    if (l > best) best = l;
  }
  return best;
}
