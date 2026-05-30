import type { AsignacionHoraRol, EquipoEntregable } from "@/context/AppDataContext";

/** Aplica regla de un solo LIDER por entregable: el anterior pasa a APOYO. */
export function aplicarReglaUnicoLider(
  equipo: EquipoEntregable[],
  entregableId: string,
  nuevoLiderProfesionalId: string,
  excludeEquipoId?: string,
): EquipoEntregable[] {
  const eid = entregableId.trim();
  const lid = nuevoLiderProfesionalId.trim();
  return equipo.map((row) => {
    if ((row.entregable_id ?? "").trim() !== eid) return row;
    if (excludeEquipoId && row.id === excludeEquipoId) return row;
    if (row.profesional_id === lid) return row;
    if (row.rol_en_entregable === "LIDER") {
      return { ...row, rol_en_entregable: "APOYO" as AsignacionHoraRol };
    }
    return row;
  });
}
