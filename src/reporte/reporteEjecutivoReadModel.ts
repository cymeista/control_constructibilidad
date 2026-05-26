/**
 * Read model del Reporte Ejecutivo PDF (solo lectura; reutiliza calculadoras existentes).
 */

import type {
  AsignacionHora,
  Cliente,
  Entregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import {
  claveAlertaBloque1,
  claveAlertaBloque2,
  claveAlertaBloque3,
  claveAlertaBloque4GastoVsAsignado,
  claveAlertaFase1GastoSinAsignacion,
  mapaAlertasRevisadasPorClave,
  type AlertaRevisada,
} from "@/alertas/alertasOperativasRevisadas";
import {
  fechaEnRango,
  fechaHoyIsoLocalCapacidad,
  resolverFechaCorteEnPeriodo,
  type RangoPeriodo,
} from "@/capacidad/capacidadPeriodo";
import {
  filtrarProfesionalesCargables,
  idsProfesionalesCargables,
} from "@/capacidad/capacidadProfesional";
import {
  directasRealesMesCalendarioDashboard,
  directasRealesMesCalendarioPorProfesional,
  mesAnioCalendarioDesdeInicioPeriodo,
} from "@/entregables/dashboardDirectasMensualProrrateo";
import { aggregateGastoSinAsignacionActiva } from "@/entregables/asignacionHoraBloque4";
import { listarResumenAsignacionTripleFase1 } from "@/entregables/asignacionAlertasBloque4Formularios";
import { listarProfesionalesExcedidosEnEntregable } from "@/entregables/asignacionHoraConsumo";
import { listarCategoriasSobreconsumidasVsPresupuestoEntregable } from "@/entregables/asignacionHoraRules";
import { obtenerEntregablesActivosVisibles } from "@/entregables/entregableGestionHorasFiltros";
import {
  entregableEsCriticoORiesgoVisual,
  consolidarHitosEntregable,
  diasHorizonteHitos,
  etiquetaHorizonteHitos,
  hitoMasUrgenteEntregable,
  hitosPendientesEntregable,
  HORIZONTE_HITOS_SEMANAS_DEFAULT,
  rankEstadoFilaHitosConsolidada,
  sliceEstadoVisualEntregable,
  type HitoRelevanteEval,
  type HorizonteHitosSemanas,
} from "@/entregables/entregableHitosRelevantes";
import { resolverEstadoVisualEntregable } from "@/entregables/entregableSeguimiento";
import {
  type PeriodoReporteEjecutivoId,
  rangoPeriodoReporteEjecutivo,
} from "@/reporte/reporteEjecutivoPeriodo";

const EPS = 1e-6;
export const PROXIMOS_HITOS_MAX_FILAS_PDF = 8;

export type FiltrosReporteEjecutivo = {
  periodoId: PeriodoReporteEjecutivoId;
  clienteId: string;
  proyectoId: string;
  incluirAlertasRevisadas: boolean;
  /** Horizonte de hitos próximos (semanas). Por defecto 4. */
  horizonteHitosSemanas?: HorizonteHitosSemanas;
};

export type KpiReporteEjecutivo = {
  entregablesActivos: number;
  entregablesCriticosRetrasados: number;
  horasDirectasReales: number;
  horasIndirectas: number;
  cargabilidadRealEquipo: number | null;
  alertasAbiertas: number;
};

export type KpiSubtitulosReporteEjecutivo = {
  entregablesActivos: string;
  entregablesCriticosRetrasados: string;
  horasDirectasReales: string;
  horasIndirectas: string;
  cargabilidadRealEquipo: string;
  alertasAbiertas: string;
};

export type FilaCarteraReporte = {
  clienteProyecto: string;
  entregablesActivos: number;
  criticosRetrasados: number;
  proximosHitos: number;
  horasDirectas: number;
  alertasAbiertas: number;
  estado: "normal" | "atencion" | "critico";
};

export type AlertaEjecutivaTop = {
  prioridad: "Alta" | "Media" | "Baja";
  proyectoEntregable: string;
  situacion: string;
  accion: string;
  rank: number;
};

export type FilaCapacidadReporte = {
  nombre: string;
  directas: number;
  indirectas: number;
  cargabilidad: number | null;
  estado: "baja" | "normal" | "alta_directa";
};

export type HitoProximoReporte = {
  fecha: string;
  proyecto: string;
  entregable: string;
  hito: string;
  estado: string;
};

export type ReporteEjecutivoSnapshot = {
  fechaEmision: string;
  responsable: string;
  periodoLabel: string;
  periodoInicio: string;
  periodoFinTeorico: string;
  fechaCorteRegistroHora: string | null;
  resumenEjecutivo: string;
  kpis: KpiReporteEjecutivo;
  kpiSubtitulos: KpiSubtitulosReporteEjecutivo;
  cartera: FilaCarteraReporte[];
  topAlertas: AlertaEjecutivaTop[];
  capacidad: {
    profesionalesCargables: number;
    horasDirectas: number;
    horasIndirectas: number;
    cargabilidadReal: number | null;
    profesionalesBajaCargabilidad: number;
    profesionalesConDeficit: number;
    filas: FilaCapacidadReporte[];
  };
  proximosHitos: HitoProximoReporte[];
  /** Todas las filas consolidadas (vista previa). */
  proximosHitosCompletos: HitoProximoReporte[];
  proximosHitosAdicionales: number;
  tituloProximosHitos: string;
};

function resolveProyectoIds(
  proyectos: Proyecto[],
  clienteId: string,
  proyectoId: string,
): Set<string> | null {
  if (proyectoId !== "todos") return new Set([proyectoId]);
  if (clienteId !== "todos") {
    return new Set(proyectos.filter((p) => p.cliente_id === clienteId).map((p) => p.id));
  }
  return null;
}

function registroInScope(r: RegistroHora, proyectoIds: Set<string> | null): boolean {
  const pid = (r.proyecto_id ?? "").trim();
  if (!proyectoIds) return true;
  if (!pid) return false;
  return proyectoIds.has(pid);
}

function fmtDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

const MESES_ES_REPORTE = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function etiquetaMesAnio(mes1a12: number, anio: number): string {
  return `${MESES_ES_REPORTE[mes1a12 - 1] ?? "?"} ${anio}`;
}

function finEfectivoPeriodo(periodo: Pick<RangoPeriodo, "inicio" | "fin">, fechaCorte: string | null): string {
  const corte = (fechaCorte ?? "").trim();
  if (corte && corte >= periodo.inicio && corte <= periodo.fin) return corte;
  return periodo.fin;
}

/** INDIRECTA acumulada hasta corte (profesionales cargables), mismo corte que Capacidad del Equipo. */
function sumarIndirectasCargablesHastaCorte(
  registros: RegistroHora[],
  periodo: Pick<RangoPeriodo, "inicio" | "fin">,
  fechaCorte: string | null,
  idsCargables: Set<string>,
): number {
  const fin = finEfectivoPeriodo(periodo, fechaCorte);
  let s = 0;
  for (const r of registros) {
    const pid = (r.profesional_id ?? "").trim();
    if (!pid || !idsCargables.has(pid)) continue;
    if (r.tipo_hora !== "INDIRECTA") continue;
    const f = (r.fecha ?? "").trim();
    if (!fechaEnRango(f, periodo.inicio, fin)) continue;
    const h = Number(r.horas);
    if (!Number.isFinite(h) || h <= 0) continue;
    s += h;
  }
  return s;
}

/** DIRECTA + INDIRECTA brutas en ventana (profesionales cargables, hasta corte). */
function sumarHorasBrutasCargablesHastaCorte(
  registros: RegistroHora[],
  periodo: Pick<RangoPeriodo, "inicio" | "fin">,
  fechaCorte: string | null,
  idsCargables: Set<string>,
): { directas: number; indirectas: number } {
  const fin = finEfectivoPeriodo(periodo, fechaCorte);
  let directas = 0;
  let indirectas = 0;
  for (const r of registros) {
    const pid = (r.profesional_id ?? "").trim();
    if (!pid || !idsCargables.has(pid)) continue;
    const f = (r.fecha ?? "").trim();
    if (!fechaEnRango(f, periodo.inicio, fin)) continue;
    const h = Number(r.horas);
    if (!Number.isFinite(h) || h <= 0) continue;
    if (r.tipo_hora === "DIRECTA") directas += h;
    else if (r.tipo_hora === "INDIRECTA") indirectas += h;
  }
  return { directas, indirectas };
}

type HorasKpisReporte = {
  horasDirectasReales: number;
  horasIndirectas: number;
  dirCarg: number;
  indCarg: number;
  subtitulos: KpiSubtitulosReporteEjecutivo;
};

/**
 * KPIs de horas y cargabilidad: fuentes oficiales Dashboard (directas mes) y Capacidad (equipo cargable).
 */
function calcularHorasKpisReporte(
  periodoId: PeriodoReporteEjecutivoId,
  periodo: RangoPeriodo & { finTeorica: string; label: string },
  registrosScope: RegistroHora[],
  fechaCorte: string | null,
  idsCargables: Set<string>,
): HorasKpisReporte {
  const inicioFmt = fmtDdMmYyyy(periodo.inicio);
  const finFmt = fmtDdMmYyyy(finEfectivoPeriodo(periodo, fechaCorte));
  const corteFmt = fechaCorte ? fmtDdMmYyyy(fechaCorte) : finFmt;

  const usaDirectasDashboardMes = periodoId === "mes_actual";
  const mesAnioCal = usaDirectasDashboardMes ? mesAnioCalendarioDesdeInicioPeriodo(periodo.inicio) : null;

  let horasDirectasReales = 0;
  let horasIndirectas = 0;
  let dirCarg = 0;
  let indCarg = 0;

  let subDirectas = "RegistroHora DIRECTA · periodo del reporte";
  let subIndirectas = "RegistroHora INDIRECTA · equipo cargable";
  const subCargabilidad = `Periodo: ${inicioFmt} al ${corteFmt} · Directas ÷ total registrado · equipo cargable`;

  if (usaDirectasDashboardMes && mesAnioCal) {
    const { anio, mes1a12 } = mesAnioCal;
    const mesLabel = etiquetaMesAnio(mes1a12, anio);
    horasDirectasReales = directasRealesMesCalendarioDashboard(registrosScope, anio, mes1a12);
    dirCarg = directasRealesMesCalendarioDashboard(registrosScope, anio, mes1a12, {
      idsProfesionales: idsCargables,
    });
    indCarg = sumarIndirectasCargablesHastaCorte(registrosScope, periodo, fechaCorte, idsCargables);
    horasIndirectas = indCarg;
    subDirectas = `RegistroHora DIRECTA · ${mesLabel} · misma regla Dashboard`;
    subIndirectas = `RegistroHora INDIRECTA · ${mesLabel} · equipo cargable · hasta ${corteFmt}`;
  } else if (periodoId === "ano_actual") {
    const brute = sumarHorasBrutasCargablesHastaCorte(registrosScope, periodo, fechaCorte, idsCargables);
    horasDirectasReales = brute.directas;
    horasIndirectas = brute.indirectas;
    dirCarg = brute.directas;
    indCarg = brute.indirectas;
    subDirectas = `RegistroHora DIRECTA · ${periodo.label} · acumulado hasta ${corteFmt}`;
    subIndirectas = `RegistroHora INDIRECTA · ${periodo.label} · equipo cargable · hasta ${corteFmt}`;
  } else {
    const brute = sumarHorasBrutasCargablesHastaCorte(registrosScope, periodo, fechaCorte, idsCargables);
    horasDirectasReales = brute.directas;
    horasIndirectas = brute.indirectas;
    dirCarg = brute.directas;
    indCarg = brute.indirectas;
    subDirectas = `RegistroHora DIRECTA · ${periodo.label} · ${inicioFmt} al ${finFmt}`;
    subIndirectas = `RegistroHora INDIRECTA · ${periodo.label} · equipo cargable · hasta ${corteFmt}`;
  }

  return {
    horasDirectasReales,
    horasIndirectas,
    dirCarg,
    indCarg,
    subtitulos: {
      entregablesActivos: "Misma base que Gestión de Horas",
      entregablesCriticosRetrasados: "Estado visual recalculado · base activos visibles",
      horasDirectasReales: subDirectas,
      horasIndirectas: subIndirectas,
      cargabilidadRealEquipo: subCargabilidad,
      alertasAbiertas: "Alertas operativas abiertas en cartera activa",
    },
  };
}

function generarResumenEjecutivoAuto(kpis: KpiReporteEjecutivo, topN: number): string {
  const lineas: string[] = [];
  if (kpis.entregablesCriticosRetrasados > 0) {
    lineas.push(
      `La cartera incluye ${kpis.entregablesCriticosRetrasados} entregable${kpis.entregablesCriticosRetrasados === 1 ? "" : "s"} en estado crítico o con riesgo relevante.`,
    );
  } else {
    lineas.push("La cartera no registra entregables críticos en el alcance seleccionado.");
  }
  if (kpis.alertasAbiertas > 0) {
    lineas.push(
      `Hay ${kpis.alertasAbiertas} alerta${kpis.alertasAbiertas === 1 ? "" : "s"} operativa${kpis.alertasAbiertas === 1 ? "" : "s"} abiertas que requieren seguimiento.`,
    );
  } else {
    lineas.push("No hay alertas operativas abiertas pendientes de revisión en el alcance.");
  }
  const carga =
    kpis.cargabilidadRealEquipo != null
      ? `${Math.round(kpis.cargabilidadRealEquipo * 100)}% de cargabilidad real (directas sobre total registrado).`
      : "Sin carga registrada suficiente para cargabilidad del equipo.";
  lineas.push(`La carga real del equipo se sustenta en RegistroHora: ${carga}`);
  if (topN > 0) {
    lineas.push(`${topN} foco${topN === 1 ? "" : "s"} prioritario${topN === 1 ? "" : "s"} se detallan en alertas ejecutivas.`);
  }
  return lineas.slice(0, 4).join(" ");
}

export function buildReporteEjecutivoSnapshot(
  filtros: FiltrosReporteEjecutivo,
  resumenEjecutivoOverride: string | undefined,
  data: {
    profesionales: Profesional[];
    registro_horas: RegistroHora[];
    proyectos: Proyecto[];
    entregables: Entregable[];
    clientes: Cliente[];
    asignaciones_horas: AsignacionHora[];
    alertas_revisadas?: AlertaRevisada[];
  },
): ReporteEjecutivoSnapshot {
  const hoy = fechaHoyIsoLocalCapacidad();
  const horizonteSemanas = filtros.horizonteHitosSemanas ?? HORIZONTE_HITOS_SEMANAS_DEFAULT;
  const horizonteHitosDias = diasHorizonteHitos(horizonteSemanas);
  const tituloProximosHitos = `Próximos hitos relevantes · ${etiquetaHorizonteHitos(horizonteSemanas)}`;
  const periodo = rangoPeriodoReporteEjecutivo(filtros.periodoId, hoy);
  const proyectoIds = resolveProyectoIds(data.proyectos, filtros.clienteId, filtros.proyectoId);
  const revisadas = mapaAlertasRevisadasPorClave(data.alertas_revisadas ?? []);
  const esAbierta = (clave: string) => filtros.incluirAlertasRevisadas || !revisadas.has(clave);

  /** Misma base que Gestión de Horas → filtro Activos / no completados (predeterminado). */
  const entActivos = obtenerEntregablesActivosVisibles(
    data.entregables,
    data.proyectos,
    data.clientes,
    { clienteId: filtros.clienteId, proyectoId: filtros.proyectoId },
  );
  const entCriticos = entActivos.filter(entregableEsCriticoORiesgoVisual);
  const entActivosIds = new Set(entActivos.map((e) => e.id));

  const registrosScope = data.registro_horas.filter((r) => registroInScope(r, proyectoIds));
  const idsCargables = idsProfesionalesCargables(data.profesionales);
  const { fechaCorte } = resolverFechaCorteEnPeriodo(registrosScope, periodo, idsCargables);

  const horasKpis = calcularHorasKpisReporte(
    filtros.periodoId,
    periodo,
    registrosScope,
    fechaCorte,
    idsCargables,
  );
  const { horasDirectasReales, horasIndirectas, dirCarg, indCarg, subtitulos: kpiSubtitulos } = horasKpis;
  const totalCarg = dirCarg + indCarg;
  const cargabilidadRealEquipo = totalCarg > EPS ? dirCarg / totalCarg : null;

  const projMap = new Map(data.proyectos.map((p) => [p.id, p]));
  const cliMap = new Map(data.clientes.map((c) => [c.id, c]));
  const entMap = new Map(data.entregables.map((e) => [e.id, e]));

  const alertasAbiertasClaves = new Set<string>();

  const bloque1 = aggregateGastoSinAsignacionActiva(
    data.registro_horas,
    data.asignaciones_horas,
    data.entregables,
    data.proyectos,
    data.profesionales,
    hoy,
  );
  for (const row of bloque1) {
    const ent = entMap.get(row.entregable_id);
    if (!ent || !entActivosIds.has(ent.id)) continue;
    const clave = claveAlertaBloque1(ent.proyecto_id, row.entregable_id, row.profesional_id);
    if (esAbierta(clave)) alertasAbiertasClaves.add(clave);
  }

  for (const ent of entActivos) {
    const eid = ent.id;
    const ex = listarProfesionalesExcedidosEnEntregable(
      eid,
      data.asignaciones_horas,
      data.registro_horas,
      data.entregables,
      data.proyectos,
      data.profesionales,
      hoy,
    );
    for (const r of ex) {
      const clave = claveAlertaBloque2(ent.proyecto_id, eid, r.profesional_id, r.categoria);
      if (esAbierta(clave)) alertasAbiertasClaves.add(clave);
    }
  }

  for (const ent of entActivos) {
    const list = listarCategoriasSobreconsumidasVsPresupuestoEntregable(
      ent,
      data.asignaciones_horas,
      data.registro_horas,
      data.entregables,
      data.proyectos,
      data.profesionales,
      hoy,
    );
    for (const r of list) {
      const clave = claveAlertaBloque3(ent.proyecto_id, ent.id, r.categoria);
      if (esAbierta(clave)) alertasAbiertasClaves.add(clave);
    }
  }

  const resumenFase1 = listarResumenAsignacionTripleFase1(
    data.registro_horas,
    data.asignaciones_horas,
    data.entregables,
    data.proyectos,
    data.profesionales,
  );
  for (const r of resumenFase1) {
    const ent = entMap.get(r.entregable_id);
    if (!ent || !entActivosIds.has(ent.id)) continue;
    if (r.estado === "sin_asignacion") {
      const clave = claveAlertaFase1GastoSinAsignacion(
        r.proyecto_id,
        r.entregable_id,
        r.profesional_id,
        r.categoria,
      );
      if (esAbierta(clave)) alertasAbiertasClaves.add(clave);
    } else if (r.deficit > EPS) {
      const clave = claveAlertaBloque4GastoVsAsignado(
        r.proyecto_id,
        r.entregable_id,
        r.profesional_id,
        r.categoria,
      );
      if (esAbierta(clave)) alertasAbiertasClaves.add(clave);
    }
  }

  type Cand = AlertaEjecutivaTop & { sort: number; entregableId: string };
  const alertaPorEntregable = new Map<string, Cand>();

  const registrarAlerta = (entId: string, cand: Cand) => {
    const prev = alertaPorEntregable.get(entId);
    if (!prev || cand.sort > prev.sort) alertaPorEntregable.set(entId, cand);
  };

  const peLinea = (ent: Entregable) => {
    const pr = projMap.get(ent.proyecto_id);
    return `${pr?.codigo ?? "—"} / ${ent.nombre}`;
  };

  const situacionHito = (h: HitoRelevanteEval) => {
    const pctReq = Math.round(h.umbral_avance_requerido * 100);
    const pctReal = Math.round(h.avance_real * 100);
    if (h.estado === "Vencido") {
      return `Hito vencido (${h.tipo_hito}): avance ${pctReal}% · requiere ${pctReq}%`;
    }
    return `Hito próximo (${h.tipo_hito}): avance ${pctReal}% · requiere ${pctReq}%`;
  };

  for (const ent of entActivos) {
    const pe = peLinea(ent);
    const hitoUrg = hitoMasUrgenteEntregable(ent, hoy, horizonteHitosDias);
    if (hitoUrg && hitoUrg.estado === "Vencido") {
      registrarAlerta(ent.id, {
        entregableId: ent.id,
        rank: 1,
        prioridad: "Alta",
        sort: 1200 + hitoUrg.prioridad,
        proyectoEntregable: pe,
        situacion: situacionHito(hitoUrg),
        accion: "Coordinar revisión o recuperar avance",
      });
    }

    const slice = sliceEstadoVisualEntregable(ent);
    const estadoVisual = resolverEstadoVisualEntregable(ent);
    if (slice === "CRITICO") {
      registrarAlerta(ent.id, {
        entregableId: ent.id,
        rank: 2,
        prioridad: "Alta",
        sort: 1100,
        proyectoEntregable: pe,
        situacion: `Entregable crítico: ${estadoVisual}`,
        accion: "Revisar plan de recuperación y hitos",
      });
    }

    let maxDeficit = 0;
    let maxSinAsig = 0;
    for (const r of resumenFase1) {
      if (r.entregable_id !== ent.id) continue;
      if (r.estado === "sin_asignacion" && r.gasto_real_total > EPS) {
        const clave = claveAlertaFase1GastoSinAsignacion(
          r.proyecto_id,
          r.entregable_id,
          r.profesional_id,
          r.categoria,
        );
        if (esAbierta(clave)) maxSinAsig = Math.max(maxSinAsig, r.gasto_real_total);
      } else if (r.deficit > EPS) {
        const clave = claveAlertaBloque4GastoVsAsignado(
          r.proyecto_id,
          r.entregable_id,
          r.profesional_id,
          r.categoria,
        );
        if (esAbierta(clave)) maxDeficit = Math.max(maxDeficit, r.deficit);
      }
    }
    if (maxDeficit > EPS) {
      registrarAlerta(ent.id, {
        entregableId: ent.id,
        rank: 3,
        prioridad: "Alta",
        sort: 1000 + maxDeficit,
        proyectoEntregable: pe,
        situacion: `Gasto real supera horas asignadas (déficit ${maxDeficit.toFixed(0)} h)`,
        accion: "Normalizar asignación o aceptar sobrecupo",
      });
    } else if (maxSinAsig > EPS) {
      registrarAlerta(ent.id, {
        entregableId: ent.id,
        rank: 3,
        prioridad: "Alta",
        sort: 980 + maxSinAsig,
        proyectoEntregable: pe,
        situacion: `Gasto real sin horas asignadas (${maxSinAsig.toFixed(0)} h)`,
        accion: "Normalizar asignación",
      });
    }

    let maxSobre = 0;
    let catSobre = "";
    const list = listarCategoriasSobreconsumidasVsPresupuestoEntregable(
      ent,
      data.asignaciones_horas,
      data.registro_horas,
      data.entregables,
      data.proyectos,
      data.profesionales,
      hoy,
    );
    for (const r of list) {
      if (r.sobreconsumo <= EPS) continue;
      const clave = claveAlertaBloque3(ent.proyecto_id, ent.id, r.categoria);
      if (!esAbierta(clave)) continue;
      if (r.sobreconsumo > maxSobre) {
        maxSobre = r.sobreconsumo;
        catSobre = r.categoria;
      }
    }
    if (maxSobre > EPS) {
      registrarAlerta(ent.id, {
        entregableId: ent.id,
        rank: 4,
        prioridad: "Media",
        sort: 700 + maxSobre,
        proyectoEntregable: pe,
        situacion: `Sobreconsumo de horas en categoría ${catSobre} (+${maxSobre.toFixed(0)} h)`,
        accion: "Revisar presupuesto y redistribución",
      });
    }

    if (hitoUrg && hitoUrg.estado === "Próximo") {
      registrarAlerta(ent.id, {
        entregableId: ent.id,
        rank: 5,
        prioridad: "Media",
        sort: 600 + hitoUrg.prioridad,
        proyectoEntregable: pe,
        situacion: situacionHito(hitoUrg),
        accion: "Coordinar revisión o cierre",
      });
    } else if (slice === "RIESGO" && !alertaPorEntregable.has(ent.id)) {
      registrarAlerta(ent.id, {
        entregableId: ent.id,
        rank: 2,
        prioridad: "Media",
        sort: 650,
        proyectoEntregable: pe,
        situacion: `Entregable en riesgo: ${estadoVisual}`,
        accion: "Revisar plan de recuperación",
      });
    }
  }

  const topAlertas: AlertaEjecutivaTop[] = [...alertaPorEntregable.values()]
    .sort((a, b) => b.sort - a.sort)
    .slice(0, 5)
    .map(({ sort: _s, entregableId: _e, ...rest }) => rest);

  type HitoRowSort = HitoProximoReporte & {
    rankEstado: number;
    sortClienteProyecto: string;
  };
  const hitosCand: HitoRowSort[] = [];
  for (const ent of entActivos) {
    const fila = consolidarHitosEntregable(ent, hoy, horizonteHitosDias);
    if (!fila) continue;
    const pr = projMap.get(ent.proyecto_id);
    const cli = pr ? cliMap.get(pr.cliente_id) : undefined;
    hitosCand.push({
      fecha: fila.fecha,
      proyecto: pr ? `${pr.codigo} · ${pr.nombre}` : "—",
      entregable: ent.nombre,
      hito: fila.hito,
      estado: fila.estado,
      rankEstado: rankEstadoFilaHitosConsolidada(fila.estado),
      sortClienteProyecto: cli ? `${cli.nombre}|${pr?.codigo ?? ""}` : pr?.codigo ?? ent.proyecto_id,
    });
  }
  hitosCand.sort((a, b) => {
    if (a.rankEstado !== b.rankEstado) return a.rankEstado - b.rankEstado;
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    if (a.sortClienteProyecto !== b.sortClienteProyecto) {
      return a.sortClienteProyecto.localeCompare(b.sortClienteProyecto);
    }
    return a.entregable.localeCompare(b.entregable);
  });
  const proximosHitosCompletos: HitoProximoReporte[] = hitosCand.map(
    ({ rankEstado: _r, sortClienteProyecto: _s, ...row }) => row,
  );
  const proximosHitos = proximosHitosCompletos.slice(0, PROXIMOS_HITOS_MAX_FILAS_PDF);
  const proximosHitosAdicionales = Math.max(0, proximosHitosCompletos.length - PROXIMOS_HITOS_MAX_FILAS_PDF);

  const profsCargables = filtrarProfesionalesCargables(data.profesionales);
  const profFilas: Array<FilaCapacidadReporte & { deficit: number; sort: number }> = [];
  const deficitPorProf = new Map<string, number>();
  for (const r of resumenFase1) {
    if (r.deficit <= EPS && r.estado !== "sin_asignacion") continue;
    deficitPorProf.set(r.profesional_id, (deficitPorProf.get(r.profesional_id) ?? 0) + r.deficit);
  }

  const usaDirectasDashboardMes = filtros.periodoId === "mes_actual";
  const mesAnioCal = usaDirectasDashboardMes ? mesAnioCalendarioDesdeInicioPeriodo(periodo.inicio) : null;
  const directasMesPorProf =
    usaDirectasDashboardMes && mesAnioCal
      ? directasRealesMesCalendarioPorProfesional(
          registrosScope,
          mesAnioCal.anio,
          mesAnioCal.mes1a12,
          idsCargables,
        )
      : null;
  const finHoras = finEfectivoPeriodo(periodo, fechaCorte);

  for (const prof of profsCargables) {
    let d = 0;
    let i = 0;
    if (directasMesPorProf && mesAnioCal) {
      d = directasMesPorProf.get(prof.id) ?? 0;
      for (const reg of registrosScope) {
        if ((reg.profesional_id ?? "").trim() !== prof.id) continue;
        if (reg.tipo_hora !== "INDIRECTA") continue;
        const f = (reg.fecha ?? "").trim();
        if (!fechaEnRango(f, periodo.inicio, finHoras)) continue;
        const h = Number(reg.horas);
        if (!Number.isFinite(h) || h <= 0) continue;
        i += h;
      }
    } else {
      for (const reg of registrosScope) {
        if ((reg.profesional_id ?? "").trim() !== prof.id) continue;
        const f = (reg.fecha ?? "").trim();
        if (!fechaEnRango(f, periodo.inicio, finHoras)) continue;
        const h = Number(reg.horas);
        if (!Number.isFinite(h) || h <= 0) continue;
        if (reg.tipo_hora === "DIRECTA") d += h;
        else if (reg.tipo_hora === "INDIRECTA") i += h;
      }
    }
    const total = d + i;
    const carg = total > EPS ? d / total : null;
    let estado: FilaCapacidadReporte["estado"] = "normal";
    if (carg != null) {
      if (carg < 0.7) estado = "baja";
      else if (carg > 0.85) estado = "alta_directa";
    }
    const deficit = deficitPorProf.get(prof.id) ?? 0;
    let sort = d;
    if (estado === "baja") sort += 10000;
    if (deficit > EPS) sort += 5000;
    profFilas.push({
      nombre: prof.nombre_completo,
      directas: d,
      indirectas: i,
      cargabilidad: carg,
      estado,
      deficit,
      sort,
    });
  }
  profFilas.sort((a, b) => b.sort - a.sort);
  const filasCap = profFilas.slice(0, 6).map(({ deficit: _d, sort: _s, ...f }) => f);

  const carteraMap = new Map<
    string,
    {
      proyectoId: string;
      activos: number;
      criticos: number;
      entregablesConHitos: number;
      directas: number;
      alertas: number;
    }
  >();

  for (const ent of entActivos) {
    const pid = ent.proyecto_id;
    const row = carteraMap.get(pid) ?? {
      proyectoId: pid,
      activos: 0,
      criticos: 0,
      entregablesConHitos: 0,
      directas: 0,
      alertas: 0,
    };
    row.activos += 1;
    const slice = sliceEstadoVisualEntregable(ent);
    if (slice === "CRITICO" || slice === "RIESGO") row.criticos += 1;
    if (hitosPendientesEntregable(ent, hoy, horizonteHitosDias).length > 0) row.entregablesConHitos += 1;
    carteraMap.set(pid, row);
  }

  for (const r of registrosScope) {
    if (r.tipo_hora !== "DIRECTA") continue;
    const f = (r.fecha ?? "").trim();
    if (!fechaEnRango(f, periodo.inicio, periodo.fin)) continue;
    const pid = (r.proyecto_id ?? "").trim();
    if (!pid) continue;
    const row = carteraMap.get(pid);
    if (row) row.directas += Number(r.horas) || 0;
  }

  for (const clave of alertasAbiertasClaves) {
    const parts = clave.split("|");
    const projId = parts[1] ?? "";
    if (!projId) continue;
    const row = carteraMap.get(projId);
    if (row) row.alertas += 1;
  }

  const carteraRows: FilaCarteraReporte[] = [];
  for (const [pid, row] of carteraMap) {
    const pr = projMap.get(pid);
    const cli = pr ? cliMap.get(pr.cliente_id) : undefined;
    let estado: FilaCarteraReporte["estado"] = "normal";
    const tieneCriticoSlice = entActivos.some(
      (e) => e.proyecto_id === pid && sliceEstadoVisualEntregable(e) === "CRITICO",
    );
    if (tieneCriticoSlice || row.alertas >= 3) estado = "critico";
    else if (row.alertas > 0 || row.entregablesConHitos > 0) estado = "atencion";
    carteraRows.push({
      clienteProyecto: cli ? `${cli.nombre} / ${pr?.codigo ?? ""}` : pr?.codigo ?? pid,
      entregablesActivos: row.activos,
      criticosRetrasados: row.criticos,
      proximosHitos: row.entregablesConHitos,
      horasDirectas: row.directas,
      alertasAbiertas: row.alertas,
      estado,
    });
  }
  carteraRows.sort((a, b) => {
    const rank = { critico: 0, atencion: 1, normal: 2 };
    if (rank[a.estado] !== rank[b.estado]) return rank[a.estado] - rank[b.estado];
    return b.alertasAbiertas - a.alertasAbiertas;
  });

  let cartera: FilaCarteraReporte[];
  if (carteraRows.length <= 8) {
    cartera = carteraRows;
  } else {
    const top = carteraRows.slice(0, 7);
    const resto = carteraRows.slice(7);
    top.push({
      clienteProyecto: "Otros",
      entregablesActivos: resto.reduce((s, r) => s + r.entregablesActivos, 0),
      criticosRetrasados: resto.reduce((s, r) => s + r.criticosRetrasados, 0),
      proximosHitos: resto.reduce((s, r) => s + r.proximosHitos, 0),
      horasDirectas: resto.reduce((s, r) => s + r.horasDirectas, 0),
      alertasAbiertas: resto.reduce((s, r) => s + r.alertasAbiertas, 0),
      estado: resto.some((r) => r.estado === "critico")
        ? "critico"
        : resto.some((r) => r.estado === "atencion")
          ? "atencion"
          : "normal",
    });
    cartera = top;
  }

  const kpis: KpiReporteEjecutivo = {
    entregablesActivos: entActivos.length,
    entregablesCriticosRetrasados: entCriticos.length,
    horasDirectasReales,
    horasIndirectas,
    cargabilidadRealEquipo,
    alertasAbiertas: alertasAbiertasClaves.size,
  };

  const resumenDefault = generarResumenEjecutivoAuto(kpis, topAlertas.length);
  const resumenEjecutivo = (resumenEjecutivoOverride ?? "").trim() || resumenDefault;

  return {
    fechaEmision: hoy,
    responsable: "Ricardo Gattás",
    periodoLabel: periodo.label,
    periodoInicio: periodo.inicio,
    periodoFinTeorico: periodo.finTeorica,
    fechaCorteRegistroHora: fechaCorte,
    resumenEjecutivo,
    kpis,
    kpiSubtitulos,
    cartera,
    topAlertas,
    capacidad: {
      profesionalesCargables: profsCargables.length,
      horasDirectas: dirCarg,
      horasIndirectas: indCarg,
      cargabilidadReal: cargabilidadRealEquipo,
      profesionalesBajaCargabilidad: profFilas.filter((f) => f.estado === "baja").length,
      profesionalesConDeficit: profFilas.filter((f) => f.deficit > EPS).length,
      filas: filasCap,
    },
    proximosHitos,
    proximosHitosCompletos,
    proximosHitosAdicionales,
    tituloProximosHitos,
  };
}

export function fmtFechaReporte(iso: string | null): string {
  if (!iso) return "—";
  return fmtDdMmYyyy(iso);
}

const NOMBRE_BASE_EXPORT_REPORTE = "Constructibilidad - Control de Proyectos";

/** YYYYMMDD desde fecha de emisión ISO (YYYY-MM-DD) o fecha local actual. */
export function yyyyMMddDesdeFechaEmision(fechaEmisionIso: string): string {
  const t = (fechaEmisionIso ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}${mo}${da}`;
}

/** Nombre sugerido al guardar PDF vía impresión del navegador (sin extensión .pdf en title). */
export function nombreExportacionReporteEjecutivo(fechaEmisionIso: string): string {
  return `${yyyyMMddDesdeFechaEmision(fechaEmisionIso)} ${NOMBRE_BASE_EXPORT_REPORTE}`;
}
