/** Shared client types mirroring the backend API. The client never computes outcomes. */

export type SymbolKind = "wild" | "scatter" | "high" | "low";

export interface SymbolDef {
  id: string;
  name: string;
  kind: SymbolKind;
}

export interface PublicMachine {
  id: string;
  name: string;
  reels: number;
  rows: number;
  symbols: SymbolDef[];
  wild: string;
  scatter: string;
  paylines: number[][];
  paytable: Record<string, number[]>;
  scatterPays: number[];
  freeSpins: { awards: Record<string, number>; multiplier: number; retrigger: boolean };
  betLevels: number[];
  betUnlockLevels: number[];
  defaultBetIndex: number;
  winTiers: { big: number; mega: number; epic: number };
}

export interface MachineListing {
  id: string;
  name: string;
  unlockLevel: number;
  badge: "new" | "hot" | null;
  playable: boolean;
}

export interface StorePack {
  id: string;
  name: string;
  amount: number;
  cooldownMs: number;
}

export interface GameConfig {
  machines: MachineListing[];
  machineConfigs: Record<string, PublicMachine>;
  wheel: number[];
  store: StorePack[];
  jackpot: { value: number; perSecond: number; serverTime: number };
}

export interface FreeSpinState {
  machineId: string;
  remaining: number;
  total: number;
  totalWin: number;
  bet: number;
  betIndex: number;
}

export interface Player {
  identity: "guest" | "user";
  displayName: string | null;
  balance: number;
  level: number;
  xp: number;
  xpToNext: number;
  nextBonusAt: number;
  bonusAmount: number;
  nextWheelAt: number;
  wheelMultiplier: number;
  storeReadyAt: Record<string, number>;
  settings: { music: boolean; sfx: boolean };
  tutorialDone: boolean;
  freeSpins: FreeSpinState | null;
  totalSpins: number;
  biggestWin: number;
  serverTime: number;
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
  grid: string[][];
  wins: LineWin[];
  scatter: ScatterResult;
  lineWin: number;
  totalWin: number;
  anticipationFrom: number;
}

export type WinTier = "none" | "big" | "mega" | "epic";

export interface LevelUp {
  level: number;
  reward: number;
  unlockedMachines: string[];
  unlockedBets: number[];
}

export interface SpinResponse {
  outcome: SpinOutcome;
  bet: number;
  betIndex: number;
  isFreeSpin: boolean;
  multiplier: number;
  tier: WinTier;
  freeSpinsTriggered: number;
  freeSpinsSummary: { totalWin: number; spins: number; bet: number } | null;
  summaryTier: WinTier;
  levelUps: LevelUp[];
  scripted: boolean;
  player: Player;
}
