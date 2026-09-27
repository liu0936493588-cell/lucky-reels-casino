import { DurableObject } from "cloudflare:workers";

import { MACHINE_LISTINGS, MACHINES } from "./engine/machines";
import {
  BONUS_INTERVAL_MS,
  freeBonusAmount,
  levelUpReward,
  MAX_LEVEL,
  START_BALANCE,
  STORE_PACKS,
  WHEEL_INTERVAL_MS,
  WHEEL_SEGMENTS,
  wheelMultiplier,
  xpForBet,
  xpToNext,
} from "./engine/progression";
import { secureRng } from "./engine/rng";
import { evaluateGrid, playSpin, winTier } from "./engine/slot";
import type { SpinOutcome } from "./engine/types";

type Env = { DO: Fetcher };

interface FreeSpinState {
  machineId: string;
  remaining: number;
  total: number;
  totalWin: number;
  bet: number;
  betIndex: number;
}

export interface PlayerData {
  createdAt: number;
  balance: number;
  level: number;
  xp: number;
  tutorialDone: boolean;
  tutorialScriptUsed: boolean;
  nextBonusAt: number;
  nextWheelAt: number;
  storeReadyAt: Record<string, number>;
  settings: { music: boolean; sfx: boolean };
  freeSpins: FreeSpinState | null;
  totalSpins: number;
  biggestWin: number;
  displayName: string | null;
  guestSecretHash: string | null;
  mergedInto: string | null;
}

const STATE_KEY = "player";
const SPIN_MIN_INTERVAL_MS = 120;
const SPIN_BURST = 12;
const SPIN_BURST_WINDOW_MS = 4000;
const ACTION_BURST = 30;
const ACTION_WINDOW_MS = 5000;

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function freshPlayer(now: number): PlayerData {
  return {
    createdAt: now,
    balance: START_BALANCE,
    level: 1,
    xp: 0,
    tutorialDone: false,
    tutorialScriptUsed: false,
    nextBonusAt: now,
    nextWheelAt: now,
    storeReadyAt: {},
    settings: { music: true, sfx: true },
    freeSpins: null,
    totalSpins: 0,
    biggestWin: 0,
    displayName: null,
    guestSecretHash: null,
    mergedInto: null,
  };
}

/**
 * One instance per player (key `u:<userId>` or `g:<guestId>`). It is the only
 * authority for balance, progression, bonuses and spin outcomes, and it keeps
 * the spin log in its own SQLite database.
 */
