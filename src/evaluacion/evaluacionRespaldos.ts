import type { EvaluacionEntregable, EvaluacionEntregableRespaldo } from "@/context/AppDataContext";

export type RespaldoEvaluacionEntregableTipo = EvaluacionEntregableRespaldo["tipo"];

export const TIPO_RESPALDO_LABEL: Record<RespaldoEvaluacionEntregableTipo, string> = {
  LINK: "Enlace",
  ARCHIVO_REFERENCIADO: "Archivo referenciado",
  NOTA: "Nota",
  ARCHIVO_SUPABASE: "Archivo en Supabase",
};

export const AYUDA_ARCHIVO_REFERENCIADO =
  "El archivo real deberá quedar guardado en la carpeta del proyecto o en Supabase Storage cuando se active.";

export function newRespaldoId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `resp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newEvaluacionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeUrl(url?: string): string | undefined {
  const u = (url ?? "").trim();
  if (!u || u.toLowerCase().startsWith("data:")) return undefined;
  return u;
}

export function normalizeRespaldoEvaluacion(raw: unknown): EvaluacionEntregableRespaldo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as EvaluacionEntregableRespaldo;
  const tipo = r.tipo;
  if (
    tipo !== "LINK" &&
    tipo !== "ARCHIVO_REFERENCIADO" &&
    tipo !== "NOTA" &&
    tipo !== "ARCHIVO_SUPABASE"
  ) {
    return null;
  }
  const nombre = String(r.nombre ?? "").trim();
  if (!nombre) return null;
  const storage_path =
    r.storage_path != null && String(r.storage_path).trim()
      ? String(r.storage_path).trim()
      : undefined;
  if (tipo === "ARCHIVO_SUPABASE" && !storage_path) return null;
  return {
    id: String(r.id ?? "").trim() || newRespaldoId(),
    nombre,
    tipo,
    descripcion: r.descripcion != null && String(r.descripcion).trim() ? String(r.descripcion).trim() : undefined,
    url: sanitizeUrl(r.url),
    nombre_archivo:
      r.nombre_archivo != null && String(r.nombre_archivo).trim()
        ? String(r.nombre_archivo).trim()
        : undefined,
    mime_type:
      r.mime_type != null && String(r.mime_type).trim() ? String(r.mime_type).trim() : undefined,
    size_bytes:
      r.size_bytes != null && Number.isFinite(Number(r.size_bytes)) ? Number(r.size_bytes) : undefined,
    storage_path,
    created_at: String(r.created_at ?? "").trim() || new Date().toISOString(),
  };
}

export function normalizeEvaluacionesEntregablesCarga(rows: unknown): EvaluacionEntregable[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const ev = raw as EvaluacionEntregable;
    const respaldos = Array.isArray(ev.respaldos)
      ? ev.respaldos.map(normalizeRespaldoEvaluacion).filter((x): x is EvaluacionEntregableRespaldo => x != null)
      : [];
    return { ...ev, respaldos };
  });
}

export type RespaldoEvaluacionDraft = {
  tipo: RespaldoEvaluacionEntregableTipo;
  nombre: string;
  descripcion: string;
  url: string;
  nombre_archivo: string;
};

export function crearRespaldoDesdeDraft(draft: RespaldoEvaluacionDraft): EvaluacionEntregableRespaldo | null {
  const nombre = draft.nombre.trim();
  if (!nombre) return null;
  const ts = new Date().toISOString();
  const base = {
    id: newRespaldoId(),
    nombre,
    descripcion: draft.descripcion.trim() || undefined,
    created_at: ts,
  };

  if (draft.tipo === "LINK") {
    const url = sanitizeUrl(draft.url);
    if (!url) return null;
    return { ...base, tipo: "LINK", url };
  }
  if (draft.tipo === "ARCHIVO_REFERENCIADO") {
    const nombre_archivo = draft.nombre_archivo.trim() || nombre;
    return { ...base, tipo: "ARCHIVO_REFERENCIADO", nombre_archivo };
  }
  return { ...base, tipo: "NOTA" };
}
