/**
 * Fully procedural audio: every sound effect is synthesised with the Web Audio API, the
 * soundtrack is a generative ambient loop and announcer lines use the browser's speech
 * synthesis when available. No audio assets are downloaded.
 */
export interface AudioSettings {
  sfx: number;
  music: number;
  voice: boolean;
}

type Recipe = (a: AudioManager, t: number, out: AudioNode) => void;

export class AudioManager {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private voices = 0;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private lastVoice = 0;
  settings: AudioSettings = { sfx: 0.7, music: 0.35, voice: true };
  /** Listener position (camera focus) for distance attenuation and panning. */
  lx = 0;
  lz = 0;
  lyaw = 0;
  lrange = 90;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.applySettings();
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  applySettings(): void {
    if (this.sfxBus) this.sfxBus.gain.value = this.settings.sfx;
    if (this.musicBus) this.musicBus.gain.value = this.settings.music * 0.5;
  }

  // ------------------------------------------------------------------ building blocks
  tone(out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(out: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, q = 0.8): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(Math.max(30, f0), t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /**
   * Play a synthesised effect. With a world position the sound is attenuated by distance
   * from the camera and panned left/right.
   */
  play(id: string, x?: number, z?: number, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running' || this.settings.sfx <= 0) return;
    const recipe = RECIPES[id];
    if (!recipe) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[id] ?? 0.05;
    if (now - (this.last[id] ?? -1) < gap) return;
    if (this.voices > 28) return;
    this.last[id] = now;

    let gain = vol;
    let pan = 0;
    if (x !== undefined && z !== undefined) {
      const dx = x - this.lx;
      const dz = z - this.lz;
      const d = Math.hypot(dx, dz);
      if (d > this.lrange) return;
      gain *= Math.pow(1 - d / this.lrange, 1.6);
      const c = Math.cos(this.lyaw);
      const s = Math.sin(this.lyaw);
      pan = Math.max(-0.8, Math.min(0.8, (dx * c - dz * s) / 45));
    }
    if (gain < 0.015) return;
    const g = ctx.createGain();
    g.gain.value = gain;
    let out: AudioNode = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfxBus);
    } else {
      g.connect(this.sfxBus);
    }
    out = g;
    this.voices++;
    window.setTimeout(() => {
      this.voices--;
      g.disconnect();
    }, 2600);
    recipe(this, now, out);
  }

  // ------------------------------------------------------------------ announcer
  say(line: string): void {
    if (!this.settings.voice || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (now - this.lastVoice < 1800) return;
    this.lastVoice = now;
    try {
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 1.05;
      u.pitch = 0.9;
      u.volume = Math.min(1, this.settings.sfx * 0.9);
      const voices = window.speechSynthesis.getVoices();
      const pick = voices.find((v) => /en[-_](US|GB)/i.test(v.lang) && /female|zira|samantha|aria|jenny|google us/i.test(v.name)) ?? voices.find((v) => /^en/i.test(v.lang));
      if (pick) u.voice = pick;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* speech is optional */
    }
  }

  // ------------------------------------------------------------------ music
  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.musicStep = 0;
    const tick = () => this.scheduleBar();
    tick();
    this.musicTimer = window.setInterval(tick, 4000);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** One 4-second bar: a slow minor pad, a pulsing bass and sparse high plucks. */
  private scheduleBar(): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus || ctx.state !== 'running' || this.settings.music <= 0) return;
    const t = ctx.currentTime + 0.1;
    const prog = [
      [110.0, 130.81, 164.81], // Am
      [87.31, 130.81, 174.61], // F
      [98.0, 146.83, 196.0], // G(sus)
      [82.41, 123.47, 164.81], // Em
    ];
    const chord = prog[this.musicStep % prog.length];
    this.musicStep++;
    for (const f of chord) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(260, t);
        filt.frequency.linearRampToValueAtTime(720, t + 2);
        filt.frequency.linearRampToValueAtTime(260, t + 4.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 1.2);
        g.gain.linearRampToValueAtTime(0.0001, t + 4.6);
        o.connect(filt);
        filt.connect(g);
        g.connect(bus);
        o.start(t);
        o.stop(t + 4.8);
      }
    }
    for (let i = 0; i < 8; i++) {
      const bt = t + i * 0.5;
      this.tone(bus, bt, 'triangle', chord[0] / 2, chord[0] / 2, 0.32, i % 4 === 0 ? 0.2 : 0.11, 0.01);
      if (i % 2 === 1) this.burst(bus, bt, 0.05, 0.035, 'highpass', 7000, 7000);
    }
    const scale = [440, 523.25, 587.33, 659.25, 783.99];
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.55) {
        const f = scale[Math.floor(Math.random() * scale.length)];
        this.tone(bus, t + Math.floor(Math.random() * 8) * 0.5, 'sine', f, f, 0.9, 0.035, 0.02);
      }
    }
  }
}

