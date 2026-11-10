import type { AudioManager } from './audio/audio';
import { TEAM_ENEMY, TEAM_PLAYER } from './core/config';
import type { GameConfig } from './core/config';
import { dist } from './core/math';
import type { Settings } from './core/settings';
import { BUILDING_DEFS } from './data/buildings';
import { HERO_DEFS } from './data/heroes';
import { UNIT_DEFS } from './data/units';
import { Input } from './input/input';
import { portraitUrls, preloadPortraits } from './render/icons';
import { loadModelPack } from './render/modelpack';
import { Overlay } from './render/overlay';
import { Renderer } from './render/renderer';
import type { Hooks, NoticeKind, Rgb } from './sim/hooks';
import { World } from './sim/world';
import { Hud } from './ui/hud';
import type { Screens } from './ui/menus';

export interface GameCallbacks {
  onRestart(): void;
  onQuit(): void;
}

/** One running match: wires the simulation to rendering, input, HUD and audio. */
export class Game {
  readonly world: World;
  renderer!: Renderer;
  input!: Input;
  hud!: Hud;
  overlay!: Overlay;
  icons: Record<string, string> = {};
  paused = false;
  /** Simulation speed multiplier (debug / tests). */
  timeScale = 1;
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private endShown = false;
  private endTimer = 0;
  private disposed = false;
  private started = false;
  // music director input: damage dealt by either side over the last half second
  private combatT = 0;
  private combatDmg = -1;
  private fundsStalled = false;
  private fundsWarnAt = -1e9;
  private onResize = () => {
    this.renderer.resize();
    this.overlay.resize();
  };
  /** Static definitions, exposed for the debug console and automated tests. */
  readonly defs = { buildings: BUILDING_DEFS, units: UNIT_DEFS, heroes: HERO_DEFS };
  /** Per-frame errors caught by the loop (surfaced for automated tests). */
  errors: string[] = [];
  frames = 0;

  constructor(
    parent: HTMLElement,
    readonly config: GameConfig,
    readonly settings: Settings,
    readonly audio: AudioManager,
    private screens: Screens,
    private cb: GameCallbacks,
  ) {
    this.world = new World(config);
    this.root = document.createElement('div');
    this.root.className = 'game';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view';
    this.canvas.tabIndex = 0;
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'overlay';
    this.root.append(this.canvas, this.overlayCanvas);
    parent.insertBefore(this.root, parent.firstChild);
  }

  async init(onProgress: (text: string, f: number) => void): Promise<void> {
    onProgress('Unpacking the armoury…', 0.05);
    const pack = await loadModelPack();
    if (this.disposed) return;
    onProgress('Generating battlefield…', 0.15);
    await nextFrame();
    this.renderer = new Renderer(this.canvas, this.world, this.config.theme, pack);
    this.renderer.setQuality(this.settings.shadows, this.settings.bloom);
    this.overlay = new Overlay(this.overlayCanvas);
    onProgress('Assembling war machines…', 0.3);
    await nextFrame();
    const unitModels = [...Object.values(UNIT_DEFS).map((d) => d.model), ...Object.values(HERO_DEFS).map((h) => h.unit.model)];
    this.renderer.warmup(unitModels, Object.values(BUILDING_DEFS).filter((d) => d.category !== 'neutral').map((d) => d.model));
    this.renderer.centerOnStart();

    this.renderer.engine.runRenderLoop(() => this.frame());
    onProgress('Briefing the commander…', 0.7);
    this.icons = portraitUrls();
    await preloadPortraits(this.icons);
    if (this.disposed) return;

    this.input = new Input(
      {
        world: this.world,
        renderer: this.renderer,
        audio: this.audio,
        notify: (t, k) => this.hud.notify(t, k),
        togglePause: () => this.togglePause(),
        toggleHelp: () => this.toggleHelp(),
        isBlocked: () => this.paused || this.screens.open,
        edgeScroll: () => this.settings.edgeScroll,
      },
      this.canvas,
    );
    this.hud = new Hud(
      {
        world: this.world,
        input: this.input,
        renderer: this.renderer,
        audio: this.audio,
        icons: this.icons,
        togglePause: () => this.togglePause(),
        toggleHelp: () => this.toggleHelp(),
      },
      this.root,
    );
    this.world.hooks = this.makeHooks();
    window.addEventListener('resize', this.onResize);
    this.onResize();
    onProgress('Ready', 1);
  }

