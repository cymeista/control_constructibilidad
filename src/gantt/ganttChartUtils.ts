/**
 * Utilidades compartidas para vistas Gantt (solo lectura).
 * Extraídas de la carta Gantt de proyectos para reutilizar estilos de barra/fechas.
 */

import type { Entregable } from "@/context/AppDataContext";

export const GANTT_MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export interface GanttMonth {
  year: number;
  month: number;
  label: string;
  days: number;
  isTodayMonth: boolean;
}

export type GanttEstadoVisual =
  | "EN_PLAZO_OK"
  | "RIESGO"
  | "CRITICO"
  | "COMPLETADO_ADELANTADO"
  | "NO_INICIADO";

export const GANTT_LEGEND_COLORS: Record<GanttEstadoVisual, string> = {
  EN_PLAZO_OK: "#4F46E5",
  RIESGO: "#B45309",
  CRITICO: "#B91C1C",
  COMPLETADO_ADELANTADO: "#047857",
  NO_INICIADO: "#475569",
};

export function parseGanttDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function formatGanttDateCL(d: string): string {
  const date = parseGanttDate(d);
  return `${date.getDate()} ${GANTT_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function generateGanttMonths(minDate: Date, maxDate: Date): GanttMonth[] {
  const months: GanttMonth[] = [];
  const today = new Date();
  let d = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  while (d <= end) {
    const year = d.getFullYear();
    const month = d.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    months.push({
      year,
      month,
      label: `${GANTT_MONTH_NAMES[month]}-${year}`,
      days,
      isTodayMonth: today.getFullYear() === year && today.getMonth() === month,
    });
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

/** Avance en escala 0–100 (acepta 0–1 o 0–100 en datos). */
export function avanceRealPct100(avanceReal: number): number {
  const ar = Number(avanceReal);
  if (!Number.isFinite(ar)) return 0;
  if (ar > 1.0001) return Math.max(0, Math.min(100, ar));
  return Math.max(0, Math.min(100, ar * 100));
}

export type EstadoEjecucionEntregable = "COMPLETADO" | "EN_EJECUCION" | "POR_INICIAR";

export function estadoEjecucionDesdeAvance(avanceReal: number): EstadoEjecucionEntregable {
  const pct = avanceRealPct100(avanceReal);
  if (pct >= 100) return "COMPLETADO";
  if (pct > 0) return "EN_EJECUCION";
  return "POR_INICIAR";
}

export const ESTADO_EJECUCION_LABEL: Record<EstadoEjecucionEntregable, string> = {
  COMPLETADO: "Completado",
  EN_EJECUCION: "En ejecución",
  POR_INICIAR: "Por iniciar",
};

/** Color de barra según avance real (modelo operativo Gantt Profesionales). */
export function colorBarraPorAvance(avanceReal: number): string {
  const est = estadoEjecucionDesdeAvance(avanceReal);
  switch (est) {
    case "COMPLETADO":
      return GANTT_LEGEND_COLORS.COMPLETADO_ADELANTADO;
    case "EN_EJECUCION":
      return GANTT_LEGEND_COLORS.EN_PLAZO_OK;
    case "POR_INICIAR":
    default:
      return GANTT_LEGEND_COLORS.NO_INICIADO;
  }
}

export function normalizeEstadoParaColorGantt(estado: string): GanttEstadoVisual {
  const u = String(estado)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  if (u === "CRITICO" || u.includes("CRITICO")) return "CRITICO";
  if (u === "RIESGO" || u.includes("RIESGO")) return "RIESGO";
  if (
    u === "COMPLETADO" ||
    u === "ADELANTADO" ||
    u.includes("COMPLETADO") ||
    u.includes("ADELANTADO")
  ) {
    return "COMPLETADO_ADELANTADO";
  }
  if (u === "EN_PLAZO" || u === "OK" || u.includes("EN PLAZO")) return "EN_PLAZO_OK";
  if (u === "NO_INICIADO" || u.includes("NO INICIADO")) return "NO_INICIADO";
  return "NO_INICIADO";
}

export function getStatusBarColorEntregable(estado: Entregable["estado"]): string {
  return GANTT_LEGEND_COLORS[normalizeEstadoParaColorGantt(String(estado))];
}

export function getStatusBadgeStyleEntregable(estado: Entregable["estado"]) {
  const v = normalizeEstadoParaColorGantt(String(estado));
  switch (v) {
    case "EN_PLAZO_OK":
      return { bg: "#E0E7FF", text: "#4338CA" };
    case "RIESGO":
      return { bg: "#FFF7ED", text: "#B45309" };
    case "CRITICO":
      return { bg: "#FEF2F2", text: "#B91C1C" };
    case "COMPLETADO_ADELANTADO":
      return { bg: "#ECFDF5", text: "#047857" };
    case "NO_INICIADO":
    default:
      return { bg: "#F1F5F9", text: "#475569" };
  }
}

/** Fechas para barra: alineado a carta Gantt proyectos (inicio + término operativo). */
export function fechasBarraEntregableGantt(ent: Entregable): {
  fecha_inicio: string;
  fecha_termino: string;
  fechasRevPCompletas: boolean;
  fechaInicioRevP: string | null;
  fechaTerminoRevP: string | null;
} {
  const inicio = (ent.fecha_inicio ?? "").trim();
  const termino = (ent.fecha_termino ?? "").trim();
  const revP = (ent.fecha_revP ?? "").trim();
  const inicioOk = Boolean(inicio) && Number.isFinite(parseGanttDate(inicio).getTime());
  const terminoBarOk = Boolean(termino) && Number.isFinite(parseGanttDate(termino).getTime());
  const revPOk = Boolean(revP) && Number.isFinite(parseGanttDate(revP).getTime());
  return {
    fecha_inicio: inicio,
    fecha_termino: termino,
    fechasRevPCompletas: inicioOk && terminoBarOk,
    fechaInicioRevP: inicioOk ? inicio : null,
    fechaTerminoRevP: revPOk ? revP : terminoBarOk ? termino : null,
  };
}

export function computeGanttBarSegment(
  item: { fecha_inicio: string; fecha_termino: string },
  month: GanttMonth,
): { leftPct: number; widthPct: number } | null {
  const start = parseGanttDate(item.fecha_inicio);
  const end = parseGanttDate(item.fecha_termino);
  const monthStart = new Date(month.year, month.month, 1);
  const monthEnd = new Date(month.year, month.month, month.days);

  if (end < monthStart || start > monthEnd) return null;

  const left =
    start.getFullYear() === month.year && start.getMonth() === month.month
      ? (start.getDate() - 1) / month.days
      : 0;
  const right =
    end.getFullYear() === month.year && end.getMonth() === month.month
      ? end.getDate() / month.days
      : 1;

  return { leftPct: left * 100, widthPct: Math.max((right - left) * 100, 2) };
}
