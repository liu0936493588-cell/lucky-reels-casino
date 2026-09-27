import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ACCESS_TOKEN_KEY,
  APP_KEY,
  AUTH_CHANGED_EVENT,
  AUTH_URL,
  type AuthUser,
  clearTokens,
  CODE_VERIFIER_KEY,
  decodeToken,
  REFRESH_TOKEN_KEY,
  refreshAccessToken,
} from "@/lib/authTokens";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(hash));
}

function userFromStorage(): AuthUser | null {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) return null;
  const decoded = decodeToken(token);
  if (!decoded) return null;
  return decoded.user;
}

/** Optional Google / Apple sign-in via Rork Auth. Guests can always play without it. */
export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const listenerRef = useRef<((event: MessageEvent) => void) | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const token = localStorage.getItem(ACCESS_TOKEN_KEY);
        const decoded = token ? decodeToken(token) : null;
        if (decoded && decoded.exp * 1000 > Date.now() + 60_000) {
          setUser(decoded.user);
          return;
        }
        if (localStorage.getItem(REFRESH_TOKEN_KEY)) {
          const fresh = await refreshAccessToken();
          if (fresh) setUser(decodeToken(fresh)?.user ?? null);
          else if (decoded) setUser(decoded.user);
        }
      } finally {
        setIsLoading(false);
      }
    };
    void run();
    const onChange = () => setUser(userFromStorage());
    window.addEventListener(AUTH_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
      if (listenerRef.current) window.removeEventListener("message", listenerRef.current);
    };
  }, []);

  const exchangeCode = useCallback(async (code: string) => {
    const verifier = localStorage.getItem(CODE_VERIFIER_KEY);
    if (!verifier) {
      setError("Sign-in expired. Please try again.");
      return;
    }
    localStorage.removeItem(CODE_VERIFIER_KEY);
    const response = await fetch(`${AUTH_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_key: APP_KEY, code, code_verifier: verifier }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `Sign in failed (${response.status})`);
      return;
    }
    const data = (await response.json()) as { access_token: string; refresh_token: string; user?: AuthUser };
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    setUser(decodeToken(data.access_token)?.user ?? data.user ?? null);
  }, []);

  const signIn = useCallback(
    async (provider: "google" | "apple") => {
      setIsSigningIn(true);
      setError(null);
      try {
        const verifier = generateCodeVerifier();
        const challenge = await generateCodeChallenge(verifier);
        localStorage.setItem(CODE_VERIFIER_KEY, verifier);

        const isPreview = window.parent !== window;
        const body: Record<string, unknown> = {
          app_key: APP_KEY,
          provider,
          code_challenge: challenge,
          target: "web",
          env: isPreview ? "preview" : "production",
        };
        if (isPreview) body.app_path = "web-lucky-reels-casino";

        const response = await fetch(`${AUTH_URL}/oauth/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          localStorage.removeItem(CODE_VERIFIER_KEY);
          const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
          setError(errorBody.error ?? `Sign in failed (${response.status})`);
          return;
        }
        const { auth_url } = (await response.json()) as { auth_url: string };

        if (isPreview) {
          const popup = window.open(auth_url, "_blank", "width=500,height=650");
          if (!popup) {
            setError("Popup blocked. Please allow popups for this site.");
            localStorage.removeItem(CODE_VERIFIER_KEY);
            return;
          }
          await new Promise<void>((resolve) => {
            const onMessage = async (event: MessageEvent) => {
              if (event.data?.type !== "rork_auth_callback") return;
              window.removeEventListener("message", onMessage);
              listenerRef.current = null;
              clearInterval(pollTimer);
              const code = event.data.code as string | undefined;
              if (code) await exchangeCode(code);
              resolve();
            };
            listenerRef.current = onMessage;
            window.addEventListener("message", onMessage);
            const pollTimer = setInterval(() => {
              if (popup.closed) {
                clearInterval(pollTimer);
                setTimeout(() => {
                  window.removeEventListener("message", onMessage);
                  listenerRef.current = null;
                  resolve();
                }, 800);
              }
            }, 500);
          });
        } else {
          window.location.href = auth_url;
        }
      } catch (err) {
        console.error("Sign in failed:", err instanceof Error ? err.message : "unknown");
        setError("Sign in failed. Please try again.");
        localStorage.removeItem(CODE_VERIFIER_KEY);
      } finally {
        setIsSigningIn(false);
      }
    },
    [exchangeCode],
  );

  const signOut = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { user, isLoading, isSigningIn, error, signIn, signOut, clearError, exchangeCode };
});
