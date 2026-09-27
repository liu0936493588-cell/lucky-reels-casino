import { Application, Assets, BlurFilter, Container, FillGradient, Graphics, Sprite, Texture } from "pixi.js";

import type { FramePalette, MachineTheme } from "../machines";
import type { LineWin, PublicMachine } from "../types";

/**
 * Canvas/WebGL renderer for a 5x3 reel set. It only animates to results it is
 * given; it never decides outcomes. Owns: reels, motion blur, stop bounce,
 * anticipation frame, win lines and symbol win animations.
 */

type ReelPhase = "idle" | "kick" | "spin" | "stopping";

interface Reel {
  index: number;
  container: Container;
  sprites: Sprite[];
  ids: string[];
  offset: number;
  phase: ReelPhase;
  t: number;
  velocity: number;
  queue: string[];
  stopAt: number | null;
  stopDist: number;
  stopDur: number;
  stopT: number;
  stopLast: number;
  stopEase: number;
  landed: boolean;
  landT: number;
  blur: BlurFilter;
  anticipating: boolean;
}

interface Timing {
  speed: number;
  minSpin: number;
  gap: number;
  anticipation: number;
  ease: number;
}

const NORMAL: Timing = { speed: 26, minSpin: 700, gap: 200, anticipation: 1350, ease: 1.35 };
const TURBO: Timing = { speed: 36, minSpin: 260, gap: 85, anticipation: 750, ease: 1.1 };
const KICK_MS = 110;
const KICK_CELLS = 0.2;
const ACCEL_MS = 190;

const LINE_COLORS = [0xffd84a, 0xff2e9a, 0x3be6ff, 0x7dff6a, 0xff8a1f, 0xc98bff, 0xfff27a, 0x22ffc8, 0xff5a7a];

export interface SpinTiming {
  turbo: boolean;
}

export interface RendererEvents {
  onReelStop?: (reel: number, hasScatter: boolean, isLast: boolean) => void;
  onAnticipationStart?: () => void;
  onAnticipationEnd?: () => void;
  onLineShown?: (win: LineWin | null, index: number) => void;
}

function backOut(t: number, s: number): number {
  const c3 = s + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + s * x * x;
}

function makeGlowTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,245,200,1)");
    grad.addColorStop(0.35, "rgba(255,200,60,0.75)");
    grad.addColorStop(1, "rgba(255,150,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  return Texture.from(c);
}

export class SlotRenderer {
  readonly app: Application;
  private machine: PublicMachine;
  private theme: MachineTheme;
  private host: HTMLElement;
  private textures: Record<string, Texture> = {};
  private glowTex: Texture | null = null;
  private reels: Reel[] = [];
  private events: RendererEvents = {};
  private ro: ResizeObserver | null = null;

  private root = new Container();
  private panel = new Graphics();
  private glowLayer = new Container();
  private glowSprites: Sprite[][] = [];
  private reelLayer = new Container();
  private reelMask = new Graphics();
  private winLayer = new Graphics();
  private boxLayer = new Graphics();
  private frame = new Graphics();
  private bulbs = new Graphics();
  private antLayer = new Graphics();

  private cell = 100;
  private cellH = 100;
  private originX = 0;
  private originY = 0;
  private time = 0;
  private timing: Timing = NORMAL;
  private spinStartedAt = 0;
  private pendingResult: { grid: string[][]; anticipationFrom: number } | null = null;
  private slamRequested = false;
  private stopResolve: (() => void) | null = null;
  private stopPromise: Promise<void> | null = null;
  private anticipationFrom = -1;
  private anticipationActive = false;
  private mode: "base" | "free" = "base";
  private highlight = new Set<string>();
  private highlightStrong = new Set<string>();
  private winCycleTimer: ReturnType<typeof setTimeout> | null = null;
  private winToken = 0;
  private destroyed = false;
  private weights: { id: string; w: number }[] = [];
  private weightTotal = 0;

  private constructor(host: HTMLElement, machine: PublicMachine, theme: MachineTheme) {
    this.app = new Application();
    this.host = host;
    this.machine = machine;
    this.theme = theme;
    for (const s of machine.symbols) {
      const w = s.kind === "low" ? 9 : s.kind === "high" ? 5 : s.kind === "wild" ? 1.6 : 1.1;
      this.weights.push({ id: s.id, w });
      this.weightTotal += w;
    }
  }

