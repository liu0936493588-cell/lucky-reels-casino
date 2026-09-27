import { ChevronLeft, Gift, Settings, ShoppingBag } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";

import { flyCoinsToBalance, centerOf } from "@/game/collect";
import { useGame } from "@/game/useGame";
import { useCountUp, useTicker } from "@/hooks/useCountUp";
import { formatCoins, formatDuration, formatShort } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CoinIcon } from "./CoinIcon";
import { GButton } from "./GButton";

interface TopBarProps {
  onBack?: () => void;
  title?: string;
  titleClass?: string;
}

const BalancePill = memo(function BalancePill({ value }: { value: number }) {
  const shown = useCountUp(value);
  return (
    <div data-fx="balance" className="pill-dark relative flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-full pl-1 pr-3 sm:h-11 sm:max-w-[260px]">
      <CoinIcon className="h-8 w-8 sm:h-9 sm:w-9" />
      <span className="font-display tabular truncate text-[17px] text-gold-flat sm:text-[20px]">{formatCoins(shown)}</span>
    </div>
  );
});

const LevelBadge = memo(function LevelBadge({ level, xp, xpToNext }: { level: number; xp: number; xpToNext: number }) {
  const pct = Math.max(2, Math.min(100, (xp / Math.max(1, xpToNext)) * 100));
  return (
    <div className="flex min-w-0 items-center" title={`${formatCoins(xp)} / ${formatCoins(xpToNext)} XP`}>
      <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full drop-shadow-[0_0_8px_rgba(34,228,255,0.6)]">
          <defs>
            <linearGradient id="lvl-g" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#c6fbff" />
              <stop offset="0.5" stopColor="#1fb6e0" />
              <stop offset="1" stopColor="#0a4f8a" />
            </linearGradient>
          </defs>
          <path d="M24 2l6.2 12.6 13.8 2-10 9.8 2.4 13.8L24 33.7l-12.4 6.5L14 26.4 4 16.6l13.8-2z" fill="url(#lvl-g)" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <span className="font-display relative text-[15px] text-white text-outline">{level}</span>
      </div>
      <div className="-ml-3 hidden h-5 w-20 items-center rounded-r-full pl-3 pr-1 sm:flex md:w-28 pill-dark">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/60">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-fuchsia-400 shadow-[0_0_8px_rgba(34,228,255,0.8)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
});

function BonusButton() {
  const { player, now, collectBonus, releaseWin, tutorial, setTutorial } = useGame();
  useTicker(1000);
  const [claiming, setClaiming] = useState<boolean>(false);
  const ref = useRef<HTMLButtonElement>(null);
  const remaining = player ? player.nextBonusAt - now() : 1;
  const ready = remaining <= 0;

  const onClick = useCallback(async () => {
    if (!ready || claiming) return;
    setClaiming(true);
    const amount = await collectBonus();
    setClaiming(false);
    if (amount !== null) {
      flyCoinsToBalance(centerOf(ref.current), amount, (a) => releaseWin(a));
      if (tutorial === "bonus") setTimeout(() => setTutorial("finish"), 900);
    }
  }, [ready, claiming, collectBonus, releaseWin, tutorial, setTutorial]);

  return (
    <GButton
      ref={ref}
      data-tut="bonus"
      variant={ready ? "green" : "dark"}
      onClick={onClick}
      disabled={claiming}
      className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 sm:h-11 sm:px-3.5", ready && "glow-pulse")}
      aria-label={ready ? "Collect free bonus" : "Next free bonus"}
    >
      <Gift className={cn("h-5 w-5", ready && "heartbeat")} strokeWidth={2.6} />
      <span className="flex flex-col items-start leading-none">
        <span className="text-[9px] tracking-wider opacity-90 sm:text-[10px]">{ready ? "FREE" : "BONUS IN"}</span>
        <span className="tabular text-[13px] sm:text-[15px]">{ready ? formatShort(player?.bonusAmount ?? 0) : formatDuration(remaining)}</span>
      </span>
    </GButton>
  );
}

/** Casino top bar: balance, level/XP, free-bonus timer, store and settings. */
export function TopBar({ onBack, title, titleClass }: TopBarProps) {
  const { player, displayBalance, setModal } = useGame();
  if (!player) return null;
  return (
    <header className="pt-safe relative z-30 w-full">
      <div className="mx-auto flex max-w-[1400px] items-center gap-1.5 px-2 py-1.5 sm:gap-3 sm:px-4 sm:py-2">
        {onBack ? (
          <GButton variant="purple" onClick={onBack} aria-label="Back to lobby" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11">
            <ChevronLeft className="h-6 w-6" strokeWidth={3.5} />
          </GButton>
        ) : null}
        <LevelBadge level={player.level} xp={player.xp} xpToNext={player.xpToNext} />
        <BalancePill value={displayBalance} />
        {title ? <div className={cn("hidden flex-1 truncate text-center text-[22px] text-gold lg:block", titleClass)}>{title}</div> : <div className="hidden flex-1 lg:block" />}
        <BonusButton />
        <GButton
          variant="pink"
          onClick={() => setModal("store")}
          className="shimmer glow-pulse-pink flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 sm:h-11 sm:px-4"
          aria-label="Store"
        >
          <ShoppingBag className="h-5 w-5" strokeWidth={2.6} />
          <span className="hidden text-[15px] sm:inline">STORE</span>
        </GButton>
        <GButton variant="dark" onClick={() => setModal("settings")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11" aria-label="Settings">
          <Settings className="h-5 w-5" strokeWidth={2.6} />
        </GButton>
      </div>
    </header>
  );
}
