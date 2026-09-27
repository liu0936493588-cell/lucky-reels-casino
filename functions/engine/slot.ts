import { seededRandom } from "./rng";
import type { LineWin, MachineConfig, Rng, ScatterResult, SpinOutcome } from "./types";

const stripCache = new Map<string, string[][]>();

/**
 * Lays out each reel strip from its symbol weights with a seeded shuffle, then
 * spaces scatters at least `rows` apart so at most one scatter shows per reel.
 */
export function buildStrips(cfg: MachineConfig): string[][] {
  const key = `${cfg.id}:${cfg.version}`;
  const cached = stripCache.get(key);
  if (cached) return cached;

  const rand = seededRandom(cfg.stripSeed);
  const strips = cfg.reelWeights.map((weights) => {
    const strip: string[] = [];
    for (const [sym, count] of Object.entries(weights)) {
      for (let i = 0; i < count; i++) strip.push(sym);
    }
    for (let i = strip.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [strip[i], strip[j]] = [strip[j], strip[i]];
    }
    spaceSymbol(strip, cfg.scatter, cfg.rows, rand);
    return strip;
  });
  stripCache.set(key, strips);
  return strips;
}

function spaceSymbol(strip: string[], sym: string, minGap: number, rand: () => number): void {
  const n = strip.length;
  const tooClose = (idx: number): boolean => {
    for (let d = 1; d < minGap; d++) {
      if (strip[(idx + d) % n] === sym || strip[(idx - d + n) % n] === sym) return true;
    }
    return false;
  };
  for (let attempt = 0; attempt < 5000; attempt++) {
    const bad = strip.findIndex((s, i) => s === sym && tooClose(i));
    if (bad === -1) return;
    const target = Math.floor(rand() * n);
    if (strip[target] === sym) continue;
    strip[bad] = strip[target];
    strip[target] = sym;
  }
}

/** Evaluates a finished grid. Every amount is computed here, never on the client. */
export function evaluateGrid(
  cfg: MachineConfig,
  grid: string[][],
  bet: number,
  multiplier: number,
): Omit<SpinOutcome, "stops"> {
  const lineBet = bet / cfg.paylines.length;
  const wins: LineWin[] = [];
  let lineWin = 0;

  for (let li = 0; li < cfg.paylines.length; li++) {
    const line = cfg.paylines[li];
    let sym: string | null = null;
    let count = 0;
    let leadingWilds = 0;
    for (let r = 0; r < cfg.reels; r++) {
      const cell = grid[r][line[r]];
      if (cell === cfg.scatter) break;
      if (cell === cfg.wild) {
        count++;
        if (sym === null) leadingWilds++;
        continue;
      }
      if (sym === null) {
        sym = cell;
        count++;
        continue;
      }
      if (cell === sym) count++;
      else break;
    }
    const symPay = sym ? (cfg.paytable[sym]?.[count] ?? 0) : 0;
    const wildPay = cfg.paytable[cfg.wild]?.[leadingWilds] ?? 0;
    let paySym = sym ?? cfg.wild;
    let payCount = count;
    let pay = symPay;
    if (wildPay > symPay) {
      paySym = cfg.wild;
      payCount = leadingWilds;
      pay = wildPay;
    }
    if (pay > 0) {
      const amount = Math.round(pay * lineBet * multiplier);
      const positions: [number, number][] = [];
      for (let r = 0; r < payCount; r++) positions.push([r, line[r]]);
      wins.push({ line: li, symbol: paySym, count: payCount, positions, amount });
      lineWin += amount;
    }
  }

  const scatterPositions: [number, number][] = [];
  for (let r = 0; r < cfg.reels; r++) {
    for (let row = 0; row < cfg.rows; row++) {
      if (grid[r][row] === cfg.scatter) scatterPositions.push([r, row]);
    }
  }
  const sCount = scatterPositions.length;
  const scatter: ScatterResult = {
    count: sCount,
    positions: sCount >= 3 ? scatterPositions : [],
    amount: Math.round((cfg.scatterPays[Math.min(sCount, cfg.scatterPays.length - 1)] ?? 0) * bet * multiplier),
    freeSpinsAwarded: cfg.freeSpins.awards[String(Math.min(sCount, cfg.reels))] ?? 0,
  };

  let anticipationFrom = -1;
  let seen = 0;
  for (let r = 0; r < cfg.reels - 1; r++) {
    for (let row = 0; row < cfg.rows; row++) if (grid[r][row] === cfg.scatter) seen++;
    if (seen >= 2) {
      anticipationFrom = r + 1;
      break;
    }
  }

  return {
    grid,
    wins,
    scatter,
    lineWin,
    totalWin: lineWin + scatter.amount,
    anticipationFrom,
  };
}

/** Spins every reel with the given RNG and evaluates the outcome. */
export function playSpin(cfg: MachineConfig, rng: Rng, bet: number, multiplier: number): SpinOutcome {
  const strips = buildStrips(cfg);
  const stops: number[] = [];
  const grid: string[][] = [];
  for (let r = 0; r < cfg.reels; r++) {
    const strip = strips[r];
    const stop = rng(strip.length);
    stops.push(stop);
    const col: string[] = [];
    for (let row = 0; row < cfg.rows; row++) col.push(strip[(stop + row) % strip.length]);
    grid.push(col);
  }
  return { stops, ...evaluateGrid(cfg, grid, bet, multiplier) };
}

/** Classifies a win against the machine's tiers. */
export function winTier(cfg: MachineConfig, win: number, bet: number): "none" | "big" | "mega" | "epic" {
  const x = win / bet;
  if (x >= cfg.winTiers.epic) return "epic";
  if (x >= cfg.winTiers.mega) return "mega";
  if (x >= cfg.winTiers.big) return "big";
  return "none";
}
