import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { LoadingScreen } from "@/components/casino/LoadingScreen";
import { useAuth } from "@/hooks/useAuth";

/** Production OAuth return route: exchanges ?code= for tokens, then back to the lobby. */
export default function AuthCallback() {
  const { exchangeCode } = useAuth();
  const navigate = useNavigate();
  const ran = useRef<boolean>(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      navigate("/", { replace: true });
      return;
    }
    void exchangeCode(code).finally(() => navigate("/", { replace: true }));
  }, [exchangeCode, navigate]);

  return <LoadingScreen label="Signing in" />;
}
