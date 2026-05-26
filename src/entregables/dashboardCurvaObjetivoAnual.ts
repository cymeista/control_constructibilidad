import type { CurvaObjetivoAnual } from "@/entregables/curvaObjetivoAnualTypes";

const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

export type DashboardCurvaObjetivoSeries = {
  labels: string[];
  /** Objetivo mensual al 100% (persistido). */
  baseMensual: number[];
  /** Objetivo acumulado al 100% (persistido). */
  baseAcum: number[];
  /** Objetivo mensual × factor de cargabilidad (solo presentación). */
  ajusteMensual: number[];
  /** Objetivo acumulado × factor (equivale a suma de mensuales ajustados). */
  ajusteAcum: number[];
  kpis: {
    objetivoAnual100: number;
    objetivoAnualAjustado: number;
    objetivoMesActual100: number;
    acumuladoMesActual100: number;
    objetivoMesActualAjustado: number;
    acumuladoMesActualAjustado: number;
  };
  /** Mes de calendario 1–12 usado para KPIs “mes actual”. */
  mesKpi: number;
};

/** Regla v1: una curva por `anio`; se usa la del año calendario indicado. */
export function seleccionarCurvaObjetivoPorAnio(
  curvas: CurvaObjetivoAnual[],
  anio: number,
): CurvaObjetivoAnual | null {
  return curvas.find((c) => c.anio === anio) ?? null;
}

/**
 * Construye series base (100%) y ajustadas (× factor %), sin mutar la entidad.
 * `factorCargabilidadPct` en 0–100 (mismo criterio que el slider del dashboard).
 */
export function buildDashboardCurvaObjetivoSeries(
  curva: CurvaObjetivoAnual,
  factorCargabilidadPct: number,
  fechaReferencia: Date = new Date(),
): DashboardCurvaObjetivoSeries {
  const f = Math.max(0, Math.min(100, factorCargabilidadPct)) / 100;
  const sorted = [...curva.meses].sort((a, b) => a.mes - b.mes);
  const labels = sorted.map((m) => {
    const idx = m.mes - 1;
    const corto = idx >= 0 && idx < 12 ? MESES_CORTO[idx] : "?";
    return `${corto} ${curva.anio}`;
  });
  const baseMensual = sorted.map((m) => (Number.isFinite(m.objetivo_mensual) ? m.objetivo_mensual : 0));
  const baseAcum = sorted.map((m) => (Number.isFinite(m.objetivo_acumulado) ? m.objetivo_acumulado : 0));
  const ajusteMensual = baseMensual.map((v) => v * f);
  const ajusteAcum = baseAcum.map((v) => v * f);

  const dec = sorted[11];
  const anual100 = dec && Number.isFinite(dec.objetivo_acumulado) ? dec.objetivo_acumulado : 0;

  const mesKpi = fechaReferencia.getMonth() + 1;
  const rowMes = sorted.find((m) => m.mes === mesKpi) ?? sorted[0]!;
  const m100 = Number.isFinite(rowMes.objetivo_mensual) ? rowMes.objetivo_mensual : 0;
  const a100 = Number.isFinite(rowMes.objetivo_acumulado) ? rowMes.objetivo_acumulado : 0;

  return {
    labels,
    baseMensual,
    baseAcum,
    ajusteMensual,
    ajusteAcum,
    kpis: {
      objetivoAnual100: anual100,
      objetivoAnualAjustado: anual100 * f,
      objetivoMesActual100: m100,
      acumuladoMesActual100: a100,
      objetivoMesActualAjustado: m100 * f,
      acumuladoMesActualAjustado: a100 * f,
    },
    mesKpi,
  };
}
