import type { Mesh, Scene } from './babylon';
import { TEAM_COLORS } from '../core/config';
import { ModelBuilder, mixCol, scaleCol } from './modelkit';
import type { Col } from './modelkit';

export interface ModelParts {
  body: Mesh;
  /** Secondary part: an aiming turret, a spinning rotor/dish, or a cargo fill. */
  turret: Mesh | null;
  pivot: [number, number, number];
  mode: 'aim' | 'spin' | 'cargo' | 'none';
  spin: number;
}

interface Pal {
  main: Col;
  dark: Col;
  glow: Col;
  light: Col;
  metal: Col;
  black: Col;
  glass: Col;
  concrete: Col;
  gold: Col;
  crystal: Col;
}

const H = Math.PI / 2;

export function palette(team: number): Pal {
  const t = TEAM_COLORS[team];
  const crimson = team === 1;
  return {
    main: t.rgb,
    dark: t.dark,
    glow: team === 0 ? [0.5, 1.5, 2.7] : team === 1 ? [2.9, 0.95, 0.3] : [1.9, 1.6, 0.8],
    light: crimson ? [0.4, 0.38, 0.39] : [0.68, 0.71, 0.76],
    metal: crimson ? [0.2, 0.2, 0.22] : [0.36, 0.39, 0.44],
    black: [0.09, 0.09, 0.11],
    glass: [0.5, 0.95, 1.25],
    concrete: crimson ? [0.36, 0.34, 0.33] : [0.5, 0.51, 0.52],
    gold: [1.1, 0.78, 0.22],
    crystal: [0.3, 1.2, 1.3],
  };
}

type Build = (b: ModelBuilder, t: ModelBuilder, P: Pal) => Partial<Pick<ModelParts, 'pivot' | 'mode' | 'spin'>>;

// ------------------------------------------------------------------ vehicles
function tracks(b: ModelBuilder, P: Pal, half: number, len: number, w = 0.62, h = 0.72): void {
  for (const s of [-1, 1]) {
    b.box(w, h, len, s * half, h / 2, 0, P.black);
    b.box(w + 0.06, 0.16, len - 0.3, s * half, h + 0.06, 0, P.metal);
    for (let i = -1; i <= 1; i++) b.cyl(h * 0.62, w + 0.04, s * half, h * 0.42, i * len * 0.33, P.metal, { rz: H, tess: 8 });
  }
}

