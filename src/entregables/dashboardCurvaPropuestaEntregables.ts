/**
 * Bloque Dashboard 3: curva de propuesta (P4+P3+P2) por entregable, prorrateo lineal por día calendario.
 * Solo lectura sobre entregables y proyectos; no toca RegistroHora ni consumo real.
 */

import type { Entregable, Proyecto } from "@/context/AppDataContext";

function parseFechaIsoLocal(fecha: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12 || d < 1 || d > 31) {
    return null;
  }
  return { y, m0: mo - 1, d };
}

function tsMediodia(y: number, m0: number, d: number): number {
  return new Date(y, m0, d, 12, 0, 0, 0).getTime();
}

/** Días inclusivos entre dos fechas locales (mismo día → 1). */
function diasCalendarioInclusivos(
  a: { y: number; m0: number; d: number },
  b: { y: number; m0: number; d: number },
): number {
  const t0 = tsMediodia(a.y, a.m0, a.d);
  const t1 = tsMediodia(b.y, b.m0, b.d);
  if (t1 < t0) return 0;
  return Math.round((t1 - t0) / 86400000) + 1;
}

function addDaysLocal(y: number, m0: number, d: number, delta: number): { y: number; m0: number; d: number } {
  const dt = new Date(y, m0, d + delta, 12, 0, 0, 0);
  return { y: dt.getFullYear(), m0: dt.getMonth(), d: dt.getDate() };
}

function horasP4P3P2(e: Entregable): number {
  const p4 = Number(e.hrs_p4);
  const p3 = Number(e.hrs_p3);
  const p2 = Number(e.hrs_p2);
  const s = (Number.isFinite(p4) ? p4 : 0) + (Number.isFinite(p3) ? p3 : 0) + (Number.isFinite(p2) ? p2 : 0);
  return s;
}

/** Horas → centésimas de hora (entero); cuadratura exacta por día. */
function horasACentihoras(horas: number): number {
  if (!Number.isFinite(horas) || horas <= 0) return 0;
  return Math.round(horas * 100);
}

function centihorasAHoras(c: number): number {
  return c / 100;
}

export type PropuestaDetalleFila = {
  entregableId: string;
  proyectoNombre: string;
  entregableNombre: string;
  /** Horas exactas desde centihoras/100. */
  horas: number;
};

export type DashboardCurvaPropuestaExclusiones = {
  totalEntregables: number;
  incluidos: number;
  porFechasInvalidasOVacias: number;
  porTerminoAntesQueInicio: number;
  porHorasNoPositivas: number;
};

export type DashboardCurvaPropuestaResult = {
  /** Índice 0 = enero, horas del año `anio` solamente. */
  propuestaMensual: number[];
  propuestaAcumulado: number[];
  /** Desglose por mes (1..12 → índice 0..11), filas ordenadas por horas descendente. */
  detallePorMes: PropuestaDetalleFila[][];
  exclusiones: DashboardCurvaPropuestaExclusiones;
  /** Suma global hrs_p4+p3+p2 solo entregables incluidos (tramo completo, no solo el año). */
  sumaHorasPresupuestoP4P3P2Incluidos: number;
  /** Suma de `propuestaMensual` (debe coincidir con porción en año de esas horas). */
  sumaPropuestaMensualEnAnio: number;
  kpis: {
    mesKpi1a12: number;
    horasPropuestasAcumuladasYTD: number;
    horasPropuestasMesActual: number;
    /** real_acum_YTD − propuesta_acum_YTD (positivo = más gasto real que propuesta acumulada). */
    brechaRealVsPropuestaAcum: number;
    /** propuesta_acum_YTD − objetivo_ajustado_acum_YTD (positivo = más propuesta que capacidad objetivo). */
    brechaPropuestaVsObjetivoAjustadoAcum: number;
  };
};

/**
 * Construye curva mensual y acumulada de propuesta para `anio` (solo días calendario que caen en ese año).
 * Cuadratura: reparto en centihoras enteros por día; suma diaria = total entregable; suma días en año = porción año.
 */
