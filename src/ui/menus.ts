import type { Difficulty, GameConfig, ThemeId } from '../core/config';
import { TEAM_COLORS } from '../core/config';
import { formatTime } from '../core/math';
import type { Settings } from '../core/settings';
import { saveSettings } from '../core/settings';
import { HERO_DEFS, HERO_ORDER } from '../data/heroes';
import type { PlayerStats } from '../sim/player';
import { glyph } from './glyphs';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const DIFFICULTIES: { id: Difficulty; name: string; blurb: string }[] = [
  { id: 'easy', name: 'Recruit', blurb: 'Slow, small attack waves. Learn the ropes.' },
  { id: 'normal', name: 'Commander', blurb: 'A fair fight with escalating assaults.' },
  { id: 'hard', name: 'Warlord', blurb: 'Rich, fast and relentless. Expect orbital strikes.' },
];

const THEMES: { id: ThemeId; name: string; blurb: string }[] = [
  { id: 'verdant', name: 'Verdant Basin', blurb: 'Temperate valleys and pine forests.' },
  { id: 'scorched', name: 'Scorched Dunes', blurb: 'Sun-baked canyons and red rock.' },
  { id: 'frost', name: 'Frostline', blurb: 'Snowfields under a pale sky.' },
];

const CONTROLS_HTML = `
<div class="help-cols">
  <div>
    <h3>Selection &amp; orders</h3>
    <table>
      <tr><td><kbd>Left-click</kbd> / drag</td><td>Select a unit / box-select</td></tr>
      <tr><td><kbd>Double-click</kbd></td><td>Select all of that type on screen</td></tr>
      <tr><td><kbd>Shift</kbd> + click</td><td>Add / remove from selection</td></tr>
      <tr><td><kbd>Right-click</kbd></td><td>Move · attack · harvest · set rally point</td></tr>
      <tr><td><kbd>Shift</kbd> + right-click</td><td>Queue waypoints</td></tr>
      <tr><td><kbd>A</kbd> then click</td><td>Attack-move (or <kbd>Ctrl</kbd> + right-click)</td></tr>
      <tr><td><kbd>S</kbd> / <kbd>H</kbd></td><td>Stop / hold position</td></tr>
      <tr><td><kbd>Ctrl</kbd> + <kbd>1</kbd>–<kbd>9</kbd></td><td>Assign control group</td></tr>
      <tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>Recall group (double-tap to jump)</td></tr>
      <tr><td><kbd>F2</kbd></td><td>Select the whole army</td></tr>
    </table>
    <h3>Hero &amp; powers</h3>
    <table>
      <tr><td><kbd>F1</kbd></td><td>Select hero (double-tap to jump)</td></tr>
      <tr><td><kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd></td><td>Hero abilities (E unlocks at level 3)</td></tr>
      <tr><td>★ buttons</td><td>Support powers bought with Requisition</td></tr>
    </table>
  </div>
  <div>
    <h3>Camera</h3>
    <table>
      <tr><td>Arrow keys / screen edge</td><td>Pan</td></tr>
      <tr><td>Mouse wheel</td><td>Zoom</td></tr>
      <tr><td>Middle-drag or <kbd>[</kbd> <kbd>]</kbd></td><td>Rotate (<kbd>Backspace</kbd> resets)</td></tr>
      <tr><td><kbd>Space</kbd></td><td>Jump to the last alert</td></tr>
      <tr><td><kbd>B</kbd></td><td>Jump to your Command Center</td></tr>
      <tr><td>Minimap</td><td>Left-click to look, right-click to move</td></tr>
      <tr><td><kbd>Esc</kbd> / <kbd>P</kbd></td><td>Cancel · menu / pause</td></tr>
    </table>
    <h3>How to win</h3>
    <ul>
      <li>Build a <b>Fusion Reactor</b>, then a <b>Refinery</b> — Harvesters turn Aurium crystals into credits.</li>
      <li>Click a structure in the sidebar to build it; when it says <b>READY</b>, click it again and place it near your base.</li>
      <li><b>Barracks</b> and <b>War Factory</b> train your army. The <b>Tech Lab</b> unlocks Titans, Artillery and upgrades.</li>
      <li>Park infantry beside neutral <b>Extractors</b> and the <b>Signal Obelisk</b> to capture them.</li>
      <li>Counter smartly: bullets shred infantry, shells and rockets crack armour, explosives level buildings.</li>
      <li>Units earn veterancy from kills; your hero levels up and revives at the Command Center.</li>
      <li>Destroy every enemy structure to win.</li>
    </ul>
  </div>
</div>`;

