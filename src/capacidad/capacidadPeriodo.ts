/**
 * Rangos de periodo y capacidad nominal/objetivo (aislado para evolución futura).
 */

export type PeriodoCapacidadId =
  | "mes_actual"
  | "mes_anterior"
  | "ultimas_4_semanas"
  | "proximas_4_semanas"
  | "ano_actual";

export type RangoPeriodo = {
  id: PeriodoCapacidadId;
  label: string;
  inicio: string;
  fin: string;
  /** true = ventana futura (sin horas reales esperadas). */
  esFuturo: boolean;
};

export const CAPACIDAD_NOMINAL_SEMANAL_H = 40;
export const CAPACIDAD_OBJETIVO_RATIO = 0.85;
/** Aproximación mensual cuando no se calculan días hábiles explícitos. */
export const CAPACIDAD_NOMINAL_MES_APROX_H = 160;
export const CAPACIDAD_OBJETIVO_MES_APROX_H = CAPACIDAD_NOMINAL_MES_APROX_H * CAPACIDAD_OBJETIVO_RATIO;

const MS_DIA = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function fechaHoyIsoLocalCapacidad(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoLocal(iso: string): Date | null {
  const t = (iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(iso: string, days: number): string {
  const d = parseIsoLocal(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return isoFromDate(d);
}

/** Lunes–viernes en el rango [inicio, fin] inclusive. */
export function diasHabilesEnRango(inicio: string, fin: string): number {
  const a = parseIsoLocal(inicio);
  const b = parseIsoLocal(fin);
  if (!a || !b || a > b) return 0;
  let n = 0;
  const cur = new Date(a);
  while (cur <= b) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) n += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

/** Fin calendario teórico del periodo (p. ej. 31-12 para año acumulado; el rango operativo puede usar `hoy`). */
export function finPeriodoTeoricoCapacidad(id: PeriodoCapacidadId, hoy = fechaHoyIsoLocalCapacidad()): string {
  const rango = rangoPeriodoCapacidad(id, hoy);
  if (id === "ano_actual") {
    const h = parseIsoLocal(hoy);
    if (h) return `${h.getFullYear()}-12-31`;
  }
  return rango.fin;
}

export function rangoPeriodoCapacidad(id: PeriodoCapacidadId, hoy = fechaHoyIsoLocalCapacidad()): RangoPeriodo {
  const h = parseIsoLocal(hoy)!;
  const y = h.getFullYear();
  const m = h.getMonth();

  switch (id) {
    case "mes_actual": {
      const inicio = `${y}-${pad2(m + 1)}-01`;
      const ultimo = new Date(y, m + 1, 0);
      const fin = isoFromDate(ultimo);
      return { id, label: "Mes actual", inicio, fin, esFuturo: false };
    }
    case "mes_anterior": {
      const inicio = new Date(y, m - 1, 1);
      const fin = new Date(y, m, 0);
      return {
        id,
        label: "Mes anterior",
        inicio: isoFromDate(inicio),
        fin: isoFromDate(fin),
        esFuturo: false,
      };
    }
    case "ultimas_4_semanas":
      return {
        id,
        label: "Últimas 4 semanas",
        inicio: addDays(hoy, -27),
        fin: hoy,
        esFuturo: false,
      };
    case "proximas_4_semanas":
      return {
        id,
        label: "Próximas 4 semanas",
        inicio: hoy,
        fin: addDays(hoy, 27),
        esFuturo: true,
      };
    case "ano_actual":
      return {
        id,
        label: "Año actual acumulado",
        inicio: `${y}-01-01`,
        fin: hoy,
        esFuturo: false,
      };
    default:
      return rangoPeriodoCapacidad("mes_actual", hoy);
  }
}

/** Horas nominales del periodo (días hábiles × 8 h, con fallback mensual). */
export function capacidadNominalProfesionalPeriodo(inicio: string, fin: string): number {
  const dias = diasHabilesEnRango(inicio, fin);
  if (dias > 0) return dias * 8;
  const a = parseIsoLocal(inicio);
  const b = parseIsoLocal(fin);
  if (!a || !b) return CAPACIDAD_NOMINAL_MES_APROX_H;
  const spanDias = Math.max(1, Math.round((b.getTime() - a.getTime()) / MS_DIA) + 1);
  if (spanDias >= 25 && spanDias <= 35) return CAPACIDAD_NOMINAL_MES_APROX_H;
  const semanas = spanDias / 7;
  return Math.max(0, semanas * CAPACIDAD_NOMINAL_SEMANAL_H);
}

export function capacidadObjetivoDesdeNominal(nominal: number, ratioObjetivo = CAPACIDAD_OBJETIVO_RATIO): number {
  return nominal * ratioObjetivo;
}

/**
 * Fecha de corte = máxima fecha de RegistroHora dentro del periodo.
 * Si `profesionalIdsPermitidos` está definido, solo considera esos profesionales (cargables).
 */
export function resolverFechaCorteEnPeriodo(
  registros: { fecha: string; profesional_id?: string }[],
  periodo: Pick<RangoPeriodo, "inicio" | "fin">,
  profesionalIdsPermitidos?: Set<string>,
): { fechaCorte: string | null; ultimaCargaRegistrada: string | null } {
  let max = "";
  for (const r of registros) {
    const pid = (r.profesional_id ?? "").trim();
    if (profesionalIdsPermitidos && (!pid || !profesionalIdsPermitidos.has(pid))) continue;
    const f = (r.fecha ?? "").trim();
    if (!fechaEnRango(f, periodo.inicio, periodo.fin)) continue;
    if (f > max) max = f;
  }
  if (!max) return { fechaCorte: null, ultimaCargaRegistrada: null };
  return { fechaCorte: max, ultimaCargaRegistrada: max };
}

/**
 * Capacidad nominal acumulada hasta fecha_corte, proporcional por días hábiles del periodo.
 * baseMensual: 160 h estándar o 110 h (Ricardo Gattás).
 */
export function capacidadNominalAcumuladaAfechaCorte(
  periodo: Pick<RangoPeriodo, "inicio" | "fin">,
  fechaCorte: string,
  baseMensual: number,
): number {
  const corte = (fechaCorte ?? "").trim();
  if (!corte) return 0;
  const finEfectivo = corte < periodo.fin ? corte : periodo.fin;
  const diasTotal = diasHabilesEnRango(periodo.inicio, periodo.fin);
  const diasAcum = diasHabilesEnRango(periodo.inicio, finEfectivo);
  if (diasTotal <= 0 || diasAcum <= 0) return 0;
  const factorBase = baseMensual / CAPACIDAD_NOMINAL_MES_APROX_H;
  const nominalPeriodoCompleto = diasTotal * 8 * factorBase;
  return nominalPeriodoCompleto * (diasAcum / diasTotal);
}

export function fechaEnRango(fecha: string, inicio: string, fin: string): boolean {
  const f = (fecha ?? "").trim();
  if (!f) return false;
  return f >= inicio && f <= fin;
}

export const PERIODOS_CAPACIDAD_OPCIONES: { id: PeriodoCapacidadId; label: string }[] = [
  { id: "mes_actual", label: "Mes actual" },
  { id: "mes_anterior", label: "Mes anterior" },
  { id: "ultimas_4_semanas", label: "Últimas 4 semanas" },
  { id: "proximas_4_semanas", label: "Próximas 4 semanas" },
  { id: "ano_actual", label: "Año actual acumulado" },
];
