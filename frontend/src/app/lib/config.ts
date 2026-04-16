// Configuration helpers for API key and settings folder

const API_KEY_KEY = "freecode:api_key";
const SETTINGS_FOLDER_KEY = "freecode:settings_folder";

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(API_KEY_KEY);
  } catch {
    return null;
  }
}

export function saveApiKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(API_KEY_KEY, key);
  } catch {
    console.error("Failed to save API key to localStorage");
  }
}

export function getSettingsFolder(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SETTINGS_FOLDER_KEY);
  } catch {
    return null;
  }
}

export function saveSettingsFolder(folder: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_FOLDER_KEY, folder);
  } catch {
    console.error("Failed to save settings folder to localStorage");
  }
}

export function hasOnboarded(): boolean {
  return !!getApiKey() && !!getSettingsFolder();
}

export async function sendConfigToBackend(
  apiKey: string,
  settingsFolder: string
): Promise<boolean> {
  try {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, settings_folder: settingsFolder }),
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to send config to backend:", error);
    return false;
  }
}
