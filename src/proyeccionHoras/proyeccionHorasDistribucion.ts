/**
 * Distribución de horas por días hábiles (lun–vie), sin feriados.
 * Reutiliza la misma semántica de `diasHabilesEnRango` (Capacidad).
 */

import { diasHabilesEnRango } from "@/capacidad/capacidadPeriodo";
import { localDateFromDate, localDateToDate, parseLocalDateString } from "@/lib/localDate";

const EPS = 1e-9;

export function mesKeyFromParts(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

export function mesKeyFromIso(iso: string): string | null {
  const p = parseLocalDateString(iso);
  if (!p) return null;
  return mesKeyFromParts(p.year, p.month);
}

/** Primer día del mes de `fechaConsulta` (YYYY-MM-DD). */
export function mesInicioHorizonteDesdeConsulta(fechaConsulta: string): string {
  const p = parseLocalDateString(fechaConsulta);
  if (!p) {
    const d = new Date();
    return mesKeyFromParts(d.getFullYear(), d.getMonth() + 1);
  }
  return mesKeyFromParts(p.year, p.month);
}

/** Lista de N meses YYYY-MM a partir de mesInicio (inclusive). */
export function listarMesesHorizonte(mesInicio: string, n: number): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(mesInicio.trim());
  if (!m || n <= 0) return [];
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(mesKeyFromParts(y, mo));
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return out;
}

function clampIsoEnMes(isoInicio: string, isoFin: string, year: number, month1to12: number): {
  inicio: string;
  fin: string;
} | null {
  const a = localDateToDate(isoInicio);
  const b = localDateToDate(isoFin);
  if (!a || !b || a > b) return null;
  const mesIni = new Date(year, month1to12 - 1, 1);
  const mesFin = new Date(year, month1to12, 0);
  const ini = a > mesIni ? a : mesIni;
  const fin = b < mesFin ? b : mesFin;
  if (ini > fin) return null;
  return { inicio: localDateFromDate(ini), fin: localDateFromDate(fin) };
}

/**
 * Primer día hábil (lun–vie) en o después de `iso`.
 * Si `iso` ya es hábil, se devuelve igual.
 */
export function primerDiaHabilDesde(iso: string): string | null {
  const d = localDateToDate((iso ?? "").trim());
  if (!d) return null;
  for (let i = 0; i < 14; i++) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) return localDateFromDate(d);
    d.setDate(d.getDate() + 1);
  }
  return null;
}

export type VentanaProyeccionEfectiva =
  | {
      ok: true;
      fecha_inicio_entregable: string;
      fecha_termino_entregable: string;
      fecha_inicio_efectiva: string;
      fecha_termino_efectiva: string;
      /** true si se adelantó el inicio respecto de fecha_inicio del entregable. */
      replanificado_desde_consulta: boolean;
    }
  | {
      ok: false;
      motivo: "VENCIDO" | "FECHAS_INVALIDAS" | "SIN_DIAS_HABILES";
      fecha_inicio_entregable: string;
      fecha_termino_entregable: string;
      detalle: string;
    };

/**
 * Ventana de proyección futura del saldo pendiente:
 * fecha_inicio_efectiva = max(fecha_inicio, fecha_consulta) [ajustada a día hábil si aplica]
 * fecha_termino_efectiva = fecha_termino
 *
 * Si el entregable ya terminó antes de la consulta → no proyectar al pasado.
 */
export function resolverVentanaProyeccionEfectiva(
  fechaInicioEntregable: string,
  fechaTerminoEntregable: string,
  fechaConsulta: string,
): VentanaProyeccionEfectiva {
  const ini = (fechaInicioEntregable ?? "").trim();
  const fin = (fechaTerminoEntregable ?? "").trim();
  const consulta = (fechaConsulta ?? "").trim();
  if (!parseLocalDateString(ini) || !parseLocalDateString(fin) || !parseLocalDateString(consulta)) {
    return {
      ok: false,
      motivo: "FECHAS_INVALIDAS",
      fecha_inicio_entregable: ini,
      fecha_termino_entregable: fin,
      detalle: "Fechas inválidas para calcular ventana efectiva.",
    };
  }
  if (ini > fin) {
    return {
      ok: false,
      motivo: "FECHAS_INVALIDAS",
      fecha_inicio_entregable: ini,
      fecha_termino_entregable: fin,
      detalle: "fecha_inicio > fecha_termino.",
    };
  }

  // Caso 3–4: término antes de la consulta → saldo vencido / no proyectable al pasado.
  if (fin < consulta) {
    return {
      ok: false,
      motivo: "VENCIDO",
      fecha_inicio_entregable: ini,
      fecha_termino_entregable: fin,
      detalle: `Término ${fin} es anterior a la fecha de consulta ${consulta}; el saldo no se distribuye en meses pasados.`,
    };
  }

  // Caso 1: no iniciado → ini > consulta → usar ini.
  // Caso 2: ya iniciado → ini < consulta → usar consulta (o primer hábil desde consulta).
  let inicioEfectivo = ini >= consulta ? ini : consulta;
  if (inicioEfectivo === consulta && ini < consulta) {
    const habil = primerDiaHabilDesde(consulta);
    if (habil) inicioEfectivo = habil;
  }

  if (inicioEfectivo > fin) {
    return {
      ok: false,
      motivo: "VENCIDO",
      fecha_inicio_entregable: ini,
      fecha_termino_entregable: fin,
      detalle: `No queda ventana futura hábil entre ${inicioEfectivo} y ${fin} respecto de la consulta ${consulta}.`,
    };
  }

  const dias = diasHabilesEnRango(inicioEfectivo, fin);
  if (dias <= 0) {
    return {
      ok: false,
      motivo: "SIN_DIAS_HABILES",
      fecha_inicio_entregable: ini,
      fecha_termino_entregable: fin,
      detalle: `No hay días hábiles (lun–vie) en ${inicioEfectivo}→${fin}.`,
    };
  }

  return {
    ok: true,
    fecha_inicio_entregable: ini,
    fecha_termino_entregable: fin,
    fecha_inicio_efectiva: inicioEfectivo,
    fecha_termino_efectiva: fin,
    replanificado_desde_consulta: inicioEfectivo > ini,
  };
}

