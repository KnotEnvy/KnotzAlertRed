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
import { art, el, pulse, setClass, setText, setVar } from './dom';
import { themeName } from './content';
import { emblem, glyph } from './glyphs';
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

const CREDIT = (n: number) => `<span class="cr">${glyph('credits')}</span>${Math.round(n).toLocaleString('en-US')}`;

function stat(label: string, value: string, cls = ''): string {
  return `<span class="st ${cls}"><i>${label}</i>${value}</span>`;
}

/** Weapon summary as labelled stat cells. */
function weaponStats(w: WeaponDef | undefined): string {
  if (!w) return `<div class="stats-row">${stat('Weapon', 'Unarmed', 'dim')}</div>`;
  const dps = Math.round((w.damage * (w.burst ?? 1)) / w.cooldown);
  const targets = w.hitsAir && w.hitsGround ? 'Ground + Air' : w.hitsAir ? 'Air only' : 'Ground only';
  return `<div class="stats-row">${stat('Damage', `${Math.round(w.damage)}${w.burst ? `×${w.burst}` : ''}<em>${w.type}</em>`)}${stat('DPS', String(dps))}${stat('Range', String(w.range))}${w.splash ? stat('Splash', String(w.splash)) : ''}${stat('Hits', targets)}</div>`;
}

function hpColor(f: number): string {
  return f > 0.6 ? 'var(--hp-good)' : f > 0.3 ? 'var(--hp-mid)' : 'var(--hp-low)';
}

interface BuildButton {
  id: string;
  root: HTMLButtonElement;
  prog: HTMLElement;
  count: HTMLElement;
  state: HTMLElement;
  req: HTMLElement;
  cost: number;
}

interface QueueRow {
  kind: QueueKind;
  root: HTMLButtonElement;
  img: HTMLImageElement;
  name: HTMLElement;
  n: HTMLElement;
  state: HTMLElement;
  head: string;
}

/** DOM heads-up display: resources, build sidebar, hero panel, selection card, minimap, notices. */
export class Hud {
  readonly root: HTMLElement;
  private minimap: Minimap;
  private tooltip: HTMLElement;
  private tipFn: (() => string) | null = null;
  private tipAnchor: HTMLElement | null = null;
  private tipHtml = '';
  private notices: HTMLElement;
  private creditsBox: HTMLElement;
  private credits: HTMLElement;
  private creditDelta: HTMLElement;
  private shownCredits = 0;
  private lastCredits = 0;
  private powerText: HTMLElement;
  private powerCap: HTMLElement;
  private powerState: HTMLElement;
  private powerBar: HTMLElement;
  private powerBox: HTMLElement;
  private reqBox: HTMLElement;
  private reqPips: HTMLElement[] = [];
  private reqWhole = -1;
  private clock: HTMLElement;
  private tabButtons: HTMLButtonElement[] = [];
  private grid: HTMLElement;
  private tabTitle: HTMLElement;
  private tabCount: HTMLElement;
  private buildButtons: BuildButton[] = [];
  private queueRows: QueueRow[] = [];
  private tab = 0;
  private powerButtons: { id: string; root: HTMLButtonElement; cd: HTMLElement; num: HTMLElement; pips: HTMLElement[]; avail: boolean }[] = [];
  private heroEls!: {
    root: HTMLElement; hp: HTMLElement; hpText: HTMLElement; xp: HTMLElement; xpText: HTMLElement; level: HTMLElement; lvText: HTMLElement; status: HTMLElement;
    abilities: { root: HTMLButtonElement; cd: HTMLElement; num: HTMLElement; lock: HTMLElement; ready: boolean }[];
  };
  private heroLevel = 1;
  private selPanel: HTMLElement;
  private selVersion = -1;
  private selDynamic: (() => void) | null = null;
  private groupsEl: HTMLElement;
  private groupsKey = '';
  private slowT = 0;
  private mapT = 0;
  private modeHint: HTMLElement;
  private alertEdge: HTMLElement;
  private objectives!: HTMLElement;
  private objectiveRows: HTMLElement[] = [];
  private objectiveCount!: HTMLElement;
  private objectivesDone = 0;
  private stalledFunds = false;
  private disposers: (() => void)[] = [];

