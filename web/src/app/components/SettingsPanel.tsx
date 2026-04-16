"use client";

import { useState } from "react";
import styles from "./SettingsPanel.module.css";
import { getApiKey, saveApiKey, getSettingsFolder, saveSettingsFolder, sendConfigToBackend } from "../lib/config";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState(getApiKey() || "");
  const [settingsFolder, setSettingsFolder] = useState(getSettingsFolder() || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSave = async () => {
    setError("");
    setSuccess("");

    if (!apiKey.trim()) {
      setError("API Key is required");
      return;
    }

    if (!settingsFolder.trim()) {
      setError("Settings folder is required");
      return;
    }

    const success = await sendConfigToBackend(apiKey, settingsFolder);
    if (success) {
      saveApiKey(apiKey);
      saveSettingsFolder(settingsFolder);
      setSuccess("Settings saved!");
      setTimeout(onClose, 1000);
    } else {
      setError("Failed to save settings");
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <label className={styles.label}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.section}>
            <label className={styles.label}>Settings Folder</label>
            <input
              type="text"
              value={settingsFolder}
              onChange={(e) => setSettingsFolder(e.target.value)}
              className={styles.input}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}
          {success && <p className={styles.success}>{success}</p>}

          <div className={styles.buttons}>
            <button onClick={onClose} className={styles.buttonSecondary}>
              Cancel
            </button>
            <button onClick={handleSave} className={styles.buttonPrimary}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