export type DistribucionMensualHoras = {
  meses: { mes: string; horas: number; dias_habiles: number }[];
  dias_habiles_total: number;
  /** true si no hay días hábiles en el rango. */
  sin_dias_habiles: boolean;
};

/**
 * Reparte `saldo` proporcionalmente a días hábiles lun–vie en [fechaInicio, fechaTermino].
 * La suma de horas sobre el rango completo cuadra exactamente con `saldo`
 * (ajuste en el último mes con días > 0).
 * Si `mesesFiltro` se pasa, solo se incluyen esos meses; las horas de meses
 * omitidos no se reescalan (quedan fuera del horizonte).
 */
export function distribuirHorasPorDiasHabiles(
  saldo: number,
  fechaInicio: string,
  fechaTermino: string,
  mesesFiltro?: ReadonlySet<string> | readonly string[],
): DistribucionMensualHoras {
  const ini = (fechaInicio ?? "").trim();
  const fin = (fechaTermino ?? "").trim();
  const saldoN = Number.isFinite(saldo) ? Math.max(0, saldo) : 0;
  if (saldoN <= EPS) {
    return { meses: [], dias_habiles_total: 0, sin_dias_habiles: false };
  }
  const d0 = localDateToDate(ini);
  const d1 = localDateToDate(fin);
  if (!d0 || !d1 || d0 > d1) {
    return { meses: [], dias_habiles_total: 0, sin_dias_habiles: true };
  }

  const filtro =
    mesesFiltro == null
      ? null
      : mesesFiltro instanceof Set
        ? mesesFiltro
        : new Set(mesesFiltro);

  // Buckets de TODO el rango (fuente de verdad de días hábiles por mes).
  const allBuckets: { mes: string; dias: number }[] = [];
  let y = d0.getFullYear();
  let m = d0.getMonth() + 1;
  const yEnd = d1.getFullYear();
  const mEnd = d1.getMonth() + 1;

  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    const key = mesKeyFromParts(y, m);
    const rango = clampIsoEnMes(ini, fin, y, m);
    const dias = rango ? diasHabilesEnRango(rango.inicio, rango.fin) : 0;
    if (dias > 0) allBuckets.push({ mes: key, dias });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  const diasTotalRango = allBuckets.reduce((s, b) => s + b.dias, 0);
  if (diasTotalRango <= 0) {
    return { meses: [], dias_habiles_total: 0, sin_dias_habiles: true };
  }

  const rawAll = allBuckets.map((b) => ({
    mes: b.mes,
    dias_habiles: b.dias,
    horas: (saldoN * b.dias) / diasTotalRango,
  }));

  // Redondeo a 0,01 h sobre el rango completo; cuadra residual en el último mes.
  const roundedAll = rawAll.map((r) => ({
    ...r,
    horas: Math.round(r.horas * 100) / 100,
  }));
  let diff = Math.round((saldoN - roundedAll.reduce((s, r) => s + r.horas, 0)) * 100) / 100;
  for (let i = roundedAll.length - 1; i >= 0 && Math.abs(diff) > EPS; i--) {
    const next = Math.round((roundedAll[i]!.horas + diff) * 100) / 100;
    if (next >= -EPS) {
      roundedAll[i]!.horas = Math.max(0, next);
      diff = 0;
      break;
    }
  }

  const filtered =
    filtro == null ? roundedAll : roundedAll.filter((r) => filtro.has(r.mes));

  return {
    meses: filtered.map((r) => ({
      mes: r.mes,
      horas: r.horas,
      dias_habiles: r.dias_habiles,
    })),
    dias_habiles_total: diasTotalRango,
    sin_dias_habiles: false,
  };
}

/** Horas del saldo que caen fuera del horizonte (resto no cubierto por meses filtrados). */
export function horasFueraDeHorizonte(
  saldo: number,
  fechaInicio: string,
  fechaTermino: string,
  mesesHorizonte: readonly string[],
): number {
  const saldoN = Number.isFinite(saldo) ? Math.max(0, saldo) : 0;
  if (saldoN <= EPS) return 0;
  const distFull = distribuirHorasPorDiasHabiles(saldoN, fechaInicio, fechaTermino);
  const set = new Set(mesesHorizonte);
  const en = distFull.meses.filter((m) => set.has(m.mes)).reduce((s, m) => s + m.horas, 0);
  return Math.max(0, Math.round((saldoN - en) * 100) / 100);
}
