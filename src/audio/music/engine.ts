/**
 * Music scheduler. Bars are written by the Composer one at a time, slightly ahead of the
 * audio clock, into per-state groups. State changes land on bar boundaries: going up in
 * intensity first plays a fill bar, then cuts in on the downbeat; going down crossfades the
 * old state out over a bar while the new one fades in. Victory / defeat play one-shot cues.
 */
import type { ThemeId } from '../../core/config';
import { midiHz } from '../dsp';
import { type BarEvents, type Channel, Composer, type LoopState, type MusicState, type NoteEv, type PadEv, type PadTone } from './composer';
import { type InstId, InstrumentBank } from './instruments';

const GROUP_IDS = ['menu', 'calm', 'tension', 'combat', 'cue'] as const;
type GroupId = (typeof GROUP_IDS)[number];
const RANK: Record<LoopState, number> = { menu: 0, calm: 0, tension: 1, combat: 2 };
const CH: Channel[] = ['C', 'L', 'R', 'W'];
const CH_PAN: Record<Channel, number> = { C: 0, L: -0.35, R: 0.35, W: 0 };
const CH_SEND: Record<Channel, number> = { C: 0.08, L: 0.3, R: 0.32, W: 0.4 };
/** Instrument balance trims on top of each sample's designed level. */
const INST_GAIN: Partial<Record<InstId, number>> = { bass: 0.7, kick: 0.8, boom: 0.8, tom: 0.85, timp: 0.85, crash: 0.8, hat: 0.9, brass: 0.9 };
/** Level of the oscillator pads. */
const PAD_GAIN = 0.1;
/** Per-state level: combat sits under the battle, the menu has nothing to compete with. */
const GROUP_GAIN: Record<GroupId, number> = { menu: 1.4, calm: 1.05, tension: 0.95, combat: 0.7, cue: 1.1 };

interface Group {
  fader: GainNode;
  send: GainNode;
  ch: Record<Channel, GainNode>;
}

export type MusicTarget = LoopState | 'victory' | 'defeat';

