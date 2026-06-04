/**
 * Snapshot híbrido AppData en Supabase (tabla app_data_snapshots, fila id = "main").
 * Solo clave publishable; sin service_role ni Auth en esta fase.
 */

import {
  APP_DATA_BACKUP_VERSION,
  normalizeBackupImport,
  type AppDataBackupSlice,
} from "@/persistence/appDataBackup";
import { getSupabaseClient, isSupabaseConfigured } from "@/supabase/supabaseClient";

export { isSupabaseConfigured };

const SNAPSHOT_ID = "main";

export type SupabaseSnapshotMeta = {
  backup_version: number | null;
  updated_at: string | null;
};

type SnapshotRow = {
  id: string;
  data: unknown;
  backup_version: number | null;
  updated_at: string | null;
};

function normalizeSnapshotDataField(raw: unknown): AppDataBackupSlice {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return normalizeBackupImport(raw as Record<string, unknown>);
  }
  return normalizeBackupImport({});
}

export async function fetchSupabaseSnapshotMeta(): Promise<SupabaseSnapshotMeta | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from("app_data_snapshots")
    .select("backup_version, updated_at")
    .eq("id", SNAPSHOT_ID)
    .maybeSingle();

  if (error || !data) return null;

  return {
    backup_version:
      data.backup_version != null && Number.isFinite(Number(data.backup_version))
        ? Number(data.backup_version)
        : null,
    updated_at: data.updated_at != null ? String(data.updated_at) : null,
  };
}

export async function testSupabaseConnection(): Promise<
  { ok: true; meta: SupabaseSnapshotMeta | null } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error:
        "Supabase no configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local.",
    };
  }

  const sb = getSupabaseClient();
  if (!sb) {
    return { ok: false, error: "No se pudo inicializar el cliente Supabase." };
  }

  const { error } = await sb
    .from("app_data_snapshots")
    .select("id")
    .eq("id", SNAPSHOT_ID)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  const meta = await fetchSupabaseSnapshotMeta();
  return { ok: true, meta };
}

export async function loadAppDataFromSupabase(): Promise<
  | { ok: true; data: AppDataBackupSlice; meta: SupabaseSnapshotMeta }
  | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase no configurado." };
  }

  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Cliente Supabase no disponible." };

  const { data: row, error } = await sb
    .from("app_data_snapshots")
    .select("data, backup_version, updated_at")
    .eq("id", SNAPSHOT_ID)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!row || row.data == null) {
    return { ok: false, error: 'No existe snapshot "main" en app_data_snapshots.' };
  }

  const normalized = normalizeSnapshotDataField(row.data);
  const meta: SupabaseSnapshotMeta = {
    backup_version:
      row.backup_version != null && Number.isFinite(Number(row.backup_version))
        ? Number(row.backup_version)
        : null,
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
  };

  return { ok: true, data: normalized, meta };
}

export async function saveAppDataToSupabase(
  appData: Record<string, unknown>,
): Promise<{ ok: true; meta: SupabaseSnapshotMeta } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase no configurado." };
  }

  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Cliente Supabase no disponible." };

  const dataPayload = normalizeBackupImport(appData);
  const updated_at = new Date().toISOString();

  const row: SnapshotRow = {
    id: SNAPSHOT_ID,
    data: dataPayload,
    backup_version: APP_DATA_BACKUP_VERSION,
    updated_at,
  };

  const { error } = await sb.from("app_data_snapshots").upsert(row, { onConflict: "id" });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    meta: { backup_version: APP_DATA_BACKUP_VERSION, updated_at },
  };
}

/** Alias explícito: subir AppData local actual al snapshot main. */
export async function uploadLocalAppDataToSupabase(
  appData: Record<string, unknown>,
): Promise<{ ok: true; meta: SupabaseSnapshotMeta } | { ok: false; error: string }> {
  return saveAppDataToSupabase(appData);
}
