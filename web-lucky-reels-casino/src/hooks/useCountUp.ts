import { useEffect, useRef, useState } from "react";

/**
 * Smoothly rolls a displayed number toward `target` instead of jumping.
 * Duration scales with the size of the change (clamped).
 */
export function useCountUp(target: number, opts: { minMs?: number; maxMs?: number } = {}): number {
  const { minMs = 350, maxMs = 1600 } = opts;
  const [value, setValue] = useState<number>(target);
  const fromRef = useRef<number>(target);
  const valueRef = useRef<number>(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const from = valueRef.current;
    const delta = target - from;
    if (delta === 0) return;
    fromRef.current = from;
    const mag = Math.log10(Math.abs(delta) + 10);
    const dur = Math.min(maxMs, Math.max(minMs, mag * 220));
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + delta * eased);
      valueRef.current = v;
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, minMs, maxMs]);

  return value;
}

/** Re-renders every `ms` so countdowns stay live. */
export function useTicker(ms: number): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