export class MusicEngine {
  /** State currently sounding (null when stopped or not started yet). */
  state: MusicState | null = null;
  target: MusicTarget = 'calm';
  barsScheduled = 0;
  private comp: Composer;
  private compTheme: ThemeId | 'menu';
  private insts: InstrumentBank;
  private waves: Partial<Record<PadTone, PeriodicWave>> = {};
  private groups: Record<GroupId, Group>;
  private sources = new Set<AudioScheduledSourceNode>();
  private running = false;
  private nextBar = 0;
  private fillDone = false;
  private seed: number;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
    verb: AudioNode,
    theme: ThemeId | 'menu',
    seed = 1,
  ) {
    this.seed = seed;
    this.compTheme = theme;
    this.comp = new Composer(seed, theme);
    this.insts = new InstrumentBank(ctx);
    const mk = (): Group => {
      const fader = ctx.createGain();
      fader.gain.value = 0;
      fader.connect(out);
      const send = ctx.createGain();
      send.gain.value = 0;
      send.connect(verb);
      const ch = {} as Record<Channel, GainNode>;
      for (const c of CH) {
        const g = ctx.createGain();
        let tail: AudioNode = g;
        if (CH_PAN[c] !== 0 && typeof ctx.createStereoPanner === 'function') {
          const p = ctx.createStereoPanner();
          p.pan.value = CH_PAN[c];
          g.connect(p);
          tail = p;
        }
        tail.connect(fader);
        const s = ctx.createGain();
        s.gain.value = CH_SEND[c];
        g.connect(s);
        s.connect(send);
        ch[c] = g;
      }
      return { fader, send, ch };
    };
    this.groups = { menu: mk(), calm: mk(), tension: mk(), combat: mk(), cue: mk() };
  }

  get ready(): boolean {
    return this.insts.ready;
  }

  get playing(): boolean {
    return this.running;
  }

  /** Key root (pitch class offset) for the soundboard read-out. */
  get keyRoot(): number {
    return this.comp.key.root;
  }

  /** Render instrument samples for up to `ms` milliseconds. */
  prepare(ms = Infinity): boolean {
    return this.insts.prepare(ms);
  }

  /** Switch composition material (menu suite or a battlefield theme). */
  setTheme(theme: ThemeId | 'menu'): void {
    if (theme === this.compTheme) return;
    this.compTheme = theme;
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    this.comp = new Composer(this.seed, theme);
    if (this.running && this.state) {
      // restart the bar grid so the new material starts on a clean downbeat
      this.nextBar = Math.min(this.nextBar, this.ctx.currentTime + 0.25);
    }
  }

  /** Ask for a state. Loop states change on the bar grid; cues start right away. */
  drive(target: MusicTarget, now: number): void {
    const prev = this.target;
    this.target = target;
    if (target === 'victory' || target === 'defeat') {
      if (prev !== target || this.state !== target) this.playCue(target, now + 0.05);
      return;
    }
    if (!this.running) {
      this.running = true;
      this.fillDone = false;
      if (this.state === 'victory' || this.state === 'defeat') this.fadeGroup(this.groups.cue, 0, now, 1.5);
      this.state = null;
      this.nextBar = now + 0.15;
    }
  }

  /** Schedule all bars that start before `until`. */
  schedule(until: number): void {
    if (!this.running || !this.ready) return;
    let guard = 0;
    while (this.nextBar < until && guard++ < 16) {
      const t0 = this.nextBar;
      const tgt = this.target as LoopState;
      let st = this.state as LoopState | null;
      let fill = false;
      if (st !== tgt) {
        if (st && st !== 'menu' && tgt !== 'menu' && RANK[tgt] > RANK[st] && !this.fillDone) {
          fill = true;
          this.fillDone = true;
        } else {
          this.switchTo(st, tgt, t0);
          st = tgt;
          this.fillDone = false;
        }
      }
      const s = st as LoopState;
      const stepDur = 15 / this.comp.bpm(s);
      this.emit(this.comp.bar(s, fill), this.groups[s], t0, stepDur);
      this.nextBar = t0 + 16 * stepDur;
      this.barsScheduled++;
    }
  }

  /** Fade everything out and stop all scheduled notes. */
  stop(at: number, fade = 1.2): void {
    this.running = false;
    this.state = null;
    this.fillDone = false;
    for (const id of GROUP_IDS) this.fadeGroup(this.groups[id], 0, at, fade);
    for (const s of this.sources) {
      try {
        s.stop(at + fade + 0.1);
      } catch {
        /* already stopped */
      }
    }
  }

  // ------------------------------------------------------------------ internals
  private fadeGroup(g: Group, to: number, at: number, time: number): void {
    for (const p of [g.fader.gain, g.send.gain]) {
      try {
        p.cancelScheduledValues(at);
        p.setTargetAtTime(to, at, Math.max(0.005, time / 3));
      } catch {
        p.value = to;
      }
    }
  }

  private switchTo(from: LoopState | null, to: LoopState, t0: number): void {
    this.comp.reset(to);
    const barDur = (16 * 15) / this.comp.bpm(to);
    const up = from !== null && RANK[to] > RANK[from] && from !== 'menu';
    if (from) {
      this.fadeGroup(this.groups[from], 0, t0, from === 'menu' || to === 'menu' ? 2.5 : barDur * 0.9);
      // one more bar of the outgoing state so it crossfades rather than stops dead
      if (!up && from !== 'menu' && to !== 'menu') this.emit(this.comp.bar(from), this.groups[from], t0, 15 / this.comp.bpm(from));
    }
    const g = this.groups[to];
    try {
      g.fader.gain.cancelScheduledValues(t0 - 0.03);
      g.send.gain.cancelScheduledValues(t0 - 0.03);
    } catch {
      /* ignore */
    }
    this.fadeGroup(g, GROUP_GAIN[to], t0 - 0.03, up ? 0.08 : from ? barDur * 0.5 : 0.3);
    this.state = to;
  }

  private playCue(kind: 'victory' | 'defeat', at: number): void {
    this.running = false;
    for (const id of GROUP_IDS) if (id !== 'cue') this.fadeGroup(this.groups[id], 0, at, 0.6);
    const cue = this.groups.cue;
    // let the end-of-match stinger hit first; the cue picks up from it
    const start = at + (kind === 'victory' ? 1.3 : 1.7);
    this.fadeGroup(cue, GROUP_GAIN.cue, start - 0.05, 0.05);
    const stepDur = 15 / this.comp.bpm(kind);
    this.comp.cue(kind).forEach((ev, i) => this.emit(ev, cue, start + i * 16 * stepDur, stepDur));
    this.state = kind;
  }

  private emit(ev: BarEvents, g: Group, t0: number, stepDur: number): void {
    for (const n of ev.notes) this.note(g, n, t0, stepDur);
    for (const p of ev.pads) this.padChord(g, p, t0, stepDur);
  }

  private note(g: Group, n: NoteEv, t0: number, stepDur: number): void {
    const ctx = this.ctx;
    const s = this.insts.sample(n.inst, n.midi);
    const dur = s.buf.duration / s.rate;
    let t = n.inst === 'rev' ? t0 + 16 * stepDur - dur : t0 + n.step * stepDur;
    if (n.inst !== 'rev' && n.step > 0) t += (this.comp.r.next() - 0.5) * 0.008;
    if (t < ctx.currentTime) return;
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = s.rate;
    const gn = ctx.createGain();
    const v = n.vel * (INST_GAIN[n.inst] ?? 1);
    gn.gain.value = v;
    src.connect(gn);
    gn.connect(g.ch[n.ch]);
    let end = t + dur;
    if (n.len !== undefined) {
      const off = t + n.len * stepDur;
      if (off + 0.05 < end) {
        gn.gain.setValueAtTime(v, off);
        gn.gain.setTargetAtTime(0, off, 0.06);
        end = off + 0.4;
      }
    }
    src.start(t);
    src.stop(end);
    this.track(src, [gn]);
  }

  private wave(tone: PadTone): PeriodicWave | null {
    const cached = this.waves[tone];
    if (cached) return cached;
    try {
      const N = 32;
      const real = new Float32Array(N);
      const imag = new Float32Array(N);
      for (let n = 1; n < N; n++) {
        if (tone === 'warm') imag[n] = 1 / Math.pow(n, 1.25);
        else if (tone === 'hollow') imag[n] = n % 2 ? 1 / Math.pow(n, 1.2) : 0.04 / n;
        else imag[n] = [0, 1, 0.35, 0.12, 0.28, 0.05, 0.12, 0.02, 0.07][n] ?? 0;
      }
      const w = this.ctx.createPeriodicWave(real, imag);
      this.waves[tone] = w;
      return w;
    } catch {
      return null;
    }
  }

  private padChord(g: Group, p: PadEv, t0: number, stepDur: number): void {
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, t0 + p.step * stepDur);
    const len = p.len * stepDur;
    const rel = 1.4;
    const wave = this.wave(p.tone);
    const merger = ctx.createChannelMerger(2);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 0.5;
    filt.frequency.setValueAtTime(p.cut0, t);
    filt.frequency.linearRampToValueAtTime(p.cut1, t + len);
    const env = ctx.createGain();
    const peak = (p.vel * PAD_GAIN) / Math.sqrt(p.notes.length);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + p.attack);
    env.gain.setValueAtTime(peak, t + Math.max(p.attack, len));
    env.gain.setTargetAtTime(0, t + Math.max(p.attack, len), rel / 3);
    merger.connect(filt);
    filt.connect(env);
    env.connect(g.ch.W);
    const oscs: OscillatorNode[] = [];
    for (const m of p.notes) {
      for (const side of [0, 1]) {
        const o = ctx.createOscillator();
        if (wave) o.setPeriodicWave(wave);
        else o.type = 'sawtooth';
        o.frequency.value = midiHz(m);
        o.detune.value = (side ? 7 : -7) + (this.comp.r.next() - 0.5) * 4;
        o.connect(merger, 0, side);
        o.start(t);
        o.stop(t + Math.max(p.attack, len) + rel * 2);
        oscs.push(o);
      }
    }
    oscs.forEach((o, i) => this.track(o, i === 0 ? [merger, filt, env] : []));
  }

  private track(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      try {
        src.disconnect();
        for (const n of nodes) n.disconnect();
      } catch {
        /* ignore */
      }
    };
  }
}

export type { MusicState };
