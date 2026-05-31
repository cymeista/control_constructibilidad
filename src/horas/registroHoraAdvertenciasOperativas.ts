/**
 * Advertencias no bloqueantes para alta/import de RegistroHora (modelo operativo:
 * equipo_entregable + presupuesto por categoría). No modifica datos ni bloquea guardado.
 */

import type {
  AsignacionHoraCategoria,
  Entregable,
  EquipoEntregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import { buildConsumoMaps } from "@/entregables/asignacionHoraConsumo";
import { esRegistroConsumoRealValido } from "@/entregables/registroHoraConsumo";
import {
  buildControlCategoriasEntregable,
  gastoRealPorCategoriaDesdeMapaProf,
  toCategoriaProfesional,
} from "@/horas/entregableControlCategoria";

export const MSG_PROFESIONAL_FUERA_EQUIPO =
  "Profesional no declarado en equipo del entregable.";

export function profesionalDeclaradoEnEquipoEntregable(
  entregableId: string,
  profesionalId: string,
  equipo_entregable: EquipoEntregable[],
): boolean {
  const eid = (entregableId ?? "").trim();
  const pid = (profesionalId ?? "").trim();
  if (!eid || !pid) return false;
  return (equipo_entregable ?? []).some(
    (e) => (e.entregable_id ?? "").trim() === eid && (e.profesional_id ?? "").trim() === pid,
  );
}

export type RegistroHoraExtraGastoDirecto = {
  entregable_id: string;
  profesional_id: string;
  proyecto_id: string;
  horas: number;
};

/** Gasto DIRECTA válido por entregable → profesional (registros existentes + extras simulados). */
export function buildGastoProfesionalPorEntregableId(
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  extras: RegistroHoraExtraGastoDirecto[] = [],
): Map<string, Map<string, number>> {
  const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);
  const out = new Map<string, Map<string, number>>();

  const add = (eid: string, pid: string, horas: number) => {
    if (!eid || !pid || !Number.isFinite(horas) || horas <= 0) return;
    if (!out.has(eid)) out.set(eid, new Map());
    const m = out.get(eid)!;
    m.set(pid, (m.get(pid) ?? 0) + horas);
  };

  for (const r of registro_horas) {
    if (
      !esRegistroConsumoRealValido(
        {
          tipo_hora: r.tipo_hora,
          proyecto_id: r.proyecto_id,
          entregable_id: r.entregable_id,
          profesional_id: r.profesional_id,
          horas: r.horas,
        },
        entById,
        projById,
        profById,
      )
    ) {
      continue;
    }
    add((r.entregable_id ?? "").trim(), (r.profesional_id ?? "").trim(), Number(r.horas));
  }

  for (const x of extras) {
    const input = {
      tipo_hora: "DIRECTA" as const,
      proyecto_id: x.proyecto_id,
      entregable_id: x.entregable_id,
      profesional_id: x.profesional_id,
      horas: x.horas,
    };
    if (!esRegistroConsumoRealValido(input, entById, projById, profById)) continue;
    add((x.entregable_id ?? "").trim(), (x.profesional_id ?? "").trim(), Number(x.horas));
  }

  return out;
}

export function mensajeAdvertenciaDeficitCategoria(
  ent: Entregable,
  categoria: AsignacionHoraCategoria,
  gastoProfPorEntregable: Map<string, Map<string, number>>,
  profMap: Map<string, Profesional>,
  opts?: { sufijoPresupuesto?: boolean },
): string | null {
  const eid = ent.id;
  const gastoProf = gastoProfPorEntregable.get(eid) ?? new Map<string, number>();
  const gastoCat = gastoRealPorCategoriaDesdeMapaProf(gastoProf, profMap);
  const rows = buildControlCategoriasEntregable(ent, gastoCat);
  const row = rows.find((r) => r.categoria === categoria);
  if (!row || row.estado === "OK") return null;
  const h = row.deficitHoras;
  const fmt = h.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  if (opts?.sufijoPresupuesto) {
    return `La categoría ${categoria} quedará con déficit de ${fmt} h respecto al presupuesto.`;
  }
  return `La categoría ${categoria} quedará con déficit de ${fmt} h.`;
}

