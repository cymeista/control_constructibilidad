/**
 * Prorrateo semanal → mes calendario para DIRECTAS (regla oficial Dashboard Bloque 2).
 * Semana = lunes (fecha−4) … domingo (fecha+2); `fecha` = viernes de cierre del registro.
 */

import type { RegistroHora } from "@/context/AppDataContext";

function horasACentihoras(horas: number): number {
  const n = Number(horas);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function centihorasAHoras(c: number): number {
  return c / 100;
}

function repartirCentihorasEnSieteDias(cent: number): number[] {
  if (cent <= 0) return [0, 0, 0, 0, 0, 0, 0];
  const base = Math.floor(cent / 7);
  const rem = cent % 7;
  return Array.from({ length: 7 }, (_, i) => base + (i < rem ? 1 : 0));
}

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

function addDaysLocal(y: number, m0: number, d: number, delta: number): { y: number; m0: number; d: number } {
  const dt = new Date(y, m0, d + delta, 12, 0, 0, 0);
  return { y: dt.getFullYear(), m0: dt.getMonth(), d: dt.getDate() };
}

function parseDirectaRegistroCurvaRealDashboard(
  r: RegistroHora,
): { y: number; m0: number; d: number } | null {
  if (r.tipo_hora !== "DIRECTA") return null;
  const h = Number(r.horas);
  if (!Number.isFinite(h) || h <= 0) return null;
  return parseFechaIsoLocal(r.fecha);
}

export type OpcionesDirectasMensualProrrateo = {
  /** Si se define, solo registros de esos profesionales. */
  idsProfesionales?: Set<string>;
};

/**
 * Horas DIRECTAS prorrateadas por mes calendario (índice 0 = enero) para un año.
 */
export function acumularDirectasProrrateadasMensual(
  registro_horas: RegistroHora[],
  anio: number,
  opciones: OpcionesDirectasMensualProrrateo = {},
): number[] {
  const mensualCent = Array.from({ length: 12 }, () => 0);
  const ids = opciones.idsProfesionales;

  for (const r of registro_horas) {
    if (ids) {
      const pid = (r.profesional_id ?? "").trim();
      if (!pid || !ids.has(pid)) continue;
    }
    const parsed = parseDirectaRegistroCurvaRealDashboard(r);
    if (!parsed) continue;

    const cent = horasACentihoras(Number(r.horas));
    if (cent <= 0) continue;

    const partes = repartirCentihorasEnSieteDias(cent);
    for (let k = 0; k < 7; k++) {
      const { y, m0 } = addDaysLocal(parsed.y, parsed.m0, parsed.d, -4 + k);
      if (y !== anio) continue;
      if (m0 < 0 || m0 > 11) continue;
      mensualCent[m0] += partes[k]!;
    }
  }

  return mensualCent.map((c) => centihorasAHoras(c));
}

/** Misma regla que KPI «Directas reales del mes» del Dashboard. */
export function directasRealesMesCalendarioDashboard(
  registro_horas: RegistroHora[],
  anio: number,
  mes1a12: number,
  opciones: OpcionesDirectasMensualProrrateo = {},
): number {
  if (mes1a12 < 1 || mes1a12 > 12) return 0;
  const mensual = acumularDirectasProrrateadasMensual(registro_horas, anio, opciones);
  return mensual[mes1a12 - 1] ?? 0;
}

/** Directas prorrateadas del mes por profesional (misma regla Dashboard). */
export function directasRealesMesCalendarioPorProfesional(
  registro_horas: RegistroHora[],
  anio: number,
  mes1a12: number,
  idsProfesionales: Set<string>,
): Map<string, number> {
  const porProfCent = new Map<string, number[]>();
  for (const pid of idsProfesionales) {
    porProfCent.set(pid, Array.from({ length: 12 }, () => 0));
  }

  for (const r of registro_horas) {
    const pid = (r.profesional_id ?? "").trim();
    if (!pid || !idsProfesionales.has(pid)) continue;
    const parsed = parseDirectaRegistroCurvaRealDashboard(r);
    if (!parsed) continue;

    const cent = horasACentihoras(Number(r.horas));
    if (cent <= 0) continue;

    const arr = porProfCent.get(pid);
    if (!arr) continue;

    const partes = repartirCentihorasEnSieteDias(cent);
    for (let k = 0; k < 7; k++) {
      const { y, m0 } = addDaysLocal(parsed.y, parsed.m0, parsed.d, -4 + k);
      if (y !== anio) continue;
      if (m0 < 0 || m0 > 11) continue;
      arr[m0] += partes[k]!;
    }
  }

  const out = new Map<string, number>();
  const mi = mes1a12 - 1;
  for (const [pid, cents] of porProfCent) {
    out.set(pid, centihorasAHoras(cents[mi] ?? 0));
  }
  return out;
}

export function mesAnioCalendarioDesdeInicioPeriodo(inicioIso: string): {
  anio: number;
  mes1a12: number;
} | null {
  const p = parseFechaIsoLocal(inicioIso);
  if (!p) return null;
  return { anio: p.y, mes1a12: p.m0 + 1 };
}
