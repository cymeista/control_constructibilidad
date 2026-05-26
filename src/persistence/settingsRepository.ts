import { APP_SETTINGS_STORAGE_KEY } from "./storageKeys";
import * as storage from "./localStorageAdapter";

export function loadSettings<T>(fallback: T): T {
  try {
    const raw = storage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore parse/storage errors and fallback
  }
  return fallback;
}

export function saveSettings<T>(settings: T): void {
  storage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