  constructor(
    private host: HudHost,
    parent: HTMLElement,
  ) {
    const root = (this.root = el('div', 'hud'));
    parent.appendChild(root);
    const p = host.world.players[TEAM_PLAYER];
    root.style.setProperty('--hero', p.heroDef.accent);

    // ---------------------------------------------------------- alert edge (under attack)
    this.alertEdge = el('div', 'alert-edge', '<i class="e-l"></i><i class="e-r"></i><i class="e-t"></i><i class="e-b"></i>');
    root.appendChild(this.alertEdge);

    // ---------------------------------------------------------- top bar
    const top = el('div', 'topbar');
    const left = el('div', 'tb-left');
    left.appendChild(el('div', 'brand', `${emblem('brand-emblem')}<span>ALERT <b>RED</b></span>`));
    this.clock = el('span', 'clock-val', '0:00');
    const clockBox = el('div', 'clock', `<span class="clock-ico">${glyph('clock')}</span><span class="clock-label">Mission</span>`);
    clockBox.appendChild(this.clock);
    left.appendChild(clockBox);
    top.appendChild(left);

    this.modeHint = el('div', 'mode-hint');
    top.appendChild(this.modeHint);

    const right = el('div', 'tb-right');
    // requisition
    this.reqBox = el('div', 'res req', `<span class="res-ico">${glyph('star')}</span>`);
    const reqBody = el('div', 'res-body', '<span class="res-label">Requisition</span>');
    const pips = el('div', 'pips');
    for (let i = 0; i < MAX_REQUISITION; i++) {
      const pip = el('i');
      pip.appendChild(el('b'));
      pips.appendChild(pip);
      this.reqPips.push(pip);
    }
    reqBody.appendChild(pips);
    this.reqBox.appendChild(reqBody);
    this.tip(this.reqBox, () => {
      const pl = host.world.players[TEAM_PLAYER];
      return `<div class="tt-head"><span class="tt-title">Requisition</span><span class="tt-cost gold">${glyph('star')} ${Math.floor(pl.req)} / ${MAX_REQUISITION}</span></div><p>Command tokens spent on support powers. They accrue over time and from dealing damage; holding the <b>Signal Obelisk</b> nearly doubles the rate.</p>`;
    });
    right.appendChild(this.reqBox);

    // power
    this.powerBox = el('div', 'res power', `<span class="res-ico">${glyph('power')}</span>`);
    const pBody = el('div', 'res-body');
    const pLabel = el('span', 'res-label', 'Power ');
    this.powerState = el('b', 'pw-state', 'Offline');
    pLabel.appendChild(this.powerState);
    const pVal = el('span', 'res-val');
    this.powerText = el('span', '', '0');
    this.powerCap = el('small', '', '/ 0');
    pVal.append(this.powerText, this.powerCap);
    pBody.append(pLabel, pVal);
    this.powerBox.appendChild(pBody);
    const pb = el('div', 'pgauge');
    this.powerBar = el('i');
    pb.appendChild(this.powerBar);
    this.powerBox.appendChild(pb);
    this.tip(this.powerBox, () => {
      const pl = host.world.players[TEAM_PLAYER];
      const status = pl.lowPower ? '<p class="bad">Shortage: production runs at half speed and Arc Pylons are offline.</p>' : pl.powerMade - pl.powerUsed < 30 && pl.powerMade > 0 ? '<p class="warn">Running close to capacity. Build another Fusion Reactor before expanding.</p>' : '';
      return `<div class="tt-head"><span class="tt-title">Power grid</span><span class="tt-cost cyan">${pl.powerUsed} / ${pl.powerMade}</span></div><p>Demand <b>${pl.powerUsed}</b> of <b>${pl.powerMade}</b> supplied. When demand exceeds supply, production slows to half speed and Arc Pylons shut down.</p>${status}`;
    });
    right.appendChild(this.powerBox);

    // credits
    this.creditsBox = el('div', 'res credits', `<span class="res-ico">${glyph('credits')}</span>`);
    const cBody = el('div', 'res-body', '<span class="res-label">Credits</span>');
    this.credits = el('span', 'res-val', '0');
    cBody.appendChild(this.credits);
    this.creditsBox.appendChild(cBody);
    this.creditDelta = el('span', 'res-delta');
    this.creditsBox.appendChild(this.creditDelta);
    this.tip(this.creditsBox, () => '<div class="tt-head"><span class="tt-title">Credits</span></div><p>Earned by Harvesters delivering Aurium to a Refinery, and by captured Extractors. Production drains credits gradually as it progresses — if you run dry, it waits.</p>');
    right.appendChild(this.creditsBox);

    const helpBtn = el('button', 'tb-btn', glyph('help'));
    helpBtn.title = 'Field manual (/)';
    helpBtn.dataset.testid = 'btn-help';
    helpBtn.addEventListener('click', () => {
      host.audio.play('ui_open');
      host.toggleHelp();
    });
    const menuBtn = el('button', 'tb-btn', glyph('menu'));
    menuBtn.title = 'Menu (Esc)';
    menuBtn.dataset.testid = 'btn-menu';
    menuBtn.addEventListener('click', () => {
      host.audio.play('ui_open');
      host.togglePause();
    });
    right.append(helpBtn, menuBtn);
    top.appendChild(right);
    root.appendChild(top);

    // ---------------------------------------------------------- support powers
    const powers = el('div', 'powers');
    powers.appendChild(el('div', 'rack-label', `<span>Support</span><i></i>`));
    for (const id of POWER_ORDER) {
      const def = POWER_DEFS[id];
      const b = el('button', 'power-btn');
      b.dataset.testid = `power-${id}`;
      b.style.setProperty('--accent', def.color);
      b.innerHTML = `<span class="pw-ico">${glyph(def.id, def.glyph)}</span><span class="pname">${def.name}</span><span class="pcost">${'<i></i>'.repeat(def.cost)}</span>`;
      const cd = el('div', 'cd');
      const num = el('span', 'cd-num');
      b.append(cd, num);
      b.addEventListener('click', () => {
        host.audio.unlock();
        const pl = host.world.players[TEAM_PLAYER];
        const short = Math.floor(pl.req) < def.cost;
        if (short || (pl.powerCooldowns[id] ?? 0) > 0) {
          pulse(b, 'deny', 450);
          if (short) pulse(this.reqBox, 'deny', 450);
        } else host.audio.play('click');
        host.input.usePower(id);
      });
      this.tip(b, () => {
        const pl = host.world.players[TEAM_PLAYER];
        const left = pl.powerCooldowns[id] ?? 0;
        const tokens = Math.floor(pl.req);
        const need = tokens < def.cost ? `<p class="tt-req bad">${glyph('star')} Needs ${def.cost} Requisition — you have ${tokens}</p>` : '';
        return `<div class="tt-head"><span class="tt-title">${def.name}</span><span class="tt-cost gold">${glyph('star')} ${def.cost}</span></div><p>${def.desc}</p><div class="stats-row">${stat('Cooldown', `${def.cooldown}s`)}${def.radius ? stat('Radius', String(def.radius)) : ''}${stat('Target', def.targeting === 'point' ? 'Ground' : 'Instant')}</div>${left > 0 ? `<p class="tt-req warn">Recharging — ready in ${Math.ceil(left)}s</p>` : need}`;
      });
      powers.appendChild(b);
      this.powerButtons.push({ id, root: b, cd, num, pips: [...b.querySelectorAll<HTMLElement>('.pcost i')], avail: false });
    }
    root.appendChild(powers);

    this.notices = el('div', 'notices');
    root.appendChild(this.notices);

    // ---------------------------------------------------------- first-steps checklist
    this.objectives = el('div', 'objectives');
    const oh = el('h4', '', '<span>Directives</span>');
    this.objectiveCount = el('b', 'obj-count', `0/${OBJECTIVES.length}`);
    oh.appendChild(this.objectiveCount);
    this.objectives.appendChild(oh);
    for (const o of OBJECTIVES) {
      const row = el('div', 'obj', `<i>${glyph('check')}</i><span>${o.text}</span>`);
      this.objectives.appendChild(row);
      this.objectiveRows.push(row);
    }
    const dismiss = el('button', 'obj-close', glyph('close'));
    dismiss.title = 'Hide';
    dismiss.dataset.testid = 'objectives-close';
    dismiss.addEventListener('click', () => {
      host.audio.play('ui_close');
      this.objectives.remove();
    });
    this.objectives.appendChild(dismiss);
    root.appendChild(this.objectives);

    // ---------------------------------------------------------- sidebar
    const side = el('div', 'sidebar');
    const tabs = el('div', 'tabs');
    TABS.forEach((t, i) => {
      const b = el('button', 'tab', `<span class="tab-ico">${glyph(`tab_${t.kind}`)}</span><span class="tab-label">${t.label}</span><i class="led"></i><b class="tab-prog"></b>`);
      b.dataset.testid = `tab-${t.kind}`;
      b.title = t.title;
      b.addEventListener('click', () => {
        host.audio.unlock();
        if (i !== this.tab) host.audio.play('ui_tab');
        this.setTab(i);
      });
      tabs.appendChild(b);
      this.tabButtons.push(b);
    });
    side.appendChild(tabs);
    const head = el('div', 'tab-head');
    this.tabTitle = el('span', 'tab-title');
    this.tabCount = el('span', 'tab-count');
    head.append(this.tabTitle, this.tabCount);
    side.appendChild(head);
    this.grid = el('div', 'grid');
    side.appendChild(this.grid);

    // queue monitor: every active queue at a glance, whichever tab is open
    const monitor = el('div', 'queue-monitor');
    TABS.forEach((t, i) => {
      const r = el('button', 'qrow');
      r.dataset.testid = `queue-${t.kind}`;
      const img = el('img');
      img.alt = '';
      img.draggable = false;
      const name = el('span', 'q-name');
      const n = el('span', 'q-n');
      const state = el('span', 'q-state');
      r.append(img, name, n, state, el('i', 'q-bar'));
      r.style.display = 'none';
      r.addEventListener('click', () => {
        if (i !== this.tab) host.audio.play('ui_tab');
        this.setTab(i);
      });
      monitor.appendChild(r);
      this.queueRows.push({ kind: t.kind, root: r, img, name, n, state, head: '' });
    });
    side.appendChild(monitor);
    side.appendChild(el('div', 'side-hint', `<span><kbd class="mb">L</kbd> Build · place</span><span><kbd class="mb">R</kbd> Cancel · refund</span>`));
    root.appendChild(side);

    // ---------------------------------------------------------- bottom
    const bottom = el('div', 'bottom');
    const leftCol = el('div', 'left-col');
    leftCol.appendChild(this.buildHeroPanel());
    const mapWrap = el('div', 'minimap-wrap');
    mapWrap.appendChild(el('div', 'mm-head', `<span>Tactical</span><i></i><b>${themeName(host.world.config.theme)}</b>`));
    this.minimap = new Minimap(host.renderer.terrain.minimapImage, (x, z, button) => host.input.minimap(x, z, button));
    const mmFrame = el('div', 'mm-frame');
    mmFrame.appendChild(this.minimap.canvas);
    mmFrame.appendChild(el('span', 'mm-corners'));
    mapWrap.appendChild(mmFrame);
    leftCol.appendChild(mapWrap);
    bottom.appendChild(leftCol);

    const selWrap = el('div', 'sel-wrap');
    this.groupsEl = el('div', 'groups');
    selWrap.appendChild(this.groupsEl);
    this.selPanel = el('div', 'selection');
    selWrap.appendChild(this.selPanel);
    bottom.appendChild(selWrap);
    root.appendChild(bottom);

    this.tooltip = el('div', 'tooltip');
    root.appendChild(this.tooltip);

    this.shownCredits = p.credits;
    this.lastCredits = p.credits;
    this.heroLevel = p.heroLevel;
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
      this.tipHtml = '';
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
    const html = this.tipFn();
    if (html === this.tipHtml && tt.classList.contains('show')) return;
    this.tipHtml = html;
    tt.innerHTML = html;
    tt.classList.add('show');
    // the HUD may be zoomed on very large screens; positions below are in zoomed CSS px
    const zoom = parseFloat(getComputedStyle(this.root).zoom || '1') || 1;
    const vw = window.innerWidth / zoom;
    const vh = window.innerHeight / zoom;
    const rr = this.tipAnchor.getBoundingClientRect();
    const r = { left: rr.left / zoom, right: rr.right / zoom, top: rr.top / zoom, bottom: rr.bottom / zoom, height: rr.height / zoom };
    const tw = tt.offsetWidth;
    const th = tt.offsetHeight;
    let x: number;
    let y: number;
    const col = this.tipAnchor.closest('.left-col, .powers');
    if (r.left > vw * 0.62) {
      x = r.left - tw - 12;
      y = r.top;
    } else if (col) {
      // keep the left column readable: open to its right
      x = col.getBoundingClientRect().right / zoom + 12;
      y = r.top + r.height / 2 - th / 2;
    } else if (r.top > vh * 0.5) {
      x = r.left;
      y = r.top - th - 12;
    } else {
      x = r.left;
      y = r.bottom + 12;
    }
    tt.style.left = `${Math.max(8, Math.min(vw - tw - 8, x))}px`;
    tt.style.top = `${Math.max(8, Math.min(vh - th - 8, y))}px`;
  }