const UNIT_MODELS: Record<string, Build> = {
  tank(b, t, P) {
    tracks(b, P, 1.02, 3.5);
    b.taper(2.0, 1.72, 0.62, 1.7, 0, 0.85, 0, P.main);
    b.box(1.74, 0.06, 1.2, 0, 1.17, 0.75, P.light);
    b.box(1.5, 0.22, 0.95, 0, 1.22, -1.1, P.metal);
    b.box(0.26, 0.16, 0.5, -0.5, 1.37, -1.15, P.black);
    b.box(0.26, 0.16, 0.5, 0.5, 1.37, -1.15, P.black);
    b.box(1.5, 0.08, 0.5, 0, 1.0, 1.5, P.dark, { rx: 0.42 });
    b.box(0.22, 0.14, 0.1, -0.62, 0.9, 1.72, P.glow);
    b.box(0.22, 0.14, 0.1, 0.62, 0.9, 1.72, P.glow);
    t.taper(1.55, 1.15, 0.6, 1.15, 0, 0.3, 0, P.main);
    t.box(1.0, 0.08, 1.0, 0, 0.62, 0.1, P.light);
    t.box(0.9, 0.34, 0.7, 0, 0.26, -0.9, P.dark);
    t.cyl(0.26, 2.3, 0, 0.3, 1.75, P.metal, { rx: H });
    t.cyl(0.38, 0.42, 0, 0.3, 2.78, P.black, { rx: H });
    t.cyl(0.5, 0.14, 0.3, 0.64, -0.15, P.dark);
    t.box(0.04, 1.0, 0.04, -0.5, 1.0, -0.55, P.black);
    return { pivot: [0, 1.16, -0.15], mode: 'aim' };
  },
  titan(b, t, P) {
    tracks(b, P, 1.38, 4.6, 0.8, 0.9);
    b.taper(2.7, 2.3, 0.85, 1.62, 0, 1.12, 0, P.main);
    b.box(2.9, 0.3, 3.4, 0, 1.0, -0.2, P.dark);
    b.box(2.0, 0.3, 1.2, 0, 1.68, -1.45, P.metal);
    for (const s of [-1, 1]) {
      b.cyl(0.3, 0.7, s * 0.7, 1.95, -1.7, P.black, { tess: 8 });
      b.box(0.3, 0.2, 0.12, s * 0.95, 1.2, 2.2, P.glow);
    }
    b.box(2.1, 0.1, 0.7, 0, 1.38, 2.0, P.dark, { rx: 0.45 });
    t.taper(2.1, 1.6, 0.8, 1.2, 0, 0.4, 0, P.main);
    t.box(1.4, 0.08, 1.5, 0, 0.82, 0.05, P.light);
    t.box(1.3, 0.5, 0.9, 0, 0.35, -1.2, P.dark);
    for (const s of [-1, 1]) {
      t.cyl(0.3, 2.8, s * 0.42, 0.38, 2.2, P.metal, { rx: H });
      t.cyl(0.44, 0.5, s * 0.42, 0.38, 3.45, P.black, { rx: H });
    }
    t.box(0.5, 0.3, 0.5, -0.55, 0.92, -0.3, P.dark);
    t.cyl(0.5, 0.12, 0.45, 0.86, 0.1, P.metal);
    t.box(0.05, 1.3, 0.05, 0.75, 1.3, -0.9, P.black);
    return { pivot: [0, 1.6, -0.25], mode: 'aim' };
  },
  buggy(b, t, P) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) b.cyl(0.86, 0.38, sx * 0.86, 0.43, sz * 0.95, P.black, { rz: H, tess: 10 });
    }
    b.box(1.45, 0.4, 2.7, 0, 0.72, 0, P.main);
    b.box(1.3, 0.3, 0.9, 0, 0.98, 0.85, P.main, { rx: 0.2 });
    b.box(1.2, 0.5, 0.9, 0, 1.12, -0.25, P.dark);
    b.box(1.22, 0.3, 0.06, 0, 1.2, 0.22, P.glass, { rx: -0.5 });
    b.box(0.08, 0.5, 0.08, -0.6, 1.5, -0.75, P.metal);
    b.box(0.08, 0.5, 0.08, 0.6, 1.5, -0.75, P.metal);
    b.box(1.3, 0.08, 0.08, 0, 1.75, -0.75, P.metal);
    b.box(0.2, 0.12, 0.08, -0.5, 0.8, 1.36, P.glow);
    b.box(0.2, 0.12, 0.08, 0.5, 0.8, 1.36, P.glow);
    t.box(0.34, 0.3, 0.6, 0, 0.12, 0, P.metal);
    t.cyl(0.12, 1.1, 0, 0.14, 0.8, P.black, { rx: H, tess: 6 });
    t.box(0.12, 0.3, 0.3, 0.26, 0.1, -0.1, P.dark);
    return { pivot: [0, 1.6, -0.55], mode: 'aim' };
  },
  artillery(b, _t, P) {
    tracks(b, P, 1.0, 3.5);
    b.box(2.0, 0.5, 3.2, 0, 0.92, 0, P.main);
    b.box(1.5, 0.7, 1.3, 0, 1.45, -0.7, P.dark);
    b.box(1.0, 0.5, 1.0, 0, 1.4, 0.4, P.metal);
    b.cyl(0.34, 3.6, 0, 2.25, 1.35, P.metal, { rx: H - 0.5 });
    b.cyl(0.48, 0.5, 0, 3.05, 2.82, P.black, { rx: H - 0.5 });
    b.cyl(0.5, 1.0, 0, 1.75, 0.45, P.dark, { rx: H - 0.5 });
    b.box(0.2, 0.2, 1.2, -0.75, 0.6, -2.0, P.metal, { rx: 0.4 });
    b.box(0.2, 0.2, 1.2, 0.75, 0.6, -2.0, P.metal, { rx: 0.4 });
    b.box(0.3, 0.14, 0.1, 0, 1.0, 1.62, P.glow);
    return {};
  },
  harvester(b, t, P) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1.25, 0, 1.25]) b.cyl(1.0, 0.5, sx * 1.15, 0.5, sz, P.black, { rz: H, tess: 10 });
    }
    b.box(2.2, 0.5, 4.0, 0, 0.9, 0, P.metal);
    b.box(2.5, 1.3, 2.5, 0, 1.75, -0.65, P.light);
    b.box(2.56, 0.3, 2.56, 0, 1.5, -0.65, P.main);
    b.box(2.1, 0.12, 2.1, 0, 2.36, -0.65, P.black);
    b.box(1.9, 1.0, 1.1, 0, 1.65, 1.35, P.main);
    b.box(1.7, 0.42, 0.08, 0, 1.85, 1.92, P.glass);
    b.box(2.9, 0.5, 0.7, 0, 0.5, 2.3, P.dark);
    for (let i = -2; i <= 2; i++) b.box(0.2, 0.3, 0.4, i * 0.58, 0.3, 2.75, P.light, { rx: 0.5 });
    b.cyl(0.24, 0.8, -0.95, 2.5, 0.3, P.black, { tess: 8 });
    b.box(0.22, 0.14, 0.08, -0.7, 1.3, 1.92, P.glow);
    b.box(0.22, 0.14, 0.08, 0.7, 1.3, 1.92, P.glow);
    // cargo: a heap of crystals that grows as the hopper fills
    t.ico(0.75, 0, 0.25, 0, P.crystal, 1.2, 0.8, 1.2);
    t.ico(0.5, 0.55, 0.3, 0.45, P.crystal, 1, 1.1, 1);
    t.ico(0.5, -0.5, 0.3, -0.45, P.crystal, 1, 1.2, 1);
    t.ico(0.42, -0.45, 0.25, 0.55, P.crystal);
    return { pivot: [0, 2.3, -0.65], mode: 'cargo' };
  },
  gunship(b, t, P) {
    b.sphere(1.3, 0, 0, 0.3, P.main, 1, 0.85, 2.2, 10);
    b.sphere(0.95, 0, 0.18, 1.25, P.glass, 0.95, 0.7, 1.3, 8);
    b.box(0.34, 0.34, 2.6, 0, 0.1, -2.2, P.dark);
    b.box(0.08, 0.9, 0.7, 0, 0.6, -3.2, P.main, { rx: -0.3 });
    b.box(1.5, 0.08, 0.5, 0, 0.2, -3.25, P.dark);
    b.box(3.4, 0.14, 0.8, 0, -0.1, 0.1, P.dark);
    for (const s of [-1, 1]) {
      b.cyl(0.44, 1.3, s * 1.6, -0.3, 0.2, P.metal, { rx: H, tess: 8 });
      b.cyl(0.3, 0.2, s * 1.6, -0.3, 0.9, P.glow, { rx: H, tess: 8 });
      b.box(0.1, 0.5, 1.6, s * 0.5, -0.75, 0.2, P.black);
    }
    b.cyl(0.3, 0.5, 0, 0.75, 0, P.metal, { tess: 8 });
    t.box(6.4, 0.05, 0.3, 0, 0, 0, P.black);
    t.box(0.3, 0.05, 6.4, 0, 0, 0, P.black);
    t.cyl(0.5, 0.16, 0, 0, 0, P.metal, { tess: 8 });
    return { pivot: [0, 1.05, 0], mode: 'spin', spin: 34 };
  },
};

