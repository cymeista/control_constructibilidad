import type { Entregable } from "@/context/AppDataContext";

/** Campos mínimos para avance teórico y estado automático (Bloques 2 y 3). */
export type EntregableSeguimientoPayload = {
  tipo_flujo: "CON_REVISIONES" | "SIN_REVISIONES";
  fecha_inicio: string;
  fecha_termino: string;
  fecha_revA?: string | null;
  fecha_revB?: string | null;
  fecha_revP?: string | null;
  avance_real: number;
};

export type EstadoCalculado = Entregable["estado"];

const EPS = 1e-9;

/** Brecha en escala 0–1 (= puntos porcentuales / 100). */
const BRECHA_EN_PLAZO_PP = 0.05;
const BRECHA_ADELANTADO_PP = 0.05;
const BRECHA_RETRASADO_PP = 0.2;

/** Años aceptados para fechas de seguimiento de entregables (formulario + cálculo de avance teórico). */
export const ENTREGABLE_SEGUIMIENTO_YEAR_MIN = 2020;
export const ENTREGABLE_SEGUIMIENTO_YEAR_MAX = 2035;

/**
 * ISO estricto `YYYY-MM-DD` con año de 4 dígitos en rango permitido y fecha de calendario válida.
 * Rechaza años tipo 0026, 026, 02026 (no coinciden el patrón o el round-trip UTC).
 */
export function dateToUtcEpoch(value?: string | null): number | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [ys, ms, ds] = t.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < ENTREGABLE_SEGUIMIENTO_YEAR_MIN || y > ENTREGABLE_SEGUIMIENTO_YEAR_MAX) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const utc = Date.UTC(y, m - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return utc;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function progressByDateRange(today: number, start: number, end: number): number {
  if (today < start) return 0;
  if (today > end) return 1;
  const duration = end - start;
  if (duration <= 0) return today >= end ? 1 : 0;
  return clamp01((today - start) / duration);
}

export function calculateAvanceTeorico(payload: EntregableSeguimientoPayload): number {
  const inicio = dateToUtcEpoch(payload.fecha_inicio);
  const termino = dateToUtcEpoch(payload.fecha_termino);
  if (inicio == null || termino == null) return 0;

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  if (today < inicio) return 0;
  if (today > termino) return 1;

  if (payload.tipo_flujo === "SIN_REVISIONES") {
    return progressByDateRange(today, inicio, termino);
  }

  const revB = dateToUtcEpoch(payload.fecha_revB);
  if (revB == null) return 0;

  if (today <= revB) {
    const tramo = progressByDateRange(today, inicio, revB);
    return clamp01(tramo * 0.85);
  }

  const tramoFinal = progressByDateRange(today, revB, termino);
  return clamp01(0.85 + tramoFinal * 0.15);
}

export function resolveEstado(
  payload: EntregableSeguimientoPayload,
  avanceTeorico: number,
): EstadoCalculado {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAhead = today + 7 * 24 * 60 * 60 * 1000;
  const avanceReal = Number(payload.avance_real || 0);
  const isCompleted = avanceReal >= 1 - EPS;
  if (isCompleted) return "Completado";

  /** Clasificación por brecha real − teórico (umbrales ±5 pp; retrasado fuerte < −20 pp). */
  const resolveByDiff = (): EstadoCalculado => {
    const brecha = avanceReal - avanceTeorico;

    if (avanceReal + EPS < avanceTeorico) {
      if (brecha <= -BRECHA_RETRASADO_PP) return "Retrasado";
      if (brecha < -BRECHA_EN_PLAZO_PP) return "Leve Retraso";
      return "En Plazo";
    }

    if (brecha > BRECHA_ADELANTADO_PP) return "Adelantado";
    return "En Plazo";
  };

  if (payload.tipo_flujo === "SIN_REVISIONES") {
    const termino = dateToUtcEpoch(payload.fecha_termino);
    if (termino == null) return resolveByDiff();
    if (Math.abs(avanceReal) <= EPS && Math.abs(avanceTeorico) <= EPS) return "No Iniciado";
    if (today > termino && avanceReal < 1 - EPS) return "Atraso Crítico: Entrega Final";
    if (termino >= today && termino <= sevenDaysAhead && avanceReal < 1 - EPS) {
      return "Riesgo: Entrega Final";
    }
    return resolveByDiff();
  }

  if (Math.abs(avanceReal) <= EPS && Math.abs(avanceTeorico) <= EPS) return "No Iniciado";

  const milestones: Array<{
    label: "Rev.A" | "Rev.B" | "Rev.P";
    date: number | null;
    threshold: number;
  }> = [
    { label: "Rev.A", date: dateToUtcEpoch(payload.fecha_revA), threshold: 0.5 },
    { label: "Rev.B", date: dateToUtcEpoch(payload.fecha_revB), threshold: 0.8 },
    { label: "Rev.P", date: dateToUtcEpoch(payload.fecha_revP), threshold: 1.0 },
  ];

  for (const milestone of milestones) {
    if (milestone.date != null && today > milestone.date && avanceReal + EPS < milestone.threshold) {
      return `Atraso Crítico: ${milestone.label}` as EstadoCalculado;
    }
  }

  const riesgoCandidates = milestones
    .filter((m) => m.date != null && m.date >= today && m.date <= sevenDaysAhead && avanceReal + EPS < m.threshold)
    .sort((a, b) => (a.date as number) - (b.date as number));
  if (riesgoCandidates.length > 0) {
    return `Riesgo: ${riesgoCandidates[0].label}` as EstadoCalculado;
  }

  return resolveByDiff();
}

export function entregableToSeguimientoPayload(
  e: Entregable,
  avanceRealOverride: number,
): EntregableSeguimientoPayload {
  return {
    tipo_flujo: e.tipo_flujo === "SIN_REVISIONES" ? "SIN_REVISIONES" : "CON_REVISIONES",
    fecha_inicio: e.fecha_inicio,
    fecha_termino: e.fecha_termino,
    fecha_revA: e.fecha_revA,
    fecha_revB: e.fecha_revB,
    fecha_revP: e.fecha_revP,
    avance_real: avanceRealOverride,
  };
}

/** Estado coherente con fechas y avance de hoy (misma lógica que al guardar avance / formulario). */
export function resolverEstadoVisualEntregable(
  entregable: Entregable,
  avanceRealOverride?: number,
): EstadoCalculado {
  const avanceReal = avanceRealOverride ?? entregable.avance_real;
  const payload = entregableToSeguimientoPayload(entregable, avanceReal);
  const avanceTeorico = calculateAvanceTeorico(payload);
  return resolveEstado(payload, avanceTeorico);
}

/** Recalcula avance_teorico y estado tras cambiar avance_real (0..1). No modifica presupuesto ni consumos. */
export function recalcularSeguimientoTrasAvanceReal(
  entregable: Entregable,
  avanceReal01: number,
): Pick<Entregable, "avance_real" | "avance_teorico" | "estado"> {
  const clamped = Math.max(0, Math.min(1, avanceReal01));
  const payload = entregableToSeguimientoPayload(entregable, clamped);
  const avanceTeorico = calculateAvanceTeorico(payload);
  const estado = resolveEstado(payload, avanceTeorico);
  return { avance_real: clamped, avance_teorico: avanceTeorico, estado };
}
