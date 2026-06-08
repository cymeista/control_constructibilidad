import type {
  Cliente,
  Entregable,
  EquipoEntregable,
  EvaluacionEntregable,
  PreguntaEvaluacionEntregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import { buildConsumoMaps } from "@/entregables/asignacionHoraConsumo";
import { esRegistroConsumoRealValido } from "@/entregables/registroHoraConsumo";
import { avanceRealPct100, fechasBarraEntregableGantt, parseGanttDate } from "@/gantt/ganttChartUtils";

export const FECHA_CORTE_EVALUACION_ENTREGABLE = "2026-06-01";

export type TipoEvaluacionEntregable = "TALLER" | "ENTREGABLE";
export type RespuestaEvaluacionValor = "CUMPLE" | "CUMPLE_PARCIAL" | "NO_CUMPLE";

export function puntajePorRespuesta(r: RespuestaEvaluacionValor): number {
  if (r === "CUMPLE") return 1;
  if (r === "CUMPLE_PARCIAL") return 0.5;
  return 0;
}

export function calcularPuntajesEvaluacion(
  respuestas: { respuesta: RespuestaEvaluacionValor }[],
): { puntaje_obtenido: number; puntaje_maximo: number; nota_final: number | null } {
  const puntaje_maximo = respuestas.length;
  const puntaje_obtenido = respuestas.reduce((s, x) => s + puntajePorRespuesta(x.respuesta), 0);
  const nota_final =
    puntaje_maximo > 0
      ? Math.round((puntaje_obtenido / puntaje_maximo) * 100) / 10
      : null;
  return { puntaje_obtenido, puntaje_maximo, nota_final };
}

export function sugerirTipoEvaluacionPorNombreEntregable(nombre: string): TipoEvaluacionEntregable {
  return (nombre ?? "").toLowerCase().includes("taller") ? "TALLER" : "ENTREGABLE";
}

export function entregableEsEvaluable(
  ent: Entregable,
  fechaCorte = FECHA_CORTE_EVALUACION_ENTREGABLE,
): boolean {
  if (avanceRealPct100(ent.avance_real) < 100) return false;
  const fechas = fechasBarraEntregableGantt(ent);
  const termino = (fechas.fechaTerminoRevP ?? "").trim();
  if (!termino || !Number.isFinite(parseGanttDate(termino).getTime())) return false;
  const corte = parseGanttDate(fechaCorte);
  return parseGanttDate(termino).getTime() >= corte.getTime();
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

export type EntregableEvaluableOpcion = {
  entregableId: string;
  entregable: Entregable;
  proyecto: Proyecto;
  cliente: Cliente;
  rol: "LIDER" | "APOYO";
  rolLabel: string;
  fechaTerminoRevP: string;
  avancePct: number;
  horasProf: number;
  pctColaboracion: number | null;
  labelLinea: string;
};

/** Clave lógica única: profesional + entregable + tipo de evaluación. */
export function claveEvaluacionEntregable(
  profesionalId: string,
  entregableId: string,
  tipoEvaluacion: TipoEvaluacionEntregable,
): string {
  return `${profesionalId.trim()}|${entregableId.trim()}|${tipoEvaluacion}`;
}

export const MSG_EVALUACION_DUPLICADA =
  "Ya existe una evaluación para este profesional, entregable y tipo.";

export function existeEvaluacionEntregable(
  evaluaciones: EvaluacionEntregable[],
  profesionalId: string,
  entregableId: string,
  tipoEvaluacion: TipoEvaluacionEntregable,
  excludeId?: string,
): boolean {
  const clave = claveEvaluacionEntregable(profesionalId, entregableId, tipoEvaluacion);
  return evaluaciones.some((e) => {
    if (excludeId && e.id === excludeId) return false;
    return claveEvaluacionEntregable(e.profesional_id, e.entregable_id, e.tipo_evaluacion) === clave;
  });
}

export type EntregablesEvaluablesAgrupados = {
  disponibles: EntregableEvaluableOpcion[];
  yaEvaluados: EntregableEvaluableOpcion[];
};

/** Separa entregables evaluables en disponibles vs ya evaluados para prof + tipo. */
export function agruparEntregablesEvaluablesPorDisponibilidad(input: {
  profesionalId: string;
  tipoEvaluacion: TipoEvaluacionEntregable;
  evaluaciones_entregables: EvaluacionEntregable[];
  equipo_entregable: EquipoEntregable[];
  entregables: Entregable[];
  proyectos: Proyecto[];
  clientes: Cliente[];
  registro_horas: RegistroHora[];
  profesionales: Profesional[];
}): EntregablesEvaluablesAgrupados {
  const todas = listarEntregablesEvaluables(input);
  const evaluadosIds = new Set(
    input.evaluaciones_entregables
      .filter(
        (e) =>
          e.profesional_id === input.profesionalId.trim() &&
          e.tipo_evaluacion === input.tipoEvaluacion,
      )
      .map((e) => e.entregable_id),
  );
  const disponibles: EntregableEvaluableOpcion[] = [];
  const yaEvaluados: EntregableEvaluableOpcion[] = [];
  for (const o of todas) {
    if (evaluadosIds.has(o.entregableId)) yaEvaluados.push(o);
    else disponibles.push(o);
  }
  return { disponibles, yaEvaluados };
}

export type EvaluacionDuplicadaResumen = {
  clave: string;
  profesionalId: string;
  entregableId: string;
  tipoEvaluacion: TipoEvaluacionEntregable;
  cantidad: number;
};

/** Detecta combinaciones profesional/entregable/tipo con más de una evaluación. */
export function listarEvaluacionesDuplicadas(
  evaluaciones: EvaluacionEntregable[],
): EvaluacionDuplicadaResumen[] {
  const counts = new Map<string, EvaluacionDuplicadaResumen>();
  for (const e of evaluaciones) {
    const clave = claveEvaluacionEntregable(e.profesional_id, e.entregable_id, e.tipo_evaluacion);
    const prev = counts.get(clave);
    if (prev) {
      prev.cantidad += 1;
    } else {
      counts.set(clave, {
        clave,
        profesionalId: e.profesional_id,
        entregableId: e.entregable_id,
        tipoEvaluacion: e.tipo_evaluacion,
        cantidad: 1,
      });
    }
  }
  return [...counts.values()].filter((x) => x.cantidad > 1);
}

export function evaluacionEsPosibleDuplicado(
  ev: EvaluacionEntregable,
  evaluaciones: EvaluacionEntregable[],
): boolean {
  const clave = claveEvaluacionEntregable(ev.profesional_id, ev.entregable_id, ev.tipo_evaluacion);
  let count = 0;
  for (const e of evaluaciones) {
    if (claveEvaluacionEntregable(e.profesional_id, e.entregable_id, e.tipo_evaluacion) === clave) {
      count += 1;
      if (count > 1) return true;
    }
  }
  return false;
}

export function listarEntregablesEvaluables(input: {
  profesionalId: string;
  equipo_entregable: EquipoEntregable[];
  entregables: Entregable[];
  proyectos: Proyecto[];
  clientes: Cliente[];
  registro_horas: RegistroHora[];
  profesionales: Profesional[];
}): EntregableEvaluableOpcion[] {
  const pid = input.profesionalId.trim();
  if (!pid) return [];

  const entMap = new Map(input.entregables.map((e) => [e.id, e]));
  const projMap = new Map(input.proyectos.map((p) => [p.id, p]));
  const cliMap = new Map(input.clientes.map((c) => [c.id, c]));
  const equipoByProf = equipoUnicoPorProfesionalYEntregable(input.equipo_entregable ?? []);
  const entregablesEq = equipoByProf.get(pid);
  if (!entregablesEq) return [];

  const gastoMap = buildGastoPorEntregableYProf(
    input.registro_horas,
    input.entregables,
    input.proyectos,
    input.profesionales,
  );

  const out: EntregableEvaluableOpcion[] = [];

  for (const [eid, eqRow] of entregablesEq) {
    const ent = entMap.get(eid);
    if (!ent || !entregableEsEvaluable(ent)) continue;
    const pr = projMap.get(ent.proyecto_id);
    if (!pr) continue;
    const cl = cliMap.get(pr.cliente_id);
    if (!cl) continue;

    const fechas = fechasBarraEntregableGantt(ent);
    const termino = (fechas.fechaTerminoRevP ?? "").trim();
    const rol: "LIDER" | "APOYO" = eqRow.rol_en_entregable === "LIDER" ? "LIDER" : "APOYO";
    const gastoProf = gastoMap.get(eid) ?? new Map();
    const horasProf = gastoProf.get(pid) ?? 0;
    const horasTotalesEnt = [...gastoProf.values()].reduce((s, h) => s + h, 0);
    const pctColaboracion =
      horasTotalesEnt > 0 ? Math.round((horasProf / horasTotalesEnt) * 10000) / 100 : null;

    out.push({
      entregableId: eid,
      entregable: ent,
      proyecto: pr,
      cliente: cl,
      rol,
      rolLabel: rol === "LIDER" ? "Líder" : "Apoyo",
      fechaTerminoRevP: termino,
      avancePct: avanceRealPct100(ent.avance_real),
      horasProf,
      pctColaboracion,
      labelLinea: `${cl.nombre} / ${pr.codigo} · ${ent.nombre}`,
    });
  }

  return out.sort((a, b) => a.labelLinea.localeCompare(b.labelLinea, "es"));
}

export function preguntasActivasPorTipo(
  preguntas: PreguntaEvaluacionEntregable[],
  tipo: TipoEvaluacionEntregable,
): PreguntaEvaluacionEntregable[] {
  return preguntas
    .filter((p) => p.tipo_evaluacion === tipo && p.activa !== false)
    .sort((a, b) => a.orden - b.orden);
}

export type ResumenEvaluacionesProfesional = {
  notaMedia: number | null;
  cantidadEvaluaciones: number;
  entregablesEvaluados: number;
  notaMaxima: number | null;
  notaMinima: number | null;
  sinEvaluaciones: boolean;
};

export function resumenEvaluacionesProfesional(
  evaluaciones: EvaluacionEntregable[],
  profesionalId: string,
): ResumenEvaluacionesProfesional {
  const rows = evaluaciones.filter((e) => e.profesional_id === profesionalId);
  const notas = rows.map((e) => e.nota_final).filter((n) => Number.isFinite(n));
  const sinEvaluaciones = rows.length === 0;
  const entregablesEvaluados = new Set(rows.map((e) => e.entregable_id)).size;

  if (notas.length === 0) {
    return {
      notaMedia: null,
      cantidadEvaluaciones: 0,
      entregablesEvaluados: 0,
      notaMaxima: null,
      notaMinima: null,
      sinEvaluaciones: true,
    };
  }

  const sum = notas.reduce((s, n) => s + n, 0);
  return {
    notaMedia: Math.round((sum / notas.length) * 10) / 10,
    cantidadEvaluaciones: rows.length,
    entregablesEvaluados,
    notaMaxima: Math.max(...notas),
    notaMinima: Math.min(...notas),
    sinEvaluaciones,
  };
}

/** Promedio global de todas las evaluaciones guardadas (todos los profesionales). */
export function notaGeneralGlobal(evaluaciones: EvaluacionEntregable[]): number | null {
  const notas = evaluaciones.map((e) => e.nota_final).filter((n) => Number.isFinite(n));
  if (notas.length === 0) return null;
  const sum = notas.reduce((s, n) => s + n, 0);
  return Math.round((sum / notas.length) * 10) / 10;
}

export function fmtHorasEval(n: number): string {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export function fmtPctColaboracion(pct: number | null): string {
  if (pct == null) return "Sin gasto";
  return `${pct.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
}

export const RESPUESTA_EVALUACION_LABEL: Record<RespuestaEvaluacionValor, string> = {
  CUMPLE: "Cumple",
  CUMPLE_PARCIAL: "Cumple parcial",
  NO_CUMPLE: "No cumple",
};

export const TIPO_EVALUACION_LABEL: Record<TipoEvaluacionEntregable, string> = {
  TALLER: "Taller",
  ENTREGABLE: "Entregable",
};
