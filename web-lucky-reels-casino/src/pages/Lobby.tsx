import { Flame, Lock, Sparkles, Star } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Disclaimer } from "@/components/casino/Disclaimer";
import { GButton } from "@/components/casino/GButton";
import { JackpotTicker } from "@/components/casino/JackpotTicker";
import { TopBar } from "@/components/casino/TopBar";
import { audio } from "@/game/audio";
import { MACHINE_THEMES } from "@/game/machines";
import type { MachineListing } from "@/game/types";
import { useGame } from "@/game/useGame";
import { useTicker } from "@/hooks/useCountUp";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const MachineTile = memo(function MachineTile({ listing, level, index }: { listing: MachineListing; level: number; index: number }) {
  const navigate = useNavigate();
  const theme = MACHINE_THEMES[listing.id];
  const locked = listing.unlockLevel > level;
  const comingSoon = !listing.playable && !locked;

  const onClick = () => {
    audio.play("click", { volume: 0.7 });
    if (locked) {
      toast(`${listing.name} unlocks at level ${listing.unlockLevel}`, { description: "Spin any machine to earn XP and level up." });
      return;
    }
    if (!listing.playable) {
      toast(`${listing.name} is coming soon`, { description: "This machine is being polished. Check back shortly!" });
      return;
    }
    navigate(`/play/${listing.id}`);
  };

  return (
    <button
      type="button"
      data-tut={`tile-${listing.id}`}
      onClick={onClick}
      className="btn3d group relative aspect-[2/3] w-full overflow-hidden rounded-[22px] text-left pop-in"
      style={{
        animationDelay: `${index * 70}ms`,
        boxShadow: locked ? "0 6px 0 #0a0420, 0 10px 24px rgba(0,0,0,0.6)" : `0 6px 0 #2a0d00, 0 10px 28px rgba(0,0,0,0.6), 0 0 26px ${theme?.glow ?? "rgba(255,190,40,0.5)"}`,
      }}
      aria-label={`${listing.name}${locked ? `, unlocks at level ${listing.unlockLevel}` : comingSoon ? ", coming soon" : ""}`}
    >
      <div className="absolute inset-0 rounded-[22px] p-[3px]" style={{ background: "var(--gold-border)" }}>
        <div className="relative h-full w-full overflow-hidden rounded-[19px] bg-[#12072e]">
          {theme ? (
            <img
              src={theme.tile}
              alt=""
              className={cn("kenburns absolute inset-0 h-full w-full object-cover", locked && "grayscale-[0.7] brightness-50")}
              style={{ animationDelay: `${-index * 3.1}s` }}
              loading={index < 2 ? "eager" : "lazy"}
              decoding="async"
            />
          ) : null}
          {!locked ? <div className="shimmer absolute inset-0" style={{ animationDelay: `${index * 0.6}s` }} /> : null}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#07031a] via-[#07031a]/75 to-transparent" />

          {listing.badge && !locked ? (
            <div
              className={cn(
                "absolute left-2 top-2 flex items-center gap-1 rounded-full px-2.5 py-1 font-display text-[13px] shadow-lg sm:text-[15px]",
                listing.badge === "hot" ? "bg-gradient-to-b from-orange-300 via-red-500 to-red-700 text-white" : "bg-gradient-to-b from-cyan-200 via-sky-400 to-blue-600 text-white",
              )}
            >
              {listing.badge === "hot" ? <Flame className="h-3.5 w-3.5 fill-current" /> : <Sparkles className="h-3.5 w-3.5" />}
              {listing.badge.toUpperCase()}
            </div>
          ) : null}

          {locked ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 ring-2 ring-amber-300/70 shadow-[0_0_20px_rgba(0,0,0,0.8)]">
                <Lock className="h-8 w-8 text-amber-200" strokeWidth={2.6} />
              </div>
              <div className="rounded-full bg-black/70 px-3 py-1 font-display text-[14px] text-amber-100 ring-1 ring-amber-300/50">
                <Star className="mr-1 inline h-3.5 w-3.5 -translate-y-px fill-current text-cyan-300" />
                LEVEL {listing.unlockLevel}
              </div>
            </div>
          ) : null}

          {comingSoon ? (
            <div className="absolute right-[-38px] top-4 rotate-45 bg-gradient-to-b from-fuchsia-400 to-fuchsia-700 px-10 py-1 font-display text-[11px] tracking-wider text-white shadow-lg">
              COMING SOON
            </div>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className={cn("text-gold text-[19px] leading-[1.05] sm:text-[24px]", theme?.titleClass ?? "font-display")}>{listing.name}</div>
            <div className="mt-0.5 text-[11px] text-violet-100/75 sm:text-[12px]">{theme?.tagline}</div>
            {listing.playable && !locked ? (
              <div className="mt-2 inline-flex rounded-full bg-gradient-to-b from-lime-300 via-green-500 to-green-700 px-4 py-1 font-display text-[14px] text-white shadow-[0_3px_0_#0a5a22]">PLAY</div>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
});

function WheelBanner() {
  const { player, now, setModal } = useGame();
  useTicker(1000);
  if (!player) return null;
  const remaining = player.nextWheelAt - now();
  const ready = remaining <= 0;
  return (
    <div className="mx-auto w-full max-w-[760px] px-3">
      <button
        type="button"
        onClick={() => {
          audio.play("click", { volume: 0.7 });
          setModal("wheel");
        }}
        className={cn("btn3d relative flex w-full items-center gap-3 overflow-hidden rounded-[20px] px-3 py-2.5 text-left panel-gold", ready && "glow-pulse")}
      >
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 60 60" className={cn("h-full w-full", ready && "spin-slow")}>
            {Array.from({ length: 8 }).map((_, i) => {
              const a0 = (i * Math.PI) / 4;
              const a1 = ((i + 1) * Math.PI) / 4;
              const colors = ["#ff2e9a", "#ffd23d", "#6a3cf0", "#3be6ff"];
              return (
                <path key={i} d={`M30 30 L${30 + 28 * Math.sin(a0)} ${30 - 28 * Math.cos(a0)} A28 28 0 0 1 ${30 + 28 * Math.sin(a1)} ${30 - 28 * Math.cos(a1)} Z`} fill={colors[i % 4]} stroke="#fff3b0" strokeWidth="1" />
              );
            })}
            <circle cx="30" cy="30" r="7" fill="#ffd23d" stroke="#8a4b00" strokeWidth="2" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-gold text-[22px] leading-none sm:text-[26px]">DAILY WHEEL</div>
          <div className="mt-1 text-[12px] text-violet-100/75 sm:text-[13px]">{ready ? "Your free spin is ready. Win up to 5M+ coins!" : "Come back for another free spin"}</div>
        </div>
        <div className={cn("font-display shrink-0 rounded-full px-4 py-2 text-[16px]", ready ? "btn-green" : "pill-dark text-amber-100 tabular")}>{ready ? "SPIN!" : formatDuration(remaining)}</div>
      </button>
    </div>
  );
}

/** Casino lobby: jackpot, daily wheel and the machine grid. */
export default function Lobby() {
  const { config, player, setLobbyMusic, setModal, now, tutorial, modal } = useGame();
  const autoWheelRef = useRef<boolean>(false);

  useEffect(() => {
    setLobbyMusic();
  }, [setLobbyMusic]);

  // Offer the daily wheel once per session when it's ready.
  useEffect(() => {
    if (!player || autoWheelRef.current || tutorial || modal || !player.tutorialDone) return;
    if (player.nextWheelAt <= now()) {
      autoWheelRef.current = true;
      const id = setTimeout(() => setModal("wheel"), 900);
      return () => clearTimeout(id);
    }
  }, [player, tutorial, modal, now, setModal]);

  if (!config || !player) return null;

  return (
    <div className="casino-bg fixed inset-0 flex flex-col overflow-hidden">
      <div className="stars-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="sparkle-dot" style={{ left: `${(i * 37) % 100}%`, top: `${40 + ((i * 53) % 60)}%`, animationDelay: `${(i * 0.43) % 3}s` }} />
        ))}
      </div>
      <TopBar />
      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 pb-4 pt-1 sm:gap-4 sm:pt-2">
          <JackpotTicker />
          <WheelBanner />
          <section className="px-3 sm:px-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="font-display text-gold text-[22px] sm:text-[26px]">SLOTS</h2>
              <span className="text-[12px] text-violet-100/60">Level up to unlock more machines</span>
            </div>
            <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {config.machines.map((m, i) => (
                <MachineTile key={m.id} listing={m} level={player.level} index={i} />
              ))}
            </div>
          </section>
          <footer className="mx-auto w-full max-w-[900px] px-3 pb-safe">
            <Disclaimer />
            <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-violet-200/40">
              <span>© {new Date().getFullYear()} Lucky Reels Casino</span>
              <span>·</span>
              <GButton variant="dark" className="rounded-full px-3 py-1 text-[11px]" onClick={() => setModal("settings")}>
                <span>Settings</span>
              </GButton>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
