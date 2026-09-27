import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AgeGate } from "@/components/casino/AgeGate";
import { LevelUpModal } from "@/components/casino/LevelUpModal";
import { LoadingScreen } from "@/components/casino/LoadingScreen";
import { OutOfCoinsModal } from "@/components/casino/OutOfCoinsModal";
import { SettingsModal } from "@/components/casino/SettingsModal";
import { StoreModal } from "@/components/casino/StoreModal";
import { TutorialOverlay } from "@/components/casino/TutorialOverlay";
import { WheelModal } from "@/components/casino/WheelModal";
import { Toaster } from "@/components/ui/sonner";
import { fx } from "@/game/fx";
import { GameProvider, useGame } from "@/game/useGame";
import { AuthProvider } from "@/hooks/useAuth";

import AuthCallback from "./pages/AuthCallback";
import Lobby from "./pages/Lobby";
import NotFound from "./pages/NotFound";

// The machine (and the WebGL renderer) is only downloaded when a machine is opened.
const Machine = lazy(() => import("./pages/Machine"));

const queryClient = new QueryClient();

function FxCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    fx.attach(ref.current);
    return () => fx.detach();
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[75] h-full w-full" aria-hidden />;
}

function Shell() {
  const { ready, configError, sessionError, retryConfig, retrySession, ageConfirmed } = useGame();

  if (!ageConfirmed) return <AgeGate />;

  if (!ready) {
    const error = configError ?? sessionError;
    return (
      <LoadingScreen
        label="Entering the casino"
        error={error}
        onRetry={() => {
          if (configError) retryConfig();
          void retrySession();
        }}
      />
    );
  }

  return (
    <>
      <Suspense fallback={<LoadingScreen label="Loading machine" />}>
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/play/:machineId" element={<Machine />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <StoreModal />
      <SettingsModal />
      <WheelModal />
      <OutOfCoinsModal />
      <LevelUpModal />
      <TutorialOverlay />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <GameProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Shell />
          <FxCanvas />
          <Toaster position="top-center" theme="dark" richColors />
        </BrowserRouter>
      </GameProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