// ------------------------------------------------------------------ infantry
function soldier(b: ModelBuilder, P: Pal, s: number, helmet: Col): void {
  b.box(0.22 * s, 0.62 * s, 0.26 * s, -0.16 * s, 0.31 * s, 0, P.black);
  b.box(0.22 * s, 0.62 * s, 0.26 * s, 0.16 * s, 0.31 * s, 0, P.black);
  b.box(0.62 * s, 0.6 * s, 0.38 * s, 0, 0.92 * s, 0, P.main);
  b.box(0.66 * s, 0.14 * s, 0.42 * s, 0, 0.66 * s, 0, P.dark);
  b.box(0.18 * s, 0.5 * s, 0.2 * s, -0.4 * s, 0.95 * s, 0.06 * s, P.dark, { rx: -0.5 });
  b.box(0.18 * s, 0.5 * s, 0.2 * s, 0.4 * s, 0.95 * s, 0.1 * s, P.dark, { rx: -0.8 });
  b.sphere(0.36 * s, 0, 1.4 * s, 0, [0.86, 0.68, 0.55]);
  b.sphere(0.44 * s, 0, 1.47 * s, -0.02 * s, helmet, 1, 0.7, 1.05);
  b.box(0.4 * s, 0.4 * s, 0.2 * s, 0, 0.98 * s, -0.28 * s, P.metal);
}

