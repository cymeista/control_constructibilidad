/**
 * Clasificación de observaciones de proyección (UI / Excel).
 * No altera el cálculo del read model; solo tipifica códigos existentes.
 */

import type {
  ProyeccionHorasObservacion,
  ProyeccionHorasSnapshot,
  ProyeccionVsCurvaMes,
} from "@/proyeccionHoras/proyeccionHorasTypes";

/** Códigos que ensucian la vista y no requieren acción de proyección. */
export const OBSERVACIONES_NO_CRITICAS = new Set<ProyeccionHorasObservacion["codigo"]>([
  "COMPLETADO",
  "SALDO_CERO",
  "PROYECTO_NO_ACTIVO",
]);

export type ObservacionProyeccionVista = {
  codigo: ProyeccionHorasObservacion["codigo"] | "SIN_CURVA";
  critica: boolean;
  proyecto_codigo: string;
  entregable_nombre: string;
  detalle: string;
  entregable_id?: string;
};

export function esObservacionCritica(codigo: ProyeccionHorasObservacion["codigo"]): boolean {
  return !OBSERVACIONES_NO_CRITICAS.has(codigo);
}

export function observacionesDesdeCurva(comparacion: ProyeccionVsCurvaMes[]): ObservacionProyeccionVista[] {
  const out: ObservacionProyeccionVista[] = [];
  const seen = new Set<string>();
  for (const c of comparacion) {
    if (!c.observacion && c.fuente_curva !== "sin_curva") continue;
    const key = c.observacion ?? `sin_curva:${c.mes}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      codigo: "SIN_CURVA",
      critica: true,
      proyecto_codigo: "—",
      entregable_nombre: c.mes,
      detalle: c.observacion ?? `No hay curva objetivo para el mes ${c.mes}.`,
    });
  }
  return out;
}

export function clasificarObservacionesSnapshot(snapshot: ProyeccionHorasSnapshot): {
  criticas: ObservacionProyeccionVista[];
  noCriticas: ObservacionProyeccionVista[];
  nCompletados: number;
} {
  const criticas: ObservacionProyeccionVista[] = [];
  const noCriticas: ObservacionProyeccionVista[] = [];
  let nCompletados = 0;

  for (const o of snapshot.observaciones) {
    const item: ObservacionProyeccionVista = {
      codigo: o.codigo,
      critica: esObservacionCritica(o.codigo),
      proyecto_codigo: o.proyecto_codigo,
      entregable_nombre: o.entregable_nombre,
      detalle: o.detalle,
      entregable_id: o.entregable_id,
    };
    if (o.codigo === "COMPLETADO") nCompletados += 1;
    if (item.critica) criticas.push(item);
    else noCriticas.push(item);
  }

  for (const c of observacionesDesdeCurva(snapshot.comparacion_curva)) {
    criticas.push(c);
  }

  return { criticas, noCriticas, nCompletados };
}

export function etiquetaObservacionVista(codigo: ObservacionProyeccionVista["codigo"]): string {
  switch (codigo) {
    case "SIN_FECHAS":
      return "Sin fechas";
    case "FECHAS_INVALIDAS":
      return "Fechas inválidas";
    case "SALDO_CERO":
      return "Saldo cero";
    case "COMPLETADO":
      return "Completado";
    case "PROYECTO_NO_ACTIVO":
      return "Proyecto no activo";
    case "ENTREGABLE_CANCELADO":
      return "Entregable cancelado";
    case "SALDO_PAUSADO_SIN_PROGRAMACION":
      return "Pausado sin programación";
    case "PAUSA_FECHAS_TENTATIVAS_INVALIDAS":
      return "Pausa: fechas tentativas inválidas";
    case "HORAS_POSTERIORES_A_PAUSA":
      return "Horas posteriores a pausa";
    case "FUERA_HORIZONTE":
      return "Fuera de horizonte";
    case "SIN_DIAS_HABILES":
      return "Sin días hábiles / sin ventana futura";
    case "SALDO_VENCIDO":
      return "Saldo vencido";
    case "SIN_CURVA":
      return "Sin curva objetivo";
    default:
      return codigo;
  }
}
