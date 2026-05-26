/**
 * Alertas puntuales de normalización en tabla Registro de Horas (sin ventanas temporales).
 * Detección por triple prof + entregable + categoría; marcado en una sola fila por problema.
 */

import type {
  AsignacionHora,
  AsignacionHoraCategoria,
  Entregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import { sumaHorasComprometidasActivasYCerradasProfEntregableCategoria } from "@/entregables/asignacionAlertasBloque4Formularios";
import {
  buildConsumoMaps,
  sumaGastoRealDirectoValidoProfesionalEntregable,
} from "@/entregables/asignacionHoraConsumo";
import { esRegistroConsumoRealValido, type RegistroHoraConsumoInput } from "@/entregables/registroHoraConsumo";

const EPS = 1e-6;

export type AlertaNormalizacionRegistroFila =
  | {
      kind: "sin_asignacion";
      horasSugeridas: number;
      gastoRealTotal: number;
      clienteId: string;
      proyectoId: string;
    }
  | {
      kind: "deficit";
      deficit: number;
      horasSugeridas: number;
      clienteId: string;
      proyectoId: string;
    };

function esCategoriaAsignacion(c: string): c is AsignacionHoraCategoria {
  return c === "L2" || c === "P4" || c === "P3" || c === "P2";
}

function registroConsumoInput(r: RegistroHora): RegistroHoraConsumoInput {
  return {
    tipo_hora: r.tipo_hora,
    proyecto_id: r.proyecto_id,
    entregable_id: r.entregable_id,
    profesional_id: r.profesional_id,
    horas: r.horas,
  };
}

function compareRegistrosPorFechaAsc(a: RegistroHora, b: RegistroHora): number {
  const fa = (a.fecha ?? "").trim();
  const fb = (b.fecha ?? "").trim();
  if (fa !== fb) return fa < fb ? -1 : 1;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

type FilaDirectaValida = {
  registro: RegistroHora;
  horas: number;
};

/**
 * Por cada RegistroHora DIRECTA que requiere acción, devuelve la alerta puntual (como máximo una por triple).
 */
export function buildMapaAlertaNormalizacionPorRegistroId(
  registro_horas: RegistroHora[],
  asignaciones_horas: AsignacionHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): Map<string, AlertaNormalizacionRegistroFila> {
  const maps = buildConsumoMaps(entregables, proyectos, profesionales);
  const { entById, projById, profById } = maps;
  const entMap = new Map(entregables.map((e) => [e.id, e]));
  const projMap = new Map(proyectos.map((p) => [p.id, p]));

  const porTriple = new Map<string, FilaDirectaValida[]>();

  for (const r of registro_horas) {
    const input = registroConsumoInput(r);
    if (!esRegistroConsumoRealValido(input, entById, projById, profById)) continue;

    const pid = (r.profesional_id ?? "").trim();
    const eid = (r.entregable_id ?? "").trim();
    const prof = profesionales.find((p) => p.id === pid);
    if (!prof || !esCategoriaAsignacion(prof.cargo)) continue;

    const horas = Number(r.horas);
    if (!Number.isFinite(horas) || horas <= 0) continue;

    const k = `${pid}\x00${eid}\x00${prof.cargo}`;
    const arr = porTriple.get(k) ?? [];
    arr.push({ registro: r, horas });
    porTriple.set(k, arr);
  }

  const out = new Map<string, AlertaNormalizacionRegistroFila>();

  for (const [k, filasRaw] of porTriple) {
    const parts = k.split("\x00");
    const pid = parts[0]!;
    const eid = parts[1]!;
    const cat = parts[2]! as AsignacionHoraCategoria;

    const ent = entMap.get(eid);
    const proyectoId = (ent?.proyecto_id ?? "").trim();
    const pr = proyectoId ? projMap.get(proyectoId) : undefined;
    const clienteId = (pr?.cliente_id ?? "").trim();
    if (!proyectoId || !clienteId) continue;

    const horasAsignadas = sumaHorasComprometidasActivasYCerradasProfEntregableCategoria(
      asignaciones_horas,
      pid,
      eid,
      cat,
    );
    const gastoRealTotal = sumaGastoRealDirectoValidoProfesionalEntregable(
      pid,
      eid,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
    );

    if (gastoRealTotal <= horasAsignadas + EPS) continue;

    const filas = [...filasRaw].sort((a, b) => compareRegistrosPorFechaAsc(a.registro, b.registro));

    if (horasAsignadas <= EPS) {
      const ultima = filas[filas.length - 1]!;
      out.set(ultima.registro.id, {
        kind: "sin_asignacion",
        horasSugeridas: gastoRealTotal,
        gastoRealTotal,
        clienteId,
        proyectoId,
      });
      continue;
    }

    let acumulado = 0;
    let filaDeficit: FilaDirectaValida | null = null;
    for (const f of filas) {
      acumulado += f.horas;
      if (acumulado > horasAsignadas + EPS && !filaDeficit) {
        filaDeficit = f;
        break;
      }
    }

    if (!filaDeficit) continue;

    const deficit = Math.max(0, gastoRealTotal - horasAsignadas);
    out.set(filaDeficit.registro.id, {
      kind: "deficit",
      deficit,
      horasSugeridas: deficit,
      clienteId,
      proyectoId,
    });
  }

  return out;
}
