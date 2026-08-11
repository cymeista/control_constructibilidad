/**
 * Segmentos visuales derivados para Gantt Proyectos.
 * No persiste; no altera fechas oficiales ni economía.
 */

import type { Entregable } from "@/context/AppDataContext";
import type { HorasRealesEntregable } from "@/entregables/horasRealesEntregable";
import { entregableEstaCancelado } from "@/entregables/entregableCancelacion";
import {
  entregableEstaPausado,
  resolverVentanaTentativaPausa,
} from "@/entregables/entregablePausa";
import { parseLocalDateString } from "@/lib/localDate";

export type SegmentoGanttTipo =
  | "CONFIRMADO"
  | "REAL"
  | "PLANIFICADO_PREVIO"
  | "TENTATIVO";

export type SegmentoGantt = {
  desde: string;
  hasta: string;
  tipo: SegmentoGanttTipo;
  /** Horas reales del tramo REAL (si aplica). */
  horas_reales?: number;
};

export type SegmentosGanttEntregable = {
  segmentos: SegmentoGantt[];
  pausado: boolean;
  tieneTentativo: boolean;
  inconsistenciaFechaPausa: boolean;
  tieneTramoReal: boolean;
};

function isoFechaValida(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  if (!t || parseLocalDateString(t) == null) return null;
  return t;
}

export type ResolverSegmentosGanttOpciones = {
  /** Resumen DIRECTA del entregable (hasta pausa ya recortado en el helper). */
  horasReales?: HorasRealesEntregable | null;
};

/**
 * Prioridad: CANCELADO → PAUSADO → NORMAL.
 * Cancelado ignora campos de pausa (misma barra oficial que hoy).
 * Con `pausado=false`, las tentativas conservadas no generan segmentos.
 *
 * PAUSADO:
 * - Con horas reales → tramo REAL (primera→última fecha DIRECTA hasta pausa).
 * - Sin horas → fallback PLANIFICADO_PREVIO (inicio→pausa) si válido.
 * - Tentativo → reinicio→término si válido.
 */
export function resolverSegmentosGanttEntregable(
  ent: Pick<
    Entregable,
    | "fecha_inicio"
    | "fecha_termino"
    | "pausado"
    | "cancelado"
    | "fecha_pausa"
    | "fecha_reinicio_tentativa"
    | "fecha_termino_tentativa"
  >,
  opciones?: ResolverSegmentosGanttOpciones,
): SegmentosGanttEntregable {
  const inicioRaw = (ent.fecha_inicio ?? "").trim();
  const terminoRaw = (ent.fecha_termino ?? "").trim();

  // 1) CANCELADO — barra oficial; no interpretar pausa
  if (entregableEstaCancelado(ent)) {
    const segmentos: SegmentoGantt[] =
      inicioRaw && terminoRaw
        ? [{ desde: inicioRaw, hasta: terminoRaw, tipo: "CONFIRMADO" }]
        : [];
    return {
      segmentos,
      pausado: false,
      tieneTentativo: false,
      inconsistenciaFechaPausa: false,
      tieneTramoReal: false,
    };
  }

  // 2) NORMAL (o reactivado)
  if (!entregableEstaPausado(ent)) {
    const segmentos: SegmentoGantt[] =
      inicioRaw && terminoRaw
        ? [{ desde: inicioRaw, hasta: terminoRaw, tipo: "CONFIRMADO" }]
        : [];
    return {
      segmentos,
      pausado: false,
      tieneTentativo: false,
      inconsistenciaFechaPausa: false,
      tieneTramoReal: false,
    };
  }

  // 3) PAUSADO
  const segmentos: SegmentoGantt[] = [];
  const inicio = isoFechaValida(inicioRaw);
  const pausa = isoFechaValida(ent.fecha_pausa);
  let inconsistenciaFechaPausa = false;
  let tieneTramoReal = false;

  const hr = opciones?.horasReales;
  const primera = hr?.primera_fecha_hora_real ? isoFechaValida(hr.primera_fecha_hora_real) : null;
  const ultima = hr?.ultima_fecha_hora_real ? isoFechaValida(hr.ultima_fecha_hora_real) : null;
  const horasHasta =
    hr && Number.isFinite(hr.horas_reales_hasta_pausa) ? hr.horas_reales_hasta_pausa : 0;

  if (primera && ultima && horasHasta > 1e-9 && primera <= ultima) {
    segmentos.push({
      desde: primera,
      hasta: ultima,
      tipo: "REAL",
      horas_reales: horasHasta,
    });
    tieneTramoReal = true;
  } else if (inicio && pausa) {
    if (inicio <= pausa) {
      segmentos.push({ desde: inicio, hasta: pausa, tipo: "PLANIFICADO_PREVIO" });
    } else {
      inconsistenciaFechaPausa = true;
    }
  } else if (inicio && !pausa) {
    inconsistenciaFechaPausa = false;
  }

  const tent = resolverVentanaTentativaPausa(ent);
  let tieneTentativo = false;
  if (tent.ok) {
    segmentos.push({
      desde: tent.reinicio,
      hasta: tent.termino,
      tipo: "TENTATIVO",
    });
    tieneTentativo = true;
  }

  return {
    segmentos,
    pausado: true,
    tieneTentativo,
    inconsistenciaFechaPausa,
    tieneTramoReal,
  };
}
