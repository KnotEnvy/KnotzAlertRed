/**
 * Fully procedural audio. Sound effects are synthesised sample-by-sample into buffers
 * (several seeded variations each), played through a mix bus with a shared reverb, a
 * limiter and priority-based voice allocation. The soundtrack is generative and follows a
 * combat-intensity value the game feeds in. Announcer lines use the browser's speech
 * synthesis (optional) and always play a category earcon. No audio assets are downloaded.
 *
 * Public surface used by the rest of the game: ctx, settings, lx/lz/lyaw/lrange, unlock(),
 * applySettings(), play(), say(), startMusic(), stopMusic(), plus setTheme(),
 * setCombat(), endMatch() and setMusicState().
 */
import type { ThemeId } from '../core/config';
import { Ambience } from './ambience';
import { Announcer, categorize, type VoCategory } from './announcer';
import { SoundBank, variantCount } from './bank';
import { clamp, db, Rng } from './dsp';
import { Mixer, TRIM } from './mixer';
import type { LoopState, MusicState } from './music/composer';
import { MusicEngine, type MusicTarget } from './music/engine';
import { SOUNDS } from './sfx';

export type { MusicState };

export interface AudioSettings {
  sfx: number;
  music: number;
  voice: boolean;
}

export interface PlayOptions {
  /** The sound comes from one of the player's own units (wins voice-stealing ties). */
  own?: boolean;
  /** Start time on the audio clock (defaults to now). */
  when?: number;
}

export type MusicMode = 'menu' | 'game';

interface Voice {
  id: string;
  prio: number;
  ui: boolean;
  src: AudioBufferSourceNode;
  out: GainNode;
  start: number;
  end: number;
}

const MAX_SFX_VOICES = 32;
const MAX_UI_VOICES = 8;
const LOOKAHEAD = 1.2;
const TICK_MS = 120;
/** Ambience one-shots per theme with relative weights. */
const AMB_SHOTS: Record<ThemeId, [string, number][]> = {
  verdant: [['amb_bird', 3], ['amb_gust', 1]],
  scorched: [['amb_gust', 1]],
  frost: [['amb_gust', 3], ['amb_creak', 2]],
};

export class AudioManager {
  /** The realtime context (null until unlocked by a user gesture). */
  ctx: AudioContext | null = null;
  settings: AudioSettings = { sfx: 0.7, music: 0.35, voice: true };
  /** Listener position (camera focus) for distance attenuation, filtering and panning. */
  lx = 0;
  lz = 0;
  lyaw = 0;
  lrange = 90;
  /** Counters for the soundboard and the render report. */
  readonly stats = { played: 0, culled: 0, dropped: 0, stolen: 0, peakVoices: 0 };

  private ac: BaseAudioContext | null = null;
  private offline = false;
  private mixer: Mixer | null = null;
  private bank: SoundBank | null = null;
  private music: MusicEngine | null = null;
  private ambience: Ambience | null = null;
  private announcer: Announcer | null = null;
  private voices: Voice[] = [];
  private lastPlay = new Map<string, number>();
  private lastVariant = new Map<string, number>();
  private tickTimer: number | null = null;
  private mode: MusicMode | null = null;
  private forced: MusicState | null = null;
  private ended: 'victory' | 'defeat' | null = null;
  private theme: ThemeId = 'verdant';
  // combat intensity: heard weapon fire near the camera + what the game feeds in
  private heat = 0;
  private heatAt = 0;
  private load = 0;
  private loadAt = 0;
  private feed = 0;
  private threat = 0;
  private smooth = 0;
  private below = 0;
  private lastDirector = 0;
  private loopState: LoopState = 'calm';
  private voiceDuck = false;
  private duckTarget = 1;
  private pendingEarcon: VoCategory | null = null;
  private announcedAt = -1e9;
  private nextAmb = 0;
  /** Private random stream: audio must never consume Math.random, which the simulation uses. */
  private rng = new Rng(1);
  private rnd = (): number => this.rng.next();

