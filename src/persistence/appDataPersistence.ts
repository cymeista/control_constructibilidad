import {
  backupHasRecognizedData,
  buildAppDataBackupPayload,
  normalizeBackupImport,
  type AppDataBackupSlice,
} from "@/persistence/appDataBackup";
import {
  loadAppDataFromSupabase,
  saveAppDataToSupabase,
  type SupabaseSnapshotMeta,
} from "@/persistence/supabaseAppDataRepository";
import { getSupabaseClient, isSupabaseConfigured } from "@/supabase/supabaseClient";

export type AppDataSource = "supabase" | "local";

export type AppDataSavePhase =
  | "idle"
  | "loading_supabase"
  | "connected"
  | "local_fallback"
  | "pending"
  | "saving"
  | "saved"
  | "error";

export type AppDataPersistenceState = {
  bootstrapDone: boolean;
  dataSource: AppDataSource;
  savePhase: AppDataSavePhase;
  snapshotMeta: SupabaseSnapshotMeta | null;
  localFallbackMessage: string | null;
  saveError: string | null;
  pendingSupabaseSave: boolean;
  /** Solo metadata: sin permiso ADMIN+Supabase para escribir snapshot. */
  writeBlockedHint: string | null;
};

export const APP_DATA_AUTOSAVE_DEBOUNCE_MS = 1500;

export const LOCAL_FALLBACK_MSG = "Usando respaldo local";

export function hashAppDataPayload(data: Record<string, unknown>): string {
  const payload = buildAppDataBackupPayload(data);
  const { backup_version: _v, exported_at: _e, ...collections } = payload;
  return JSON.stringify(collections);
}

export async function waitForSupabaseSession(maxMs: number): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb || maxMs <= 0) return;
  await Promise.race([
    sb.auth.getSession(),
    new Promise<void>((resolve) => setTimeout(resolve, maxMs)),
  ]);
}

export type BootstrapSupabaseResult =
  | { ok: true; slice: AppDataBackupSlice; meta: SupabaseSnapshotMeta }
  | { ok: false; error: string };

export async function tryBootstrapFromSupabase(): Promise<BootstrapSupabaseResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase no configurado." };
  }

  await waitForSupabaseSession(2000);

  const result = await loadAppDataFromSupabase();
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  if (!backupHasRecognizedData(result.data as unknown as Record<string, unknown>)) {
    return { ok: false, error: "Snapshot sin datos reconocidos." };
  }

  return { ok: true, slice: result.data, meta: result.meta };
}

export async function persistAppDataToSupabase(
  data: Record<string, unknown>,
): Promise<{ ok: true; meta: SupabaseSnapshotMeta } | { ok: false; error: string }> {
  return saveAppDataToSupabase(data);
}

export function sliceFromAppDataRecord(data: Record<string, unknown>): AppDataBackupSlice {
  return normalizeBackupImport(data);
}
