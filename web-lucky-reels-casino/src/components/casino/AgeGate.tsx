import { useState } from "react";

import { useGame } from "@/game/useGame";

import { Disclaimer } from "./Disclaimer";
import { GButton } from "./GButton";

/** First-launch 18+ confirmation. Nothing plays until the player confirms. */
export function AgeGate() {
  const { ageConfirmed, confirmAge } = useGame();
  const [declined, setDeclined] = useState<boolean>(false);
  if (ageConfirmed) return null;

  return (
    <div className="casino-bg fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4">
      <div className="stars-bg pointer-events-none absolute inset-0" />
      <div className="light-rays opacity-60" />
      <div className="panel-gold relative w-full max-w-md rounded-[30px] px-6 pb-6 pt-7 text-center pop-in">
        <div className="font-display text-gold text-[46px] leading-none">
          LUCKY REELS
          <div className="mt-1 text-[18px] tracking-[0.5em]">CASINO</div>
        </div>
        <div className="mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-fuchsia-500 to-violet-800 ring-4 ring-amber-300/80 shadow-[0_0_30px_rgba(255,46,154,0.6)]">
          <span className="font-display text-[34px] text-white text-outline">18+</span>
        </div>
        {declined ? (
          <>
            <h1 className="mt-5 font-display text-[26px] text-white">Sorry!</h1>
            <p className="mt-2 text-[14px] text-violet-100/80">Lucky Reels Casino is only for adults aged 18 and over.</p>
            <GButton variant="dark" className="mt-5 w-full py-3 text-[18px]" onClick={() => setDeclined(false)}>
              <span>GO BACK</span>
            </GButton>
          </>
        ) : (
          <>
            <h1 className="mt-5 font-display text-[26px] text-white">Are you 18 or older?</h1>
            <p className="mt-2 text-[14px] text-violet-100/80">You must be at least 18 to play this social casino game.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <GButton variant="dark" className="py-3 text-[18px]" onClick={() => setDeclined(true)}>
                <span>NO</span>
              </GButton>
              <GButton variant="green" className="py-3 text-[18px]" onClick={confirmAge}>
                <span>YES, I'M 18+</span>
              </GButton>
            </div>
          </>
        )}
        <Disclaimer className="mt-5 text-left" />
      </div>
    </div>
  );
}
