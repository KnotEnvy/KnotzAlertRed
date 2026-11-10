/**
 * Generative composer. It writes one bar at a time as note events for the engine to
 * schedule. Variety over a long match comes from: weighted progression pools per state,
 * arrangement sections chosen by a Markov walk, a bank of melodic motifs that is renewed
 * and varied (transposed, inverted, displaced, sequenced), rotating instruments and drum
 * patterns, a slowly wandering density, and a key change every few minutes.
 */
import type { ThemeId } from '../../core/config';
import { clamp, Rng } from '../dsp';
import type { InstId } from './instruments';
import { chordSemis, isChordTone, type Key, MODES, midiOf, voiceChord } from './theory';

export type MusicState = 'menu' | 'calm' | 'tension' | 'combat' | 'victory' | 'defeat';
export type LoopState = 'menu' | 'calm' | 'tension' | 'combat';
export type Channel = 'C' | 'L' | 'R' | 'W';
export type PadTone = 'warm' | 'hollow' | 'glass';

export interface NoteEv {
  inst: InstId;
  midi: number;
  /** Position in 16th notes from the bar start (may be fractional). */
  step: number;
  /** Length in 16ths before release (omit to let the sample ring). */
  len?: number;
  vel: number;
  ch: Channel;
}

export interface PadEv {
  notes: number[];
  step: number;
  len: number;
  vel: number;
  tone: PadTone;
  cut0: number;
  cut1: number;
  /** Attack in seconds. */
  attack: number;
}

export interface BarEvents {
  notes: NoteEv[];
  pads: PadEv[];
}

interface ThemeCfg {
  root: number;
  mode: readonly number[];
  pad: PadTone;
  arp: InstId[];
  lead: InstId[];
}

const THEMES: Record<ThemeId | 'menu', ThemeCfg> = {
  verdant: { root: 2, mode: MODES.dorian, pad: 'warm', arp: ['pluck', 'bell'], lead: ['flute', 'bell'] },
  scorched: { root: 4, mode: MODES.phrygian, pad: 'hollow', arp: ['pluck', 'pluck', 'bell'], lead: ['brass', 'flute'] },
  frost: { root: -1, mode: MODES.aeolian, pad: 'glass', arp: ['glass', 'pluck'], lead: ['bell', 'flute'] },
  menu: { root: -3, mode: MODES.aeolian, pad: 'warm', arp: ['pluck'], lead: ['brass'] },
};

const PROGS: Record<LoopState, number[][]> = {
  calm: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [5, 6, 0, 0], [0, 2, 3, 0], [3, 4, 0, 0], [0, 5, 3, 6], [5, 3, 0, 6], [0, 3, 0, 6]],
  tension: [[0, 0, 5, 5], [0, 1, 0, 6], [0, 5, 0, 4], [5, 5, 0, 0], [0, 0, 6, 1], [3, 3, 0, 0], [0, 6, 0, 5]],
  combat: [[0, 5, 6, 0], [0, 6, 5, 4], [5, 6, 0, 0], [0, 3, 6, 5], [0, 2, 6, 4], [0, 0, 5, 6], [3, 4, 5, 6], [0, 5, 3, 6]],
  menu: [[0, 5, 3, 4], [0, 6, 5, 6], [5, 3, 0, 4], [0, 2, 5, 6], [0, 3, 5, 6]],
};

interface Section {
  bass: boolean;
  arp: boolean;
  lead: boolean;
  bells: boolean;
  perc: boolean;
}
const CALM_SECTIONS: Section[] = [
  { bass: false, arp: false, lead: false, bells: true, perc: false },
  { bass: true, arp: true, lead: false, bells: false, perc: false },
  { bass: true, arp: true, lead: true, bells: false, perc: false },
  { bass: true, arp: true, lead: false, bells: true, perc: true },
  { bass: true, arp: false, lead: true, bells: false, perc: true },
];

