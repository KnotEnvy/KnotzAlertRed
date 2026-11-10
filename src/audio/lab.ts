/**
 * Offline renderer used by `npm run audio:render` (through the soundboard page). Every item
 * is rendered with an OfflineAudioContext through the same AudioManager, mixer, limiter and
 * reverb the game uses, at the default volume settings.
 */
import type { ThemeId } from '../core/config';
import { analyze, type Metrics } from './analysis';
import { AudioManager } from './audio';
import { RENDER_MS } from './bank';
import { Rng } from './dsp';
import type { MusicState } from './music/composer';
import { SOUND_GROUPS, SOUNDS } from './sfx';

export const SR = 48000;

export interface RenderResult {
  name: string;
  kind: 'sound' | 'music' | 'ambience' | 'stress';
  group: string;
  /** Base64 16-bit stereo WAV. */
  wav: string;
  metrics: Metrics;
  /** Peak (dBFS) of the same render with the master limiter bypassed. */
  rawPeakDb: number;
  extra: Record<string, number | string>;
}

type Setup = (am: AudioManager, ctx: OfflineAudioContext) => void;

/** Run fn with Math.random replaced by a seeded generator (so two renders match). */
function seeded<T>(seed: number, fn: () => T): T {
  const r = new Rng(seed);
  const orig = Math.random;
  Math.random = () => r.next();
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

async function run(seconds: number, setup: Setup, bypass: boolean, seed: number, probe?: (am: AudioManager, ctx: OfflineAudioContext) => void): Promise<{ chans: Float32Array[]; am: AudioManager }> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const am = new AudioManager();
  am.settings = { sfx: 0.7, music: 0.35, voice: false };
  seeded(seed, () => {
    am.attach(ctx, { bypassLimiter: bypass });
    setup(am, ctx);
  });
  probe?.(am, ctx);
  const buf = await ctx.startRendering();
  return { chans: [buf.getChannelData(0), buf.getChannelData(1)], am };
}

function peakDb(chans: Float32Array[]): number {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p > 0 ? 20 * Math.log10(p) : -Infinity;
}

export function wavBase64(chans: Float32Array[], sr: number): string {
  const n = chans[0].length;
  const ch = chans.length;
  const bytes = new Uint8Array(44 + n * ch * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i] || 0));
      v.setInt16(o, Math.round(s * 32767), true);
      o += 2;
    }
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function item(name: string, kind: RenderResult['kind'], group: string, seconds: number, setup: Setup, extra: Record<string, number | string> = {}): Promise<RenderResult> {
  const seed = name.length * 7919 + name.charCodeAt(0);
  const out = await run(seconds, setup, false, seed);
  const raw = await run(seconds, setup, true, seed);
  return { name, kind, group, wav: wavBase64(out.chans, SR), metrics: analyze(out.chans, SR, { checkTail: kind === 'sound' }), rawPeakDb: peakDb(raw.chans), extra };
}

const groupOf = (id: string) => SOUND_GROUPS.find((g) => g.ids.includes(id))?.name ?? 'Other';

/** Render one sound id, triggered at the camera at volume 1. */
export function renderSound(id: string): Promise<RenderResult> {
  const def = SOUNDS[id];
  // start at 0.3 s: Chrome's compressor fades in over its first few tens of milliseconds
  return item(id, 'sound', groupOf(id), def.dur + 2.9, (am) => am.play(id, undefined, undefined, 1, { when: 0.3 }), {
    designLevel: def.level,
    variants: def.variants ?? (def.bus === 'ui' ? 1 : 2),
    bus: def.bus,
  }).then((r) => ({ ...r, extra: { ...r.extra, renderMs: Math.round((RENDER_MS[id] ?? 0) * 10) / 10 } }));
}

export const MUSIC_ITEMS: { name: string; seconds: number; theme: ThemeId | 'menu'; at: (t: number) => MusicState }[] = [
  { name: 'music_menu', seconds: 45, theme: 'menu', at: () => 'menu' },
  { name: 'music_calm', seconds: 45, theme: 'verdant', at: () => 'calm' },
  { name: 'music_tension', seconds: 40, theme: 'verdant', at: () => 'tension' },
  { name: 'music_combat', seconds: 40, theme: 'verdant', at: () => 'combat' },
  { name: 'music_victory', seconds: 16, theme: 'verdant', at: () => 'victory' },
  { name: 'music_defeat', seconds: 18, theme: 'verdant', at: () => 'defeat' },
  { name: 'music_calm_scorched', seconds: 32, theme: 'scorched', at: () => 'calm' },
  { name: 'music_combat_frost', seconds: 32, theme: 'frost', at: () => 'combat' },
  {
    name: 'music_transitions',
    seconds: 60,
    theme: 'verdant',
    at: (t) => (t < 14 ? 'calm' : t < 28 ? 'tension' : t < 46 ? 'combat' : 'calm'),
  },
];

