import { memo } from "react";

import { Disclaimer } from "@/components/casino/Disclaimer";
import { Modal } from "@/components/casino/Modal";
import type { MachineTheme } from "@/game/machines";
import type { PublicMachine } from "@/game/types";
import { formatShort } from "@/lib/format";

interface PaytableModalProps {
  open: boolean;
  onClose: () => void;
  machine: PublicMachine;
  theme: MachineTheme;
  bet: number;
}

const LINE_COLORS = ["#ffd84a", "#ff2e9a", "#3be6ff", "#7dff6a", "#ff8a1f", "#c98bff", "#fff27a", "#22ffc8", "#ff5a7a"];

const LineDiagram = memo(function LineDiagram({ line, index }: { line: number[]; index: number }) {
  const color = LINE_COLORS[index % LINE_COLORS.length];
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 50 30" className="h-auto w-full rounded-md bg-black/40 ring-1 ring-white/10">
        {Array.from({ length: 15 }).map((_, i) => {
          const r = i % 5;
          const row = Math.floor(i / 5);
          const on = line[r] === row;
          return <rect key={i} x={r * 10 + 1} y={row * 10 + 1} width={8} height={8} rx={1.5} fill={on ? color : "rgba(255,255,255,0.1)"} />;
        })}
        <polyline points={line.map((row, r) => `${r * 10 + 5},${row * 10 + 5}`).join(" ")} fill="none" stroke="#fff" strokeWidth={1} strokeOpacity={0.7} />
      </svg>
      <span className="text-[10px] text-violet-100/60">{index + 1}</span>
    </div>
  );
});

/** Symbol payouts at the current bet, feature rules and the payline map. */
export function PaytableModal({ open, onClose, machine, theme, bet }: PaytableModalProps) {
  const lineBet = bet / machine.paylines.length;
  const paying = machine.symbols.filter((s) => s.kind === "high" || s.kind === "low");
  const wild = machine.symbols.find((s) => s.id === machine.wild);
  const scatter = machine.symbols.find((s) => s.id === machine.scatter);
  const awards = machine.freeSpins.awards;

  return (
    <Modal open={open} onClose={onClose} title="PAYTABLE" className="max-w-3xl" z="z-[60]">
      <div className="flex flex-col gap-4 pb-1">
        <p className="text-center text-[13px] text-violet-100/70">
          Payouts shown for your current bet of <b className="text-amber-200">{formatShort(bet)}</b>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {wild ? (
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-amber-500/25 to-fuchsia-700/20 p-3 ring-1 ring-amber-300/40">
              <img src={theme.symbolArt[wild.id]} alt={wild.name} className="h-20 w-20 shrink-0 object-contain drop-shadow-[0_0_12px_rgba(255,200,60,0.6)]" />
              <div className="min-w-0">
                <div className="font-display text-gold-flat text-[20px]">WILD</div>
                <p className="text-[12px] leading-snug text-violet-50/85">Substitutes for every symbol except the Scatter.</p>
                <PayRow pays={machine.paytable[wild.id]} lineBet={lineBet} />
              </div>
            </div>
          ) : null}
          {scatter ? (
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-cyan-500/25 to-violet-700/20 p-3 ring-1 ring-cyan-300/40">
              <img src={theme.symbolArt[scatter.id]} alt={scatter.name} className="h-20 w-20 shrink-0 object-contain drop-shadow-[0_0_12px_rgba(60,230,255,0.6)]" />
              <div className="min-w-0">
                <div className="font-display neon-cyan text-[20px]">SCATTER</div>
                <p className="text-[12px] leading-snug text-violet-50/85">
                  Pays anywhere. 3 / 4 / 5 award {awards["3"]} / {awards["4"]} / {awards["5"]} FREE SPINS at ×{machine.freeSpins.multiplier}.
                </p>
                <div className="mt-1 flex gap-3 text-[12px]">
                  {[5, 4, 3].map((n) => (
                    <span key={n}>
                      <b className="text-cyan-200">{n}×</b> <span className="text-amber-100">{formatShort((machine.scatterPays[n] ?? 0) * bet)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {paying.map((s) => (
            <div key={s.id} className="flex flex-col items-center rounded-2xl bg-black/30 p-2 ring-1 ring-white/10">
              <img src={theme.symbolArt[s.id]} alt={s.name} className="h-16 w-16 object-contain" loading="lazy" />
              <div className="mt-0.5 text-center text-[11px] text-violet-100/70">{s.name}</div>
              <PayRow pays={machine.paytable[s.id]} lineBet={lineBet} vertical />
            </div>
          ))}
        </div>

        <section className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
          <h3 className="font-display text-gold-flat text-[20px]">FREE SPINS</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-violet-50/85">
            <li>
              3, 4 or 5 Scatters anywhere award {awards["3"]}, {awards["4"]} or {awards["5"]} free spins.
            </li>
            <li>All free-spin wins are multiplied ×{machine.freeSpins.multiplier}.</li>
            <li>Free spins can be retriggered during the feature.</li>
            <li>Free spins play at the bet that triggered them.</li>
          </ul>
        </section>

        <section>
          <h3 className="mb-2 font-display text-gold-flat text-[20px]">{machine.paylines.length} PAYLINES</h3>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
            {machine.paylines.map((line, i) => (
              <LineDiagram key={i} line={line} index={i} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-black/30 p-4 text-[12px] leading-relaxed text-violet-100/75 ring-1 ring-white/10">
          <h3 className="mb-1 font-display text-gold-flat text-[18px]">RULES</h3>
          All {machine.paylines.length} lines are always active. Line wins pay left to right on consecutive reels starting from the leftmost reel. Only
          the highest win per line is paid. Line wins are multiplied by the line bet (total bet ÷ {machine.paylines.length}); scatter wins are multiplied by the total
          bet and added to line wins. Every spin result is decided on the server with a secure random generator. Theoretical return to player is about 96%.
        </section>
        <Disclaimer compact />
      </div>
    </Modal>
  );
}

function PayRow({ pays, lineBet, vertical = false }: { pays: number[] | undefined; lineBet: number; vertical?: boolean }) {
  if (!pays) return null;
  return (
    <div className={vertical ? "mt-1 flex w-full flex-col gap-0.5 text-[12px]" : "mt-1 flex gap-3 text-[12px]"}>
      {[5, 4, 3].map((n) => (
        <div key={n} className={vertical ? "flex justify-between gap-2 px-1" : ""}>
          <b className="text-amber-300">{n}×</b> <span className="tabular text-violet-50">{formatShort((pays[n] ?? 0) * lineBet)}</span>
        </div>
      ))}
    </div>
  );
}
