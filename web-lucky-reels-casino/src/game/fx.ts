/**
 * Full-screen canvas effects layer: coin showers, fountains, sparkle bursts and
 * coins that fly into the balance counter. Runs its own rAF loop only while
 * particles are alive.
 */

type Kind = "coin" | "spark" | "star";

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rot: number;
  vr: number;
  flip: number;
  vflip: number;
  gravity: number;
  drag: number;
  delay: number;
  hue: string;
  fly?: { sx: number; sy: number; cx: number; cy: number; tx: number; ty: number; dur: number; onArrive?: () => void };
}

export interface Point {
  x: number;
  y: number;
}

const MAX_PARTICLES = 520;
const COIN_PX = 96;

function makeCoin(back: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = COIN_PX;
  c.height = COIN_PX;
  const g = c.getContext("2d");
  if (!g) return c;
  const r = COIN_PX / 2;
  const grad = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  if (back) {
    grad.addColorStop(0, "#ffe27a");
    grad.addColorStop(0.7, "#d18a00");
    grad.addColorStop(1, "#7a4300");
  } else {
    grad.addColorStop(0, "#fffbe0");
    grad.addColorStop(0.35, "#ffd84a");
    grad.addColorStop(0.8, "#e59400");
    grad.addColorStop(1, "#8a4b00");
  }
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r - 2, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = back ? "#9a5a00" : "#b86e00";
  g.beginPath();
  g.arc(r, r, r * 0.74, 0, Math.PI * 2);
  g.stroke();
  // embossed star
  g.fillStyle = back ? "rgba(255,240,180,0.55)" : "rgba(255,255,230,0.9)";
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r * 0.46 : r * 0.2;
    const x = r + Math.cos(a) * rr;
    const y = r + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(120,60,0,0.55)";
  g.lineWidth = 2;
  g.stroke();
  // shine
  const shine = g.createLinearGradient(0, 0, COIN_PX, COIN_PX);
  shine.addColorStop(0.2, "rgba(255,255,255,0.55)");
  shine.addColorStop(0.45, "rgba(255,255,255,0)");
  g.fillStyle = shine;
  g.beginPath();
  g.arc(r, r, r - 3, 0, Math.PI * 2);
  g.fill();
  return c;
}

function makeGlow(color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return c;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function makeStar(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return c;
  g.translate(32, 32);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,230,140,0.9)");
  grad.addColorStop(1, "rgba(255,200,60,0)");
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? 32 : 7;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  return c;
}

class FxLayer {
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private coinFront: HTMLCanvasElement | null = null;
  private coinBack: HTMLCanvasElement | null = null;
  private glows = new Map<string, HTMLCanvasElement>();
  private star: HTMLCanvasElement | null = null;
  private showerUntil = 0;
  private showerRate = 0;
  private showerAcc = 0;
  private reducedMotion = false;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.coinFront = makeCoin(false);
    this.coinBack = makeCoin(true);
    this.star = makeStar();
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  detach(): void {
    window.removeEventListener("resize", this.resize);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas = null;
    this.g = null;
    this.particles = [];
  }

  private resize = (): void => {
    if (!this.canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  };

  private glow(color: string): HTMLCanvasElement {
    let c = this.glows.get(color);
    if (!c) {
      c = makeGlow(color);
      this.glows.set(color, c);
    }
    return c;
  }

  private add(p: Particle): void {
    if (!this.g) return;
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
    this.start();
  }

  private coin(x: number, y: number, vx: number, vy: number, size: number, delay = 0, life = 4000): Particle {
    return {
      kind: "coin",
      x,
      y,
      vx,
      vy,
      life: 0,
      maxLife: life,
      size,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 4,
      flip: Math.random() * Math.PI * 2,
      vflip: 6 + Math.random() * 8,
      gravity: 1400,
      drag: 0.35,
      delay,
      hue: "",
    };
  }

  /** Continuous rain of coins from the top of the screen. */
  shower(ms: number, rate = 40): void {
    if (this.reducedMotion) rate = Math.min(rate, 12);
    this.showerUntil = performance.now() + ms;
    this.showerRate = rate;
    this.start();
  }

  stopShower(): void {
    this.showerUntil = 0;
  }

  /** Coins erupting upward from a point. */
  fountain(x: number, y: number, count: number, power = 1): void {
    const n = this.reducedMotion ? Math.min(count, 14) : count;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.3;
      const sp = (900 + Math.random() * 900) * power;
      this.add(this.coin(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 26 + Math.random() * 22, Math.random() * 240, 3200));
    }
  }

