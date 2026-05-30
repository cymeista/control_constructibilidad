import type { Entregable, EquipoEntregable, Profesional, Proyecto, RegistroHora } from "@/context/AppDataContext";
import {
  esRegistroConsumoRealValido,
  type EntregableConsumoTarget,
  type ProfesionalCargoInput,
  type ProyectoTarifasInput,
  type RegistroHoraConsumoInput,
} from "@/entregables/registroHoraConsumo";

export type GastoColaboracionEntregable = {
  horasTotalesEnt: number;
  porProfesional: Map<string, number>;
};

export type IntegranteGastoEquipo = {
  equipoId: string;
  profesional_id: string;
  nombre: string;
  rol: "LIDER" | "APOYO";
  rolLabel: string;
  horasProf: number;
  horasTotalesEnt: number;
  pctColaboracion: number;
  sinGastoReal: boolean;
  origen?: EquipoEntregable["origen"];
};

export type ProfesionalGastoSinEquipo = {
  profesional_id: string;
  nombre: string;
  horas_reales: number;
  pct_colaboracion: number;
};

function horasDirectasValidasPorProfesionalEnEntregable(
  entregableId: string,
  registro_horas: RegistroHoraConsumoInput[],
  entById: Map<string, EntregableConsumoTarget>,
  projById: Map<string, ProyectoTarifasInput>,
  profById: Map<string, ProfesionalCargoInput>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of registro_horas) {
    if (!esRegistroConsumoRealValido(r, entById, projById, profById)) continue;
    if ((r.entregable_id ?? "").trim() !== entregableId) continue;
    const pid = (r.profesional_id ?? "").trim();
    const h = Number(r.horas);
    out.set(pid, (out.get(pid) ?? 0) + h);
  }
  return out;
}

export function calcularGastoColaboracionEntregable(
  entregableId: string,
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): GastoColaboracionEntregable {
  const entById = new Map<string, EntregableConsumoTarget>(
    entregables.map((e) => [e.id, { id: e.id, proyecto_id: e.proyecto_id }]),
  );
  const projById = new Map<string, ProyectoTarifasInput>(proyectos.map((p) => [p.id, p]));
  const profById = new Map<string, ProfesionalCargoInput>(
    profesionales.map((p) => [p.id, { id: p.id, cargo: p.cargo }]),
  );
  const porProfesional = horasDirectasValidasPorProfesionalEnEntregable(
    entregableId,
    registro_horas,
    entById,
    projById,
    profById,
  );
  const horasTotalesEnt = [...porProfesional.values()].reduce((s, h) => s + h, 0);
  return { horasTotalesEnt, porProfesional };
}

function pctColaboracion(horasProf: number, horasTotalesEnt: number): number {
  if (horasTotalesEnt <= 0) return 0;
  return Math.round((horasProf / horasTotalesEnt) * 10000) / 100;
}

export function listarIntegrantesEquipoConGasto(
  entregableId: string,
  equipo_entregable: EquipoEntregable[],
  profesionales: Profesional[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
): { lider: IntegranteGastoEquipo | null; apoyos: IntegranteGastoEquipo[] } {
  const profMap = new Map(profesionales.map((p) => [p.id, p]));
  const gasto = calcularGastoColaboracionEntregable(entregableId, registro_horas, entregables, proyectos, profesionales);
  const filas = equipo_entregable.filter((e) => (e.entregable_id ?? "").trim() === entregableId);

  const integrantes: IntegranteGastoEquipo[] = filas.map((eq) => {
    const prof = profMap.get(eq.profesional_id);
    const rol = eq.rol_en_entregable === "LIDER" ? "LIDER" : "APOYO";
    const horasProf = gasto.porProfesional.get(eq.profesional_id) ?? 0;
    return {
      equipoId: eq.id,
      profesional_id: eq.profesional_id,
      nombre: prof?.nombre_completo ?? eq.profesional_id,
      rol,
      rolLabel: rol === "LIDER" ? "Líder" : "Apoyo",
      horasProf,
      horasTotalesEnt: gasto.horasTotalesEnt,
      pctColaboracion: pctColaboracion(horasProf, gasto.horasTotalesEnt),
      sinGastoReal: gasto.horasTotalesEnt <= 0,
      origen: eq.origen,
    };
  });

  const lider = integrantes.find((i) => i.rol === "LIDER") ?? null;
  const apoyos = integrantes
    .filter((i) => i.rol === "APOYO")
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return { lider, apoyos };
}

export function listarProfesionalesGastoSinEquipoDeclarado(
  entregableId: string,
  equipo_entregable: EquipoEntregable[],
  profesionales: Profesional[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
): ProfesionalGastoSinEquipo[] {
  const profMap = new Map(profesionales.map((p) => [p.id, p]));
  const gasto = calcularGastoColaboracionEntregable(entregableId, registro_horas, entregables, proyectos, profesionales);
  const enEquipo = new Set(
    equipo_entregable
      .filter((e) => (e.entregable_id ?? "").trim() === entregableId)
      .map((e) => e.profesional_id),
  );

  const out: ProfesionalGastoSinEquipo[] = [];
  for (const [profId, horas] of gasto.porProfesional) {
    if (horas <= 0 || enEquipo.has(profId)) continue;
    out.push({
      profesional_id: profId,
      nombre: profMap.get(profId)?.nombre_completo ?? profId,
      horas_reales: horas,
      pct_colaboracion: pctColaboracion(horas, gasto.horasTotalesEnt),
    });
  }
  return out.sort((a, b) => b.horas_reales - a.horas_reales);
}
