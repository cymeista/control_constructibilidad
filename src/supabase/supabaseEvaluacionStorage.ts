import type { EvaluacionEntregableRespaldo } from "@/context/AppDataContext";
import type { AuthSource } from "@/security/authTypes";
import type { AppRole } from "@/security/localUsers";
import { getSupabaseClient, isSupabaseConfigured } from "@/supabase/supabaseClient";
import { newRespaldoId } from "@/evaluacion/evaluacionRespaldos";

export const EVALUACION_RESPALDOS_BUCKET = "evaluacion-respaldos";
export const EVALUACION_RESPALDO_MAX_BYTES = 10 * 1024 * 1024;
export const EVALUACION_RESPALDO_SIGNED_URL_SECONDS = 300;

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "png",
  "jpg",
  "jpeg",
]);

export const MSG_UPLOAD_RESPALDO_ADMIN =
  "Para subir archivos debes iniciar sesión como ADMIN y tener Supabase configurado.";

export function canUploadEvaluacionRespaldoStorage(
  authSource: AuthSource | null,
  role: AppRole | null,
): boolean {
  return isSupabaseConfigured() && authSource === "supabase" && role === "ADMIN";
}

export function sanitizeEvaluacionFileName(name: string): string {
  const base = (name ?? "archivo").trim() || "archivo";
  const cleaned = base
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
  return cleaned.slice(0, 120);
}

export function buildEvaluacionRespaldoStoragePath(
  evaluacionId: string,
  fileName: string,
): string {
  const eid = evaluacionId.trim();
  if (!eid) throw new Error("ID de evaluación inválido.");
  const safe = sanitizeEvaluacionFileName(fileName);
  return `evaluaciones/${eid}/${Date.now()}_${safe}`;
}

export function validateEvaluacionRespaldoFile(file: File): string | null {
  if (file.size > EVALUACION_RESPALDO_MAX_BYTES) {
    return `El archivo supera el máximo de ${EVALUACION_RESPALDO_MAX_BYTES / (1024 * 1024)} MB.`;
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return "Tipo de archivo no permitido. Use pdf, doc, docx, xls, xlsx, ppt, pptx, png, jpg o jpeg.";
  }
  return null;
}

export async function uploadEvaluacionRespaldoFile(
  evaluacionId: string,
  file: File,
  meta?: { nombre?: string; descripcion?: string },
): Promise<
  { ok: true; respaldo: EvaluacionEntregableRespaldo } | { ok: false; error: string }
> {
  const err = validateEvaluacionRespaldoFile(file);
  if (err) return { ok: false, error: err };

  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: MSG_UPLOAD_RESPALDO_ADMIN };

  const storage_path = buildEvaluacionRespaldoStoragePath(evaluacionId, file.name);
  const { error: upErr } = await sb.storage.from(EVALUACION_RESPALDOS_BUCKET).upload(storage_path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  const nombre = (meta?.nombre ?? "").trim() || file.name;
  const respaldo: EvaluacionEntregableRespaldo = {
    id: newRespaldoId(),
    nombre,
    tipo: "ARCHIVO_SUPABASE",
    descripcion: meta?.descripcion?.trim() || undefined,
    nombre_archivo: file.name,
    mime_type: file.type || undefined,
    size_bytes: file.size,
    storage_path,
    created_at: new Date().toISOString(),
  };

  return { ok: true, respaldo };
}

export async function createSignedUrlForEvaluacionRespaldo(
  storage_path: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const path = (storage_path ?? "").trim();
  if (!path) return { ok: false, error: "Sin ruta de almacenamiento." };

  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase no configurado." };

  const { data, error } = await sb.storage
    .from(EVALUACION_RESPALDOS_BUCKET)
    .createSignedUrl(path, EVALUACION_RESPALDO_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "No se pudo generar URL firmada." };
  }

  return { ok: true, url: data.signedUrl };
}

export async function deleteEvaluacionRespaldoStorageFile(
  storage_path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const path = (storage_path ?? "").trim();
  if (!path) return { ok: true };

  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase no configurado." };

  const { error } = await sb.storage.from(EVALUACION_RESPALDOS_BUCKET).remove([path]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function fmtRespaldoFileSize(bytes: number | undefined): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 })} KB`;
  return `${(n / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 2 })} MB`;
}
