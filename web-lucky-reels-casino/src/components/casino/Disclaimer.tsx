import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

export const DISCLAIMER =
  "Lucky Reels Casino is a free-to-play social casino game for entertainment only. It uses virtual coins only: no real-money gambling, no cash prizes, no cash-out, and coins have no real-world value. Intended for adults 18+. Practice or success at social casino gaming does not imply future success at real-money gambling.";

/** The virtual-coins notice shown in the footer, settings and store. */
export function Disclaimer({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-2xl bg-black/35 px-3 py-2.5 text-[11px] leading-snug text-violet-100/70 ring-1 ring-white/10", className)}>
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" />
      <p>
        {compact ? (
          <>
            <b className="text-amber-200/90">Virtual coins only.</b> No real-money gambling, no cash prizes, no cash-out. Coins have no real-world value. 18+.
          </>
        ) : (
          DISCLAIMER
        )}
      </p>
    </div>
  );
}
