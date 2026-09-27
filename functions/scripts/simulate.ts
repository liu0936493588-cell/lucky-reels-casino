/**
 * Slot math verification. Runs N paid spins per machine (default 1,000,000),
 * plays out every free-spin round, and reports RTP, hit frequency, bonus
 * frequency, win-tier frequency and volatility.
 *
 *   bun run functions/scripts/simulate.ts [spins] [seed]
 */
import { MACHINES } from "../engine/machines";
import { secureRng, seededRng } from "../engine/rng";
import { playSpin, winTier } from "../engine/slot";
import type { MachineConfig, Rng } from "../engine/types";

export interface SimStats {
  spins: number;
  rtp: number;
  baseRtp: number;
  scatterRtp: number;
  freeRtp: number;
  hitRate: number;
  bonusRate: number;
  avgFreeSpins: number;
  retriggers: number;
  big: number;
  mega: number;
  epic: number;
  stdDev: number;
  maxWinX: number;
}

/** Plays `spins` paid spins (with all resulting free spins) and returns the measured math. */
export function runSimulation(cfg: MachineConfig, spins: number, rng: Rng): SimStats {
  const bet = 100 * cfg.paylines.length;
  let wagered = 0;
  let returned = 0;
  let baseReturn = 0;
  let freeReturn = 0;
  let scatterReturn = 0;
  let hits = 0;
  let triggers = 0;
  let retriggers = 0;
  let freeSpinsPlayed = 0;
  let sumSq = 0;
  const tiers = { big: 0, mega: 0, epic: 0 };
  let maxWinX = 0;

  for (let i = 0; i < spins; i++) {
    wagered += bet;
    const base = playSpin(cfg, rng, bet, 1);
    let spinTotal = base.totalWin;
    baseReturn += base.lineWin;
    scatterReturn += base.scatter.amount;
    if (base.totalWin > 0 || base.scatter.freeSpinsAwarded > 0) hits++;

    if (base.scatter.freeSpinsAwarded > 0) {
      triggers++;
      let remaining = base.scatter.freeSpinsAwarded;
      let guard = 0;
      while (remaining > 0 && guard < 500) {
        remaining--;
        guard++;
        freeSpinsPlayed++;
        const fs = playSpin(cfg, rng, bet, cfg.freeSpins.multiplier);
        spinTotal += fs.totalWin;
        freeReturn += fs.totalWin;
        if (cfg.freeSpins.retrigger && fs.scatter.freeSpinsAwarded > 0) {
          retriggers++;
          remaining += fs.scatter.freeSpinsAwarded;
        }
      }
    }

    returned += spinTotal;
    const x = spinTotal / bet;
    sumSq += x * x;
    if (x > maxWinX) maxWinX = x;
    const tier = winTier(cfg, spinTotal, bet);
    if (tier !== "none") tiers[tier]++;
  }

  const rtp = returned / wagered;
  return {
    spins,
    rtp,
    baseRtp: baseReturn / wagered,
    scatterRtp: scatterReturn / wagered,
    freeRtp: freeReturn / wagered,
    hitRate: hits / spins,
    bonusRate: triggers / spins,
    avgFreeSpins: freeSpinsPlayed / Math.max(1, triggers),
    retriggers,
    big: tiers.big,
    mega: tiers.mega,
    epic: tiers.epic,
    stdDev: Math.sqrt(sumSq / spins - rtp * rtp),
    maxWinX,
  };
}

/** Pretty-prints a simulation report. */
export function printReport(name: string, s: SimStats): void {
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const oneIn = (n: number) => (n > 0 ? `1 in ${(s.spins / n).toFixed(1)}` : "never");
  console.log(`\n=== ${name} (${s.spins.toLocaleString()} paid spins) ===`);
  console.log(`RTP                 ${pct(s.rtp)}`);
  console.log(`  base line wins    ${pct(s.baseRtp)}`);
  console.log(`  scatter pays      ${pct(s.scatterRtp)}`);
  console.log(`  free spins        ${pct(s.freeRtp)}`);
  console.log(`Hit frequency       ${pct(s.hitRate)}  (1 in ${(1 / s.hitRate).toFixed(2)})`);
  console.log(`Bonus frequency     ${pct(s.bonusRate)}  (1 in ${(1 / s.bonusRate).toFixed(1)})`);
  console.log(`  avg free spins    ${s.avgFreeSpins.toFixed(2)} per bonus, retriggers ${s.retriggers}`);
  console.log(`Big Win (10x+)      ${oneIn(s.big)}`);
  console.log(`Mega Win (25x+)     ${oneIn(s.mega)}`);
  console.log(`Epic Win (50x+)     ${oneIn(s.epic)}`);
  console.log(`Std deviation       ${s.stdDev.toFixed(2)}x bet  (volatility index)`);
  console.log(`Max win             ${s.maxWinX.toFixed(1)}x bet`);
}

if (import.meta.main) {
  const spins = Number(process.argv[2] ?? 1_000_000);
  const seedArg = process.argv[3];
  const rng = seedArg ? seededRng(Number(seedArg)) : secureRng;
  for (const cfg of Object.values(MACHINES)) printReport(cfg.name, runSimulation(cfg, spins, rng));
}
