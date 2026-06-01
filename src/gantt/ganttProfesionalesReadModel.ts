/**
 * Read model Gantt Profesionales (solo lectura).
 * Fuente: equipo_entregable + entregables + proyectos + clientes + profesionales + registro_horas.
 */

import type {
  AsignacionHoraCategoria,
  Cliente,
  Entregable,
  EquipoEntregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import { buildConsumoMaps } from "@/entregables/asignacionHoraConsumo";
import { esRegistroConsumoRealValido } from "@/entregables/registroHoraConsumo";
import {
  avanceRealPct100,
  estadoEjecucionDesdeAvance,
  fechasBarraEntregableGantt,
  parseGanttDate,
  type EstadoEjecucionEntregable,
} from "@/gantt/ganttChartUtils";
import {
  gastoRealPorCategoriaDesdeMapaProf,
  presupuestoCategoriaEntregable,
  toCategoriaProfesional,
} from "@/horas/entregableControlCategoria";

export type GanttProfFiltroEstado = "TODOS" | EstadoEjecucionEntregable;
export type GanttProfFiltroRol = "TODOS" | "LIDER" | "APOYO";

/** Placeholder temporal; orden especial solo en Gantt Profesionales. */
export function esProfesionalPorDefinir(nombre: string): boolean {
  return (nombre ?? "").trim().toLowerCase() === "por definir";
}

/** Proyecto genérico SEYA001 (código, trim + case insensitive). */
export function esProyectoCodigoSeya001(codigo: string | null | undefined): boolean {
  return (codigo ?? "").trim().toUpperCase() === "SEYA001";
}

export type GanttProfesionalResumen = {
  fecha_inicio: string | null;
  fecha_termino: string | null;
  /** Entregables visibles con fechas RevP completas (incluidos en la barra). */
  conFechas: number;
  sinFechas: number;
  total: number;
  /** Suma de horasProf ya calculadas por entregable visible (RegistroHora DIRECTA válida). */
  horasRealesProfesional: number;
};

export function fmtHorasGanttProfesional(n: number): string {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

/** % colaboración = horasProf / horasTotalesEnt; null si gasto total entregable = 0. */
export function fmtColaboracionEntregablePct(pctColaboracion: number | null): string {
  if (pctColaboracion == null) return "Sin gasto";
  return `${pctColaboracion.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
}

export function textoSublineaEntregableGanttProf(f: GanttProfesionalEntregableFila): string {
  return `${f.entregable.nombre} · ${f.rolLabel} · ${fmtHorasGanttProfesional(f.horasProf)} h · ${fmtColaboracionEntregablePct(f.pctColaboracion)}`;
}

export function textoResumenFilaProfesionalGantt(resumen: GanttProfesionalResumen): string {
  const n = resumen.total;
  return `${n} entregable${n === 1 ? "" : "s"} · ${fmtHorasGanttProfesional(resumen.horasRealesProfesional)} h reales`;
}

/** Etiqueta corta para la barra Gantt resumen colapsada (sin horas). */
export function textoBarraResumenGanttProfesional(resumen: GanttProfesionalResumen): string {
  const n = resumen.total;
  return `${n} entregable${n === 1 ? "" : "s"}`;
}

/** Rango min/max de inicio–término RevP (barra) solo entre entregables con fechas completas. */
export function calcularResumenProfesionalGantt(
  entregables: GanttProfesionalEntregableFila[],
): GanttProfesionalResumen {
  const total = entregables.length;
  const horasRealesProfesional = entregables.reduce((s, f) => s + (Number(f.horasProf) || 0), 0);
  const conFechasList = entregables.filter((f) => f.fechasRevPCompletas);
  const sinFechas = total - conFechasList.length;
  if (conFechasList.length === 0) {
    return {
      fecha_inicio: null,
      fecha_termino: null,
      conFechas: 0,
      sinFechas,
      total,
      horasRealesProfesional,
    };
  }

  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  let minIso = "";
  let maxIso = "";

  for (const f of conFechasList) {
    const sMs = parseGanttDate(f.fechasBarra.fecha_inicio).getTime();
    const eMs = parseGanttDate(f.fechasBarra.fecha_termino).getTime();
    if (Number.isFinite(sMs) && sMs < minMs) {
      minMs = sMs;
      minIso = f.fechasBarra.fecha_inicio;
    }
    if (Number.isFinite(eMs) && eMs > maxMs) {
      maxMs = eMs;
      maxIso = f.fechasBarra.fecha_termino;
    }
  }

  return {
    fecha_inicio: minIso || null,
    fecha_termino: maxIso || null,
    conFechas: conFechasList.length,
    sinFechas,
    total,
    horasRealesProfesional,
  };
}

export function ordenarNodosGanttProfesionales(nodos: GanttProfesionalNodo[]): GanttProfesionalNodo[] {
  return [...nodos].sort((a, b) => {
    const aDef = esProfesionalPorDefinir(a.profesional.nombre_completo);
    const bDef = esProfesionalPorDefinir(b.profesional.nombre_completo);
    if (aDef && !bDef) return 1;
    if (!aDef && bDef) return -1;
    return a.profesional.nombre_completo.localeCompare(b.profesional.nombre_completo, "es");
  });
}

export type GanttProfesionalEntregableFila = {
  entregableId: string;
  entregable: Entregable;
  proyecto: Proyecto;
  cliente: Cliente;
  rol: "LIDER" | "APOYO";
  rolLabel: string;
  labelLinea: string;
  estadoEjecucion: EstadoEjecucionEntregable;
  avancePct: number;
  fechasBarra: { fecha_inicio: string; fecha_termino: string };
  fechasRevPCompletas: boolean;
  fechaInicioRevP: string | null;
  fechaTerminoRevP: string | null;
  sinFechasRevP: boolean;
  horasProf: number;
  horasTotalesEnt: number;
  pctColaboracion: number | null;
  categoria: AsignacionHoraCategoria;
};

export type GanttProfesionalNodo = {
  profesional: Profesional;
  entregables: GanttProfesionalEntregableFila[];
};

export type ComparteCategoriaRow = {
  profesional_id: string;
  nombre: string;
  horasReales: number;
  pctPresupCategoria: number | null;
};

export type GanttProfesionalDetalleModal = {
  profesional: Profesional;
  cliente: Cliente;
  proyecto: Proyecto;
  entregable: Entregable;
  rolLabel: string;
  categoria: AsignacionHoraCategoria;
  fechaInicioRevP: string | null;
  fechaTerminoRevP: string | null;
  avancePct: number;
  estadoEjecucion: EstadoEjecucionEntregable;
  horasProf: number;
  gastoTotalEntregable: number;
  pctColaboracion: number | null;
  presupuestoCategoria: number;
  gastoCategoria: number;
  saldoCategoria: number;
  comparteCategoria: ComparteCategoriaRow[];
};

function buildGastoPorEntregableYProf(
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): Map<string, Map<string, number>> {
  const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);
  const out = new Map<string, Map<string, number>>();
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
    const eid = (r.entregable_id ?? "").trim();
    const pid = (r.profesional_id ?? "").trim();
    if (!eid || !pid) continue;
    if (!out.has(eid)) out.set(eid, new Map());
    const m = out.get(eid)!;
    m.set(pid, (m.get(pid) ?? 0) + Number(r.horas));
  }
  return out;
}

function equipoUnicoPorProfesionalYEntregable(
  equipo: EquipoEntregable[],
): Map<string, Map<string, EquipoEntregable>> {
  const byProf = new Map<string, Map<string, EquipoEntregable>>();
  for (const row of equipo) {
    const pid = (row.profesional_id ?? "").trim();
    const eid = (row.entregable_id ?? "").trim();
    if (!pid || !eid) continue;
    if (!byProf.has(pid)) byProf.set(pid, new Map());
    const m = byProf.get(pid)!;
    const prev = m.get(eid);
    if (!prev) {
      m.set(eid, row);
      continue;
    }
    if (row.rol_en_entregable === "LIDER" && prev.rol_en_entregable !== "LIDER") {
      m.set(eid, row);
    }
  }
  return byProf;
}

export function construirGanttProfesionalesArbol(input: {
  equipo_entregable: EquipoEntregable[];
  entregables: Entregable[];
  proyectos: Proyecto[];
  clientes: Cliente[];
  profesionales: Profesional[];
  registro_horas: RegistroHora[];
  filtros?: {
    profesionalId?: string;
    clienteId?: string;
    proyectoId?: string;
    estado?: GanttProfFiltroEstado;
    rol?: GanttProfFiltroRol;
    ocultarPorDefinir?: boolean;
    /** Si false o ausente, excluye entregables de proyectos SEYA001. */
    mostrarSeya001?: boolean;
  };
}): GanttProfesionalNodo[] {
  const entMap = new Map(input.entregables.map((e) => [e.id, e]));
  const projMap = new Map(input.proyectos.map((p) => [p.id, p]));
  const cliMap = new Map(input.clientes.map((c) => [c.id, c]));
  const profMap = new Map(input.profesionales.map((p) => [p.id, p]));
  const gastoMap = buildGastoPorEntregableYProf(
    input.registro_horas,
    input.entregables,
    input.proyectos,
    input.profesionales,
  );

  const equipoByProf = equipoUnicoPorProfesionalYEntregable(input.equipo_entregable ?? []);
  const profIds = [...equipoByProf.keys()];

  const nodos: GanttProfesionalNodo[] = [];

  for (const profId of profIds) {
    if (input.filtros?.profesionalId && profId !== input.filtros.profesionalId) continue;
    const prof = profMap.get(profId);
    if (!prof) continue;
    if (input.filtros?.ocultarPorDefinir && esProfesionalPorDefinir(prof.nombre_completo)) continue;

    const entregablesEq = equipoByProf.get(profId);
    if (!entregablesEq || entregablesEq.size === 0) continue;

    const filas: GanttProfesionalEntregableFila[] = [];

    for (const [eid, eqRow] of entregablesEq) {
      const ent = entMap.get(eid);
      if (!ent) continue;
      const pr = projMap.get(ent.proyecto_id);
      if (!pr) continue;
      if (!input.filtros?.mostrarSeya001 && esProyectoCodigoSeya001(pr.codigo)) continue;
      if (input.filtros?.proyectoId && pr.id !== input.filtros.proyectoId) continue;
      const cl = cliMap.get(pr.cliente_id);
      if (!cl) continue;
      if (input.filtros?.clienteId && cl.id !== input.filtros.clienteId) continue;

      const rol: "LIDER" | "APOYO" = eqRow.rol_en_entregable === "LIDER" ? "LIDER" : "APOYO";
      if (input.filtros?.rol && input.filtros.rol !== "TODOS" && rol !== input.filtros.rol) continue;

      const estadoEjecucion = estadoEjecucionDesdeAvance(ent.avance_real);
      if (input.filtros?.estado && input.filtros.estado !== "TODOS" && estadoEjecucion !== input.filtros.estado) {
        continue;
      }

      const fechas = fechasBarraEntregableGantt(ent);
      const gastoProf = gastoMap.get(eid) ?? new Map();
      const horasProf = gastoProf.get(profId) ?? 0;
      const horasTotalesEnt = [...gastoProf.values()].reduce((s, h) => s + h, 0);
      const pctColaboracion =
        horasTotalesEnt > 0 ? Math.round((horasProf / horasTotalesEnt) * 10000) / 100 : null;

      filas.push({
        entregableId: eid,
        entregable: ent,
        proyecto: pr,
        cliente: cl,
        rol,
        rolLabel: rol === "LIDER" ? "Líder" : "Apoyo",
        labelLinea: `${cl.nombre} / ${pr.codigo} · ${ent.nombre}`,
        estadoEjecucion,
        avancePct: avanceRealPct100(ent.avance_real),
        fechasBarra: {
          fecha_inicio: fechas.fecha_inicio,
          fecha_termino: fechas.fecha_termino,
        },
        fechasRevPCompletas: fechas.fechasRevPCompletas,
        fechaInicioRevP: fechas.fechaInicioRevP,
        fechaTerminoRevP: fechas.fechaTerminoRevP,
        sinFechasRevP: !fechas.fechasRevPCompletas,
        horasProf,
        horasTotalesEnt,
        pctColaboracion,
        categoria: toCategoriaProfesional(prof.cargo),
      });
    }

    if (filas.length === 0) continue;
    filas.sort((a, b) => a.labelLinea.localeCompare(b.labelLinea, "es"));
    nodos.push({ profesional: prof, entregables: filas });
  }

  return ordenarNodosGanttProfesionales(nodos);
}

export function buildGanttProfesionalDetalleModal(
  profesional: Profesional,
  fila: GanttProfesionalEntregableFila,
  input: {
    profesionales: Profesional[];
    registro_horas: RegistroHora[];
    entregables: Entregable[];
    proyectos: Proyecto[];
  },
): GanttProfesionalDetalleModal {
  const { entById, projById, profById } = buildConsumoMaps(
    input.entregables,
    input.proyectos,
    input.profesionales,
  );
  const gastoProf = new Map<string, number>();
  const eid = fila.entregableId;
  const profId = profesional.id;

  for (const r of input.registro_horas) {
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
    if ((r.entregable_id ?? "").trim() !== eid) continue;
    const pid = (r.profesional_id ?? "").trim();
    gastoProf.set(pid, (gastoProf.get(pid) ?? 0) + Number(r.horas));
  }

  const horasProf = gastoProf.get(profId) ?? 0;
  const gastoTotalEntregable = [...gastoProf.values()].reduce((s, h) => s + h, 0);
  const pctColaboracion =
    gastoTotalEntregable > 0 ? Math.round((horasProf / gastoTotalEntregable) * 10000) / 100 : null;

  const cat = fila.categoria;
  const presupuestoCategoria = presupuestoCategoriaEntregable(fila.entregable, cat);
  const profMap = new Map(input.profesionales.map((p) => [p.id, p]));
  const gastoCatMap = gastoRealPorCategoriaDesdeMapaProf(gastoProf, profMap);
  const gastoCategoria = gastoCatMap.get(cat) ?? 0;
  const saldoCategoria = presupuestoCategoria - gastoCategoria;

  const comparteCategoria: ComparteCategoriaRow[] = [];
  gastoProf.forEach((horasReales, otroPid) => {
    if (otroPid === profId || horasReales <= 0) return;
    const p = profMap.get(otroPid);
    if (!p || toCategoriaProfesional(p.cargo) !== cat) return;
    comparteCategoria.push({
      profesional_id: otroPid,
      nombre: p.nombre_completo,
      horasReales,
      pctPresupCategoria:
        presupuestoCategoria > 0
          ? Math.round((horasReales / presupuestoCategoria) * 10000) / 100
          : null,
    });
  });
  comparteCategoria.sort((a, b) => b.horasReales - a.horasReales);

  return {
    profesional,
    cliente: fila.cliente,
    proyecto: fila.proyecto,
    entregable: fila.entregable,
    rolLabel: fila.rolLabel,
    categoria: cat,
    fechaInicioRevP: fila.fechaInicioRevP,
    fechaTerminoRevP: fila.fechaTerminoRevP,
    avancePct: fila.avancePct,
    estadoEjecucion: fila.estadoEjecucion,
    horasProf,
    gastoTotalEntregable,
    pctColaboracion,
    presupuestoCategoria,
    gastoCategoria,
    saldoCategoria,
    comparteCategoria,
  };
}