  // ------------------------------------------------------------------ setup
  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    this.ctx = ctx;
    this.attach(ctx);
    this.bank?.warm();
    if (this.mode) this.beginMusic();
  }

  /**
   * Build the mix graph on a context. The game calls this through unlock(); the soundboard's
   * offline renderer calls it with an OfflineAudioContext (optionally bypassing the limiter).
   */
  attach(ctx: BaseAudioContext, opts: { bypassLimiter?: boolean } = {}): void {
    this.ac = ctx;
    this.rng = new Rng(Math.floor(Math.random() * 4294967296));
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.mixer = new Mixer(ctx, !!opts.bypassLimiter);
    this.mixer.setSpace(this.theme);
    this.bank = new SoundBank(ctx);
    this.ambience = new Ambience(ctx, this.mixer.amb);
    this.applySettings(true);
  }

  applySettings(instant = false): void {
    const m = this.mixer;
    const ac = this.ac;
    if (!m || !ac) return;
    const t = ac.currentTime;
    const set = (p: AudioParam, v: number) => {
      if (instant || this.offline) p.value = v;
      else Mixer.ramp(p, v, t, 0.04);
    };
    set(m.sfx.gain, this.settings.sfx * TRIM.sfx);
    set(m.ui.gain, this.settings.sfx * TRIM.ui);
    set(m.amb.gain, this.settings.sfx * TRIM.amb);
    set(m.music.gain, this.settings.music * TRIM.music);
    if (!this.settings.voice) this.announcer?.cancel();
  }

  /** Battlefield theme: picks the reverb space, ambience bed and musical colour. */
  setTheme(theme: ThemeId): void {
    this.theme = theme;
    this.mixer?.setSpace(theme);
  }

  // ------------------------------------------------------------------ sound effects
  /**
   * Play a sound effect. With a world position the sound is attenuated, low-passed and made
   * wetter with distance from the camera, and panned left/right.
   */
  play(id: string, x?: number, z?: number, vol = 1, opts: PlayOptions = {}): void {
    const def = SOUNDS[id];
    if (!def) return;
    const ac = this.ac;
    const mx = this.mixer;
    const bank = this.bank;
    if (!ac || !mx || !bank || this.settings.sfx <= 0) return;
    if (!this.offline && (ac as AudioContext).state !== 'running') return;
    const now = ac.currentTime;
    const when = Math.max(now, opts.when ?? now);
    const last = this.lastPlay.get(id);
    if (last !== undefined && when >= last && when - last < (def.gap ?? 0.04)) {
      this.stats.culled++;
      return;
    }

    let gain = vol;
    let pan = 0;
    let dn = 0;
    const positional = def.bus !== 'ui' && x !== undefined && z !== undefined;
    if (positional) {
      const dx = x - this.lx;
      const dz = z - this.lz;
      const d = Math.hypot(dx, dz);
      if (d > this.lrange) {
        this.stats.culled++;
        return;
      }
      dn = d / this.lrange;
      gain *= Math.pow(1 - dn, 1.5);
      const c = Math.cos(this.lyaw);
      const s = Math.sin(this.lyaw);
      pan = clamp((dx * c - dz * s) / 40, -0.85, 0.85);
    }
    if (gain < 0.01) {
      this.stats.culled++;
      return;
    }
    const heard = Math.min(1.5, gain);
    if (def.heat) this.bumpHeat(def.heat * heard, when);
    if (def.duck) this.bumpLoad(def.duck * heard, when);

    // voice allocation: per-id cap, then a pool cap with priority stealing
    const ui = def.bus === 'ui';
    const prio = (def.prio ?? 40) + 30 * Math.min(1, gain) + (opts.own ? 12 : 0);
    this.prune(when);
    let same: Voice | null = null;
    let sameCount = 0;
    for (const v of this.voices) {
      if (v.id !== id) continue;
      sameCount++;
      if (!same || v.start < same.start) same = v;
    }
    if (same && sameCount >= (def.maxInst ?? 4)) {
      if (same.prio > prio + 15) {
        this.stats.dropped++;
        return;
      }
      this.kill(same, when);
    }
    let poolCount = 0;
    let worst: Voice | null = null;
    for (const v of this.voices) {
      if (v.ui !== ui) continue;
      poolCount++;
      if (!worst || v.prio < worst.prio || (v.prio === worst.prio && v.start < worst.start)) worst = v;
    }
    if (worst && poolCount >= (ui ? MAX_UI_VOICES : MAX_SFX_VOICES)) {
      if (worst.prio >= prio) {
        this.stats.dropped++;
        return;
      }
      this.kill(worst, when);
      this.stats.stolen++;
    }
    this.lastPlay.set(id, when);

    const nv = variantCount(id);
    let v = Math.floor(this.rnd() * nv);
    if (nv > 1 && v === this.lastVariant.get(id)) v = (v + 1) % nv;
    this.lastVariant.set(id, v);
    const buf = bank.get(id, v);
    if (!buf) return;

    const src = ac.createBufferSource();
    src.buffer = buf;
    const rate = 1 + (this.rnd() * 2 - 1) * (def.pitchVar ?? 0.02);
    src.playbackRate.value = rate;
    const out = ac.createGain();
    out.gain.value = gain * db((this.rnd() * 2 - 1) * (ui ? 0.3 : 1));
    const nodes: AudioNode[] = [src, out];
    let head: AudioNode = src;
    if (positional && dn > 0.06) {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.5;
      lp.frequency.value = 18000 * Math.pow(900 / 18000, Math.pow(dn, 0.8)) * (0.9 + 0.2 * this.rnd());
      head.connect(lp);
      head = lp;
      nodes.push(lp);
    }
    head.connect(out);
    const bus = ui ? mx.ui : def.bus === 'amb' ? mx.amb : mx.sfx;
    if (!ui && Math.abs(pan) > 0.02 && typeof ac.createStereoPanner === 'function') {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      p.connect(bus);
      nodes.push(p);
    } else {
      out.connect(bus);
    }
    const send = (def.verb ?? 0) + (positional ? dn * 0.35 : 0);
    if (!ui && send > 0.01) {
      const sg = ac.createGain();
      sg.gain.value = send;
      out.connect(sg);
      sg.connect(mx.sfxVerbIn);
      nodes.push(sg);
    }
    const start = when + (def.delayVar ? this.rnd() * def.delayVar : 0);
    const voice: Voice = { id, prio, ui, src, out, start, end: start + buf.duration / rate };
    src.onended = () => {
      this.remove(voice);
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    };
    src.start(start);
    this.voices.push(voice);
    // an event sound that was actually heard makes the announcer earcon redundant
    if (def.announces) this.announcedAt = performance.now();
    this.stats.played++;
    this.stats.peakVoices = Math.max(this.stats.peakVoices, this.voices.length);
    if ((def.duck ?? 0) >= 0.25) this.updateDuck(when);
  }

  /** The master limiter (for the audio lab's stress test). */
  get limiterNode(): DynamicsCompressorNode | null {
    return this.mixer?.limiter ?? null;
  }

  /** Currently sounding voices (for the soundboard meter). */
  get activeVoices(): number {
    if (this.ac) this.prune(this.ac.currentTime);
    return this.voices.length;
  }

  private prune(t: number): void {
    if (this.voices.length && this.voices.some((v) => v.end <= t)) this.voices = this.voices.filter((v) => v.end > t);
  }

  private remove(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  private kill(v: Voice, when: number): void {
    try {
      v.out.gain.cancelScheduledValues(when);
      v.out.gain.setTargetAtTime(0, when, 0.01);
      v.src.stop(when + 0.06);
    } catch {
      /* already stopped */
    }
    this.remove(v);
  }

  // ------------------------------------------------------------------ announcer
  /** Announcer line: a category earcon always, speech when the voice setting is on. */
  say(line: string): void {
    const cat = categorize(line);
    this.queueEarcon(cat);
    if (!this.settings.voice || this.offline) return;
    this.announcer ??= new Announcer((on) => this.setVoiceDuck(on));
    this.announcer.speak(line, cat, 0.45 + this.settings.sfx * 0.6);
  }

  /** Name of the speech voice in use ('' if none / not yet chosen). */
  get voiceName(): string {
    this.announcer ??= new Announcer((on) => this.setVoiceDuck(on));
    return this.announcer.voiceName;
  }

  private queueEarcon(cat: VoCategory): void {
    const order: VoCategory[] = ['info', 'good', 'bad', 'alert'];
    const first = this.pendingEarcon === null;
    if (first || order.indexOf(cat) > order.indexOf(this.pendingEarcon!)) this.pendingEarcon = cat;
    if (!first) return;
    // Wait until the end of the current task: if the event also played its own
    // announcing sound (construction chime, alert klaxon...), skip the earcon.
    queueMicrotask(() => {
      const c = this.pendingEarcon;
      this.pendingEarcon = null;
      if (c && performance.now() - this.announcedAt > 40) this.play(`vo_${c}`);
    });
  }

  private setVoiceDuck(on: boolean): void {
    this.voiceDuck = on;
    if (this.ac) this.updateDuck(this.ac.currentTime);
  }

  // ------------------------------------------------------------------ combat intensity
  private heatNow(t: number): number {
    return this.heat * Math.exp(-Math.max(0, t - this.heatAt) / 4);
  }
  private bumpHeat(x: number, t: number): void {
    const at = Math.max(t, this.heatAt);
    this.heat = this.heatNow(at) + x;
    this.heatAt = at;
  }
  private loadNow(t: number): number {
    return this.load * Math.exp(-Math.max(0, t - this.loadAt) / 0.35);
  }
  private bumpLoad(x: number, t: number): void {
    const at = Math.max(t, this.loadAt);
    this.load = this.loadNow(at) + x;
    this.loadAt = at;
  }

  /**
   * Combat intensity from the game (0..1, e.g. from recent damage) and the visible enemy
   * threat (0..1). Combined with weapon fire heard near the camera to drive the music.
   */
  setCombat(intensity: number, threat = 0): void {
    this.feed = clamp(intensity, 0, 1);
    this.threat = clamp(threat, 0, 1);
  }

  /** Raw (unsmoothed) combat intensity right now. */
  private rawIntensity(t: number): number {
    return Math.max(this.feed, 1 - Math.exp(-this.heatNow(t) / 3));
  }

  /** Smoothed intensity (what the music director sees). */
  get intensity(): number {
    return this.smooth;
  }

  /** Smooth the intensity and walk calm → tension → combat with hysteresis. */
  private director(now: number): void {
    const dt = clamp(now - this.lastDirector, 0, 1);
    this.lastDirector = now;
    const raw = this.rawIntensity(now);
    const k = raw > this.smooth ? 1 - Math.exp(-dt / 1.5) : 1 - Math.exp(-dt / 7);
    this.smooth += (raw - this.smooth) * k;
    const s = this.smooth;
    let st = this.loopState;
    if (st === 'calm' || st === 'menu') {
      if (s > 0.5) st = 'combat';
      else if (s > 0.2 || this.threat > 0.35) st = 'tension';
    } else if (st === 'tension') {
      if (s > 0.5) st = 'combat';
      else if (s < 0.1 && this.threat < 0.2) {
        this.below += dt;
        if (this.below > 12) st = 'calm';
      } else this.below = 0;
    } else if (s < 0.3) {
      this.below += dt;
      if (this.below > 8) st = 'tension';
    } else this.below = 0;
    if (st !== this.loopState) {
      this.loopState = st;
      this.below = 0;
    }
  }

  private musicTarget(): MusicTarget {
    if (this.forced) return this.forced;
    if (this.mode === 'menu') return 'menu';
    return this.ended ?? this.loopState;
  }

  // ------------------------------------------------------------------ music
  /** Start (or switch) the soundtrack: 'menu' for the main menu, 'game' for a match. */
  startMusic(mode: MusicMode = 'game'): void {
    this.mode = mode;
    if (mode === 'game') {
      this.ended = null;
      this.loopState = 'calm';
      this.smooth = 0;
      this.heat = 0;
      this.feed = 0;
      this.threat = 0;
    }
    if (this.ac && !this.offline) this.beginMusic();
  }

  /** Fade out music and ambience and stop all timers (called when a match is disposed). */
  stopMusic(): void {
    this.mode = null;
    this.ended = null;
    const ac = this.ac;
    if (ac) {
      this.music?.stop(ac.currentTime, 1);
      this.ambience?.stop(ac.currentTime);
    }
    this.stopTick();
  }

  /** Force a music state (soundboard), or null to follow the game again. */
  setMusicState(state: MusicState | null): void {
    this.forced = state;
    if (state === 'victory' || state === 'defeat') this.play(state);
    if (state && this.ac && !this.offline) {
      if (!this.mode) this.mode = state === 'menu' ? 'menu' : 'game';
      this.beginMusic();
    }
  }

  /** End of match: stinger, then the victory / defeat music cue. */
  endMatch(result: 'victory' | 'defeat'): void {
    this.ended = result;
    this.play(result);
    if (this.ac) this.ambience?.stop(this.ac.currentTime);
    if (this.ac && this.music && !this.offline) this.music.drive(result, this.ac.currentTime);
  }

  /** Read-out for the soundboard. */
  info(): { state: string; target: string; intensity: number; raw: number; voices: number; ctx: string; bars: number; duck: number } {
    const t = this.ac?.currentTime ?? 0;
    return {
      state: this.music?.state ?? 'off',
      target: this.mode ? String(this.musicTarget()) : 'off',
      intensity: this.smooth,
      raw: this.rawIntensity(t),
      voices: this.activeVoices,
      ctx: this.ctx?.state ?? 'locked',
      bars: this.music?.barsScheduled ?? 0,
      duck: this.duckTarget,
    };
  }

  private ensureEngine(): MusicEngine | null {
    if (!this.ac || !this.mixer) return null;
    this.music ??= new MusicEngine(this.ac, this.mixer.musicIn, this.mixer.musicVerbIn, this.mode === 'menu' ? 'menu' : this.theme, Math.floor(this.rnd() * 1e9));
    return this.music;
  }

  private beginMusic(): void {
    const ac = this.ac;
    const eng = this.ensureEngine();
    if (!ac || !eng) return;
    const target = this.musicTarget();
    eng.setTheme(target === 'menu' ? 'menu' : this.theme);
    if (this.mode === 'game' && target !== 'menu') this.ambience?.start(this.theme, ac.currentTime + 0.1, this.rnd());
    else this.ambience?.stop(ac.currentTime);
    this.nextAmb = ac.currentTime + 4 + this.rnd() * 6;
    this.startTick();
  }

  private startTick(): void {
    if (this.tickTimer !== null || this.offline) return;
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private stopTick(): void {
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private tick(): void {
    const ac = this.ac;
    if (!ac || (ac as AudioContext).state !== 'running') return;
    const now = ac.currentTime;
    this.director(now);
    const eng = this.music;
    if (eng && this.mode) {
      if (!eng.ready) {
        eng.prepare(8);
      } else {
        eng.drive(this.musicTarget(), now);
        if (this.settings.music > 0) eng.schedule(now + LOOKAHEAD);
      }
    }
    if (this.mode === 'game' && !this.ended && now >= this.nextAmb) {
      this.nextAmb = now + 6 + this.rnd() * 12;
      const shots = AMB_SHOTS[this.theme];
      let r = this.rnd() * shots.reduce((a, s) => a + s[1], 0);
      const pick = shots.find((s) => (r -= s[1]) <= 0) ?? shots[0];
      const a = this.rnd() * Math.PI * 2;
      const d = this.lrange * (0.25 + this.rnd() * 0.4);
      this.play(pick[0], this.lx + Math.cos(a) * d, this.lz + Math.sin(a) * d, 0.8);
    }
    this.updateDuck(now);
  }

  /** Sidechain-style duck: big nearby blasts and announcer lines push the music down. */
  private updateDuck(t: number): void {
    const mx = this.mixer;
    if (!mx) return;
    const target = (1 - Math.min(0.5, this.loadNow(t) * 0.35)) * (1 - 0.2 * this.rawIntensity(t)) * (this.voiceDuck ? 0.55 : 1);
    const tau = target < this.duckTarget ? 0.04 : 0.6;
    if (Math.abs(target - this.duckTarget) < 0.01) return;
    this.duckTarget = target;
    try {
      mx.musicDuck.gain.setTargetAtTime(target, t, tau);
    } catch {
      mx.musicDuck.gain.value = target;
    }
  }

  // ------------------------------------------------------------------ offline rendering (audio lab)
  /** Schedule music on an attached offline context: `stateAt(t)` gives the state over time. */
  renderMusicOffline(seconds: number, stateAt: (t: number) => MusicState, theme: ThemeId | 'menu'): void {
    const ac = this.ac;
    if (!ac || !this.mixer) return;
    this.music = new MusicEngine(ac, this.mixer.musicIn, this.mixer.musicVerbIn, theme, 777);
    this.music.prepare();
    for (let t = 0; t < seconds; t += 0.25) {
      this.music.drive(stateAt(t), t);
      this.music.schedule(Math.min(seconds, t + 0.5));
    }
  }

  /** Start the ambience bed on an attached offline context. */
  renderAmbienceOffline(theme: ThemeId): void {
    this.ambience?.start(theme, 0, this.rnd());
  }
}
