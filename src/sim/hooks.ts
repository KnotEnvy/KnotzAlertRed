/**
 * Presentation hooks the simulation calls into. The sim never touches rendering, DOM or
 * audio directly, so it can run headless with the no-op implementation below.
 */
export type NoticeKind = 'info' | 'good' | 'warn' | 'bad';
export type Rgb = readonly [number, number, number];

export interface Hooks {
  sound(id: string, x?: number, z?: number, vol?: number): void;
  voice(line: string): void;
  notify(text: string, kind: NoticeKind, x?: number, z?: number): void;
  ping(x: number, z: number, color: string): void;
  muzzle(x: number, y: number, z: number, yaw: number, scale: number): void;
  tracer(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, heavy?: boolean): void;
  impact(x: number, y: number, z: number, scale: number): void;
  explosion(x: number, y: number, z: number, size: number, energy?: boolean): void;
  lightning(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Rgb): void;
  beam(x: number, z: number, radius: number): void;
  ring(x: number, z: number, radius: number, color: Rgb, duration: number): void;
  zone(x: number, z: number, radius: number, color: Rgb, duration: number): void;
  smoke(x: number, y: number, z: number, size: number): void;
  sparkle(x: number, y: number, z: number, color: Rgb, count: number): void;
  text(x: number, y: number, z: number, str: string, color: string): void;
  shake(x: number, z: number, amount: number): void;
  scorch(x: number, z: number, size: number): void;
}

export const NULL_HOOKS: Hooks = {
  sound() {},
  voice() {},
  notify() {},
  ping() {},
  muzzle() {},
  tracer() {},
  impact() {},
  explosion() {},
  lightning() {},
  beam() {},
  ring() {},
  zone() {},
  smoke() {},
  sparkle() {},
  text() {},
  shake() {},
  scorch() {},
};
