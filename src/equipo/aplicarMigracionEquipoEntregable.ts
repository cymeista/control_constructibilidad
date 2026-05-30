import type { EquipoEntregable, EquipoEntregableOrigen } from "@/context/AppDataContext";
import type { IntegranteOrigenEquipo, PreviewMigracionEquipoEntregable } from "@/equipo/previewMigracionEquipoEntregable";

export type ResumenAplicacionMigracionEquipo = {
  integrantes_creados: number;
  integrantes_omitidos_duplicado: number;
  integrantes_actualizados_rol: number;
  lideres_creados: number;
  apoyos_creados: number;
  conflictos_multiples_lideres: number;
  conflictos_lider_id_vs_asignaciones: number;
  duplicados_resueltos_en_preview: number;
  sugeridos_gasto_no_aplicados: number;
  observaciones: string[];
};

function rolPrioridad(rol: "LIDER" | "APOYO"): number {
  return rol === "LIDER" ? 2 : 1;
}

function mapOrigenMigracion(origenes: IntegranteOrigenEquipo[]): EquipoEntregableOrigen {
  if (origenes.includes("asignacion_activa")) return "migracion_asignacion_activa";
  if (origenes.includes("asignacion_cerrada")) return "migracion_asignacion_cerrada";
  if (origenes.includes("lider_id_entregable")) return "lider_id_entregable";
  return "migracion_asignacion_activa";
}

export function aplicarMigracionEquipoEntregableDesdePreview(
  equipoActual: EquipoEntregable[],
  preview: PreviewMigracionEquipoEntregable,
  nowIso: string,
  newId: () => string,
): { equipo: EquipoEntregable[]; resumen: ResumenAplicacionMigracionEquipo } {
  const equipo = [...equipoActual];
  const index = new Map<string, number>();
  for (let i = 0; i < equipo.length; i++) {
    const row = equipo[i];
    const key = `${(row.entregable_id ?? "").trim()}\0${(row.profesional_id ?? "").trim()}`;
    if (key !== "\0") index.set(key, i);
  }

  const resumen: ResumenAplicacionMigracionEquipo = {
    integrantes_creados: 0,
    integrantes_omitidos_duplicado: 0,
    integrantes_actualizados_rol: 0,
    lideres_creados: 0,
    apoyos_creados: 0,
    conflictos_multiples_lideres: preview.resumen.conflictos_multiples_lideres,
    conflictos_lider_id_vs_asignaciones: preview.resumen.conflictos_lider_id_vs_asignaciones,
    duplicados_resueltos_en_preview: preview.resumen.duplicados_resueltos_automaticamente,
    sugeridos_gasto_no_aplicados: preview.resumen.profesionales_gasto_sin_equipo,
    observaciones: [],
  };

  for (const fila of preview.filas) {
    const eid = fila.entregable_id.trim();
    if (!eid) continue;

    for (const integrante of fila.integrantes) {
      const pid = integrante.profesional_id.trim();
      if (!pid) continue;

      const key = `${eid}\0${pid}`;
      const rolNuevo = integrante.rol;
      const origen = mapOrigenMigracion(integrante.origenes);
      const idx = index.get(key);

      if (idx === undefined) {
        const row: EquipoEntregable = {
          id: newId(),
          entregable_id: eid,
          profesional_id: pid,
          rol_en_entregable: rolNuevo,
          origen,
          created_at: nowIso,
          updated_at: nowIso,
        };
        index.set(key, equipo.length);
        equipo.push(row);
        resumen.integrantes_creados += 1;
        if (rolNuevo === "LIDER") resumen.lideres_creados += 1;
        else resumen.apoyos_creados += 1;
        continue;
      }

      resumen.integrantes_omitidos_duplicado += 1;
      const existente = equipo[idx];
      if (rolPrioridad(rolNuevo) > rolPrioridad(existente.rol_en_entregable)) {
        equipo[idx] = {
          ...existente,
          rol_en_entregable: rolNuevo,
          origen: existente.origen ?? origen,
          updated_at: nowIso,
        };
        resumen.integrantes_actualizados_rol += 1;
        resumen.observaciones.push(
          `Actualizado rol a ${rolNuevo} para profesional ${pid} en entregable ${eid}.`,
        );
      }
    }
  }

  return { equipo, resumen };
}

/** Estimación previa a confirmar: misma lógica que `aplicarMigracionEquipoEntregableDesdePreview`, sin persistir. */
export function estimarAplicacionMigracionEquipoEntregable(
  equipoActual: EquipoEntregable[],
  preview: PreviewMigracionEquipoEntregable,
): ResumenAplicacionMigracionEquipo {
  return aplicarMigracionEquipoEntregableDesdePreview(equipoActual, preview, "", () => "__estimacion__").resumen;
}
