/**
 * Bloque 4.2: consolidación de consumo real (hrs_gastadas / uf_consumidas) desde RegistroHora.
 * No modifica presupuesto ni estado; solo agrega campos de consumo por entregable.
 */

export type RegistroHoraConsumoInput = {
  tipo_hora: "DIRECTA" | "INDIRECTA" | "VACACIONES";
  proyecto_id: string | null;
  entregable_id: string | null;
  profesional_id: string;
  horas: number;
};

export type EntregableConsumoTarget = {
  id: string;
  proyecto_id: string;
};

export type ProyectoTarifasInput = {
  id: string;
  tarifa_l2: number;
  tarifa_p4: number;
  tarifa_p3: number;
  tarifa_p2: number;
};

export type ProfesionalCargoInput = {
  id: string;
  cargo: string;
};

function tarifaUfPorCargo(proyecto: ProyectoTarifasInput, cargo: string): number {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0);
  switch (cargo) {
    case "L2":
      return n(proyecto.tarifa_l2);
    case "P4":
      return n(proyecto.tarifa_p4);
    case "P3":
      return n(proyecto.tarifa_p3);
    case "P2":
      return n(proyecto.tarifa_p2);
    default:
      return 0;
  }
}

/** Misma semántica que Bloque 4.1: solo DIRECTA con imputación coherente cuenta como consumo real. */
export function esRegistroConsumoRealValido(
  r: RegistroHoraConsumoInput,
  entById: Map<string, EntregableConsumoTarget>,
  projById: Map<string, ProyectoTarifasInput>,
  profById: Map<string, ProfesionalCargoInput>,
): boolean {
  if (r.tipo_hora !== "DIRECTA") return false;
  const horas = Number(r.horas);
  if (!Number.isFinite(horas) || horas <= 0) return false;

  const pid = (r.proyecto_id ?? "").trim();
  const eid = (r.entregable_id ?? "").trim();
  const profId = (r.profesional_id ?? "").trim();
  if (!pid || !eid || !profId) return false;

  const ent = entById.get(eid);
  if (!ent || ent.proyecto_id !== pid) return false;

  if (!projById.has(pid)) return false;
  if (!profById.has(profId)) return false;

  return true;
}

export type TotalesConsumoEntregable = { hrs_gastadas: number; uf_consumidas: number };

/**
 * Agregación pura: totales por entregable_id a partir de registros válidos.
 */
export function aggregateConsumoRealPorEntregableId(
  registro_horas: RegistroHoraConsumoInput[],
  entregables: EntregableConsumoTarget[],
  proyectos: ProyectoTarifasInput[],
  profesionales: ProfesionalCargoInput[],
): Map<string, TotalesConsumoEntregable> {
  const entById = new Map(entregables.map((e) => [e.id, e]));
  const projById = new Map(proyectos.map((p) => [p.id, p]));
  const profById = new Map(profesionales.map((p) => [p.id, p]));

  const acc = new Map<string, { hrs: number; uf: number }>();

  for (const r of registro_horas) {
    if (!esRegistroConsumoRealValido(r, entById, projById, profById)) continue;

    const eid = (r.entregable_id ?? "").trim();
    const pid = (r.proyecto_id ?? "").trim();
    const profId = (r.profesional_id ?? "").trim();
    const proj = projById.get(pid)!;
    const prof = profById.get(profId)!;

    const tarifa = tarifaUfPorCargo(proj, prof.cargo);
    const ufReg = r.horas * tarifa;

    const cur = acc.get(eid) ?? { hrs: 0, uf: 0 };
    acc.set(eid, { hrs: cur.hrs + r.horas, uf: cur.uf + ufReg });
  }

  return new Map(
    [...acc.entries()].map(([id, v]) => [id, { hrs_gastadas: v.hrs, uf_consumidas: v.uf }]),
  );
}

/**
 * Devuelve una copia de `entregables` con hrs_gastadas y uf_consumidas recalculadas desde registros.
 * Entregables sin registros válidos quedan en 0 / 0.
 */
export function recomputarConsumoEnEntregables<E extends EntregableConsumoTarget>(
  entregables: E[],
  registro_horas: RegistroHoraConsumoInput[],
  proyectos: ProyectoTarifasInput[],
  profesionales: ProfesionalCargoInput[],
): E[] {
  const totals = aggregateConsumoRealPorEntregableId(registro_horas, entregables, proyectos, profesionales);
  return entregables.map((e) => {
    const t = totals.get(e.id) ?? { hrs_gastadas: 0, uf_consumidas: 0 };
    return { ...e, hrs_gastadas: t.hrs_gastadas, uf_consumidas: t.uf_consumidas };
  });
}
