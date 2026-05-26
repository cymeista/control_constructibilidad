import { APP_DATA_STORAGE_KEY } from "./storageKeys";
import * as storage from "./localStorageAdapter";

export function loadAppData<T>(fallback: T): T {
  try {
    const raw = storage.getItem(APP_DATA_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore parse/storage errors and fallback
  }
  return fallback;
}

export function saveAppData<T>(data: T): void {
  storage.setItem(APP_DATA_STORAGE_KEY, JSON.stringify(data));
}

export function clearAppData(): void {
  storage.removeItem(APP_DATA_STORAGE_KEY);
}

export function replaceAppData<T>(data: T): void {
  saveAppData(data);
}