/** Rhythm cells for 2-bar motifs: [start step, length] in 16ths. */
const RHYTHMS: [number, number][][] = [
  [[0, 6], [6, 2], [8, 4], [12, 4], [16, 12]],
  [[0, 4], [4, 4], [8, 2], [10, 2], [12, 4], [16, 8], [24, 8]],
  [[2, 2], [4, 4], [8, 8], [16, 4], [20, 4], [24, 8]],
  [[0, 3], [3, 3], [6, 2], [8, 8], [16, 3], [19, 3], [22, 2], [24, 8]],
  [[0, 8], [8, 4], [12, 4], [16, 16]],
  [[0, 2], [2, 2], [4, 4], [8, 4], [12, 4], [16, 6], [22, 2], [24, 8]],
  [[4, 4], [8, 2], [10, 2], [12, 4], [16, 4], [20, 4], [24, 8]],
];

const KICKS = ['X.......X.......', 'X......xX.......', 'X..x....X.x.....', 'X.....X...X.....', 'X..x..x.X.......', 'X.......X..x..x.'];
const STABS = [[0, 6, 12], [0, 3, 10], [0, 10], [0, 6, 8, 14]];
const BASS_PATS = ['RROROR5R', 'R-RRO-R5', 'RRRORRR5', 'R-R-ORR5', 'RRRRORRO'];

interface MotifNote {
  s: number;
  l: number;
  d: number;
}
type Motif = MotifNote[];

interface Phrase {
  state: LoopState;
  prog: number[];
  bars: number;
  bar: number;
  melodic: boolean;
  motif: Motif;
  arpShape: number;
  arpInst: InstId;
  leadInst: InstId;
  bassPat: number;
  kick: number;
  hat16: boolean;
  breakdown: boolean;
  section: Section;
  ost: number[];
}

/** Map a MIDI note into [lo, lo + 12). */
function into(m: number, lo: number): number {
  while (m < lo) m += 12;
  while (m >= lo + 12) m -= 12;
  return m;
}

function pattern(p: string, cb: (step: number, accent: number) => void): void {
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === 'X') cb(i, 1);
    else if (c === 'x') cb(i, 0.72);
    else if (c === 'o') cb(i, 0.4);
  }
}

export class Composer {
  readonly r: Rng;
  key: Key;
  private cfg: ThemeCfg;
  private baseRoot: number;
  private phrases: Partial<Record<LoopState, Phrase>> = {};
  private prevPad: Partial<Record<string, number[]>> = {};
  private motifs: Motif[] = [];
  private menuMotif: Motif;
  private phraseCount = 0;
  private nextModulation: number;
  private density = 0.6;
  private calmSection = 1;
  private calmSectionLeft = 2;
  private lastProg: Partial<Record<LoopState, number[][]>> = {};
  /** Increments every phrase; exposed for the soundboard read-out. */
  barsWritten = 0;

  constructor(seed: number, theme: ThemeId | 'menu') {
    this.r = new Rng(seed);
    this.cfg = THEMES[theme];
    this.baseRoot = this.cfg.root;
    this.key = { root: this.cfg.root, mode: this.cfg.mode };
    this.nextModulation = this.r.int(26, 34);
    this.menuMotif = this.genMotif(new Rng(4242));
    for (let i = 0; i < 3; i++) this.motifs.push(this.genMotif(this.r));
  }

  bpm(state: MusicState): number {
    if (state === 'menu') return 78;
    if (state === 'victory') return 100;
    if (state === 'defeat') return 66;
    return 96;
  }

  /** Forget phrase position for a state so it restarts cleanly when entered. */
  reset(state: LoopState): void {
    delete this.phrases[state];
  }

  // ------------------------------------------------------------------ motifs
  private genMotif(r: Rng): Motif {
    const rh = r.pick(RHYTHMS);
    let d = r.pick([0, 2, 4, 4, 7]);
    let dir = r.chance(0.5) ? 1 : -1;
    const out: Motif = [];
    rh.forEach(([s, l], i) => {
      if (i > 0) {
        const mv = r.weighted([1, 2, 3, 4, 0], [50, 24, 10, 5, 11]);
        d += mv * dir;
        if (mv >= 3 || r.chance(0.3)) dir = -dir;
        if (d > 9) {
          d = 9;
          dir = -1;
        }
        if (d < -2) {
          d = -2;
          dir = 1;
        }
      }
      out.push({ s, l, d });
    });
    const last = out[out.length - 1];
    last.d = [0, 2, 4, 7].reduce((a, b) => (Math.abs(b - last.d) < Math.abs(a - last.d) ? b : a), 0);
    return out;
  }

