/**
 * Bloque 4 — Visibilidad operativa en asignaciones (solo lectura; no altera gasto ni presupuesto).
 */

import type { AsignacionHora, Entregable, Profesional, Proyecto, RegistroHora } from "@/context/AppDataContext";
import { buildConsumoMaps } from "@/entregables/asignacionHoraConsumo";
import {
  esRegistroConsumoRealValido,
  type RegistroHoraConsumoInput,
} from "@/entregables/registroHoraConsumo";

/** Semáforo consumo real vs horas comprometidas (solo interpretación visual). */
export type SemaforoAsignacionConsumo = "verde" | "amarillo" | "rojo" | "neutral";

/**
 * Reglas Bloque 4 (ACTIVA): verde &lt; 70%, amarillo 70–100%, rojo &gt; 100% del comprometido.
 * Si comprometidas ≤ 0 y gastado &gt; 0 → rojo; si ambos 0 → neutral.
 */
export function semaforoVsCompromiso(gastado: number, horasComprometidas: number): SemaforoAsignacionConsumo {
  const g = Number(gastado);
  const c = Number(horasComprometidas);
  if (!Number.isFinite(g) || !Number.isFinite(c)) return "neutral";
  if (c <= 0) return g > 1e-9 ? "rojo" : "neutral";
  const ratio = g / c;
  if (ratio > 1) return "rojo";
  if (ratio >= 0.7) return "amarillo";
  return "verde";
}

function keyProfEnt(pid: string, eid: string): string {
  return `${pid}\x00${eid}`;
}

function parseProfEnt(k: string): { profesional_id: string; entregable_id: string } {
  const i = k.indexOf("\x00");
  return { profesional_id: k.slice(0, i), entregable_id: k.slice(i + 1) };
}

/**
 * ¿La fecha del registro cae en la ventana de alguna asignación del mismo profesional + entregable?
 *
 * - ACTIVA: fecha_inicio_vigencia ≤ fecha ≤ fechaHoy (tope superior como en Bloque 2).
 * - CERRADA: fecha_inicio_vigencia ≤ fecha ≤ fecha_cierre (fecha_cierre obligatoria para aplicar cobertura).
 */
export function fechaCubiertaPorAlgunaAsignacion(
  fechaRegistroIso: string,
  profesionalId: string,
  entregableId: string,
  asignaciones_horas: AsignacionHora[],
  fechaHoy: string,
): boolean {
  const pid = (profesionalId ?? "").trim();
  const eid = (entregableId ?? "").trim();
  const f = (fechaRegistroIso ?? "").trim();
  const hoy = (fechaHoy ?? "").trim();
  /** No exigir f ≤ hoy aquí: una CERRADA debe cubrir gasto dentro de [inicio, cierre] aunque esa fecha sea “futura” respecto al calendario local (datos demo o cargas adelantadas). El tope “hoy” aplica solo a ACTIVA. */
  if (!pid || !eid || !f) return false;

  const delPar = asignaciones_horas.filter(
    (a) => (a.profesional_id ?? "").trim() === pid && (a.entregable_id ?? "").trim() === eid,
  );

  for (const a of delPar) {
    const ini = (a.fecha_inicio_vigencia ?? "").trim() || "1900-01-01";
    if (f < ini) continue;

    if (a.estado === "ACTIVA") {
      if (!hoy || f > hoy) continue;
      return true;
    }
    if (a.estado === "CERRADA") {
      const fc = (a.fecha_cierre ?? "").trim();
      if (!fc) continue;
      if (f <= fc) return true;
    }
  }
  return false;
}

export type GastoSinAsignacionActivaAgg = {
  profesional_id: string;
  entregable_id: string;
  horas_sin_cobertura_activa: number;
};

/**
 * Suma horas DIRECTA válidas (misma regla que consumo real) cuya fecha no cae en la ventana temporal de ninguna
 * asignación del par profesional + entregable (ACTIVA o CERRADA según reglas de fecha).
 */
export function aggregateGastoSinAsignacionActiva(
  registro_horas: RegistroHora[],
  asignaciones_horas: AsignacionHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): GastoSinAsignacionActivaAgg[] {
  const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);
  const hoy = (fechaHoy ?? "").trim();
  if (!hoy) return [];

  const acc = new Map<string, number>();

  for (const r of registro_horas) {
    const input: RegistroHoraConsumoInput = {
      tipo_hora: r.tipo_hora,
      proyecto_id: r.proyecto_id,
      entregable_id: r.entregable_id,
      profesional_id: r.profesional_id,
      horas: r.horas,
    };
    if (!esRegistroConsumoRealValido(input, entById, projById, profById)) continue;

    const pid = (r.profesional_id ?? "").trim();
    const eid = (r.entregable_id ?? "").trim();
    const f = (r.fecha ?? "").trim();
    if (!pid || !eid || !f || f > hoy) continue;

    if (fechaCubiertaPorAlgunaAsignacion(f, pid, eid, asignaciones_horas, hoy)) continue;

    const k = keyProfEnt(pid, eid);
    const hrs = Number(r.horas);
    if (!Number.isFinite(hrs) || hrs <= 0) continue;
    acc.set(k, (acc.get(k) ?? 0) + hrs);
  }

  const out: GastoSinAsignacionActivaAgg[] = [];
  for (const [k, horas_sin_cobertura_activa] of acc) {
    if (horas_sin_cobertura_activa <= 1e-9) continue;
    const { profesional_id, entregable_id } = parseProfEnt(k);
    out.push({ profesional_id, entregable_id, horas_sin_cobertura_activa });
  }
  return out;
}