Object.assign(UNIT_MODELS, {
  trooper(b: ModelBuilder, _t: ModelBuilder, P: Pal) {
    soldier(b, P, 1.25, P.dark);
    b.box(0.1, 0.14, 1.1, 0.34, 1.2, 0.5, P.black);
    b.box(0.1, 0.24, 0.3, 0.34, 1.08, 0.2, P.metal);
    return {};
  },
  lancer(b: ModelBuilder, _t: ModelBuilder, P: Pal) {
    soldier(b, P, 1.25, P.metal);
    b.cyl(0.28, 1.5, 0.42, 1.72, 0.15, P.metal, { rx: H, tess: 8 });
    b.cyl(0.36, 0.3, 0.42, 1.72, 0.9, P.black, { rx: H, tess: 8 });
    b.cyl(0.2, 0.24, 0.42, 1.72, 1.02, P.glow, { rx: H, tess: 6 });
    return {};
  },
  grenadier(b: ModelBuilder, _t: ModelBuilder, P: Pal) {
    soldier(b, P, 1.3, P.gold);
    b.cyl(0.32, 0.8, 0.36, 1.22, 0.45, P.black, { rx: H, tess: 8 });
    b.box(0.5, 0.56, 0.3, 0, 1.25, -0.42, P.dark);
    b.sphere(0.2, -0.22, 0.9, 0.24, P.metal);
    b.sphere(0.2, 0.0, 0.9, 0.26, P.metal);
    return {};
  },
  // ---------------------------------------------------------------- heroes
  hero_rook(b: ModelBuilder, t: ModelBuilder, P: Pal) {
    tracks(b, P, 1.4, 4.6, 0.84, 0.95);
    b.taper(2.8, 2.35, 0.9, 1.6, 0, 1.2, 0, P.main);
    b.box(3.05, 0.22, 4.3, 0, 1.0, 0, P.gold);
    b.box(2.0, 0.34, 1.3, 0, 1.8, -1.45, P.metal);
    b.box(2.3, 0.12, 0.8, 0, 1.5, 2.0, P.gold, { rx: 0.45 });
    for (const s of [-1, 1]) {
      b.cyl(0.32, 0.8, s * 0.72, 2.1, -1.75, P.black, { tess: 8 });
      b.box(0.34, 0.22, 0.12, s * 1.0, 1.3, 2.24, P.glow);
    }
    t.taper(2.2, 1.6, 0.9, 1.2, 0, 0.45, 0, P.main);
    t.box(2.3, 0.14, 2.7, 0, 0.06, 0, P.gold);
    t.box(1.4, 0.56, 1.0, 0, 0.4, -1.3, P.dark);
    t.cyl(0.42, 3.2, 0, 0.45, 2.5, P.metal, { rx: H });
    t.cyl(0.62, 0.7, 0, 0.45, 3.95, P.gold, { rx: H });
    t.cyl(0.6, 0.5, 0, 0.45, 1.25, P.dark, { rx: H });
    t.cyl(0.7, 0.2, -0.55, 1.0, -0.1, P.gold);
    // command banner
    t.box(0.07, 2.4, 0.07, 0.8, 1.9, -1.2, P.black);
    t.box(0.05, 0.75, 1.1, 0.8, 2.7, -1.8, P.glow);
    t.sphere(0.5, -0.75, 1.3, -1.2, P.light, 1, 0.4, 1);
    return { pivot: [0, 1.75, -0.25], mode: 'aim' };
  },
  hero_nyx(b: ModelBuilder, t: ModelBuilder, P: Pal) {
    const robe = mixCol(P.dark, [0.3, 0.12, 0.5], 0.55);
    const violet: Col = [1.7, 0.9, 2.8];
    b.cyl(1.5, 2.0, 0, 1.0, 0, robe, { dTop: 0.5, tess: 8 });
    b.cyl(1.7, 0.2, 0, 0.12, 0, P.main, { dTop: 1.5, tess: 8 });
    b.box(0.95, 0.75, 0.55, 0, 2.2, 0, P.main);
    b.taper(1.5, 1.0, 0.3, 0.55, 0, 2.62, 0, P.gold);
    b.sphere(0.5, 0, 3.0, 0.02, [0.9, 0.74, 0.66]);
    b.sphere(0.66, 0, 3.08, -0.08, robe, 1, 0.95, 1.05);
    b.box(0.3, 0.1, 0.06, 0, 3.02, 0.27, violet);
    b.box(0.22, 0.9, 0.24, -0.62, 2.1, 0.15, robe, { rx: -0.7 });
    b.box(0.22, 0.9, 0.24, 0.62, 2.1, 0.25, robe, { rx: -1.1 });
    // staff
    b.cyl(0.1, 3.4, 0.82, 1.9, 0.75, P.black, { tess: 6 });
    b.ico(0.34, 0.82, 3.75, 0.75, violet, 0.8, 1.5, 0.8);
    b.taper(0.5, 0.2, 0.3, 1, 0.82, 3.4, 0.75, P.gold);
    // orbiting storm crystals
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      t.ico(0.26, Math.cos(a) * 1.5, Math.sin(i * 2.1) * 0.25, Math.sin(a) * 1.5, violet, 0.7, 1.4, 0.7);
    }
    return { pivot: [0, 2.0, 0], mode: 'spin', spin: 2.4 };
  },
  hero_kade(b: ModelBuilder, _t: ModelBuilder, P: Pal) {
    const s = 1.85;
    const visor: Col = [0.6, 2.6, 1.2];
    soldier(b, P, s, P.black);
    b.box(0.6 * s, 0.9 * s, 0.08 * s, 0, 0.7 * s, -0.36 * s, P.dark, { rx: -0.22 });
    b.box(0.3 * s, 0.08 * s, 0.1 * s, 0, 1.44 * s, 0.2 * s, visor);
    b.taper(0.74 * s, 0.6 * s, 0.1 * s, 0.62, 0, 1.24 * s, 0, P.dark);
    b.box(0.2 * s, 0.06 * s, 0.44 * s, -0.36 * s, 1.27 * s, 0, P.gold);
    b.box(0.2 * s, 0.06 * s, 0.44 * s, 0.36 * s, 1.27 * s, 0, P.gold);
    b.cyl(0.11 * s, 1.9 * s, 0.4 * s, 1.02 * s, 0.75 * s, P.black, { rx: H, tess: 6 });
    b.box(0.12 * s, 0.2 * s, 0.6 * s, 0.4 * s, 0.94 * s, 0.1 * s, P.metal);
    b.cyl(0.14 * s, 0.36 * s, 0.4 * s, 1.13 * s, 0.35 * s, P.metal, { rx: H, tess: 6 });
    b.cyl(0.16 * s, 0.2 * s, 0.4 * s, 1.02 * s, 1.72 * s, visor, { rx: H, tess: 6 });
    return {};
  },
} satisfies Record<string, Build>);

// ------------------------------------------------------------------ buildings
function slab(b: ModelBuilder, P: Pal, w: number, d: number): void {
  b.box(w, 0.7, d, 0, 0.0, 0, P.concrete);
  b.box(w - 0.5, 0.12, d - 0.5, 0, 0.38, 0, scaleCol(P.concrete, 0.8));
}

