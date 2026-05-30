import type {
  AsignacionHoraCategoria,
  Entregable,
  EquipoEntregable,
  Profesional,
} from "@/context/AppDataContext";

export const CATEGORIAS_CONTROL: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];

export type CategoriaControlEstado = "OK" | "DEFICIT" | "SIN_PRESUPUESTO_CON_GASTO";

export type CategoriaControlRow = {
  categoria: AsignacionHoraCategoria;
  presupuesto: number;
  gastoReal: number;
  saldo: number;
  deficitHoras: number;
  estado: CategoriaControlEstado;
};

export function toCategoriaProfesional(cargo: string): AsignacionHoraCategoria {
  return CATEGORIAS_CONTROL.includes(cargo as AsignacionHoraCategoria)
    ? (cargo as AsignacionHoraCategoria)
    : "P4";
}

export function presupuestoCategoriaEntregable(ent: Entregable, cat: AsignacionHoraCategoria): number {
  switch (cat) {
    case "L2":
      return Number(ent.hrs_l2);
    case "P4":
      return Number(ent.hrs_p4);
    case "P3":
      return Number(ent.hrs_p3);
    case "P2":
      return Number(ent.hrs_p2);
    default:
      return 0;
  }
}

export function gastoRealPorCategoriaDesdeMapaProf(
  gastoProf: Map<string, number>,
  profMap: Map<string, Profesional>,
): Map<AsignacionHoraCategoria, number> {
  const gastoCategoria = new Map<AsignacionHoraCategoria, number>(
    CATEGORIAS_CONTROL.map((c) => [c, 0]),
  );
  gastoProf.forEach((h, pid) => {
    const prof = profMap.get(pid);
    if (!prof) return;
    const cat = toCategoriaProfesional(prof.cargo);
    gastoCategoria.set(cat, (gastoCategoria.get(cat) ?? 0) + h);
  });
  return gastoCategoria;
}

export function buildControlCategoriasEntregable(
  ent: Entregable,
  gastoCategoria: Map<AsignacionHoraCategoria, number>,
): CategoriaControlRow[] {
  return CATEGORIAS_CONTROL.map((categoria) => {
    const presupuesto = presupuestoCategoriaEntregable(ent, categoria);
    const gastoReal = gastoCategoria.get(categoria) ?? 0;
    const saldo = presupuesto - gastoReal;
    let estado: CategoriaControlEstado = "OK";
    let deficitHoras = 0;
    if (presupuesto <= 0 && gastoReal > 0) {
      estado = "SIN_PRESUPUESTO_CON_GASTO";
      deficitHoras = gastoReal;
    } else if (gastoReal > presupuesto + 1e-9) {
      estado = "DEFICIT";
      deficitHoras = gastoReal - presupuesto;
    }
    return { categoria, presupuesto, gastoReal, saldo, deficitHoras, estado };
  });
}

export function entregableTieneDeficitCategoria(rows: CategoriaControlRow[]): boolean {
  return rows.some((r) => r.estado === "DEFICIT" || r.estado === "SIN_PRESUPUESTO_CON_GASTO");
}

export type ProfesionalGastoEnCategoria = {
  profesional_id: string;
  nombre: string;
  horasReales: number;
  /** % del presupuesto de la categoría consumido por el profesional; null si presupuesto = 0. */
  pctPresupCategoria: number | null;
  enEquipo: boolean;
};

/** horas reales del profesional / presupuesto total de la categoría del entregable */
export function pctConsumoPresupuestoCategoria(
  horasReales: number,
  presupuestoCategoria: number,
): number | null {
  if (presupuestoCategoria <= 0) return null;
  return Math.round((horasReales / presupuestoCategoria) * 10000) / 100;
}

/** Gasto DIRECTA válido por profesional en una categoría (sin asignaciones_horas). */
export function listarProfesionalesGastoPorCategoria(
  entregableId: string,
  categoria: AsignacionHoraCategoria,
  presupuestoCategoria: number,
  gastoProf: Map<string, number>,
  profMap: Map<string, Profesional>,
  equipo_entregable: EquipoEntregable[],
): ProfesionalGastoEnCategoria[] {
  const enEquipo = new Set(
    equipo_entregable
      .filter((e) => (e.entregable_id ?? "").trim() === entregableId)
      .map((e) => e.profesional_id),
  );

  const filas: { profesional_id: string; nombre: string; horasReales: number }[] = [];

  gastoProf.forEach((horasReales, profesional_id) => {
    if (horasReales <= 0) return;
    const prof = profMap.get(profesional_id);
    if (!prof) return;
    if (toCategoriaProfesional(prof.cargo) !== categoria) return;
    filas.push({
      profesional_id,
      nombre: prof.nombre_completo,
      horasReales,
    });
  });

  return filas
    .sort((a, b) => b.horasReales - a.horasReales)
    .map((f) => ({
      ...f,
      pctPresupCategoria: pctConsumoPresupuestoCategoria(f.horasReales, presupuestoCategoria),
      enEquipo: enEquipo.has(f.profesional_id),
    }));
}
