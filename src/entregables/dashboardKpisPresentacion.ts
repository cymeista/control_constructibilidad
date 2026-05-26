/**
 * KPIs de presentación del Dashboard (sin alterar curvas base ni RegistroHora).
 */

import type { Entregable, Proyecto } from "@/context/AppDataContext";
import { buildDashboardCurvaPropuestaEntregables } from "@/entregables/dashboardCurvaPropuestaEntregables";

const MESES = [
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
] as const;

function parseFechaIsoLocal(fecha: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((fecha ?? "").trim());
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

/** El rango [fecha_inicio, fecha_termino] del proyecto solapa el año calendario. */
export function proyectoSolapaAnioCalendario(proyecto: Proyecto, anio: number): boolean {
  const ini = parseFechaIsoLocal(proyecto.fecha_inicio ?? "");
  const fin = parseFechaIsoLocal(proyecto.fecha_termino ?? "");
  if (!ini || !fin) return false;
  const tIni = tsMediodia(ini.y, ini.m0, ini.d);
  const tFin = tsMediodia(fin.y, fin.m0, fin.d);
  if (tFin < tIni) return false;
  const tAnioIni = tsMediodia(anio, 0, 1);
  const tAnioFin = tsMediodia(anio, 11, 31);
  return tIni <= tAnioFin && tFin >= tAnioIni;
}

function horasVendidasP4P3P2Entregable(e: Entregable): number {
  return (
    (Number.isFinite(e.hrs_p4) ? e.hrs_p4 : 0) +
    (Number.isFinite(e.hrs_p3) ? e.hrs_p3 : 0) +
    (Number.isFinite(e.hrs_p2) ? e.hrs_p2 : 0)
  );
}

/**
 * Horas vendidas/presupuestadas: suma P4+P3+P2 (sin L2) de entregables de proyectos que solapan el año.
 */
export function horasVendidasProyectosAnio(
  entregables: Entregable[],
  proyectos: Proyecto[],
  anio: number,
): number {
  const proyectoIdsAnio = new Set(
    proyectos.filter((p) => proyectoSolapaAnioCalendario(p, anio)).map((p) => p.id),
  );
  let s = 0;
  for (const e of entregables) {
    if (!proyectoIdsAnio.has(e.proyecto_id)) continue;
    s += horasVendidasP4P3P2Entregable(e);
  }
  return s;
}

export function mesTituloDashboard(m0: number): string {
  return MESES[m0] ?? "?";
}

/**
 * Horas teóricas/propuestas del mes siguiente (misma fuente P4+P3+P2 prorrateada que la curva de propuesta).
 */
export function resolverHorasPropuestasMesSiguiente(
  entregables: Entregable[],
  proyectos: Proyecto[],
  anioCalendario: number,
  fechaReferencia: Date,
  ajusteAcum: number[],
  propuestaMensualAnioActual: number[],
  mesKpi1a12: number,
): { horas: number; etiquetaMes: string } {
  const mesIdx = mesKpi1a12 - 1;
  if (mesKpi1a12 < 12) {
    const m0Sig = mesIdx + 1;
    return {
      horas: propuestaMensualAnioActual[m0Sig] ?? 0,
      etiquetaMes: `${mesTituloDashboard(m0Sig)} ${anioCalendario}`,
    };
  }
  const anioSig = anioCalendario + 1;
  const propSig = buildDashboardCurvaPropuestaEntregables(
    entregables,
    proyectos,
    anioSig,
    fechaReferencia,
    ajusteAcum,
    [],
  );
  return {
    horas: propSig.propuestaMensual[0] ?? 0,
    etiquetaMes: `${mesTituloDashboard(0)} ${anioSig}`,
  };
}

/** Faltante mes = objetivo ajustado del mes − directas reales del mes (puede ser negativo = sobre objetivo). */
export function faltanteVsObjetivoAjustadoMesDisplay(
  objetivoAjustadoMes: number,
  directasRealesMes: number,
): { valorHoras: number; esSobreObjetivo: boolean } {
  const obj = Number.isFinite(objetivoAjustadoMes) ? objetivoAjustadoMes : 0;
  const dir = Number.isFinite(directasRealesMes) ? directasRealesMes : 0;
  const delta = obj - dir;
  return { valorHoras: delta, esSobreObjetivo: delta < 0 };
}