const BUILDING_MODELS: Record<string, Build> = {
  hq(b, t, P) {
    slab(b, P, 9.7, 9.7);
    b.taper(7.4, 6.4, 3.0, 1, 0, 1.9, 0, P.light);
    b.box(6.6, 0.5, 6.6, 0, 3.0, 0, P.main);
    b.taper(4.4, 3.6, 2.4, 1, 0, 4.6, 0, P.light);
    b.box(3.8, 0.4, 3.8, 0, 5.6, 0, P.dark);
    b.box(3.5, 0.5, 0.1, 0, 4.9, 1.95, P.glass);
    b.box(0.1, 0.5, 3.5, 1.95, 4.9, 0, P.glass);
    b.box(0.1, 0.5, 3.5, -1.95, 4.9, 0, P.glass);
    b.box(2.6, 1.8, 0.3, 0, 1.3, 3.6, P.black);
    b.box(3.0, 0.3, 0.5, 0, 2.3, 3.6, P.main);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.taper(1.5, 1.1, 3.6, 1, sx * 4.0, 2.1, sz * 4.0, P.dark);
        b.box(0.7, 0.3, 0.7, sx * 4.0, 4.05, sz * 4.0, P.glow);
      }
    }
    b.cyl(0.5, 1.6, 0, 6.6, 0, P.metal, { tess: 8 });
    // rotating radar
    t.cyl(0.4, 0.3, 0, 0, 0, P.metal, { tess: 8 });
    t.box(3.4, 1.2, 0.12, 0, 0.75, 0, P.light, { rx: -0.25 });
    t.box(3.6, 0.12, 0.2, 0, 1.36, -0.16, P.main);
    t.box(0.12, 0.9, 0.9, 0, 0.7, 0.4, P.metal);
    return { pivot: [0, 7.4, 0], mode: 'spin', spin: 0.9 };
  },
  power(b, _t, P) {
    slab(b, P, 5.7, 5.7);
    b.cyl(3.2, 2.6, 0.2, 1.65, 0.2, P.light, { tess: 12 });
    b.cyl(3.32, 0.5, 0.2, 1.7, 0.2, P.crystal, { tess: 12 });
    b.cyl(3.4, 0.3, 0.2, 2.9, 0.2, P.main, { tess: 12 });
    b.sphere(2.9, 0.2, 3.0, 0.2, P.main, 1, 0.55, 1, 10);
    b.cyl(0.9, 0.5, 0.2, 3.95, 0.2, P.crystal, { tess: 8 });
    for (const [x, z] of [[-1.9, -1.9], [-1.9, 1.5]] as const) {
      b.cyl(1.5, 3.8, x, 2.2, z, P.metal, { dTop: 1.0, tess: 10 });
      b.cyl(1.1, 0.2, x, 4.15, z, P.black, { tess: 10 });
    }
    b.box(0.4, 0.4, 2.6, -1.9, 1.0, -0.2, P.dark);
    b.box(1.8, 0.4, 0.4, -0.9, 1.0, -1.9, P.dark);
    return {};
  },
  refinery(b, _t, P) {
    slab(b, P, 9.7, 7.7);
    b.box(5.2, 3.2, 5.6, -1.9, 1.9, 0, P.light);
    b.box(5.4, 0.5, 5.8, -1.9, 2.6, 0, P.main);
    b.taper(5.2, 3.6, 1.0, 1.08, -1.9, 4.0, 0, P.dark);
    b.box(2.6, 2.2, 0.3, -1.9, 1.4, 2.85, P.black);
    for (const z of [-1.9, 1.9]) {
      b.cyl(2.6, 4.2, 2.9, 2.4, z, P.metal, { tess: 12 });
      b.cyl(2.7, 0.5, 2.9, 3.4, z, P.main, { tess: 12 });
      b.sphere(2.6, 2.9, 4.5, z, P.light, 1, 0.45, 1, 10);
      b.cyl(1.2, 0.3, 2.9, 5.15, z, P.crystal, { tess: 8 });
    }
    b.box(0.5, 0.5, 2.0, 2.9, 2.0, 0, P.dark);
    b.cyl(0.7, 6.4, -3.9, 3.5, -2.6, P.metal, { dTop: 0.5, tess: 8 });
    b.cyl(0.56, 0.3, -3.9, 6.8, -2.6, P.glow, { tess: 8 });
    b.box(1.2, 0.2, 0.2, 0.9, 1.6, 2.9, P.gold);
    return {};
  },
  barracks(b, _t, P) {
    slab(b, P, 7.7, 5.7);
    b.box(6.4, 2.0, 4.2, 0, 1.35, 0, P.light);
    b.taper(6.6, 5.2, 1.3, 0.66, 0, 3.0, 0, P.main);
    b.box(6.5, 0.3, 4.3, 0, 2.3, 0, P.dark);
    b.box(1.5, 1.5, 0.2, -1.4, 1.1, 2.12, P.black);
    b.box(1.2, 0.5, 0.1, 1.4, 1.5, 2.12, P.glass);
    b.box(0.1, 0.5, 2.6, 3.22, 1.5, 0, P.glass);
    b.box(0.1, 0.5, 2.6, -3.22, 1.5, 0, P.glass);
    b.cyl(0.1, 4.2, 3.2, 2.4, 2.3, P.black, { tess: 6 });
    b.box(1.2, 0.7, 0.05, 2.58, 4.0, 2.3, P.glow);
    for (let i = 0; i < 4; i++) b.box(0.9, 0.5, 0.5, -3.0 + i * 0.95, 0.6, 2.6, [0.55, 0.48, 0.34]);
    return {};
  },
  factory(b, _t, P) {
    slab(b, P, 9.7, 7.7);
    b.box(7.4, 3.2, 6.2, -0.8, 1.95, 0, P.light);
    b.taper(7.6, 5.6, 1.3, 0.83, -0.8, 4.2, 0, P.main);
    b.box(7.5, 0.4, 6.3, -0.8, 3.2, 0, P.dark);
    b.box(4.4, 2.6, 0.3, -0.8, 1.6, 3.1, P.black);
    for (let i = 0; i < 4; i++) b.box(4.2, 0.1, 0.08, -0.8, 0.9 + i * 0.6, 3.27, P.metal);
    b.box(4.8, 0.3, 0.5, -0.8, 3.05, 3.1, P.gold);
    b.box(1.6, 5.0, 1.8, 3.8, 2.8, -2.2, P.main);
    b.box(1.3, 0.6, 1.5, 3.8, 4.7, -2.2, P.glass);
    b.box(1.8, 0.3, 2.0, 3.8, 5.3, -2.2, P.dark);
    for (const z of [0.6, 2.2]) {
      b.cyl(0.8, 5.4, 3.9, 3.0, z, P.metal, { dTop: 0.6, tess: 8 });
      b.cyl(0.66, 0.3, 3.9, 5.8, z, P.black, { tess: 8 });
    }
    for (let i = -1; i <= 1; i++) b.box(1.0, 0.4, 1.0, -0.8 + i * 2.2, 5.0, 0, P.metal);
    return {};
  },
  techlab(b, _t, P) {
    slab(b, P, 5.7, 5.7);
    b.cyl(4.4, 3.2, 0, 1.95, 0, P.light, { tess: 6 });
    b.cyl(4.6, 0.5, 0, 2.7, 0, P.main, { tess: 6 });
    b.cyl(3.8, 0.5, 0, 3.75, 0, P.dark, { tess: 6 });
    b.sphere(3.2, 0, 3.9, 0, P.glass, 1, 0.75, 1, 10);
    b.cyl(0.24, 2.6, 0, 6.0, 0, P.metal, { tess: 6 });
    b.ico(0.42, 0, 7.4, 0, P.glow);
    b.cyl(1.2, 0.2, 1.9, 4.0, 1.5, P.light, { tess: 10, rx: 0.7, rz: -0.4 });
    b.cyl(0.1, 0.8, 1.9, 3.6, 1.5, P.metal, { tess: 5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      b.box(0.9, 0.5, 0.1, Math.cos(a) * 1.92, 1.9, Math.sin(a) * 1.92, P.glass, { ry: -a + H });
    }
    return {};
  },
  airpad(b, t, P) {
    slab(b, P, 7.7, 7.7);
    b.cyl(7.0, 0.5, 0, 0.6, 0, P.black, { tess: 8, ry: Math.PI / 8 });
    b.cyl(5.4, 0.1, 0, 0.87, 0, P.metal, { tess: 24 });
    b.cyl(4.9, 0.12, 0, 0.88, 0, P.black, { tess: 24 });
    b.box(3.0, 0.1, 0.6, 0, 0.96, 0, P.gold);
    b.box(0.6, 0.1, 3.0, 0, 0.96, 0, P.gold);
    b.box(1.5, 3.8, 1.5, -3.0, 2.3, -3.0, P.main);
    b.box(1.8, 0.9, 1.8, -3.0, 4.6, -3.0, P.glass);
    b.box(2.0, 0.25, 2.0, -3.0, 5.15, -3.0, P.dark);
    for (const [x, z] of [[3.3, 3.3], [3.3, -3.3], [-3.3, 3.3]] as const) {
      b.cyl(0.3, 0.9, x, 0.9, z, P.metal, { tess: 6 });
      b.sphere(0.4, x, 1.45, z, P.glow);
    }
    t.box(0.08, 0.6, 0.08, 0, 0.3, 0, P.metal);
    t.box(1.6, 0.5, 0.08, 0, 0.75, 0, P.light);
    return { pivot: [-3.0, 5.3, -3.0], mode: 'spin', spin: 1.6 };
  },
  sentry(b, t, P) {
    b.cyl(3.4, 0.8, 0, 0.3, 0, P.concrete, { tess: 8 });
    b.cyl(2.6, 0.5, 0, 0.9, 0, P.dark, { tess: 8 });
    b.cyl(1.4, 1.6, 0, 1.7, 0, P.metal, { dTop: 1.0, tess: 8 });
    t.box(1.5, 0.9, 1.7, 0, 0.3, -0.1, P.main);
    t.box(1.6, 0.25, 1.0, 0, 0.82, -0.3, P.dark);
    for (const s of [-1, 1]) {
      t.cyl(0.18, 1.9, s * 0.36, 0.32, 1.5, P.black, { rx: H, tess: 6 });
      t.box(0.3, 0.5, 0.9, s * 0.86, 0.2, -0.2, P.metal);
    }
    t.box(0.5, 0.2, 0.06, 0, 0.5, 0.78, P.glow);
    return { pivot: [0, 2.6, 0], mode: 'aim' };
  },
  cannon(b, t, P) {
    b.taper(3.7, 2.8, 1.5, 1, 0, 0.7, 0, P.concrete);
    b.box(3.0, 0.3, 3.0, 0, 1.5, 0, P.dark);
    b.cyl(1.9, 0.5, 0, 1.8, 0, P.metal, { tess: 10 });
    t.taper(2.3, 1.7, 1.0, 1.1, 0, 0.45, 0, P.main);
    t.box(1.4, 0.6, 0.9, 0, 0.4, -1.3, P.dark);
    t.cyl(0.4, 3.0, 0, 0.5, 2.3, P.metal, { rx: H });
    t.cyl(0.58, 0.6, 0, 0.5, 3.7, P.black, { rx: H });
    t.cyl(0.62, 0.5, 0, 0.5, 1.2, P.dark, { rx: H });
    t.box(0.4, 0.3, 0.4, 0.6, 1.05, -0.3, P.glow);
    return { pivot: [0, 2.05, 0], mode: 'aim' };
  },
  arc(b, _t, P) {
    b.cyl(3.2, 0.7, 0, 0.3, 0, P.concrete, { tess: 8 });
    b.cyl(2.2, 0.6, 0, 0.9, 0, P.dark, { tess: 8 });
    b.cyl(1.4, 5.2, 0, 3.7, 0, P.metal, { dTop: 0.5, tess: 8 });
    for (let i = 0; i < 3; i++) {
      b.cyl(1.9 - i * 0.4, 0.22, 0, 2.3 + i * 1.3, 0, P.main, { tess: 12 });
      b.cyl(1.5 - i * 0.4, 0.3, 0, 2.3 + i * 1.3, 0, P.glow, { tess: 12 });
    }
    b.sphere(1.25, 0, 6.75, 0, P.glow, 1, 1, 1, 10);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.box(0.14, 1.2, 0.14, Math.cos(a) * 0.75, 6.4, Math.sin(a) * 0.75, P.black, { rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5 });
    }
    return {};
  },
  extractor(b, t, P) {
    const rust: Col = [0.45, 0.33, 0.24];
    const steel: Col = [0.42, 0.43, 0.45];
    b.box(5.7, 0.7, 5.7, 0, 0, 0, [0.4, 0.38, 0.35]);
    b.cyl(2.6, 2.4, -1.2, 1.5, -1.2, steel, { tess: 10 });
    b.cyl(2.7, 0.4, -1.2, 2.0, -1.2, P.main, { tess: 10 });
    b.sphere(2.6, -1.2, 2.7, -1.2, rust, 1, 0.4, 1, 8);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      b.box(0.22, 5.6, 0.22, 1.2 + x * 0.6, 3.0, 1.2 + z * 0.6, steel, { rz: -x * 0.13, rx: z * 0.13 });
    }
    b.box(1.9, 0.2, 1.9, 1.2, 1.9, 1.2, rust);
    b.box(1.3, 0.2, 1.3, 1.2, 3.9, 1.2, rust);
    b.cyl(0.5, 5.4, 1.2, 2.9, 1.2, P.black, { tess: 6 });
    b.ico(0.5, 1.2, 6.1, 1.2, P.glow, 0.8, 1.4, 0.8);
    b.box(0.4, 0.4, 2.4, -0.2, 0.9, 0.6, steel, { ry: 0.78 });
    b.cyl(0.1, 3.2, -2.4, 2.0, 2.4, P.black, { tess: 5 });
    b.box(1.3, 0.8, 0.06, -1.75, 3.1, 2.4, P.main);
    // pump jack
    t.box(0.3, 0.3, 3.0, 0, 0, 0.5, steel);
    t.box(0.5, 0.9, 0.5, 0, -0.2, 1.9, rust);
    return { pivot: [1.2, 4.6, 1.2], mode: 'spin', spin: 0.7 };
  },
  obelisk(b, t, P) {
    const stone: Col = [0.42, 0.43, 0.5];
    const stone2: Col = [0.3, 0.31, 0.38];
    b.box(3.9, 0.7, 3.9, 0, 0, 0, stone2);
    b.box(3.2, 0.7, 3.2, 0, 0.65, 0, stone);
    b.box(2.5, 0.6, 2.5, 0, 1.25, 0, stone2);
    b.taper(1.9, 0.85, 8.4, 1, 0, 5.7, 0, stone);
    for (let i = 0; i < 4; i++) b.box(1.74 - i * 0.24, 0.2, 1.74 - i * 0.24, 0, 2.6 + i * 1.8, 0, P.glow);
    b.taper(0.85, 0.05, 1.0, 1, 0, 10.4, 0, P.gold);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      b.taper(0.6, 0.3, 1.6, 1, x * 1.5, 1.6, z * 1.5, stone);
      b.box(0.34, 0.2, 0.34, x * 1.5, 2.5, z * 1.5, P.glow);
    }
    t.ico(0.62, 0, 0, 0, P.glow, 0.8, 1.7, 0.8);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      t.ico(0.22, Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6, P.glow, 0.7, 1.5, 0.7);
    }
    return { pivot: [0, 12.4, 0], mode: 'spin', spin: 1.1 };
  },
};

