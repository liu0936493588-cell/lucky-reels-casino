import { Hand } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

import { useGame } from "@/game/useGame";

import { GButton } from "./GButton";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TARGETS: Record<string, string> = {
  lobby: "tile-egyptian-treasure",
  spin: "spin",
  bonus: "bonus",
};

const COPY: Record<string, { title: string; body: string }> = {
  lobby: { title: "Welcome to Lucky Reels!", body: "You start with 2,000,000 free coins. Tap Egyptian Treasure to play." },
  spin: { title: "Tap SPIN", body: "Press the spin button (or the spacebar). Tap again while spinning to stop the reels instantly." },
  bonus: { title: "Free coins every 3 hours", body: "Your free bonus is ready. Tap it to collect!" },
};

/** Guided first-session intro with a spotlight on the relevant control. Always skippable. */
export function TutorialOverlay() {
  const { tutorial, setTutorial, finishTutorial, player, now, ageConfirmed, modal } = useGame();
  const location = useLocation();
  const [rect, setRect] = useState<Rect | null>(null);
  const targetId = tutorial ? TARGETS[tutorial] : undefined;

  useEffect(() => {
    if (!targetId) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(`[data-tut="${targetId}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect((prev) => (prev && Math.abs(prev.x - r.left) < 1 && Math.abs(prev.y - r.top) < 1 && Math.abs(prev.w - r.width) < 1 ? prev : { x: r.left, y: r.top, w: r.width, h: r.height }));
    };
    measure();
    const id = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [targetId, location.pathname]);

  // If the lobby step is active but we're already on the machine, move on.
  useEffect(() => {
    if (tutorial === "lobby" && location.pathname.startsWith("/play/")) setTutorial("spin");
    if ((tutorial === "spin" || tutorial === "bonus") && location.pathname === "/") setTutorial("lobby");
  }, [tutorial, location.pathname, setTutorial]);

  if (!tutorial || tutorial === "spinning" || !ageConfirmed || !player || modal) return null;

  const bonusReady = player.nextBonusAt - now() <= 0;

  if (tutorial === "finish" || (tutorial === "bonus" && !bonusReady)) {
    return createPortal(
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#04010f]/70 p-4 fade-in">
        <div className="panel-gold w-full max-w-sm rounded-[28px] px-6 pb-6 pt-5 text-center pop-in">
          <div className="font-display text-gold text-[34px] leading-none">{tutorial === "finish" ? "You're all set!" : "Free bonus"}</div>
          <p className="mt-3 text-[14px] text-violet-100/85">
            {tutorial === "finish"
              ? "Level up to unlock bigger bets and new machines. Don't forget the Daily Wheel in the lobby. Good luck!"
              : "A free coin bonus unlocks every 3 hours. Watch the timer in the top bar."}
          </p>
          <GButton variant="green" className="mt-5 w-full py-3 text-[22px]" onClick={() => void finishTutorial()}>
            <span>LET'S PLAY!</span>
          </GButton>
        </div>
      </div>,
      document.body,
    );
  }

  const copy = COPY[tutorial];
  if (!copy) return null;
  const pad = 8;
  const spot = rect ? { left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 } : null;
  const below = rect ? rect.y + rect.h / 2 < window.innerHeight / 2 : true;
  const bubbleTop = rect ? (below ? rect.y + rect.h + 24 : undefined) : window.innerHeight / 2;
  const bubbleBottom = rect && !below ? window.innerHeight - rect.y + 24 : undefined;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {spot ? (
        <>
          <div className="spotlight absolute rounded-[26px] transition-all duration-300" style={spot} />
          <Hand
            className="tap-bob absolute h-12 w-12 fill-amber-200 text-amber-700 drop-shadow-[0_4px_6px_rgba(0,0,0,0.7)]"
            style={{ left: spot.left + spot.width * 0.55, top: below ? spot.top + spot.height - 18 : spot.top - 34 }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-[#04010f]/70" />
      )}
      <div
        className="panel-gold absolute left-1/2 w-[min(92vw,380px)] -translate-x-1/2 rounded-[22px] px-5 py-4 text-center pop-in"
        style={{ top: bubbleTop, bottom: bubbleBottom }}
        key={tutorial}
      >
        <div className="font-display text-gold text-[24px] leading-tight">{copy.title}</div>
        <p className="mt-1 text-[14px] text-violet-100/85">{copy.body}</p>
      </div>
      <button
        type="button"
        onClick={() => void finishTutorial()}
        className="pt-safe pointer-events-auto absolute right-3 top-16 rounded-full bg-black/60 px-4 py-1.5 font-display text-[14px] text-amber-100 ring-1 ring-amber-300/60"
      >
        SKIP TUTORIAL
      </button>
    </div>,
    document.body,
  );
}