/** Full-screen menus layered above the game: main menu, loading, pause, help, results. */
export class Screens {
  private root: HTMLElement;
  private helpEl: HTMLElement | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'screens');
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return this.root.childElementCount > 0;
  }

  hide(): void {
    this.root.innerHTML = '';
    this.helpEl = null;
    this.root.classList.remove('blocking');
  }

  private show(node: HTMLElement): void {
    this.hide();
    this.root.appendChild(node);
    this.root.classList.add('blocking');
  }

  // ------------------------------------------------------------------ main menu
  mainMenu(settings: Settings, onStart: (cfg: GameConfig) => void, onInteract: () => void): void {
    const menu = el('div', 'menu');
    const art = el('div', 'menu-art');
    const img = new Image();
    img.onload = () => {
      art.style.backgroundImage = `url(${img.src})`;
      art.classList.add('loaded');
    };
    img.src = `${import.meta.env.BASE_URL}art/keyart.webp`;
    menu.appendChild(art);
    menu.appendChild(el('div', 'menu-shade'));

    const left = el('div', 'menu-left');
    left.innerHTML = `
      <div class="logo"><span>KNOTZ</span><h1>ALERT<b>RED</b></h1></div>
      <p class="tagline">Command a base. Lead a hero. Break the Crimson line.</p>
      <ul class="pitch">
        <li><b>Fast base-building</b> — sidebar construction, power grids and Aurium harvesting.</li>
        <li><b>Armoured warfare</b> — tanks, artillery, gunships and veterancy.</li>
        <li><b>Hero commanders</b> — three kits, levelling, ultimates and battlefield support powers.</li>
      </ul>`;
    menu.appendChild(left);

    const panel = el('div', 'menu-panel panel');
    panel.appendChild(el('h2', '', 'Skirmish Setup'));

    let hero = HERO_DEFS[settings.lastHero] ? settings.lastHero : 'rook';
    let difficulty = (DIFFICULTIES.find((d) => d.id === settings.lastDifficulty)?.id ?? 'normal') as Difficulty;
    let theme = (THEMES.find((t) => t.id === settings.lastTheme)?.id ?? 'verdant') as ThemeId;

    panel.appendChild(el('h3', '', 'Choose your commander'));
    const heroRow = el('div', 'hero-cards');
    const heroCards: HTMLButtonElement[] = [];
    for (const id of HERO_ORDER) {
      const h = HERO_DEFS[id];
      const c = el('button', 'hero-card');
      c.dataset.testid = `hero-${id}`;
      c.style.setProperty('--accent', h.accent);
      c.innerHTML = `
        <div class="hc-head"><span class="hc-glyph">${glyph(h.abilities[0].id, h.abilities[0].glyph)}</span><div><b>${h.name}</b><i>${h.title}</i></div></div>
        <p>${h.lore}</p>
        <ul>${h.abilities.map((a) => `<li><kbd>${a.key}</kbd><span><b>${a.name}</b> ${a.desc.replace('ULTIMATE · ', '<em>Ultimate.</em> ')}</span></li>`).join('')}</ul>`;
      c.addEventListener('click', () => {
        onInteract();
        hero = id;
        heroCards.forEach((o) => o.classList.toggle('active', o === c));
      });
      c.classList.toggle('active', id === hero);
      heroCards.push(c);
      heroRow.appendChild(c);
    }
    panel.appendChild(heroRow);

    const opts = el('div', 'menu-opts');
    const choice = <T extends string>(title: string, items: { id: T; name: string; blurb: string }[], get: () => T, set: (v: T) => void, prefix: string) => {
      const box = el('div', 'opt');
      box.appendChild(el('h3', '', title));
      const row = el('div', 'opt-row');
      const blurb = el('p', 'opt-blurb');
      const btns: HTMLButtonElement[] = [];
      const sync = () => {
        btns.forEach((b, i) => b.classList.toggle('active', items[i].id === get()));
        blurb.textContent = items.find((i) => i.id === get())?.blurb ?? '';
      };
      for (const it of items) {
        const b = el('button', 'opt-btn', it.name);
        b.dataset.testid = `${prefix}-${it.id}`;
        b.addEventListener('click', () => {
          onInteract();
          set(it.id);
          sync();
        });
        btns.push(b);
        row.appendChild(b);
      }
      box.append(row, blurb);
      sync();
      return box;
    };
    opts.appendChild(choice('Enemy AI', DIFFICULTIES, () => difficulty, (v) => (difficulty = v), 'difficulty'));
    opts.appendChild(choice('Battlefield', THEMES, () => theme, (v) => (theme = v), 'theme'));
    panel.appendChild(opts);

    const actions = el('div', 'menu-actions');
    const go = el('button', 'btn primary big', 'DEPLOY');
    go.dataset.testid = 'btn-start';
    go.addEventListener('click', () => {
      onInteract();
      settings.lastHero = hero;
      settings.lastDifficulty = difficulty;
      settings.lastTheme = theme;
      saveSettings(settings);
      onStart({ hero, difficulty, theme, seed: Math.floor(Math.random() * 1e9) });
    });
    const how = el('button', 'btn', 'How to play');
    how.dataset.testid = 'btn-howto';
    how.addEventListener('click', () => {
      onInteract();
      this.help();
    });
    actions.append(how, go);
    panel.appendChild(actions);
    menu.appendChild(panel);
    menu.appendChild(el('div', 'menu-foot', `You command the <b style="color:${TEAM_COLORS[0].hex}">${TEAM_COLORS[0].name}</b> against the <b style="color:${TEAM_COLORS[1].hex}">${TEAM_COLORS[1].name}</b>.`));
    this.show(menu);
  }

  // ------------------------------------------------------------------ loading
  loading(text: string, progress: number): void {
    let box = this.root.querySelector('.loading') as HTMLElement | null;
    if (!box) {
      box = el('div', 'loading', '<div class="logo small"><span>KNOTZ</span><h1>ALERT<b>RED</b></h1></div><p class="load-text"></p><div class="load-bar"><i></i></div>');
      this.show(box);
    }
    (box.querySelector('.load-text') as HTMLElement).textContent = text;
    (box.querySelector('.load-bar i') as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
  }

  // ------------------------------------------------------------------ help
  help(): void {
    if (this.helpEl) {
      this.closeHelp();
      return;
    }
    const wrap = el('div', 'modal-wrap help-wrap');
    const box = el('div', 'modal panel help');
    box.innerHTML = `<h2>Field Manual</h2>${CONTROLS_HTML}`;
    const close = el('button', 'btn primary', 'Got it');
    close.dataset.testid = 'btn-help-close';
    close.addEventListener('click', () => this.closeHelp());
    box.appendChild(close);
    wrap.appendChild(box);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) this.closeHelp();
    });
    this.root.appendChild(wrap);
    this.root.classList.add('blocking');
    this.helpEl = wrap;
  }

  closeHelp(): void {
    this.helpEl?.remove();
    this.helpEl = null;
    if (!this.root.childElementCount) this.root.classList.remove('blocking');
  }

  get helpOpen(): boolean {
    return this.helpEl !== null;
  }

  // ------------------------------------------------------------------ pause
  pause(settings: Settings, cb: { onResume(): void; onRestart(): void; onQuit(): void; onSettings(): void }): void {
    const wrap = el('div', 'modal-wrap');
    const box = el('div', 'modal panel pause');
    box.appendChild(el('h2', '', 'Paused'));
    const btn = (label: string, cls: string, id: string, fn: () => void) => {
      const b = el('button', `btn ${cls}`, label);
      b.dataset.testid = id;
      b.addEventListener('click', fn);
      return b;
    };
    box.appendChild(btn('Resume', 'primary', 'btn-resume', cb.onResume));

    const set = el('div', 'settings');
    const slider = (label: string, key: 'sfx' | 'music') => {
      const row = el('label', 'set-row', `<span>${label}</span>`);
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(settings[key]);
      input.dataset.testid = `set-${key}`;
      input.addEventListener('input', () => {
        settings[key] = Number(input.value);
        saveSettings(settings);
        cb.onSettings();
      });
      row.appendChild(input);
      return row;
    };
    const toggle = (label: string, key: 'voice' | 'shadows' | 'bloom' | 'edgeScroll') => {
      const row = el('label', 'set-row', `<span>${label}</span>`);
      const input = el('input');
      input.type = 'checkbox';
      input.checked = settings[key];
      input.dataset.testid = `set-${key}`;
      input.addEventListener('change', () => {
        settings[key] = input.checked;
        saveSettings(settings);
        cb.onSettings();
      });
      row.appendChild(input);
      return row;
    };
    set.append(
      slider('Effects volume', 'sfx'), slider('Music volume', 'music'), toggle('Announcer voice', 'voice'),
      toggle('Shadows', 'shadows'), toggle('Bloom', 'bloom'), toggle('Edge scrolling', 'edgeScroll'),
    );
    box.appendChild(set);
    box.appendChild(btn('Controls &amp; tips', '', 'btn-controls', () => this.help()));
    box.appendChild(btn('Restart mission', '', 'btn-restart', cb.onRestart));
    box.appendChild(btn('Quit to main menu', 'danger', 'btn-quit', cb.onQuit));
    wrap.appendChild(box);
    this.show(wrap);
  }

  // ------------------------------------------------------------------ results
  end(result: 'victory' | 'defeat', time: number, mine: PlayerStats, theirs: PlayerStats, cb: { onRestart(): void; onQuit(): void; onContinue(): void }): void {
    const wrap = el('div', `modal-wrap end ${result}`);
    const box = el('div', 'modal panel');
    const row = (label: string, a: number, b: number) => `<tr><td>${label}</td><td>${Math.round(a).toLocaleString()}</td><td>${Math.round(b).toLocaleString()}</td></tr>`;
    box.innerHTML = `
      <h1 class="end-title">${result === 'victory' ? 'VICTORY' : 'DEFEAT'}</h1>
      <p class="end-sub">${result === 'victory' ? 'The Crimson Dominion has been driven from the field.' : 'Your base has fallen. The Coalition will remember this day.'}</p>
      <p class="dim">Mission time ${formatTime(time)}</p>
      <table class="stats">
        <tr><th></th><th style="color:${TEAM_COLORS[0].hex}">You</th><th style="color:${TEAM_COLORS[1].hex}">Enemy</th></tr>
        ${row('Units built', mine.unitsBuilt, theirs.unitsBuilt)}
        ${row('Units destroyed', mine.unitsKilled, theirs.unitsKilled)}
        ${row('Units lost', mine.unitsLost, theirs.unitsLost)}
        ${row('Structures built', mine.buildingsBuilt, theirs.buildingsBuilt)}
        ${row('Structures razed', mine.buildingsRazed, theirs.buildingsRazed)}
        ${row('Aurium harvested', mine.harvested, theirs.harvested)}
        ${row('Damage dealt', mine.damageDealt, theirs.damageDealt)}
      </table>`;
    const actions = el('div', 'menu-actions');
    const again = el('button', 'btn primary', 'Play again');
    again.dataset.testid = 'btn-again';
    again.addEventListener('click', cb.onRestart);
    const view = el('button', 'btn', 'View battlefield');
    view.dataset.testid = 'btn-view';
    view.addEventListener('click', cb.onContinue);
    const quit = el('button', 'btn', 'Main menu');
    quit.dataset.testid = 'btn-mainmenu';
    quit.addEventListener('click', cb.onQuit);
    actions.append(quit, view, again);
    box.appendChild(actions);
    wrap.appendChild(box);
    this.show(wrap);
  }
}