  // ------------------------------------------------------------------ sidebar
  private setTab(i: number): void {
    this.tab = i;
    const t = TABS[i];
    this.tabButtons.forEach((b, k) => b.classList.toggle('active', k === i));
    this.tabTitle.innerHTML = `${glyph(`tab_${t.kind}`)}${t.title}`;
    this.grid.innerHTML = '';
    this.grid.classList.remove('swap');
    void this.grid.offsetWidth;
    this.grid.classList.add('swap');
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
      b.innerHTML = `<span class="b-art">${img}</span><span class="bcost">${CREDIT(cost)}</span><span class="bname">${name}</span>`;
      const prog = el('div', 'prog');
      const count = el('span', 'count');
      const state = el('span', 'state');
      const req = el('span', 'req-txt');
      b.append(prog, count, state, el('span', 'lock-ico', glyph('lock')), req);
      b.addEventListener('click', () => this.onBuildClick(t.kind, id, b));
      b.addEventListener('mouseenter', () => this.host.audio.play('ui_hover'));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.host.world.cancel(TEAM_PLAYER, t.kind, id)) {
          this.host.audio.play('sell');
          pulse(b, 'cancelled', 350);
          if (this.host.input.placing?.defId === id) this.host.input.cancelModes();
        }
      });
      this.tip(b, () => this.buildTip(t.kind, id));
      this.grid.appendChild(b);
      this.buildButtons.push({ id, root: b, prog, count, state, req, cost });
    }
    this.updateSidebar();
  }

  private onBuildClick(kind: QueueKind, id: string, btn: HTMLElement): void {
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
      pulse(btn, 'deny', 450);
    } else {
      audio.play('click');
      pulse(btn, 'queued', 320);
    }
  }

  private buildTip(kind: QueueKind, id: string): string {
    const world = this.host.world;
    const p = world.players[TEAM_PLAYER];
    const why = world.queueBlock(TEAM_PLAYER, kind, id);
    const lock = why.startsWith('Requires') ? `<p class="tt-req bad">${glyph('lock')} ${why}</p>` : '';
    const hint = '<p class="tt-hint"><kbd class="mb">L</kbd> build · <kbd class="mb">R</kbd> cancel &amp; refund</p>';
    const head = (name: string, cost: number) => `<div class="tt-head"><span class="tt-title">${name}</span><span class="tt-cost ${p.credits < cost ? 'short' : ''}">${CREDIT(cost)}</span></div>`;
    if (kind === 'tech') {
      const d = UPGRADE_DEFS[id];
      const owned = p.upgrades.has(id);
      return `${head(d.name, d.cost)}<div class="tt-role">Research</div><p>${d.desc}</p><div class="stats-row">${stat('Time', `${d.buildTime}s`)}</div>${owned ? `<p class="tt-req good">${glyph('check')} Researched</p>` : lock}`;
    }
    if (kind === 'structure' || kind === 'defense') {
      const d = BUILDING_DEFS[id];
      const pw = d.power > 0 ? stat('Power', `+${d.power}`, 'good') : d.power < 0 ? stat('Power', String(d.power), 'warn') : '';
      return `${head(d.name, d.cost)}<div class="tt-role">${d.role}</div><p>${d.desc}</p>
        <div class="stats-row">${stat('HP', String(d.hp))}${pw}${stat('Build', `${d.buildTime}s`)}</div>${d.weapon ? weaponStats(d.weapon) : ''}${lock}${lock ? '' : hint}`;
    }
    const d = UNIT_DEFS[id];
    return `${head(d.name, d.cost)}<div class="tt-role">${d.role}</div><p>${d.desc}</p>
      <div class="stats-row">${stat('HP', String(d.hp))}${stat('Armour', d.armor)}${stat('Speed', String(d.speed))}${stat('Build', `${d.buildTime}s`)}</div>${weaponStats(d.weapon)}${lock}${lock ? '' : hint}`;
  }

  private itemName(kind: QueueKind, id: string): string {
    if (kind === 'tech') return UPGRADE_DEFS[id]?.name ?? id;
    if (kind === 'structure' || kind === 'defense') return BUILDING_DEFS[id]?.name ?? id;
    return UNIT_DEFS[id]?.name ?? id;
  }

  private updateSidebar(): void {
    const world = this.host.world;
    const p = world.players[TEAM_PLAYER];
    const t = TABS[this.tab];
    const q = p.queues[t.kind];
    let avail = 0;
    for (const b of this.buildButtons) {
      const why = world.queueBlock(TEAM_PLAYER, t.kind, b.id);
      const locked = why.startsWith('Requires');
      const owned = t.kind === 'tech' && p.upgrades.has(b.id);
      if (!locked && !owned) avail++;
      setClass(b.root, 'locked', locked);
      setClass(b.root, 'owned', owned);
      const n = q.count(b.id);
      const active = q.items[0]?.defId === b.id;
      const ready = active && q.ready;
      setClass(b.root, 'active', active && !ready);
      setClass(b.root, 'ready', ready);
      setClass(b.root, 'stalled', active && q.stalled !== '');
      setClass(b.root, 'poor', !active && !locked && !owned && p.credits < b.cost);
      setVar(b.prog, '--p', active ? q.items[0].progress.toFixed(3) : '0');
      setText(b.count, n > 1 || (n === 1 && !active) ? String(n) : '');
      setText(b.state, owned ? 'DONE' : ready ? 'READY' : active && q.stalled === 'funds' ? 'NO FUNDS' : active && q.stalled === 'producer' ? 'ON HOLD' : active ? `${Math.floor(q.items[0].progress * 100)}%` : '');
      setText(b.req, locked ? why.replace('Requires ', 'Needs ') : '');
      setClass(b.root, 'show-lock', locked && !owned);
    }
    setText(this.tabCount, `${avail}/${this.buildButtons.length} available`);
    let stalledFunds = false;
    TABS.forEach((tab, i) => {
      const tq = p.queues[tab.kind];
      const btn = this.tabButtons[i];
      setClass(btn, 'has-ready', tq.ready);
      setClass(btn, 'busy', tq.items.length > 0 && !tq.ready);
      setClass(btn, 'unavailable', world.producers(TEAM_PLAYER, tab.kind) === 0);
      setVar(btn, '--p', tq.items.length ? tq.items[0].progress.toFixed(3) : '0');
      if (tq.items.length && tq.stalled === 'funds') stalledFunds = true;

      // queue monitor row
      const row = this.queueRows[i];
      const headId = tq.items[0]?.defId ?? '';
      if (!headId) {
        if (row.head !== '') {
          row.head = '';
          row.root.style.display = 'none';
        }
        return;
      }
      if (row.head !== headId) {
        row.head = headId;
        row.root.style.display = '';
        const src = this.host.icons[headId];
        if (src) row.img.src = src;
        row.img.style.visibility = src ? '' : 'hidden';
        setText(row.name, this.itemName(tab.kind, headId));
      }
      setText(row.n, tq.items.length > 1 ? `+${tq.items.length - 1}` : '');
      setClass(row.root, 'ready', tq.ready);
      setClass(row.root, 'stalled', !tq.ready && tq.stalled !== '');
      setText(row.state, tq.ready ? 'READY' : tq.stalled === 'funds' ? 'NO FUNDS' : tq.stalled === 'producer' ? 'ON HOLD' : `${Math.floor(tq.items[0].progress * 100)}%`);
      setVar(row.root, '--p', tq.items[0].progress.toFixed(3));
    });
    if (stalledFunds && !this.stalledFunds) {
      pulse(this.creditsBox, 'deny', 600);
    }
    this.stalledFunds = stalledFunds;
    setClass(this.creditsBox, 'dry', stalledFunds);
  }

  // ------------------------------------------------------------------ hero panel
  private buildHeroPanel(): HTMLElement {
    const { world, input, audio } = this.host;
    const p = world.players[TEAM_PLAYER];
    const def = p.heroDef;
    const root = el('div', 'hero-panel');
    root.style.setProperty('--accent', def.accent);
    const portrait = el('button', 'portrait');
    portrait.dataset.testid = 'hero-portrait';
    portrait.innerHTML = `<span class="portrait-art" style="background-image:url(${art(`hero-${def.id}.webp`)})"></span>`;
    const status = el('span', 'hero-status');
    portrait.appendChild(status);
    const level = el('span', 'level');
    const lvText = el('b', '', '1');
    level.append(el('i', '', 'LV'), lvText);
    portrait.appendChild(level);
    portrait.addEventListener('click', () => {
      audio.unlock();
      audio.play('select');
      input.selectHero();
    });
    portrait.addEventListener('dblclick', () => input.selectHero(true));
    this.tip(portrait, () => {
      const pl = world.players[TEAM_PLAYER];
      const next = pl.heroLevel < HERO_XP.length ? `${Math.floor(pl.heroXp)} / ${HERO_XP[pl.heroLevel]} XP` : 'Max level';
      return `<div class="tt-head"><span class="tt-title">${def.name}</span><span class="tt-cost" style="color:${def.accent}">Level ${pl.heroLevel}</span></div><div class="tt-role">${def.title}</div><p>${def.lore}</p><div class="stats-row">${stat('XP', next)}</div><p class="dim">Gains XP from kills made by the hero or allies nearby. Revives at the Command Center.</p><p class="tt-hint"><kbd>F1</kbd> select · double-click to centre the camera</p>`;
    });
    const head = el('div', 'hero-head');
    head.appendChild(portrait);

    const body = el('div', 'hero-body');
    body.appendChild(el('div', 'hero-name', `${def.name}<span>${def.title}</span>`));
    const hpWrap = el('div', 'hbar hp');
    const hp = el('i');
    const hpText = el('span', 'hbar-text');
    hpWrap.append(hp, hpText);
    const xpRow = el('div', 'xp-row');
    const xpWrap = el('div', 'hbar xp');
    const xp = el('i');
    xpWrap.appendChild(xp);
    const xpText = el('span', 'xp-text');
    xpRow.append(el('span', 'xp-label', 'XP'), xpWrap, xpText);
    body.append(hpWrap, xpRow);
    const abRow = el('div', 'abilities');
    const abilities: { root: HTMLButtonElement; cd: HTMLElement; num: HTMLElement; lock: HTMLElement; ready: boolean }[] = [];
    def.abilities.forEach((a, i) => {
      const b = el('button', 'ability');
      b.dataset.testid = `ability-${i}`;
      b.style.setProperty('--accent', a.color);
      b.innerHTML = `<span class="glyph">${glyph(a.id, a.glyph)}</span><span class="key">${a.key}</span>`;
      const cd = el('div', 'cd');
      const num = el('span', 'cd-num');
      const lock = el('span', 'lock', `${glyph('lock')}<b>LV${a.unlockLevel}</b>`);
      b.append(cd, num, lock);
      b.addEventListener('click', () => {
        audio.unlock();
        const pl = world.players[TEAM_PLAYER];
        if (pl.heroLevel < a.unlockLevel || pl.abilityCooldowns[i] > 0 || !pl.hero) pulse(b, 'deny', 450);
        else audio.play('click');
        input.useAbility(i);
      });
      this.tip(b, () => {
        const pl = world.players[TEAM_PLAYER];
        const left = pl.abilityCooldowns[i];
        const locked = pl.heroLevel < a.unlockLevel;
        const ult = a.desc.startsWith('ULTIMATE');
        const desc = a.desc.replace('ULTIMATE · ', '');
        return `<div class="tt-head"><span class="tt-title">${a.name}</span><kbd>${a.key}</kbd></div>${ult ? '<div class="tt-role gold">Ultimate</div>' : ''}<p>${desc}</p><div class="stats-row">${stat('Cooldown', `${a.cooldown}s`)}${a.range ? stat('Range', String(a.range)) : ''}${a.radius ? stat('Radius', String(a.radius)) : ''}${stat('Target', a.targeting === 'point' ? 'Ground' : 'Self')}</div>${locked ? `<p class="tt-req bad">${glyph('lock')} Unlocks at hero level ${a.unlockLevel}</p>` : left > 0 ? `<p class="tt-req warn">Recharging — ready in ${Math.ceil(left)}s</p>` : ''}`;
      });
      abRow.appendChild(b);
      abilities.push({ root: b, cd, num, lock, ready: true });
    });
    head.appendChild(body);
    root.append(head, abRow);
    this.heroEls = { root, hp, hpText, xp, xpText, level, lvText, status, abilities };
    return root;
  }

  private updateHero(): void {
    const p = this.host.world.players[TEAM_PLAYER];
    const h = p.hero;
    const e = this.heroEls;
    setClass(e.root, 'dead', !h);
    setText(e.lvText, String(p.heroLevel));
    if (p.heroLevel > this.heroLevel) {
      pulse(e.root, 'levelup', 1400);
      this.host.audio.play('levelup');
    }
    this.heroLevel = p.heroLevel;
    setText(e.status, h ? '' : `${Math.ceil(Math.max(0, p.heroRespawn))}s`);
    const f = h ? Math.max(0, h.hp / h.maxHp) : 0;
    setVar(e.hp, '--f', f.toFixed(3));
    setVar(e.hp, '--hc', hpColor(f));
    setText(e.hpText, h ? `${Math.ceil(h.hp)} / ${Math.round(h.maxHp)}` : 'Reviving');
    const lo = HERO_XP[p.heroLevel - 1] ?? 0;
    const hi = HERO_XP[p.heroLevel];
    setVar(e.xp, '--f', hi ? Math.min(1, (p.heroXp - lo) / (hi - lo)).toFixed(3) : '1');
    setText(e.xpText, hi ? `${Math.floor(p.heroXp - lo)}/${hi - lo}` : 'MAX');
    p.heroDef.abilities.forEach((a, i) => {
      const b = e.abilities[i];
      const locked = p.heroLevel < a.unlockLevel;
      const cd = p.abilityCooldowns[i];
      setClass(b.root, 'locked', locked);
      setClass(b.root, 'cooling', cd > 0);
      setClass(b.root, 'armed', this.host.input.targeting?.type === 'ability' && this.host.input.targeting.index === i);
      setVar(b.cd, '--p', cd > 0 ? (cd / a.cooldown).toFixed(3) : '0');
      setText(b.num, cd > 0 ? String(Math.ceil(cd)) : '');
      b.lock.style.display = locked ? '' : 'none';
      const ready = !locked && cd <= 0 && !!h;
      if (ready && !b.ready) pulse(b.root, 'flash', 900);
      b.ready = ready;
    });
  }

  // ------------------------------------------------------------------ selection panel
  private icon(key: string, fallback: string): string {
    const src = this.host.icons[key];
    return src ? `<img src="${src}" alt="" draggable="false">` : `<span class="big-glyph">${fallback.charAt(0)}</span>`;
  }

  private cmdButton(id: Parameters<Input['command']>[0], label: string, key: string, tipHtml: string): HTMLButtonElement {
    const b = el('button', 'cmd', `<span class="cmd-ico">${glyph(id)}</span><span class="cmd-label">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}`);
    b.dataset.testid = `cmd-${id}`;
    b.addEventListener('click', () => {
      this.host.audio.unlock();
      this.host.audio.play('ui_click');
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
    panel.className = 'selection';

    if (!sel.length) {
      panel.classList.add('empty');
      panel.innerHTML = `<div class="sel-hint"><b>No selection</b><span><kbd class="mb">L</kbd> drag to select</span><span><kbd class="mb">R</kbd> move · attack · harvest · capture</span><span><kbd>A</kbd> attack-move</span><span><kbd>F1</kbd> hero</span><span><kbd>F2</kbd> army</span><span><kbd>/</kbd> field manual</span></div>`;
      return;
    }
    const cmds = el('div', 'cmds');

    if (sel.length > 1) {
      panel.classList.add('multi');
      const units = sel as Unit[];
      const wrap = el('div', 'sel-multi-wrap');
      const counts = new Map<string, number>();
      for (const u of units) counts.set(u.def.name, (counts.get(u.def.name) ?? 0) + 1);
      const summary = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => `<span>${c}× ${n}</span>`).join('');
      wrap.appendChild(el('div', 'sel-summary', `<b>${units.length} units</b>${summary}`));
      const info = el('div', 'sel-multi');
      const shown = units.slice(0, 30);
      const bars: { u: Unit; bar: HTMLElement }[] = [];
      shown.forEach((u, k) => {
        const c = el('button', 'mini', this.icon(u.def.id, u.def.name));
        c.dataset.testid = `sel-${k}`;
        if (u.hero) c.classList.add('hero');
        if (u.rank > 0) c.appendChild(el('span', `mini-rank r${u.rank}`));
        const bar = el('i');
        c.appendChild(bar);
        c.addEventListener('click', (ev) => {
          this.host.audio.play('select');
          if (ev.shiftKey) input.select([u], true);
          else input.select([u]);
        });
        info.appendChild(c);
        bars.push({ u, bar });
      });
      if (units.length > shown.length) info.appendChild(el('div', 'mini more', `+${units.length - shown.length}`));
      wrap.appendChild(info);
      panel.appendChild(wrap);
      this.selDynamic = () => {
        for (const { u, bar } of bars) {
          const f = Math.max(0, u.hp / u.maxHp);
          setVar(bar, '--f', f.toFixed(3));
          setVar(bar, '--hc', hpColor(f));
          setClass(bar.parentElement as HTMLElement, 'gone', !u.alive);
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
        stats = `${weaponStats(d.weapon)}<div class="stats-row">${stat('Armour', d.armor)}${stat('Speed', String(d.speed))}${stat('Sight', String(d.sight))}</div>`;
      } else if (e instanceof Building) {
        const d: BuildingDef = e.def;
        key = d.id;
        role = d.role;
        desc = d.desc;
        stats = d.weapon ? weaponStats(d.weapon) : '';
      } else if (e instanceof ResourceNode) {
        key = '';
        role = 'Resource';
        desc = 'Aurium crystal field. Right-click it with a Harvester selected to mine it.';
      }
      panel.classList.add(`sel-t${e.team}`);
      info.innerHTML = `<div class="sel-icon team${e.team}">${key ? this.icon(key, e.name) : `<span class="big-glyph">${glyph('crystal')}</span>`}</div>`;
      const text = el('div', 'sel-text');
      text.innerHTML = `<div class="sel-name">${e.name}</div><div class="role">${e.team === TEAM_PLAYER ? '' : `<span class="team${e.team}">${teamName}</span> · `}${role}</div>`;
      const hpWrap = el('div', 'hbar hp');
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
        cmds.appendChild(this.cmdButton('repair', 'Repair', '', '<div class="tt-head"><span class="tt-title">Repair</span></div><p>Toggle repairs. Costs credits while the structure is being restored.</p>'));
        if (e.def.produces && e.def.produces !== 'tech') {
          cmds.appendChild(this.cmdButton('primary', 'Primary', '', '<div class="tt-head"><span class="tt-title">Set primary</span></div><p>New units of this type emerge from this building. Right-click the ground to set its rally point.</p>'));
        }
        cmds.appendChild(
          this.cmdButton('sell', 'Sell', '', `<div class="tt-head"><span class="tt-title">Sell</span></div><p>Dismantle the structure for up to ${Math.round(SELL_REFUND * 100)}% of its cost (less when damaged).</p>`),
        );
      }

      this.selDynamic = () => {
        const f = Math.max(0, e.hp / e.maxHp);
        setVar(hpBar, '--f', f.toFixed(3));
        setVar(hpBar, '--hc', hpColor(f));
        setText(hpText, `${Math.ceil(e.hp)} / ${Math.round(e.maxHp)}`);
        let x = '';
        if (e instanceof Unit) {
          if (e.hero) {
            const pl = world.players[e.team];
            x = `<span class="tag gold">Level ${pl.heroLevel}</span>`;
          } else if (e.def.weapon) {
            x = `<span class="tag ${e.rank ? 'gold' : ''}">${e.rank ? '<i class="chev"></i>'.repeat(e.rank) : ''}${RANK_NAMES[e.rank]}</span><span class="tag">Kills ${e.kills}</span>`;
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
    if (cmds.childElementCount) panel.appendChild(cmds);
    this.selDynamic?.();
  }

  private addUnitCommands(cmds: HTMLElement): void {
    cmds.appendChild(this.cmdButton('attackMove', 'Attack-Move', 'A', '<div class="tt-head"><span class="tt-title">Attack-move</span><kbd>A</kbd></div><p>Advance to a point, engaging everything hostile on the way. Ctrl + right-click does the same.</p>'));
    cmds.appendChild(this.cmdButton('stop', 'Stop', 'S', '<div class="tt-head"><span class="tt-title">Stop</span><kbd>S</kbd></div><p>Halt and cancel all orders. Parks Harvesters.</p>'));
    cmds.appendChild(this.cmdButton('hold', 'Hold', 'H', '<div class="tt-head"><span class="tt-title">Hold position</span><kbd>H</kbd></div><p>Stay put and only fire at enemies that come into range.</p>'));
  }

  private updateGroups(): void {
    const groups = this.host.input.groups;
    let key = '';
    for (let i = 1; i <= 9; i++) {
      let n = 0;
      for (const u of groups[i]) if (u.alive) n++;
      if (n) key += `${i}:${n},`;
    }
    if (key === this.groupsKey) return;
    this.groupsKey = key;
    let html = '';
    for (const part of key.split(',')) {
      if (!part) continue;
      const [g, n] = part.split(':');
      html += `<span class="grp" data-g="${g}"><b>${g}</b>${n}</span>`;
    }
    this.groupsEl.innerHTML = html;
  }

  private updateObjectives(): void {
    if (!this.objectives.isConnected) return;
    let done = 0;
    OBJECTIVES.forEach((o, i) => {
      const ok = o.done(this.host.world);
      if (ok) done++;
      const row = this.objectiveRows[i];
      if (ok && !row.classList.contains('done')) {
        row.classList.add('done');
        if (this.host.world.time > 1) pulse(row, 'just', 1200);
      }
    });
    if (done > this.objectivesDone && this.host.world.time > 1) this.host.audio.play('objective');
    this.objectivesDone = done;
    setText(this.objectiveCount, `${done}/${OBJECTIVES.length}`);
    // the last step is winning the match; hide once everything before it is done
    if (done >= OBJECTIVES.length - 1 && !this.objectives.classList.contains('complete')) {
      this.objectives.classList.add('complete');
      window.setTimeout(() => this.objectives.remove(), 2500);
    }
  }

  // ------------------------------------------------------------------ notices
  notify(text: string, kind: NoticeKind, x?: number, z?: number): void {
    const last = this.notices.lastElementChild as HTMLElement | null;
    if (last && last.dataset.text === text && !last.classList.contains('out')) {
      const n = Number(last.dataset.count ?? '1') + 1;
      last.dataset.count = String(n);
      last.classList.add('repeat');
      pulse(last, 'bump', 300);
      return;
    }
    const icon = kind === 'info' ? 'info' : kind;
    const n = el('div', `notice ${kind}`, `<span class="n-ico">${glyph(icon)}</span><span class="n-text"></span>`);
    (n.lastElementChild as HTMLElement).textContent = text;
    n.dataset.text = text;
    if (x !== undefined && z !== undefined) {
      n.classList.add('link');
      n.title = 'Click to view (Space)';
      n.addEventListener('click', () => this.host.renderer.cam.jumpTo(x, z));
      this.host.input.eventX = x;
      this.host.input.eventZ = z;
      if (kind === 'bad') this.alarm(x, z);
    }
    this.notices.appendChild(n);
    while (this.notices.children.length > 5) this.notices.firstElementChild?.remove();
    window.setTimeout(() => n.classList.add('out'), 5200);
    window.setTimeout(() => n.remove(), 5800);
  }

  /** Flash the screen edge toward an off-screen threat (or all edges when it is in view). */
  private alarm(x: number, z: number): void {
    const cam = this.host.renderer.cam;
    const sp = cam.project(x, this.host.world.groundY(x, z), z, { x: 0, y: 0, w: 0 });
    const w = window.innerWidth;
    const h = window.innerHeight;
    const edge = this.alertEdge;
    const sides: Record<string, boolean> = {};
    if (sp.w <= 0) sides['e-b'] = true;
    else {
      if (sp.x < w * 0.15) sides['e-l'] = true;
      if (sp.x > w * 0.85) sides['e-r'] = true;
      if (sp.y < h * 0.12) sides['e-t'] = true;
      if (sp.y > h * 0.8) sides['e-b'] = true;
    }
    const any = Object.keys(sides).length > 0;
    for (const c of ['e-l', 'e-r', 'e-t', 'e-b']) {
      edge.querySelector(`.${c}`)?.classList.toggle('on', !any || !!sides[c]);
    }
    pulse(edge, 'fire', 2600);
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
    this.shownCredits += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 8);
    setText(this.credits, Math.floor(this.shownCredits).toLocaleString('en-US'));
    const jump = p.credits - this.lastCredits;
    if (jump >= 40) {
      setText(this.creditDelta, `+${Math.round(jump).toLocaleString('en-US')}`);
      pulse(this.creditsBox, 'gain', 900);
    }
    this.lastCredits = p.credits;

    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.08;
      this.minimap.draw(world, renderer.viewCorners(), 0.08);
    }

    if (input.selectionVersion !== this.selVersion) this.refreshSelection();

    this.slowT -= dt;
    if (this.slowT > 0) return;
    this.slowT = 0.1;

    setText(this.powerText, String(p.powerUsed));
    setText(this.powerCap, `/ ${p.powerMade}`);
    const tight = !p.lowPower && p.powerMade > 0 && p.powerMade - p.powerUsed < 30;
    setClass(this.powerBox, 'low', p.lowPower);
    setClass(this.powerBox, 'tight', tight);
    setText(this.powerState, p.lowPower ? 'Shortage' : p.powerMade === 0 ? 'Offline' : tight ? 'Strained' : 'Stable');
    setVar(this.powerBar, '--f', Math.min(1, p.powerMade ? p.powerUsed / p.powerMade : p.powerUsed ? 1 : 0).toFixed(3));
    for (let i = 0; i < MAX_REQUISITION; i++) {
      const f = Math.max(0, Math.min(1, p.req - i));
      const pip = this.reqPips[i];
      setClass(pip, 'full', f >= 1);
      setVar(pip.firstElementChild as HTMLElement, '--f', f.toFixed(3));
    }
    const whole = Math.floor(p.req);
    if (whole > this.reqWhole && this.reqWhole >= 0) pulse(this.reqBox, 'gain', 900);
    this.reqWhole = whole;
    setText(this.clock, formatTime(world.time));

    for (const b of this.powerButtons) {
      const def = POWER_DEFS[b.id];
      const cd = p.powerCooldowns[b.id] ?? 0;
      const avail = whole >= def.cost && cd <= 0;
      setClass(b.root, 'disabled', !avail);
      setClass(b.root, 'cooling', cd > 0);
      setClass(b.root, 'armed', input.targeting?.type === 'power' && input.targeting.id === b.id);
      setVar(b.cd, '--p', cd > 0 ? (cd / def.cooldown).toFixed(3) : '0');
      setText(b.num, cd > 0 ? `${Math.ceil(cd)}s` : '');
      b.pips.forEach((pip, k) => setClass(pip, 'have', k < whole));
      if (avail && !b.avail && world.time > 1) pulse(b.root, 'flash', 900);
      b.avail = avail;
    }

    let hint = '';
    if (input.placing) hint = `<b>Placing ${BUILDING_DEFS[input.placing.defId].name}</b><span><kbd class="mb">L</kbd> build</span><span><kbd class="mb">R</kbd> cancel</span>`;
    else if (input.targeting?.type === 'attackMove') hint = '<b>Attack-move</b><span><kbd class="mb">L</kbd> choose a destination</span>';
    else if (input.targeting?.type === 'ability') hint = `<b>${p.heroDef.abilities[input.targeting.index].name}</b><span><kbd class="mb">L</kbd> choose a target</span><span><kbd>Esc</kbd> cancel</span>`;
    else if (input.targeting?.type === 'power') hint = `<b>${POWER_DEFS[input.targeting.id].name}</b><span><kbd class="mb">L</kbd> choose a target</span><span><kbd>Esc</kbd> cancel</span>`;
    if (this.modeHint.dataset.html !== hint) {
      this.modeHint.dataset.html = hint;
      if (hint) this.modeHint.innerHTML = hint;
    }
    setClass(this.modeHint, 'show', hint !== '');

    this.updateSidebar();
    this.updateHero();
    this.updateGroups();
    this.updateObjectives();
    this.selDynamic?.();
    if (this.tipFn) this.showTip();
  }
}
