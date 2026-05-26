/**
 * Curva objetivo anual al 100% de capacidad (equipo).
 * Sin RegistroHora ni factor de cargabilidad: solo cálculo de metas mensuales y acumulado.
 */

import type { CurvaObjetivoAnual, CurvaObjetivoMes } from "@/entregables/curvaObjetivoAnualTypes";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO local YYYY-MM-DD (mes 1–12). */
export function fechaInicioMes(anio: number, mes: number): string {
  return `${anio}-${pad2(mes)}-01`;
}

/** Último día del mes (bisiesto incluido). mes 1–12. */
export function fechaTerminoMes(anio: number, mes: number): string {
  const ultimo = new Date(anio, mes, 0).getDate();
  return `${anio}-${pad2(mes)}-${pad2(ultimo)}`;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * objetivo_mensual = profesionales × horas_max − feriados − vacaciones + ajustes
 * objetivo_acumulado = suma corrida enero → diciembre (orden por mes).
 */
export function recalcularObjetivosMeses(
  horasMaximasMensualesPorProfesional: number,
  meses: CurvaObjetivoMes[],
): CurvaObjetivoMes[] {
  const hMax = Math.max(0, n(horasMaximasMensualesPorProfesional));
  const sorted = [...meses].sort((a, b) => a.mes - b.mes);
  let acumulado = 0;
  return sorted.map((m) => {
    const prof = Math.max(0, Math.round(n(m.profesionales)));
    const fer = Math.max(0, n(m.feriados_horas));
    const vac = Math.max(0, n(m.vacaciones_horas));
    const adj = n(m.ajustes_horas);
    const mensual = prof * hMax - fer - vac + adj;
    acumulado += mensual;
    return {
      ...m,
      profesionales: prof,
      feriados_horas: fer,
      vacaciones_horas: vac,
      ajustes_horas: adj,
      objetivo_mensual: mensual,
      objetivo_acumulado: acumulado,
    };
  });
}

export function aplicarProfesionalesDesdeMesHaciaAdelante(
  meses: CurvaObjetivoMes[],
  desdeMes: number,
  valor: number,
): CurvaObjetivoMes[] {
  const v = Math.max(0, Math.round(Number(valor)) || 0);
  return meses.map((m) => (m.mes >= desdeMes ? { ...m, profesionales: v } : m));
}

/** Construye 12 filas con fechas, dotación base y ceros en feriados/vacaciones/ajustes; recalcula objetivos. */
export function crearMesesInicialesCurva(
  anio: number,
  curvaId: string,
  profesionalesBase: number,
  horasMaximasMensualesPorProfesional: number,
  ts: string,
  newId: () => string,
): CurvaObjetivoMes[] {
  const base = Math.max(0, Math.round(Number(profesionalesBase)) || 0);
  const raw: CurvaObjetivoMes[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    raw.push({
      id: newId(),
      curva_objetivo_anual_id: curvaId,
      mes,
      fecha_inicio: fechaInicioMes(anio, mes),
      fecha_termino: fechaTerminoMes(anio, mes),
      profesionales: base,
      feriados_horas: 0,
      vacaciones_horas: 0,
      ajustes_horas: 0,
      objetivo_mensual: 0,
      objetivo_acumulado: 0,
      created_at: ts,
      updated_at: ts,
    });
  }
  return recalcularObjetivosMeses(horasMaximasMensualesPorProfesional, raw);
}

/** Corrige fechas por mes/año y recalcula objetivos. */
export function refrescarFechasYObjetivos(curva: CurvaObjetivoAnual, ts: string): CurvaObjetivoAnual {
  const mesesConFechas = curva.meses.map((m) => ({
    ...m,
    fecha_inicio: fechaInicioMes(curva.anio, m.mes),
    fecha_termino: fechaTerminoMes(curva.anio, m.mes),
    updated_at: ts,
  }));
  const recalced = recalcularObjetivosMeses(curva.horas_maximas_mensuales_por_profesional, mesesConFechas);
  return {
    ...curva,
    meses: recalced.map((m) => ({ ...m, updated_at: ts })),
    updated_at: ts,
  };
}
