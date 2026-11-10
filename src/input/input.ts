import { CELL, TEAM_PLAYER } from '../core/config';
import { dist } from '../core/math';
import type { AudioManager } from '../audio/audio';
import { BUILDING_DEFS } from '../data/buildings';
import { POWER_DEFS } from '../data/heroes';
import type { DragRect } from '../render/overlay';
import type { FrameView, Renderer } from '../render/renderer';
import type { ScreenPoint } from '../render/camera';
import { Building } from '../sim/building';
import { orderAttack, orderHarvest, orderHold, orderMove, orderStop } from '../sim/commands';
import type { Entity } from '../sim/entity';
import { ResourceNode } from '../sim/entity';
import type { NoticeKind } from '../sim/hooks';
import { Unit, makeOrder } from '../sim/unit';
import type { World } from '../sim/world';
import { CURSORS } from '../ui/cursors';

export type Targeting = { type: 'attackMove' } | { type: 'ability'; index: number } | { type: 'power'; id: string };

export interface InputHost {
  world: World;
  renderer: Renderer;
  audio: AudioManager;
  notify(text: string, kind: NoticeKind): void;
  togglePause(): void;
  toggleHelp(): void;
  isBlocked(): boolean; // true while a menu is open or the match is over
  edgeScroll(): boolean;
}

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Mouse/keyboard handling: selection, context commands, placement and targeting modes. */
export class Input {
  selection: Entity[] = [];
  readonly selectedSet = new Set<Entity>();
  /** Bumped whenever the selection changes so the HUD can refresh. */
  selectionVersion = 0;
  placing: { kind: 'structure' | 'defense'; defId: string } | null = null;
  targeting: Targeting | null = null;
  drag: DragRect | null = null;
  groups: Entity[][] = Array.from({ length: 10 }, () => []);
  mouseX = 0;
  mouseY = 0;
  private mouseInside = false;
  private overCanvas = false;
  private keys = new Set<string>();
  private rotating = false;
  private lastClickTime = 0;
  private lastClickDef = '';
  private lastGroupKey = -1;
  private lastGroupTime = 0;
  private lastHeroSelect = 0;
  /** Last place something noteworthy happened (Space jumps there). */
  eventX = -1;
  eventZ = -1;
  private sp: ScreenPoint = { x: 0, y: 0, w: 0 };
  private disposers: (() => void)[] = [];