export function buildDashboardCurvaPropuestaEntregables(
  entregables: Entregable[],
  proyectos: Proyecto[],
  anio: number,
  fechaReferencia: Date,
  objetivoAjustadoAcum: number[],
  realAcumulado: number[],
): DashboardCurvaPropuestaResult {
  const projNombre = new Map(proyectos.map((p) => [p.id, p.nombre || p.codigo || p.id]));

  const mensCent = Array.from({ length: 12 }, () => 0);
  /** mesIndex 0..11 → Map entregableId → centihoras en ese mes (año anio). */
  const detalleCent = Array.from({ length: 12 }, () => new Map<string, number>());
  const metaPorEnt = new Map<string, { nombre: string; proyectoNombre: string }>();

  let porFechas = 0;
  let porRango = 0;
  let porHoras = 0;
  let incluidos = 0;
  let sumaGlobalIncluidos = 0;

  for (const e of entregables) {
    const ini = parseFechaIsoLocal(e.fecha_inicio ?? "");
    const fin = parseFechaIsoLocal(e.fecha_termino ?? "");
    if (!ini || !fin) {
      porFechas += 1;
      continue;
    }
    if (tsMediodia(fin.y, fin.m0, fin.d) < tsMediodia(ini.y, ini.m0, ini.d)) {
      porRango += 1;
      continue;
    }
    const hrs = horasP4P3P2(e);
    const cent = horasACentihoras(hrs);
    if (cent <= 0) {
      porHoras += 1;
      continue;
    }

    const D = diasCalendarioInclusivos(ini, fin);
    if (D <= 0) {
      porRango += 1;
      continue;
    }

    incluidos += 1;
    sumaGlobalIncluidos += hrs;

    const base = Math.floor(cent / D);
    const rem = cent % D;

    const pn = projNombre.get(e.proyecto_id) ?? "Proyecto (sin match)";
    metaPorEnt.set(e.id, { nombre: e.nombre || e.id, proyectoNombre: pn });

    for (let k = 0; k < D; k += 1) {
      const day = addDaysLocal(ini.y, ini.m0, ini.d, k);
      const cDay = base + (k < rem ? 1 : 0);
      if (day.y !== anio) continue;
      const mi = day.m0;
      if (mi < 0 || mi > 11) continue;
      mensCent[mi] += cDay;
      const prev = detalleCent[mi].get(e.id) ?? 0;
      detalleCent[mi].set(e.id, prev + cDay);
    }
  }

  const propuestaMensual = mensCent.map((c) => centihorasAHoras(c));
  let run = 0;
  const propuestaAcumulado = propuestaMensual.map((v) => {
    run += v;
    return run;
  });

  const detallePorMes: PropuestaDetalleFila[][] = detalleCent.map((mMap) => {
    const rows: PropuestaDetalleFila[] = [];
    for (const [eid, c] of mMap) {
      const meta = metaPorEnt.get(eid);
      rows.push({
        entregableId: eid,
        proyectoNombre: meta?.proyectoNombre ?? "—",
        entregableNombre: meta?.nombre ?? eid,
        horas: centihorasAHoras(c),
      });
    }
    rows.sort((a, b) => b.horas - a.horas);
    return rows;
  });

  const mesKpi = fechaReferencia.getMonth() + 1;
  const idx = mesKpi - 1;
  const horasPropuestasAcumuladasYTD = propuestaAcumulado[idx] ?? 0;
  const horasPropuestasMesActual = propuestaMensual[idx] ?? 0;
  const propAcum = horasPropuestasAcumuladasYTD;
  const realYtd = Number.isFinite(realAcumulado[idx]) ? realAcumulado[idx] : 0;
  const objAdjYtd = Number.isFinite(objetivoAjustadoAcum[idx]) ? objetivoAjustadoAcum[idx] : 0;

  const sumaPropuestaMensualEnAnio = propuestaMensual.reduce((s, v) => s + v, 0);

  return {
    propuestaMensual,
    propuestaAcumulado,
    detallePorMes,
    exclusiones: {
      totalEntregables: entregables.length,
      incluidos,
      porFechasInvalidasOVacias: porFechas,
      porTerminoAntesQueInicio: porRango,
      porHorasNoPositivas: porHoras,
    },
    sumaHorasPresupuestoP4P3P2Incluidos: sumaGlobalIncluidos,
    sumaPropuestaMensualEnAnio,
    kpis: {
      mesKpi1a12: mesKpi,
      horasPropuestasAcumuladasYTD: horasPropuestasAcumuladasYTD,
      horasPropuestasMesActual,
      brechaRealVsPropuestaAcum: realYtd - propAcum,
      brechaPropuestaVsObjetivoAjustadoAcum: propAcum - objAdjYtd,
    },
  };
}
