import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { audio } from "@/game/audio";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  z?: string;
  hideClose?: boolean;
}

/** Gold-framed popup with a dimmed, blurred backdrop. */
export function Modal({ open, onClose, title, children, className, z = "z-50", hideClose = false }: ModalProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={cn("fixed inset-0 flex items-center justify-center p-3 fade-in", z)} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#05010f]/75 backdrop-blur-[3px]" onClick={onClose} />
      <div className={cn("panel-gold relative w-full max-w-md rounded-[26px] pop-in max-h-[92dvh] flex flex-col", className)}>
        {title ? (
          <div className="relative flex items-center justify-center px-12 pt-4 pb-2">
            <h2 className="font-display text-gold text-[26px] leading-none text-center">{title}</h2>
          </div>
        ) : null}
        {!hideClose && onClose ? (
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              audio.play("click", { volume: 0.6 });
              onClose();
            }}
            className="btn3d btn-pink absolute -right-2 -top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full"
          >
            <X className="h-5 w-5" strokeWidth={3.5} />
          </button>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