const MIN_GAP: Record<string, number> = {
  rifle: 0.07, mg: 0.06, cannon: 0.08, cannon_heavy: 0.1, rocket: 0.09, thump: 0.1, artillery: 0.15, arc: 0.1,
  explosion_s: 0.07, explosion_m: 0.09, explosion_l: 0.12, death: 0.1, sniper: 0.1, cash: 0.25,
};

const RECIPES: Record<string, Recipe> = {
  rifle: (a, t, o) => {
    a.burst(o, t, 0.07, 0.3, 'bandpass', 2400, 900, 1.2);
    a.tone(o, t, 'square', 320, 110, 0.05, 0.1);
  },
  mg: (a, t, o) => {
    a.burst(o, t, 0.05, 0.3, 'bandpass', 1900, 700, 1.4);
    a.tone(o, t, 'square', 210, 90, 0.045, 0.14);
  },
  sniper: (a, t, o) => {
    a.burst(o, t, 0.28, 0.5, 'bandpass', 3200, 500, 0.8);
    a.tone(o, t, 'sawtooth', 500, 70, 0.2, 0.25);
  },
  sniper_big: (a, t, o) => {
    a.burst(o, t, 0.5, 0.7, 'bandpass', 3600, 300, 0.7);
    a.tone(o, t, 'sawtooth', 700, 50, 0.4, 0.4);
  },
  cannon: (a, t, o) => {
    a.tone(o, t, 'sine', 170, 42, 0.26, 0.75);
    a.burst(o, t, 0.2, 0.42, 'lowpass', 2600, 300);
  },
  cannon_heavy: (a, t, o) => {
    a.tone(o, t, 'sine', 130, 30, 0.42, 0.95);
    a.burst(o, t, 0.34, 0.55, 'lowpass', 2200, 180);
  },
  rocket: (a, t, o) => {
    a.burst(o, t, 0.5, 0.26, 'bandpass', 500, 2600, 0.9);
    a.tone(o, t, 'sawtooth', 160, 420, 0.3, 0.07);
  },
  thump: (a, t, o) => {
    a.tone(o, t, 'sine', 240, 70, 0.14, 0.5);
    a.burst(o, t, 0.08, 0.18, 'lowpass', 1400, 400);
  },
  artillery: (a, t, o) => {
    a.tone(o, t, 'sine', 110, 26, 0.6, 1.0);
    a.burst(o, t, 0.5, 0.6, 'lowpass', 1800, 120);
  },
  arc: (a, t, o) => {
    a.tone(o, t, 'sawtooth', 1500, 180, 0.2, 0.2);
    a.tone(o, t + 0.02, 'square', 2400, 320, 0.14, 0.09);
    a.burst(o, t, 0.2, 0.22, 'highpass', 2800, 5200);
  },
  arc_big: (a, t, o) => {
    a.tone(o, t, 'sawtooth', 1900, 90, 0.55, 0.32);
    a.tone(o, t + 0.05, 'square', 900, 60, 0.5, 0.16);
    a.burst(o, t, 0.6, 0.4, 'highpass', 1800, 6500);
  },
  explosion_s: (a, t, o) => {
    a.burst(o, t, 0.3, 0.55, 'lowpass', 1800, 160);
    a.tone(o, t, 'sine', 120, 38, 0.24, 0.5);
  },
  explosion_m: (a, t, o) => {
    a.burst(o, t, 0.6, 0.8, 'lowpass', 1500, 90);
    a.tone(o, t, 'sine', 95, 28, 0.45, 0.8);
  },
  explosion_l: (a, t, o) => {
    a.burst(o, t, 1.2, 1.0, 'lowpass', 1200, 55);
    a.tone(o, t, 'sine', 75, 22, 0.9, 1.0);
    a.burst(o, t + 0.05, 0.4, 0.3, 'bandpass', 2600, 700);
  },
  death: (a, t, o) => {
    a.burst(o, t, 0.16, 0.25, 'bandpass', 900, 300);
    a.tone(o, t, 'triangle', 300, 110, 0.16, 0.12);
  },
  lance_charge: (a, t, o) => {
    a.tone(o, t, 'sawtooth', 70, 900, 2.5, 0.22, 1.2);
    a.tone(o, t, 'sine', 140, 1800, 2.5, 0.12, 1.5);
  },
  lance: (a, t, o) => {
    a.burst(o, t, 1.8, 1.0, 'lowpass', 4000, 60);
    a.tone(o, t, 'sine', 160, 20, 1.4, 1.0);
    a.tone(o, t, 'sawtooth', 2200, 100, 0.8, 0.3);
  },
  emp: (a, t, o) => {
    a.tone(o, t, 'sine', 1200, 60, 0.7, 0.4);
    a.burst(o, t, 0.5, 0.25, 'bandpass', 4000, 300, 3);
  },
  blink: (a, t, o) => {
    a.tone(o, t, 'sine', 300, 2400, 0.16, 0.3);
    a.tone(o, t + 0.12, 'sine', 2400, 500, 0.2, 0.22);
  },
  shield: (a, t, o) => {
    a.tone(o, t, 'sine', 330, 660, 0.5, 0.3, 0.1);
    a.tone(o, t + 0.1, 'sine', 495, 990, 0.5, 0.2, 0.1);
  },
  rally: (a, t, o) => {
    for (const [i, f] of [392, 523.25, 659.25].entries()) a.tone(o, t + i * 0.09, 'sawtooth', f, f, 0.32, 0.16, 0.01);
  },
  mark: (a, t, o) => {
    a.tone(o, t, 'square', 880, 440, 0.3, 0.14);
    a.tone(o, t + 0.15, 'square', 660, 330, 0.35, 0.12);
  },
  scan: (a, t, o) => {
    a.tone(o, t, 'sine', 600, 1800, 0.5, 0.2, 0.05);
    a.tone(o, t + 0.25, 'sine', 900, 2400, 0.5, 0.12, 0.05);
  },
  place: (a, t, o) => {
    a.tone(o, t, 'sine', 150, 55, 0.22, 0.6);
    a.burst(o, t, 0.2, 0.3, 'lowpass', 900, 200);
  },
  sell: (a, t, o) => {
    a.tone(o, t, 'triangle', 660, 330, 0.18, 0.2);
    a.tone(o, t + 0.1, 'triangle', 880, 990, 0.2, 0.2);
  },
  cash: (a, t, o) => {
    a.tone(o, t, 'sine', 1320, 1320, 0.09, 0.14);
    a.tone(o, t + 0.07, 'sine', 1760, 1760, 0.16, 0.14);
  },
  ready: (a, t, o) => {
    for (const [i, f] of [523.25, 659.25, 783.99].entries()) a.tone(o, t + i * 0.08, 'triangle', f, f, 0.22, 0.2, 0.01);
  },
  unit_ready: (a, t, o) => {
    a.tone(o, t, 'triangle', 660, 660, 0.1, 0.16);
    a.tone(o, t + 0.1, 'triangle', 880, 880, 0.16, 0.16);
  },
  promote: (a, t, o) => {
    for (const [i, f] of [659.25, 880, 1108.7].entries()) a.tone(o, t + i * 0.06, 'sine', f, f, 0.2, 0.14, 0.01);
  },
  levelup: (a, t, o) => {
    for (const [i, f] of [392, 523.25, 659.25, 783.99, 1046.5].entries()) a.tone(o, t + i * 0.07, 'triangle', f, f, 0.4, 0.2, 0.01);
  },
  capture: (a, t, o) => {
    for (const [i, f] of [440, 554.37, 659.25, 880].entries()) a.tone(o, t + i * 0.1, 'square', f, f, 0.25, 0.1, 0.01);
  },
  alert: (a, t, o) => {
    for (let i = 0; i < 3; i++) a.tone(o, t + i * 0.22, 'square', 740, 520, 0.18, 0.13);
  },
  powerdown: (a, t, o) => {
    a.tone(o, t, 'sawtooth', 400, 50, 0.9, 0.22);
  },
  click: (a, t, o) => {
    a.tone(o, t, 'square', 900, 700, 0.04, 0.09);
  },
  error: (a, t, o) => {
    a.tone(o, t, 'square', 200, 150, 0.14, 0.14);
  },
  select: (a, t, o) => {
    a.tone(o, t, 'sine', 780, 940, 0.06, 0.09);
  },
  ack: (a, t, o) => {
    a.tone(o, t, 'sine', 520, 640, 0.06, 0.1);
    a.tone(o, t + 0.05, 'sine', 700, 760, 0.06, 0.08);
  },
  ack_attack: (a, t, o) => {
    a.tone(o, t, 'square', 420, 330, 0.07, 0.08);
    a.tone(o, t + 0.06, 'square', 330, 260, 0.08, 0.08);
  },
};
