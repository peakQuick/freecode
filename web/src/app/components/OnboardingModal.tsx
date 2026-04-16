"use client";

import { useState } from "react";
import styles from "./OnboardingModal.module.css";

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (apiKey: string, settingsFolder: string) => void;
  initialApiKey?: string;
  initialSettingsFolder?: string;
}

export default function OnboardingModal({
  isOpen,
  onComplete,
  initialApiKey = "",
  initialSettingsFolder = "",
}: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [settingsFolder, setSettingsFolder] = useState(initialSettingsFolder);
  const [error, setError] = useState("");

  const handleNext = () => {
    if (step === 1) {
      if (!apiKey.trim()) {
        setError("API Key is required");
        return;
      }
      setError("");
      setStep(2);
    }
  };

  const handleComplete = () => {
    if (!settingsFolder.trim()) {
      setError("Settings folder is required");
      return;
    }
    setError("");
    onComplete(apiKey, settingsFolder);
  };

  const handleFolderBrowse = async () => {
    // This will be handled by the parent or a native dialog
    // For now, we'll rely on user typing
    // TODO: integrate with file picker if available
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>FreeCode Setup</h2>

        {step === 1 ? (
          <div className={styles.step}>
            <label className={styles.label}>API Key</label>
            <p className={styles.description}>Enter your Gemini API key from https://aistudio.google.com</p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError("");
              }}
              placeholder="paste your API key here"
              className={styles.input}
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.buttons}>
              <button onClick={handleNext} className={styles.buttonPrimary}>
                Next →
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.step}>
            <label className={styles.label}>FreeCode Settings Folder</label>
            <p className={styles.description}>Where to store settings, sessions, and project data</p>
            <div className={styles.folderInputGroup}>
              <input
                type="text"
                value={settingsFolder}
                onChange={(e) => {
                  setSettingsFolder(e.target.value);
                  setError("");
                }}
                placeholder="e.g., C:\Users\YourName\freecode"
                className={styles.input}
                autoFocus
              />
              <button onClick={handleFolderBrowse} className={styles.buttonBrowse} title="Browse for folder">
                📁
              </button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.buttons}>
              <button onClick={() => setStep(1)} className={styles.buttonSecondary}>
                ← Back
              </button>
              <button onClick={handleComplete} className={styles.buttonPrimary}>
                Complete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
