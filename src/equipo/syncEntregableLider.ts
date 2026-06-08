import type {
  AsignacionHoraRol,
  Entregable,
  EquipoEntregable,
  EquipoEntregableOrigen,
  Profesional,
} from "@/context/AppDataContext";
import { normalizarNombreProfesional } from "@/capacidad/capacidadProfesional";
import { aplicarReglaUnicoLider } from "@/equipo/equipoEntregableRules";

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

export type SyncLiderEquipoOptions = {
  uid?: () => string;
  ts?: string;
  origenNuevaFila?: EquipoEntregableOrigen;
};

/**
 * Sincroniza `equipo_entregable` desde `entregable.lider_id` (Formularios → equipo).
 * `entregable.lider_id` manda como líder oficial.
 */
export function sincronizarLiderEntregableConEquipo(
  entregableId: string,
  liderId: string,
  equipo: EquipoEntregable[],
  profesionales: Profesional[],
  options?: SyncLiderEquipoOptions,
): EquipoEntregable[] {
  const eid = entregableId.trim();
  const lid = (liderId ?? "").trim();
  if (!eid) return equipo;

  const ts = options?.ts ?? new Date().toISOString();
  const genId = options?.uid ?? (() => `eq-${Date.now()}`);
  const origen = options?.origenNuevaFila ?? "lider_id_entregable";

  let next = [...equipo];
  const liderProf = lid ? profesionales.find((p) => p.id === lid) : undefined;
  const esPorDefinir = esProfesionalPorDefinir(liderProf);

  const demoteRealLideres = (keepProfId?: string) => {
    next = next.map((r) => {
      if ((r.entregable_id ?? "").trim() !== eid || r.rol_en_entregable !== "LIDER") return r;
      if (keepProfId && (r.profesional_id ?? "").trim() === keepProfId) return r;
      const prof = profesionales.find((p) => p.id === r.profesional_id);
      if (esProfesionalPorDefinir(prof)) return r;
      return { ...r, rol_en_entregable: "APOYO" as AsignacionHoraRol, updated_at: ts };
    });
  };

  if (!lid) {
    demoteRealLideres();
    return next;
  }

  if (esPorDefinir) {
    demoteRealLideres(lid);
    const existente = next.find(
      (r) => (r.entregable_id ?? "").trim() === eid && (r.profesional_id ?? "").trim() === lid,
    );
    if (existente) {
      next = next.map((r) =>
        r.id === existente.id
          ? { ...r, rol_en_entregable: "LIDER", updated_at: ts }
          : r,
      );
    } else {
      next.push({
        id: genId(),
        entregable_id: eid,
        profesional_id: lid,
        rol_en_entregable: "LIDER",
        origen,
        created_at: ts,
        updated_at: ts,
      });
    }
    next = aplicarReglaUnicoLider(next, eid, lid);
    return next;
  }

  next = aplicarReglaUnicoLider(next, eid, lid);
  next = removerPorDefinirDelEquipoEntregable(next, eid, lid, profesionales);

  const existente = next.find(
    (r) => (r.entregable_id ?? "").trim() === eid && (r.profesional_id ?? "").trim() === lid,
  );
  if (existente) {
    next = next.map((r) =>
      r.id === existente.id ? { ...r, rol_en_entregable: "LIDER", updated_at: ts } : r,
    );
  } else {
    next.push({
      id: genId(),
      entregable_id: eid,
      profesional_id: lid,
      rol_en_entregable: "LIDER",
      origen,
      created_at: ts,
      updated_at: ts,
    });
  }

  return next;
}

export type AuditoriaLiderEquipoItem = {
  entregable_id: string;
  entregable_nombre: string;
  lider_id: string;
  motivo: string;
};

export function auditarSincronizacionLideresConEquipo(
  entregables: Entregable[],
  equipo: EquipoEntregable[],
  profesionales: Profesional[],
): AuditoriaLiderEquipoItem[] {
  const out: AuditoriaLiderEquipoItem[] = [];

  for (const ent of entregables) {
    const eid = (ent.id ?? "").trim();
    const lid = (ent.lider_id ?? "").trim();
    if (!eid || !lid) continue;

    const liderProf = profesionales.find((p) => p.id === lid);
    const nombre = ent.nombre || eid;

    const filasEnt = (equipo ?? []).filter((r) => (r.entregable_id ?? "").trim() === eid);
    const lideres = filasEnt.filter((r) => r.rol_en_entregable === "LIDER");
    const lideresReales = lideres.filter((r) => {
      const p = profesionales.find((x) => x.id === r.profesional_id);
      return !esProfesionalPorDefinir(p);
    });

    const filaLiderOficial = filasEnt.find((r) => (r.profesional_id ?? "").trim() === lid);
    const esLiderOficial = filaLiderOficial?.rol_en_entregable === "LIDER";

    if (esProfesionalPorDefinir(liderProf)) {
      if (!esLiderOficial) {
        out.push({
          entregable_id: eid,
          entregable_nombre: nombre,
          lider_id: lid,
          motivo: "lider_id es Por Definir pero no está como LIDER en equipo_entregable",
        });
      }
      continue;
    }

    if (!filaLiderOficial) {
      out.push({
        entregable_id: eid,
        entregable_nombre: nombre,
        lider_id: lid,
        motivo: "lider_id no está declarado en equipo_entregable",
      });
    } else if (!esLiderOficial) {
      out.push({
        entregable_id: eid,
        entregable_nombre: nombre,
        lider_id: lid,
        motivo: "profesional de lider_id está en equipo pero no como LIDER",
      });
    }

    if (lideresReales.length > 1) {
      out.push({
        entregable_id: eid,
        entregable_nombre: nombre,
        lider_id: lid,
        motivo: `múltiples LIDER reales en equipo (${lideresReales.length}); prioridad lider_id`,
      });
    }
  }

  return out;
}

export function repararLideresEntregablesConEquipo(
  entregables: Entregable[],
  equipo: EquipoEntregable[],
  profesionales: Profesional[],
  options?: SyncLiderEquipoOptions,
): { equipo: EquipoEntregable[]; corregidos: number; auditados: AuditoriaLiderEquipoItem[] } {
  const auditados = auditarSincronizacionLideresConEquipo(entregables, equipo, profesionales);
  const idsCorregir = new Set(auditados.map((a) => a.entregable_id));

  let nextEquipo = [...equipo];
  let corregidos = 0;

  for (const ent of entregables) {
    if (!idsCorregir.has(ent.id)) continue;
    const antes = JSON.stringify(
      nextEquipo.filter((r) => (r.entregable_id ?? "").trim() === ent.id),
    );
    nextEquipo = sincronizarLiderEntregableConEquipo(
      ent.id,
      ent.lider_id,
      nextEquipo,
      profesionales,
      options,
    );
    const despues = JSON.stringify(
      nextEquipo.filter((r) => (r.entregable_id ?? "").trim() === ent.id),
    );
    if (antes !== despues) corregidos += 1;
  }

  return { equipo: nextEquipo, corregidos, auditados };
}
