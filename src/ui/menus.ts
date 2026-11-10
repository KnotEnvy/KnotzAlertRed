import type { AudioManager } from '../audio/audio';
import type { Difficulty, GameConfig, ThemeId } from '../core/config';
import { formatTime } from '../core/math';
import type { Settings } from '../core/settings';
import { saveSettings } from '../core/settings';
import { HERO_DEFS, HERO_ORDER } from '../data/heroes';
import type { HeroDef } from '../data/types';
import type { PlayerStats } from '../sim/player';
import { DIFFICULTIES, THEMES, TIPS, difficultyName, themeName } from './content';
import { art, countUp, el, pulse } from './dom';
import { installCursorVars } from './cursors';
import { preloadFonts } from './fonts';
import { emblem, glyph } from './glyphs';

const MANUAL_HTML = `
<div class="help-grid">
  <section>
    <h3>${glyph('tab_infantry')}Selection &amp; orders</h3>
    <table>
      <tr><td><kbd class="mb">L</kbd> click / drag</td><td>Select a unit / box-select</td></tr>
      <tr><td>Double-click</td><td>Select all of that type on screen</td></tr>
      <tr><td><kbd>Shift</kbd> + click</td><td>Add / remove from selection</td></tr>
      <tr><td><kbd class="mb">R</kbd> click</td><td>Move · attack · harvest · set rally point</td></tr>
      <tr><td><kbd>Shift</kbd> + <kbd class="mb">R</kbd></td><td>Queue waypoints</td></tr>
      <tr><td><kbd>A</kbd> then click</td><td>Attack-move (or <kbd>Ctrl</kbd> + <kbd class="mb">R</kbd>)</td></tr>
      <tr><td><kbd>S</kbd> / <kbd>H</kbd></td><td>Stop / hold position</td></tr>
      <tr><td><kbd>Ctrl</kbd> + <kbd>1</kbd>–<kbd>9</kbd></td><td>Assign control group</td></tr>
      <tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>Recall group (double-tap to jump)</td></tr>
      <tr><td><kbd>F2</kbd></td><td>Select the whole army</td></tr>
    </table>
  </section>
  <section>
    <h3>${glyph('eye')}Camera</h3>
    <table>
      <tr><td>Arrows / screen edge</td><td>Pan</td></tr>
      <tr><td>Mouse wheel</td><td>Zoom</td></tr>
      <tr><td>Middle-drag, <kbd>[</kbd> <kbd>]</kbd></td><td>Rotate (<kbd>Backspace</kbd> resets)</td></tr>
      <tr><td><kbd>Space</kbd></td><td>Jump to the last alert</td></tr>
      <tr><td><kbd>B</kbd></td><td>Jump to your Command Center</td></tr>
      <tr><td>Minimap</td><td><kbd class="mb">L</kbd> look · <kbd class="mb">R</kbd> move</td></tr>
      <tr><td><kbd>Esc</kbd> / <kbd>P</kbd></td><td>Cancel · pause menu</td></tr>
    </table>
    <h3>${glyph('star')}Hero &amp; powers</h3>
    <table>
      <tr><td><kbd>F1</kbd></td><td>Select hero (double-tap to jump)</td></tr>
      <tr><td><kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd></td><td>Hero abilities — <kbd>E</kbd> unlocks at level 3</td></tr>
      <tr><td>Support rack</td><td>Powers bought with Requisition ★</td></tr>
    </table>
  </section>
  <section>
    <h3>${glyph('trophy')}How to win</h3>
    <ol class="steps">
      <li><b>Power up.</b> Build a Fusion Reactor, then a Refinery — its Harvester turns Aurium into credits.</li>
      <li><b>Build, then place.</b> Click a structure in the sidebar; when it reads READY, click again and choose a site.</li>
      <li><b>Raise an army.</b> Barracks and War Factory train units; the Tech Lab unlocks Titans, Artillery and upgrades.</li>
      <li><b>Hold ground.</b> Park infantry at Extractors and the Signal Obelisk to capture them.</li>
      <li><b>Break them.</b> Destroy every enemy structure.</li>
    </ol>
    <h3>${glyph('target')}Counters</h3>
    <div class="counters">
      <span><b>Bullets</b> shred infantry</span>
      <span><b>Shells · rockets</b> crack armour</span>
      <span><b>Explosives</b> level buildings</span>
      <span><b>Veterans</b> hit harder, self-repair</span>
    </div>
  </section>
</div>`;

