import { audio, vibrate } from "./audio";
import { fx, fxTarget, type Point, pulseBalance } from "./fx";

/** Center of a DOM element, for effect origins. */
export function centerOf(el: Element | null | undefined): Point {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Flies coins from `from` into the balance counter. The held amount is released
 * (so the counter starts rolling up) as the first coin lands.
 */
export function flyCoinsToBalance(from: Point, amount: number, release: (amount: number) => void, count?: number): void {
  const to = fxTarget("balance") ?? { x: window.innerWidth / 2, y: 28 };
  const n = count ?? Math.round(Math.min(26, 8 + Math.log10(Math.max(10, amount)) * 2.5));
  audio.play("coin", { volume: 0.8 });
  fx.burst(from.x, from.y, 26);
  let released = false;
  fx.flyTo(from, to, n, (i) => {
    if (!released) {
      released = true;
      release(amount);
    }
    pulseBalance();
    if (i % 3 === 0) audio.play("coin", { volume: 0.35, rate: 1 + Math.random() * 0.25 });
    if (i === n - 1) vibrate(12);
  });
  // Safety net in case the effects layer is unavailable.
  setTimeout(() => {
    if (!released) {
      released = true;
      release(amount);
    }
  }, 1800);
}
