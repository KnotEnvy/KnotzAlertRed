import './style.css';
import { AudioManager } from './audio/audio';
import type { Difficulty, GameConfig, ThemeId } from './core/config';
import { loadSettings } from './core/settings';
import { HERO_DEFS } from './data/heroes';
import { Game } from './game';
import { Screens } from './ui/menus';

const app = document.getElementById('app') as HTMLElement;
const settings = loadSettings();
const audio = new AudioManager();
audio.settings.sfx = settings.sfx;
audio.settings.music = settings.music;
audio.settings.voice = settings.voice;
const screens = new Screens(app, audio);
let game: Game | null = null;

declare global {
  interface Window {
    /** Debug / automation handle to the running match. */
    __game: Game | null;
    __startGame: (cfg: Partial<GameConfig>) => Promise<void>;
  }
}
window.__game = null;

function showMenu(): void {
  game?.dispose();
  game = null;
  window.__game = null;
  screens.mainMenu(settings, (cfg) => void start(cfg), () => audio.unlock());
}

async function start(cfg: GameConfig): Promise<void> {
  game?.dispose();
  game = null;
  window.__game = null;
  screens.loading('Preparing…', 0, cfg);
  try {
    const g = new Game(app, cfg, settings, audio, screens, {
      onRestart: () => void start({ ...cfg, seed: Math.floor(Math.random() * 1e9) }),
      onQuit: () => showMenu(),
    });
    game = g;
    await g.init((text, f) => screens.loading(text, f));
    if (game !== g) return; // superseded while loading
    screens.hide();
    g.start();
    window.__game = g;
  } catch (err) {
    console.error('Failed to start the match', err);
    game?.dispose();
    game = null;
    screens.hide();
    const box = document.createElement('div');
    box.className = 'fatal panel';
    box.innerHTML = `<div class="fatal-ico">!</div><h2>Unable to start</h2><p>This game needs a browser with WebGL 2 enabled.</p><code></code>`;
    (box.querySelector('code') as HTMLElement).textContent = String(err instanceof Error ? err.message : err);
    const back = document.createElement('button');
    back.className = 'btn primary';
    back.textContent = 'Back to menu';
    back.addEventListener('click', () => {
      box.remove();
      showMenu();
    });
    box.appendChild(back);
    app.appendChild(box);
  }
}

window.__startGame = (cfg) =>
  start({
    hero: cfg.hero && HERO_DEFS[cfg.hero] ? cfg.hero : 'rook',
    difficulty: cfg.difficulty ?? 'normal',
    theme: cfg.theme ?? 'verdant',
    seed: cfg.seed ?? 1337,
  });

// `?autostart=1&hero=nyx&difficulty=easy&theme=frost&seed=42` skips the menu (used by the smoke test).
const params = new URLSearchParams(location.search);
if (params.get('autostart')) {
  void window.__startGame({
    hero: params.get('hero') ?? undefined,
    difficulty: (params.get('difficulty') as Difficulty | null) ?? undefined,
    theme: (params.get('theme') as ThemeId | null) ?? undefined,
    seed: params.get('seed') ? Number(params.get('seed')) : undefined,
  });
} else {
  showMenu();
}