type HoverRoot = HTMLElement & { __hover?: Element | null };

/** Full-screen menus layered above the game: main menu, loading, pause, help, results. */
export class Screens {
  private root: HTMLElement;
  private fade: HTMLElement;
  private helpEl: HTMLElement | null = null;
  private settingsEl: HTMLElement | null = null;
  private cfg: GameConfig | null = null;
  private tipTimer = 0;

  constructor(
    parent: HTMLElement,
    private audio: AudioManager | null = null,
  ) {
    preloadFonts();
    installCursorVars();
    this.root = el('div', 'screens');
    this.fade = el('div', 'screens-fade');
    parent.append(this.root, this.fade);
    // one hover blip per control the pointer enters
    const r = this.root as HoverRoot;
    r.addEventListener('mouseover', (e) => {
      const b = (e.target as Element).closest('button, .slider');
      if (b && b !== r.__hover && !(b as HTMLButtonElement).disabled) this.sfx('ui_hover');
      r.__hover = b;
    });
  }

  private sfx(id: string): void {
    this.audio?.play(id);
  }

  get open(): boolean {
    return this.root.childElementCount > 0;
  }

  hide(): void {
    window.clearInterval(this.tipTimer);
    // let the loading screen dissolve into the battlefield without blocking input
    const loading = this.root.querySelector('.loading');
    if (loading) {
      this.fade.appendChild(loading);
      loading.classList.add('out');
      window.setTimeout(() => loading.remove(), 700);
    }
    this.root.innerHTML = '';
    this.helpEl = null;
    this.settingsEl = null;
    this.root.classList.remove('blocking');
  }

  private show(node: HTMLElement): void {
    this.hide();
    this.root.appendChild(node);
    this.root.classList.add('blocking');
  }

  private button(label: string, cls: string, testid: string, icon = ''): HTMLButtonElement {
    const b = el('button', `btn ${cls}`, `${icon ? glyph(icon) : ''}<span>${label}</span>`);
    if (testid) b.dataset.testid = testid;
    return b;
  }