export function renderMusic(name: string): Promise<RenderResult> {
  const it = MUSIC_ITEMS.find((m) => m.name === name)!;
  return item(it.name, 'music', 'Music', it.seconds, (am) => am.renderMusicOffline(it.seconds, it.at, it.theme), { theme: it.theme });
}

export function renderAmbience(theme: ThemeId): Promise<RenderResult> {
  return item(`ambience_${theme}`, 'ambience', 'Ambience beds', 20, (am) => {
    am.setTheme(theme);
    am.renderAmbienceOffline(theme);
  });
}

const STRESS_POOL = ['rifle', 'rifle', 'rifle', 'mg', 'mg', 'cannon', 'cannon', 'cannon_heavy', 'rocket', 'rocket', 'explosion_s', 'explosion_s', 'explosion_m', 'explosion_m', 'explosion_l', 'artillery', 'sniper', 'arc', 'thump', 'death', 'collapse'];

/**
 * 40 weapon / explosion triggers in 3 s plus combat music, through the full chain. `close`
 * puts every trigger within 8 m of the camera (worst case for the limiter); `flood` fires 200
 * close triggers in 3 s to exercise voice limiting and stealing.
 */
export async function renderStress(mode: 'mixed' | 'close' | 'flood' = 'mixed'): Promise<RenderResult> {
  const seconds = 6.5;
  const close = mode !== 'mixed';
  const r = new Rng(mode === 'mixed' ? 4040 : mode === 'close' ? 4141 : 4242);
  const triggers: { id: string; t: number; x: number; z: number; own: boolean }[] = [];
  for (let i = 0; i < (mode === 'flood' ? 200 : 40); i++) {
    const a = r.range(0, Math.PI * 2);
    const d = close ? r.range(0, 8) : r.chance(0.25) ? r.range(0, 6) : r.range(6, 50);
    // from 0.3 s: Chrome's compressor fades in over its first few tens of milliseconds
    triggers.push({ id: r.pick(STRESS_POOL), t: r.range(0.3, 3.3), x: Math.cos(a) * d, z: Math.sin(a) * d, own: r.chance(0.5) });
  }
  triggers.sort((a, b) => a.t - b.t);
  const setup: Setup = (am) => {
    am.renderMusicOffline(seconds, () => 'combat', 'verdant');
    for (const tr of triggers) am.play(tr.id, tr.x, tr.z, 1, { when: tr.t, own: tr.own });
  };
  let minReduction = 0;
  const seed = 99;
  const out = await run(seconds, setup, false, seed, (am, ctx) => {
    const lim = am.limiterNode;
    for (let t = 0.3; t < seconds - 0.1; t += 0.05) {
      ctx.suspend(t).then(() => {
        if (lim) minReduction = Math.min(minReduction, lim.reduction);
        return ctx.resume();
      }).catch(() => undefined);
    }
  });
  const raw = await run(seconds, setup, true, seed);
  const m = analyze(out.chans, SR, { checkTail: false });
  // share of samples in the soft-clip region of the safety ceiling (above -3 dBFS)
  let soft = 0;
  const thr = Math.pow(10, -3 / 20);
  for (const c of out.chans) for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) > thr) soft++;
  const st = out.am.stats;
  return {
    name: mode === 'flood' ? 'stress_200_flood' : `stress_40_${mode}`,
    kind: 'stress',
    group: 'Stress',
    wav: wavBase64(out.chans, SR),
    metrics: m,
    rawPeakDb: peakDb(raw.chans),
    extra: {
      triggers: triggers.length,
      played: st.played,
      dropped: st.dropped,
      stolen: st.stolen,
      culled: st.culled,
      peakVoices: st.peakVoices,
      limiterMaxReductionDb: Math.round(minReduction * 10) / 10,
      ceilingSoftClipSamplesPct: Math.round((soft / (out.chans.length * out.chans[0].length)) * 10000) / 100,
      limiterHeld: m.truePeakDb <= -0.3 && m.nan === 0 ? 'yes' : 'no',
    },
  };
}

/** Everything the render script iterates over. */
export function catalog(): { sounds: string[]; music: string[]; ambience: ThemeId[] } {
  return { sounds: SOUND_GROUPS.flatMap((g) => g.ids), music: MUSIC_ITEMS.map((m) => m.name), ambience: ['verdant', 'scorched', 'frost'] };
}