function run(scene: Scene, build: Build, name: string, team: number): ModelParts {
  const b = new ModelBuilder(scene);
  const t = new ModelBuilder(scene);
  const info = build(b, t, palette(team));
  const body = b.build(`${name}_body_${team}`);
  const turret = t.empty ? null : t.build(`${name}_turret_${team}`);
  return { body, turret, pivot: info.pivot ?? [0, 0, 0], mode: turret ? (info.mode ?? 'aim') : 'none', spin: info.spin ?? 0 };
}

export function buildUnitModel(scene: Scene, model: string, team: number): ModelParts {
  const fn = UNIT_MODELS[model] ?? UNIT_MODELS.tank;
  return run(scene, fn, `u_${model}`, team);
}

export function buildBuildingModel(scene: Scene, model: string, team: number): ModelParts {
  const fn = BUILDING_MODELS[model] ?? BUILDING_MODELS.power;
  return run(scene, fn, `b_${model}`, team);
}

/** Aurium crystal cluster used for resource nodes. */
export function buildCrystalModel(scene: Scene): Mesh {
  const b = new ModelBuilder(scene);
  const c1: Col = [0.2, 1.0, 1.1];
  const c2: Col = [0.38, 1.4, 1.3];
  b.cyl(0.9, 2.0, 0, 0.8, 0, c1, { dTop: 0.15, tess: 5 });
  b.cyl(0.7, 1.5, 0.6, 0.55, 0.2, c2, { dTop: 0.1, tess: 5, rz: -0.45 });
  b.cyl(0.65, 1.4, -0.55, 0.5, 0.3, c1, { dTop: 0.1, tess: 5, rz: 0.5 });
  b.cyl(0.6, 1.2, 0.1, 0.45, -0.6, c2, { dTop: 0.1, tess: 5, rx: -0.5 });
  b.cyl(0.5, 1.0, -0.2, 0.4, 0.7, c1, { dTop: 0.1, tess: 5, rx: 0.55 });
  b.ico(0.5, 0, 0.1, 0, [0.2, 0.5, 0.55], 1.5, 0.4, 1.5);
  return b.build('crystal');
}