  constructor(
    private host: InputHost,
    private canvas: HTMLCanvasElement,
  ) {
    const on = <K extends keyof WindowEventMap>(target: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(canvas, 'pointerdown', (e: MouseEvent) => this.onDown(e));
    on(window, 'pointerup', (e: MouseEvent) => this.onUp(e));
    on(window, 'pointermove', (e: MouseEvent) => this.onMove(e));
    on(canvas, 'wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    on(canvas, 'pointerenter', () => (this.overCanvas = true));
    on(canvas, 'pointerleave', () => (this.overCanvas = false));
    on(document, 'mouseleave', () => (this.mouseInside = false));
    on(document, 'mouseenter', () => (this.mouseInside = true));
    on(window, 'keydown', (e: KeyboardEvent) => this.onKeyDown(e));
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => {
      this.keys.clear();
      this.drag = null;
      this.rotating = false;
    });
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }

  private get world(): World {
    return this.host.world;
  }
  private get cam() {
    return this.host.renderer.cam;
  }

  // ------------------------------------------------------------------ selection
  select(list: Entity[], additive = false): void {
    if (additive) {
      for (const e of list) {
        if (this.selectedSet.has(e)) this.selection = this.selection.filter((s) => s !== e);
        else this.selection.push(e);
      }
      // mixed selections are limited to the player's own units
      if (this.selection.length > 1) this.selection = this.selection.filter((e) => e.kind === 'unit' && e.team === TEAM_PLAYER);
    } else {
      this.selection = list.slice();
    }
    this.syncSelection();
  }

  private syncSelection(): void {
    this.selectedSet.clear();
    for (const e of this.selection) this.selectedSet.add(e);
    this.selectionVersion++;
  }

  selectedUnits(): Unit[] {
    const out: Unit[] = [];
    for (const e of this.selection) {
      if (e.kind === 'unit' && e.team === TEAM_PLAYER && e.alive) out.push(e as Unit);
    }
    return out;
  }

  selectHero(center = false): void {
    const h = this.world.players[TEAM_PLAYER].hero;
    if (!h || !h.alive) return;
    const now = performance.now();
    if (center || now - this.lastHeroSelect < 350) this.cam.jumpTo(h.x, h.z);
    this.lastHeroSelect = now;
    this.select([h]);
    this.host.audio.play('select');
  }

  selectArmy(): void {
    const army = this.world.units.filter((u) => u.team === TEAM_PLAYER && u.alive && !u.def.harvester);
    if (army.length) {
      this.select(army);
      this.host.audio.play('select');
    }
  }

  // ------------------------------------------------------------------ modes
  startPlacing(kind: 'structure' | 'defense', defId: string): void {
    this.targeting = null;
    this.placing = { kind, defId };
  }

  startTargeting(t: Targeting): void {
    this.placing = null;
    this.targeting = t;
  }

  cancelModes(): boolean {
    if (this.placing || this.targeting) {
      this.placing = null;
      this.targeting = null;
      return true;
    }
    return false;
  }

  /** Trigger a hero ability from the HUD or a hotkey. */
  useAbility(index: number): void {
    const w = this.world;
    const p = w.players[TEAM_PLAYER];
    const h = p.hero;
    const def = p.heroDef.abilities[index];
    if (!h || !h.alive) {
      this.fail('Your hero is being revived');
      return;
    }
    if (p.heroLevel < def.unlockLevel) {
      this.fail(`${def.name} unlocks at hero level ${def.unlockLevel}`);
      return;
    }
    if (p.abilityCooldowns[index] > 0) {
      this.fail(`${def.name} is recharging`);
      return;
    }
    if (def.targeting === 'self') {
      w.castAbility(h, index, h.x, h.z);
      return;
    }
    this.startTargeting({ type: 'ability', index });
  }

  usePower(id: string): void {
    const w = this.world;
    const p = w.players[TEAM_PLAYER];
    const def = POWER_DEFS[id];
    if ((p.powerCooldowns[id] ?? 0) > 0) {
      this.fail(`${def.name} is recharging`);
      return;
    }
    if (Math.floor(p.req) < def.cost) {
      this.fail(`Needs ${def.cost} Requisition`);
      return;
    }
    if (def.targeting === 'self') {
      const why = w.usePower(TEAM_PLAYER, id, 0, 0);
      if (why) this.fail(why);
      return;
    }
    this.startTargeting({ type: 'power', id });
  }

  private fail(msg: string): void {
    this.host.notify(msg, 'warn');
    this.host.audio.play('error');
  }

  /** Command-card actions for the current selection. */
  command(id: 'stop' | 'hold' | 'attackMove' | 'sell' | 'repair' | 'primary'): void {
    const units = this.selectedUnits();
    const b = this.selection[0] instanceof Building && this.selection[0].team === TEAM_PLAYER ? (this.selection[0] as Building) : null;
    switch (id) {
      case 'stop':
        orderStop(units);
        break;
      case 'hold':
        orderHold(units);
        break;
      case 'attackMove':
        if (units.length) this.startTargeting({ type: 'attackMove' });
        break;
      case 'sell':
        if (b && b.def.category !== 'neutral') {
          this.world.sellBuilding(b);
          this.select([]);
        }
        break;
      case 'repair':
        if (b && b.hp < b.maxHp) b.repairing = !b.repairing;
        break;
      case 'primary':
        if (b && b.def.produces) {
          this.world.setPrimary(b);
          this.host.notify(`${b.def.name} set as primary`, 'info');
        }
        break;
    }
    this.host.audio.play('click');
    this.selectionVersion++;
  }

  // ------------------------------------------------------------------ picking
  private ppu(): number {
    return this.canvas.clientHeight / (2 * Math.tan(this.cam.camera.fov / 2) * this.cam.dist);
  }

  pick(sx: number, sy: number): Entity | null {
    const w = this.world;
    const cam = this.cam;
    const ppu = this.ppu();
    const sp = this.sp;
    let best: Entity | null = null;
    let bd = 1e9;
    for (const u of w.units) {
      if (!u.alive || !u.visible) continue;
      cam.project(u.x, w.groundY(u.x, u.z) + u.alt + u.height * 0.5, u.z, sp);
      if (sp.w <= 0) continue;
      const r = Math.max(13, u.radius * ppu * 1.15);
      const d = Math.hypot(sp.x - sx, sp.y - sy);
      if (d <= r && d < bd) {
        bd = d;
        best = u;
      }
    }
    if (best) return best;
    const g = cam.screenToGround(sx, sy);
    for (const b of w.buildings) {
      if (!b.alive || !(b.visible || b.seen)) continue;
      if (g && b.contains(g.x, g.z, 0.4)) return b;
      cam.project(b.x, w.groundY(b.x, b.z) + b.height * 0.5, b.z, sp);
      if (sp.w <= 0) continue;
      const d = Math.hypot(sp.x - sx, sp.y - sy);
      if (d <= b.radius * ppu * 0.7 && d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best) return best;
    if (g) {
      for (const n of w.nodes) {
        if (n.alive && n.visible && dist(n.x, n.z, g.x, g.z) < 1.9) return n;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ mouse
  private local(e: MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onDown(e: MouseEvent): void {
    this.host.audio.unlock();
    if (this.host.isBlocked()) return;
    const [x, y] = this.local(e);
    if (e.button === 1) {
      this.rotating = true;
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      if (this.cancelModes()) return;
      this.contextCommand(x, y, e.shiftKey, e.ctrlKey);
      return;
    }
    if (e.button !== 0) return;
    if (this.placing) {
      this.tryPlace(x, y);
      return;
    }
    if (this.targeting) {
      this.resolveTarget(x, y, e.shiftKey);
      return;
    }
    this.drag = { x0: x, y0: y, x1: x, y1: y };
  }

  private onMove(e: MouseEvent): void {
    const [x, y] = this.local(e);
    if (this.rotating) this.cam.rotate(e.movementX * 0.006);
    this.mouseX = x;
    this.mouseY = y;
    this.mouseInside = true;
    if (this.drag) {
      this.drag.x1 = x;
      this.drag.y1 = y;
    }
  }

  private onUp(e: MouseEvent): void {
    if (e.button === 1) {
      this.rotating = false;
      return;
    }
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag;
    this.drag = null;
    if (this.host.isBlocked()) return;
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    if (w < 6 && h < 6) this.clickSelect(d.x1, d.y1, e.shiftKey);
    else this.boxSelect(d, e.shiftKey);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.host.isBlocked()) return;
    this.cam.zoom(Math.sign(e.deltaY) * 0.12);
  }

  private clickSelect(x: number, y: number, shift: boolean): void {
    const e = this.pick(x, y);
    const now = performance.now();
    if (!e) {
      if (!shift) this.select([]);
      return;
    }
    if (e.kind === 'unit' && e.team === TEAM_PLAYER) {
      const u = e as Unit;
      if (now - this.lastClickTime < 320 && this.lastClickDef === u.def.id) {
        // double click: everything of this type on screen
        const sp = this.sp;
        const cw = this.canvas.clientWidth;
        const ch = this.canvas.clientHeight;
        const same = this.world.units.filter((o) => {
          if (o.team !== TEAM_PLAYER || o.def.id !== u.def.id || !o.alive) return false;
          this.cam.project(o.x, 0, o.z, sp);
          return sp.w > 0 && sp.x >= 0 && sp.x <= cw && sp.y >= 0 && sp.y <= ch;
        });
        this.select(same);
      } else {
        this.select([e], shift);
      }
      this.lastClickTime = now;
      this.lastClickDef = u.def.id;
    } else {
      this.select([e]);
      this.lastClickDef = '';
    }
    this.host.audio.play('select');
  }

  private boxSelect(d: DragRect, shift: boolean): void {
    const x0 = Math.min(d.x0, d.x1);
    const x1 = Math.max(d.x0, d.x1);
    const y0 = Math.min(d.y0, d.y1);
    const y1 = Math.max(d.y0, d.y1);
    const sp = this.sp;
    const w = this.world;
    let found: Unit[] = [];
    for (const u of w.units) {
      if (u.team !== TEAM_PLAYER || !u.alive) continue;
      this.cam.project(u.x, w.groundY(u.x, u.z) + u.alt + u.height * 0.4, u.z, sp);
      if (sp.w > 0 && sp.x >= x0 && sp.x <= x1 && sp.y >= y0 && sp.y <= y1) found.push(u);
    }
    // prefer combat units over harvesters when both are boxed
    const combat = found.filter((u) => !u.def.harvester);
    if (combat.length) found = combat;
    if (found.length) {
      if (shift) {
        const merged = this.selectedUnits();
        for (const u of found) if (!this.selectedSet.has(u)) merged.push(u);
        this.select(merged);
      } else {
        this.select(found);
      }
      this.host.audio.play('select');
    } else if (!shift) {
      this.select([]);
    }
  }

  /** Right-click: smart command for the current selection. */
  private contextCommand(x: number, y: number, shift: boolean, ctrl: boolean): void {
    const w = this.world;
    const g = this.cam.screenToGround(x, y);
    if (!g) return;
    const fx = this.host.renderer.fx;
    const units = this.selectedUnits();
    const first = this.selection[0];
    if (!units.length) {
      if (first instanceof Building && first.team === TEAM_PLAYER && first.def.produces && first.def.produces !== 'tech') {
        first.rallyX = g.x;
        first.rallyZ = g.z;
        fx.ring(g.x, g.z, 2.5, [0.4, 1, 0.6], 0.5);
        this.host.audio.play('ack');
      }
      return;
    }
    const target = this.pick(x, y);
    if (target && target.team !== TEAM_PLAYER && w.hostile(TEAM_PLAYER, target.team) && !target.invulnerable) {
      orderAttack(units, target, shift);
      fx.ring(target.x, target.z, target.radius + 1.5, [1, 0.3, 0.25], 0.45);
      this.host.audio.play('ack_attack');
      return;
    }
    if (target instanceof ResourceNode) {
      const harvesters = units.filter((u) => u.def.harvester);
      if (harvesters.length) {
        orderHarvest(harvesters, target);
        orderMove(w, units.filter((u) => !u.def.harvester), g.x, g.z, shift);
        fx.ring(target.x, target.z, 2.5, [0.3, 1, 0.95], 0.45);
        this.host.audio.play('ack');
        return;
      }
    }
    if (target instanceof Building && target.team === TEAM_PLAYER && target.def.id === 'refinery') {
      const harvesters = units.filter((u) => u.def.harvester);
      if (harvesters.length) {
        for (const h of harvesters) {
          h.setOrder(makeOrder('harvest'));
          h.hState = 'return';
        }
        fx.ring(target.x, target.z, 5, [0.4, 1, 0.6], 0.45);
        this.host.audio.play('ack');
        return;
      }
    }
    orderMove(w, units, g.x, g.z, shift, ctrl);
    fx.ring(g.x, g.z, 2.2, ctrl ? [1, 0.45, 0.3] : [0.4, 1, 0.6], 0.4);
    this.host.audio.play(ctrl ? 'ack_attack' : 'ack');
  }

  private resolveTarget(x: number, y: number, shift: boolean): void {
    const w = this.world;
    const t = this.targeting;
    const g = this.cam.screenToGround(x, y);
    if (!t || !g) return;
    const fx = this.host.renderer.fx;
    if (t.type === 'attackMove') {
      const units = this.selectedUnits();
      const target = this.pick(x, y);
      if (target && w.hostile(TEAM_PLAYER, target.team) && !target.invulnerable) orderAttack(units, target, shift);
      else orderMove(w, units, g.x, g.z, shift, true);
      fx.ring(g.x, g.z, 2.4, [1, 0.45, 0.3], 0.4);
      this.host.audio.play('ack_attack');
      if (!shift) this.targeting = null;
      return;
    }
    if (t.type === 'ability') {
      const p = w.players[TEAM_PLAYER];
      const h = p.hero;
      const def = p.heroDef.abilities[t.index];
      this.targeting = null;
      if (!h || !h.alive) return;
      if (dist(h.x, h.z, g.x, g.z) <= def.range) {
        if (!w.castAbility(h, t.index, g.x, g.z)) this.fail('No valid target there');
      } else {
        h.setOrder(makeOrder('cast', g.x, g.z, null, t.index));
        this.host.audio.play('ack');
      }
      return;
    }
    const why = w.usePower(TEAM_PLAYER, t.id, g.x, g.z);
    if (why) this.fail(why);
    else this.targeting = null;
  }

  private ghostCell(): { cx: number; cz: number } | null {
    if (!this.placing) return null;
    const g = this.cam.screenToGround(this.mouseX, this.mouseY);
    if (!g) return null;
    const def = BUILDING_DEFS[this.placing.defId];
    return { cx: Math.round(g.x / CELL - def.w / 2), cz: Math.round(g.z / CELL - def.h / 2) };
  }

  private tryPlace(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
    const c = this.ghostCell();
    const pl = this.placing;
    if (!c || !pl) return;
    const why = this.world.placeReady(TEAM_PLAYER, pl.kind, c.cx, c.cz);
    if (why) {
      this.fail(`Cannot build here: ${why}`);
      return;
    }
    this.placing = null;
  }

  /** Minimap interaction: left = move camera, right = move/rally order. */
  minimap(x: number, z: number, button: number): void {
    if (button === 0) {
      this.cam.jumpTo(x, z);
      return;
    }
    const units = this.selectedUnits();
    if (units.length) {
      orderMove(this.world, units, x, z);
      this.host.audio.play('ack');
    }
  }

  // ------------------------------------------------------------------ keyboard
  private onKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    this.host.audio.unlock();
    if (e.code === 'Escape') {
      if (!this.cancelModes()) {
        if (this.selection.length && !this.host.isBlocked()) this.select([]);
        else this.host.togglePause();
      }
      return;
    }
    if (e.code === 'F10' || e.code === 'KeyP') {
      e.preventDefault();
      this.host.togglePause();
      return;
    }
    if (this.host.isBlocked()) return;
    this.keys.add(e.code);
    if (e.repeat) return;
    const digit = /^Digit(\d)$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups[n] = this.selectedUnits();
        if (this.groups[n].length) this.host.notify(`Group ${n} assigned (${this.groups[n].length})`, 'info');
        this.selectionVersion++;
      } else {
        this.groups[n] = this.groups[n].filter((u) => u.alive);
        const grp = this.groups[n];
        if (grp.length) {
          const now = performance.now();
          if (this.lastGroupKey === n && now - this.lastGroupTime < 380) {
            let cx = 0;
            let cz = 0;
            for (const u of grp) {
              cx += u.x;
              cz += u.z;
            }
            this.cam.jumpTo(cx / grp.length, cz / grp.length);
          }
          this.lastGroupKey = n;
          this.lastGroupTime = now;
          this.select(grp);
          this.host.audio.play('select');
        }
      }
      return;
    }
    switch (e.code) {
      case 'KeyA':
        this.command('attackMove');
        break;
      case 'KeyS':
        this.command('stop');
        break;
      case 'KeyH':
        this.command('hold');
        break;
      case 'KeyQ':
        this.useAbility(0);
        break;
      case 'KeyW':
        this.useAbility(1);
        break;
      case 'KeyE':
        this.useAbility(2);
        break;
      case 'F1':
        e.preventDefault();
        this.selectHero();
        break;
      case 'F2':
        e.preventDefault();
        this.selectArmy();
        break;
      case 'Space': {
        e.preventDefault();
        if (this.eventX >= 0) this.cam.jumpTo(this.eventX, this.eventZ);
        else this.host.renderer.centerOnStart();
        break;
      }
      case 'KeyB':
      case 'Home': {
        const hq = this.world.nearestBuilding(TEAM_PLAYER, 'hq', 0, 0);
        if (hq) this.cam.jumpTo(hq.x, hq.z);
        break;
      }
      case 'Backspace':
        this.cam.resetRotation();
        break;
      case 'Slash':
        this.host.toggleHelp();
        break;
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number): void {
    // drop dead or no-longer-visible entities from the selection
    let dirty = false;
    for (const e of this.selection) {
      if (!e.alive || (e.team !== TEAM_PLAYER && e.kind === 'unit' && !e.visible)) {
        dirty = true;
        break;
      }
    }
    if (dirty) {
      this.selection = this.selection.filter((e) => e.alive && (e.team === TEAM_PLAYER || e.kind !== 'unit' || e.visible));
      this.syncSelection();
    }
    if (this.placing) {
      const q = this.world.players[TEAM_PLAYER].queues[this.placing.kind];
      if (!q.ready || q.items[0]?.defId !== this.placing.defId) this.placing = null;
    }
    if (this.host.isBlocked()) return;

    const cam = this.cam;
    const speed = 62 * cam.zoomFactor * dt;
    let dx = 0;
    let dz = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dz += 1;
    if (this.keys.has('ArrowDown')) dz -= 1;
    if (this.host.edgeScroll() && this.mouseInside && !this.drag && document.hasFocus()) {
      const r = this.canvas.getBoundingClientRect();
      const mx = this.mouseX + r.left;
      const my = this.mouseY + r.top;
      const m = 5;
      if (mx <= m) dx -= 1;
      else if (mx >= window.innerWidth - m - 1) dx += 1;
      if (my <= m) dz += 1;
      else if (my >= window.innerHeight - m - 1) dz -= 1;
    }
    if (dx || dz) cam.pan(dx * speed, dz * speed);
    if (this.keys.has('BracketLeft')) cam.rotate(-1.4 * dt);
    if (this.keys.has('BracketRight')) cam.rotate(1.4 * dt);
  }

  /** Everything the renderer needs to draw input feedback this frame. */
  view(): FrameView {
    const w = this.world;
    let ghost: FrameView['ghost'] = null;
    let reticle: FrameView['reticle'] = null;
    if (this.placing && this.overCanvas) {
      const c = this.ghostCell();
      if (c) {
        const def = BUILDING_DEFS[this.placing.defId];
        ghost = { defId: def.id, cx: c.cx, cz: c.cz, ok: w.canPlace(def, TEAM_PLAYER, c.cx, c.cz) === '' };
      }
    } else if (this.targeting && this.overCanvas) {
      const g = this.cam.screenToGround(this.mouseX, this.mouseY);
      if (g) {
        const t = this.targeting;
        if (t.type === 'attackMove') {
          reticle = { x: g.x, z: g.z, radius: 1.6, color: [1, 0.4, 0.3], range: 0, fromX: 0, fromZ: 0 };
        } else if (t.type === 'ability') {
          const p = w.players[TEAM_PLAYER];
          const def = p.heroDef.abilities[t.index];
          const h = p.hero;
          reticle = { x: g.x, z: g.z, radius: def.radius, color: hex(def.color), range: h ? def.range : 0, fromX: h?.x ?? 0, fromZ: h?.z ?? 0 };
        } else {
          const def = POWER_DEFS[t.id];
          reticle = { x: g.x, z: g.z, radius: def.radius, color: hex(def.color), range: 0, fromX: 0, fromZ: 0 };
        }
      }
    }
    return { selection: this.selection, ghost, reticle };
  }

  /** CSS cursor for the battlefield canvas (re-evaluated at most every ~80 ms). */
  cursor(): string {
    const memo = this as unknown as { cursorMemo?: { t: number; v: string } };
    const now = performance.now();
    if (memo.cursorMemo && now - memo.cursorMemo.t < 80) return memo.cursorMemo.v;
    let v = CURSORS.default;
    if (this.placing) {
      const c = this.ghostCell();
      const def = BUILDING_DEFS[this.placing.defId];
      v = c && this.world.canPlace(def, TEAM_PLAYER, c.cx, c.cz) === '' ? CURSORS.place : CURSORS.invalid;
    } else if (this.targeting) {
      v = this.targeting.type === 'attackMove' ? CURSORS.attack : CURSORS.target;
    } else if (this.overCanvas && !this.drag) {
      const e = this.pick(this.mouseX, this.mouseY);
      const commanding = this.selectedUnits().length > 0;
      if (e && commanding && e.team !== TEAM_PLAYER && this.world.hostile(TEAM_PLAYER, e.team) && !e.invulnerable) v = CURSORS.attack;
      else if (e) v = CURSORS.select;
      else if (commanding) v = CURSORS.move;
    }
    memo.cursorMemo = { t: now, v };
    return v;
  }
}
