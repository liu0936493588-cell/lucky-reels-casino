import { Gift, ShoppingBag } from "lucide-react";
import { useRef, useState } from "react";

import { centerOf, flyCoinsToBalance } from "@/game/collect";
import { useGame } from "@/game/useGame";
import { useTicker } from "@/hooks/useCountUp";
import { formatDuration, formatShort } from "@/lib/format";

import { CoinIcon } from "./CoinIcon";
import { GButton } from "./GButton";
import { Modal } from "./Modal";

/** Shown when a spin can't be afforded: free bonus timer, wheel, or the (free) store. */
export function OutOfCoinsModal() {
  const { modal, setModal, player, now, collectBonus, releaseWin } = useGame();
  useTicker(1000);
  const [claiming, setClaiming] = useState<boolean>(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  if (!player) return null;
  const bonusLeft = player.nextBonusAt - now();
  const wheelReady = player.nextWheelAt - now() <= 0;

  const onBonus = async () => {
    if (bonusLeft > 0 || claiming) return;
    setClaiming(true);
    const amt = await collectBonus();
    setClaiming(false);
    if (amt !== null) {
      flyCoinsToBalance(centerOf(btnRef.current), amt, (a) => releaseWin(a));
      setModal(null);
    }
  };

  return (
    <Modal open={modal === "outOfCoins"} onClose={() => setModal(null)} title="OUT OF COINS">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative my-1 flex h-20 w-24 items-end justify-center">
          <CoinIcon className="absolute bottom-0 left-2 h-12 w-12 -rotate-12 opacity-50 grayscale" />
          <CoinIcon className="absolute bottom-2 right-2 h-12 w-12 rotate-12 opacity-50 grayscale" />
          <CoinIcon className="relative h-14 w-14 float-y" />
        </div>
        <p className="text-[14px] text-violet-100/80">You don't have enough coins for this bet. Lower your bet, or grab some free coins:</p>
        <GButton ref={btnRef} variant={bonusLeft <= 0 ? "green" : "dark"} disabled={bonusLeft > 0 || claiming} onClick={() => void onBonus()} className="flex w-full items-center justify-center gap-2 py-3 text-[18px]">
          <Gift className="h-5 w-5" />
          <span className="tabular">{bonusLeft <= 0 ? `COLLECT ${formatShort(player.bonusAmount)} FREE` : `FREE BONUS IN ${formatDuration(bonusLeft)}`}</span>
        </GButton>
        {wheelReady ? (
          <GButton variant="gold" onClick={() => setModal("wheel")} className="w-full py-3 text-[18px]">
            <span>SPIN THE DAILY WHEEL</span>
          </GButton>
        ) : null}
        <GButton variant="pink" onClick={() => setModal("store")} className="flex w-full items-center justify-center gap-2 py-3 text-[18px]">
          <ShoppingBag className="h-5 w-5" /> <span>FREE COIN STORE</span>
        </GButton>
      </div>
    </Modal>
  );
}