export function buildTreeModel(scene: Scene, variant: number, leaf: Col, trunk: Col, snow: boolean): Mesh {
  const b = new ModelBuilder(scene);
  if (variant === 0) {
    b.cyl(0.4, 1.4, 0, 0.7, 0, trunk, { tess: 6 });
    b.cyl(2.6, 2.2, 0, 2.2, 0, leaf, { dTop: 0.9, tess: 7 });
    b.cyl(2.0, 1.9, 0, 3.6, 0, scaleCol(leaf, 1.12), { dTop: 0.5, tess: 7 });
    b.cyl(1.3, 1.7, 0, 4.9, 0, snow ? [0.92, 0.95, 1] : scaleCol(leaf, 1.25), { dTop: 0.02, tess: 7 });
  } else {
    b.cyl(0.5, 1.8, 0, 0.9, 0, trunk, { tess: 6 });
    b.ico(1.5, 0, 2.8, 0, leaf, 1, 0.9, 1);
    b.ico(1.1, 0.8, 3.5, 0.3, scaleCol(leaf, 1.15), 1, 0.9, 1);
    b.ico(1.0, -0.7, 3.4, -0.4, snow ? [0.9, 0.94, 1] : scaleCol(leaf, 0.9), 1, 0.9, 1);
  }
  return b.build(`tree${variant}`);
}

