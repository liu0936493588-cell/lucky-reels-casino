import { memo } from "react";

import { cn } from "@/lib/utils";

/** Glossy gold coin glyph. */
export const CoinIcon = memo(function CoinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-6 w-6 shrink-0 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]", className)} aria-hidden>
      <defs>
        <radialGradient id="coin-g" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fffbe0" />
          <stop offset="35%" stopColor="#ffd84a" />
          <stop offset="80%" stopColor="#e59400" />
          <stop offset="100%" stopColor="#8a4b00" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18.5" fill="url(#coin-g)" stroke="#9a5a00" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="13.5" fill="none" stroke="#b86e00" strokeWidth="1.6" opacity="0.8" />
      <path
        d="M20 10.5l2.6 5.6 6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.1 6.1-.7z"
        fill="#fff6c9"
        stroke="#a56200"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity="0.35" transform="rotate(-30 14 12)" />
    </svg>
  );
});