  private vary(m: Motif, v: number): Motif {
    switch (v % 5) {
      case 1: {
        const shift = m.some((n) => n.d > 6) ? -2 : 2;
        return m.map((n) => ({ ...n, d: n.d + shift }));
      }
      case 2: {
        const pivot = m[0].d;
        return m.map((n) => ({ ...n, d: clamp(pivot - (n.d - pivot), -3, 10) }));
      }
      case 3:
        return m.filter((n) => n.s + 2 < 32).map((n) => ({ ...n, s: n.s + 2 }));
      case 4: {
        const first = m.filter((n) => n.s < 16);
        return [...first, ...first.map((n) => ({ s: n.s + 16, l: n.l, d: n.d + 1 }))];
      }
      default:
        return m;
    }
  }

  // ------------------------------------------------------------------ phrases
  private newPhrase(state: LoopState): Phrase {
    const r = this.r;
    this.phraseCount++;
    this.density = clamp(this.density + r.bi() * 0.15, 0.35, 1);
    if (this.phraseCount >= this.nextModulation) {
      // modulate, staying within a few semitones of the theme's home key
      this.nextModulation = this.phraseCount + r.int(26, 36);
      let root = this.key.root + r.pick([2, -2, 3, -3, 5, -5]);
      if (root - this.baseRoot > 4) root -= 12;
      if (root - this.baseRoot < -4) root += 12;
      if (Math.abs(root - this.baseRoot) > 5) root = this.baseRoot;
      this.key = { root, mode: this.key.mode };
    }
    if (this.phraseCount % 6 === 0) {
      this.motifs.push(this.genMotif(r));
      if (this.motifs.length > 4) this.motifs.shift();
    }
    const recent = this.lastProg[state] ?? [];
    const pool = PROGS[state];
    const weights = pool.map((p) => (recent.includes(p) ? 0.15 : 1));
    const prog = r.weighted(pool, weights);
    this.lastProg[state] = [prog, ...recent].slice(0, 2);

    let section = CALM_SECTIONS[1];
    if (state === 'calm') {
      if (--this.calmSectionLeft <= 0) {
        const opts = [0, 1, 2, 3, 4].filter((i) => i !== this.calmSection);
        this.calmSection = r.pick(opts);
        this.calmSectionLeft = r.int(2, 3);
      }
      section = CALM_SECTIONS[this.calmSection];
    }
    const base = state === 'menu' ? this.menuMotif : r.pick(this.motifs);
    const ph: Phrase = {
      state,
      prog,
      bars: state === 'menu' ? 8 : state === 'calm' && r.chance(0.35) ? 8 : 4,
      bar: 0,
      melodic: state === 'calm' ? section.lead : state === 'menu' ? true : state === 'combat' ? this.phraseCount % 2 === 0 || r.chance(0.25) : r.chance(0.5),
      motif: this.vary(base, r.int(0, 4)),
      arpShape: r.int(0, 3),
      arpInst: r.pick(this.cfg.arp),
      leadInst: state === 'combat' ? r.weighted(['brass', this.cfg.lead[0]] as InstId[], [3, 1]) : r.pick(this.cfg.lead),
      bassPat: r.int(0, BASS_PATS.length - 1),
      kick: r.int(0, KICKS.length - 1),
      hat16: r.chance(this.density),
      breakdown: state === 'combat' && this.phraseCount % 5 === 4 && r.chance(0.7),
      section,
      ost: r.pick([[0, 1, 2, 1], [0, 2, 1, 2], [0, 1, 0, 2], [0, 0, 1, 2]]),
    };
    this.phrases[state] = ph;
    return ph;
  }

