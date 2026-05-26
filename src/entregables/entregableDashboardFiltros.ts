/**
 * Filtros y clasificación de entregables alineados con Dashboard / Gestión de Crisis (Bloque seguimiento).
 * Extraído para reutilizar en Reporte Ejecutivo sin duplicar reglas.
 */

import type { Entregable } from "@/context/AppDataContext";

export type EntregableDonutSlice =
  | "CRITICO"
  | "RIESGO"
  | "EN_PLAZO"
  | "ADELANTADO"
  | "NO_INICIADO"
  | "COMPLETADO";

export function estadoToDonutSlice(estado: Entregable["estado"]): EntregableDonutSlice {
  const s = String(estado);
  if (s === "NO_INICIADO" || s === "No Iniciado") return "NO_INICIADO";
  if (s === "COMPLETADO" || s === "Completado") return "COMPLETADO";
  if (s === "ADELANTADO" || s === "Adelantado") return "ADELANTADO";
  if (s === "EN_PLAZO" || s === "En Plazo" || s === "OK") return "EN_PLAZO";
  if (s === "CRITICO" || s.startsWith("Atraso Crítico")) return "CRITICO";
  if (
    s === "RIESGO" ||
    s.startsWith("Riesgo:") ||
    s === "Leve Retraso" ||
    s === "Retrasado"
  ) {
    return "RIESGO";
  }
  return "EN_PLAZO";
}

function parseFechaIsoDiaMs(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).getTime();
  return Number.isFinite(t) ? t : null;
}

export function entregableEsCompletado(e: Entregable): boolean {
  const slice = estadoToDonutSlice(e.estado);
  return slice === "COMPLETADO" || (Number(e.avance_real) || 0) >= 1;
}

/** Completados visibles en filtro Activos del Dashboard durante N días. */
export function entregableEsCompletadoReciente(e: Entregable, nowDate: Date, dias = 7): boolean {
  if (!entregableEsCompletado(e)) return false;
  const baseMs =
    e.fecha_completado && String(e.fecha_completado).trim() !== ""
      ? parseFechaIsoDiaMs(String(e.fecha_completado))
      : null;
  const t = baseMs ?? new Date(String(e.updated_at ?? "")).getTime();
  if (!Number.isFinite(t)) return false;
  const threshold = nowDate.getTime() - dias * 86400000;
  return t >= threshold;
}

/**
 * Misma regla que Dashboard con filtro «Activos (predeterminado)»:
 * excluye no iniciados y completados antiguos; incluye completados recientes (7 días).
 */
export function entregableEsActivoDashboard(e: Entregable, nowDate: Date = new Date()): boolean {
  const slice = estadoToDonutSlice(e.estado);
  if (slice === "NO_INICIADO") return false;
  if (slice !== "COMPLETADO") return true;
  return entregableEsCompletadoReciente(e, nowDate, 7);
}
