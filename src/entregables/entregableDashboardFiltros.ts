/**
 * Filtros y clasificación de entregables alineados con Dashboard / Gestión de Crisis (Bloque seguimiento).
 * Extraído para reutilizar en Reporte Ejecutivo sin duplicar reglas.
 *
 * Nota: la inclusión de NO_INICIADO con fecha_inicio ≤ hoy es solo clasificación de Dashboard;
 * no modifica `entregable.estado` persistido ni `resolveEstado`.
 */

import type { Entregable } from "@/context/AppDataContext";
import { diffCalendarDaysFromToday } from "@/lib/localDate";

export type EntregableDonutSlice =
  | "CRITICO"
  | "RIESGO"
  | "EN_PLAZO"
  | "ADELANTADO"
  | "NO_INICIADO"
  | "COMPLETADO";

/** Horizonte de «Próximos a iniciar» (días calendario desde mañana inclusive hasta hoy+N). */
export const DASHBOARD_PROXIMOS_INICIO_DIAS = 21;

const EPS_AVANCE = 1e-9;

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

/** Completados visibles en filtro «En control» (ACTIVOS) del Dashboard durante N días. */
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

function entregableEstaCancelado(e: Entregable): boolean {
  return e.cancelado === true;
}

function entregableEstaPausado(e: Entregable): boolean {
  return e.cancelado !== true && e.pausado === true;
}

/**
 * NO_INICIADO con fecha_inicio ya alcanzada (hoy o pasado) entra a «En control» (ACTIVOS) del Dashboard
 * sin persistir cambio de estado. No aplica a cancelados ni pausados.
 */
export function entregableNoIniciadoEntraActivosPorFecha(e: Entregable): boolean {
  if (entregableEstaCancelado(e)) return false;
  if (entregableEstaPausado(e)) return false;
  if (estadoToDonutSlice(e.estado) !== "NO_INICIADO") return false;
  const diff = diffCalendarDaysFromToday(e.fecha_inicio);
  if (diff == null) return false;
  return diff <= 0;
}

/**
 * Misma regla que Dashboard con filtro «En control» (value interno ACTIVOS):
 * - excluye cancelados;
 * - excluye no iniciados futuros (o sin fecha válida);
 * - incluye no iniciados con fecha_inicio ≤ hoy (salvo pausados);
 * - excluye completados antiguos; incluye completados recientes (7 días).
 * No modifica estado persistido.
 */
export function entregableEsActivoDashboard(e: Entregable, nowDate: Date = new Date()): boolean {
  if (entregableEstaCancelado(e)) return false;

  const slice = estadoToDonutSlice(e.estado);
  if (slice === "NO_INICIADO") {
    return entregableNoIniciadoEntraActivosPorFecha(e);
  }
  if (slice !== "COMPLETADO") return true;
  return entregableEsCompletadoReciente(e, nowDate, 7);
}

/**
 * Próximos a iniciar: fecha_inicio estrictamente futura hasta hoy+21 días.
 * Hoy ya no entra (pasa a En control). Excluye cancelados.
 * Pausados no se listan como próximos a iniciar (condición operativa distinta).
 */
export function entregableEsProximoInicioDashboard(
  e: Entregable,
  horizonteDias: number = DASHBOARD_PROXIMOS_INICIO_DIAS,
): boolean {
  if (entregableEstaCancelado(e)) return false;
  if (entregableEstaPausado(e)) return false;
  const diff = diffCalendarDaysFromToday(e.fecha_inicio);
  if (diff == null) return false;
  return diff > 0 && diff <= horizonteDias;
}

/** Señal visual: inicio ya pasó y aún no hay avance real. No es estado persistido. */
export function entregableMuestraSenalSinAvanceDashboard(e: Entregable): boolean {
  if (entregableEstaCancelado(e)) return false;
  const diff = diffCalendarDaysFromToday(e.fecha_inicio);
  if (diff == null || diff >= 0) return false;
  const ar = Number(e.avance_real) || 0;
  return Math.abs(ar) <= EPS_AVANCE;
}

/** Orden ascendente por fecha_inicio (ISO); inválidas al final. */
export function compararEntregablesPorFechaInicioAsc(a: Entregable, b: Entregable): number {
  const da = (a.fecha_inicio ?? "").trim();
  const db = (b.fecha_inicio ?? "").trim();
  const va = diffCalendarDaysFromToday(da) != null;
  const vb = diffCalendarDaysFromToday(db) != null;
  if (va && !vb) return -1;
  if (!va && vb) return 1;
  if (!va && !vb) return 0;
  return da.localeCompare(db);
}