  start(): void {
    this.started = true;
    this.applySettings();
    this.audio.setTheme(this.config.theme);
    this.audio.startMusic('game');
    const p = this.world.players[TEAM_PLAYER];
    this.hud.notify(`${p.heroDef.name} reporting. Build a Fusion Reactor, then a Refinery.`, 'info');
    window.setTimeout(() => {
      if (!this.disposed) this.hud.notify('Tip: press / for controls. Capture Extractors with infantry for bonus income.', 'info');
    }, 9000);
    this.audio.say('Battle control online');
  }

  applySettings(): void {
    this.audio.settings.sfx = this.settings.sfx;
    this.audio.settings.music = this.settings.music;
    this.audio.settings.voice = this.settings.voice;
    this.audio.applySettings();
    this.renderer.setQuality(this.settings.shadows, this.settings.bloom);
  }

  // ------------------------------------------------------------------ flow
  togglePause(): void {
    if (this.screens.helpOpen) {
      this.screens.closeHelp();
      return;
    }
    if (this.endShown && this.screens.open) return;
    if (this.paused) {
      this.paused = false;
      this.screens.hide();
      return;
    }
    this.paused = true;
    this.input.cancelModes();
    this.screens.pause(this.settings, {
      onResume: () => this.togglePause(),
      onRestart: () => this.cb.onRestart(),
      onQuit: () => this.cb.onQuit(),
      onSettings: () => this.applySettings(),
    });
  }

  /** The field manual freezes the battle while it is open. */
  toggleHelp(): void {
    this.screens.help();
  }

  private showEnd(): void {
    const w = this.world;
    if (!w.result || this.endShown) return;
    this.endShown = true;
    this.input.cancelModes();
    this.audio.endMatch(w.result);
    this.audio.say(w.result === 'victory' ? 'Mission accomplished' : 'Mission failed');
    this.screens.end(w.result, w.time, w.players[TEAM_PLAYER].stats, w.players[TEAM_ENEMY].stats, {
      onRestart: () => this.cb.onRestart(),
      onQuit: () => this.cb.onQuit(),
      onContinue: () => this.screens.hide(),
    });
  }

  // ------------------------------------------------------------------ frame
  private frame(): void {
    if (this.disposed) return;
    try {
      const raw = Math.min(0.05, this.renderer.engine.getDeltaTime() / 1000);
      const frozen = this.paused || !this.started || this.screens.helpOpen;
      const dt = frozen ? 0 : raw;
      if (dt > 0) {
        const steps = Math.max(1, Math.round(this.timeScale));
        for (let i = 0; i < steps; i++) this.world.update(dt * (this.timeScale < 1 ? this.timeScale : 1));
      }
      if (this.started) {
        this.input.update(raw);
        const cam = this.renderer.cam;
        this.audio.lx = cam.focusX;
        this.audio.lz = cam.focusZ;
        this.audio.lyaw = cam.yaw;
        this.audio.lrange = 60 + cam.dist * 0.9;
        if (dt > 0) this.measureCombat(dt);
        this.renderer.render(dt, this.input.view());
        this.overlay.draw(this.world, cam, this.input.selectedSet, this.input.drag, dt);
        this.hud.update(raw);
        this.canvas.style.cursor = this.input.cursor();
        if (this.world.result && !this.endShown) {
          this.endTimer += raw;
          if (this.endTimer > 1.8) this.showEnd();
        }
      } else {
        this.renderer.render(0, { selection: [], ghost: null, reticle: null });
      }
      this.frames++;
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      if (this.errors.length < 20) this.errors.push(msg);
      console.error('[frame]', err);
    }
  }

