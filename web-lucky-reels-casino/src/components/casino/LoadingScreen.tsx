import { RefreshCw } from "lucide-react";

import { GButton } from "./GButton";

interface LoadingScreenProps {
  progress?: number;
  label?: string;
  error?: string | null;
  onRetry?: () => void;
  art?: string;
  title?: string;
  titleClass?: string;
}

/** Branded loading screen with a gold progress bar. */
export function LoadingScreen({ progress, label = "Loading", error, onRetry, art, title, titleClass }: LoadingScreenProps) {
  const pct = progress === undefined ? undefined : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div className="casino-bg fixed inset-0 z-40 flex flex-col items-center justify-center gap-7 overflow-hidden px-6">
      <div className="stars-bg pointer-events-none absolute inset-0" />
      {art ? (
        <div className="relative h-44 w-32 overflow-hidden rounded-3xl shadow-[0_0_40px_rgba(255,190,40,0.45)] ring-2 ring-amber-300/70 sm:h-56 sm:w-40">
          <img src={art} alt="" className="kenburns h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="relative text-center">
        {title ? (
          <div className={`text-gold text-[34px] leading-none sm:text-[44px] ${titleClass ?? "font-display"}`}>{title}</div>
        ) : (
          <div className="font-display text-gold text-[44px] leading-none sm:text-[56px]">
            LUCKY REELS
            <div className="mt-1 text-[18px] tracking-[0.5em] sm:text-[22px]">CASINO</div>
          </div>
        )}
      </div>
      {error ? (
        <div className="relative flex flex-col items-center gap-3 text-center">
          <p className="max-w-xs text-sm text-violet-100/80">{error}</p>
          {onRetry ? (
            <GButton variant="gold" onClick={onRetry} className="flex items-center gap-2 px-6 py-3 text-lg">
              <RefreshCw className="h-5 w-5" strokeWidth={3} /> TRY AGAIN
            </GButton>
          ) : null}
        </div>
      ) : (
        <div className="relative flex w-[min(320px,78vw)] flex-col items-center gap-2">
          <div className="h-5 w-full overflow-hidden rounded-full p-[3px] pill-dark">
            {pct === undefined ? (
              <div className="h-full w-2/5 animate-[shimmer-sweep_1.3s_ease-in-out_infinite] rounded-full bg-gradient-to-b from-[#fff3a8] via-[#ffc933] to-[#e59400]" />
            ) : (
              <div
                className="shimmer h-full rounded-full bg-gradient-to-b from-[#fff3a8] via-[#ffc933] to-[#e59400] shadow-[0_0_12px_rgba(255,200,40,0.8)] transition-[width] duration-300"
                style={{ width: `${Math.max(6, pct)}%` }}
              />
            )}
          </div>
          <span className="font-display text-[13px] tracking-[0.3em] text-amber-100/80">
            {label.toUpperCase()}
            {pct !== undefined ? ` ${pct}%` : "…"}
          </span>
        </div>
      )}
    </div>
  );
}
