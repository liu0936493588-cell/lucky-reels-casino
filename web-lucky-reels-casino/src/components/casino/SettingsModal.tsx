import { GraduationCap, LogOut, Music, UserRound, Volume2 } from "lucide-react";
import type { ReactNode } from "react";

import { useGame } from "@/game/useGame";
import { useAuth } from "@/hooks/useAuth";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Disclaimer } from "./Disclaimer";
import { GButton } from "./GButton";
import { Modal } from "./Modal";

function SwitchRow({ icon, label, on, onChange }: { icon: ReactNode; label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 rounded-2xl bg-black/30 px-4 py-3 text-left ring-1 ring-white/10"
    >
      <span className="text-amber-300">{icon}</span>
      <span className="flex-1 text-[16px] text-violet-50">{label}</span>
      <span className={cn("relative h-8 w-14 shrink-0 rounded-full transition-colors", on ? "bg-gradient-to-b from-lime-300 to-green-600" : "bg-black/60 ring-1 ring-white/20")}>
        <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-gradient-to-b from-white to-slate-300 shadow transition-all", on ? "left-7" : "left-1")} />
      </span>
    </button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M16.4 12.6c0-2.5 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.8-1.1-2.8-4.2zM14 5.1c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z" />
    </svg>
  );
}

/** Settings: audio switches, optional account sign-in, tutorial replay and the notice. */
export function SettingsModal() {
  const { modal, setModal, player, updateSettings, replayTutorial } = useGame();
  const { user, isSigningIn, signIn, signOut, error, clearError } = useAuth();
  if (!player) return null;

  return (
    <Modal open={modal === "settings"} onClose={() => setModal(null)} title="SETTINGS">
      <div className="flex flex-col gap-3">
        <SwitchRow icon={<Music className="h-5 w-5" />} label="Music" on={player.settings.music} onChange={(v) => void updateSettings({ music: v })} />
        <SwitchRow icon={<Volume2 className="h-5 w-5" />} label="Sound effects" on={player.settings.sfx} onChange={(v) => void updateSettings({ sfx: v })} />

        <section className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-violet-400 to-violet-800 ring-2 ring-amber-300/60">
              {user?.picture ? <img src={user.picture} alt="" className="h-full w-full rounded-full object-cover" /> : <UserRound className="h-6 w-6 text-white" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] text-white">{user ? (user.name ?? user.email ?? "Player") : "Guest player"}</div>
              <div className="text-[12px] text-violet-100/60">
                Level {player.level} · {formatCoins(player.totalSpins)} spins · best win {formatCoins(player.biggestWin)}
              </div>
            </div>
          </div>
          {user ? (
            <GButton variant="dark" className="mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-[16px]" onClick={signOut}>
              <LogOut className="h-4 w-4" /> <span>SIGN OUT</span>
            </GButton>
          ) : (
            <>
              <p className="mt-3 text-[12px] leading-snug text-violet-100/70">Sign in to save your coins, level and bonuses and play on any device. Your guest progress moves with you.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void signIn("google")}
                  className="btn3d flex items-center justify-center gap-2 rounded-2xl bg-white py-2.5 text-[15px] font-extrabold text-slate-800 shadow-[0_4px_0_#9aa1b1]"
                >
                  <GoogleMark /> <span>Google</span>
                </button>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void signIn("apple")}
                  className="btn3d flex items-center justify-center gap-2 rounded-2xl bg-black py-2.5 text-[15px] font-extrabold text-white shadow-[0_4px_0_#333] ring-1 ring-white/25"
                >
                  <AppleMark /> <span>Apple</span>
                </button>
              </div>
              {error ? (
                <button type="button" onClick={clearError} className="mt-2 w-full rounded-xl bg-red-500/20 px-3 py-2 text-[12px] text-red-100 ring-1 ring-red-400/40">
                  {error} (tap to dismiss)
                </button>
              ) : null}
            </>
          )}
        </section>

        <GButton variant="purple" className="flex items-center justify-center gap-2 py-2.5 text-[16px]" onClick={replayTutorial}>
          <GraduationCap className="h-5 w-5" /> <span>REPLAY TUTORIAL</span>
        </GButton>

        <Disclaimer />
        <p className="text-center text-[11px] text-violet-200/40">Lucky Reels Casino v1.0 · Spins are decided on our servers with a secure random generator.</p>
      </div>
    </Modal>
  );
}
