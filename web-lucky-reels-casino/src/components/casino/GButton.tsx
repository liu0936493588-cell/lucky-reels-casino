import { type ButtonHTMLAttributes, forwardRef, type MouseEvent } from "react";

import { audio, vibrate } from "@/game/audio";
import { cn } from "@/lib/utils";

export type GButtonVariant = "gold" | "pink" | "green" | "cyan" | "purple" | "dark";

interface GButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GButtonVariant;
  silent?: boolean;
}

/** Glossy chunky casino button with press-squash, click sound and haptic tick. */
export const GButton = forwardRef<HTMLButtonElement, GButtonProps>(function GButton(
  { variant = "gold", silent = false, className, onClick, type = "button", ...rest },
  ref,
) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!silent) audio.play("click", { volume: 0.7 });
    vibrate(8);
    onClick?.(e);
  };
  return <button ref={ref} type={type} className={cn("btn3d font-display", `btn-${variant}`, className)} onClick={handleClick} {...rest} />;
});
