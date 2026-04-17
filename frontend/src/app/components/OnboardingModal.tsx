"use client";

import { useState } from "react";
import styles from "./OnboardingModal.module.css";

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (apiKey: string, settingsFolder: string) => void;
  onBrowse?: () => Promise<string>;
  initialApiKey?: string;
  initialSettingsFolder?: string;
}

function getDefaultSettingsFolder(): string {
  if (typeof window === "undefined") return "~/.freecode";
  // Try to detect OS from userAgent
  const isWindows = navigator.userAgent.includes("Windows");
  if (isWindows) {
    return "%USERPROFILE%\\.freecode";
  }
  return "~/.freecode";
}

export default function OnboardingModal({
  isOpen,
  onComplete,
  onBrowse,
  initialApiKey = "",
  initialSettingsFolder = "",
}: OnboardingModalProps) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [settingsFolder, setSettingsFolder] = useState(
    initialSettingsFolder || getDefaultSettingsFolder()
  );
  const [error, setError] = useState("");
  const [browsing, setBrowsing] = useState(false);

  const handleBrowse = async () => {
    if (!onBrowse) return;
    setBrowsing(true);
    try {
      const path = await onBrowse();
      if (path) setSettingsFolder(path);
    } finally {
      setBrowsing(false);
    }
  };

  const handleComplete = () => {
    if (!apiKey.trim()) {
      setError("API Key is required");
      return;
    }
    setError("");
    onComplete(apiKey, settingsFolder);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.onboardingHeader}>
          <h2 className={styles.title}>Welcome to FreeCode</h2>
          <p className={styles.subtitle}>Let's get you set up in seconds.</p>
        </div>

        <div className={styles.step}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Gemini API Key</label>
            <p className={styles.description}>
              FreeCode uses Gemini for reasoning. Get your free key from{" "}
              <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className={styles.link}>
                Google AI Studio
              </a>
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleComplete()}
              placeholder="Paste your API key here..."
              className={styles.input}
              autoFocus
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Settings Folder</label>
            <p className={styles.description}>
              Where FreeCode stores your config and session history.
            </p>
            <div className={styles.folderRow}>
              <input
                type="text"
                value={settingsFolder}
                onChange={(e) => setSettingsFolder(e.target.value)}
                placeholder="~/.freecode"
                className={styles.input}
              />
              {onBrowse && (
                <button
                  onClick={handleBrowse}
                  disabled={browsing}
                  className={styles.browseBtn}
                  type="button"
                >
                  {browsing ? "…" : "Browse"}
                </button>
              )}
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.onboardingFooter}>
            <button onClick={handleComplete} className={styles.buttonPrimary}>
              Get Started →
            </button>
            <p className={styles.footerNote}>
              Config will be saved to {settingsFolder}/freecode.json
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