export function buildRockModel(scene: Scene, variant: number, rock: Col): Mesh {
  const b = new ModelBuilder(scene);
  if (variant === 0) {
    b.ico(1.2, 0, 0.5, 0, rock, 1.2, 0.8, 1, { ry: 0.4 });
    b.ico(0.7, 0.9, 0.3, 0.5, scaleCol(rock, 0.85), 1, 0.7, 1.2);
  } else if (variant === 1) {
    b.ico(1.0, 0, 0.9, 0, scaleCol(rock, 1.1), 0.9, 1.5, 0.9, { rz: 0.2 });
    b.ico(0.8, -0.7, 0.4, 0.3, rock, 1.1, 0.8, 1);
    b.ico(0.5, 0.6, 0.25, -0.6, scaleCol(rock, 0.8));
  } else {
    b.ico(1.3, 0, 0.4, 0, scaleCol(rock, 0.92), 1.4, 0.6, 1.1, { ry: 1.1 });
  }
  return b.build(`rock${variant}`);
}

export function buildBushModel(scene: Scene, leaf: Col): Mesh {
  const b = new ModelBuilder(scene);
  b.ico(0.6, 0, 0.3, 0, leaf, 1.1, 0.7, 1);
  b.ico(0.42, 0.5, 0.25, 0.2, scaleCol(leaf, 1.15), 1, 0.8, 1);
  b.ico(0.36, -0.4, 0.2, -0.3, scaleCol(leaf, 0.85));
  return b.build('bush');
}