  // ------------------------------------------------------------------ main menu
  mainMenu(settings: Settings, onStart: (cfg: GameConfig) => void, onInteract: () => void): void {
    const menu = el('div', 'menu');
    const artEl = el('div', 'menu-art');
    const img = new Image();
    img.onload = () => {
      artEl.style.backgroundImage = `url(${img.src})`;
      artEl.classList.add('loaded');
    };
    img.src = art('keyart.webp');
    menu.appendChild(artEl);
    menu.appendChild(el('div', 'menu-shade'));
    const motes = el('div', 'motes');
    for (let i = 0; i < 18; i++) {
      const m = el('i');
      m.style.setProperty('--x', `${(i * 37) % 100}%`);
      m.style.setProperty('--d', `${9 + ((i * 7) % 9)}s`);
      m.style.setProperty('--delay', `${-((i * 1.7) % 12)}s`);
      m.style.setProperty('--s', `${2 + (i % 3)}px`);
      motes.appendChild(m);
    }
    menu.appendChild(motes);

    let hero = HERO_DEFS[settings.lastHero] ? settings.lastHero : 'rook';
    let difficulty = (DIFFICULTIES.find((d) => d.id === settings.lastDifficulty)?.id ?? 'normal') as Difficulty;
    let theme = (THEMES.find((t) => t.id === settings.lastTheme)?.id ?? 'verdant') as ThemeId;

    // ---- top: logo + links
    const top = el('div', 'menu-top');
    top.appendChild(
      el(
        'div',
        'logo-lockup',
        `${emblem('logo-emblem')}<div class="logo"><span class="logo-kicker">KNOTZ</span><h1><span class="lw-alert">ALERT</span> <span class="lw-red">RED</span></h1><p class="tagline">Command a base. Lead a hero. Break the Crimson line.</p></div>`,
      ),
    );
    const links = el('div', 'menu-links');
    const how = this.button('Field manual', 'ghost', 'btn-howto', 'manual');
    how.addEventListener('click', () => {
      onInteract();
      this.sfx('ui_open');
      this.help();
    });
    const set = this.button('Settings', 'ghost', 'btn-settings', 'settings');
    set.addEventListener('click', () => {
      onInteract();
      this.sfx('ui_open');
      this.settingsModal(settings);
    });
    links.append(how, set);
    top.appendChild(links);
    menu.appendChild(top);

    // ---- dock
    const dock = el('div', 'menu-dock');

    // commanders
    const heroSec = el('section', 'dock-heroes');
    heroSec.appendChild(el('h3', 'sec-label', '<span>01</span>Commander'));
    const heroRow = el('div', 'hero-cards');
    const heroCards: HTMLButtonElement[] = [];
    const dossier = el('div', 'dossier');
    const renderDossier = (h: HeroDef) => {
      dossier.style.setProperty('--accent', h.accent);
      const u = h.unit;
      dossier.innerHTML = `
        <div class="ds-kicker">Commander profile</div>
        <h2>${h.name}</h2>
        <div class="ds-title">${h.title}</div>
        <p class="ds-lore">${h.lore}</p>
        <div class="ds-unit"><span>${u.role.replace('Hero · ', '')}</span><span>${u.hp} HP</span><span>${u.armor} armour</span><span>Range ${u.weapon?.range ?? 0}</span></div>
        <ul class="ds-kit">${h.abilities
          .map((a) => {
            const ult = a.desc.startsWith('ULTIMATE');
            return `<li style="--ab:${a.color}"><span class="ds-glyph">${glyph(a.id, a.glyph)}</span><div><b><kbd>${a.key}</kbd>${a.name}${ult ? '<em>Ultimate</em>' : ''}</b><span>${a.desc.replace('ULTIMATE · ', '')}</span></div></li>`;
          })
          .join('')}</ul>`;
      pulse(dossier, 'swap', 500);
    };
    for (const id of HERO_ORDER) {
      const h = HERO_DEFS[id];
      const c = el('button', 'hero-card');
      c.dataset.testid = `hero-${id}`;
      c.style.setProperty('--accent', h.accent);
      c.innerHTML = `<span class="hc-art" style="background-image:url(${art(`hero-${id}.webp`)})"></span><span class="hc-plate"><b>${h.name}</b><i>${h.title}</i></span><span class="hc-check">${glyph('check')}</span>`;
      c.addEventListener('click', () => {
        onInteract();
        if (hero !== id) this.sfx('ui_click');
        hero = id;
        heroCards.forEach((o) => o.classList.toggle('active', o === c));
        renderDossier(h);
        sync();
      });
      c.classList.toggle('active', id === hero);
      heroCards.push(c);
      heroRow.appendChild(c);
    }
    heroSec.appendChild(heroRow);
    dock.appendChild(heroSec);
    const dsSec = el('section', 'dock-dossier');
    dsSec.appendChild(dossier);
    dock.appendChild(dsSec);

    // battlefield + difficulty + deploy
    const setup = el('section', 'dock-setup');
    setup.appendChild(el('h3', 'sec-label', '<span>02</span>Battlefield'));
    const themeRow = el('div', 'theme-cards');
    const themeBtns: HTMLButtonElement[] = [];
    for (const t of THEMES) {
      const b = el('button', 'theme-card');
      b.dataset.testid = `theme-${t.id}`;
      b.innerHTML = `<span class="tc-art" style="background-image:url(${art(`theme-${t.id}.webp`)})"></span><span class="tc-name">${t.name}</span>`;
      b.title = t.blurb;
      b.addEventListener('click', () => {
        onInteract();
        if (theme !== t.id) this.sfx('ui_click');
        theme = t.id;
        sync();
      });
      themeBtns.push(b);
      themeRow.appendChild(b);
    }
    setup.appendChild(themeRow);
    setup.appendChild(el('h3', 'sec-label', '<span>03</span>Enemy AI'));
    const diffRow = el('div', 'diff-row');
    const diffBtns: HTMLButtonElement[] = [];
    for (const d of DIFFICULTIES) {
      const b = el('button', 'opt-btn diff', `<span class="lvl">${'<i></i>'.repeat(3)}</span><span>${d.name}</span>`);
      b.dataset.testid = `difficulty-${d.id}`;
      b.style.setProperty('--lvl', String(d.level));
      b.querySelectorAll('.lvl i').forEach((pip, k) => pip.classList.toggle('on', k < d.level));
      b.addEventListener('click', () => {
        onInteract();
        if (difficulty !== d.id) this.sfx('ui_click');
        difficulty = d.id;
        sync();
      });
      diffBtns.push(b);
      diffRow.appendChild(b);
    }
    setup.appendChild(diffRow);
    const blurb = el('p', 'opt-blurb');
    setup.appendChild(blurb);

    const go = el('button', 'btn primary deploy', `<span class="dp-main">Deploy</span><span class="dp-sub"></span>${glyph('arrow')}`);
    go.dataset.testid = 'btn-start';
    go.addEventListener('click', () => {
      onInteract();
      this.sfx('ui_confirm');
      settings.lastHero = hero;
      settings.lastDifficulty = difficulty;
      settings.lastTheme = theme;
      saveSettings(settings);
      onStart({ hero, difficulty, theme, seed: Math.floor(Math.random() * 1e9) });
    });
    setup.appendChild(go);
    dock.appendChild(setup);
    menu.appendChild(dock);
    menu.appendChild(
      el('div', 'menu-foot', `<span>You command the <b class="aegis">Aegis Coalition</b> against the <b class="crimson">Crimson Dominion</b>.</span><span class="ver">Skirmish · v0.2</span>`),
    );

    const sync = () => {
      themeBtns.forEach((b, i) => b.classList.toggle('active', THEMES[i].id === theme));
      diffBtns.forEach((b, i) => b.classList.toggle('active', DIFFICULTIES[i].id === difficulty));
      const t = THEMES.find((x) => x.id === theme)!;
      const d = DIFFICULTIES.find((x) => x.id === difficulty)!;
      blurb.innerHTML = `<b>${t.name}</b> — ${t.blurb} <b>${d.name}</b> — ${d.blurb}`;
      (go.querySelector('.dp-sub') as HTMLElement).textContent = `${HERO_DEFS[hero].name} · ${t.name} · ${d.name}`;
    };
    renderDossier(HERO_DEFS[hero]);
    sync();
    this.show(menu);
  }

