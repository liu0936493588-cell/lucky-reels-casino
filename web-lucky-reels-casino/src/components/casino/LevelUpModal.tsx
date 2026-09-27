import { Lock, TrendingUp, Unlock } from "lucide-react";
import { useEffect, useRef } from "react";

import { audio, vibrate } from "@/game/audio";
import { centerOf } from "@/game/collect";
import { fx, fxTarget, pulseBalance } from "@/game/fx";
import { useGame } from "@/game/useGame";
import { formatCoins, formatShort } from "@/lib/format";

import { CoinIcon } from "./CoinIcon";
import { GButton } from "./GButton";
import { Modal } from "./Modal";

/** Level-up celebration: coins reward plus any newly unlocked machines and bets. */
export function LevelUpModal() {
  const { levelUps, collectLevelUp, busy, tutorial } = useGame();
  const current = levelUps[0];
  const open = Boolean(current) && !busy && tutorial !== "spinning";
  const btnRef = useRef<HTMLButtonElement>(null);
  const shownRef = useRef<number>(0);

  useEffect(() => {
    if (!open || !current || shownRef.current === current.level) return;
    shownRef.current = current.level;
    audio.play("levelUp", { volume: 0.95 });
    audio.duck(0.3, 2200);
    vibrate([20, 40, 60]);
    fx.burst(window.innerWidth / 2, window.innerHeight * 0.35, 80, "rgba(60,230,255,0.9)");
    fx.shower(1600, 22);
  }, [open, current]);

  if (!current) return null;

  const onCollect = () => {
    const from = centerOf(btnRef.current);
    const to = fxTarget("balance") ?? { x: window.innerWidth / 2, y: 30 };
    audio.play("coin", { volume: 0.8 });
    fx.flyTo(from, to, 18, (i) => {
      pulseBalance();
      if (i % 3 === 0) audio.play("coin", { volume: 0.35 });
    });
    collectLevelUp();
  };

  return (
    <Modal open={open} z="z-[65]" hideClose>
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="relative -mt-2 h-36 w-36">
          <div className="light-rays !h-[340px] !w-[340px]" />
          <svg viewBox="0 0 100 100" className="relative h-full w-full drop-shadow-[0_0_20px_rgba(34,228,255,0.8)] float-y">
            <defs>
              <linearGradient id="lvstar" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#e6fdff" />
                <stop offset="0.45" stopColor="#22c7f0" />
                <stop offset="1" stopColor="#0a3f8a" />
              </linearGradient>
            </defs>
            <path d="M50 4l13 26.5 29 4.2-21 20.5 5 29L50 70.5 24 84.2l5-29L8 34.7l29-4.2z" fill="url(#lvstar)" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
            <text x="50" y="58" textAnchor="middle" fontFamily="Lilita One, sans-serif" fontSize="30" fill="#fff" stroke="#063a6a" strokeWidth="3" paintOrder="stroke">
              {current.level}
            </text>
          </svg>
        </div>
        <h2 className="font-display text-gold text-[46px] leading-none slam-in">LEVEL UP!</h2>
        <p className="mt-1 text-[14px] text-violet-100/80">You reached level {current.level}</p>
        <div className="mt-3 flex items-center gap-2 rounded-full px-5 py-2 pill-dark">
          <CoinIcon className="h-8 w-8" />
          <span className="font-display text-gold-flat text-[30px]">+{formatCoins(current.reward)}</span>
        </div>
        {current.unlockedMachines.length > 0 || current.unlockedBets.length > 0 ? (
          <div className="mt-3 flex w-full flex-col gap-2">
            {current.unlockedMachines.map((m) => (
              <div key={m} className="flex items-center gap-2 rounded-xl bg-fuchsia-500/15 px-3 py-2 text-left text-[14px] text-fuchsia-50 ring-1 ring-fuchsia-300/40">
                <Unlock className="h-4 w-4 text-fuchsia-300" /> New machine unlocked: <b>{m}</b>
              </div>
            ))}
            {current.unlockedBets.length > 0 ? (
              <div className="flex items-center gap-2 rounded-xl bg-cyan-500/15 px-3 py-2 text-left text-[14px] text-cyan-50 ring-1 ring-cyan-300/40">
                <TrendingUp className="h-4 w-4 text-cyan-300" /> Higher bet unlocked: <b>{current.unlockedBets.map(formatShort).join(", ")}</b>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-violet-100/60">
            <Lock className="h-3.5 w-3.5" /> Keep spinning to unlock new machines and bigger bets
          </div>
        )}
        <GButton ref={btnRef} variant="green" className="mt-4 w-full py-3 text-[24px]" onClick={onCollect}>
          <span>COLLECT</span>
        </GButton>
      </div>
    </Modal>
  );
}