  /** Radial burst of glowing sparks and stars. */
  burst(x: number, y: number, count: number, color = "rgba(255,210,90,0.9)"): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 150 + Math.random() * 520;
      this.add({
        kind: Math.random() < 0.3 ? "star" : "spark",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: 600 + Math.random() * 700,
        size: 10 + Math.random() * 22,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 6,
        flip: 0,
        vflip: 0,
        gravity: 260,
        drag: 1.8,
        delay: 0,
        hue: color,
      });
    }
  }

  /** Coins arc from one point into another (e.g. into the balance counter). */
  flyTo(from: Point, to: Point, count: number, onArrive?: (i: number) => void): void {
    const n = Math.max(1, Math.min(count, 28));
    for (let i = 0; i < n; i++) {
      const sx = from.x + (Math.random() - 0.5) * 90;
      const sy = from.y + (Math.random() - 0.5) * 60;
      const cx = (sx + to.x) / 2 + (Math.random() - 0.5) * 260;
      const cy = Math.min(sy, to.y) - 80 - Math.random() * 160;
      const p = this.coin(sx, sy, 0, 0, 30 + Math.random() * 10, i * 45, 99999);
      p.fly = { sx, sy, cx, cy, tx: to.x, ty: to.y, dur: 620 + Math.random() * 260, onArrive: onArrive ? () => onArrive(i) : undefined };
      this.add(p);
    }
  }

  private start(): void {
    if (this.raf || !this.g) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    const g = this.g;
    if (!g) {
      this.raf = 0;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (now < this.showerUntil) {
      this.showerAcc += dt * this.showerRate;
      while (this.showerAcc >= 1) {
        this.showerAcc -= 1;
        const size = 24 + Math.random() * 26;
        const p = this.coin(Math.random() * this.w, -40, (Math.random() - 0.5) * 160, 120 + Math.random() * 260, size, 0, 5000);
        p.gravity = 700;
        p.drag = 0.1;
        this.particles.push(p);
      }
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);

    const alive: Particle[] = [];
    for (const p of this.particles) {
      if (p.delay > 0) {
        p.delay -= dt * 1000;
        alive.push(p);
        continue;
      }
      p.life += dt * 1000;
      if (p.fly) {
        const f = Math.min(1, p.life / p.fly.dur);
        const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        const u = 1 - e;
        p.x = u * u * p.fly.sx + 2 * u * e * p.fly.cx + e * e * p.fly.tx;
        p.y = u * u * p.fly.sy + 2 * u * e * p.fly.cy + e * e * p.fly.ty;
        p.size *= 1 - dt * 0.6;
        p.flip += p.vflip * dt;
        if (f >= 1) {
          p.fly.onArrive?.();
          continue;
        }
      } else {
        p.vy += p.gravity * dt;
        p.vx *= 1 - p.drag * dt;
        p.vy *= 1 - p.drag * dt * 0.5;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.flip += p.vflip * dt;
        if (p.life >= p.maxLife || p.y > this.h + 80) continue;
      }
      alive.push(p);
      this.draw(g, p);
    }
    this.particles = alive;

    if (this.particles.length > 0 || now < this.showerUntil) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.raf = 0;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
    }
  };

  private draw(g: CanvasRenderingContext2D, p: Particle): void {
    const d = this.dpr;
    if (p.kind === "coin") {
      const sx = Math.cos(p.flip);
      const img = sx >= 0 ? this.coinFront : this.coinBack;
      if (!img) return;
      const s = p.size / COIN_PX;
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = p.fly ? 1 : Math.min(1, (p.maxLife - p.life) / 400);
      g.setTransform(d * s * Math.max(0.08, Math.abs(sx)), 0, 0, d * s, p.x * d, p.y * d);
      g.rotate(p.rot * 0.2);
      g.drawImage(img, -COIN_PX / 2, -COIN_PX / 2);
      return;
    }
    const t = 1 - p.life / p.maxLife;
    const img = p.kind === "star" ? this.star : this.glow(p.hue);
    if (!img) return;
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = Math.max(0, t);
    const s = (p.size * (0.4 + t * 0.6)) / 64;
    g.setTransform(d * s, 0, 0, d * s, p.x * d, p.y * d);
    g.rotate(p.rot);
    g.drawImage(img, -32, -32);
    g.globalCompositeOperation = "source-over";
  }
}

export const fx = new FxLayer();

/** Center of an element tagged with data-fx="<name>", if present. */
export function fxTarget(name: string): Point | null {
  const el = document.querySelector(`[data-fx="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Pulses the balance counter when a coin lands. */
export function pulseBalance(): void {
  const el = document.querySelector('[data-fx="balance"]');
  if (!el) return;
  el.classList.remove("coin-hit");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("coin-hit");
}