  // ------------------------------------------------------------------ bars
  /** Write the next bar of a looping state. `fill` adds a transition fill / riser. */
  bar(state: LoopState, fill = false): BarEvents {
    let ph = this.phrases[state];
    if (!ph || ph.bar >= ph.bars) ph = this.newPhrase(state);
    const b = ph.bar++;
    this.barsWritten++;
    const deg = ph.prog[Math.floor((b * ph.prog.length) / ph.bars)];
    const ev: BarEvents = { notes: [], pads: [] };
    if (state === 'calm') this.calm(ev, ph, b, deg);
    else if (state === 'tension') this.tension(ev, ph, b, deg);
    else if (state === 'combat') this.combat(ev, ph, b, deg);
    else this.menu(ev, ph, b, deg);
    if (fill) this.fill(ev, state);
    return ev;
  }

  private pad(state: string, semis: number[], lo: number, hi: number): number[] {
    const v = voiceChord(this.key, semis, lo, hi, this.prevPad[state] ?? []);
    this.prevPad[state] = v;
    return v;
  }

  private arp(ev: BarEvents, ph: Phrase, semis: number[], lo: number, sixteenths: boolean, vel: number, prob: number): void {
    const tones: number[] = [];
    for (const s of semis) {
      const m = into(midiOf(this.key, 0, 4) + s, lo);
      tones.push(m, m + 12);
    }
    tones.sort((a, b) => a - b);
    const n = tones.length;
    const stepLen = sixteenths ? 1 : 2;
    const count = 16 / stepLen;
    for (let i = 0; i < count; i++) {
      if (i > 0 && !this.r.chance(prob)) continue;
      let idx: number;
      switch (ph.arpShape) {
        case 0:
          idx = i % n;
          break;
        case 1: {
          const p = i % (2 * n - 2);
          idx = p < n ? p : 2 * n - 2 - p;
          break;
        }
        case 2:
          idx = [0, 2, 1, 3, 2, 4, 3, 1][i % 8] % n;
          break;
        default:
          idx = i % 2 === 0 ? 0 : (1 + ((i >> 1) % (n - 1))) % n;
      }
      const accent = i % (sixteenths ? 4 : 2) === 0 ? 1 : 0.75;
      ev.notes.push({ inst: ph.arpInst, midi: tones[idx], step: i * stepLen, len: stepLen * 1.5, vel: vel * accent * this.r.range(0.85, 1.05), ch: 'L' });
    }
  }

  private lead(ev: BarEvents, ph: Phrase, b: number, semis: number[], lo: number, inst: InstId, vel: number): void {
    const half = b % 2;
    for (const n of ph.motif) {
      if (n.s < half * 16 || n.s >= half * 16 + 16) continue;
      const step = n.s - half * 16;
      let midi = midiOf(this.key, n.d, 4);
      while (midi < lo) midi += 12;
      while (midi > lo + 16) midi -= 12;
      if (step % 8 === 0 && !isChordTone(this.key, semis, midi)) {
        const up = midiOf(this.key, n.d + 1, 4) - midiOf(this.key, n.d, 4);
        const down = midiOf(this.key, n.d, 4) - midiOf(this.key, n.d - 1, 4);
        midi = isChordTone(this.key, semis, midi + up) ? midi + up : midi - down;
      }
      ev.notes.push({ inst, midi, step, len: n.l * 0.92, vel: vel * (step % 4 === 0 ? 1 : 0.85), ch: 'R' });
    }
  }

  private bassNote(deg: number): number {
    return into(midiOf(this.key, deg, 2), 33);
  }

