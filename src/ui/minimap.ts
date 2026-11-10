import { GRID, TEAM_COLORS, TEAM_PLAYER, WORLD } from '../core/config';
import type { World } from '../sim/world';

interface Ping {
  x: number;
  z: number;
  color: string;
  t: number;
}

const SIZE = 224;

/** Tactical minimap: terrain, fog, blips, alert pings and the camera frustum. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogImg: ImageData;
  private pings: Ping[] = [];
  private dragging = false;

  constructor(
    private terrain: HTMLCanvasElement,
    onClick: (x: number, z: number, button: number) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = GRID;
    this.fogCanvas.height = GRID;
    this.fogCtx = this.fogCanvas.getContext('2d')!;
    this.fogImg = this.fogCtx.createImageData(GRID, GRID);

    const toWorld = (e: MouseEvent): [number, number] => {
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * WORLD;
      const z = (1 - (e.clientY - r.top) / r.height) * WORLD;
      return [Math.max(0, Math.min(WORLD, x)), Math.max(0, Math.min(WORLD, z))];
    };
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const [x, z] = toWorld(e);
      if (e.button === 0) this.dragging = true;
      onClick(x, z, e.button);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.dragging && e.buttons & 1) {
        const [x, z] = toWorld(e);
        onClick(x, z, 0);
      }
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  ping(x: number, z: number, color: string): void {
    if (this.pings.length > 8) this.pings.shift();
    this.pings.push({ x, z, color, t: 0 });
  }

  draw(world: World, corners: ({ x: number; z: number } | null)[], dt: number): void {
    const ctx = this.ctx;
    const s = SIZE / WORLD;
    const X = (x: number) => x * s;
    const Y = (z: number) => SIZE - z * s;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain, 0, 0, SIZE, SIZE);

    // resource nodes
    ctx.fillStyle = '#4ff2ee';
    for (const n of world.nodes) {
      if (n.visible) ctx.fillRect(X(n.x) - 1, Y(n.z) - 1, 2.4, 2.4);
    }

    // fog
    const fog = world.fog;
    const d = this.fogImg.data;
    for (let z = 0; z < GRID; z++) {
      for (let x = 0; x < GRID; x++) {
        const i = z * GRID + x;
        const o = ((GRID - 1 - z) * GRID + x) * 4;
        d[o] = 2;
        d[o + 1] = 4;
        d[o + 2] = 8;
        d[o + 3] = fog.visible[i] ? 0 : fog.explored[i] ? 105 : 185;
      }
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    ctx.drawImage(this.fogCanvas, 0, 0, SIZE, SIZE);

    // faint sector grid
    ctx.fillStyle = 'rgba(160, 220, 240, 0.07)';
    for (let i = 1; i < 8; i++) {
      const g = Math.round((i * SIZE) / 8);
      ctx.fillRect(g, 0, 1, SIZE);
      ctx.fillRect(0, g, SIZE, 1);
    }

    // structures
    for (const b of world.buildings) {
      if (!b.alive || !(b.visible || b.seen)) continue;
      const w = Math.max(3, b.w * 2 * s);
      const h = Math.max(3, b.h * 2 * s);
      ctx.fillStyle = b.team === TEAM_PLAYER ? '#3a78ef' : TEAM_COLORS[b.team].hex;
      if (b.def.capturable) {
        ctx.save();
        ctx.translate(X(b.x), Y(b.z));
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3.5, -3.5, 7, 7);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(-3.5, -3.5, 7, 7);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(2, 5, 9, 0.85)';
        ctx.fillRect(X(b.x) - w / 2 - 1, Y(b.z) - h / 2 - 1, w + 2, h + 2);
        ctx.fillStyle = b.team === TEAM_PLAYER ? '#4f8cff' : TEAM_COLORS[b.team].hex;
        ctx.fillRect(X(b.x) - w / 2, Y(b.z) - h / 2, w, h);
      }
    }
    // units
    for (const u of world.units) {
      if (!u.alive || !u.visible) continue;
      ctx.fillStyle = u.team === TEAM_PLAYER ? (u.hero ? '#ffffff' : '#8fd0ff') : u.hero ? '#ffc08a' : '#ff4d5c';
      const r = u.hero ? 3.2 : u.radius > 1 ? 2.2 : 1.6;
      ctx.fillRect(X(u.x) - r / 2, Y(u.z) - r / 2, r, r);
      if (u.hero) {
        ctx.strokeStyle = u.team === TEAM_PLAYER ? '#42e6ef' : '#ff4d5c';
        ctx.lineWidth = 1;
        ctx.strokeRect(X(u.x) - 3, Y(u.z) - 3, 6, 6);
      }
    }

    // pings
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t += dt;
      if (p.t > 3.2) {
        this.pings.splice(i, 1);
        continue;
      }
      const f = (p.t % 0.8) / 0.8;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - f;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.z), 3 + f * 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // camera frustum
    if (corners.every((c) => c)) {
      ctx.strokeStyle = 'rgba(220, 245, 250, 0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      corners.forEach((c, i) => {
        const px = Math.max(-20, Math.min(SIZE + 20, X(c!.x)));
        const py = Math.max(-20, Math.min(SIZE + 20, Y(c!.z)));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }
}