  /** Creates the renderer, loading this machine's symbol art. */
  static async create(
    host: HTMLElement,
    machine: PublicMachine,
    theme: MachineTheme,
    onProgress?: (p: number) => void,
  ): Promise<SlotRenderer> {
    const r = new SlotRenderer(host, machine, theme);
    await r.init(onProgress);
    return r;
  }

  private async init(onProgress?: (p: number) => void): Promise<void> {
    const rect = this.host.getBoundingClientRect();
    await this.app.init({
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: "webgl",
      powerPreference: "high-performance",
    });
    const urls = Object.entries(this.theme.symbolArt);
    let loaded = 0;
    await Promise.all(
      urls.map(async ([id, url]) => {
        try {
          this.textures[id] = await Assets.load<Texture>(url);
        } catch (err) {
          console.warn(`Symbol ${id} failed to load`, err instanceof Error ? err.message : "unknown");
          this.textures[id] = Texture.WHITE;
        } finally {
          loaded += 1;
          onProgress?.(loaded / urls.length);
        }
      }),
    );
    if (this.destroyed) return;

    this.glowTex = makeGlowTexture();
    const canvas = this.app.canvas;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    this.host.appendChild(canvas);

    this.app.stage.addChild(this.root);
    this.root.addChild(this.panel, this.glowLayer, this.reelLayer, this.reelMask, this.boxLayer, this.winLayer, this.antLayer, this.frame, this.bulbs);
    this.reelLayer.mask = this.reelMask;
    this.winLayer.blendMode = "add";
    this.antLayer.blendMode = "add";
    this.bulbs.blendMode = "add";

    const { reels, rows } = this.machine;
    for (let i = 0; i < reels; i++) {
      const container = new Container();
      const sprites: Sprite[] = [];
      const ids: string[] = [];
      for (let k = 0; k < rows + 2; k++) {
        const id = this.randomSymbol(true);
        const s = new Sprite(this.textures[id]);
        s.anchor.set(0.5);
        container.addChild(s);
        sprites.push(s);
        ids.push(id);
      }
      const blur = new BlurFilter({ strengthX: 0, strengthY: 0, quality: 2, kernelSize: 5 });
      this.reelLayer.addChild(container);
      this.reels.push({
        index: i,
        container,
        sprites,
        ids,
        offset: 0,
        phase: "idle",
        t: 0,
        velocity: 0,
        queue: [],
        stopAt: null,
        stopDist: 0,
        stopDur: 0,
        stopT: 0,
        stopLast: 0,
        stopEase: 1.35,
        landed: true,
        landT: 999,
        blur,
        anticipating: false,
      });
      const glowCol: Sprite[] = [];
      for (let r = 0; r < rows; r++) {
        const g = new Sprite(this.glowTex);
        g.anchor.set(0.5);
        g.blendMode = "add";
        g.visible = false;
        this.glowLayer.addChild(g);
        glowCol.push(g);
      }
      this.glowSprites.push(glowCol);
    }

    this.layout();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.host);
    this.app.ticker.add((ticker) => this.update(ticker.deltaMS));
  }

  setEvents(events: RendererEvents): void {
    this.events = events;
  }

  private randomSymbol(noScatter = false): string {
    for (;;) {
      let roll = Math.random() * this.weightTotal;
      for (const { id, w } of this.weights) {
        roll -= w;
        if (roll <= 0) {
          if (noScatter && id === this.machine.scatter) break;
          return id;
        }
      }
      if (!noScatter) return this.weights[0].id;
    }
  }

  private palette(): FramePalette {
    return (
      this.theme.frame?.[this.mode] ?? { glow: 0xffb728, panelTop: "rgba(30,10,60,0.85)", panelBottom: "rgba(10,4,24,0.9)", anticipation: 0xffd84a, bulb: 0xfff0a0 }
    );
  }

  private layout(): void {
    if (this.destroyed) return;
    const rect = this.host.getBoundingClientRect();
    const W = Math.max(1, Math.floor(rect.width));
    const H = Math.max(1, Math.floor(rect.height));
    this.app.renderer.resize(W, H);
    const { reels, rows } = this.machine;
    const pad = 0.2;
    this.cell = Math.max(20, Math.floor(Math.min(W / (reels + pad * 2), H / (rows * 0.94 + pad * 2))));
    this.cellH = Math.floor(this.cell * 0.94);
    const gridW = this.cell * reels;
    const gridH = this.cellH * rows;
    this.originX = Math.floor((W - gridW) / 2);
    this.originY = Math.floor((H - gridH) / 2);

    for (const reel of this.reels) {
      reel.container.x = this.originX + reel.index * this.cell + this.cell / 2;
      reel.container.y = this.originY;
      reel.blur.padding = 0;
      this.positionReel(reel);
    }
    for (let i = 0; i < reels; i++) {
      for (let r = 0; r < rows; r++) {
        const g = this.glowSprites[i][r];
        g.x = this.originX + i * this.cell + this.cell / 2;
        g.y = this.originY + r * this.cellH + this.cellH / 2;
        g.width = this.cell * 1.35;
        g.height = this.cellH * 1.35;
      }
    }
    this.reelMask.clear().rect(this.originX, this.originY, gridW, gridH).fill(0xffffff);
    this.drawPanel();
    this.drawFrame();
  }

  private drawPanel(): void {
    const { reels, rows } = this.machine;
    const pal = this.palette();
    const gridW = this.cell * reels;
    const gridH = this.cellH * rows;
    const g = this.panel.clear();
    const bg = new FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: pal.panelTop },
        { offset: 0.5, color: pal.panelBottom },
        { offset: 1, color: pal.panelTop },
      ],
      textureSpace: "local",
    });
    g.roundRect(this.originX - 4, this.originY - 4, gridW + 8, gridH + 8, this.cell * 0.08).fill(bg);
    for (let i = 0; i < reels; i++) {
      const col = new FillGradient({
        type: "linear",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        colorStops: [
          { offset: 0, color: "rgba(0,0,0,0.35)" },
          { offset: 0.5, color: "rgba(255,255,255,0.07)" },
          { offset: 1, color: "rgba(0,0,0,0.35)" },
        ],
        textureSpace: "local",
      });
      g.rect(this.originX + i * this.cell + 2, this.originY, this.cell - 4, gridH).fill(col);
    }
    for (let i = 1; i < reels; i++) {
      const x = this.originX + i * this.cell;
      g.rect(x - 1, this.originY + 6, 2, gridH - 12).fill({ color: pal.glow, alpha: 0.35 });
    }
  }

  private drawFrame(): void {
    const { reels, rows } = this.machine;
    const pal = this.palette();
    const gridW = this.cell * reels;
    const gridH = this.cellH * rows;
    const t = Math.max(6, this.cell * 0.085);
    const x = this.originX - t * 0.9;
    const y = this.originY - t * 0.9;
    const w = gridW + t * 1.8;
    const h = gridH + t * 1.8;
    const r = this.cell * 0.16;
    const gold = new FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: "#fff4b0" },
        { offset: 0.18, color: "#ffc72c" },
        { offset: 0.45, color: "#9a5a00" },
        { offset: 0.62, color: "#ffd35c" },
        { offset: 0.85, color: "#c47d00" },
        { offset: 1, color: "#fff0a0" },
      ],
      textureSpace: "local",
    });
    const g = this.frame.clear();
    g.roundRect(x - t * 0.5, y - t * 0.5, w + t, h + t, r + t * 0.5).stroke({ width: t * 0.5, color: 0x1a0633, alpha: 0.85 });
    g.roundRect(x, y, w, h, r).stroke({ width: t, fill: gold });
    g.roundRect(x + t * 0.55, y + t * 0.55, w - t * 1.1, h - t * 1.1, r * 0.7).stroke({ width: Math.max(1.5, t * 0.16), color: pal.glow, alpha: 0.9 });
    g.roundRect(x + t * 0.2, y + t * 0.12, w - t * 0.4, t * 0.25, t * 0.2).fill({ color: 0xffffff, alpha: 0.28 });
  }

  private drawBulbs(): void {
    const { reels, rows } = this.machine;
    const pal = this.palette();
    const gridW = this.cell * reels;
    const gridH = this.cellH * rows;
    const t = Math.max(6, this.cell * 0.085);
    const x0 = this.originX - t * 0.9;
    const y0 = this.originY - t * 0.9;
    const w = gridW + t * 1.8;
    const h = gridH + t * 1.8;
    const spacing = Math.max(18, this.cell * 0.34);
    const g = this.bulbs.clear();
    const perim: [number, number][] = [];
    const nx = Math.max(2, Math.round(w / spacing));
    const ny = Math.max(2, Math.round(h / spacing));
    for (let i = 0; i < nx; i++) perim.push([x0 + (w * (i + 0.5)) / nx, y0]);
    for (let i = 0; i < ny; i++) perim.push([x0 + w, y0 + (h * (i + 0.5)) / ny]);
    for (let i = nx - 1; i >= 0; i--) perim.push([x0 + (w * (i + 0.5)) / nx, y0 + h]);
    for (let i = ny - 1; i >= 0; i--) perim.push([x0, y0 + (h * (i + 0.5)) / ny]);
    const speed = this.isSpinning() ? 14 : this.highlight.size > 0 ? 10 : 3.5;
    const head = this.time * speed;
    const n = perim.length;
    const size = Math.max(2, t * 0.26);
    for (let i = 0; i < n; i++) {
      const [bx, by] = perim[i];
      const phase = (((i - head) % 6) + 6) % 6;
      const a = phase < 1.4 ? 1 : 0.22;
      g.circle(bx, by, size * 2.4).fill({ color: pal.bulb, alpha: a * 0.25 });
      g.circle(bx, by, size).fill({ color: 0xffffff, alpha: 0.35 + a * 0.65 });
    }
  }

  private positionReel(reel: Reel): void {
    const baseScale = (tex: Texture) => (this.cell * 0.88) / Math.max(1, tex.width);
    const v = Math.abs(reel.velocity);
    const stretch = 1 + Math.min(0.16, v / 170);
    let squash = 1;
    if (reel.landT < 260) {
      const k = reel.landT / 260;
      squash = 1 - 0.07 * Math.sin(k * Math.PI) * (1 - k);
    }
    for (let k = 0; k < reel.sprites.length; k++) {
      const s = reel.sprites[k];
      const tex = s.texture;
      const bs = baseScale(tex);
      s.y = (k - 1 + reel.offset) * this.cellH + this.cellH / 2;
      s.x = 0;
      let sx = bs;
      let sy = bs * stretch * squash;
      const row = k - 1;
      let alpha = 1;
      if (reel.phase === "idle" && row >= 0 && row < this.machine.rows) {
        const key = `${reel.index},${row}`;
        if (this.highlight.size > 0) {
          if (this.highlight.has(key)) {
            const strong = this.highlightStrong.has(key);
            const pulse = 1 + (strong ? 0.11 : 0.06) * (0.5 + 0.5 * Math.sin(this.time * 9 + reel.index * 0.7));
            sx *= pulse;
            sy *= pulse;
            s.rotation = strong ? Math.sin(this.time * 14 + reel.index) * 0.035 : 0;
          } else {
            alpha = 0.32;
            s.rotation = 0;
          }
        } else {
          s.rotation = 0;
        }
      } else {
        s.rotation = 0;
      }
      s.scale.set(sx, sy);
      s.alpha = alpha;
    }
  }

  private setReelTextures(reel: Reel): void {
    for (let k = 0; k < reel.sprites.length; k++) {
      reel.sprites[k].texture = this.textures[reel.ids[k]] ?? Texture.WHITE;
    }
  }

  private shift(reel: Reel): void {
    reel.ids.pop();
    const next = reel.queue.length > 0 ? (reel.queue.shift() as string) : this.randomSymbol();
    reel.ids.unshift(next);
    this.setReelTextures(reel);
  }

  private advance(reel: Reel, cells: number): void {
    reel.offset += cells;
    while (reel.offset >= 1) {
      reel.offset -= 1;
      this.shift(reel);
    }
  }

  /** Shows a static grid (grid[reel][row]) with no animation. */
  setGrid(grid: string[][]): void {
    for (const reel of this.reels) {
      const col = grid[reel.index];
      if (!col) continue;
      reel.ids = [this.randomSymbol(true), ...col, this.randomSymbol(true)];
      reel.offset = 0;
      this.setReelTextures(reel);
      this.positionReel(reel);
    }
  }

  isSpinning(): boolean {
    return this.reels.some((r) => r.phase !== "idle");
  }

  /** Starts all reels together with a small upward kick. */
  startSpin(opts: SpinTiming): void {
    this.clearWins();
    this.timing = opts.turbo ? TURBO : NORMAL;
    this.pendingResult = null;
    this.slamRequested = false;
    this.anticipationFrom = -1;
    this.spinStartedAt = performance.now();
    this.stopPromise = new Promise<void>((resolve) => {
      this.stopResolve = resolve;
    });
    for (const reel of this.reels) {
      reel.phase = "kick";
      reel.t = 0;
      reel.velocity = 0;
      reel.queue = [];
      reel.stopAt = null;
      reel.landed = false;
      reel.anticipating = false;
    }
  }

  /** Feeds the server result. Returns a promise that resolves when every reel has landed. */
  setResult(grid: string[][], anticipationFrom: number): Promise<void> {
    this.pendingResult = { grid, anticipationFrom };
    this.anticipationFrom = anticipationFrom;
    const now = performance.now();
    const earliest = Math.max(now + 90, this.spinStartedAt + this.timing.minSpin);
    let at = earliest;
    for (const reel of this.reels) {
      if (reel.index > 0) {
        at += anticipationFrom > 0 && reel.index >= anticipationFrom ? this.timing.anticipation : this.timing.gap;
      }
      reel.stopAt = at;
    }
    if (this.slamRequested) this.slam();
    return this.stopPromise ?? Promise.resolve();
  }

  /** Stops every reel right now (spacebar / second tap). Waits for the result if it hasn't arrived. */
  slam(): void {
    if (!this.isSpinning()) return;
    if (!this.pendingResult) {
      this.slamRequested = true;
      return;
    }
    let any = false;
    for (const reel of this.reels) {
      if (reel.phase === "stopping" || reel.phase === "idle") continue;
      this.beginStop(reel, 0.2, 1.2);
      any = true;
    }
    if (any) this.endAnticipation();
  }

  private beginStop(reel: Reel, durationSec?: number, ease?: number): void {
    const result = this.pendingResult;
    if (!result) return;
    const col = result.grid[reel.index];
    reel.queue = [col[2], col[1], col[0], this.randomSymbol(true)];
    const offset = Math.min(reel.offset, 0.999);
    reel.stopDist = 4 - offset;
    reel.stopEase = ease ?? this.timing.ease;
    const v = Math.max(8, reel.velocity);
    reel.stopDur = durationSec ?? (reel.stopDist * (reel.stopEase + 3)) / v;
    reel.stopT = 0;
    reel.stopLast = 0;
    reel.phase = "stopping";
    reel.landed = false;
  }

  private land(reel: Reel): void {
    if (reel.landed) return;
    reel.landed = true;
    reel.landT = 0;
    const col = this.pendingResult?.grid[reel.index] ?? [];
    const hasScatter = col.includes(this.machine.scatter);
    const remaining = this.reels.filter((r) => !r.landed).length;
    this.events.onReelStop?.(reel.index, hasScatter, remaining === 0);
    if (this.anticipationFrom > 0 && reel.index === this.anticipationFrom - 1 && remaining > 0 && !this.slamRequested) {
      this.anticipationActive = true;
      for (const r of this.reels) if (r.index >= this.anticipationFrom) r.anticipating = true;
      this.events.onAnticipationStart?.();
    }
    if (reel.anticipating) reel.anticipating = false;
    if (remaining === 0) this.endAnticipation();
  }

  private endAnticipation(): void {
    if (!this.anticipationActive) return;
    this.anticipationActive = false;
    for (const r of this.reels) r.anticipating = false;
    this.events.onAnticipationEnd?.();
  }

  private update(deltaMS: number): void {
    if (this.destroyed) return;
    const dt = Math.min(deltaMS, 50) / 1000;
    this.time += dt;
    const now = performance.now();
    let allIdle = true;

    for (const reel of this.reels) {
      reel.landT += deltaMS;
      if (reel.phase === "kick") {
        reel.t += deltaMS;
        const k = Math.min(1, reel.t / KICK_MS);
        const target = -KICK_CELLS * (1 - (1 - k) * (1 - k));
        reel.offset = target;
        reel.velocity = 0;
        if (k >= 1) {
          reel.phase = "spin";
          reel.t = 0;
        }
      } else if (reel.phase === "spin") {
        reel.t += deltaMS;
        const accel = Math.min(1, reel.t / ACCEL_MS);
        const boost = reel.anticipating ? 1.18 : 1;
        reel.velocity = this.timing.speed * boost * accel * accel;
        this.advance(reel, reel.velocity * dt);
        if (reel.stopAt !== null && now >= reel.stopAt && this.pendingResult) {
          this.beginStop(reel);
        }
      } else if (reel.phase === "stopping") {
        reel.stopT += dt;
        const p = Math.min(1, reel.stopT / reel.stopDur);
        const f = backOut(p, reel.stopEase);
        const dist = reel.stopDist * f;
        const delta = dist - reel.stopLast;
        reel.velocity = Math.max(0, delta / Math.max(dt, 0.001));
        reel.stopLast = dist;
        if (delta >= 0) this.advance(reel, delta);
        else reel.offset += delta;
        if (!reel.landed && f >= 0.985) this.land(reel);
        if (p >= 1) {
          reel.offset = 0;
          reel.velocity = 0;
          reel.phase = "idle";
          if (!reel.landed) this.land(reel);
        }
      }
      if (reel.phase !== "idle") allIdle = false;

      const v = reel.velocity;
      if (v > 3) {
        reel.blur.strengthY = Math.min(18, v * 0.5) * (this.cell / 120);
        if (!reel.container.filters) reel.container.filters = [reel.blur];
      } else if (reel.container.filters) {
        reel.container.filters = null;
      }
      this.positionReel(reel);
    }

    if (allIdle && this.stopResolve) {
      const resolve = this.stopResolve;
      this.stopResolve = null;
      resolve();
    }

    this.updateGlows();
    this.drawAnticipation();
    this.drawBulbs();
  }

  private updateGlows(): void {
    const { reels, rows } = this.machine;
    for (let i = 0; i < reels; i++) {
      for (let r = 0; r < rows; r++) {
        const g = this.glowSprites[i][r];
        const key = `${i},${r}`;
        const on = this.highlight.has(key) && this.reels[i].phase === "idle";
        g.visible = on;
        if (on) {
          const strong = this.highlightStrong.has(key);
          g.alpha = (strong ? 0.75 : 0.45) + 0.25 * Math.sin(this.time * 7 + i);
          const s = 1 + 0.08 * Math.sin(this.time * 5 + r);
          g.width = this.cell * 1.3 * s;
          g.height = this.cellH * 1.3 * s;
        }
      }
    }
  }

  private drawAnticipation(): void {
    const g = this.antLayer.clear();
    if (!this.anticipationActive) return;
    const pal = this.palette();
    const gridH = this.cellH * this.machine.rows;
    const next = this.reels.find((r) => r.anticipating && r.phase !== "idle");
    for (const reel of this.reels) {
      if (!reel.anticipating) continue;
      const isNext = reel === next;
      const x = this.originX + reel.index * this.cell;
      const pulse = 0.55 + 0.45 * Math.sin(this.time * (isNext ? 16 : 8));
      const a = isNext ? 1 : 0.45;
      for (let layer = 0; layer < 4; layer++) {
        const inset = -layer * this.cell * 0.035;
        g.roundRect(x + 3 + inset, this.originY + 3 + inset, this.cell - 6 - inset * 2, gridH - 6 - inset * 2, this.cell * 0.1).stroke({
          width: Math.max(2, this.cell * (0.05 - layer * 0.008)),
          color: layer === 0 ? 0xffffff : pal.anticipation,
          alpha: (layer === 0 ? 0.8 : 0.5 / layer) * pulse * a,
        });
      }
      g.rect(x + 4, this.originY + 4, this.cell - 8, gridH - 8).fill({ color: pal.anticipation, alpha: 0.08 * pulse * a });
    }
  }

  /**
   * Presents wins: first all winning symbols together, then cycles line by line
   * until clearWins(). Resolves after the "all wins" beat.
   */
  showWins(wins: LineWin[], scatterPositions: [number, number][], opts: { turbo: boolean }): Promise<void> {
    this.clearWins();
    const token = ++this.winToken;
    if (wins.length === 0 && scatterPositions.length === 0) return Promise.resolve();
    const allKeys = new Set<string>();
    for (const w of wins) for (const [r, row] of w.positions) allKeys.add(`${r},${row}`);
    for (const [r, row] of scatterPositions) allKeys.add(`${r},${row}`);
    this.highlight = allKeys;
    this.highlightStrong = new Set(scatterPositions.map(([r, row]) => `${r},${row}`));
    this.drawLines(wins, -1);
    this.events.onLineShown?.(null, -1);

    const allMs = opts.turbo ? 700 : 1300;
    const lineMs = opts.turbo ? 800 : 1150;
    return new Promise<void>((resolve) => {
      let i = 0;
      const step = () => {
        if (token !== this.winToken || this.destroyed) return;
        if (wins.length <= 1) {
          if (wins.length === 1) {
            this.highlightLine(wins[0], 0, scatterPositions);
          }
          return;
        }
        const w = wins[i % wins.length];
        this.highlightLine(w, i % wins.length, []);
        i += 1;
        this.winCycleTimer = setTimeout(step, lineMs);
      };
      this.winCycleTimer = setTimeout(() => {
        resolve();
        step();
      }, allMs);
    });
  }

  private highlightLine(w: LineWin, index: number, extra: [number, number][]): void {
    this.highlight = new Set([...w.positions, ...extra].map(([r, row]) => `${r},${row}`));
    this.highlightStrong = new Set(w.positions.map(([r, row]) => `${r},${row}`));
    this.drawLines([w], index);
    this.events.onLineShown?.(w, index);
  }

  private cellCenter(reel: number, row: number): { x: number; y: number } {
    return { x: this.originX + reel * this.cell + this.cell / 2, y: this.originY + row * this.cellH + this.cellH / 2 };
  }

  private drawLines(wins: LineWin[], focus: number): void {
    const g = this.winLayer.clear();
    const b = this.boxLayer.clear();
    const all = focus < 0;
    for (const w of wins) {
      const color = LINE_COLORS[w.line % LINE_COLORS.length];
      const line = this.machine.paylines[w.line];
      const pts = line.map((row, reel) => this.cellCenter(reel, row));
      const first = pts[0];
      const lastPt = pts[pts.length - 1];
      const path: { x: number; y: number }[] = [{ x: first.x - this.cell * 0.5, y: first.y }, ...pts, { x: lastPt.x + this.cell * 0.5, y: lastPt.y }];
      const widths = all ? [this.cell * 0.09, this.cell * 0.035] : [this.cell * 0.2, this.cell * 0.1, this.cell * 0.04];
      const alphas = all ? [0.35, 0.9] : [0.25, 0.55, 1];
      widths.forEach((wd, idx) => {
        g.moveTo(path[0].x, path[0].y);
        for (let p = 1; p < path.length; p++) g.lineTo(path[p].x, path[p].y);
        g.stroke({ width: wd, color: idx === widths.length - 1 ? 0xffffff : color, alpha: alphas[idx], cap: "round", join: "round" });
      });
      if (!all) {
        for (const [reel, row] of w.positions) {
          const c = this.cellCenter(reel, row);
          const hw = this.cell * 0.46;
          const hh = this.cellH * 0.46;
          b.roundRect(c.x - hw, c.y - hh, hw * 2, hh * 2, this.cell * 0.12).stroke({ width: Math.max(3, this.cell * 0.045), color, alpha: 1 });
          b.roundRect(c.x - hw, c.y - hh, hw * 2, hh * 2, this.cell * 0.12).fill({ color, alpha: 0.1 });
        }
      }
    }
  }

  clearWins(): void {
    this.winToken += 1;
    if (this.winCycleTimer) clearTimeout(this.winCycleTimer);
    this.winCycleTimer = null;
    this.highlight = new Set();
    this.highlightStrong = new Set();
    this.winLayer.clear();
    this.boxLayer.clear();
  }

  setMode(mode: "base" | "free"): void {
    this.mode = mode;
    this.drawPanel();
    this.drawFrame();
  }

  /** Screen-space (CSS px) center of a reel cell, for DOM particle effects. */
  cellScreenCenter(reel: number, row: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const c = this.cellCenter(reel, row);
    return { x: rect.left + c.x, y: rect.top + c.y };
  }

  /** Screen-space center of the whole reel window. */
  screenCenter(): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    return {
      x: rect.left + this.originX + (this.cell * this.machine.reels) / 2,
      y: rect.top + this.originY + (this.cellH * this.machine.rows) / 2,
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.clearWins();
    this.ro?.disconnect();
    this.stopResolve?.();
    this.stopResolve = null;
    try {
      this.app.destroy({ removeView: true }, { children: true, texture: false });
    } catch {
      /* already torn down */
    }
    this.glowTex?.destroy(true);
  }
}