  private calm(ev: BarEvents, ph: Phrase, b: number, deg: number): void {
    const r = this.r;
    const sec = ph.section;
    const semis = chordSemis(this.key, deg, 3, r.chance(0.35));
    const cut0 = 650 + 500 * this.density;
    ev.pads.push({ notes: this.pad('calm', semis, 50, 70), step: 0, len: 16, vel: 0.5, tone: this.cfg.pad, cut0, cut1: b % 2 ? cut0 * 0.8 : cut0 * 1.4, attack: 0.9 });
    const root = this.bassNote(deg);
    if (sec.bass) {
      ev.notes.push({ inst: 'bass', midi: root, step: 0, len: 12, vel: 0.42, ch: 'C' });
      if (r.chance(0.5 * this.density)) ev.notes.push({ inst: 'bass', midi: root + r.pick([7, 12]), step: 12, len: 4, vel: 0.3, ch: 'C' });
    }
    if (sec.arp) this.arp(ev, ph, semis, 62, false, 0.34, 0.55 + 0.4 * this.density);
    if (sec.lead && ph.melodic) this.lead(ev, ph, b, semis, 70, ph.leadInst, 0.42);
    else if (sec.bells && r.chance(0.6)) {
      const m = into(midiOf(this.key, 0, 5) + r.pick(semis), 74);
      ev.notes.push({ inst: this.cfg.arp.includes('glass') ? 'glass' : 'bell', midi: m, step: r.pick([0, 4, 8, 10]), vel: 0.26, ch: 'R' });
    }
    if (sec.perc) {
      ev.notes.push({ inst: 'kick', midi: 60, step: 0, vel: 0.32, ch: 'C' });
      if (r.chance(0.5)) ev.notes.push({ inst: 'kick', midi: 60, step: 8, vel: 0.22, ch: 'C' });
      for (let s = 0; s < 16; s += 2) ev.notes.push({ inst: 'shaker', midi: 60, step: s, vel: s % 4 === 2 ? 0.32 : 0.2, ch: 'L' });
    }
    if (b === 0 && this.phraseCount % 3 === 0) ev.notes.push({ inst: 'boom', midi: 60, step: 0, vel: 0.22, ch: 'C' });
  }

  private tension(ev: BarEvents, ph: Phrase, b: number, deg: number): void {
    const r = this.r;
    const semis = chordSemis(this.key, deg, 3);
    const cut0 = 380 + (520 * b) / ph.bars;
    ev.pads.push({ notes: this.pad('tension', semis, 45, 64), step: 0, len: 16, vel: 0.5, tone: 'hollow', cut0, cut1: cut0 + 160, attack: 0.6 });
    const root = this.bassNote(deg);
    pattern('X..x..X.x..x..x.', (s, a) => ev.notes.push({ inst: 'bass', midi: root, step: s, len: 2, vel: a > 0.9 ? 0.55 : 0.3, ch: 'C' }));
    // ostinato on root / fifth / a tension tone
    const lo = 57;
    const tones = [into(midiOf(this.key, deg, 4), lo), into(midiOf(this.key, deg + 4, 4), lo), into(midiOf(this.key, deg + 1, 4), lo)];
    for (let s = 0; s < 16; s++) {
      if (s > 0 && !r.chance(0.55 + 0.4 * this.density)) continue;
      ev.notes.push({ inst: 'pluck', midi: tones[ph.ost[s % 4]], step: s, len: 0.9, vel: s % 4 === 0 ? 0.32 : 0.2, ch: 'L' });
    }
    pattern('x.o.x.o.x.o.x.o.', (s, a) => ev.notes.push({ inst: 'rim', midi: 60, step: s, vel: 0.3 * a, ch: 'R' }));
    pattern('X.....x.....x...', (s, a) => ev.notes.push({ inst: 'tom', midi: 40, step: s, vel: 0.45 * a, ch: 'C' }));
    if (b === 0) ev.notes.push({ inst: 'boom', midi: 60, step: 0, vel: 0.4, ch: 'C' });
    if (ph.melodic && b % 2 === 1) {
      const m = into(midiOf(this.key, deg + r.pick([4, 6, 8]), 5), 72);
      ev.notes.push({ inst: this.cfg.arp.includes('glass') ? 'glass' : 'bell', midi: m, step: 8, vel: 0.24, ch: 'R' });
    }
    if (b === ph.bars - 1) this.riser(ev, 0.35);
  }