  // ------------------------------------------------------------------ settings
  /** Grouped audio / video / control settings. `onChange` runs after every change. */
  private settingsPanel(settings: Settings, onChange: () => void): HTMLElement {
    const panel = el('div', 'settings');
    const group = (title: string, icon: string) => {
      const g = el('div', 'set-group');
      g.appendChild(el('h3', '', `${glyph(icon)}${title}`));
      panel.appendChild(g);
      return g;
    };
    const slider = (label: string, key: 'sfx' | 'music') => {
      const row = el('label', 'set-row', `<span class="set-label">${label}</span>`);
      const wrap = el('span', 'slider');
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(settings[key]);
      input.dataset.testid = `set-${key}`;
      const val = el('span', 'set-val');
      const paint = () => {
        wrap.style.setProperty('--f', input.value);
        val.textContent = `${Math.round(Number(input.value) * 100)}%`;
      };
      input.addEventListener('input', () => {
        settings[key] = Number(input.value);
        saveSettings(settings);
        paint();
        onChange();
      });
      input.addEventListener('change', () => this.sfx('ui_click'));
      paint();
      wrap.appendChild(input);
      row.append(wrap, val);
      return row;
    };
    const toggle = (label: string, key: 'voice' | 'shadows' | 'bloom' | 'edgeScroll', note: string) => {
      const row = el('div', 'set-row', `<span class="set-label">${label}<small>${note}</small></span>`);
      const b = el('button', 'switch', '<span class="knob"></span><span class="sw-on">On</span><span class="sw-off">Off</span>');
      b.setAttribute('role', 'switch');
      b.dataset.testid = `set-${key}`;
      const paint = () => {
        b.setAttribute('aria-checked', String(settings[key]));
        b.classList.toggle('on', settings[key]);
      };
      b.addEventListener('click', () => {
        settings[key] = !settings[key];
        saveSettings(settings);
        paint();
        this.sfx('ui_click');
        onChange();
      });
      paint();
      row.appendChild(b);
      return row;
    };
    group('Audio', 'speaker').append(slider('Effects volume', 'sfx'), slider('Music volume', 'music'), toggle('Announcer voice', 'voice', 'Spoken battle reports'));
    group('Video', 'monitor').append(toggle('Shadows', 'shadows', 'Soft sun shadows'), toggle('Bloom', 'bloom', 'Glow on lights and effects'));
    group('Controls', 'mouse').append(toggle('Edge scrolling', 'edgeScroll', 'Pan when the cursor touches the screen edge'));
    return panel;
  }

