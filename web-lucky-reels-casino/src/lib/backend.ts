import { getValidAccessToken } from "./authTokens";

/** Same-origin path to the Cloudflare backend. */
export const BACKEND_PATH = "/~api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const GUEST_KEY = "lr:guest";

interface GuestCreds {
  id: string;
  secret: string;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newGuest(): GuestCreds {
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : randomHex(16);
  const creds = { id, secret: randomHex(32) };
  localStorage.setItem(GUEST_KEY, JSON.stringify(creds));
  return creds;
}

function guestCreds(): GuestCreds {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GuestCreds;
      if (parsed.id && parsed.secret) return parsed;
    }
  } catch {
    /* fall through */
  }
  return newGuest();
}

/** Starts a brand-new guest profile (used when the old one was moved into an account). */
export function resetGuest(): void {
  newGuest();
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const guest = guestCreds();
  const token = await getValidAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Guest-Id": guest.id,
    "X-Guest-Secret": guest.secret,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BACKEND_PATH}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "network", "Can't reach the casino. Check your connection.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, "bad_response", "The casino is waking up. Try again in a moment.");
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, err.error ?? "error", err.message ?? "Something went wrong");
  }
  return data as T;
}

export function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}