  private combat(ev: BarEvents, ph: Phrase, b: number, deg: number): void {
    const r = this.r;
    const semis = chordSemis(this.key, deg, 3);
    ev.pads.push({ notes: this.pad('combat', semis, 52, 72), step: 0, len: 16, vel: 0.32, tone: 'warm', cut0: 1400, cut1: 1900, attack: 0.25 });
    const last = b === ph.bars - 1;
    if (!ph.breakdown) {
      pattern(KICKS[ph.kick], (s, a) => ev.notes.push({ inst: 'kick', midi: 60, step: s, vel: 0.8 * a, ch: 'C' }));
      ev.notes.push({ inst: 'snare', midi: 60, step: 4, vel: 0.7, ch: 'C' }, { inst: 'snare', midi: 60, step: 12, vel: 0.72, ch: 'C' });
      if (this.density > 0.7) {
        if (r.chance(0.5)) ev.notes.push({ inst: 'snare', midi: 60, step: 7, vel: 0.18, ch: 'C' });
        if (r.chance(0.5)) ev.notes.push({ inst: 'snare', midi: 60, step: 14, vel: 0.16, ch: 'C' });
      }
      const hatEnd = last ? 12 : 16;
      for (let s = 0; s < hatEnd; s++) {
        if (s % 2 === 0) ev.notes.push({ inst: 'hat', midi: 60, step: s, vel: s % 4 === 2 ? 0.5 : 0.36, ch: 'R' });
        else if (ph.hat16 && r.chance(0.7)) ev.notes.push({ inst: 'hat', midi: 60, step: s, vel: 0.16, ch: 'R' });
      }
      if (last) {
        [52, 50, 47, 45].forEach((m, i) => ev.notes.push({ inst: 'tom', midi: m, step: 12 + i, vel: 0.5 + i * 0.05, ch: 'C' }));
      }
    } else {
      ev.notes.push({ inst: 'kick', midi: 60, step: 0, vel: 0.7, ch: 'C' }, { inst: 'kick', midi: 60, step: 8, vel: 0.45, ch: 'C' });
      pattern('X.....x.....x...', (s, a) => ev.notes.push({ inst: 'tom', midi: 43, step: s, vel: 0.45 * a, ch: 'C' }));
      if (last) this.riser(ev, 0.4);
    }
    if (b === 0) {
      ev.notes.push({ inst: 'crash', midi: 60, step: 0, vel: 0.45, ch: 'L' });
      ev.notes.push({ inst: 'timp', midi: into(midiOf(this.key, deg, 2), 38), step: 0, vel: 0.45, ch: 'C' });
    }
    // driving bass in 8ths
    const root = this.bassNote(deg);
    const nextDeg = ph.prog[Math.floor((((b + 1) % ph.bars) * ph.prog.length) / ph.bars)];
    const pat = BASS_PATS[ph.bassPat];
    for (let i = 0; i < 8; i++) {
      const c = pat[i];
      if (c === '-') continue;
      let m = c === 'O' ? root + 12 : c === '5' ? root + 7 : root;
      if (last && i === 7) m = this.bassNote(nextDeg) + (r.chance(0.5) ? -1 : 2);
      ev.notes.push({ inst: 'bass', midi: m, step: i * 2, len: 1.6, vel: i % 4 === 0 ? 0.62 : 0.48, ch: 'C' });
    }
    if (ph.melodic) {
      this.lead(ev, ph, b, semis, 62, ph.leadInst, 0.5);
    } else {
      this.arp(ev, ph, semis, 60, true, 0.24, 0.85);
      if (b % 2 === 0) {
        const chord = voiceChord(this.key, semis, 55, 70, []);
        for (const s of r.pick(STABS)) for (const m of chord) ev.notes.push({ inst: 'brass', midi: m, step: s, len: 1.8, vel: 0.34, ch: 'R' });
      }
    }
  }