export class PlayerStore extends DurableObject<Env> {
  private data: PlayerData | null = null;
  private spinTimes: number[] = [];
  private actionTimes: number[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS spins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player TEXT NOT NULL,
        machine TEXT NOT NULL,
        bet INTEGER NOT NULL,
        win INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        free_spin INTEGER NOT NULL,
        ts INTEGER NOT NULL
      )
    `);
    this.ctx.blockConcurrencyWhile(async () => {
      this.data = (await this.ctx.storage.get<PlayerData>(STATE_KEY)) ?? null;
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
      const isGuest = request.headers.get("X-Identity-Kind") === "guest";
      const guestSecret = request.headers.get("X-Guest-Secret") ?? "";

      if (url.pathname === "/info") {
        return Response.json({ initialized: this.data !== null && this.data.mergedInto === null });
      }

      if (url.pathname === "/session") {
        return Response.json(await this.session(isGuest, guestSecret, body));
      }

      if (isGuest) await this.verifyGuest(guestSecret);
      const data = this.requireData();
      this.rateLimitAction();

      switch (url.pathname) {
        case "/claim":
          return Response.json(await this.claimForMerge(data, String(body.into ?? "")));
        case "/spin":
          return Response.json(await this.spin(data, body));
        case "/bonus":
          return Response.json(await this.collectBonus(data));
        case "/wheel":
          return Response.json(await this.spinWheel(data));
        case "/store":
          return Response.json(await this.claimPack(data, String(body.packId ?? "")));
        case "/settings":
          return Response.json(await this.updateSettings(data, body));
        case "/tutorial":
          data.tutorialDone = body.done !== false;
          await this.save();
          return Response.json({ player: this.publicPlayer(isGuest) });
        default:
          throw new HttpError(404, "not_found", "Unknown route");
      }
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.code, message: err.message }, { status: err.status });
      }
      console.error("PlayerStore error", err instanceof Error ? err.message : String(err));
      return Response.json({ error: "server_error", message: "Something went wrong" }, { status: 500 });
    }
  }

  private requireData(): PlayerData {
    if (!this.data) throw new HttpError(409, "no_session", "Start a session first");
    if (this.data.mergedInto) throw new HttpError(410, "merged", "This guest profile was moved to an account");
    return this.data;
  }

  private async verifyGuest(secret: string): Promise<void> {
    if (!this.data) return;
    if (!this.data.guestSecretHash || (await sha256(secret)) !== this.data.guestSecretHash) {
      throw new HttpError(401, "bad_guest", "Guest credentials do not match");
    }
  }

  private async save(): Promise<void> {
    if (this.data) await this.ctx.storage.put(STATE_KEY, this.data);
  }

  private rateLimitAction(): void {
    const now = Date.now();
    this.actionTimes = this.actionTimes.filter((t) => now - t < ACTION_WINDOW_MS);
    if (this.actionTimes.length >= ACTION_BURST) throw new HttpError(429, "rate_limited", "Slow down a little");
    this.actionTimes.push(now);
  }

  private rateLimitSpin(): void {
    const now = Date.now();
    const last = this.spinTimes[this.spinTimes.length - 1] ?? 0;
    if (now - last < SPIN_MIN_INTERVAL_MS) throw new HttpError(429, "rate_limited", "Spinning too fast");
    this.spinTimes = this.spinTimes.filter((t) => now - t < SPIN_BURST_WINDOW_MS);
    if (this.spinTimes.length >= SPIN_BURST) throw new HttpError(429, "rate_limited", "Spinning too fast");
    this.spinTimes.push(now);
  }

  private async session(isGuest: boolean, guestSecret: string, body: Record<string, unknown>) {
    const now = Date.now();
    const displayName = typeof body.displayName === "string" ? body.displayName.slice(0, 40) : null;

    if (this.data?.mergedInto) {
      throw new HttpError(410, "merged", "This guest profile was moved to an account");
    }

    if (!this.data) {
      if (isGuest && guestSecret.length < 32) throw new HttpError(400, "bad_guest", "Invalid guest credentials");
      const imported = body.import as PlayerData | null | undefined;
      const next: PlayerData = imported ? { ...imported, guestSecretHash: null, mergedInto: null } : freshPlayer(now);
      if (isGuest) next.guestSecretHash = await sha256(guestSecret);
      this.data = next;
    } else if (isGuest) {
      await this.verifyGuest(guestSecret);
    }

    if (!isGuest && displayName) this.data.displayName = displayName;
    await this.save();
    return { player: this.publicPlayer(isGuest), merged: Boolean(body.import) };
  }

  private async claimForMerge(data: PlayerData, into: string) {
    const snapshot: PlayerData = { ...data };
    data.mergedInto = into || "account";
    await this.save();
    return { data: snapshot };
  }

  private async spin(data: PlayerData, body: Record<string, unknown>) {
    const machineId = String(body.machineId ?? "");
    const cfg = MACHINES[machineId];
    if (!cfg) throw new HttpError(404, "unknown_machine", "Machine not found");
    const listing = MACHINE_LISTINGS.find((m) => m.id === machineId);
    if (listing && listing.unlockLevel > data.level) {
      throw new HttpError(403, "machine_locked", `Unlocks at level ${listing.unlockLevel}`);
    }
    this.rateLimitSpin();

    const fs = data.freeSpins;
    if (fs && fs.machineId !== machineId) {
      throw new HttpError(409, "free_spins_pending", "Finish your free spins first");
    }

    const isFreeSpin = Boolean(fs && fs.remaining > 0);
    let bet: number;
    let betIndex: number;
    let multiplier = 1;

    if (isFreeSpin && fs) {
      bet = fs.bet;
      betIndex = fs.betIndex;
      multiplier = cfg.freeSpins.multiplier;
      fs.remaining -= 1;
    } else {
      betIndex = Number(body.betIndex);
      if (!Number.isInteger(betIndex) || betIndex < 0 || betIndex >= cfg.betLevels.length) {
        throw new HttpError(400, "bad_bet", "Invalid bet");
      }
      if ((cfg.betUnlockLevels[betIndex] ?? 1) > data.level) {
        throw new HttpError(403, "bet_locked", `This bet unlocks at level ${cfg.betUnlockLevels[betIndex]}`);
      }
      bet = cfg.betLevels[betIndex];
      if (data.balance < bet) throw new HttpError(402, "insufficient_balance", "Not enough coins");
      data.balance -= bet;
    }

    const useScript = !isFreeSpin && body.tutorial === true && !data.tutorialScriptUsed && Boolean(cfg.tutorialGrid);
    let outcome: SpinOutcome;
    if (useScript && cfg.tutorialGrid) {
      outcome = { stops: [], ...evaluateGrid(cfg, cfg.tutorialGrid, bet, 1) };
      data.tutorialScriptUsed = true;
    } else {
      outcome = playSpin(cfg, secureRng, bet, multiplier);
    }

    data.balance += outcome.totalWin;
    data.totalSpins += 1;
    if (outcome.totalWin > data.biggestWin) data.biggestWin = outcome.totalWin;

    const awarded = outcome.scatter.freeSpinsAwarded;
    let freeSpinsTriggered = 0;
    let freeSpinsSummary: { totalWin: number; spins: number; bet: number } | null = null;

    if (isFreeSpin && fs) {
      fs.totalWin += outcome.totalWin;
      if (awarded > 0 && cfg.freeSpins.retrigger) {
        fs.remaining += awarded;
        fs.total += awarded;
        freeSpinsTriggered = awarded;
      }
      if (fs.remaining <= 0) {
        freeSpinsSummary = { totalWin: fs.totalWin, spins: fs.total, bet: fs.bet };
        data.freeSpins = null;
      }
    } else if (awarded > 0) {
      data.freeSpins = { machineId, remaining: awarded, total: awarded, totalWin: 0, bet, betIndex };
      freeSpinsTriggered = awarded;
    }

    const levelUps = isFreeSpin ? [] : this.applyXp(data, xpForBet(bet));

    this.ctx.storage.sql.exec(
      "INSERT INTO spins (player, machine, bet, win, balance_after, free_spin, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
      this.ctx.id.name ?? "unknown",
      machineId,
      isFreeSpin ? 0 : bet,
      outcome.totalWin,
      data.balance,
      isFreeSpin ? 1 : 0,
      Date.now(),
    );
    console.log(
      JSON.stringify({ evt: "spin", player: this.ctx.id.name, machine: machineId, bet: isFreeSpin ? 0 : bet, win: outcome.totalWin, balanceAfter: data.balance, free: isFreeSpin }),
    );
    await this.save();

    return {
      outcome: {
        grid: outcome.grid,
        wins: outcome.wins,
        scatter: outcome.scatter,
        lineWin: outcome.lineWin,
        totalWin: outcome.totalWin,
        anticipationFrom: outcome.anticipationFrom,
      },
      bet,
      betIndex,
      isFreeSpin,
      multiplier,
      tier: winTier(cfg, outcome.totalWin, bet),
      freeSpinsTriggered,
      freeSpinsSummary,
      summaryTier: freeSpinsSummary ? winTier(cfg, freeSpinsSummary.totalWin, freeSpinsSummary.bet) : "none",
      levelUps,
      scripted: useScript,
      player: this.publicPlayer(null),
    };
  }

  private applyXp(data: PlayerData, gained: number) {
    const levelUps: { level: number; reward: number; unlockedMachines: string[]; unlockedBets: number[] }[] = [];
    data.xp += gained;
    while (data.level < MAX_LEVEL && data.xp >= xpToNext(data.level)) {
      data.xp -= xpToNext(data.level);
      data.level += 1;
      const reward = levelUpReward(data.level);
      data.balance += reward;
      const unlockedMachines = MACHINE_LISTINGS.filter((m) => m.unlockLevel === data.level).map((m) => m.name);
      const unlockedBets: number[] = [];
      for (const cfg of Object.values(MACHINES)) {
        cfg.betUnlockLevels.forEach((lvl, i) => {
          if (lvl === data.level && !unlockedBets.includes(cfg.betLevels[i])) unlockedBets.push(cfg.betLevels[i]);
        });
      }
      levelUps.push({ level: data.level, reward, unlockedMachines, unlockedBets });
    }
    return levelUps;
  }

  private async collectBonus(data: PlayerData) {
    const now = Date.now();
    if (now < data.nextBonusAt) throw new HttpError(409, "not_ready", "Bonus is not ready yet");
    const amount = freeBonusAmount(data.level);
    data.balance += amount;
    data.nextBonusAt = now + BONUS_INTERVAL_MS;
    await this.save();
    return { amount, player: this.publicPlayer(null) };
  }

  private async spinWheel(data: PlayerData) {
    const now = Date.now();
    if (now < data.nextWheelAt) throw new HttpError(409, "not_ready", "The wheel is not ready yet");
    const totalWeight = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
    let roll = secureRng(totalWeight);
    let index = 0;
    for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
      roll -= WHEEL_SEGMENTS[i].weight;
      if (roll < 0) {
        index = i;
        break;
      }
    }
    const amount = Math.round(WHEEL_SEGMENTS[index].amount * wheelMultiplier(data.level));
    data.balance += amount;
    data.nextWheelAt = now + WHEEL_INTERVAL_MS;
    await this.save();
    return { index, amount, player: this.publicPlayer(null) };
  }

  private async claimPack(data: PlayerData, packId: string) {
    const pack = STORE_PACKS.find((p) => p.id === packId);
    if (!pack) throw new HttpError(404, "unknown_pack", "Pack not found");
    const now = Date.now();
    if (now < (data.storeReadyAt[pack.id] ?? 0)) throw new HttpError(409, "not_ready", "This pack is cooling down");
    data.balance += pack.amount;
    data.storeReadyAt[pack.id] = now + pack.cooldownMs;
    await this.save();
    return { amount: pack.amount, player: this.publicPlayer(null) };
  }

  private async updateSettings(data: PlayerData, body: Record<string, unknown>) {
    if (typeof body.music === "boolean") data.settings.music = body.music;
    if (typeof body.sfx === "boolean") data.settings.sfx = body.sfx;
    await this.save();
    return { player: this.publicPlayer(null) };
  }

  private publicPlayer(isGuest: boolean | null) {
    const d = this.requireData();
    const name = this.ctx.id.name ?? "";
    return {
      identity: isGuest === null ? (name.startsWith("g:") ? "guest" : "user") : isGuest ? "guest" : "user",
      displayName: d.displayName,
      balance: d.balance,
      level: d.level,
      xp: d.xp,
      xpToNext: xpToNext(d.level),
      nextBonusAt: d.nextBonusAt,
      bonusAmount: freeBonusAmount(d.level),
      nextWheelAt: d.nextWheelAt,
      wheelMultiplier: wheelMultiplier(d.level),
      storeReadyAt: d.storeReadyAt,
      settings: d.settings,
      tutorialDone: d.tutorialDone,
      freeSpins: d.freeSpins,
      totalSpins: d.totalSpins,
      biggestWin: d.biggestWin,
      serverTime: Date.now(),
    };
  }
}
