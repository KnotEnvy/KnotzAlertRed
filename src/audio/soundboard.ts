/**
 * Sound test page (`?soundboard=1`): every sound id grouped by category with a play button,
 * the music states, an intensity slider, distance / pan tests, the announcer and the volume
 * settings. Self-contained markup and styles. Also exposes `window.__audioLab` for
 * `npm run audio:render`.
 */
import type { ThemeId } from '../core/config';
import { saveSettings, type Settings } from '../core/settings';
import type { AudioManager, MusicState } from './audio';
import * as lab from './lab';
import { SOUND_GROUPS, SOUND_NOTES, SOUNDS } from './sfx';

declare global {
  interface Window {
    __audioLab?: typeof lab;
  }
}

const CSS = `
.ksb{position:fixed;inset:0;overflow:auto;z-index:99999;background:#0e1116;color:#d9e1ea;
  font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:20px 24px 60px;box-sizing:border-box}
.ksb *{box-sizing:border-box}
.ksb h1{font-size:20px;margin:0 0 4px;color:#fff;letter-spacing:.02em}
.ksb h2{font-size:13px;margin:22px 0 8px;color:#ff6b5a;text-transform:uppercase;letter-spacing:.12em}
.ksb .sub{color:#8a97a8;margin:0 0 12px}
.ksb .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ksb .panel{background:#161b23;border:1px solid #252d3a;border-radius:8px;padding:12px 14px;margin-top:8px}
.ksb button{background:#222b38;color:#e6edf5;border:1px solid #33404f;border-radius:6px;padding:7px 11px;
  font:inherit;cursor:pointer;text-align:left}
.ksb button:hover{background:#2b3747;border-color:#4a5b70}
.ksb button.on{background:#7a2018;border-color:#ff6b5a;color:#fff}
.ksb button .id{font-family:ui-monospace,Consolas,monospace;font-size:13px;color:#fff}
.ksb button .note{display:block;font-size:11px;color:#8a97a8}
.ksb .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.ksb label{display:flex;align-items:center;gap:8px;color:#b9c4d2}
.ksb input[type=range]{width:160px}
.ksb .status{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#9fe0a8;white-space:pre-wrap}
.ksb .hint{background:#3a2a10;border:1px solid #8a6320;color:#ffd58a;padding:8px 12px;border-radius:6px;margin:8px 0}
.ksb a{color:#7fb8ff}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

function slider(label: string, min: number, max: number, step: number, value: number, on: (v: number) => void, fmt = (v: number) => v.toFixed(2)): HTMLElement {
  const wrap = el('label');
  const out = el('span', {}, fmt(value));
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    on(v);
  });
  wrap.append(label, input, out);
  return wrap;
}

export function mountSoundboard(parent: HTMLElement, audio: AudioManager, settings: Settings): void {
  window.__audioLab = lab;
  const style = el('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el('div', { class: 'ksb', 'data-testid': 'soundboard' });
  parent.appendChild(root);

  const unlock = () => audio.unlock();
  root.addEventListener('pointerdown', unlock);

  root.appendChild(el('h1', {}, 'KnotZ: Alert Red — Sound Test'));
  root.appendChild(el('p', { class: 'sub' }, 'Every sound and music state in the game, synthesised live in your browser. Use headphones or decent speakers.'));
  const hint = el('div', { class: 'hint' }, 'Click anywhere to enable audio (browsers block sound until you interact with the page).');
  root.appendChild(hint);
  const status = el('div', { class: 'status panel' });
  root.appendChild(status);

  // ---------------------------------------------------------------- volume
  root.appendChild(el('h2', {}, 'Volume'));
  const vol = el('div', { class: 'panel row' });
  const persist = () => {
    saveSettings(settings);
    audio.settings.sfx = settings.sfx;
    audio.settings.music = settings.music;
    audio.settings.voice = settings.voice;
    audio.applySettings();
  };
  vol.append(
    slider('Effects', 0, 1, 0.05, settings.sfx, (v) => {
      settings.sfx = v;
      persist();
    }),
    slider('Music', 0, 1, 0.05, settings.music, (v) => {
      settings.music = v;
      persist();
    }),
  );
  const voiceLbl = el('label');
  const voiceBox = el('input', { type: 'checkbox' });
  voiceBox.checked = settings.voice;
  voiceBox.addEventListener('change', () => {
    settings.voice = voiceBox.checked;
    persist();
  });
  voiceLbl.append(voiceBox, 'Announcer voice');
  vol.appendChild(voiceLbl);
  root.appendChild(vol);

  // ---------------------------------------------------------------- music
  root.appendChild(el('h2', {}, 'Music'));
  const mus = el('div', { class: 'panel' });
  const musRow = el('div', { class: 'row' });
  const stateButtons: HTMLButtonElement[] = [];
  let theme: ThemeId = 'verdant';
  const pick = (b: HTMLButtonElement | null) => stateButtons.forEach((x) => x.classList.toggle('on', x === b));
  const states: [string, MusicState | 'auto' | 'stop'][] = [
    ['Main menu', 'menu'],
    ['Calm (base building)', 'calm'],
    ['Rising tension', 'tension'],
    ['Full combat', 'combat'],
    ['Victory cue', 'victory'],
    ['Defeat cue', 'defeat'],
    ['Auto (follow intensity slider)', 'auto'],
    ['Stop', 'stop'],
  ];
  for (const [label, st] of states) {
    const b = el('button', { 'data-testid': `music-${st}` }, label);
    b.addEventListener('click', () => {
      audio.unlock();
      if (st === 'stop') {
        audio.setMusicState(null);
        audio.stopMusic();
        pick(null);
        return;
      }
      audio.setTheme(theme);
      if (st === 'auto') {
        audio.setMusicState(null);
        audio.startMusic('game');
      } else {
        audio.setMusicState(st);
      }
      pick(b);
    });
    stateButtons.push(b);
    musRow.appendChild(b);
  }
  mus.appendChild(musRow);
  const musRow2 = el('div', { class: 'row' });
  musRow2.style.marginTop = '10px';
  let intensity = 0;
  let threat = 0;
  musRow2.append(
    slider('Combat intensity', 0, 1, 0.01, 0, (v) => {
      intensity = v;
      audio.setCombat(intensity, threat);
    }),
    slider('Visible enemy threat', 0, 1, 0.01, 0, (v) => {
      threat = v;
      audio.setCombat(intensity, threat);
    }),
  );
  const themeSel = el('select');
  for (const t of ['verdant', 'scorched', 'frost']) themeSel.appendChild(el('option', { value: t }, t));
  themeSel.addEventListener('change', () => {
    theme = themeSel.value as ThemeId;
    audio.setTheme(theme);
  });
  const themeLbl = el('label');
  themeLbl.append('Battlefield', themeSel);
  musRow2.appendChild(themeLbl);
  mus.appendChild(musRow2);
  mus.appendChild(
    el(
      'p',
      { class: 'sub' },
      'Auto mode is what the game does: intensity rises quickly and falls slowly, and the music moves calm → tension → combat on bar lines (with a drum fill on the way up). Changing battlefield applies on the next start.',
    ),
  );
  root.appendChild(mus);

  // ---------------------------------------------------------------- positional test
  root.appendChild(el('h2', {}, 'Position (applies to effects buttons)'));
  const pos = el('div', { class: 'panel row' });
  let dist = 0;
  let pan = 0;
  let own = false;
  pos.append(
    slider('Distance from camera', 0, 1, 0.01, 0, (v) => (dist = v), (v) => `${Math.round(v * 100)}%`),
    slider('Left / right', -1, 1, 0.05, 0, (v) => (pan = v)),
  );
  const ownLbl = el('label');
  const ownBox = el('input', { type: 'checkbox' });
  ownBox.addEventListener('change', () => (own = ownBox.checked));
  ownLbl.append(ownBox, 'Own unit (wins voice priority)');
  pos.appendChild(ownLbl);
  root.appendChild(pos);
  const playId = (id: string, when?: number) => {
    audio.unlock();
    audio.lx = 0;
    audio.lz = 0;
    audio.lyaw = 0;
    audio.lrange = 90;
    const d = Math.max(0.0001, dist) * 90;
    const x = pan * Math.min(d, 40);
    const z = Math.sqrt(Math.max(0, d * d - x * x));
    if (dist <= 0 && pan === 0) audio.play(id, undefined, undefined, 1, { own, when });
    else audio.play(id, x, z, 1, { own, when });
  };

  // ---------------------------------------------------------------- sounds
  for (const g of SOUND_GROUPS) {
    const head = el('h2', {}, g.name);
    root.appendChild(head);
    const box = el('div', { class: 'panel' });
    const grid = el('div', { class: 'grid' });
    for (const id of g.ids) {
      const b = el('button', { 'data-testid': `sound-${id}`, title: `play('${id}')` });
      b.append(el('span', { class: 'id' }, id), el('span', { class: 'note' }, SOUND_NOTES[id] ?? ''));
      b.addEventListener('click', () => playId(id));
      if (id === 'ui_hover') b.addEventListener('pointerenter', () => playId(id));
      grid.appendChild(b);
    }
    box.appendChild(grid);
    const all = el('button', {}, '▶ Play all in this group');
    all.style.marginTop = '8px';
    all.addEventListener('click', () => {
      audio.unlock();
      const ctx = audio.ctx;
      if (!ctx) return;
      let t = ctx.currentTime + 0.05;
      for (const id of g.ids) {
        playId(id, t);
        t += Math.min(2.5, Math.max(0.5, SOUNDS[id].dur * 0.8));
      }
    });
    box.appendChild(all);
    root.appendChild(box);
  }

  // ---------------------------------------------------------------- announcer
  root.appendChild(el('h2', {}, 'Announcer'));
  const ann = el('div', { class: 'panel row' });
  for (const line of ['Our base is under attack', 'Construction complete', 'Structure lost', 'Reinforcements inbound', 'Unit ready', 'Warning. Orbital strike detected', 'Low power', 'Research complete']) {
    const b = el('button', {}, `“${line}”`);
    b.addEventListener('click', () => {
      audio.unlock();
      audio.say(line);
    });
    ann.appendChild(b);
  }
  root.appendChild(ann);
  root.appendChild(el('p', { class: 'sub' }, 'Each line plays its category earcon (alert / good / bad / info) even with the voice off. Speech quality depends on the voices installed in your browser and OS.'));

  // ---------------------------------------------------------------- stress
  root.appendChild(el('h2', {}, 'Stress test'));
  const stress = el('div', { class: 'panel row' });
  const sb = el('button', { 'data-testid': 'stress' }, '40 weapon / explosion triggers in 3 seconds');
  sb.addEventListener('click', () => {
    audio.unlock();
    const ctx = audio.ctx;
    if (!ctx) return;
    const pool = ['rifle', 'rifle', 'mg', 'cannon', 'cannon_heavy', 'rocket', 'explosion_s', 'explosion_m', 'explosion_l', 'artillery', 'sniper', 'arc', 'thump', 'death'];
    const t0 = ctx.currentTime + 0.05;
    const list = Array.from({ length: 40 }, () => ({ id: pool[Math.floor(Math.random() * pool.length)], t: t0 + Math.random() * 3 })).sort((a, b) => a.t - b.t);
    for (const tr of list) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 50;
      audio.play(tr.id, Math.cos(a) * d, Math.sin(a) * d, 1, { when: tr.t, own: Math.random() < 0.5 });
    }
  });
  stress.appendChild(sb);
  root.appendChild(stress);

  const back = el('p', { class: 'sub' });
  const a = el('a', { href: location.pathname }, '← Back to the game');
  back.appendChild(a);
  root.appendChild(back);

  const update = () => {
    if (!root.isConnected) return;
    const i = audio.info();
    if (audio.ctx && audio.ctx.state === 'running') hint.style.display = 'none';
    status.textContent =
      `audio: ${i.ctx}   voices: ${i.voices}   played: ${audio.stats.played}  dropped: ${audio.stats.dropped}  stolen: ${audio.stats.stolen}\n` +
      `music: ${i.state} → ${i.target}   bars: ${i.bars}   intensity: ${i.intensity.toFixed(2)} (raw ${i.raw.toFixed(2)})   music duck: ${(20 * Math.log10(Math.max(1e-4, i.duck))).toFixed(1)} dB\n` +
      `announcer voice: ${audio.voiceName || '(none available)'}`;
    window.setTimeout(update, 250);
  };
  update();
}
