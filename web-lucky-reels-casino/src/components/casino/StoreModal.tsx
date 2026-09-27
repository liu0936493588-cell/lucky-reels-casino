import { useRef, useState } from "react";

import { centerOf, flyCoinsToBalance } from "@/game/collect";
import { useGame } from "@/game/useGame";
import { useTicker } from "@/hooks/useCountUp";
import { formatCoins, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CoinIcon } from "./CoinIcon";
import { Disclaimer } from "./Disclaimer";
import { GButton } from "./GButton";
import { Modal } from "./Modal";

const PACK_STYLE: Record<string, { coins: number; ring: string; tag: string | null }> = {
  pouch: { coins: 3, ring: "from-violet-500/40 to-indigo-800/40", tag: null },
  chest: { coins: 6, ring: "from-fuchsia-500/40 to-violet-800/40", tag: "POPULAR" },
  vault: { coins: 10, ring: "from-amber-400/45 to-orange-800/40", tag: "BEST" },
};

function CoinStack({ n }: { n: number }) {
  return (
    <div className="relative h-14 w-20 shrink-0">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="absolute" style={{ left: (i % 3) * 18 + (Math.floor(i / 3) % 2) * 9, bottom: Math.floor(i / 3) * 9 }}>
          <CoinIcon className="h-9 w-9" />
        </span>
      ))}
    </div>
  );
}

function PackRow({ id, name, amount }: { id: string; name: string; amount: number }) {
  const { player, now, claimPack, releaseWin } = useGame();
  useTicker(1000);
  const [claiming, setClaiming] = useState<boolean>(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const readyAt = player?.storeReadyAt[id] ?? 0;
  const remaining = readyAt - now();
  const ready = remaining <= 0;
  const style = PACK_STYLE[id] ?? PACK_STYLE.pouch;

  const onClaim = async () => {
    if (!ready || claiming) return;
    setClaiming(true);
    const got = await claimPack(id);
    setClaiming(false);
    if (got !== null) flyCoinsToBalance(centerOf(btnRef.current), got, (a) => releaseWin(a));
  };

  return (
    <div className={cn("relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br p-3 ring-1 ring-white/15", style.ring)}>
      {style.tag ? <span className="absolute right-0 top-0 rounded-bl-xl bg-gradient-to-b from-pink-400 to-pink-700 px-2 py-0.5 font-display text-[11px] text-white">{style.tag}</span> : null}
      <CoinStack n={style.coins} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-violet-100/80">{name}</div>
        <div className="font-display text-gold-flat text-[24px] leading-tight">{formatCoins(amount)}</div>
      </div>
      <GButton ref={btnRef} variant={ready ? "green" : "dark"} disabled={!ready || claiming} onClick={onClaim} className="min-w-[98px] px-3 py-2.5 text-[16px]">
        <span className="tabular">{ready ? "FREE" : formatDuration(remaining)}</span>
      </GButton>
    </div>
  );
}

/** Demo store: every pack is free with a cooldown. No real payments. */
export function StoreModal() {
  const { modal, setModal, config } = useGame();
  return (
    <Modal open={modal === "store"} onClose={() => setModal(null)} title="COIN STORE">
      <div className="flex flex-col gap-3">
        <p className="rounded-xl bg-cyan-400/10 px-3 py-2 text-center text-[12px] text-cyan-100 ring-1 ring-cyan-300/30">
          Demo store: all packs are free to claim. Nothing is for sale and no payment is ever taken.
        </p>
        {config?.store.map((p) => <PackRow key={p.id} id={p.id} name={p.name} amount={p.amount} />)}
        <Disclaimer />
      </div>
    </Modal>
  );
}