  private menu(ev: BarEvents, ph: Phrase, b: number, deg: number): void {
    const r = this.r;
    const semis = chordSemis(this.key, deg, b % 4 < 2 ? 3 : 4);
    const root = this.bassNote(deg);
    if (b % 2 === 0) {
      ev.pads.push({ notes: this.pad('menu', semis, 48, 70), step: 0, len: 32, vel: 0.55, tone: 'warm', cut0: 800, cut1: 1500, attack: 1.2 });
      ev.notes.push({ inst: 'bass', midi: root, step: 0, len: 28, vel: 0.45, ch: 'C' });
      ev.notes.push({ inst: 'boom', midi: 60, step: 0, vel: 0.5, ch: 'C' });
      ev.notes.push({ inst: 'tom', midi: 45, step: 10, vel: 0.28, ch: 'C' });
    } else {
      ev.notes.push({ inst: 'boom', midi: 60, step: 8, vel: 0.28, ch: 'C' });
      ev.notes.push({ inst: 'tom', midi: 43, step: 14, vel: 0.22, ch: 'C' });
    }
    if (b === 0) {
      ev.notes.push({ inst: 'timp', midi: into(midiOf(this.key, 0, 2), 38), step: 0, vel: 0.4, ch: 'C' });
      ev.notes.push({ inst: 'crash', midi: 60, step: 0, vel: 0.25, ch: 'L' });
    }
    // ostinato: root, fifth, octave, fifth...
    const base = into(midiOf(this.key, deg, 4), 57);
    const shape = [0, 7, 12, 7, 14, 7, 12, 7];
    for (let i = 0; i < 8; i++) {
      if (i > 0 && !r.chance(0.8)) continue;
      ev.notes.push({ inst: 'pluck', midi: base + shape[i], step: i * 2, len: 2.5, vel: i % 2 === 0 ? 0.28 : 0.2, ch: 'L' });
    }
    if (b >= 4 && ph.melodic) this.lead(ev, ph, b, semis, 62, 'brass', 0.45);
    else if (r.chance(0.5)) {
      const m = into(midiOf(this.key, 0, 5) + r.pick(semis), 72);
      ev.notes.push({ inst: 'bell', midi: m, step: r.pick([4, 8, 12]), vel: 0.22, ch: 'R' });
    }
    if (this.density > 0.65) for (let s = 0; s < 16; s += 2) ev.notes.push({ inst: 'shaker', midi: 60, step: s, vel: 0.16, ch: 'R' });
  }

  /** Reverse cymbal swell that lands exactly on the next downbeat. */
  private riser(ev: BarEvents, vel: number): void {
    ev.notes.push({ inst: 'rev', midi: 60, step: -1, vel, ch: 'W' });
  }

  private fill(ev: BarEvents, state: LoopState): void {
    this.riser(ev, 0.45);
    ev.notes = ev.notes.filter((n) => !(n.step >= 12 && (n.inst === 'hat' || n.inst === 'rim' || n.inst === 'shaker')));
    [52, 50, 47, 45].forEach((m, i) => ev.notes.push({ inst: 'tom', midi: m, step: 12 + i, vel: 0.45 + i * 0.06, ch: 'C' }));
    if (state !== 'menu') for (let s = 8; s < 12; s++) ev.notes.push({ inst: 'snare', midi: 60, step: s, vel: 0.12 + (s - 8) * 0.06, ch: 'C' });
  }