export type AdvertenciasOperativasRegistroDirectaInput = {
  entregable_id: string;
  profesional_id: string;
  proyecto_id: string;
  horas: number;
};

export function advertenciasOperativasRegistroDirecta(
  input: AdvertenciasOperativasRegistroDirectaInput,
  ctx: {
    entregables: Entregable[];
    profesionales: Profesional[];
    proyectos: Proyecto[];
    registro_horas: RegistroHora[];
    equipo_entregable: EquipoEntregable[];
    /** Registros DIRECTA adicionales ya incluidos en la simulación (p. ej. lote CSV o fila en edición). */
    extrasSimulacion?: RegistroHoraExtraGastoDirecto[];
    sufijoPresupuestoManual?: boolean;
  },
): string[] {
  const eid = (input.entregable_id ?? "").trim();
  const pid = (input.profesional_id ?? "").trim();
  if (!eid || !pid) return [];

  const warnings: string[] = [];
  const ent = ctx.entregables.find((e) => e.id === eid);
  const prof = ctx.profesionales.find((p) => p.id === pid);
  if (!ent || !prof) return warnings;

  if (!profesionalDeclaradoEnEquipoEntregable(eid, pid, ctx.equipo_entregable)) {
    warnings.push(MSG_PROFESIONAL_FUERA_EQUIPO);
  }

  const cat = toCategoriaProfesional(prof.cargo);
  const profMap = new Map(ctx.profesionales.map((p) => [p.id, p]));
  const gastoMap = buildGastoProfesionalPorEntregableId(
    ctx.registro_horas,
    ctx.entregables,
    ctx.proyectos,
    ctx.profesionales,
    ctx.extrasSimulacion ?? [],
  );

  const msgDef = mensajeAdvertenciaDeficitCategoria(ent, cat, gastoMap, profMap, {
    sufijoPresupuesto: ctx.sufijoPresupuestoManual,
  });
  if (msgDef) warnings.push(msgDef);

  return warnings;
}

/** Aplica advertencias operativas a filas OK del preview CSV (simula el lote completo sobre gasto actual). */
export function enrichRegistroHoraImportPreviewConAdvertencias<
  R extends { status: string; payload?: { entregable_id: string | null; profesional_id: string; proyecto_id: string | null; horas: number; tipo_hora: string }; warnings?: string[] },
>(
  rows: R[],
  ctx: {
    entregables: Entregable[];
    profesionales: Profesional[];
    proyectos: Proyecto[];
    registro_horas: RegistroHora[];
    equipo_entregable: EquipoEntregable[];
  },
): R[] {
  const batchExtras: RegistroHoraExtraGastoDirecto[] = rows
    .filter((r) => r.status === "OK" && r.payload?.tipo_hora === "DIRECTA")
    .map((r) => ({
      entregable_id: (r.payload!.entregable_id ?? "").trim(),
      profesional_id: (r.payload!.profesional_id ?? "").trim(),
      proyecto_id: (r.payload!.proyecto_id ?? "").trim(),
      horas: Number(r.payload!.horas),
    }))
    .filter((x) => x.entregable_id && x.profesional_id && x.proyecto_id && x.horas > 0);

  return rows.map((row) => {
    if (row.status !== "OK" || !row.payload || row.payload.tipo_hora !== "DIRECTA") {
      return { ...row, warnings: row.warnings ?? [] };
    }
    const eid = (row.payload.entregable_id ?? "").trim();
    const pid = (row.payload.profesional_id ?? "").trim();
    const pidProj = (row.payload.proyecto_id ?? "").trim();
    if (!eid || !pid || !pidProj) return { ...row, warnings: [] };

    const warnings = advertenciasOperativasRegistroDirecta(
      {
        entregable_id: eid,
        profesional_id: pid,
        proyecto_id: pidProj,
        horas: Number(row.payload.horas),
      },
      { ...ctx, extrasSimulacion: batchExtras },
    );
    return { ...row, warnings };
  });
}
