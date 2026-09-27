import egyptianTreasure from "../machines/egyptian-treasure.json";
import neonFruits from "../machines/neon-fruits.json";
import type { MachineConfig } from "./types";

/** Lobby listing. Machines without a config are shown as "coming soon". */
export interface MachineListing {
  id: string;
  name: string;
  unlockLevel: number;
  badge: "new" | "hot" | null;
  playable: boolean;
}

export const MACHINE_LISTINGS: MachineListing[] = [
  { id: "egyptian-treasure", name: "Egyptian Treasure", unlockLevel: 1, badge: "hot", playable: true },
  { id: "neon-fruits", name: "Neon Fruits", unlockLevel: 3, badge: "new", playable: true },
  { id: "dragons-fortune", name: "Dragon's Fortune", unlockLevel: 6, badge: null, playable: false },
  { id: "ocean-pearls", name: "Ocean Pearls", unlockLevel: 10, badge: null, playable: false },
];

export const MACHINES: Record<string, MachineConfig> = {
  [egyptianTreasure.id]: egyptianTreasure as MachineConfig,
  [neonFruits.id]: neonFruits as MachineConfig,
};

/** Public view of a machine config: everything the client needs to display, nothing it could use to decide outcomes. */
export function publicMachine(cfg: MachineConfig) {
  return {
    id: cfg.id,
    name: cfg.name,
    reels: cfg.reels,
    rows: cfg.rows,
    symbols: cfg.symbols,
    wild: cfg.wild,
    scatter: cfg.scatter,
    paylines: cfg.paylines,
    paytable: cfg.paytable,
    scatterPays: cfg.scatterPays,
    freeSpins: cfg.freeSpins,
    betLevels: cfg.betLevels,
    betUnlockLevels: cfg.betUnlockLevels,
    defaultBetIndex: cfg.defaultBetIndex,
    winTiers: cfg.winTiers,
  };
}
