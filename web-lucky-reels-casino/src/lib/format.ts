/** Full coin amount with thousands separators, e.g. 2,000,000. */
export function formatCoins(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

/** Compact coin amount, e.g. 2.5M, 25.1B. */
export function formatShort(n: number): string {
  const abs = Math.abs(n);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, s] of units) {
    if (abs >= v) {
      const x = n / v;
      const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
      return `${parseFloat(x.toFixed(digits))}${s}`;
    }
  }
  return String(Math.floor(n));
}

/** h:mm:ss or m:ss countdown. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v: number) => v.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
