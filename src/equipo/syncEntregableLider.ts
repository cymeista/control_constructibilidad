import type { Entregable, EquipoEntregable, Profesional } from "@/context/AppDataContext";
import { normalizarNombreProfesional } from "@/capacidad/capacidadProfesional";

export function esProfesionalPorDefinirNombre(nombre: string): boolean {
  const n = normalizarNombreProfesional(nombre);
  return n === "por definir" || n.includes("por definir");
}

export function esProfesionalPorDefinir(prof: Profesional | undefined): boolean {
  if (!prof) return false;
  return esProfesionalPorDefinirNombre(prof.nombre_completo);
}

export function findProfesionalPorDefinirId(profesionales: Profesional[]): string | null {
  const p = profesionales.find((x) => esProfesionalPorDefinir(x));
  return p?.id?.trim() || null;
}

/**
 * `entregable.lider_id` alineado con el único LIDER operativo en `equipo_entregable`.
 * Sin líder en equipo → placeholder «Por Definir» si existe en catálogo.
 */
export function resolverLiderIdEntregableDesdeEquipo(
  entregableId: string,
  equipo: EquipoEntregable[],
  profesionales: Profesional[],
): string {
  const eid = entregableId.trim();
  const liderRow = equipo.find(
    (e) => (e.entregable_id ?? "").trim() === eid && e.rol_en_entregable === "LIDER",
  );
  if (liderRow) {
    const prof = profesionales.find((p) => p.id === liderRow.profesional_id);
    if (!esProfesionalPorDefinir(prof)) {
      return liderRow.profesional_id;
    }
  }
  return findProfesionalPorDefinirId(profesionales) ?? "";
}

/** Quita filas «Por Definir» del equipo al asignar un líder real (menos invasivo que dejarlo LIDER). */
export function removerPorDefinirDelEquipoEntregable(
  equipo: EquipoEntregable[],
  entregableId: string,
  nuevoLiderProfesionalId: string,
  profesionales: Profesional[],
): EquipoEntregable[] {
  const eid = entregableId.trim();
  const nlid = nuevoLiderProfesionalId.trim();
  return equipo.filter((row) => {
    if ((row.entregable_id ?? "").trim() !== eid) return true;
    if ((row.profesional_id ?? "").trim() === nlid) return true;
    const prof = profesionales.find((p) => p.id === row.profesional_id);
    return !esProfesionalPorDefinir(prof);
  });
}

export function sincronizarEntregablesLiderId(
  entregables: Entregable[],
  entregableId: string,
  equipo: EquipoEntregable[],
  profesionales: Profesional[],
  updatedAt: string,
): Entregable[] {
  const nuevoLiderId = resolverLiderIdEntregableDesdeEquipo(entregableId, equipo, profesionales);
  return entregables.map((ent) => {
    if (ent.id !== entregableId) return ent;
    if (ent.lider_id === nuevoLiderId) return ent;
    return { ...ent, lider_id: nuevoLiderId, updated_at: updatedAt };
  });
}
