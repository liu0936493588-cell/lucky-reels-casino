import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CoinIcon } from "@/components/casino/CoinIcon";
import { GButton } from "@/components/casino/GButton";
import { audio, vibrate } from "@/game/audio";
import { fx } from "@/game/fx";
import type { WinTier } from "@/game/types";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Overlay =
  | { kind: "win"; tier: Exclude<WinTier, "none">; amount: number; bet: number; tiers: { big: number; mega: number; epic: number } }
  | { kind: "fsIntro"; count: number; multiplier: number }
  | { kind: "fsRetrigger"; count: number }
  | { kind: "fsSummary"; totalWin: number; spins: number; multiplier: number };

const TIER_ORDER: Exclude<WinTier, "none">[] = ["big", "mega", "epic"];

const TIER_STYLE: Record<Exclude<WinTier, "none">, { label: string; cls: string; ms: number; shower: number; rays: string }> = {
  big: { label: "BIG WIN", cls: "text-gold", ms: 3600, shower: 28, rays: "rgba(255,210,90,0.18)" },
  mega: { label: "MEGA WIN", cls: "tier-mega", ms: 5400, shower: 48, rays: "rgba(255,46,154,0.2)" },
  epic: { label: "EPIC WIN", cls: "tier-epic", ms: 7200, shower: 75, rays: "rgba(34,228,255,0.2)" },
};

interface OverlayProps {
  overlay: Overlay;
  onDone: () => void;
  auto: boolean;
  turbo: boolean;
  shake: (size: "sm" | "lg") => void;
  /** Machine's themed title font class. */
  titleClass?: string;
}

/** Full-screen Big / Mega / Epic win: the counter rolls up and the tier escalates as it crosses each threshold. */
function WinCelebration({ overlay, onDone, auto, turbo, shake }: OverlayProps & { overlay: Extract<Overlay, { kind: "win" }> }) {
  const { amount, bet, tier, tiers } = overlay;
  const finalIdx = TIER_ORDER.indexOf(tier);
  const totalMs = TIER_STYLE[tier].ms * (turbo ? 0.6 : 1);
  const [value, setValue] = useState<number>(0);
  const [shownTier, setShownTier] = useState<number>(0);
  const [finished, setFinished] = useState<boolean>(false);
  const rafRef = useRef<number>(0);
  const skipRef = useRef<boolean>(false);
  const doneRef = useRef<boolean>(false);
  const tierRef = useRef<number>(0);

  const escalate = useCallback(
    (idx: number) => {
      tierRef.current = idx;
      setShownTier(idx);
      const t = TIER_ORDER[idx];
      fx.shower(totalMs + 2500, TIER_STYLE[t].shower);
      fx.burst(window.innerWidth / 2, window.innerHeight * 0.4, 40 + idx * 25);
      shake(idx >= 1 ? "lg" : "sm");
      vibrate(idx >= 1 ? [30, 40, 60] : 25);
      if (idx > 0) audio.play("bigWin", { volume: 0.55, rate: 1 + idx * 0.06 });
    },
    [shake, totalMs],
  );

  useEffect(() => {
    audio.play("bigWin", { volume: 0.95 });
    audio.duck(0.2, totalMs + 1500);
    escalate(0);
    const thresholds = [tiers.big * bet, tiers.mega * bet, tiers.epic * bet];
    const start = performance.now();
    let lastCoin = 0;
    const tick = (now: number) => {
      const t = skipRef.current ? 1 : Math.min(1, (now - start) / totalMs);
      const eased = t < 1 ? 1 - Math.pow(1 - t, 2.2) : 1;
      const v = Math.round(amount * eased);
      setValue(v);
      if (now - lastCoin > 110 && t < 1) {
        lastCoin = now;
        audio.play("coin", { volume: 0.25, rate: 0.9 + t * 0.5 });
      }
      for (let i = tierRef.current + 1; i <= finalIdx; i++) {
        if (v >= thresholds[i]) escalate(i);
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setFinished(true);
        fx.burst(window.innerWidth / 2, window.innerHeight * 0.52, 60);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      fx.stopShower();
    };
  }, [amount, bet, tiers, totalMs, finalIdx, escalate]);

  const close = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    fx.stopShower();
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(close, auto ? 1400 : 3200);
    return () => clearTimeout(id);
  }, [finished, auto, close]);

  const onTap = () => {
    if (!finished) {
      skipRef.current = true;
      return;
    }
    close();
  };

  const style = TIER_STYLE[TIER_ORDER[shownTier]];
  return (
    <div className="fixed inset-0 z-[70] flex cursor-pointer flex-col items-center justify-center overflow-hidden fade-in" onClick={onTap} role="button" aria-label="Skip celebration">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,10,80,0.55)_0%,rgba(4,1,14,0.88)_70%)]" />
      <div className="light-rays" style={{ background: `repeating-conic-gradient(from 0deg, ${style.rays} 0deg 8deg, transparent 8deg 22deg)` }} />
      <div key={shownTier} className="relative slam-in text-center">
        <div className={cn("font-display leading-[0.9] tracking-wide text-[64px] sm:text-[110px] lg:text-[140px]", style.cls)}>
          {style.label.split(" ").map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      </div>
      <div className="relative mt-4 flex items-center gap-3 rounded-full px-6 py-2 pill-dark sm:mt-6 sm:px-10 sm:py-3">
        <CoinIcon className="h-10 w-10 sm:h-14 sm:w-14" />
        <span className="font-display tabular text-gold text-[40px] sm:text-[68px]">{formatCoins(value)}</span>
      </div>
      <div className="relative mt-6 font-display text-[15px] tracking-[0.3em] text-amber-100/80 heartbeat">{finished ? "TAP TO COLLECT" : "TAP TO SKIP"}</div>
    </div>
  );
}

