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
  t: number;
}

export interface DragRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Crisp 2D layer above the 3D view: health bars, rank chevrons, capture dials, floating text. */
export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private texts: FloatText[] = [];
  private sp: ScreenPoint = { x: 0, y: 0, w: 0 };
  private w = 1;
  private h = 1;

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
    this.texts.push({ x, y, z, str, color, t: 0 });
  }

  draw(world: World, cam: RtsCamera, selected: ReadonlySet<Entity>, drag: DragRect | null, dt: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    // pixels per world unit at the focus point
    const ppu = this.h / (2 * Math.tan(cam.camera.fov / 2) * cam.dist);
    const sp = this.sp;

    for (const u of world.units) {
      if (!u.alive || !u.visible || u.dropT > 0) continue;
      const sel = selected.has(u);
      const hurt = u.hp < u.maxHp - 0.5;
      if (!sel && !hurt && !u.hero && u.rank === 0) continue;
      const gy = world.groundY(u.x, u.z) + u.alt;
      cam.project(u.x, gy + u.height + 0.5, u.z, sp);
      if (sp.w <= 0 || sp.x < -60 || sp.x > this.w + 60 || sp.y < -40 || sp.y > this.h + 40) continue;
      const bw = Math.max(u.hero ? 54 : 20, Math.min(90, u.radius * 2.1 * ppu));
      if (sel || hurt || u.hero) this.bar(sp.x, sp.y, bw, u.hero ? 6 : 4, u.hp / u.maxHp, u.team, u.shield > 0);
      if (u.hero) this.heroBadge(sp.x - bw / 2 - 11, sp.y + 3, world.players[u.team].heroLevel, u.team);
      else if (u.rank > 0) this.chevrons(sp.x - bw / 2 - 8, sp.y + 2, u.rank);
      if (sel && u.def.harvester) {
        const f = u.cargo / u.capacity(world);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(sp.x - bw / 2, sp.y + 6, bw, 3);
        ctx.fillStyle = '#39e6e0';
        ctx.fillRect(sp.x - bw / 2, sp.y + 6, bw * f, 3);
      }
      if (u.stun > 0) this.label(sp.x, sp.y - 8, 'DISABLED', '#7fd4ff');
    }

    for (const b of world.buildings) {
      if (!b.alive || !(b.visible || b.seen)) continue;
      const sel = selected.has(b);
      const hurt = b.hp < b.maxHp - 0.5 && !b.invulnerable;
      const capturing = b.capProgress > 0 && b.capTeam >= 0;
      if (!sel && !hurt && !capturing && b.rise >= 1 && !b.offline && !b.repairing && b.stun <= 0) continue;
      cam.project(b.x, world.groundY(b.x, b.z) + b.height + 1.2, b.z, sp);
      if (sp.w <= 0 || sp.x < -80 || sp.x > this.w + 80 || sp.y < -60 || sp.y > this.h + 60) continue;
      const bw = Math.max(40, Math.min(130, Math.max(b.w, b.h) * 2 * 0.8 * ppu));
      if (!b.invulnerable && (sel || hurt)) this.bar(sp.x, sp.y, bw, 5, b.hp / b.maxHp, b.team, false);
      if (b.rise < 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(sp.x - bw / 2, sp.y + 8, bw, 4);
        ctx.fillStyle = '#6fd0ff';
        ctx.fillRect(sp.x - bw / 2, sp.y + 8, bw * b.rise, 4);
      }
      if (b.offline) this.label(sp.x, sp.y - 9, 'NO POWER', '#ff5a4a');
      else if (b.stun > 0) this.label(sp.x, sp.y - 9, 'DISABLED', '#7fd4ff');
      else if (b.repairing) this.label(sp.x, sp.y - 9, 'REPAIRING', '#7dffb0');
      if (capturing) this.captureDial(sp.x, sp.y - 26, b);
    }

    // floating text
    ctx.textAlign = 'center';
    ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t > 1.5) {
        this.texts.splice(i, 1);
        continue;
      }
      cam.project(t.x, world.groundY(t.x, t.z) + t.y + t.t * 2.2, t.z, sp);
      if (sp.w <= 0) continue;
      ctx.globalAlpha = Math.min(1, (1.5 - t.t) * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(t.str, sp.x, sp.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, sp.x, sp.y);
    }
    ctx.globalAlpha = 1;

    if (drag) {
      const x = Math.min(drag.x0, drag.x1);
      const y = Math.min(drag.y0, drag.y1);
      const w = Math.abs(drag.x1 - drag.x0);
      const h = Math.abs(drag.y1 - drag.y0);
      ctx.fillStyle = 'rgba(90,255,150,0.09)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(120,255,170,0.95)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }
  }

  private bar(x: number, y: number, w: number, h: number, frac: number, team: number, shielded: boolean): void {
    const ctx = this.ctx;
    frac = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = frac > 0.6 ? '#4be06a' : frac > 0.3 ? '#f2c641' : '#f0503c';
    ctx.fillRect(x - w / 2, y, w * frac, h);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x - w / 2, y, w * frac, 1);
    ctx.strokeStyle = shielded ? '#8fe4ff' : team === TEAM_PLAYER ? 'rgba(120,180,255,0.85)' : team === TEAM_NEUTRAL ? 'rgba(220,200,140,0.85)' : 'rgba(255,110,90,0.85)';
    ctx.lineWidth = shielded ? 2 : 1;
    ctx.strokeRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3);
  }

  private chevrons(x: number, y: number, rank: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (let i = 0; i < rank; i++) {
      const yy = y - i * 4;
      ctx.beginPath();
      ctx.moveTo(x - 4, yy + 2);
      ctx.lineTo(x, yy - 1.5);
      ctx.lineTo(x + 4, yy + 2);
      ctx.stroke();
    }
  }

  private heroBadge(x: number, y: number, level: number, team: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1407';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffd24a';
    ctx.stroke();
    ctx.fillStyle = team === TEAM_PLAYER ? '#ffe9a6' : '#ffb3a6';
    ctx.font = '800 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), x, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  private label(x: number, y: number, str: string, color: string): void {
    const ctx = this.ctx;
    ctx.font = '700 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  private captureDial(x: number, y: number, b: Building): void {
    const ctx = this.ctx;
    const col = TEAM_COLORS[b.capTeam]?.hex ?? '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * b.capProgress);
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.stroke();
    // small flag
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 5);
    ctx.lineTo(x - 3, y + 5);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 5);
    ctx.lineTo(x + 5, y - 2.5);
    ctx.lineTo(x - 3, y);
    ctx.closePath();
    ctx.fill();
  }
}
