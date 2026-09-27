/** Economy and progression rules. All values are virtual coins with no real-world value. */

export const START_BALANCE = 2_000_000;
export const BONUS_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const WHEEL_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MAX_LEVEL = 200;

/** XP needed to go from `level` to `level + 1`. Grows super-linearly so levels get harder. */
export function xpToNext(level: number): number {
  return Math.round(150 * Math.pow(level, 1.55));
}

/** XP earned per paid spin. Scales with bet size (square-root so max bet isn't a runaway). */
export function xpForBet(bet: number): number {
  return Math.max(1, Math.round(10 * Math.sqrt(bet / 2500)));
}

/** Coins awarded when reaching `level`. */
export function levelUpReward(level: number): number {
  return 100_000 + level * 50_000;
}

/** Coins from the 3-hour free bonus. */
export function freeBonusAmount(level: number): number {
  return 150_000 + (level - 1) * 25_000;
}

export interface WheelSegment {
  amount: number;
  weight: number;
}

/** Base daily wheel prizes, scaled by level at spin time. Order matches the wheel artwork clockwise. */
export const WHEEL_SEGMENTS: WheelSegment[] = [
  { amount: 100_000, weight: 16 },
  { amount: 500_000, weight: 6 },
  { amount: 150_000, weight: 14 },
  { amount: 1_000_000, weight: 3 },
  { amount: 200_000, weight: 12 },
  { amount: 75_000, weight: 16 },
  { amount: 250_000, weight: 10 },
  { amount: 2_500_000, weight: 1 },
  { amount: 125_000, weight: 14 },
  { amount: 750_000, weight: 4 },
  { amount: 300_000, weight: 8 },
  { amount: 5_000_000, weight: 1 },
];

export function wheelMultiplier(level: number): number {
  return 1 + (level - 1) * 0.1;
}

export interface StorePack {
  id: string;
  name: string;
  amount: number;
  cooldownMs: number;
}

/** Free demo packs. No real payments exist anywhere in the app. */
export const STORE_PACKS: StorePack[] = [
  { id: "pouch", name: "Coin Pouch", amount: 250_000, cooldownMs: 60 * 60 * 1000 },
  { id: "chest", name: "Treasure Chest", amount: 1_000_000, cooldownMs: 6 * 60 * 60 * 1000 },
  { id: "vault", name: "Royal Vault", amount: 5_000_000, cooldownMs: 24 * 60 * 60 * 1000 },
];