  /** Settings opened from the main menu. */
  private settingsModal(settings: Settings): void {
    if (this.settingsEl) return;
    const wrap = el('div', 'modal-wrap settings-wrap');
    const box = el('div', 'modal settings-modal');
    box.appendChild(el('div', 'modal-head', `${glyph('settings')}<h2>Settings</h2>`));
    box.appendChild(
      this.settingsPanel(settings, () => {
        if (!this.audio) return;
        this.audio.settings.sfx = settings.sfx;
        this.audio.settings.music = settings.music;
        this.audio.settings.voice = settings.voice;
        this.audio.applySettings();
      }),
    );
    const close = this.button('Done', 'primary', 'btn-settings-close', 'check');
    const shut = () => {
      this.sfx('ui_close');
      wrap.remove();
      this.settingsEl = null;
    };
    close.addEventListener('click', shut);
    const foot = el('div', 'modal-foot');
    foot.appendChild(close);
    box.appendChild(foot);
    wrap.appendChild(box);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) shut();
    });
    this.root.appendChild(wrap);
    this.settingsEl = wrap;
  }

  // ------------------------------------------------------------------ loading
  loading(text: string, progress: number, cfg?: GameConfig): void {
    if (cfg) this.cfg = cfg;
    let box = this.root.querySelector('.loading') as HTMLElement | null;
    if (!box) {
      const c = this.cfg;
      const h = c ? HERO_DEFS[c.hero] : null;
      box = el('div', 'loading');
      if (h) box.style.setProperty('--accent', h.accent);
      const pic = c ? art(`theme-${c.theme}.webp`) : art('keyart.webp');
      box.innerHTML = `
        <div class="load-art" style="background-image:url(${pic})"></div>
        <div class="load-shade"></div>
        <div class="load-top">${emblem('logo-emblem small')}<div class="logo small"><span class="logo-kicker">KNOTZ</span><h1><span class="lw-alert">ALERT</span> <span class="lw-red">RED</span></h1></div>
          <div class="load-op"><span>Operation</span><b>${c ? themeName(c.theme) : 'Skirmish'}</b></div></div>
        <div class="load-brief">
          ${h ? `<div class="lb-portrait" style="background-image:url(${art(`hero-${h.id}.webp`)})"></div>` : ''}
          <div class="lb-text">
            <span class="lb-kicker">Commander</span>
            <b>${h ? h.name : 'Aegis Command'}</b>
            <i>${h ? h.title : ''}</i>
            <div class="lb-meta">${c ? `<span>${glyph('eye')}${themeName(c.theme)}</span><span>${glyph('skull')}${difficultyName(c.difficulty)}</span>` : ''}</div>
          </div>
        </div>
        <div class="load-tip"><span class="lt-label">${glyph('info')}Field tip</span><p class="lt-text"></p></div>
        <div class="load-progress">
          <div class="lp-row"><p class="load-text"></p><span class="load-pct">0%</span></div>
          <div class="load-bar"><i></i></div>
        </div>`;
      this.show(box);
      const tipEl = box.querySelector('.lt-text') as HTMLElement;
      let k = Math.floor(Math.random() * TIPS.length);
      const next = () => {
        tipEl.innerHTML = TIPS[k % TIPS.length];
        k++;
        pulse(tipEl, 'in', 600);
      };
      next();
      this.tipTimer = window.setInterval(next, 4800);
    }
    (box.querySelector('.load-text') as HTMLElement).textContent = text;
    (box.querySelector('.load-pct') as HTMLElement).textContent = `${Math.round(progress * 100)}%`;
    (box.querySelector('.load-bar i') as HTMLElement).style.setProperty('--f', String(Math.max(0, Math.min(1, progress))));
    box.classList.toggle('done', progress >= 1);
  }

  // ------------------------------------------------------------------ help
  help(): void {
    if (this.helpEl) {
      this.closeHelp();
      return;
    }
    const wrap = el('div', 'modal-wrap help-wrap');
    const box = el('div', 'modal help');
    box.innerHTML = `<div class="modal-head">${glyph('manual')}<h2>Field Manual</h2><span class="mh-note">Aegis Coalition · standard operating procedures</span></div>${MANUAL_HTML}`;
    const close = this.button('Got it', 'primary', 'btn-help-close', 'check');
    close.addEventListener('click', () => this.closeHelp());
    const foot = el('div', 'modal-foot', '<span class="dim">Press <kbd>/</kbd> any time to open this manual.</span>');
    foot.appendChild(close);
    box.appendChild(foot);
    wrap.appendChild(box);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) this.closeHelp();
    });
    this.root.appendChild(wrap);
    this.root.classList.add('blocking');
    this.helpEl = wrap;
  }

  closeHelp(): void {
    if (this.helpEl) this.sfx('ui_close');
    this.helpEl?.remove();
    this.helpEl = null;
    if (!this.root.childElementCount) this.root.classList.remove('blocking');
  }

  get helpOpen(): boolean {
    return this.helpEl !== null;
  }

  // ------------------------------------------------------------------ pause
  pause(settings: Settings, cb: { onResume(): void; onRestart(): void; onQuit(): void; onSettings(): void }): void {
    const wrap = el('div', 'modal-wrap pause-wrap');
    const box = el('div', 'modal pause');
    const c = this.cfg;
    box.appendChild(
      el('div', 'modal-head', `${emblem('logo-emblem tiny')}<h2>Paused</h2><span class="mh-note">${c ? `Operation ${themeName(c.theme)} · ${difficultyName(c.difficulty)}` : 'Skirmish'}</span>`),
    );
    const cols = el('div', 'pause-cols');
    const nav = el('div', 'pause-nav');
    const btn = (label: string, cls: string, id: string, icon: string, sound: string, fn: () => void) => {
      const b = this.button(label, cls, id, icon);
      b.addEventListener('click', () => {
        this.sfx(sound);
        fn();
      });
      return b;
    };
    nav.append(
      btn('Resume', 'primary', 'btn-resume', 'play', 'ui_close', cb.onResume),
      btn('Field manual', '', 'btn-controls', 'manual', 'ui_open', () => this.help()),
      btn('Restart mission', '', 'btn-restart', 'restart', 'ui_confirm', cb.onRestart),
      btn('Quit to main menu', 'danger', 'btn-quit', 'exit', 'ui_back', cb.onQuit),
    );
    nav.appendChild(el('p', 'pause-note', 'The battle is frozen while this menu is open.'));
    cols.append(nav, this.settingsPanel(settings, cb.onSettings));
    box.appendChild(cols);
    wrap.appendChild(box);
    this.show(wrap);
  }

  // ------------------------------------------------------------------ results
  end(result: 'victory' | 'defeat', time: number, mine: PlayerStats, theirs: PlayerStats, cb: { onRestart(): void; onQuit(): void; onContinue(): void }): void {
    const win = result === 'victory';
    const c = this.cfg;
    const h = c ? HERO_DEFS[c.hero] : null;
    const wrap = el('div', `modal-wrap end ${result}`);
    wrap.innerHTML = `<div class="end-art" style="background-image:url(${art(`${result}.webp`)})"></div><div class="end-shade"></div>`;
    const box = el('div', 'end-content');
    const rows: [string, number, number][] = [
      ['Units built', mine.unitsBuilt, theirs.unitsBuilt],
      ['Units destroyed', mine.unitsKilled, theirs.unitsKilled],
      ['Units lost', mine.unitsLost, theirs.unitsLost],
      ['Structures built', mine.buildingsBuilt, theirs.buildingsBuilt],
      ['Structures razed', mine.buildingsRazed, theirs.buildingsRazed],
      ['Aurium harvested', mine.harvested, theirs.harvested],
      ['Damage dealt', mine.damageDealt, theirs.damageDealt],
    ];
    const lowerIsBetter = new Set(['Units lost']);
    box.innerHTML = `
      <div class="end-kicker">${glyph(win ? 'trophy' : 'skull')}<span>${win ? 'Operation complete' : 'Operation failed'}${c ? ` · ${themeName(c.theme)}` : ''}</span></div>
      <h1 class="end-title">${win ? 'VICTORY' : 'DEFEAT'}</h1>
      <div class="end-rule"><i></i>${emblem('logo-emblem tiny')}<i></i></div>
      <p class="end-sub">${win ? 'The Crimson Dominion has been driven from the field.' : 'Your base has fallen. The Coalition will remember this day.'}</p>
      <div class="end-meta">
        ${h ? `<span class="em-hero" style="--accent:${h.accent}"><i style="background-image:url(${art(`hero-${h.id}.webp`)})"></i><b>${h.name}</b></span>` : ''}
        <span>${glyph('clock')}<b>${formatTime(time)}</b> mission time</span>
        ${c ? `<span>${glyph('skull')}<b>${difficultyName(c.difficulty)}</b> opposition</span>` : ''}
      </div>
      <table class="stats">
        <tr><th></th><th class="me">Aegis <small>You</small></th><th class="vs"></th><th class="them">Crimson <small>Enemy</small></th></tr>
        ${rows
          .map(([label, a, b]) => {
            const tot = a + b;
            const better = lowerIsBetter.has(label) ? a < b : a > b;
            return `<tr class="${better ? 'lead' : ''}"><td>${label}</td><td class="me" data-v="${Math.round(a)}">0</td><td class="vs"><span class="cmp${tot > 0 ? '' : ' zero'}" style="--a:${tot > 0 ? (a / tot).toFixed(3) : '0.5'}"><i></i><b></b></span></td><td class="them" data-v="${Math.round(b)}">0</td></tr>`;
          })
          .join('')}
      </table>`;
    const actions = el('div', 'end-actions');
    const again = this.button('Play again', 'primary', 'btn-again', 'restart');
    again.addEventListener('click', () => {
      this.sfx('ui_confirm');
      cb.onRestart();
    });
    const view = this.button('View battlefield', '', 'btn-view', 'eye');
    view.addEventListener('click', () => {
      this.sfx('ui_close');
      cb.onContinue();
    });
    const quit = this.button('Main menu', '', 'btn-mainmenu', 'back');
    quit.addEventListener('click', () => {
      this.sfx('ui_back');
      cb.onQuit();
    });
    actions.append(quit, view, again);
    box.appendChild(actions);
    wrap.appendChild(box);
    this.show(wrap);
    box.querySelectorAll<HTMLElement>('td[data-v]').forEach((td, i) => countUp(td, Number(td.dataset.v), 1100, 700 + Math.floor(i / 2) * 110));
  }
}
