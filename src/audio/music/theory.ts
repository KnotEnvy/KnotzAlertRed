/** Scales, chords and voice leading for the generative soundtrack. */
export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
} as const;

export interface Key {
  /** Pitch class of the tonic (0 = C). */
  root: number;
  mode: readonly number[];
}

/** Semitones above the tonic of scale degree d (any integer; 7 = octave). */
export function degSemi(key: Key, d: number): number {
  const o = Math.floor(d / 7);
  const i = ((d % 7) + 7) % 7;
  return key.mode[i] + 12 * o;
}

/** MIDI note of scale degree d in octave `oct` (the tonic of octave 4 is near middle C). */
export function midiOf(key: Key, d: number, oct: number): number {
  return 12 * (oct + 1) + key.root + degSemi(key, d);
}

/**
 * Chord on scale degree d as semitones above the tonic: triad, or with `size` 4 a seventh.
 * Diminished fifths are raised to perfect fifths so every chord is stable for pads.
 */
export function chordSemis(key: Key, d: number, size = 3, add9 = false): number[] {
  const r = degSemi(key, d);
  const third = degSemi(key, d + 2);
  let fifth = degSemi(key, d + 4);
  if (fifth - r === 6) fifth = r + 7;
  const out = [r, third, fifth];
  if (size >= 4) out.push(degSemi(key, d + 6));
  if (add9) out.push(degSemi(key, d + 8));
  return out;
}

/** Is MIDI note m a chord tone of the given chord (semitones above tonic)? */
export function isChordTone(key: Key, semis: number[], m: number): boolean {
  const pc = (((m - key.root) % 12) + 12) % 12;
  return semis.some((s) => ((s % 12) + 12) % 12 === pc);
}

/**
 * Voice a chord inside [low, high], choosing the inversion that moves least from the
 * previous voicing (smooth voice leading).
 */
export function voiceChord(key: Key, semis: number[], low: number, high: number, prev: number[]): number[] {
  const pcs = semis.map((s) => (((key.root + s) % 12) + 12) % 12);
  const n = pcs.length;
  const cands: number[][] = [];
  for (let inv = 0; inv < n; inv++) {
    for (let base = low; base < low + 12; base++) {
      if (base % 12 !== pcs[inv]) continue;
      const v = [base];
      for (let j = 1; j < n; j++) {
        const pc = pcs[(inv + j) % n];
        let m = v[v.length - 1] + 1;
        while (m % 12 !== pc) m++;
        v.push(m);
      }
      if (v[v.length - 1] <= high) cands.push(v);
      if (n >= 4) {
        // drop-2 voicing for a more open sound
        const d2 = v.slice();
        d2[n - 2] -= 12;
        d2.sort((a, b) => a - b);
        if (d2[0] >= low - 3) cands.push(d2);
      }
    }
  }
  if (!cands.length) return pcs.map((pc) => low + ((pc - low) % 12 + 12) % 12).sort((a, b) => a - b);
  const mid = (low + high) / 2;
  let best = cands[0];
  let bestCost = Infinity;
  for (const c of cands) {
    // stay near the middle of the range so voice leading doesn't creep up or down over time
    const avg = c.reduce((a, b) => a + b, 0) / c.length;
    let cost = Math.abs(avg - mid) * (prev.length === c.length ? 0.7 : 2);
    if (prev.length === c.length) {
      for (let i = 0; i < c.length; i++) cost += Math.abs(c[i] - prev[i]);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best;
}
