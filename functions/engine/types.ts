/** Symbol categories used by the slot engine. */
export type SymbolKind = "wild" | "scatter" | "high" | "low";

export interface SymbolDef {
  id: string;
  name: string;
  kind: SymbolKind;
}

/**
 * A slot machine definition. Everything that shapes the math lives here so new
 * machines can be added by dropping in a new JSON file.
 */
export interface MachineConfig {
  id: string;
  name: string;
  version: number;
  reels: number;
  rows: number;
  symbols: SymbolDef[];
  wild: string;
  scatter: string;
  /** Deterministic seed used to lay out each reel strip from its weights. */
  stripSeed: number;
  /** Per-reel symbol counts ("weights") that make up each reel strip. */
  reelWeights: Record<string, number>[];
  /** Row index per reel for each payline (0 = top row). */
  paylines: number[][];
  /** Pays per symbol indexed by match count, in multiples of the line bet. */
  paytable: Record<string, number[]>;
  /** Scatter pays indexed by scatter count, in multiples of the total bet. */
  scatterPays: number[];
  freeSpins: {
    /** Free spins awarded by scatter count, e.g. { "3": 8 }. */
    awards: Record<string, number>;
    multiplier: number;
    retrigger: boolean;
  };
  betLevels: number[];
  /** Minimum player level required for each bet level. */
  betUnlockLevels: number[];
  defaultBetIndex: number;
  /** Win tiers as multiples of the total bet. */
  winTiers: { big: number; mega: number; epic: number };
  /** Scripted outcome used once for the first-session tutorial. */
  tutorialGrid?: string[][];
}

export interface LineWin {
  line: number;
  symbol: string;
  count: number;
  positions: [number, number][];
  amount: number;
}

export interface ScatterResult {
  count: number;
  positions: [number, number][];
  amount: number;
  freeSpinsAwarded: number;
}

export interface SpinOutcome {
  stops: number[];
  /** grid[reel][row] */
  grid: string[][];
  wins: LineWin[];
  scatter: ScatterResult;
  lineWin: number;
  totalWin: number;
  /** First reel that should play anticipation, or -1. */
  anticipationFrom: number;
}

export type Rng = (maxExclusive: number) => number;
