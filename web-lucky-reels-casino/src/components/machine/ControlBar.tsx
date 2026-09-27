import { Info, Minus, Plus, RotateCw, Square, Zap } from "lucide-react";
import { memo } from "react";

import { CoinIcon } from "@/components/casino/CoinIcon";
import { GButton } from "@/components/casino/GButton";
import { useCountUp } from "@/hooks/useCountUp";
import { formatCoins, formatShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ControlBarProps {
  bet: number;
  canDec: boolean;
  canInc: boolean;
  isMaxBet: boolean;
  onDec: () => void;
  onInc: () => void;
  onMax: () => void;
  onSpin: () => void;
  onInfo: () => void;
  onAuto: () => void;
  onTurbo: () => void;
  turbo: boolean;
  spinning: boolean;
  autoLeft: number | null;
  freeSpins: { played: number; total: number } | null;
  win: number;
  winLabel: string;
  lineText: string | null;
  lockedHint: string | null;
  betLocked: boolean;
}

const WinMeter = memo(function WinMeter({ win, label, lineText }: { win: number; label: string; lineText: string | null }) {
  const shown = useCountUp(win, { minMs: 500, maxMs: 1400 });
  return (
    <div className="pill-dark flex min-w-0 flex-col items-center justify-center rounded-2xl px-3 py-1">
      <span className="text-[10px] tracking-[0.25em] text-amber-100/70">{label}</span>
      <span className={cn("font-display tabular truncate text-[20px] leading-tight sm:text-[24px]", shown > 0 ? "text-gold-flat" : "text-violet-200/40")}>{formatCoins(shown)}</span>
      <span className="h-3.5 truncate text-[10px] text-cyan-100/80">{lineText ?? ""}</span>
    </div>
  );
});

function SpinButton({ onSpin, spinning, autoLeft, freeSpins }: Pick<ControlBarProps, "onSpin" | "spinning" | "autoLeft" | "freeSpins">) {
  const inFree = freeSpins !== null;
  let label = "SPIN";
  let sub: string | null = null;
  if (autoLeft !== null) {
    label = "STOP";
    sub = `AUTO ${autoLeft}`;
  } else if (inFree) {
    label = "FREE";
    sub = `${freeSpins.total - freeSpins.played} LEFT`;
  } else if (spinning) {
    label = "STOP";
  }
  return (
    <GButton
      data-tut="spin"
      silent
      variant={inFree ? "cyan" : autoLeft !== null ? "pink" : "green"}
      onClick={onSpin}
      className={cn("relative flex h-[84px] w-[84px] shrink-0 flex-col items-center justify-center rounded-full sm:h-[100px] sm:w-[100px]", !spinning && autoLeft === null && !inFree && "glow-pulse")}
      aria-label={label}
    >
      {label === "STOP" && autoLeft === null ? (
        <Square className="h-7 w-7 fill-current" strokeWidth={2.5} />
      ) : (
        <RotateCw className={cn("h-7 w-7 sm:h-8 sm:w-8", spinning && "animate-spin")} strokeWidth={3.2} />
      )}
      <span className="text-[17px] leading-none sm:text-[20px]">{label}</span>
      {sub ? <span className="text-[10px] leading-none opacity-90">{sub}</span> : null}
    </GButton>
  );
}

/** Bottom control bar: bet, max bet, spin, autospin, turbo, info and the win meter. */
export function ControlBar(props: ControlBarProps) {
  const { bet, canDec, canInc, isMaxBet, onDec, onInc, onMax, onInfo, onAuto, onTurbo, turbo, spinning, autoLeft, freeSpins, win, winLabel, lineText, lockedHint, betLocked } = props;
  const betDisabled = betLocked || spinning || autoLeft !== null || freeSpins !== null;

  const betBlock = (
    <div className="flex flex-col items-center gap-1">
      <div className="pill-dark flex items-center gap-1 rounded-full p-1">
        <GButton variant="purple" onClick={onDec} disabled={betDisabled || !canDec} className="flex h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10" aria-label="Decrease bet">
          <Minus className="h-5 w-5" strokeWidth={3.5} />
        </GButton>
        <div className="flex min-w-[76px] flex-col items-center px-1 sm:min-w-[96px]">
          <span className="text-[9px] tracking-[0.25em] text-amber-100/70">TOTAL BET</span>
          <span className="flex items-center gap-1">
            <CoinIcon className="h-4 w-4" />
            <span className="font-display tabular text-gold-flat text-[18px] leading-tight sm:text-[21px]">{formatShort(bet)}</span>
          </span>
        </div>
        <GButton variant="purple" onClick={onInc} disabled={betDisabled || !canInc} className="flex h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10" aria-label="Increase bet">
          <Plus className="h-5 w-5" strokeWidth={3.5} />
        </GButton>
      </div>
      <span className="h-3 text-[10px] leading-3 text-violet-200/60">{lockedHint ?? ""}</span>
    </div>
  );

  const maxBtn = (
    <GButton variant="gold" onClick={onMax} disabled={betDisabled || isMaxBet} className="h-12 shrink-0 rounded-2xl px-3 text-[15px] leading-none sm:h-14 sm:px-4 sm:text-[17px]">
      <span>
        MAX
        <br />
        BET
      </span>
    </GButton>
  );

  const small = (
    <>
      <GButton variant="dark" onClick={onInfo} className="flex h-11 w-11 items-center justify-center rounded-2xl" aria-label="Paytable and rules">
        <Info className="h-5 w-5" strokeWidth={2.8} />
      </GButton>
      <GButton variant="purple" onClick={onTurbo} className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", turbo && "is-on")} aria-label="Turbo" aria-pressed={turbo}>
        <Zap className={cn("h-5 w-5", turbo && "fill-current")} strokeWidth={2.8} />
      </GButton>
      <GButton
        variant="purple"
        onClick={onAuto}
        disabled={freeSpins !== null}
        className={cn("flex h-11 items-center justify-center rounded-2xl px-3 text-[14px]", autoLeft !== null && "is-on")}
        aria-label="Autospin"
      >
        <span>AUTO</span>
      </GButton>
    </>
  );

  return (
    <div className="pb-safe relative z-20 w-full">
      <div className="absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-[#07031a] via-[#0d0526]/95 to-transparent" />
      <div className="relative mx-auto w-full max-w-[1100px] px-2 pb-2 pt-1 sm:px-4">
        {/* Phones: two rows, thumb-friendly */}
        <div className="flex flex-col gap-1.5 md:hidden">
          <div className="flex items-stretch gap-2">
            <div className="flex-1">
              <WinMeter win={win} label={winLabel} lineText={lineText} />
            </div>
            <div className="flex items-center gap-1.5">{small}</div>
          </div>
          <div className="flex items-center justify-between gap-2">
            {maxBtn}
            {betBlock}
            <SpinButton {...props} />
          </div>
        </div>
        {/* Tablet / desktop: one row */}
        <div className="hidden items-center gap-3 md:flex">
          <div className="flex items-center gap-2">{small}</div>
          <div className="min-w-0 flex-1">
            <WinMeter win={win} label={winLabel} lineText={lineText} />
          </div>
          {betBlock}
          {maxBtn}
          <SpinButton {...props} />
        </div>
      </div>
    </div>
  );
}
