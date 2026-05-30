import type {
  Entregable,
  EquipoEntregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import {
  esRegistroConsumoRealValido,
  type EntregableConsumoTarget,
  type ProfesionalCargoInput,
  type ProyectoTarifasInput,
  type RegistroHoraConsumoInput,
} from "@/entregables/registroHoraConsumo";

export type ParticipacionEntregableFila = {
  entregable_id: string;
  ent: Entregable;
  proyecto: Proyecto | undefined;
  clienteNombre: string;
  rol: "LIDER" | "APOYO";
  rolLabel: string;
  avancePct: number;
  horasProf: number;
  horasTotalesEnt: number;
  /** Horas DIRECTAS válidas en el entregable de profesionales con el mismo cargo del seleccionado. */
  horasCategoriaEnt: number | null;
  cargoCategoria: string | null;
  pctColaboracion: number;
  sinGastoReal: boolean;
};

export type ParticipacionBloqueProyecto = {
  proyectoId: string;
  proyecto: Proyecto | undefined;
  clienteNombre: string;
  filas: ParticipacionEntregableFila[];
};

/** Misma escala que Home/Dashboard: `avance_real` en 0–1 (1 = 100%). */
export function avanceRealPct(avanceReal: number): number {
  const ar = Number(avanceReal);
  if (!Number.isFinite(ar)) return 0;
  if (ar > 1.0001) return Math.round(ar * 100) / 100;
  return Math.round(ar * 10000) / 100;
}

export function entregableAvanceCompletado(avanceReal: number): boolean {
  const ar = Number(avanceReal);
  if (!Number.isFinite(ar)) return false;
  if (ar > 1.0001) return ar >= 99.5;
  return ar >= 1;
}

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

const CARGOS_CATEGORIA = new Set(["L2", "P4", "P3", "P2"]);

function horasDirectasValidasPorCargoEnEntregable(
  entregableId: string,
  cargo: string,
  registro_horas: RegistroHoraConsumoInput[],
  entById: Map<string, EntregableConsumoTarget>,
  projById: Map<string, ProyectoTarifasInput>,
  profById: Map<string, ProfesionalCargoInput>,
): number {
  let sum = 0;
  for (const r of registro_horas) {
    if (!esRegistroConsumoRealValido(r, entById, projById, profById)) continue;
    if ((r.entregable_id ?? "").trim() !== entregableId) continue;
    const pid = (r.profesional_id ?? "").trim();
    const prof = profById.get(pid);
    if (!prof || prof.cargo !== cargo) continue;
    sum += Number(r.horas);
  }
  return sum;
}

function equipoUnicoPorEntregable(equipoProf: EquipoEntregable[]): EquipoEntregable[] {
  const byEnt = new Map<string, EquipoEntregable>();
  for (const row of equipoProf) {
    const eid = (row.entregable_id ?? "").trim();
    if (!eid) continue;
    const prev = byEnt.get(eid);
    if (!prev) {
      byEnt.set(eid, row);
      continue;
    }
    if (row.rol_en_entregable === "LIDER" && prev.rol_en_entregable !== "LIDER") {
      byEnt.set(eid, row);
    }
  }
  return [...byEnt.values()];
}

export type ModoParticipacionProfesional =
  | "participacion_actual"
  | "completados_lider"
  | "completados_apoyo";

export function listarParticipacionProfesionalEquipo(
  input: {
    profesionalId: string;
    equipo_entregable: EquipoEntregable[];
    entregables: Entregable[];
    proyectos: Proyecto[];
    clientes: { id: string; nombre: string }[];
    registro_horas: RegistroHora[];
    profesionales: Profesional[];
  },
  modo: ModoParticipacionProfesional,
): ParticipacionBloqueProyecto[] {
  const profId = input.profesionalId.trim();
  if (!profId) return [];

  const entById = new Map<string, EntregableConsumoTarget>(
    input.entregables.map((e) => [e.id, { id: e.id, proyecto_id: e.proyecto_id }]),
  );
  const entregablesMap = new Map(input.entregables.map((e) => [e.id, e]));
  const projById = new Map<string, ProyectoTarifasInput>(input.proyectos.map((p) => [p.id, p]));
  const profById = new Map<string, ProfesionalCargoInput>(
    input.profesionales.map((p) => [p.id, { id: p.id, cargo: p.cargo }]),
  );
  const proyectosMap = new Map(input.proyectos.map((p) => [p.id, p]));
  const clienteMap = new Map(input.clientes.map((c) => [c.id, c.nombre]));

  const equipoProf = input.equipo_entregable.filter((e) => (e.profesional_id ?? "").trim() === profId);
  const filasRaw: ParticipacionEntregableFila[] = [];

  for (const eq of equipoUnicoPorEntregable(equipoProf)) {
    const ent = entregablesMap.get(eq.entregable_id);
    if (!ent) continue;

    const completado = entregableAvanceCompletado(ent.avance_real);
    const rol = eq.rol_en_entregable === "LIDER" ? "LIDER" : "APOYO";

    if (modo === "participacion_actual" && completado) continue;
    if (modo === "completados_lider" && (!completado || rol !== "LIDER")) continue;
    if (modo === "completados_apoyo" && (!completado || rol !== "APOYO")) continue;

    const horasPorProf = horasDirectasValidasPorProfesionalEnEntregable(
      ent.id,
      input.registro_horas,
      entById,
      projById,
      profById,
    );
    const horasTotalesEnt = [...horasPorProf.values()].reduce((s, h) => s + h, 0);
    const horasProf = horasPorProf.get(profId) ?? 0;
    const pctColaboracion =
      horasTotalesEnt > 0 ? Math.round((horasProf / horasTotalesEnt) * 10000) / 100 : 0;

    const cargoProf = profById.get(profId)?.cargo ?? "";
    const cargoCategoria = CARGOS_CATEGORIA.has(cargoProf) ? cargoProf : null;
    const horasCategoriaEnt =
      cargoCategoria != null
        ? horasDirectasValidasPorCargoEnEntregable(
            ent.id,
            cargoCategoria,
            input.registro_horas,
            entById,
            projById,
            profById,
          )
        : null;

    const proyecto = proyectosMap.get(ent.proyecto_id);
    const clienteNombre = proyecto ? clienteMap.get(proyecto.cliente_id) ?? "—" : "—";

    filasRaw.push({
      entregable_id: ent.id,
      ent,
      proyecto,
      clienteNombre,
      rol,
      rolLabel: rol === "LIDER" ? "Líder" : "Apoyo",
      avancePct: avanceRealPct(ent.avance_real),
      horasProf,
      horasTotalesEnt,
      horasCategoriaEnt,
      cargoCategoria,
      pctColaboracion,
      sinGastoReal: horasTotalesEnt <= 0,
    });
  }

  const byProj = new Map<string, ParticipacionBloqueProyecto>();
  for (const f of filasRaw) {
    const pid = f.ent.proyecto_id;
    if (!byProj.has(pid)) {
      byProj.set(pid, {
        proyectoId: pid,
        proyecto: f.proyecto,
        clienteNombre: f.clienteNombre,
        filas: [],
      });
    }
    byProj.get(pid)!.filas.push(f);
  }

  const nombreProyecto = (p: Proyecto | undefined) => {
    if (!p) return "Sin proyecto";
    const n = (p.nombre ?? "").trim();
    if (n) return n;
    const c = (p.codigo ?? "").trim();
    return c || p.id;
  };

  const nombreEntregable = (e: Entregable) => {
    const n = (e.nombre ?? "").trim();
    return n || e.id;
  };

  return Array.from(byProj.values())
    .map((b) => ({
      ...b,
      filas: b.filas.sort((a, c) => nombreEntregable(a.ent).localeCompare(nombreEntregable(c.ent), "es")),
    }))
    .sort((a, b) => nombreProyecto(a.proyecto).localeCompare(nombreProyecto(b.proyecto), "es"));
}
