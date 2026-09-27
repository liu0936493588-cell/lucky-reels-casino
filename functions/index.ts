// Lucky Reels Casino backend. Virtual coins only: no real-money gambling,
// no cash prizes, no cash-out, coins have no real-world value.
//
// Routes (web app calls them via /~api/<route>):
//   GET  /config          lobby listings, public machine configs, wheel, store
//   POST /session         create/load the player (guest or signed-in)
//   POST /spin            server-decided spin outcome
//   POST /bonus | /wheel | /store | /settings | /tutorial

import { MACHINE_LISTINGS, MACHINES, publicMachine } from "./engine/machines";
import { STORE_PACKS, WHEEL_SEGMENTS } from "./engine/progression";

export { PlayerStore } from "./player-store";

type Env = { DO: Fetcher };

const PLAYER_ROUTES = new Set(["/session", "/spin", "/bonus", "/wheel", "/store", "/settings", "/tutorial"]);
const GUEST_ID_RE = /^[a-f0-9-]{16,64}$/i;

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function jsonError(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message }), { status, headers: JSON_HEADERS });
}

/** Grand Jackpot display value: climbs steadily through a weekly cycle. Purely cosmetic. */
function jackpotState(now: number) {
  const cycleMs = 7 * 24 * 60 * 60 * 1000;
  const perSecond = 2_750;
  const base = 25_000_000_000;
  const elapsed = now % cycleMs;
  return { value: base + Math.floor((elapsed / 1000) * perSecond), perSecond, serverTime: now };
}

function playerRequest(path: string, doId: string, kind: "guest" | "user", body: unknown, guestSecret?: string): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Rork-DO-Class": "PlayerStore",
    "X-Rork-DO-Id": doId,
    "X-Identity-Kind": kind,
  };
  if (guestSecret) headers["X-Guest-Secret"] = guestSecret;
  return new Request(`https://internal${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
}

async function handleSession(env: Env, userId: string | null, displayName: string | null, guestId: string | null, guestSecret: string, body: Record<string, unknown>): Promise<Response> {
  if (!userId) {
    if (!guestId) return jsonError(400, "no_identity", "Missing guest identity");
    return env.DO.fetch(playerRequest("/session", `g:${guestId}`, "guest", body, guestSecret));
  }

  const userDo = `u:${userId}`;
  const infoRes = await env.DO.fetch(playerRequest("/info", userDo, "user", {}));
  const info = (await infoRes.json()) as { initialized: boolean };

  let imported: unknown = null;
  if (!info.initialized && guestId && guestSecret) {
    // First sign-in on this account: carry the guest's progress over.
    const claimRes = await env.DO.fetch(playerRequest("/claim", `g:${guestId}`, "guest", { into: userDo }, guestSecret));
    if (claimRes.ok) {
      const claimed = (await claimRes.json()) as { data: unknown };
      imported = claimed.data;
    }
  }
  return env.DO.fetch(playerRequest("/session", userDo, "user", { ...body, displayName, import: imported }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/ping") return Response.json({ ok: true, now: Date.now() });

    if (path === "/config" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          machines: MACHINE_LISTINGS,
          machineConfigs: Object.fromEntries(Object.values(MACHINES).map((m) => [m.id, publicMachine(m)])),
          wheel: WHEEL_SEGMENTS.map((s) => s.amount),
          store: STORE_PACKS,
          jackpot: jackpotState(Date.now()),
        }),
        { headers: JSON_HEADERS },
      );
    }

    if (!PLAYER_ROUTES.has(path)) return jsonError(404, "not_found", "Not found");
    if (request.method !== "POST") return jsonError(405, "method_not_allowed", "Use POST");

    const userId = request.headers.get("X-Rork-User-Id");
    const displayName = request.headers.get("X-Rork-User-Name") ?? request.headers.get("X-Rork-User-Email");
    const rawGuestId = request.headers.get("X-Guest-Id");
    const guestId = rawGuestId && GUEST_ID_RE.test(rawGuestId) ? rawGuestId : null;
    const guestSecret = request.headers.get("X-Guest-Secret") ?? "";

    let body: Record<string, unknown> = {};
    try {
      const text = await request.text();
      if (text.length > 4096) return jsonError(413, "too_large", "Request too large");
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return jsonError(400, "bad_json", "Invalid request body");
    }
    delete body.import;

    try {
      if (path === "/session") {
        return await handleSession(env, userId, displayName, guestId, guestSecret, body);
      }
      if (userId) return await env.DO.fetch(playerRequest(path, `u:${userId}`, "user", body));
      if (!guestId) return jsonError(400, "no_identity", "Missing guest identity");
      return await env.DO.fetch(playerRequest(path, `g:${guestId}`, "guest", body, guestSecret));
    } catch (err) {
      console.error("route error", path, err instanceof Error ? err.message : String(err));
      return jsonError(500, "server_error", "Something went wrong");
    }
  },
} satisfies ExportedHandler<Env>;
