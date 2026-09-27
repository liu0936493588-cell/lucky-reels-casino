import type { Rng } from "./types";

const POOL_SIZE = 256;
let pool = new Uint32Array(POOL_SIZE);
let poolIndex = POOL_SIZE;

function nextU32(): number {
  if (poolIndex >= POOL_SIZE) {
    pool = new Uint32Array(POOL_SIZE);
    crypto.getRandomValues(pool);
    poolIndex = 0;
  }
  return pool[poolIndex++];
}

/**
 * Cryptographically secure uniform integer in [0, maxExclusive) using
 * rejection sampling so there is no modulo bias.
 */
export const secureRng: Rng = (maxExclusive: number): number => {
  if (maxExclusive <= 1) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  for (;;) {
    const v = nextU32();
    if (v < limit) return v % maxExclusive;
  }
};

/** Small deterministic PRNG (mulberry32) used for strip layout and fast simulation. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Rng wrapper for simulations. */
export function seededRng(seed: number): Rng {
  const rand = seededRandom(seed);
  return (maxExclusive: number) => Math.floor(rand() * maxExclusive);
}
