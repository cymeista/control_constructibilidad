/**
 * Regla única: no eliminar proyectos con gasto en RegistroHora (proyecto_id o entregable del proyecto).
 */

export const MENSAJE_BLOQUEO_PROYECTO_POR_REGISTRO_HORAS =
  "Este proyecto tiene horas registradas. Antes de eliminarlo debe reimputar o corregir esas horas.";

export type EntregableMin = { id: string; proyecto_id: string; nombre: string };

export type RegistroHoraMin = {
  proyecto_id?: string | null;
  entregable_id?: string | null;
  horas?: number;
};

export type ProyectoMin = { id: string; codigo: string; nombre: string };

export type AnalisisBloqueoEliminacionProyectos = {
  bloqueado: boolean;
  nRegistros: number;
  totalHoras: number;
  entregablesConGasto: { id: string; nombre: string; horas: number }[];
  proyectosConGasto: { id: string; codigo: string; nombre: string }[];
};

const entByIdMap = (entregables: EntregableMin[]): Map<string, EntregableMin> =>
  new Map(entregables.map((e) => [e.id, e]));

/**
 * Indica si la eliminación en cascada de los proyectos dados debe bloquearse por `registro_horas`.
 */
export function analizarBloqueoEliminacionProyectos(
  proyectoIds: string[],
  entregables: EntregableMin[],
  registro_horas: RegistroHoraMin[],
  proyectosCatalog: ProyectoMin[],
): AnalisisBloqueoEliminacionProyectos {
  const idSet = new Set(proyectoIds.map((x) => String(x).trim()).filter(Boolean));
  if (idSet.size === 0) {
    return {
      bloqueado: false,
      nRegistros: 0,
      totalHoras: 0,
      entregablesConGasto: [],
      proyectosConGasto: [],
    };
  }

  const entregablesDelLote = entregables.filter((e) => idSet.has(e.proyecto_id));
  const entSet = new Set(entregablesDelLote.map((e) => e.id));
  const entMap = entByIdMap(entregables);

  const registrosAsociados = registro_horas.filter((r) => {
    const pid = (r.proyecto_id ?? "").trim();
    const eid = (r.entregable_id ?? "").trim();
    return (pid && idSet.has(pid)) || (eid && entSet.has(eid));
  });

  if (registrosAsociados.length === 0) {
    return {
      bloqueado: false,
      nRegistros: 0,
      totalHoras: 0,
      entregablesConGasto: [],
      proyectosConGasto: [],
    };
  }

  const totalHoras = registrosAsociados.reduce((acc, r) => acc + (Number(r.horas) || 0), 0);

  const entregablesConGasto = entregablesDelLote
    .map((e) => {
      const horas = registrosAsociados
        .filter((r) => (r.entregable_id ?? "").trim() === e.id)
        .reduce((acc, r) => acc + (Number(r.horas) || 0), 0);
      return { id: e.id, nombre: e.nombre, horas };
    })
    .filter((x) => x.horas > 0)
    .sort((a, b) => b.horas - a.horas);

  const pidsConGasto = new Set<string>();
  for (const r of registrosAsociados) {
    const pid = (r.proyecto_id ?? "").trim();
    if (pid && idSet.has(pid)) pidsConGasto.add(pid);
    const eid = (r.entregable_id ?? "").trim();
    if (eid) {
      const ent = entMap.get(eid);
      if (ent && idSet.has(ent.proyecto_id)) pidsConGasto.add(ent.proyecto_id);
    }
  }

  const proyMap = new Map(proyectosCatalog.map((p) => [p.id, p]));
  const proyectosConGasto = [...pidsConGasto]
    .map((id) => {
      const p = proyMap.get(id);
      return p
        ? { id: p.id, codigo: p.codigo, nombre: p.nombre }
        : { id, codigo: id, nombre: "—" };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  return {
    bloqueado: true,
    nRegistros: registrosAsociados.length,
    totalHoras,
    entregablesConGasto,
    proyectosConGasto,
  };
}
