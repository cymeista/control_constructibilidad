/**
 * Horas reales DIRECTA por entregable (derivado, sin persistencia).
 * Misma validez que esRegistroConsumoRealValido.
 */

import type { Entregable, Profesional, Proyecto, RegistroHora } from "@/context/AppDataContext";
import {
  esRegistroConsumoRealValido,
  type EntregableConsumoTarget,
  type ProfesionalCargoInput,
  type ProyectoTarifasInput,
} from "@/entregables/registroHoraConsumo";
import { mesKeyFromIso } from "@/proyeccionHoras/proyeccionHorasDistribucion";
import { parseLocalDateString } from "@/lib/localDate";

export type HorasRealesEntregable = {
  /** Total DIRECTA válida del entregable (sin recorte por pausa). */
  horas_reales_total: number;
  /** DIRECTA con fecha <= fecha_pausa (si hay pausa válida); si no, igual al total. */
  horas_reales_hasta_pausa: number;
  primera_fecha_hora_real: string | null;
  ultima_fecha_hora_real: string | null;
  /** YYYY-MM → horas (solo registros del tramo histórico / hasta pausa). */
  horas_reales_por_mes: Record<string, number>;
  /** Todas las DIRECTA por mes (incluye posteriores a pausa; para no ocultarlas). */
  horas_reales_por_mes_todas: Record<string, number>;
  horas_posteriores_a_pausa: number;
  primera_fecha_posterior_pausa: string | null;
  ultima_fecha_posterior_pausa: string | null;
};

function buildMaps(
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
) {
  const entById = new Map<string, EntregableConsumoTarget>(
    entregables.map((e) => [e.id, { id: e.id, proyecto_id: e.proyecto_id }]),
  );
  const projById = new Map<string, ProyectoTarifasInput>(
    proyectos.map((p) => [
      p.id,
      {
        id: p.id,
        tarifa_l2: p.tarifa_l2,
        tarifa_p4: p.tarifa_p4,
        tarifa_p3: p.tarifa_p3,
        tarifa_p2: p.tarifa_p2,
      },
    ]),
  );
  const profById = new Map<string, ProfesionalCargoInput>(
    profesionales.map((p) => [p.id, { id: p.id, cargo: p.cargo }]),
  );
  return { entById, projById, profById };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyResumen(): HorasRealesEntregable {
  return {
    horas_reales_total: 0,
    horas_reales_hasta_pausa: 0,
    primera_fecha_hora_real: null,
    ultima_fecha_hora_real: null,
    horas_reales_por_mes: {},
    horas_reales_por_mes_todas: {},
    horas_posteriores_a_pausa: 0,
    primera_fecha_posterior_pausa: null,
    ultima_fecha_posterior_pausa: null,
  };
}

/**
 * Agrega horas DIRECTA válidas por entregable.
 * Si el entregable está pausado con fecha_pausa válida, separa el tramo histórico
 * (fecha <= pausa) de los registros posteriores (observación defensiva).
 */
export function buildHorasRealesPorEntregable(
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): Map<string, HorasRealesEntregable> {
  const { entById, projById, profById } = buildMaps(entregables, proyectos, profesionales);
  const pausaByEnt = new Map<string, string | null>();
  for (const e of entregables) {
    const pausa = (e.fecha_pausa ?? "").trim();
    const pausado = e.pausado === true && e.cancelado !== true;
    pausaByEnt.set(e.id, pausado && pausa && parseLocalDateString(pausa) ? pausa : null);
  }

  const acc = new Map<string, HorasRealesEntregable>();
  const ensure = (id: string) => {
    let r = acc.get(id);
    if (!r) {
      r = emptyResumen();
      acc.set(id, r);
    }
    return r;
  };

  for (const r of registro_horas) {
    if (!esRegistroConsumoRealValido(r, entById, projById, profById)) continue;
    const eid = (r.entregable_id ?? "").trim();
    const fecha = (r.fecha ?? "").trim();
    if (!eid || !fecha || !parseLocalDateString(fecha)) continue;
    const horas = Number(r.horas);
    if (!Number.isFinite(horas) || horas <= 0) continue;

    const row = ensure(eid);
    row.horas_reales_total = round2(row.horas_reales_total + horas);

    const mes = mesKeyFromIso(fecha);
    if (mes) {
      row.horas_reales_por_mes_todas[mes] = round2(
        (row.horas_reales_por_mes_todas[mes] ?? 0) + horas,
      );
    }

    const pausa = pausaByEnt.get(eid);
    if (pausa && fecha > pausa) {
      row.horas_posteriores_a_pausa = round2(row.horas_posteriores_a_pausa + horas);
      if (!row.primera_fecha_posterior_pausa || fecha < row.primera_fecha_posterior_pausa) {
        row.primera_fecha_posterior_pausa = fecha;
      }
      if (!row.ultima_fecha_posterior_pausa || fecha > row.ultima_fecha_posterior_pausa) {
        row.ultima_fecha_posterior_pausa = fecha;
      }
      continue;
    }

    row.horas_reales_hasta_pausa = round2(row.horas_reales_hasta_pausa + horas);
    if (!row.primera_fecha_hora_real || fecha < row.primera_fecha_hora_real) {
      row.primera_fecha_hora_real = fecha;
    }
    if (!row.ultima_fecha_hora_real || fecha > row.ultima_fecha_hora_real) {
      row.ultima_fecha_hora_real = fecha;
    }
    if (mes) {
      row.horas_reales_por_mes[mes] = round2((row.horas_reales_por_mes[mes] ?? 0) + horas);
    }
  }

  // Entregables sin registros quedan implícitos (get → undefined); callers usan empty.
  return acc;
}

export function horasRealesEntregableOrEmpty(
  map: Map<string, HorasRealesEntregable>,
  entregableId: string,
): HorasRealesEntregable {
  return map.get(entregableId) ?? emptyResumen();
}
