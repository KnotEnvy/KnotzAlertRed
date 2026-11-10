import { TEAM_NEUTRAL, TEAM_PLAYER, TEAM_COLORS } from '../core/config';
import type { Building } from '../sim/building';
import type { Entity } from '../sim/entity';
import type { World } from '../sim/world';
import type { RtsCamera, ScreenPoint } from './camera';

interface FloatText {
  x: number;
  y: number;
  z: number;
  str: string;
  color: string;
  /** 0 = plain, 1 = credits, 2 = promotion / level-up */
  kind: number;
  t: number;
}

export interface DragRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const FONT = '"Chakra Petch", "Barlow", "Segoe UI", system-ui, sans-serif';
const HP_GOOD = '#5fe39a';
const HP_MID = '#f4cc63';
const HP_LOW = '#ef4b55';
const CYAN = '#42e6ef';
const GOLD = '#f4cc63';
const ENEMY_EDGE = 'rgba(232, 73, 90, 0.95)';
const NEUTRAL_EDGE = 'rgba(214, 192, 136, 0.9)';
/** Hurt units that were not hit recently show a slim, quiet bar. */
const RECENT_HIT = 4;
/** Above this many visible bars, unselected units switch to slim bars. */
const CROWD = 46;

/** Crisp 2D layer above the 3D view: health bars, rank chevrons, capture dials, floating text. */
export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private texts: FloatText[] = [];
  private sp: ScreenPoint = { x: 0, y: 0, w: 0 };
  private w = 1;
  private h = 1;
  private crowd = 0;
  private dash = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  addText(x: number, y: number, z: number, str: string, color: string): void {
    if (this.texts.length > 40) this.texts.shift();
    const kind = str.startsWith('+$') ? 1 : /^(VETERAN|ELITE|LEVEL)/.test(str) ? 2 : 0;
    this.texts.push({ x, y, z, str, color, kind, t: 0 });
  }

  draw(world: World, cam: RtsCamera, selected: ReadonlySet<Entity>, drag: DragRect | null, dt: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    // pixels per world unit at the focus point
    const ppu = this.h / (2 * Math.tan(cam.camera.fov / 2) * cam.dist);
    const sp = this.sp;
    const now = world.time;
    // last frame's bar count decides whether this frame uses the quieter crowd style
    const crowded = this.crowd > CROWD;
    let bars = 0;
    this.dash = (this.dash + dt * 18) % 8;

    for (const u of world.units) {
      if (!u.alive || !u.visible || u.dropT > 0) continue;
      const sel = selected.has(u);
      const hurt = u.hp < u.maxHp - 0.5;
      if (!sel && !hurt && !u.hero && u.rank === 0) continue;
      const gy = world.groundY(u.x, u.z) + u.alt;
      cam.project(u.x, gy + u.height + 0.5, u.z, sp);
      if (sp.w <= 0 || sp.x < -60 || sp.x > this.w + 60 || sp.y < -40 || sp.y > this.h + 40) continue;
      const x = Math.round(sp.x);
      const y = Math.round(sp.y);
      const bw = Math.round(Math.max(u.hero ? 50 : 20, Math.min(84, u.radius * 2.1 * ppu)));
      const f = u.hp / u.maxHp;
      if (sel || u.hero) {
        this.bar(x, y, bw, u.hero ? 5 : 4, f, u.team, u.shield > 0, u.maxHp, 1);
        bars++;
      } else if (hurt) {
        const quiet = crowded || now - u.lastHit > RECENT_HIT;
        if (quiet) this.slimBar(x, y + 1, bw, f, u.team);
        else this.bar(x, y, bw, 4, f, u.team, u.shield > 0, u.maxHp, 0.92);
        bars++;
      }
      if (u.hero) this.heroBadge(x - (bw >> 1) - 10, y + 2, world.players[u.team].heroLevel, world.players[u.team].heroDef.accent);
      else if (u.rank > 0) this.chevrons(x - (bw >> 1) - 7, y + 3, u.rank);
      if (sel && u.def.harvester) {
        const cf = u.cargo / u.capacity(world);
        ctx.fillStyle = 'rgba(3, 6, 10, 0.8)';
        ctx.fillRect(x - (bw >> 1) - 1, y + 6, bw + 2, 4);
        ctx.fillStyle = CYAN;
        ctx.fillRect(x - (bw >> 1), y + 7, Math.round(bw * cf), 2);
      }
      if (u.stun > 0) this.label(x, y - 12, 'DISABLED', '#8fe4ff', 0);
    }

    for (const b of world.buildings) {
      if (!b.alive || !(b.visible || b.seen)) continue;
      const sel = selected.has(b);
      const hurt = b.hp < b.maxHp - 0.5 && !b.invulnerable;
      const capturing = b.capProgress > 0 && b.capTeam >= 0;
      if (!sel && !hurt && !capturing && b.rise >= 1 && !b.offline && !b.repairing && b.stun <= 0) continue;
      cam.project(b.x, world.groundY(b.x, b.z) + b.height + 1.2, b.z, sp);
      if (sp.w <= 0 || sp.x < -80 || sp.x > this.w + 80 || sp.y < -60 || sp.y > this.h + 60) continue;
      const x = Math.round(sp.x);
      const y = Math.round(sp.y);
      const bw = Math.round(Math.max(40, Math.min(124, Math.max(b.w, b.h) * 2 * 0.8 * ppu)));
      if (!b.invulnerable && (sel || hurt)) {
        this.bar(x, y, bw, 5, b.hp / b.maxHp, b.team, false, b.maxHp, 1);
        bars++;
      }
      if (b.rise < 1) {
        ctx.fillStyle = 'rgba(3, 6, 10, 0.82)';
        ctx.fillRect(x - (bw >> 1) - 1, y + 8, bw + 2, 5);
        ctx.fillStyle = CYAN;
        ctx.fillRect(x - (bw >> 1), y + 9, Math.round(bw * b.rise), 3);
      }
      if (b.offline) this.label(x, y - 12, 'NO POWER', '#ff8d97', 1);
      else if (b.stun > 0) this.label(x, y - 12, 'DISABLED', '#8fe4ff', 0);
      else if (b.repairing) this.label(x, y - 12, 'REPAIRING', '#7ff0b0', 2);
      if (capturing) this.captureDial(x, y - 28, b);
    }
    this.crowd = bars;

    // floating text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      const life = t.kind === 2 ? 2 : 1.5;
      if (t.t > life) {
        this.texts.splice(i, 1);
        continue;
      }
      cam.project(t.x, world.groundY(t.x, t.z) + t.y + t.t * (t.kind === 2 ? 1.4 : 2.2), t.z, sp);
      if (sp.w <= 0) continue;
      const pop = t.t < 0.16 ? 1 + (1 - t.t / 0.16) * 0.45 : 1;
      const size = Math.round((t.kind === 2 ? 15 : 14) * pop);
      ctx.globalAlpha = Math.min(1, (life - t.t) * 2.2, t.t * 12);
      ctx.font = `700 ${size}px ${FONT}`;
      const color = t.kind === 1 ? '#9ff6fb' : t.kind === 2 ? GOLD : t.color;
      const x = Math.round(sp.x);
      const y = Math.round(sp.y);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(2, 5, 9, 0.85)';
      ctx.strokeText(t.str, x, y);
      ctx.fillStyle = color;
      ctx.fillText(t.str, x, y);
      if (t.kind === 2) {
        // a small chevron above promotions
        ctx.strokeStyle = 'rgba(2, 5, 9, 0.85)';
        ctx.lineWidth = 4;
        this.vee(x, y - size - 2, 6);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 2;
        this.vee(x, y - size - 2, 6);
      }
    }
    ctx.globalAlpha = 1;

    if (drag) this.dragBox(drag);
  }

  private hpColor(f: number): string {
    return f > 0.6 ? HP_GOOD : f > 0.3 ? HP_MID : HP_LOW;
  }

  private bar(x: number, y: number, w: number, h: number, frac: number, team: number, shielded: boolean, maxHp: number, alpha: number): void {
    const ctx = this.ctx;
    frac = Math.max(0, Math.min(1, frac));
    const x0 = x - (w >> 1);
    ctx.globalAlpha = alpha;
    // frame: enemy and neutral bars carry a coloured rim so sides read at a glance
    ctx.fillStyle = shielded ? CYAN : team === TEAM_PLAYER ? 'rgba(3, 6, 10, 0.88)' : team === TEAM_NEUTRAL ? NEUTRAL_EDGE : ENEMY_EDGE;
    ctx.fillRect(x0 - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = 'rgba(3, 6, 10, 0.92)';
    ctx.fillRect(x0 - 1, y - 1, w + 2, h + 2);
    const fw = Math.max(frac > 0 ? 1 : 0, Math.round(w * frac));
    ctx.fillStyle = this.hpColor(frac);
    ctx.fillRect(x0, y, fw, h);
    // top highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x0, y, fw, 1);
    // segment ticks every 100 hp on wide bars
    if (w >= 34 && maxHp > 150) {
      const seg = (w * 100) / maxHp;
      if (seg >= 4) {
        ctx.fillStyle = 'rgba(3, 6, 10, 0.55)';
        for (let sx = x0 + seg; sx < x0 + fw - 1; sx += seg) ctx.fillRect(Math.round(sx), y + 1, 1, h - 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  private slimBar(x: number, y: number, w: number, frac: number, team: number): void {
    const ctx = this.ctx;
    frac = Math.max(0, Math.min(1, frac));
    const x0 = x - (w >> 1);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = team === TEAM_PLAYER ? 'rgba(3, 6, 10, 0.8)' : team === TEAM_NEUTRAL ? NEUTRAL_EDGE : ENEMY_EDGE;
    ctx.fillRect(x0 - 1, y - 1, w + 2, 4);
    ctx.fillStyle = this.hpColor(frac);
    ctx.fillRect(x0, y, Math.max(1, Math.round(w * frac)), 2);
    ctx.globalAlpha = 1;
  }

  private vee(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.4);
    ctx.lineTo(x, y + r * 0.45);
    ctx.lineTo(x + r, y - r * 0.4);
    ctx.stroke();
  }

  private chevrons(x: number, y: number, rank: number): void {
    const ctx = this.ctx;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    for (let i = 0; i < rank; i++) {
      const yy = y - i * 5;
      ctx.strokeStyle = 'rgba(2, 5, 9, 0.9)';
      ctx.lineWidth = 4.5;
      this.up(x, yy);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.2;
      this.up(x, yy);
    }
  }

  private up(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x - 4.5, y + 2.5);
    ctx.lineTo(x, y - 2);
    ctx.lineTo(x + 4.5, y + 2.5);
    ctx.stroke();
  }

  private heroBadge(x: number, y: number, level: number, accent: string): void {
    const ctx = this.ctx;
    const r = 9.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 9, 15, 0.95)';
    ctx.fill();
    ctx.lineJoin = 'miter';
    ctx.lineWidth = 2;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), x, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  /** Small status chip: icon 0 = none, 1 = bolt, 2 = wrench dot. */
  private label(x: number, y: number, str: string, color: string, icon: number): void {
    const ctx = this.ctx;
    ctx.font = `700 10px ${FONT}`;
    const tw = Math.ceil(ctx.measureText(str).width);
    const pad = icon ? 16 : 7;
    const w = tw + pad + 7;
    const x0 = Math.round(x - w / 2);
    const y0 = y - 9;
    ctx.fillStyle = 'rgba(4, 7, 12, 0.88)';
    ctx.fillRect(x0, y0, w, 14);
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, 2, 14);
    if (icon === 1) {
      ctx.beginPath();
      ctx.moveTo(x0 + 10, y0 + 2);
      ctx.lineTo(x0 + 6, y0 + 8);
      ctx.lineTo(x0 + 9, y0 + 8);
      ctx.lineTo(x0 + 8, y0 + 12);
      ctx.lineTo(x0 + 12, y0 + 6);
      ctx.lineTo(x0 + 9, y0 + 6);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 2) {
      ctx.beginPath();
      ctx.arc(x0 + 9, y0 + 7, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.fillText(str, x0 + pad, y0 + 11);
    ctx.textAlign = 'center';
  }

  private captureDial(x: number, y: number, b: Building): void {
    const ctx = this.ctx;
    const col = b.capTeam === TEAM_PLAYER ? CYAN : b.capTeam === TEAM_NEUTRAL ? '#d6c088' : TEAM_COLORS[b.capTeam]?.hex ?? '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(4, 7, 12, 0.85)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(220, 231, 236, 0.16)';
    ctx.beginPath();
    ctx.arc(x, y, 10.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y, 10.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * b.capProgress);
    ctx.stroke();
    // flag
    ctx.strokeStyle = '#dce7ec';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 5.5);
    ctx.lineTo(x - 3, y + 5.5);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 5.5);
    ctx.lineTo(x + 5, y - 3);
    ctx.lineTo(x - 3, y - 0.5);
    ctx.closePath();
    ctx.fill();
  }

  private dragBox(d: DragRect): void {
    const ctx = this.ctx;
    const x = Math.round(Math.min(d.x0, d.x1)) + 0.5;
    const y = Math.round(Math.min(d.y0, d.y1)) + 0.5;
    const w = Math.round(Math.abs(d.x1 - d.x0));
    const h = Math.round(Math.abs(d.y1 - d.y0));
    ctx.fillStyle = 'rgba(66, 230, 239, 0.07)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(66, 230, 239, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -this.dash;
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    // corner brackets
    const c = Math.min(12, w / 2, h / 2);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + c);
    ctx.lineTo(x, y);
    ctx.lineTo(x + c, y);
    ctx.moveTo(x + w - c, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + c);
    ctx.moveTo(x + w, y + h - c);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w - c, y + h);
    ctx.moveTo(x + c, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.stroke();
  }
}
