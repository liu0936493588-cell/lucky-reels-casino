import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { audio, vibrate } from "@/game/audio";
import { centerOf, flyCoinsToBalance } from "@/game/collect";
import { fx } from "@/game/fx";
import { useGame } from "@/game/useGame";
import { useTicker } from "@/hooks/useCountUp";
import { formatCoins, formatDuration, formatShort } from "@/lib/format";

import { CoinIcon } from "./CoinIcon";
import { GButton } from "./GButton";
import { Modal } from "./Modal";

const SEG_COLORS = [
  ["#ff5ab4", "#b3005f"],
  ["#ffe066", "#d98a00"],
  ["#8b5cff", "#3d14a8"],
  ["#4ff0ff", "#0087b0"],
];

function segPath(i: number, n: number, r: number): string {
  const a0 = (i / n) * Math.PI * 2;
  const a1 = ((i + 1) / n) * Math.PI * 2;
  const x0 = Math.sin(a0) * r;
  const y0 = -Math.cos(a0) * r;
  const x1 = Math.sin(a1) * r;
  const y1 = -Math.cos(a1) * r;
  return `M0 0 L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}

/** Daily bonus wheel with ticking pegs and a prize reveal. The server picks the prize. */
export function WheelModal() {
  const { modal, setModal, config, player, now, spinWheel, releaseWin } = useGame();
  useTicker(1000);
  const open = modal === "wheel";
  const [spinning, setSpinning] = useState<boolean>(false);
  const [prize, setPrize] = useState<number | null>(null);
  const [collected, setCollected] = useState<boolean>(true);
  const wheelRef = useRef<SVGGElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const prizeRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const segments = useMemo(() => config?.wheel ?? [], [config]);
  const n = segments.length || 12;
  const mult = player?.wheelMultiplier ?? 1;
  const remaining = player ? player.nextWheelAt - now() : 1;
  const ready = remaining <= 0;

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const collect = useCallback(() => {
    if (prize === null || collected) return;
    setCollected(true);
    flyCoinsToBalance(centerOf(prizeRef.current), prize, (a) => releaseWin(a));
  }, [prize, collected, releaseWin]);

  const close = useCallback(() => {
    if (spinning) return;
    collect();
    setPrize(null);
    setModal(null);
  }, [spinning, collect, setModal]);

  const onSpin = async () => {
    if (spinning || !ready) return;
    setSpinning(true);
    setPrize(null);
    const res = await spinWheel();
    if (!res) {
      setSpinning(false);
      return;
    }
    setCollected(false);
    const segAngle = 360 / n;
    const start = angleRef.current;
    const targetMod = 360 - (res.index * segAngle + segAngle / 2) + (Math.random() - 0.5) * segAngle * 0.6;
    const base = start - (start % 360);
    const target = base + 360 * 7 + targetMod;
    const dur = 5600;
    const t0 = performance.now();
    let lastSeg = Math.floor(start / segAngle);
    const frame = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 4);
      const a = start + (target - start) * eased;
      angleRef.current = a;
      if (wheelRef.current) wheelRef.current.setAttribute("transform", `rotate(${a})`);
      const seg = Math.floor((a + segAngle / 2) / segAngle);
      if (seg !== lastSeg) {
        lastSeg = seg;
        audio.play("wheelTick", { volume: 0.7, rate: 0.9 + Math.random() * 0.2 });
        const f = flapRef.current;
        if (f) {
          f.classList.remove("flapper-hit");
          void f.offsetWidth;
          f.classList.add("flapper-hit");
        }
      }
      if (k < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setSpinning(false);
        setPrize(res.amount);
        audio.play("bigWin", { volume: 0.75 });
        audio.duck(0.3, 2500);
        vibrate([30, 50, 30]);
        const c = centerOf(prizeRef.current);
        fx.burst(c.x, c.y, 70);
        fx.fountain(c.x, c.y, 26, 0.8);
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  return (
    <Modal open={open} onClose={close} title="DAILY WHEEL" hideClose={spinning}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative aspect-square w-full max-w-[340px]">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,200,60,0.35),transparent_65%)] blur-md" />
          <svg viewBox="-110 -110 220 220" className="relative h-full w-full drop-shadow-[0_8px_18px_rgba(0,0,0,0.6)]">
            <defs>
              <linearGradient id="rim" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fff4b0" />
                <stop offset="0.4" stopColor="#e8a712" />
                <stop offset="0.6" stopColor="#8a5200" />
                <stop offset="1" stopColor="#ffd35c" />
              </linearGradient>
              {SEG_COLORS.map(([a, b], i) => (
                <radialGradient key={i} id={`seg${i}`} cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
                  <stop offset="0.2" stopColor={b} />
                  <stop offset="1" stopColor={a} />
                </radialGradient>
              ))}
            </defs>
            <circle r="108" fill="url(#rim)" />
            <circle r="100" fill="#1a0840" />
            <g ref={wheelRef} transform={`rotate(${angleRef.current})`}>
              {segments.map((amt, i) => {
                const mid = ((i + 0.5) / n) * 360;
                return (
                  <g key={i}>
                    <path d={segPath(i, n, 98)} fill={`url(#seg${i % 4})`} stroke="#fff3b0" strokeWidth="1.2" />
                    <g transform={`rotate(${mid}) translate(0 -66) rotate(90)`}>
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontFamily="Lilita One, sans-serif"
                        fontSize={amt * mult >= 1_000_000 ? 13 : 12}
                        fill="#fff"
                        stroke="#3a0a4a"
                        strokeWidth="2.5"
                        paintOrder="stroke"
                      >
                        {formatShort(amt * mult)}
                      </text>
                    </g>
                  </g>
                );
              })}
              {segments.map((_, i) => {
                const a = (i / n) * Math.PI * 2;
                return <circle key={`p${i}`} cx={Math.sin(a) * 101} cy={-Math.cos(a) * 101} r="3" fill="#fff8d0" stroke="#8a5200" strokeWidth="1" />;
              })}
            </g>
            <circle r="20" fill="url(#rim)" stroke="#5a2e00" strokeWidth="2" />
            <circle r="12" fill="#ff2e9a" stroke="#fff" strokeWidth="2" />
          </svg>
          <div ref={flapRef} className="absolute left-1/2 top-[-6px] origin-top" style={{ transform: "translateX(-50%)" }}>
            <svg viewBox="0 0 30 40" className="h-10 w-8 drop-shadow-[0_3px_3px_rgba(0,0,0,0.6)]">
              <path d="M15 38 L3 8 Q15 -2 27 8 Z" fill="url(#rim)" stroke="#5a2e00" strokeWidth="2" />
              <circle cx="15" cy="10" r="4" fill="#ff2e9a" />
            </svg>
          </div>
        </div>

        {prize !== null ? (
          <div ref={prizeRef} className="flex flex-col items-center pop-in">
            <span className="font-display text-[14px] tracking-[0.3em] text-amber-100/80">YOU WON</span>
            <span className="flex items-center gap-2">
              <CoinIcon className="h-8 w-8" />
              <span className="font-display text-gold text-[40px] leading-none">{formatCoins(prize)}</span>
            </span>
            <GButton variant="green" className="mt-3 px-10 py-3 text-[22px]" onClick={close}>
              <span>COLLECT</span>
            </GButton>
          </div>
        ) : ready || spinning ? (
          <div ref={prizeRef} className="flex flex-col items-center">
            <GButton variant="gold" className="px-12 py-3 text-[26px]" disabled={spinning} onClick={() => void onSpin()}>
              <span>{spinning ? "GOOD LUCK!" : "SPIN"}</span>
            </GButton>
            {mult > 1 ? <span className="mt-2 text-[12px] text-cyan-100/80">Level bonus: prizes ×{mult.toFixed(1)}</span> : null}
          </div>
        ) : (
          <div ref={prizeRef} className="flex flex-col items-center gap-1">
            <span className="text-[13px] text-violet-100/70">Next free spin in</span>
            <span className="font-display tabular text-gold text-[34px]">{formatDuration(remaining)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