function FreeSpinsIntro({ overlay, onDone, auto, titleClass = "font-display" }: OverlayProps & { overlay: Extract<Overlay, { kind: "fsIntro" }> }) {
  const doneRef = useRef<boolean>(false);
  const close = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);
  useEffect(() => {
    audio.play("scatter", { volume: 1 });
    audio.play("bigWin", { volume: 0.6 });
    audio.duck(0.25, 2500);
    fx.burst(window.innerWidth / 2, window.innerHeight / 2, 90, "rgba(60,230,255,0.9)");
    fx.shower(1800, 30);
    vibrate([40, 60, 40]);
    const id = setTimeout(close, auto ? 2600 : 6000);
    return () => clearTimeout(id);
  }, [auto, close]);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden fade-in" onClick={close}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,60,110,0.6)_0%,rgba(4,1,20,0.92)_70%)]" />
      <div className="light-rays" style={{ background: "repeating-conic-gradient(from 0deg, rgba(60,230,255,0.16) 0deg 8deg, transparent 8deg 22deg)" }} />
      <div className="relative slam-in text-center">
        <div className={cn(titleClass, "neon-cyan text-[26px] tracking-[0.2em] sm:text-[36px]")}>YOU WON</div>
        <div className="font-display text-gold text-[120px] leading-none sm:text-[180px]">{overlay.count}</div>
        <div className="font-display tier-mega text-[48px] leading-none sm:text-[80px]">FREE SPINS</div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2 pill-dark">
          <span className="font-display text-gold-flat text-[22px] sm:text-[28px]">ALL WINS ×{overlay.multiplier}</span>
        </div>
      </div>
      <GButton variant="green" className="relative mt-8 px-10 py-3 text-[24px] pop-in" onClick={close}>
        <span>START</span>
      </GButton>
    </div>
  );
}

function FreeSpinsRetrigger({ overlay, onDone }: OverlayProps & { overlay: Extract<Overlay, { kind: "fsRetrigger" }> }) {
  useEffect(() => {
    audio.play("scatter", { volume: 1 });
    audio.play("smallWin", { volume: 0.8 });
    fx.burst(window.innerWidth / 2, window.innerHeight / 2, 60, "rgba(60,230,255,0.9)");
    const id = setTimeout(onDone, 1900);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
      <div className="slam-in rounded-[28px] px-8 py-5 text-center panel-gold">
        <div className="font-display text-gold text-[64px] leading-none sm:text-[90px]">+{overlay.count}</div>
        <div className="font-display tier-mega text-[30px] sm:text-[40px]">FREE SPINS</div>
      </div>
    </div>
  );
}

function FreeSpinsSummary({ overlay, onDone, auto, titleClass = "font-display" }: OverlayProps & { overlay: Extract<Overlay, { kind: "fsSummary" }> }) {
  const [value, setValue] = useState<number>(0);
  const [finished, setFinished] = useState<boolean>(false);
  const skipRef = useRef<boolean>(false);
  const doneRef = useRef<boolean>(false);

  useEffect(() => {
    const dur = overlay.totalWin > 0 ? 2600 : 400;
    audio.play(overlay.totalWin > 0 ? "bigWin" : "smallWin", { volume: 0.85 });
    audio.duck(0.25, dur + 1200);
    if (overlay.totalWin > 0) fx.shower(dur + 1500, 40);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = skipRef.current ? 1 : Math.min(1, (now - start) / dur);
      setValue(Math.round(overlay.totalWin * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setFinished(true);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fx.stopShower();
    };
  }, [overlay.totalWin]);

  const close = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (!finished || !auto) return;
    const id = setTimeout(close, 2200);
    return () => clearTimeout(id);
  }, [finished, auto, close]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden px-4 fade-in"
      onClick={() => {
        if (!finished) skipRef.current = true;
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,10,80,0.6)_0%,rgba(4,1,14,0.9)_70%)]" />
      <div className="light-rays" />
      <div className="panel-gold relative w-full max-w-md rounded-[30px] px-6 pb-6 pt-5 text-center pop-in">
        <div className={cn(titleClass, "text-gold text-[22px] sm:text-[26px]")}>FREE SPINS COMPLETE</div>
        <div className="mt-1 text-sm text-violet-100/70">
          {overlay.spins} free spins played · all wins ×{overlay.multiplier}
        </div>
        <div className="mt-4 font-display text-[18px] tracking-[0.3em] text-amber-100/80">TOTAL WIN</div>
        <div className="mt-1 flex items-center justify-center gap-2">
          <CoinIcon className="h-10 w-10" />
          <span className="font-display tabular text-gold text-[44px] sm:text-[54px]">{formatCoins(value)}</span>
        </div>
        <GButton variant="green" className="mt-5 w-full py-3 text-[24px]" disabled={!finished} onClick={close}>
          <span>COLLECT</span>
        </GButton>
      </div>
    </div>
  );
}

/** Renders whichever celebration overlay is active. */
export function CelebrationLayer(props: OverlayProps) {
  const { overlay } = props;
  let node: ReactElement;
  switch (overlay.kind) {
    case "win":
      node = <WinCelebration {...props} overlay={overlay} />;
      break;
    case "fsIntro":
      node = <FreeSpinsIntro {...props} overlay={overlay} />;
      break;
    case "fsRetrigger":
      node = <FreeSpinsRetrigger {...props} overlay={overlay} />;
      break;
    case "fsSummary":
      node = <FreeSpinsSummary {...props} overlay={overlay} />;
      break;
  }
  return createPortal(node, document.body);
}