  // ------------------------------------------------------------------ cues
  /** A one-shot victory or defeat cue as a list of bars. */
  cue(kind: 'victory' | 'defeat'): BarEvents[] {
    // Cues are in D so they continue seamlessly from the victory / defeat stingers.
    if (kind === 'victory') {
      const k: Key = { root: 2, mode: MODES.ionian };
      const mel: [number, number, number][][] = [
        [[0, 3, 4], [3, 1, 4], [4, 4, 7], [8, 4, 6], [12, 4, 4]],
        [[0, 6, 5], [6, 2, 3], [8, 8, 4]],
        [[0, 3, 4], [3, 1, 5], [4, 4, 6], [8, 4, 7], [12, 4, 8]],
        [[0, 16, 7]],
      ];
      const degs = [0, 3, 4, 0];
      const bars: BarEvents[] = [];
      let prev: number[] = [];
      degs.forEach((d, bi) => {
        const ev: BarEvents = { notes: [], pads: [] };
        const semis = chordSemis(k, d, 3);
        prev = voiceChord(k, semis, 50, 67, prev);
        const finalBar = bi === 3;
        ev.pads.push({ notes: prev, step: 0, len: finalBar ? 30 : 16, vel: 0.45, tone: 'warm', cut0: 1600, cut1: finalBar ? 900 : 2000, attack: 0.15 });
        for (const m of prev) ev.notes.push({ inst: 'brass', midi: m, step: 0, len: finalBar ? 20 : 12, vel: 0.3, ch: 'W' });
        ev.notes.push({ inst: 'bass', midi: into(midiOf(k, d, 2), 33), step: 0, len: finalBar ? 28 : 15, vel: 0.5, ch: 'C' });
        for (const [s, l, md] of mel[bi]) {
          let m = midiOf(k, md, 4);
          while (m < 62) m += 12;
          while (m > 80) m -= 12;
          ev.notes.push({ inst: 'brass', midi: m, step: s, len: l * 0.92, vel: 0.55, ch: 'R' });
        }
        if (bi === 0 || finalBar) {
          ev.notes.push({ inst: 'crash', midi: 60, step: 0, vel: 0.55, ch: 'L' }, { inst: 'boom', midi: 60, step: 0, vel: 0.7, ch: 'C' });
        }
        ev.notes.push({ inst: 'timp', midi: into(midiOf(k, d, 2), 38), step: 0, vel: 0.5, ch: 'C' });
        if (bi === 0) for (let s = 1; s < 16; s++) ev.notes.push({ inst: 'timp', midi: into(midiOf(k, 0, 2), 38), step: s, vel: 0.08 + s * 0.02, ch: 'C' });
        if (bi === 2) for (let s = 8; s < 16; s++) ev.notes.push({ inst: 'snare', midi: 60, step: s, vel: 0.15 + (s - 8) * 0.07, ch: 'C' });
        if (finalBar) {
          [0, 2, 4, 7, 9, 11].forEach((dd, i) => ev.notes.push({ inst: 'bell', midi: into(midiOf(k, dd, 5), 72) + (i >= 3 ? 12 : 0), step: i * 1.5, vel: 0.3, ch: 'R' }));
        }
        bars.push(ev);
      });
      return bars;
    }
    const k: Key = { root: 2, mode: MODES.aeolian };
    const degs = [0, 5, 3, 0];
    const mel: [number, number, number][][] = [[[0, 8, 4], [8, 8, 3]], [[0, 8, 2], [8, 8, 1]], [[0, 12, 0]], []];
    const bars: BarEvents[] = [];
    let prev: number[] = [];
    degs.forEach((d, bi) => {
      const ev: BarEvents = { notes: [], pads: [] };
      const semis = chordSemis(k, d, 3);
      prev = voiceChord(k, semis, 45, 62, prev);
      const finalBar = bi === 3;
      ev.pads.push({ notes: prev, step: 0, len: finalBar ? 28 : 16, vel: 0.45, tone: 'hollow', cut0: finalBar ? 500 : 700, cut1: finalBar ? 220 : 500, attack: 0.5 });
      ev.notes.push({ inst: 'bass', midi: into(midiOf(k, d, 2), 31), step: 0, len: finalBar ? 26 : 15, vel: 0.45, ch: 'C' });
      for (const [s, l, md] of mel[bi]) ev.notes.push({ inst: 'bell', midi: into(midiOf(k, md, 5), 69), step: s, len: l, vel: 0.3, ch: 'R' });
      if (bi === 0 || finalBar) ev.notes.push({ inst: 'boom', midi: 60, step: 0, vel: finalBar ? 0.45 : 0.65, ch: 'C' });
      ev.notes.push({ inst: 'timp', midi: into(midiOf(k, d, 2), 36), step: 0, vel: 0.4, ch: 'C' });
      if (bi === 2) for (let s = 4; s < 16; s += 1) ev.notes.push({ inst: 'timp', midi: into(midiOf(k, 0, 2), 36), step: s, vel: 0.06 + s * 0.008, ch: 'C' });
      bars.push(ev);
    });
    return bars;
  }
}
