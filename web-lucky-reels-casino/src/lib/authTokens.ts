export const AUTH_URL = import.meta.env.EXPO_PUBLIC_RORK_AUTH_URL as string;
export const APP_KEY = import.meta.env.EXPO_PUBLIC_RORK_APP_KEY as string;

export const ACCESS_TOKEN_KEY = "rork:access_token";
export const REFRESH_TOKEN_KEY = "rork:refresh_token";
export const CODE_VERIFIER_KEY = "rork:pkce_verifier";
export const AUTH_CHANGED_EVENT = "lr-auth-changed";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/** Decodes a JWT payload without verifying it (the backend verifies). */
export function decodeToken(token: string): { user: AuthUser; exp: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(decodeURIComponent(escape(atob(base64)))) as Record<string, unknown>;
    return {
      user: {
        id: String(payload.sub ?? ""),
        email: String(payload.email ?? ""),
        name: typeof payload.name === "string" ? payload.name : undefined,
        picture: typeof payload.picture === "string" ? payload.picture : undefined,
      },
      exp: typeof payload.exp === "number" ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(CODE_VERIFIER_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

let refreshing: Promise<string | null> | null = null;

/** Exchanges the stored refresh token for a new access token. Single-flight. */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const stored = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!stored) return null;
    try {
      const response = await fetch(`${AUTH_URL}/oauth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_key: APP_KEY, refresh_token: stored }),
      });
      if (!response.ok) {
        if (response.status === 400 || response.status === 401) clearTokens();
        return null;
      }
      const { access_token } = (await response.json()) as { access_token: string };
      localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
      return access_token;
    } catch (err) {
      console.warn("Token refresh failed", err instanceof Error ? err.message : "unknown");
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Returns an access token that is valid for at least another minute, refreshing if needed. */
export async function getValidAccessToken(): Promise<string | null> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    const decoded = decodeToken(token);
    if (decoded && decoded.exp * 1000 - Date.now() > 60_000) return token;
  }
  if (localStorage.getItem(REFRESH_TOKEN_KEY)) return refreshAccessToken();
  return null;
}
