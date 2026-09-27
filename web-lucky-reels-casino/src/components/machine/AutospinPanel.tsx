import { useState } from "react";

import { GButton } from "@/components/casino/GButton";
import { Modal } from "@/components/casino/Modal";
import { formatShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AutoConfig {
  remaining: number;
  total: number;
  stopOnBig: boolean;
  stopOnFeature: boolean;
  stopBelow: number;
}

interface AutospinPanelProps {
  open: boolean;
  onClose: () => void;
  onStart: (cfg: AutoConfig) => void;
  balance: number;
}

const COUNTS = [10, 25, 50, 100];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-black/30 px-4 py-3 text-left ring-1 ring-white/10"
    >
      <span className="text-[15px] text-violet-50">{label}</span>
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-gradient-to-b from-lime-300 to-green-600" : "bg-black/60 ring-1 ring-white/20")}>
        <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-gradient-to-b from-white to-slate-300 shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

/** Autospin setup: spin count plus stop conditions. */
export function AutospinPanel({ open, onClose, onStart, balance }: AutospinPanelProps) {
  const [count, setCount] = useState<number>(25);
  const [stopOnBig, setStopOnBig] = useState<boolean>(true);
  const [stopOnFeature, setStopOnFeature] = useState<boolean>(true);
  const [useFloor, setUseFloor] = useState<boolean>(false);
  const [floorPct, setFloorPct] = useState<number>(50);
  const floor = Math.round((balance * floorPct) / 100);

  return (
    <Modal open={open} onClose={onClose} title="AUTOSPIN">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          {COUNTS.map((c) => (
            <GButton key={c} variant={c === count ? "gold" : "purple"} onClick={() => setCount(c)} className="py-3 text-[22px]">
              <span>{c}</span>
            </GButton>
          ))}
        </div>
        <Toggle on={stopOnBig} onChange={setStopOnBig} label="Stop on Big Win or higher" />
        <Toggle on={stopOnFeature} onChange={setStopOnFeature} label="Stop when Free Spins trigger" />
        <Toggle on={useFloor} onChange={setUseFloor} label="Stop if balance drops below…" />
        {useFloor ? (
          <div className="rounded-2xl bg-black/30 px-4 py-3 ring-1 ring-white/10">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm text-violet-100/70">{floorPct}% of current balance</span>
              <span className="font-display text-gold-flat text-[20px]">{formatShort(floor)}</span>
            </div>
            <input
              type="range"
              min={10}
              max={95}
              step={5}
              value={floorPct}
              onChange={(e) => setFloorPct(Number(e.target.value))}
              className="w-full accent-amber-400"
              aria-label="Balance floor"
            />
          </div>
        ) : null}
        <GButton
          variant="green"
          className="mt-1 py-3 text-[24px]"
          onClick={() => onStart({ remaining: count, total: count, stopOnBig, stopOnFeature, stopBelow: useFloor ? floor : 0 })}
        >
          <span>START {count} SPINS</span>
        </GButton>
      </div>
    </Modal>
  );
}
