import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Fade out the inline boot splash once React has painted.
requestAnimationFrame(() => {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.style.opacity = "0";
  setTimeout(() => boot.remove(), 450);
});

// Installable PWA: only register the service worker on the real site, not inside the preview frame.
if ("serviceWorker" in navigator && import.meta.env.PROD && window.parent === window) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("Service worker registration failed", err instanceof Error ? err.message : "unknown");
    });
  });
}
