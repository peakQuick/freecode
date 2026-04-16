"use client";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    pywebview?: { api: { minimize(): void; toggle_maximize(): void; close(): void } };
  }
}

export default function TitleBar() {
  const [mode, setMode] = useState<"pywebview" | "browser" | "unknown">("unknown");

  useEffect(() => {
    // Check for pywebview immediately or wait for the ready event
    if (window.pywebview) {
      setMode("pywebview");
      return;
    }
    const onReady = () => setMode("pywebview");
    window.addEventListener("pywebviewready", onReady);

    // If not pywebview within 500ms, show a browser-mode titlebar
    const timer = setTimeout(() => {
      if (!window.pywebview) setMode("browser");
    }, 500);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pywebviewready", onReady);
    };
  }, []);

  if (mode === "unknown") return null;

  if (mode === "browser") {
    // Minimal drag-region-only bar in browser mode (no frameless controls needed)
    return (
      <div className="titlebar">
        <div className="titlebar-drag" />
        <span style={{ color: "#222", fontSize: 10, padding: "0 14px", alignSelf: "center", textTransform: "lowercase", letterSpacing: "0.05em" }}>
          freecode
        </span>
      </div>
    );
  }

  // pywebview mode — full frameless controls
  const api = window.pywebview!.api;
  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      <div className="titlebar-controls">
        <button
          className="tb-btn tb-min"
          title="Minimize"
          onClick={() => { try { api.minimize(); } catch {} }}
        >
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button
          className="tb-btn tb-max"
          title="Maximize"
          onClick={() => { try { api.toggle_maximize(); } catch {} }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9"><rect x=".5" y=".5" width="8" height="8" fill="none" stroke="currentColor" /></svg>
        </button>
        <button
          className="tb-btn tb-close"
          title="Close"
          onClick={() => { try { api.close(); } catch {} }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
