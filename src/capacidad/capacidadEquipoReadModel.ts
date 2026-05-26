/**
 * Read model: Capacidad del Equipo (solo lectura, sin mutar datos).
 */

import type {
  AsignacionHora,
  Cliente,
  Entregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import { listarResumenAsignacionTripleFase1 } from "@/entregables/asignacionAlertasBloque4Formularios";
import { calculateAvanceTeorico, dateToUtcEpoch } from "@/entregables/entregableSeguimiento";
import {
  capacidadNominalAcumuladaAfechaCorte,
  capacidadObjetivoDesdeNominal,
  CAPACIDAD_NOMINAL_SEMANAL_H,
  fechaEnRango,
  fechaHoyIsoLocalCapacidad,
  resolverFechaCorteEnPeriodo,
  finPeriodoTeoricoCapacidad,
  rangoPeriodoCapacidad,
  type PeriodoCapacidadId,
  type RangoPeriodo,
} from "@/capacidad/capacidadPeriodo";
import {
  capacidadNominalMensualBase,
  esProfesionalCargable,
  filtrarProfesionalesCargables,
  idsProfesionalesCargables,
} from "@/capacidad/capacidadProfesional";
import {
  directasRealesMesCalendarioDashboard,
  directasRealesMesCalendarioPorProfesional,
  mesAnioCalendarioDesdeInicioPeriodo,
} from "@/entregables/dashboardDirectasMensualProrrateo";
import {
  entregablePasaFiltroActivosGestionHoras,
  entregableTieneProyectoYCliente,
  estadoNormalizadoEntregableGestionHoras,
} from "@/entregables/entregableGestionHorasFiltros";

const EPS = 1e-6;

/** Composición directas / total registrado (sin vacaciones). */
export type EstadoComposicionCarga = "baja" | "normal" | "alta" | "muy_alta";

export type EtiquetaCumplimientoObjetivo = "bajo_objetivo" | "en_objetivo" | "sobre_objetivo";

export type FilaCapacidadProfesional = {
  profesionalId: string;
  nombre: string;
  cargo: string;
  horasDirectas: number;
  horasIndirectas: number;
  totalRegistrado: number;
  /** Directas ÷ (Directas + Indirectas). */
  cargabilidadReal: number | null;
  /** Capacidad nominal acumulada × % objetivo (referencia meta directa). */
  objetivoDirectoRef: number;
  /** Directas ÷ objetivo directo ref.; puede superar 100%. */
  cumplimientoObjetivoDirecto: number | null;
  estadoComposicion: EstadoComposicionCarga;
  etiquetaCumplimiento: EtiquetaCumplimientoObjetivo | null;
};

export type PresionCarteraNivel = "baja" | "media" | "alta" | "critica";

export type FilaPresionCartera = {
  entregableId: string;
  clienteNombre: string;
  proyectoNombre: string;
  entregableNombre: string;
  fechaProxima: string;
  avanceRealPct: number;
  avanceTeoricoPct: number;
  horasPresupuesto: number;
  horasGastadas: number;
  horasPendientes: number;
  sobreconsumido: boolean;
  presion: PresionCarteraNivel;
};

export type RiesgoCargaItem = {
  id: string;
  texto: string;
  severidad: "info" | "atencion" | "critico";
};

export type FechasCalculoCapacidad = {
  inicioPeriodo: string;
  finPeriodoTeorica: string;
  corteReal: string | null;
  etiquetaPeriodo: string;
};

/** Mes calendario completo: misma regla prorrateada que Dashboard «Directas reales del mes». */
export function periodoUsaDirectasMensualDashboard(id: PeriodoCapacidadId): boolean {
  return id === "mes_actual" || id === "mes_anterior";
}

/** Texto KPI presión de cartera (P4+P3+P2, sin L2). */
export const PRESION_CARTERA_KPI_SUBTITULO =
  "Pendiente P4+P3+P2 vs capacidad objetivo 4 sem. · excluye L2";

export type CapacidadEquipoSnapshot = {
  periodo: RangoPeriodo;
  fechas: FechasCalculoCapacidad;
  hoy: string;
  fechaCorte: string | null;
  ultimaCargaRegistrada: string | null;
  sinCargaEnPeriodo: boolean;
  porcentajeObjetivo: number;
  /** true = KPI/tabla/gráfico de directas usan prorrateo mensual Dashboard (no suma bruta por fecha). */
  directasReglaDashboardMensual: boolean;
  subtituloHorasDirectasKpi: string;
  presionCarteraKpiSubtitulo: string;
  kpis: {
    capacidadObjetivoEquipo: number;
    horasDirectasReales: number;
    cargabilidadRealEquipo: number | null;
    cumplimientoObjetivoDirectoEquipo: number | null;
    horasIndirectas: number;
    horasVacaciones: number;
    profesionalesSobreObjetivoDirecto: number;
    profesionalesBajaCargabilidad: number;
    presionCarteraRatio: number | null;
    horasPendientesProximas: number;
    capacidadDisponibleProximas: number;
  };
  filasProfesionales: FilaCapacidadProfesional[];
  presionCartera: FilaPresionCartera[];
  riesgos: RiesgoCargaItem[];
  distribucionComposicion: Record<EstadoComposicionCarga, number>;
};

/** Cargabilidad real = proporción de horas directas sobre total registrado. */
function clasificarComposicionCarga(ratio: number): EstadoComposicionCarga {
  if (ratio < 0.7) return "baja";
  if (ratio <= 0.85) return "normal";
  if (ratio <= 0.95) return "alta";
  return "muy_alta";
}

function etiquetaCumplimientoObjetivo(ratio: number | null): EtiquetaCumplimientoObjetivo | null {
  if (ratio == null) return null;
  if (ratio < 0.85) return "bajo_objetivo";
  if (ratio <= 1) return "en_objetivo";
  return "sobre_objetivo";
}

function entregableEstaCompletado(ent: Entregable): boolean {
  const ar = Number(ent.avance_real);
  if (Number.isFinite(ar) && ar >= 1 - EPS) return true;
  const est = String(ent.estado ?? "").toLowerCase();
  return est.includes("complet");
}

/** Presupuesto relevante para presión de cartera: solo P4+P3+P2 (sin L2). */
export function horasPresupuestoP4P3P2PresionCartera(ent: Entregable): number {
  const p4 = Number(ent.hrs_p4);
  const p3 = Number(ent.hrs_p3);
  const p2 = Number(ent.hrs_p2);
  return (
    (Number.isFinite(p4) ? p4 : 0) +
    (Number.isFinite(p3) ? p3 : 0) +
    (Number.isFinite(p2) ? p2 : 0)
  );
}

function entregableEsNoIniciado(ent: Entregable): boolean {
  const est = estadoNormalizadoEntregableGestionHoras(ent.estado);
  return est === "NO_INICIADO" || est === "NO INICIADO";
}

function entregableEnHorizonteCalendario(
  ent: Entregable,
  fechaProx: string,
  rango: Pick<RangoPeriodo, "inicio" | "fin">,
): boolean {
  return (
    fechaEnRango(fechaProx, rango.inicio, rango.fin) ||
    fechaEnRango((ent.fecha_inicio ?? "").trim(), rango.inicio, rango.fin) ||
    fechaEnRango((ent.fecha_termino ?? "").trim(), rango.inicio, rango.fin)
  );
}

function entregableVencidoNoCompletado(ent: Entregable, hoy: string): boolean {
  const term = (ent.fecha_termino ?? "").trim();
  return Boolean(term && term < hoy && (Number(ent.avance_real) || 0) < 1 - EPS);
}

/**
 * Inclusión en presión de cartera: activos (Gestión de Horas), vencidos incompletos,
 * o no iniciados con fechas en el horizonte de 4 semanas (excluye no iniciados lejanos).
 */
function entregableIncluidoPresionCartera(
  ent: Entregable,
  hoy: string,
  rangoProx: Pick<RangoPeriodo, "inicio" | "fin">,
): boolean {
  if (entregableEstaCompletado(ent)) return false;

  const enCal = entregableEnHorizonteCalendario(ent, fechaProximaEntregable(ent, hoy), rangoProx);
  const vencido = entregableVencidoNoCompletado(ent, hoy);
  if (!enCal && !vencido) return false;

  const activoHoras = entregablePasaFiltroActivosGestionHoras(ent);
  const noIniciadoProximo = entregableEsNoIniciado(ent) && enCal;
  return activoHoras || vencido || noIniciadoProximo;
}

function proyectoEsActivo(pr: Proyecto | undefined): boolean {
  if (!pr) return false;
  return pr.estado === "ACTIVO";
}

function fechaProximaEntregable(ent: Entregable, hoy: string): string {
  const candidatas: string[] = [];
  const push = (v?: string | null) => {
    const t = (v ?? "").trim();
    if (t && t >= hoy) candidatas.push(t);
  };
  push(ent.fecha_termino);
  push(ent.fecha_revA);
  push(ent.fecha_revB);
  push(ent.fecha_revP);
  if (candidatas.length === 0) {
    const t = (ent.fecha_termino ?? "").trim();
    return t || hoy;
  }
  candidatas.sort();
  return candidatas[0]!;
}

function diasHasta(fecha: string, hoy: string): number {
  const a = dateToUtcEpoch(hoy);
  const b = dateToUtcEpoch(fecha);
  if (a == null || b == null) return 999;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function clasificarPresionCartera(input: {
  horasPendientes: number;
  diasHastaFecha: number;
  avanceReal: number;
  avanceTeorico: number;
  fechaVencida: boolean;
}): PresionCarteraNivel {
  const { horasPendientes, diasHastaFecha, avanceReal, avanceTeorico, fechaVencida } = input;
  if (fechaVencida && avanceReal < 0.9 - EPS) return "critica";
  if (avanceReal + EPS < avanceTeorico - 0.2) return "critica";
  if (horasPendientes > 80 || (horasPendientes > 40 && diasHastaFecha <= 14)) return "alta";
  if (horasPendientes > 20 && diasHastaFecha <= 28) return "media";
  if (horasPendientes <= 5 && diasHastaFecha > 28) return "baja";
  return horasPendientes > 0 ? "media" : "baja";
}

/** Horas acumuladas desde inicio del periodo hasta fecha_corte (inclusive). */
function sumarHorasRegistroHastaFechaCorte(
  registros: RegistroHora[],
  profId: string,
  periodo: RangoPeriodo,
  fechaCorte: string,
): { directas: number; indirectas: number; vacaciones: number } {
  let directas = 0;
  let indirectas = 0;
  let vacaciones = 0;
  for (const r of registros) {
    if ((r.profesional_id ?? "").trim() !== profId) continue;
    const f = (r.fecha ?? "").trim();
    if (!fechaEnRango(f, periodo.inicio, periodo.fin)) continue;
    if (f > fechaCorte) continue;
    const h = Number(r.horas);
    if (!Number.isFinite(h) || h <= 0) continue;
    if (r.tipo_hora === "DIRECTA") directas += h;
    else if (r.tipo_hora === "INDIRECTA") indirectas += h;
    else if (r.tipo_hora === "VACACIONES") vacaciones += h;
  }
  return { directas, indirectas, vacaciones };
}

export function buildCapacidadEquipoSnapshot(
  periodoId: PeriodoCapacidadId,
  porcentajeObjetivoPct: number,
  data: {
    profesionales: Profesional[];
    registro_horas: RegistroHora[];
    proyectos: Proyecto[];
    entregables: Entregable[];
    clientes: Cliente[];
    asignaciones_horas: AsignacionHora[];
  },
): CapacidadEquipoSnapshot {
  const hoy = fechaHoyIsoLocalCapacidad();
  const periodo = rangoPeriodoCapacidad(periodoId, hoy);
  const ratioObjetivo = Math.min(1, Math.max(0.6, porcentajeObjetivoPct / 100));
  const profsCargables = filtrarProfesionalesCargables(data.profesionales);
  const idsCargables = idsProfesionalesCargables(data.profesionales);

  const { fechaCorte, ultimaCargaRegistrada } = periodo.esFuturo
    ? { fechaCorte: null as string | null, ultimaCargaRegistrada: null as string | null }
    : resolverFechaCorteEnPeriodo(data.registro_horas, periodo, idsCargables);
  const sinCargaEnPeriodo = !periodo.esFuturo && !fechaCorte;

  const fechas: FechasCalculoCapacidad = {
    inicioPeriodo: periodo.inicio,
    finPeriodoTeorica: finPeriodoTeoricoCapacidad(periodoId, hoy),
    corteReal: fechaCorte,
    etiquetaPeriodo: periodo.label,
  };

  const projMap = new Map(data.proyectos.map((p) => [p.id, p]));
  const cliMap = new Map(data.clientes.map((c) => [c.id, c]));

  const usaDirectasDashboardMes = periodoUsaDirectasMensualDashboard(periodoId);
  const mesAnioCal =
    usaDirectasDashboardMes ? mesAnioCalendarioDesdeInicioPeriodo(periodo.inicio) : null;
  const directasMesPorProf =
    usaDirectasDashboardMes && mesAnioCal && !periodo.esFuturo
      ? directasRealesMesCalendarioPorProfesional(
          data.registro_horas,
          mesAnioCal.anio,
          mesAnioCal.mes1a12,
          idsCargables,
        )
      : null;

  const MESES_ES = [
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
  const subtituloHorasDirectasKpi = usaDirectasDashboardMes && mesAnioCal
    ? `Directas reales del equipo cargable · misma regla mensual Dashboard · ${MESES_ES[mesAnioCal.mes1a12 - 1] ?? "?"} ${mesAnioCal.anio}`
    : "Directas acumuladas hasta fecha de corte";

  const filasProfesionales: FilaCapacidadProfesional[] = [];
  let sumDirectas = 0;
  let sumIndirectas = 0;
  let sumVacaciones = 0;
  let sumObjetivo = 0;
  const distribucionComposicion: Record<EstadoComposicionCarga, number> = {
    baja: 0,
    normal: 0,
    alta: 0,
    muy_alta: 0,
  };

  for (const prof of profsCargables) {
    const pid = prof.id;
    const baseMes = capacidadNominalMensualBase(prof);

    let horas = { directas: 0, indirectas: 0, vacaciones: 0 };
    let capNominalAcum = 0;
    let capObjetivoAcum = 0;

    if (!periodo.esFuturo && fechaCorte) {
      if (directasMesPorProf && mesAnioCal) {
        horas = {
          directas: directasMesPorProf.get(pid) ?? 0,
          indirectas: 0,
          vacaciones: 0,
        };
        const brute = sumarHorasRegistroHastaFechaCorte(data.registro_horas, pid, periodo, fechaCorte);
        horas.indirectas = brute.indirectas;
        horas.vacaciones = brute.vacaciones;
      } else {
        horas = sumarHorasRegistroHastaFechaCorte(data.registro_horas, pid, periodo, fechaCorte);
      }
      capNominalAcum = capacidadNominalAcumuladaAfechaCorte(periodo, fechaCorte, baseMes);
      capObjetivoAcum = capacidadObjetivoDesdeNominal(capNominalAcum, ratioObjetivo);
    }

    sumDirectas += horas.directas;
    sumIndirectas += horas.indirectas;
    sumVacaciones += horas.vacaciones;
    sumObjetivo += capObjetivoAcum;

    const totalRegistrado = horas.directas + horas.indirectas;
    const cargabilidadReal =
      sinCargaEnPeriodo || periodo.esFuturo
        ? null
        : totalRegistrado > EPS
          ? horas.directas / totalRegistrado
          : 0;

    const cumplimientoObjetivoDirecto =
      sinCargaEnPeriodo || periodo.esFuturo
        ? null
        : capObjetivoAcum > EPS
          ? horas.directas / capObjetivoAcum
          : null;

    const estadoComposicion =
      cargabilidadReal == null ? "normal" : clasificarComposicionCarga(cargabilidadReal);
    if (cargabilidadReal != null && totalRegistrado > EPS) distribucionComposicion[estadoComposicion] += 1;

    filasProfesionales.push({
      profesionalId: pid,
      nombre: prof.nombre_completo,
      cargo: prof.cargo,
      horasDirectas: horas.directas,
      horasIndirectas: horas.indirectas,
      totalRegistrado,
      cargabilidadReal,
      objetivoDirectoRef: capObjetivoAcum,
      cumplimientoObjetivoDirecto,
      estadoComposicion,
      etiquetaCumplimiento: etiquetaCumplimientoObjetivo(cumplimientoObjetivoDirecto),
    });
  }

  filasProfesionales.sort((a, b) => (b.cargabilidadReal ?? 0) - (a.cargabilidadReal ?? 0));

  const rangoProx = rangoPeriodoCapacidad("proximas_4_semanas", hoy);
  const presionCartera: FilaPresionCartera[] = [];

  for (const ent of data.entregables) {
    const pr = projMap.get(ent.proyecto_id);
    if (!proyectoEsActivo(pr)) continue;
    if (!entregableTieneProyectoYCliente(ent, projMap, cliMap)) continue;
    if (!entregableIncluidoPresionCartera(ent, hoy, rangoProx)) continue;

    const fechaProx = fechaProximaEntregable(ent, hoy);

    const avanceReal = Number(ent.avance_real) || 0;
    const avanceTeorico =
      Number.isFinite(ent.avance_teorico) && ent.avance_teorico > 0
        ? ent.avance_teorico
        : calculateAvanceTeorico({
            tipo_flujo: ent.tipo_flujo ?? "SIN_REVISIONES",
            fecha_inicio: ent.fecha_inicio,
            fecha_termino: ent.fecha_termino,
            fecha_revA: ent.fecha_revA,
            fecha_revB: ent.fecha_revB,
            fecha_revP: ent.fecha_revP,
            avance_real: avanceReal,
          });

    const horasPresupuesto = horasPresupuestoP4P3P2PresionCartera(ent);
    const horasGastadas = Math.max(0, Number(ent.hrs_gastadas) || 0);
    const sobreconsumido = horasGastadas > horasPresupuesto + EPS;
    const horasPendientes = sobreconsumido ? 0 : Math.max(0, horasPresupuesto - horasGastadas);
    const term = (ent.fecha_termino ?? "").trim();
    const fechaVencida = Boolean(term && term < hoy);

    presionCartera.push({
      entregableId: ent.id,
      clienteNombre: cliMap.get(pr?.cliente_id ?? "")?.nombre ?? "—",
      proyectoNombre: pr ? `${pr.codigo} · ${pr.nombre}` : "—",
      entregableNombre: ent.nombre,
      fechaProxima: fechaProx,
      avanceRealPct: avanceReal * 100,
      avanceTeoricoPct: avanceTeorico * 100,
      horasPresupuesto,
      horasGastadas,
      horasPendientes,
      sobreconsumido,
      presion: clasificarPresionCartera({
        horasPendientes,
        diasHastaFecha: diasHasta(fechaProx, hoy),
        avanceReal,
        avanceTeorico,
        fechaVencida,
      }),
    });
  }

  presionCartera.sort((a, b) => {
    const rank: Record<PresionCarteraNivel, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
    if (rank[a.presion] !== rank[b.presion]) return rank[a.presion] - rank[b.presion];
    return b.horasPendientes - a.horasPendientes;
  });

  const horasPendientesProximas = presionCartera.reduce((s, r) => s + r.horasPendientes, 0);
  const capacidadDisponibleProximas =
    profsCargables.length * 4 * CAPACIDAD_NOMINAL_SEMANAL_H * ratioObjetivo;
  const presionCarteraRatio =
    capacidadDisponibleProximas > EPS ? horasPendientesProximas / capacidadDisponibleProximas : null;

  const sumTotalRegistrado = sumDirectas + sumIndirectas;
  const cargabilidadEquipo =
    sinCargaEnPeriodo || periodo.esFuturo
      ? null
      : sumTotalRegistrado > EPS
        ? sumDirectas / sumTotalRegistrado
        : 0;

  const cumplimientoObjetivoEquipo =
    sinCargaEnPeriodo || periodo.esFuturo
      ? null
      : sumObjetivo > EPS
        ? sumDirectas / sumObjetivo
        : null;

  const riesgos: RiesgoCargaItem[] = [];
  const nSobreObjetivo = filasProfesionales.filter(
    (f) => f.cumplimientoObjetivoDirecto != null && f.cumplimientoObjetivoDirecto > 1 + EPS,
  ).length;
  const nBaja = filasProfesionales.filter(
    (f) => f.cargabilidadReal != null && f.totalRegistrado > EPS && f.cargabilidadReal < 0.7,
  ).length;
  if (nSobreObjetivo > 0) {
    riesgos.push({
      id: "sobre-objetivo",
      texto: `${nSobreObjetivo} profesional${nSobreObjetivo === 1 ? "" : "es"} sobre objetivo directo de referencia (>100% cumplimiento).`,
      severidad: "info",
    });
  }
  if (nBaja > 0) {
    riesgos.push({
      id: "baja-composicion",
      texto: `${nBaja} profesional${nBaja === 1 ? "" : "es"} con baja cargabilidad real (<70% directas sobre total registrado).`,
      severidad: "info",
    });
  }
  const resumenFase1 = listarResumenAsignacionTripleFase1(
    data.registro_horas,
    data.asignaciones_horas,
    data.entregables,
    data.proyectos,
    data.profesionales,
  );
  const entDeficit = resumenFase1.filter((r) => r.deficit > EPS).length;
  if (entDeficit > 0) {
    riesgos.push({
      id: "deficit",
      texto: `${entDeficit} combinación${entDeficit === 1 ? "" : "es"} profesional–entregable con déficit de asignación (gasto real > horas asignadas).`,
      severidad: "atencion",
    });
  }
  const critProx = presionCartera.filter((p) => p.presion === "critica").length;
  const prox2s = presionCartera.filter((p) => diasHasta(p.fechaProxima, hoy) <= 14 && p.horasPendientes > 0).length;
  if (critProx > 0) {
    riesgos.push({
      id: "criticos",
      texto: `${critProx} entregable${critProx === 1 ? "" : "s"} con presión crítica en cartera próxima.`,
      severidad: "critico",
    });
  } else if (prox2s > 0) {
    riesgos.push({
      id: "prox2s",
      texto: `${prox2s} entregable${prox2s === 1 ? "" : "s"} con horas pendientes y fecha dentro de 2 semanas.`,
      severidad: "atencion",
    });
  }

  const horasPorProyecto = new Map<string, number>();
  for (const r of data.registro_horas) {
    if (r.tipo_hora !== "DIRECTA") continue;
    const f = (r.fecha ?? "").trim();
    if (!fechaEnRango(f, periodo.inicio, periodo.fin) || periodo.esFuturo) continue;
    if (fechaCorte && f > fechaCorte) continue;
    const pidProf = (r.profesional_id ?? "").trim();
    const prof = data.profesionales.find((p) => p.id === pidProf);
    if (!prof || !esProfesionalCargable(prof)) continue;
    const pid = (r.proyecto_id ?? "").trim();
    if (!pid) continue;
    horasPorProyecto.set(pid, (horasPorProyecto.get(pid) ?? 0) + Number(r.horas || 0));
  }
  let topProj = "";
  let topH = 0;
  for (const [id, h] of horasPorProyecto) {
    if (h > topH) {
      topH = h;
      topProj = id;
    }
  }
  if (topProj && topH > 0) {
    const pr = projMap.get(topProj);
    riesgos.push({
      id: "top-real",
      texto: `${pr?.nombre ?? topProj} concentra la mayor cantidad de horas directas reales en el periodo (${topH.toFixed(1)} h).`,
      severidad: "info",
    });
  }

  const topPresion = presionCartera[0];
  if (topPresion && topPresion.horasPendientes > 0) {
    riesgos.push({
      id: "top-presion",
      texto: `${topPresion.proyectoNombre} · ${topPresion.entregableNombre}: mayor presión de cartera (${topPresion.horasPendientes.toFixed(1)} h pendientes).`,
      severidad: topPresion.presion === "critica" || topPresion.presion === "alta" ? "atencion" : "info",
    });
  }

  if (usaDirectasDashboardMes && mesAnioCal && !periodo.esFuturo) {
    sumDirectas = directasRealesMesCalendarioDashboard(
      data.registro_horas,
      mesAnioCal.anio,
      mesAnioCal.mes1a12,
      { idsProfesionales: idsCargables },
    );
  }

  return {
    periodo,
    fechas,
    hoy,
    fechaCorte,
    ultimaCargaRegistrada,
    sinCargaEnPeriodo,
    porcentajeObjetivo: ratioObjetivo,
    directasReglaDashboardMensual: usaDirectasDashboardMes,
    subtituloHorasDirectasKpi,
    presionCarteraKpiSubtitulo: PRESION_CARTERA_KPI_SUBTITULO,
    kpis: {
      capacidadObjetivoEquipo: sumObjetivo,
      horasDirectasReales: sumDirectas,
      cargabilidadRealEquipo: cargabilidadEquipo,
      horasIndirectas: sumIndirectas,
      horasVacaciones: sumVacaciones,
      profesionalesSobreObjetivoDirecto: nSobreObjetivo,
      profesionalesBajaCargabilidad: nBaja,
      cumplimientoObjetivoDirectoEquipo: cumplimientoObjetivoEquipo,
      presionCarteraRatio,
      horasPendientesProximas,
      capacidadDisponibleProximas,
    },
    filasProfesionales,
    presionCartera,
    riesgos,
    distribucionComposicion,
  };
}

export function labelEstadoComposicion(e: EstadoComposicionCarga): string {
  switch (e) {
    case "baja":
      return "Baja cargabilidad";
    case "normal":
      return "Normal";
    case "alta":
      return "Alta cargabilidad";
    case "muy_alta":
      return "Muy alta directa";
  }
}

export function colorEstadoComposicion(e: EstadoComposicionCarga): { bg: string; text: string; border: string } {
  switch (e) {
    case "baja":
      return { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1" };
    case "normal":
      return { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" };
    case "alta":
      return { bg: "#FFF7ED", text: "#B45309", border: "#FED7AA" };
    case "muy_alta":
      return { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" };
  }
}

export function labelCumplimientoObjetivo(e: EtiquetaCumplimientoObjetivo): string {
  switch (e) {
    case "bajo_objetivo":
      return "Bajo objetivo";
    case "en_objetivo":
      return "En objetivo";
    case "sobre_objetivo":
      return "Sobre objetivo";
  }
}

export function colorCumplimientoObjetivo(e: EtiquetaCumplimientoObjetivo): { bg: string; text: string; border: string } {
  switch (e) {
    case "bajo_objetivo":
      return { bg: "#F8FAFC", text: "#64748B", border: "#E2E8F0" };
    case "en_objetivo":
      return { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" };
    case "sobre_objetivo":
      return { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE" };
  }
}

export function labelPresion(p: PresionCarteraNivel): string {
  const m: Record<PresionCarteraNivel, string> = {
    baja: "Baja",
    media: "Media",
    alta: "Alta",
    critica: "Crítica",
  };
  return m[p];
}
