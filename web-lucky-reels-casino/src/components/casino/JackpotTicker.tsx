import { Crown } from "lucide-react";
import { useEffect, useRef } from "react";

import { useGame } from "@/game/useGame";
import { formatCoins } from "@/lib/format";

/** Slowly climbing Grand Jackpot display (cosmetic). Updates the DOM directly to avoid re-renders. */
export function JackpotTicker() {
  const { config, now } = useGame();
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!config) return;
    const { value, perSecond, serverTime } = config.jackpot;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 60 && textRef.current) {
        last = t;
        const v = value + ((now() - serverTime) / 1000) * perSecond;
        textRef.current.textContent = formatCoins(v);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [config, now]);

  return (
    <div className="relative mx-auto w-full max-w-[760px] px-3">
      <div className="panel-gold relative overflow-hidden rounded-[22px] px-4 pb-2.5 pt-2 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-3 pt-1.5">
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} className="bulb h-1.5 w-1.5 rounded-full bg-amber-200" style={{ animationDelay: `${(i % 6) * 0.15}s` }} />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(255,46,154,0.35),transparent_60%)]" />
        <div className="relative mt-1 flex items-center justify-center gap-2">
          <Crown className="h-5 w-5 text-amber-300 drop-shadow-[0_0_6px_rgba(255,200,40,0.9)]" strokeWidth={2.5} />
          <span className="neon-pink font-display text-[15px] tracking-[0.25em] sm:text-[17px]">GRAND JACKPOT</span>
          <Crown className="h-5 w-5 text-amber-300 drop-shadow-[0_0_6px_rgba(255,200,40,0.9)]" strokeWidth={2.5} />
        </div>
        <div className="relative flex items-center justify-center">
          <span ref={textRef} className="font-display tabular text-gold text-[30px] leading-tight sm:text-[42px]">
            {formatCoins(config?.jackpot.value ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
