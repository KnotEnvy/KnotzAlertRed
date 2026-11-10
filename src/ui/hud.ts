import { HERO_XP, MAX_REQUISITION, SELL_REFUND, TEAM_COLORS, TEAM_NEUTRAL, TEAM_PLAYER } from '../core/config';
import { formatTime } from '../core/math';
import type { AudioManager } from '../audio/audio';
import { BUILDING_DEFS, DEFENSE_ORDER, STRUCTURE_ORDER } from '../data/buildings';
import { POWER_DEFS, POWER_ORDER, UPGRADE_DEFS, UPGRADE_ORDER } from '../data/heroes';
import type { BuildingDef, QueueKind, UnitDef, WeaponDef } from '../data/types';
import { UNIT_DEFS, UNIT_ORDER } from '../data/units';
import type { Input } from '../input/input';
import type { Renderer } from '../render/renderer';
import { Building } from '../sim/building';
import { ResourceNode } from '../sim/entity';
import type { NoticeKind } from '../sim/hooks';
import { RANK_NAMES, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { glyph } from './glyphs';
import { Minimap } from './minimap';

export interface HudHost {
  world: World;
  input: Input;
  renderer: Renderer;
  audio: AudioManager;
  icons: Record<string, string>;
  togglePause(): void;
  toggleHelp(): void;
}

interface TabDef {
  kind: QueueKind;
  label: string;
  title: string;
  items: string[];
}

const TABS: TabDef[] = [
  { kind: 'structure', label: 'BASE', title: 'Structures', items: STRUCTURE_ORDER },
  { kind: 'defense', label: 'DEF', title: 'Defences', items: DEFENSE_ORDER },
  { kind: 'infantry', label: 'INF', title: 'Infantry', items: UNIT_ORDER.infantry },
  { kind: 'vehicle', label: 'VEH', title: 'Vehicles', items: UNIT_ORDER.vehicle },
  { kind: 'air', label: 'AIR', title: 'Aircraft', items: UNIT_ORDER.air },
  { kind: 'tech', label: 'TECH', title: 'Research', items: UPGRADE_ORDER },
];

/** Onboarding checklist shown until every step has been completed (or it is dismissed). */
const OBJECTIVES: { text: string; done: (w: World) => boolean }[] = [
  { text: 'Build a Fusion Reactor', done: (w) => w.players[TEAM_PLAYER].has('power') },
  { text: 'Build an Aurium Refinery', done: (w) => w.players[TEAM_PLAYER].has('refinery') },
  { text: 'Build a Barracks or War Factory', done: (w) => w.players[TEAM_PLAYER].has('barracks') || w.players[TEAM_PLAYER].has('factory') },
  { text: 'Train 6 combat units', done: (w) => w.players[TEAM_PLAYER].stats.unitsBuilt >= 6 },
  { text: 'Capture an outpost with infantry', done: (w) => w.players[TEAM_PLAYER].has('extractor') || w.players[TEAM_PLAYER].has('obelisk') },
  { text: 'Destroy the Crimson base', done: (w) => w.result === 'victory' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function weaponLine(w: WeaponDef | undefined): string {
  if (!w) return '<span class="dim">Unarmed</span>';
  const dps = Math.round((w.damage * (w.burst ?? 1)) / w.cooldown);
  const targets = w.hitsAir && w.hitsGround ? 'ground + air' : w.hitsAir ? 'air only' : 'ground only';
  return `<b>${Math.round(w.damage)}${w.burst ? `×${w.burst}` : ''}</b> ${w.type} · ${dps} dps · range ${w.range}${w.splash ? ` · splash ${w.splash}` : ''} · ${targets}`;
}

interface BuildButton {
  id: string;
  root: HTMLButtonElement;
  prog: HTMLElement;
  count: HTMLElement;
  state: HTMLElement;
}

/** DOM heads-up display: resources, build sidebar, hero panel, selection card, minimap, notices. */
export class Hud {
  readonly root: HTMLElement;
  private minimap: Minimap;
  private tooltip: HTMLElement;
  private tipFn: (() => string) | null = null;
  private tipAnchor: HTMLElement | null = null;
  private notices: HTMLElement;
  private credits: HTMLElement;
  private shownCredits = 0;
  private powerText: HTMLElement;
  private powerBar: HTMLElement;
  private powerBox: HTMLElement;
  private reqPips: HTMLElement[] = [];
  private clock: HTMLElement;
  private tabButtons: HTMLButtonElement[] = [];
  private grid: HTMLElement;
  private tabTitle: HTMLElement;
  private buildButtons: BuildButton[] = [];
  private tab = 0;
  private powerButtons: { id: string; root: HTMLButtonElement; cd: HTMLElement }[] = [];
  private heroEls!: {
    root: HTMLElement; hp: HTMLElement; xp: HTMLElement; level: HTMLElement; status: HTMLElement;
    abilities: { root: HTMLButtonElement; cd: HTMLElement; lock: HTMLElement }[];
  };
  private selPanel: HTMLElement;
  private selVersion = -1;
  private selDynamic: (() => void) | null = null;
  private groupsEl: HTMLElement;
  private slowT = 0;
  private mapT = 0;
  private modeHint: HTMLElement;
  private objectives!: HTMLElement;
  private objectiveRows: HTMLElement[] = [];
  private objectivesDone = 0;
  private disposers: (() => void)[] = [];

  constructor(
    private host: HudHost,
    parent: HTMLElement,
  ) {
    const root = (this.root = el('div', 'hud'));
    parent.appendChild(root);
    const p = host.world.players[TEAM_PLAYER];

    // ---------------------------------------------------------- top bar
    const top = el('div', 'topbar panel');
    top.appendChild(el('div', 'brand', 'KNOTZ <b>ALERT RED</b>'));
    const cr = el('div', 'res credits', '<span class="res-ico">◈</span>');
    this.credits = el('span', 'res-val', '0');
    cr.appendChild(this.credits);
    this.tip(cr, () => '<h4>Credits</h4><p>Earned by Harvesters delivering Aurium to a Refinery, and by captured Extractors. Production drains credits gradually as it progresses.</p>');
    top.appendChild(cr);

    this.powerBox = el('div', 'res power', '<span class="res-ico">⚡</span>');
    this.powerText = el('span', 'res-val', '0 / 0');
    this.powerBox.appendChild(this.powerText);
    const pb = el('div', 'pbar');
    this.powerBar = el('i');
    pb.appendChild(this.powerBar);
    this.powerBox.appendChild(pb);
    this.tip(this.powerBox, () => {
      const pl = host.world.players[TEAM_PLAYER];
      return `<h4>Power</h4><p>Using <b>${pl.powerUsed}</b> of <b>${pl.powerMade}</b>.</p><p>When demand exceeds supply, production runs at half speed and Arc Pylons shut down. Build Fusion Reactors to fix it.</p>`;
    });
    top.appendChild(this.powerBox);

    const rq = el('div', 'res req', '<span class="res-ico">★</span>');
    const pips = el('div', 'pips');
    for (let i = 0; i < MAX_REQUISITION; i++) {
      const pip = el('i');
      pip.appendChild(el('b'));
      pips.appendChild(pip);
      this.reqPips.push(pip);
    }
    rq.appendChild(pips);
    this.tip(rq, () => '<h4>Requisition</h4><p>Spent on support powers. Tokens accrue over time and from dealing damage. Holding the Signal Obelisk nearly doubles the rate.</p>');
    top.appendChild(rq);

    top.appendChild(el('div', 'spacer'));
    this.modeHint = el('div', 'mode-hint');
    top.appendChild(this.modeHint);
    this.clock = el('div', 'clock', '0:00');
    top.appendChild(this.clock);
    const helpBtn = el('button', 'tb-btn', '?');
    helpBtn.title = 'Controls (/)';
    helpBtn.dataset.testid = 'btn-help';
    helpBtn.addEventListener('click', () => host.toggleHelp());
    top.appendChild(helpBtn);
    const menuBtn = el('button', 'tb-btn', '☰');
    menuBtn.title = 'Menu (Esc)';
    menuBtn.dataset.testid = 'btn-menu';
    menuBtn.addEventListener('click', () => host.togglePause());
    top.appendChild(menuBtn);
    root.appendChild(top);

    // ---------------------------------------------------------- support powers
    const powers = el('div', 'powers');
    for (const id of POWER_ORDER) {
      const def = POWER_DEFS[id];
      const b = el('button', 'power-btn panel');
      b.dataset.testid = `power-${id}`;
      b.style.setProperty('--accent', def.color);
      b.innerHTML = `<span class="glyph">${glyph(def.id, def.glyph)}</span><span class="pname">${def.name}</span><span class="pcost">${'★'.repeat(def.cost)}</span>`;
      const cd = el('div', 'cd');
      b.appendChild(cd);
      b.addEventListener('click', () => {
        host.audio.unlock();
        host.audio.play('click');
        host.input.usePower(id);
      });
      this.tip(b, () => {
        const left = host.world.players[TEAM_PLAYER].powerCooldowns[id] ?? 0;
        return `<h4>${def.name} <span class="cost">${'★'.repeat(def.cost)}</span></h4><p>${def.desc}</p><p class="dim">Cooldown ${def.cooldown}s${left > 0 ? ` · ready in ${Math.ceil(left)}s` : ''}</p>`;
      });
      powers.appendChild(b);
      this.powerButtons.push({ id, root: b, cd });
    }
    root.appendChild(powers);

    this.notices = el('div', 'notices');
    root.appendChild(this.notices);

    // ---------------------------------------------------------- first-steps checklist
    this.objectives = el('div', 'objectives panel');
    this.objectives.appendChild(el('h4', '', 'First steps'));
    for (const o of OBJECTIVES) {
      const row = el('div', 'obj', `<i></i><span>${o.text}</span>`);
      this.objectives.appendChild(row);
      this.objectiveRows.push(row);
    }
    const dismiss = el('button', 'obj-close', '×');
    dismiss.title = 'Hide';
    dismiss.dataset.testid = 'objectives-close';
    dismiss.addEventListener('click', () => this.objectives.remove());
    this.objectives.appendChild(dismiss);
    root.appendChild(this.objectives);

    // ---------------------------------------------------------- sidebar
    const side = el('div', 'sidebar panel');
    const tabs = el('div', 'tabs');
    TABS.forEach((t, i) => {
      const b = el('button', 'tab', `${t.label}<i></i>`);
      b.dataset.testid = `tab-${t.kind}`;
      b.addEventListener('click', () => {
        host.audio.unlock();
        host.audio.play('click');
        this.setTab(i);
      });
      tabs.appendChild(b);
      this.tabButtons.push(b);
    });
    side.appendChild(tabs);
    this.tabTitle = el('div', 'tab-title');
    side.appendChild(this.tabTitle);
    this.grid = el('div', 'grid');
    side.appendChild(this.grid);
    side.appendChild(el('div', 'side-hint', 'Left-click: build / place<br>Right-click: cancel &amp; refund'));
    root.appendChild(side);

    // ---------------------------------------------------------- bottom
    const bottom = el('div', 'bottom');
    const leftCol = el('div', 'left-col');
    leftCol.appendChild(this.buildHeroPanel());
    const mapWrap = el('div', 'minimap-wrap panel');
    this.minimap = new Minimap(host.renderer.terrain.minimapImage, (x, z, button) => host.input.minimap(x, z, button));
    mapWrap.appendChild(this.minimap.canvas);
    leftCol.appendChild(mapWrap);
    bottom.appendChild(leftCol);

    const selWrap = el('div', 'sel-wrap');
    this.groupsEl = el('div', 'groups');
    selWrap.appendChild(this.groupsEl);
    this.selPanel = el('div', 'selection panel');
    selWrap.appendChild(this.selPanel);
    bottom.appendChild(selWrap);
    root.appendChild(bottom);

    this.tooltip = el('div', 'tooltip panel');
    root.appendChild(this.tooltip);

    this.shownCredits = p.credits;
    this.setTab(0);
    this.refreshSelection();
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.root.remove();
  }

  // ------------------------------------------------------------------ tooltips
  private tip(anchor: HTMLElement, fn: () => string): void {
    anchor.addEventListener('mouseenter', () => {
      this.tipFn = fn;
      this.tipAnchor = anchor;
      this.showTip();
    });
    anchor.addEventListener('mouseleave', () => {
      if (this.tipAnchor === anchor) {
        this.tipFn = null;
        this.tipAnchor = null;
        this.tooltip.classList.remove('show');
      }
    });
  }

  private showTip(): void {
    if (!this.tipFn || !this.tipAnchor) return;
    if (!this.tipAnchor.isConnected) {
      this.tipFn = null;
      this.tooltip.classList.remove('show');
      return;
    }
    const tt = this.tooltip;
    tt.innerHTML = this.tipFn();
    tt.classList.add('show');
    const r = this.tipAnchor.getBoundingClientRect();
    const tw = tt.offsetWidth;
    const th = tt.offsetHeight;
    let x: number;
    let y: number;
    const col = this.tipAnchor.closest('.left-col');
    if (r.left > window.innerWidth * 0.62) {
      x = r.left - tw - 10;
      y = r.top;
    } else if (col) {
      // keep the hero panel readable: open to the right of the left column
      x = col.getBoundingClientRect().right + 10;
      y = r.top + r.height / 2 - th / 2;
    } else if (r.top > window.innerHeight * 0.5) {
      x = r.left;
      y = r.top - th - 10;
    } else {
      x = r.left;
      y = r.bottom + 10;
    }
    tt.style.left = `${Math.max(8, Math.min(window.innerWidth - tw - 8, x))}px`;
    tt.style.top = `${Math.max(8, Math.min(window.innerHeight - th - 8, y))}px`;
  }

  // ------------------------------------------------------------------ sidebar
  private setTab(i: number): void {
    this.tab = i;
    const t = TABS[i];
    this.tabButtons.forEach((b, k) => b.classList.toggle('active', k === i));
    this.tabTitle.textContent = t.title;
    this.grid.innerHTML = '';
    this.buildButtons = [];
    const icons = this.host.icons;
    for (const id of t.items) {
      const b = el('button', 'build');
      b.dataset.testid = `build-${id}`;
      let name: string;
      let cost: number;
      let sym = '';
      if (t.kind === 'tech') {
        const d = UPGRADE_DEFS[id];
        name = d.name;
        cost = d.cost;
        sym = d.glyph;
      } else if (t.kind === 'structure' || t.kind === 'defense') {
        name = BUILDING_DEFS[id].name;
        cost = BUILDING_DEFS[id].cost;
      } else {
        name = UNIT_DEFS[id].name;
        cost = UNIT_DEFS[id].cost;
      }
      const img = icons[id] ? `<img src="${icons[id]}" alt="" draggable="false">` : `<span class="big-glyph">${glyph(id, sym || name.charAt(0))}</span>`;
      b.innerHTML = `${img}<span class="bname">${name}</span><span class="bcost">$${cost}</span>`;
      const prog = el('div', 'prog');
      const count = el('span', 'count');
      const state = el('span', 'state');
      b.append(prog, count, state, el('span', 'lock-ico', glyph('lock')));
      b.addEventListener('click', () => this.onBuildClick(t.kind, id));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.host.world.cancel(TEAM_PLAYER, t.kind, id)) {
          this.host.audio.play('sell');
          if (this.host.input.placing?.defId === id) this.host.input.cancelModes();
        }
      });
      this.tip(b, () => this.buildTip(t.kind, id));
      this.grid.appendChild(b);
      this.buildButtons.push({ id, root: b, prog, count, state });
    }
    this.updateSidebar();
  }

  private onBuildClick(kind: QueueKind, id: string): void {
    const { world, input, audio } = this.host;
    audio.unlock();
    const q = world.players[TEAM_PLAYER].queues[kind];
    if ((kind === 'structure' || kind === 'defense') && q.ready && q.items[0]?.defId === id) {
      input.startPlacing(kind, id);
      audio.play('click');
      return;
    }
    const why = world.enqueue(TEAM_PLAYER, kind, id);
    if (why) {
      this.notify(why, 'warn');
      audio.play('error');
    } else {
      audio.play('click');
    }
  }

  private buildTip(kind: QueueKind, id: string): string {
    const world = this.host.world;
    const why = world.queueBlock(TEAM_PLAYER, kind, id);
    const lock = why.startsWith('Requires') ? `<p class="bad">${why}</p>` : '';
    if (kind === 'tech') {
      const d = UPGRADE_DEFS[id];
      const owned = world.players[TEAM_PLAYER].upgrades.has(id);
      return `<h4>${d.name} <span class="cost">$${d.cost}</span></h4><p>${d.desc}</p><p class="dim">Research time ${d.buildTime}s</p>${owned ? '<p class="good">Researched</p>' : lock}`;
    }
    if (kind === 'structure' || kind === 'defense') {
      const d = BUILDING_DEFS[id];
      const pw = d.power > 0 ? `<span class="good">+${d.power} power</span>` : `<span class="warn">${d.power} power</span>`;
      return `<h4>${d.name} <span class="cost">$${d.cost}</span></h4><p class="role">${d.role}</p><p>${d.desc}</p>
        <p class="dim">${d.hp} HP · ${pw} · ${d.buildTime}s</p>${d.weapon ? `<p class="stat">${weaponLine(d.weapon)}</p>` : ''}${lock}`;
    }
    const d = UNIT_DEFS[id];
    return `<h4>${d.name} <span class="cost">$${d.cost}</span></h4><p class="role">${d.role}</p><p>${d.desc}</p>
      <p class="dim">${d.hp} HP · ${d.armor} armour · speed ${d.speed} · ${d.buildTime}s</p><p class="stat">${weaponLine(d.weapon)}</p>${lock}`;
  }

  private updateSidebar(): void {
    const world = this.host.world;
    const p = world.players[TEAM_PLAYER];
    const t = TABS[this.tab];
    const q = p.queues[t.kind];
    for (const b of this.buildButtons) {
      const why = world.queueBlock(TEAM_PLAYER, t.kind, b.id);
      const locked = why.startsWith('Requires');
      const owned = t.kind === 'tech' && p.upgrades.has(b.id);
      b.root.classList.toggle('locked', locked);
      b.root.classList.toggle('owned', owned);
      const n = q.count(b.id);
      const active = q.items[0]?.defId === b.id;
      const ready = active && q.ready;
      b.root.classList.toggle('active', active && !ready);
      b.root.classList.toggle('ready', ready);
      b.root.classList.toggle('stalled', active && q.stalled !== '');
      b.prog.style.setProperty('--p', active ? String(q.items[0].progress) : '0');
      b.prog.style.display = active && !ready ? 'block' : 'none';
      b.count.textContent = n > 1 || (n === 1 && !active) ? String(n) : '';
      b.state.textContent = owned ? 'DONE' : ready ? 'READY' : active && q.stalled === 'funds' ? 'NO FUNDS' : active && q.stalled === 'producer' ? 'ON HOLD' : '';
      b.root.classList.toggle('show-lock', locked && !owned);
    }
    TABS.forEach((tab, i) => {
      const tq = p.queues[tab.kind];
      const btn = this.tabButtons[i];
      btn.classList.toggle('has-ready', tq.ready);
      btn.classList.toggle('busy', tq.items.length > 0 && !tq.ready);
      btn.classList.toggle('unavailable', world.producers(TEAM_PLAYER, tab.kind) === 0);
    });
  }

  // ------------------------------------------------------------------ hero panel
  private buildHeroPanel(): HTMLElement {
    const { world, input, audio, icons } = this.host;
    const p = world.players[TEAM_PLAYER];
    const def = p.heroDef;
    const root = el('div', 'hero-panel panel');
    root.style.setProperty('--accent', def.accent);
    const portrait = el('button', 'portrait');
    portrait.dataset.testid = 'hero-portrait';
    portrait.innerHTML = icons[def.unit.id] ? `<img src="${icons[def.unit.id]}" alt="" draggable="false">` : `<span class="big-glyph">${def.name.charAt(0)}</span>`;
    const level = el('span', 'level', '1');
    portrait.appendChild(level);
    const status = el('span', 'hero-status');
    portrait.appendChild(status);
    portrait.addEventListener('click', () => {
      audio.unlock();
      input.selectHero();
    });
    portrait.addEventListener('dblclick', () => input.selectHero(true));
    this.tip(portrait, () => {
      const pl = world.players[TEAM_PLAYER];
      const next = pl.heroLevel < HERO_XP.length ? `${Math.floor(pl.heroXp)} / ${HERO_XP[pl.heroLevel]} XP` : 'Max level';
      return `<h4>${def.name}</h4><p class="role">${def.title} · Level ${pl.heroLevel}</p><p>${def.lore}</p><p class="dim">${next} · gains XP from kills made by the hero or by allies nearby. Revives at the Command Center.</p><p class="dim">F1 selects · double-click centres the camera.</p>`;
    });
    const head = el('div', 'hero-head');
    head.appendChild(portrait);

    const body = el('div', 'hero-body');
    body.appendChild(el('div', 'hero-name', `${def.name}<span>${def.title}</span>`));
    const hpWrap = el('div', 'bar hp');
    const hp = el('i');
    hpWrap.appendChild(hp);
    const xpWrap = el('div', 'bar xp');
    const xp = el('i');
    xpWrap.appendChild(xp);
    body.append(hpWrap, xpWrap);
    const abRow = el('div', 'abilities');
    const abilities: { root: HTMLButtonElement; cd: HTMLElement; lock: HTMLElement }[] = [];
    def.abilities.forEach((a, i) => {
      const b = el('button', 'ability');
      b.dataset.testid = `ability-${i}`;
      b.style.setProperty('--accent', a.color);
      b.innerHTML = `<span class="glyph">${glyph(a.id, a.glyph)}</span><span class="key">${a.key}</span>`;
      const cd = el('div', 'cd');
      const lock = el('span', 'lock', `L${a.unlockLevel}`);
      b.append(cd, lock);
      b.addEventListener('click', () => {
        audio.unlock();
        audio.play('click');
        input.useAbility(i);
      });
      this.tip(b, () => {
        const pl = world.players[TEAM_PLAYER];
        const left = pl.abilityCooldowns[i];
        const locked = pl.heroLevel < a.unlockLevel;
        return `<h4>${a.name} <span class="cost">[${a.key}]</span></h4><p>${a.desc}</p><p class="dim">Cooldown ${a.cooldown}s${a.range ? ` · range ${a.range}` : ''}${left > 0 ? ` · ready in ${Math.ceil(left)}s` : ''}</p>${locked ? `<p class="bad">Unlocks at hero level ${a.unlockLevel}</p>` : ''}`;
      });
      abRow.appendChild(b);
      abilities.push({ root: b, cd, lock });
    });
    head.appendChild(body);
    root.append(head, abRow);
    this.heroEls = { root, hp, xp, level, status, abilities };
    return root;
  }

  private updateHero(): void {
    const p = this.host.world.players[TEAM_PLAYER];
    const h = p.hero;
    const e = this.heroEls;
    e.root.classList.toggle('dead', !h);
    e.level.textContent = String(p.heroLevel);
    e.status.textContent = h ? '' : `${Math.ceil(Math.max(0, p.heroRespawn))}s`;
    e.hp.style.width = `${h ? Math.max(0, (h.hp / h.maxHp) * 100) : 0}%`;
    const lo = HERO_XP[p.heroLevel - 1] ?? 0;
    const hi = HERO_XP[p.heroLevel];
    e.xp.style.width = hi ? `${Math.min(100, ((p.heroXp - lo) / (hi - lo)) * 100)}%` : '100%';
    p.heroDef.abilities.forEach((a, i) => {
      const b = e.abilities[i];
      const locked = p.heroLevel < a.unlockLevel;
      const cd = p.abilityCooldowns[i];
      b.root.classList.toggle('locked', locked);
      b.root.classList.toggle('cooling', cd > 0);
      b.root.classList.toggle('armed', this.host.input.targeting?.type === 'ability' && this.host.input.targeting.index === i);
      b.cd.style.setProperty('--p', String(cd > 0 ? cd / a.cooldown : 0));
      b.cd.textContent = cd > 0 ? String(Math.ceil(cd)) : '';
      b.lock.style.display = locked ? 'block' : 'none';
    });
  }

  // ------------------------------------------------------------------ selection panel
  private icon(key: string, fallback: string): string {
    const src = this.host.icons[key];
    return src ? `<img src="${src}" alt="" draggable="false">` : `<span class="big-glyph">${fallback.charAt(0)}</span>`;
  }

  private cmdButton(id: Parameters<Input['command']>[0], label: string, key: string, tipHtml: string): HTMLButtonElement {
    const b = el('button', 'cmd', `<span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}`);
    b.dataset.testid = `cmd-${id}`;
    b.addEventListener('click', () => {
      this.host.audio.unlock();
      this.host.input.command(id);
    });
    this.tip(b, () => tipHtml);
    return b;
  }

  private refreshSelection(): void {
    const { input, world } = this.host;
    this.selVersion = input.selectionVersion;
    const panel = this.selPanel;
    panel.innerHTML = '';
    this.selDynamic = null;
    const sel = input.selection.filter((e) => e.alive);

    if (!sel.length) {
      panel.classList.add('empty');
      panel.innerHTML = `<div class="sel-hint"><b>No selection</b><span>Drag to select units · Right-click to move, attack, harvest or capture · <kbd>A</kbd> attack-move · <kbd>F1</kbd> hero · <kbd>/</kbd> all controls</span></div>`;
      return;
    }
    panel.classList.remove('empty');
    const cmds = el('div', 'cmds');

    if (sel.length > 1) {
      const units = sel as Unit[];
      const info = el('div', 'sel-multi');
      const shown = units.slice(0, 27);
      const bars: { u: Unit; bar: HTMLElement }[] = [];
      for (const u of shown) {
        const c = el('button', 'mini', this.icon(u.def.id, u.def.name));
        if (u.hero) c.classList.add('hero');
        const bar = el('i');
        c.appendChild(bar);
        c.addEventListener('click', (ev) => {
          if (ev.shiftKey) input.select([u], true);
          else input.select([u]);
        });
        info.appendChild(c);
        bars.push({ u, bar });
      }
      if (units.length > shown.length) info.appendChild(el('div', 'mini more', `+${units.length - shown.length}`));
      panel.appendChild(info);
      this.selDynamic = () => {
        for (const { u, bar } of bars) {
          const f = Math.max(0, u.hp / u.maxHp);
          bar.style.width = `${f * 100}%`;
          bar.style.background = f > 0.6 ? '#4be06a' : f > 0.3 ? '#f2c641' : '#f0503c';
        }
      };
      this.addUnitCommands(cmds);
    } else {
      const e = sel[0];
      const info = el('div', 'sel-single');
      const teamName = TEAM_COLORS[e.team]?.name ?? '';
      const hpBar = el('i');
      const hpText = el('span', 'hp-text');
      const extra = el('div', 'sel-extra');
      let key = '';
      let role = '';
      let desc = '';
      let stats = '';
      if (e instanceof Unit) {
        const d: UnitDef = e.def;
        key = d.id;
        role = d.role;
        desc = d.desc;
        stats = `<p class="stat">${weaponLine(d.weapon)}</p><p class="dim">${d.armor} armour · speed ${d.speed}</p>`;
      } else if (e instanceof Building) {
        const d: BuildingDef = e.def;
        key = d.id;
        role = d.role;
        desc = d.desc;
        stats = d.weapon ? `<p class="stat">${weaponLine(d.weapon)}</p>` : '';
      } else if (e instanceof ResourceNode) {
        key = '';
        role = 'Resource';
        desc = 'Right-click with a Harvester selected to mine it.';
      }
      info.innerHTML = `<div class="sel-icon team${e.team}">${key ? this.icon(key, e.name) : `<span class="big-glyph">${glyph('crystal')}</span>`}</div>`;
      const text = el('div', 'sel-text');
      text.innerHTML = `<div class="sel-name">${e.name}<span class="team${e.team}">${e.team === TEAM_PLAYER ? '' : teamName}</span></div><div class="role">${role}</div>`;
      const hpWrap = el('div', 'bar hp');
      hpWrap.appendChild(hpBar);
      const hpRow = el('div', 'hp-row');
      hpRow.append(hpWrap, hpText);
      if (!(e instanceof ResourceNode) && !e.invulnerable) text.appendChild(hpRow);
      text.appendChild(extra);
      const d2 = el('div', 'sel-desc', `<p>${desc}</p>${stats}`);
      info.append(text, d2);
      panel.appendChild(info);

      const mine = e.team === TEAM_PLAYER;
      if (e instanceof Unit && mine) this.addUnitCommands(cmds);
      if (e instanceof Building && mine && e.def.category !== 'neutral') {
        cmds.appendChild(this.cmdButton('repair', 'Repair', '', '<h4>Repair</h4><p>Toggle repairs. Costs credits while the structure is being restored.</p>'));
        if (e.def.produces && e.def.produces !== 'tech') {
          cmds.appendChild(this.cmdButton('primary', 'Primary', '', '<h4>Set Primary</h4><p>New units of this type will emerge from this building. Right-click the ground to set its rally point.</p>'));
        }
        cmds.appendChild(
          this.cmdButton('sell', 'Sell', '', `<h4>Sell</h4><p>Dismantle the structure for up to ${Math.round(SELL_REFUND * 100)}% of its cost (less when damaged).</p>`),
        );
      }

      this.selDynamic = () => {
        const f = Math.max(0, e.hp / e.maxHp);
        hpBar.style.width = `${f * 100}%`;
        hpBar.style.background = f > 0.6 ? '#4be06a' : f > 0.3 ? '#f2c641' : '#f0503c';
        hpText.textContent = `${Math.ceil(e.hp)} / ${Math.round(e.maxHp)}`;
        let x = '';
        if (e instanceof Unit) {
          if (e.hero) {
            const pl = world.players[e.team];
            x = `<span class="tag gold">Level ${pl.heroLevel}</span>`;
          } else if (e.def.weapon) {
            x = `<span class="tag ${e.rank ? 'gold' : ''}">${RANK_NAMES[e.rank]}</span><span class="tag">Kills ${e.kills}</span>`;
          }
          if (e.def.harvester) x += `<span class="tag cyan">Cargo ${Math.round(e.cargo)} / ${e.capacity(world)}</span>`;
          if (e.haste > 0) x += '<span class="tag gold">Rallied</span>';
          if (e.shield > 0) x += '<span class="tag cyan">Shielded</span>';
          if (e.stun > 0) x += '<span class="tag red">Disabled</span>';
        } else if (e instanceof Building) {
          if (e.def.capturable) {
            x = `<span class="tag">${e.team === TEAM_NEUTRAL ? 'Unclaimed' : `Held by ${TEAM_COLORS[e.team].name}`}</span>`;
            if (e.def.income) x += `<span class="tag gold">+$${e.def.income}/s</span>`;
            if (e.capProgress > 0) x += `<span class="tag cyan">Capturing ${Math.round(e.capProgress * 100)}%</span>`;
          } else if (mine) {
            if (e.rise < 1) x += `<span class="tag cyan">Deploying ${Math.round(e.rise * 100)}%</span>`;
            if (e.def.power) x += `<span class="tag ${e.def.power > 0 ? 'green' : ''}">${e.def.power > 0 ? '+' : ''}${e.def.power} power</span>`;
            if (e.primary) x += '<span class="tag gold">Primary</span>';
            if (e.repairing) x += '<span class="tag green">Repairing</span>';
            if (e.offline) x += '<span class="tag red">No power</span>';
          }
        } else if (e instanceof ResourceNode) {
          x = `<span class="tag cyan">${Math.round(e.amount)} Aurium left</span>`;
        }
        if (extra.innerHTML !== x) extra.innerHTML = x;
      };
    }
    panel.appendChild(cmds);
    this.selDynamic?.();
  }

  private addUnitCommands(cmds: HTMLElement): void {
    cmds.appendChild(this.cmdButton('attackMove', 'Attack-Move', 'A', '<h4>Attack-Move</h4><p>Advance to a point, engaging everything hostile on the way. Ctrl + right-click does the same.</p>'));
    cmds.appendChild(this.cmdButton('stop', 'Stop', 'S', '<h4>Stop</h4><p>Halt and cancel all orders. Parks Harvesters.</p>'));
    cmds.appendChild(this.cmdButton('hold', 'Hold', 'H', '<h4>Hold Position</h4><p>Stay put and only fire at enemies that come into range.</p>'));
  }

  private updateGroups(): void {
    const groups = this.host.input.groups;
    let html = '';
    for (let i = 1; i <= 9; i++) {
      const n = groups[i].filter((u) => u.alive).length;
      if (n) html += `<span class="grp" data-g="${i}"><b>${i}</b>${n}</span>`;
    }
    if (this.groupsEl.innerHTML !== html) this.groupsEl.innerHTML = html;
  }

  private updateObjectives(): void {
    if (!this.objectives.isConnected) return;
    let done = 0;
    OBJECTIVES.forEach((o, i) => {
      const ok = o.done(this.host.world);
      if (ok) done++;
      this.objectiveRows[i].classList.toggle('done', ok);
    });
    if (done > this.objectivesDone && this.host.world.time > 1) this.host.audio.play('ready');
    this.objectivesDone = done;
    // the last step is winning the match; hide once everything before it is done
    if (done >= OBJECTIVES.length - 1) {
      this.objectives.classList.add('complete');
      window.setTimeout(() => this.objectives.remove(), 2500);
    }
  }

  // ------------------------------------------------------------------ notices
  notify(text: string, kind: NoticeKind, x?: number, z?: number): void {
    const last = this.notices.lastElementChild as HTMLElement | null;
    if (last && last.dataset.text === text) return;
    const n = el('div', `notice ${kind}`, text);
    n.dataset.text = text;
    if (x !== undefined && z !== undefined) {
      n.classList.add('link');
      n.title = 'Click to view';
      n.addEventListener('click', () => this.host.renderer.cam.jumpTo(x, z));
      this.host.input.eventX = x;
      this.host.input.eventZ = z;
    }
    this.notices.appendChild(n);
    while (this.notices.children.length > 5) this.notices.firstElementChild?.remove();
    window.setTimeout(() => n.classList.add('out'), 5200);
    window.setTimeout(() => n.remove(), 5900);
  }

  ping(x: number, z: number, color: string): void {
    this.minimap.ping(x, z, color);
  }

  // ------------------------------------------------------------------ frame
  update(dt: number): void {
    const { world, input, renderer } = this.host;
    const p = world.players[TEAM_PLAYER];

    // credits tick toward the real value
    const diff = p.credits - this.shownCredits;
    this.shownCredits += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 10);
    const txt = `${Math.floor(this.shownCredits)}`;
    if (this.credits.textContent !== txt) this.credits.textContent = txt;

    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.08;
      this.minimap.draw(world, renderer.viewCorners(), 0.08);
    }

    if (input.selectionVersion !== this.selVersion) this.refreshSelection();

    this.slowT -= dt;
    if (this.slowT > 0) return;
    this.slowT = 0.1;

    this.powerText.textContent = `${p.powerUsed} / ${p.powerMade}`;
    this.powerBox.classList.toggle('low', p.lowPower);
    this.powerBar.style.width = `${Math.min(100, p.powerMade ? (p.powerUsed / p.powerMade) * 100 : p.powerUsed ? 100 : 0)}%`;
    for (let i = 0; i < MAX_REQUISITION; i++) {
      const f = Math.max(0, Math.min(1, p.req - i));
      const pip = this.reqPips[i];
      pip.classList.toggle('full', f >= 1);
      (pip.firstElementChild as HTMLElement).style.width = `${f * 100}%`;
    }
    this.clock.textContent = formatTime(world.time);

    const tokens = Math.floor(p.req);
    for (const b of this.powerButtons) {
      const def = POWER_DEFS[b.id];
      const cd = p.powerCooldowns[b.id] ?? 0;
      b.root.classList.toggle('disabled', tokens < def.cost || cd > 0);
      b.root.classList.toggle('cooling', cd > 0);
      b.root.classList.toggle('armed', input.targeting?.type === 'power' && input.targeting.id === b.id);
      b.cd.style.setProperty('--p', String(cd > 0 ? cd / def.cooldown : 0));
      b.cd.textContent = cd > 0 ? String(Math.ceil(cd)) : '';
    }

    let hint = '';
    if (input.placing) hint = `Placing ${BUILDING_DEFS[input.placing.defId].name} — left-click to build, right-click to cancel`;
    else if (input.targeting?.type === 'attackMove') hint = 'Attack-move — left-click a destination';
    else if (input.targeting?.type === 'ability') hint = `${p.heroDef.abilities[input.targeting.index].name} — choose a target`;
    else if (input.targeting?.type === 'power') hint = `${POWER_DEFS[input.targeting.id].name} — choose a target`;
    if (this.modeHint.textContent !== hint) this.modeHint.textContent = hint;
    this.modeHint.classList.toggle('show', hint !== '');

    this.updateSidebar();
    this.updateHero();
    this.updateGroups();
    this.updateObjectives();
    this.selDynamic?.();
    if (this.tipFn) this.showTip();
  }
}
