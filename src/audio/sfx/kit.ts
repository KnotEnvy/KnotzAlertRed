/**
 * Reusable layers for the sound recipes: transients, bodies, tails and tonal elements.
 * All of them add into a Mix at a time offset.
 */
import { expTo, glide, type Mix, perc, perc2, swell, type Curve } from '../dsp';

/** Broadband transient: the "crack" at the front of a shot or blast. */
export function crack(m: Mix, at: number, amp: number, o: { hp?: number; lp?: number; tau?: number; drive?: number } = {}): void {
  const l = m.L(0.03).noise('white').env(perc(0.0002, o.tau ?? 0.0018)).hp(o.hp ?? 1500).lp(o.lp ?? 7500);
  if (o.drive) l.drive(o.drive);
  m.add(l, at, amp);
}

/** Pitched low "thump": a sine falling from f0 to f1 with time constant ptau, decaying with tau. */
export function thud(m: Mix, at: number, f0: number, f1: number, tau: number, amp: number, drive = 1.5, ptau = tau * 0.4): void {
  const l = m.L(tau * 6 + 0.02).osc('sine', expTo(f0, f1, ptau), perc(0.0015, tau));
  if (drive > 1) l.drive(drive);
  m.add(l, at, amp);
}

/** Filtered noise body whose low-pass cutoff falls from lp0 to lp1. */
export function body(
  m: Mix,
  at: number,
  amp: number,
  o: { lp0: number; lp1: number; ftau: number; tau: number; drive?: number; color?: 'white' | 'pink' | 'brown'; attack?: number; q?: number },
): void {
  const l = m
    .L(o.tau * 6 + 0.02)
    .noise(o.color ?? 'white')
    .lp(expTo(o.lp0, o.lp1, o.ftau), o.q ?? 0.707)
    .env(perc(o.attack ?? 0.001, o.tau));
  if (o.drive) l.drive(o.drive);
  m.add(l, at, amp);
}

/** Rolling low rumble tail with flutter (distant blast energy, collapsing debris). */
export function rumble(m: Mix, at: number, dur: number, amp: number, o: { lp0?: number; lp1?: number; tau1?: number; tau2?: number; flutter?: number; attack?: number } = {}): void {
  const l = m
    .L(dur)
    .noise('brown')
    .lp(expTo(o.lp0 ?? 700, o.lp1 ?? 120, dur * 0.35), 0.8)
    .env(perc2(o.attack ?? 0.02, o.tau1 ?? dur * 0.12, o.tau2 ?? dur * 0.35, 0.45))
    .flutter(o.flutter ?? 7, 0.5)
    .fade(0.002, 0.05);
  m.add(l, at, amp);
}

/** Sparse crackle of debris / sparks in a frequency band. */
export function debris(m: Mix, at: number, dur: number, amp: number, o: { rate?: number; tau?: number; band?: number; q?: number; len?: number } = {}): void {
  const rate = o.rate ?? 200;
  const tau = o.tau ?? dur * 0.3;
  const l = m
    .L(dur)
    .crackle((t) => rate * Math.exp(-t / tau), 1, o.len ?? 0.002)
    .bp(o.band ?? 2200, o.q ?? 0.6)
    .lp(7000)
    .fade(0.001, 0.03);
  m.add(l, at, amp);
}

/** Metal clank: inharmonic decaying partials [freq, amp, tau] plus a click. */
export function clank(m: Mix, at: number, amp: number, partials: readonly (readonly [number, number, number])[]): void {
  let longest = 0;
  for (const p of partials) longest = Math.max(longest, p[2]);
  const l = m.L(longest * 7 + 0.02).modes(partials);
  l.d[0] += 0.6;
  l.noise('white', perc(0.0002, 0.0015)).lp(7000);
  m.add(l, at, amp);
}

/** FM bell / chime. ratio 3.5 = bright metallic, 2 = warm, 1.4 = glassy. */
export function bell(m: Mix, at: number, f: number, amp: number, decay = 0.6, ratio = 3.5, index = 2, attack = 0.001): void {
  const l = m
    .L(decay * 6 + 0.02)
    .osc('sine', f, perc(attack, decay), { pm: { ratio, index: (t) => index * Math.exp(-t / (decay * 0.35)) } })
    .osc('sine', f * 2.01, perc(attack, decay * 0.35), {})
    .lp(7500)
    .fade(0.0005, 0.02);
  m.add(l, at, amp * 0.8);
}

/** Brass-like note: detuned saws through an opening low-pass. */
export function brass(m: Mix, at: number, f: number, len: number, amp: number, bright = 1, rel = 0.18): void {
  const l = m
    .L(len + rel * 5)
    .osc('saw', f, 1, { drift: 4 })
    .osc('saw', f * 1.004, 0.8)
    .osc('saw', f * 0.997, 0.6)
    .lp((t) => f * 1.2 + 2400 * bright * (1 - Math.exp(-t / 0.035)) * Math.exp(-t / 0.8), 0.9)
    .env(swell(0.022, len, rel))
    .drive(1.4)
    .fade(0.001, 0.02);
  m.add(l, at, amp);
}

/** Short radio "comms open" squelch used by acknowledgements and announcer earcons. */
export function squelch(m: Mix, at: number, amp: number): void {
  const l = m.L(0.05).noise('white', perc(0.001, 0.012)).bp(2300, 1.4).drive(2);
  m.add(l, at, amp);
}

/** Soft sine "blip" for interface sounds. */
export function blip(m: Mix, at: number, f0: number, f1: number, dur: number, amp: number, wave: 'sine' | 'tri' | 'square' = 'sine', lp = 4000): void {
  const l = m.L(dur * 6 + 0.01).osc(wave, glide(f0, f1, dur), perc(0.0015, dur)).lp(lp).fade(0.0005, 0.005);
  m.add(l, at, amp);
}

/** Filtered noise sweep (whoosh). */
export function whoosh(m: Mix, at: number, dur: number, f0: number, f1: number, amp: number, q = 1.6, shape: Curve = (t) => Math.sin(Math.PI * Math.min(1, t / dur))): void {
  const l = m.L(dur).noise('white').bp(glide(f0, f1, dur), q).env(shape).fade(0.002, 0.01);
  m.add(l, at, amp);
}

/**
 * Mid-range "crunch": driven band-passed noise. Carries a blast's weight on small speakers
 * that can't reproduce the sub thump.
 */
export function crunch(m: Mix, at: number, amp: number, fc: number, tau: number, q = 0.8): void {
  const l = m.L(tau * 6 + 0.02).noise('white').bp(fc, q).env(perc(0.0015, tau)).drive(2.5).fade(0.001, 0.01);
  m.add(l, at, amp);
}

/** Short bright "snap" on top of a gunshot transient. */
export function snap(m: Mix, at: number, amp: number, fc = 3000, tau = 0.006): void {
  const l = m.L(tau * 6 + 0.01).noise('white').bp(fc, 1).env(perc(0.0003, tau)).drive(1.6).lp(7500);
  m.add(l, at, amp);
}