  /**
   * Feed the music director twice a second: recent damage dealt by either side (the player
   * is involved in every fight) and how many enemy units are in sight. Also warns once when
   * production stalls for lack of credits.
   */
  private measureCombat(dt: number): void {
    this.combatT += dt;
    if (this.combatT < 0.5) return;
    const w = this.world;
    const me = w.players[TEAM_PLAYER];
    const dmg = me.stats.damageDealt + w.players[TEAM_ENEMY].stats.damageDealt;
    const rate = this.combatDmg < 0 ? 0 : (dmg - this.combatDmg) / this.combatT;
    this.combatDmg = dmg;
    this.combatT = 0;
    let threat = 0;
    for (const u of w.units) if (u.alive && u.team === TEAM_ENEMY && u.visible) threat++;
    this.audio.setCombat(1 - Math.exp(-rate / 220), Math.min(1, threat / 8));
    const stalled = Object.values(me.queues).some((q) => q.stalled === 'funds');
    if (stalled && !this.fundsStalled && w.time - this.fundsWarnAt > 20) {
      this.fundsWarnAt = w.time;
      this.audio.play('no_funds');
      this.audio.say('Insufficient funds');
    }
    this.fundsStalled = stalled;
  }

  // ------------------------------------------------------------------ sim → presentation
  private makeHooks(): Hooks {
    const fx = this.renderer.fx;
    const fog = this.world.fog;
    const cam = this.renderer.cam;
    const seen = (x: number, z: number) => fog.isVisible(x, z);
    return {
      sound: (id, x, z, vol, team) => {
        if (x !== undefined && z !== undefined && !seen(x, z)) return;
        this.audio.play(id, x, z, vol, { own: team === TEAM_PLAYER });
      },
      voice: (line) => this.audio.say(line),
      notify: (text: string, kind: NoticeKind, x?: number, z?: number) => this.hud.notify(text, kind, x, z),
      ping: (x, z, color) => this.hud.ping(x, z, color),
      muzzle: (x, y, z, yaw, scale) => {
        if (seen(x, z)) fx.muzzle(x, y, z, yaw, scale);
      },
      tracer: (x0, y0, z0, x1, y1, z1, heavy) => {
        if (seen(x0, z0) || seen(x1, z1)) fx.tracer(x0, y0, z0, x1, y1, z1, heavy);
      },
      impact: (x, y, z, scale) => {
        if (seen(x, z)) fx.impact(x, y, z, scale);
      },
      explosion: (x, y, z, size, energy) => {
        if (seen(x, z)) fx.explosion(x, y, z, size, energy);
      },
      lightning: (x0, y0, z0, x1, y1, z1, color: Rgb) => {
        if (seen(x0, z0) || seen(x1, z1)) fx.lightning(x0, y0, z0, x1, y1, z1, color);
      },
      beam: (x, z, radius) => fx.beam(x, z, radius),
      ring: (x, z, radius, color, duration) => {
        if (seen(x, z)) fx.ring(x, z, radius, color, duration);
      },
      zone: (x, z, radius, color, duration) => {
        if (seen(x, z)) fx.zone(x, z, radius, color, duration);
      },
      smoke: (x, y, z, size) => {
        if (seen(x, z)) fx.smoke(x, y, z, size);
      },
      sparkle: (x, y, z, color, count) => {
        if (seen(x, z)) fx.sparkle(x, y, z, color, count);
      },
      text: (x, y, z, str, color) => {
        if (seen(x, z)) this.overlay.addText(x, y, z, str, color);
      },
      shake: (x, z, amount) => {
        const d = dist(x, z, cam.focusX, cam.focusZ);
        const range = 50 + cam.dist * 0.6;
        if (d < range && seen(x, z)) fx.shake(amount * (1 - d / range));
      },
      scorch: (x, z, size) => fx.scorch(x, z, size),
      wreck: (info) => {
        if (seen(info.x, info.z)) this.renderer.addWreck(info);
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.audio.stopMusic();
    this.renderer?.engine.stopRenderLoop();
    this.input?.dispose();
    this.hud?.dispose();
    this.renderer?.dispose();
    this.root.remove();
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
