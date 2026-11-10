import type { Mix } from '../dsp';

/** Which mix bus a sound plays on. `sfx` and `amb` are positional, `ui` is centred and dry. */
export type Bus = 'sfx' | 'ui' | 'amb';

export interface SoundDef {
  bus: Bus;
  /** Rendered buffer length in seconds (trailing silence is trimmed). */
  dur: number;
  /** Designed level: maximum momentary loudness (LUFS) of the rendered buffer. */
  level: number;
  /** Writes the sound into `m.out`. `m.r` is a per-variant seeded RNG. */
  gen: (m: Mix) => void;
  /** Number of pre-rendered variations (random pitch / timing / filter baked in). */
  variants?: number;
  /** Minimum seconds between two triggers of this id. */
  gap?: number;
  /** Maximum simultaneous instances of this id. */
  maxInst?: number;
  /** Base priority for voice stealing (0..100). */
  prio?: number;
  /** Reverb send (0..1) before distance adds more. */
  verb?: number;
  /** Random playback-rate spread per trigger (fraction, e.g. 0.04 = ±4 %). */
  pitchVar?: number;
  /** Random start delay per trigger (seconds) so volleys don't flam identically. */
  delayVar?: number;
  /** Event sound that itself communicates an announcer category (suppresses the earcon). */
  announces?: boolean;
  /** How much one trigger near the camera adds to "combat heat" (drives the music). */
  heat?: number;
  /** How much one trigger pushes the music down (sidechain duck). */
  duck?: number;
}

export type SoundTable = Record<string, SoundDef>;
