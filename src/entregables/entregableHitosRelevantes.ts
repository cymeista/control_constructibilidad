/**
 * Evaluación de hitos Rev.A / Rev.B / Rev.P / Término según avance real y fechas.
 * Umbrales alineados con entregableSeguimiento (50% / 80% / 100%).
 */

import type { Entregable } from "@/context/AppDataContext";
import { dateToUtcEpoch, resolverEstadoVisualEntregable } from "@/entregables/entregableSeguimiento";
import { estadoToDonutSlice } from "@/entregables/entregableDashboardFiltros";

const EPS = 1e-6;

export type TipoHitoRelevante = "Rev.A" | "Rev.B" | "Rev.P" | "Término";

export type EstadoHitoRelevante = "Vencido" | "Próximo" | "Cumplido" | "No aplica";

export type HitoRelevanteEval = {
  tipo_hito: TipoHitoRelevante;
  fecha: string;
  umbral_avance_requerido: number;
  avance_real: number;
  estado: EstadoHitoRelevante;
  /** Mayor = más urgente (para consolidar alertas). */
  prioridad: number;
};

function hoyUtcEpoch(hoyIso: string): number | null {
  return dateToUtcEpoch(hoyIso);
}

function addDaysIso(iso: string, days: number): string {
  const ep = dateToUtcEpoch(iso);
  if (ep == null) return iso;
  const d = new Date(ep);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function definicionesHitos(ent: Entregable): Array<{ tipo: TipoHitoRelevante; fecha: string | null; umbral: number }> {
  const sinRev = ent.tipo_flujo === "SIN_REVISIONES";
  if (sinRev) {
    return [{ tipo: "Término", fecha: ent.fecha_termino ?? null, umbral: 1 }];
  }
  return [
    { tipo: "Rev.A", fecha: ent.fecha_revA, umbral: 0.5 },
    { tipo: "Rev.B", fecha: ent.fecha_revB, umbral: 0.8 },
    { tipo: "Rev.P", fecha: ent.fecha_revP, umbral: 1 },
    { tipo: "Término", fecha: ent.fecha_termino ?? null, umbral: 1 },
  ];
}

/**
 * Hitos relevantes para reporte y alertas: solo pendientes (avance &lt; umbral) vencidos o próximos.
 */
export function evaluarHitosRelevantesEntregable(
  ent: Entregable,
  hoyIso: string,
  ventanaDiasProximos = 21,
): HitoRelevanteEval[] {
  const hoy = hoyUtcEpoch(hoyIso);
  if (hoy == null) return [];

  const avanceReal = Number(ent.avance_real) || 0;
  const finProx = dateToUtcEpoch(addDaysIso(hoyIso, ventanaDiasProximos));
  const out: HitoRelevanteEval[] = [];

  for (const def of definicionesHitos(ent)) {
    const fecha = (def.fecha ?? "").trim();
    if (!fecha) {
      out.push({
        tipo_hito: def.tipo,
        fecha: "",
        umbral_avance_requerido: def.umbral,
        avance_real: avanceReal,
        estado: "No aplica",
        prioridad: 0,
      });
      continue;
    }

    const fEp = dateToUtcEpoch(fecha);
    if (fEp == null) {
      out.push({
        tipo_hito: def.tipo,
        fecha,
        umbral_avance_requerido: def.umbral,
        avance_real: avanceReal,
        estado: "No aplica",
        prioridad: 0,
      });
      continue;
    }

    if (avanceReal + EPS >= def.umbral) {
      out.push({
        tipo_hito: def.tipo,
        fecha,
        umbral_avance_requerido: def.umbral,
        avance_real: avanceReal,
        estado: "Cumplido",
        prioridad: 0,
      });
      continue;
    }

    if (fEp < hoy) {
      const diasVencido = Math.round((hoy - fEp) / (24 * 60 * 60 * 1000));
      out.push({
        tipo_hito: def.tipo,
        fecha,
        umbral_avance_requerido: def.umbral,
        avance_real: avanceReal,
        estado: "Vencido",
        prioridad: 1000 + def.umbral * 100 + Math.min(diasVencido, 99),
      });
      continue;
    }

    if (finProx != null && fEp >= hoy && fEp <= finProx) {
      const diasHasta = Math.round((fEp - hoy) / (24 * 60 * 60 * 1000));
      out.push({
        tipo_hito: def.tipo,
        fecha,
        umbral_avance_requerido: def.umbral,
        avance_real: avanceReal,
        estado: "Próximo",
        prioridad: 500 + def.umbral * 50 - Math.min(diasHasta, 30),
      });
      continue;
    }

    out.push({
      tipo_hito: def.tipo,
      fecha,
      umbral_avance_requerido: def.umbral,
      avance_real: avanceReal,
      estado: "No aplica",
      prioridad: 0,
    });
  }

  return out;
}

export function hitosPendientesEntregable(
  ent: Entregable,
  hoyIso: string,
  ventanaDiasProximos = 21,
): HitoRelevanteEval[] {
  return evaluarHitosRelevantesEntregable(ent, hoyIso, ventanaDiasProximos).filter(
    (h) => h.estado === "Vencido" || h.estado === "Próximo",
  );
}

export function sliceEstadoVisualEntregable(ent: Entregable) {
  return estadoToDonutSlice(resolverEstadoVisualEntregable(ent));
}

export function entregableEsCriticoORiesgoVisual(ent: Entregable): boolean {
  const slice = sliceEstadoVisualEntregable(ent);
  return slice === "CRITICO" || slice === "RIESGO";
}

/** Hito pendiente más urgente (un solo hito por entregable para alertas). */
export function hitoMasUrgenteEntregable(
  ent: Entregable,
  hoyIso: string,
  ventanaDiasProximos = 21,
): HitoRelevanteEval | null {
  const pendientes = hitosPendientesEntregable(ent, hoyIso, ventanaDiasProximos);
  if (pendientes.length === 0) return null;
  return pendientes.sort((a, b) => b.prioridad - a.prioridad)[0]!;
}

export type HorizonteHitosSemanas = 3 | 4 | 6;

export const HORIZONTE_HITOS_SEMANAS_DEFAULT: HorizonteHitosSemanas = 4;

export function diasHorizonteHitos(semanas: HorizonteHitosSemanas): number {
  return semanas * 7;
}

export function etiquetaHorizonteHitos(semanas: HorizonteHitosSemanas): string {
  return `${semanas} semanas`;
}

export type EstadoFilaHitoConsolidado =
  | "Vencido · Crítico"
  | "Vencido"
  | "Próximo · En riesgo"
  | "Próximo"
  | "Normal";

const ORDEN_TIPO_HITO: TipoHitoRelevante[] = ["Rev.A", "Rev.B", "Rev.P", "Término"];

/** Etiqueta consolidada (p. ej. Rev.P / Término cuando ambos aplican). */
export function etiquetaHitosConsolidada(pendientes: HitoRelevanteEval[]): string {
  const tipos = new Set(pendientes.map((p) => p.tipo_hito));
  const partes: string[] = [];
  const tieneP = tipos.has("Rev.P");
  const tieneT = tipos.has("Término");

  for (const t of ORDEN_TIPO_HITO) {
    if (t === "Rev.P" && tieneP && tieneT) {
      partes.push("Rev.P / Término");
      continue;
    }
    if (t === "Término" && tieneP && tieneT) continue;
    if (tipos.has(t)) partes.push(t);
  }
  return partes.join(" / ");
}

/** Fecha más crítica: vencida más antigua, o próxima más cercana. */
export function fechaCriticaHitosConsolidada(
  pendientes: HitoRelevanteEval[],
  hoyIso: string,
): string {
  const hoy = hoyUtcEpoch(hoyIso);
  if (hoy == null || pendientes.length === 0) return pendientes[0]?.fecha ?? "";

  const vencidos = pendientes.filter((p) => p.estado === "Vencido" && p.fecha);
  if (vencidos.length > 0) {
    return vencidos.sort((a, b) => a.fecha.localeCompare(b.fecha))[0]!.fecha;
  }
  const proximos = pendientes.filter((p) => p.estado === "Próximo" && p.fecha);
  if (proximos.length > 0) {
    return proximos.sort((a, b) => a.fecha.localeCompare(b.fecha))[0]!.fecha;
  }
  return pendientes[0]?.fecha ?? "";
}

export function estadoFilaHitosConsolidada(
  pendientes: HitoRelevanteEval[],
  ent: Entregable,
): EstadoFilaHitoConsolidado {
  const slice = sliceEstadoVisualEntregable(ent);
  const anyVencido = pendientes.some((p) => p.estado === "Vencido");
  const anyProximo = pendientes.some((p) => p.estado === "Próximo");
  if (anyVencido && slice === "CRITICO") return "Vencido · Crítico";
  if (anyVencido) return "Vencido";
  if (anyProximo && slice === "RIESGO") return "Próximo · En riesgo";
  if (anyProximo) return "Próximo";
  return "Normal";
}

export function rankEstadoFilaHitosConsolidada(estado: EstadoFilaHitoConsolidado): number {
  switch (estado) {
    case "Vencido · Crítico":
      return 0;
    case "Vencido":
      return 1;
    case "Próximo · En riesgo":
      return 2;
    case "Próximo":
      return 3;
    default:
      return 4;
  }
}

export type FilaHitosConsolidadaEntregable = {
  entregableId: string;
  fecha: string;
  hito: string;
  estado: EstadoFilaHitoConsolidado;
  pendientes: HitoRelevanteEval[];
};

/** Una fila ejecutiva por entregable (hitos pendientes consolidados). */
export function consolidarHitosEntregable(
  ent: Entregable,
  hoyIso: string,
  ventanaDiasProximos: number,
): FilaHitosConsolidadaEntregable | null {
  const pendientes = hitosPendientesEntregable(ent, hoyIso, ventanaDiasProximos);
  if (pendientes.length === 0) return null;
  return {
    entregableId: ent.id,
    fecha: fechaCriticaHitosConsolidada(pendientes, hoyIso),
    hito: etiquetaHitosConsolidada(pendientes),
    estado: estadoFilaHitosConsolidada(pendientes, ent),
    pendientes,
  };
}
