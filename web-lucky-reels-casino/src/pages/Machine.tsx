import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { LoadingScreen } from "@/components/casino/LoadingScreen";
import { TopBar } from "@/components/casino/TopBar";
import { type AutoConfig, AutospinPanel } from "@/components/machine/AutospinPanel";
import { CelebrationLayer, type Overlay } from "@/components/machine/Celebrations";
import { ControlBar } from "@/components/machine/ControlBar";
import { PaytableModal } from "@/components/machine/PaytableModal";
import { audio, type SoundHandle, vibrate } from "@/game/audio";
import { flyCoinsToBalance } from "@/game/collect";
import { MACHINE_SFX, MACHINE_THEMES } from "@/game/machines";
import { SlotRenderer } from "@/game/renderer/SlotRenderer";
import type { LineWin, SpinResponse, WinTier } from "@/game/types";
import { useGame } from "@/game/useGame";
import { formatCoins, sleep } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SpinResult {
  ok: boolean;
  tier: WinTier;
  feature: boolean;
}

function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState<boolean>(() => window.innerHeight > window.innerWidth);
  useEffect(() => {
    const on = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return portrait;
}

/** A slot machine screen. Any machine with a server config and a theme entry works here. */
export default function Machine() {
  const { machineId = "" } = useParams();
  const navigate = useNavigate();
  const game = useGame();
  const { config, player, displayBalance, requestSpin, commitSpin, releaseWin, setPendingBet, setModal, modal, handleError, tutorial, setTutorial, setMusic, setBusy, levelUps } = game;

  const machine = config?.machineConfigs[machineId];
  const listing = config?.machines.find((m) => m.id === machineId);
  const theme = MACHINE_THEMES[machineId];
  const portrait = useIsPortrait();

  const hostRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SlotRenderer | null>(null);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState<number>(0);

  const [betIndex, setBetIndex] = useState<number>(-1);
  const [turbo, setTurbo] = useState<boolean>(false);
  const [spinning, setSpinning] = useState<boolean>(false);
  const [autoLeft, setAutoLeft] = useState<number | null>(null);
  const [autoOpen, setAutoOpen] = useState<boolean>(false);
  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const [mode, setMode] = useState<"base" | "free">("base");
  const [fsView, setFsView] = useState<{ played: number; total: number; totalWin: number } | null>(null);
  const [win, setWin] = useState<number>(0);
  const [lineText, setLineText] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  const overlayResolve = useRef<(() => void) | null>(null);
  const mountedRef = useRef<boolean>(true);
  const spinningRef = useRef<boolean>(false);
  const seqRef = useRef<boolean>(false);
  const autoRef = useRef<AutoConfig | null>(null);
  const turboRef = useRef<boolean>(false);
  const betIndexRef = useRef<number>(0);
  const playerRef = useRef(player);
  const balanceRef = useRef<number>(displayBalance);
  const tutorialRef = useRef(tutorial);
  const modeRef = useRef<"base" | "free">("base");
  const lastGridRef = useRef<string[][] | null>(null);
  const antRef = useRef<SoundHandle | null>(null);
  const lastThudRef = useRef<number>(0);
  const symbolNames = useMemo(() => Object.fromEntries((machine?.symbols ?? []).map((s) => [s.id, s.name])), [machine]);

  playerRef.current = player;
  balanceRef.current = displayBalance;
  tutorialRef.current = tutorial;
  turboRef.current = turbo;
  betIndexRef.current = betIndex;

  const level = player?.level ?? 1;
  const maxUnlocked = useMemo(() => {
    if (!machine) return 0;
    let idx = 0;
    machine.betUnlockLevels.forEach((lvl, i) => {
      if (lvl <= level) idx = i;
    });
    return idx;
  }, [machine, level]);

  // Initial bet: machine default, clamped to what the player has unlocked.
  useEffect(() => {
    if (machine && betIndex < 0) setBetIndex(Math.min(machine.defaultBetIndex, maxUnlocked));
  }, [machine, betIndex, maxUnlocked]);

  // Guard: unknown or locked machines go back to the lobby.
  useEffect(() => {
    if (!config || !player) return;
    if (!machine || !theme || !listing?.playable || listing.unlockLevel > player.level) navigate("/", { replace: true });
  }, [config, player, machine, theme, listing, navigate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      autoRef.current = null;
      setBusy(false);
      setPendingBet(0);
      releaseWin();
      antRef.current?.stop();
    };
  }, [setBusy, setPendingBet, releaseWin]);

  // Lazy-load this machine's art + sounds and create the renderer.
  useEffect(() => {
    if (!machine || !theme || !hostRef.current) return;
    let cancelled = false;
    let created: SlotRenderer | null = null;
    setLoadError(null);
    const bgs = theme.backgrounds;
    const bgUrls = bgs ? [portrait ? bgs.base.portrait : bgs.base.landscape, portrait ? bgs.free.portrait : bgs.free.landscape] : [];
    let texP = 0;
    let sfxP = 0;
    let bgP = 0;
    const report = () => setLoadProgress(texP * 0.6 + sfxP * 0.25 + bgP * 0.15);
    const bgLoad = Promise.all(
      bgUrls.map(
        (u) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = img.onerror = () => {
              bgP += 1 / bgUrls.length;
              report();
              resolve();
            };
            img.src = u;
          }),
      ),
    );
    (async () => {
      try {
        const [r] = await Promise.all([
          SlotRenderer.create(hostRef.current as HTMLDivElement, machine, theme, (p) => {
            texP = p;
            report();
          }),
          audio.load(MACHINE_SFX, (p) => {
            sfxP = p;
            report();
          }),
          bgLoad,
        ]);
        created = r;
        if (cancelled) {
          r.destroy();
          return;
        }
        rendererRef.current = r;
        const fs = playerRef.current?.freeSpins;
        const startGrid = machine.symbols.length
          ? Array.from({ length: machine.reels }, (_, i) =>
              Array.from({ length: machine.rows }, (_, row) => {
                const pool = machine.symbols.filter((s) => s.kind !== "scatter");
                return pool[(i * 3 + row * 5 + 2) % pool.length].id;
              }),
            )
          : [];
        r.setGrid(startGrid);
        lastGridRef.current = startGrid;
        if (fs && fs.machineId === machine.id) {
          modeRef.current = "free";
          setMode("free");
          r.setMode("free");
          setFsView({ played: fs.total - fs.remaining, total: fs.total, totalWin: fs.totalWin });
        }
        setLoadProgress(1);
        await sleep(250);
        if (!cancelled) setLoaded(true);
      } catch (err) {
        console.error("Machine failed to load", err instanceof Error ? err.message : "unknown");
        if (!cancelled) setLoadError("This machine couldn't load. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
      created?.destroy();
      rendererRef.current = null;
    };
    // portrait only matters for the first background choice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine, theme, loadAttempt]);

  // Music follows mode.
  useEffect(() => {
    if (!loaded || !theme?.music) return;
    setMusic(mode === "free" ? theme.music.free : theme.music.base);
  }, [loaded, mode, theme, setMusic]);

  // Tutorial: arriving from the lobby step moves on to "press spin".
  useEffect(() => {
    if (loaded && tutorial === "lobby") setTutorial("spin");
  }, [loaded, tutorial, setTutorial]);

  const showOverlay = useCallback(
    (o: Overlay) =>
      new Promise<void>((resolve) => {
        overlayResolve.current = resolve;
        setOverlay(o);
      }),
    [],
  );
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    const r = overlayResolve.current;
    overlayResolve.current = null;
    r?.();
  }, []);

  const shake = useCallback((size: "sm" | "lg") => {
    const el = shakeRef.current;
    if (!el) return;
    const cls = size === "lg" ? "shake-lg" : "shake-sm";
    el.classList.remove("shake-sm", "shake-lg");
    void el.offsetWidth;
    el.classList.add(cls);
  }, []);

  // Renderer sound + haptic hooks.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !loaded || !machine) return;
    r.setEvents({
      onReelStop: (_reel, hasScatter) => {
        const t = performance.now();
        if (t - lastThudRef.current > 45) {
          audio.play("reelStop", { volume: 0.85, rate: 0.95 + Math.random() * 0.1 });
          lastThudRef.current = t;
        }
        if (hasScatter) {
          audio.play("scatter", { volume: 0.9 });
          vibrate(18);
        } else vibrate(6);
      },
      onAnticipationStart: () => {
        antRef.current?.stop();
        antRef.current = audio.play("anticipation", { volume: 0.95 });
        audio.duck(0.35, 1800);
      },
      onAnticipationEnd: () => {
        antRef.current?.stop(250);
        antRef.current = null;
      },
      onLineShown: (w: LineWin | null) => {
        if (!w) {
          setLineText(null);
          return;
        }
        setLineText(`Line ${w.line + 1} · ${w.count}× ${symbolNames[w.symbol] ?? w.symbol} · ${formatCoins(w.amount)}`);
      },
    });
  }, [loaded, machine, symbolNames]);

  const enterFree = useCallback(() => {
    modeRef.current = "free";
    setMode("free");
    rendererRef.current?.setMode("free");
  }, []);

  const exitFree = useCallback(() => {
    modeRef.current = "base";
    setMode("base");
    setFsView(null);
    rendererRef.current?.setMode("base");
  }, []);

  const stopAuto = useCallback(() => {
    autoRef.current = null;
    setAutoLeft(null);
  }, []);

  /** One full spin: request, animate, present. Returns what happened for autospin decisions. */
  const runSpin = useCallback(async (): Promise<SpinResult> => {
    const r = rendererRef.current;
    const p = playerRef.current;
    if (!r || !machine || !p || spinningRef.current) return { ok: false, tier: "none", feature: false };
    const fsActive = Boolean(p.freeSpins);
    const bIdx = betIndexRef.current;
    const bet = machine.betLevels[bIdx];
    if (!fsActive && balanceRef.current < bet) {
      setModal("outOfCoins");
      return { ok: false, tier: "none", feature: false };
    }

    spinningRef.current = true;
    setSpinning(true);
    setBusy(true);
    setLineText(null);
    if (!fsActive) {
      setWin(0);
      setPendingBet(bet);
    }
    const isTut = tutorialRef.current === "spin";
    if (isTut) setTutorial("spinning");
    const turboNow = turboRef.current;
    r.startSpin({ turbo: turboNow });
    const loop = audio.play("reelSpin", { loop: true, volume: 0.45 });

    let res: SpinResponse;
    try {
      res = await requestSpin(machine.id, bIdx, isTut);
    } catch (err) {
      await r.setResult(lastGridRef.current ?? [], -1);
      loop.stop(120);
      setPendingBet(0);
      handleError(err, "Spin failed. Your coins are safe.");
      spinningRef.current = false;
      setSpinning(false);
      setBusy(false);
      if (isTut) setTutorial("spin");
      return { ok: false, tier: "none", feature: false };
    }

    commitSpin(res);
    await r.setResult(res.outcome.grid, res.outcome.anticipationFrom);
    lastGridRef.current = res.outcome.grid;
    loop.stop(160);
    if (!mountedRef.current) return { ok: false, tier: "none", feature: false };

    const o = res.outcome;
    const inFree = res.isFreeSpin;
    const fsAfter = res.player.freeSpins;
    if (inFree) {
      const fs = fsAfter ?? (res.freeSpinsSummary ? { total: res.freeSpinsSummary.spins, remaining: 0, totalWin: res.freeSpinsSummary.totalWin } : null);
      if (fs) setFsView({ played: fs.total - fs.remaining, total: fs.total, totalWin: fs.totalWin });
    }

    if (o.totalWin > 0 || o.scatter.positions.length > 0) {
      const winsDone = r.showWins(o.wins, o.scatter.positions, { turbo: turboRef.current });
      if (o.totalWin > 0) setWin(inFree ? (fsAfter?.totalWin ?? res.freeSpinsSummary?.totalWin ?? o.totalWin) : o.totalWin);
      if (res.tier === "none") {
        if (o.totalWin > 0) {
          audio.play("smallWin", { volume: 0.85 });
          if (!inFree) flyCoinsToBalance(r.screenCenter(), o.totalWin, (a) => releaseWin(a), Math.min(14, 4 + Math.round(o.totalWin / bet)));
        }
        await winsDone;
      } else {
        await sleep(turboRef.current ? 200 : 420);
        shake("sm");
        await showOverlay({ kind: "win", tier: res.tier, amount: o.totalWin, bet: res.bet, tiers: machine.winTiers });
        if (!inFree) flyCoinsToBalance(r.screenCenter(), o.totalWin, (a) => releaseWin(a), 22);
      }
    }

    if (res.freeSpinsTriggered > 0) {
      if (!inFree) {
        await sleep(300);
        await showOverlay({ kind: "fsIntro", count: res.freeSpinsTriggered, multiplier: machine.freeSpins.multiplier });
        enterFree();
        const fs = res.player.freeSpins;
        if (fs) setFsView({ played: 0, total: fs.total, totalWin: 0 });
        setWin(0);
      } else {
        await showOverlay({ kind: "fsRetrigger", count: res.freeSpinsTriggered });
      }
    }

    if (res.freeSpinsSummary) {
      await sleep(500);
      const s = res.freeSpinsSummary;
      await showOverlay({ kind: "fsSummary", totalWin: s.totalWin, spins: s.spins, multiplier: machine.freeSpins.multiplier });
      exitFree();
      setWin(s.totalWin);
      if (s.totalWin > 0) flyCoinsToBalance(r.screenCenter(), s.totalWin, () => releaseWin(), 26);
      else releaseWin();
    }

    spinningRef.current = false;
    setSpinning(false);
    setBusy(false);
    if (isTut) setTimeout(() => setTutorial("bonus"), 600);
    return { ok: true, tier: res.tier, feature: res.freeSpinsTriggered > 0 && !inFree };
  }, [machine, requestSpin, commitSpin, releaseWin, setPendingBet, setModal, handleError, setTutorial, setBusy, showOverlay, shake, enterFree, exitFree]);

  /** Plays spins back to back while free spins or autospin remain. */
  const runSequence = useCallback(async () => {
    if (seqRef.current) return;
    seqRef.current = true;
    try {
      while (mountedRef.current) {
        const fs = Boolean(playerRef.current?.freeSpins);
        const a = autoRef.current;
        if (!fs && a) {
          a.remaining -= 1;
          setAutoLeft(a.remaining);
        }
        const result = await runSpin();
        if (!result.ok) {
          stopAuto();
          break;
        }
        const auto = autoRef.current;
        if (auto) {
          if (auto.stopOnBig && result.tier !== "none") stopAuto();
          else if (auto.stopOnFeature && result.feature) stopAuto();
          else if (auto.stopBelow > 0 && balanceRef.current < auto.stopBelow) stopAuto();
        }
        const nextFs = Boolean(playerRef.current?.freeSpins);
        if (!nextFs) {
          const cur = autoRef.current;
          if (!cur) break;
          if (cur.remaining <= 0) {
            stopAuto();
            break;
          }
        }
        await sleep(turboRef.current ? 120 : nextFs ? 450 : 320);
        if (modal === "outOfCoins") break;
      }
    } finally {
      seqRef.current = false;
    }
  }, [runSpin, stopAuto, modal]);

  const onSpin = useCallback(() => {
    if (!loaded || overlay) return;
    audio.unlock();
    if (autoRef.current) {
      stopAuto();
      rendererRef.current?.slam();
      return;
    }
    if (spinningRef.current) {
      rendererRef.current?.slam();
      return;
    }
    audio.play("click", { volume: 0.6 });
    void runSequence();
  }, [loaded, overlay, stopAuto, runSequence]);

  // Resume free spins that were in progress (e.g. after a reload).
  useEffect(() => {
    if (!loaded) return;
    if (playerRef.current?.freeSpins?.machineId === machineId && !seqRef.current) {
      const id = setTimeout(() => void runSequence(), 900);
      return () => clearTimeout(id);
    }
  }, [loaded, machineId, runSequence]);

  // Spacebar spins / slam-stops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (e.repeat || modal || infoOpen || autoOpen || levelUps.length > 0) return;
      if (tutorial && tutorial !== "spin" && tutorial !== "spinning") return;
      onSpin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSpin, modal, infoOpen, autoOpen, levelUps.length, tutorial]);

  const startAuto = useCallback(
    (cfg: AutoConfig) => {
      setAutoOpen(false);
      autoRef.current = cfg;
      setAutoLeft(cfg.remaining);
      if (!spinningRef.current) void runSequence();
    },
    [runSequence],
  );

  if (!config || !player || !machine || !theme) {
    return <LoadingScreen label="Loading machine" />;
  }

  const safeBet = Math.max(0, betIndex);
  const bet = machine.betLevels[safeBet];
  const nextLocked = safeBet + 1 < machine.betLevels.length && machine.betUnlockLevels[safeBet + 1] > level ? machine.betUnlockLevels[safeBet + 1] : null;
  const bgSet = theme.backgrounds;
  const bgBase = bgSet ? (portrait ? bgSet.base.portrait : bgSet.base.landscape) : undefined;
  const bgFree = bgSet ? (portrait ? bgSet.free.portrait : bgSet.free.landscape) : undefined;
  const inFree = mode === "free";

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#07031a]">
      <div className="pointer-events-none absolute inset-0">
        {bgBase ? <img src={bgBase} alt="" className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-1000", inFree ? "opacity-0" : "opacity-100")} /> : null}
        {bgFree ? <img src={bgFree} alt="" className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-1000", inFree ? "opacity-100" : "opacity-0")} /> : null}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_60%_at_50%_48%,transparent_30%,rgba(4,1,16,0.75)_100%)]" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#07031a] to-transparent" />
      </div>

      <TopBar onBack={() => navigate("/")} title={theme.title} titleClass={theme.titleClass} />

      <main ref={shakeRef} className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-1 sm:px-4">
        <div className="relative z-10 flex h-12 shrink-0 items-center justify-center sm:h-16">
          {inFree && fsView ? (
            <div className="flex items-center gap-3 pop-in" key="fs">
              <div className="pill-dark rounded-full px-4 py-1 text-center">
                <div className="text-[10px] tracking-[0.25em] text-cyan-100/80">FREE SPINS</div>
                <div className="font-display neon-cyan text-[22px] leading-none sm:text-[26px]">
                  {fsView.played} / {fsView.total}
                </div>
              </div>
              <div className="pill-dark rounded-full px-4 py-1 text-center">
                <div className="text-[10px] tracking-[0.25em] text-amber-100/80">×{machine.freeSpins.multiplier} WINS</div>
                <div className="font-display text-gold-flat text-[22px] leading-none sm:text-[26px]">{formatCoins(fsView.totalWin)}</div>
              </div>
            </div>
          ) : (
            <h1 className={cn("text-gold text-center text-[24px] leading-none sm:text-[38px] lg:hidden", theme.titleClass)} key="title">
              {theme.title}
            </h1>
          )}
        </div>
        <div ref={hostRef} className="relative w-full max-w-[1150px] flex-1" style={{ minHeight: 160, maxHeight: "min(64vh, 640px)" }} />
      </main>

      <ControlBar
        bet={bet}
        canDec={safeBet > 0}
        canInc={safeBet < maxUnlocked}
        isMaxBet={safeBet >= maxUnlocked}
        onDec={() => setBetIndex((i) => Math.max(0, i - 1))}
        onInc={() => setBetIndex((i) => Math.min(maxUnlocked, i + 1))}
        onMax={() => setBetIndex(maxUnlocked)}
        onSpin={onSpin}
        onInfo={() => setInfoOpen(true)}
        onAuto={() => (autoRef.current ? stopAuto() : setAutoOpen(true))}
        onTurbo={() => setTurbo((t) => !t)}
        turbo={turbo}
        spinning={spinning}
        autoLeft={autoLeft}
        freeSpins={inFree && fsView ? { played: fsView.played, total: fsView.total } : null}
        win={inFree ? (fsView?.totalWin ?? 0) : win}
        winLabel={inFree ? "TOTAL WIN" : "WIN"}
        lineText={lineText}
        lockedHint={nextLocked ? `Next bet at level ${nextLocked}` : null}
        betLocked={tutorial === "spin" || tutorial === "spinning"}
      />

      <AutospinPanel open={autoOpen} onClose={() => setAutoOpen(false)} onStart={startAuto} balance={displayBalance} />
      <PaytableModal open={infoOpen} onClose={() => setInfoOpen(false)} machine={machine} theme={theme} bet={bet} />
      {overlay ? <CelebrationLayer overlay={overlay} onDone={closeOverlay} auto={autoLeft !== null || inFree} turbo={turbo} shake={shake} titleClass={theme.titleClass} /> : null}

      {!loaded ? (
        <LoadingScreen
          progress={loadProgress}
          label="Loading"
          art={theme.tile}
          title={theme.title}
          titleClass={theme.titleClass}
          error={loadError}
          onRetry={() => {
            setLoadError(null);
            setLoadProgress(0);
            setLoadAttempt((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}
