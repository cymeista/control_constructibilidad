/**
 * Alertas visibles: siempre recalculadas desde AppData actual.
 * `alertas_revisadas` no define si una alerta está activa (solo marca revisión en otras vistas).
 */

import type {
  AsignacionHora,
  Entregable,
  EquipoEntregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import { buildConsumoMaps } from "@/entregables/asignacionHoraConsumo";
import { esRegistroConsumoRealValido } from "@/entregables/registroHoraConsumo";
import { listarProfesionalesGastoSinEquipoDeclarado } from "@/equipo/entregableEquipoGasto";
import { auditarSincronizacionLideresConEquipo, esProfesionalPorDefinir } from "@/equipo/syncEntregableLider";
import {
  entregableToFechasInput,
  validateEntregableFechas,
} from "@/entregables/entregableFechasValidation";
import {
  buildControlCategoriasEntregable,
  gastoRealPorCategoriaDesdeMapaProf,
  type CategoriaControlRow,
} from "@/horas/entregableControlCategoria";
export const TOLERANCIA_GASTO_VS_AVANCE_PUNTOS = 20;

function toPct(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 1) return Math.max(0, x * 100);
  return Math.max(0, x);
}

function horasPresupuestoEntregable(ent: Entregable): number {
  return Number(ent.hrs_l2) + Number(ent.hrs_p4) + Number(ent.hrs_p3) + Number(ent.hrs_p2);
}

export type TipoAlertaActiva =
  | "SOBRECONSUMO_HORAS"
  | "SOBRECONSUMO_CATEGORIA"
  | "GASTO_VS_AVANCE"
  | "GASTO_SIN_ASIGNACION"
  | "GASTO_SIN_EQUIPO"
  | "LIDER_INCONSISTENTE"
  | "SIN_LIDER_VALIDO"
  | "FECHAS_INVALIDAS"
  | "PROYECTO_NO_INICIADO_CON_ACTIVIDAD";

export type AlertaActiva = {
  tipo: TipoAlertaActiva;
  /** Clave estable por entregable/proyecto + tipo (+ detalle si aplica). */
  id: string;
  etiqueta: string;
  detalle?: string;
};

/** Dónde se muestran las alertas; Proyectos excluye tipos analíticos no accionables ahí. */
export type ContextoAlertasActivas = "PROYECTOS" | "ANALITICO" | "TODAS";

export type AlertasActivasAppSlice = {
  entregable: Entregable;
  proyecto: Proyecto;
  profesionales: Profesional[];
  registro_horas: RegistroHora[];
  asignaciones_horas: AsignacionHora[];
  equipo_entregable: EquipoEntregable[];
  entregables?: Entregable[];
  proyectos?: Proyecto[];
  /** Por defecto `TODAS` (sin filtrar). Proyectos usa `PROYECTOS`. */
  contexto?: ContextoAlertasActivas;
};

/** Tipos que no se muestran ni cuentan en la vista Proyectos. */
const TIPOS_EXCLUIDOS_CONTEXTO_PROYECTOS: ReadonlySet<TipoAlertaActiva> = new Set([
  "GASTO_VS_AVANCE",
  "SIN_LIDER_VALIDO",
]);

export function filtrarAlertasActivasPorContexto(
  alertas: AlertaActiva[],
  contexto: ContextoAlertasActivas = "TODAS",
): AlertaActiva[] {
  if (contexto !== "PROYECTOS") return alertas;
  return alertas.filter((a) => !TIPOS_EXCLUIDOS_CONTEXTO_PROYECTOS.has(a.tipo));
}

export function etiquetaCortaAlertaActiva(tipo: TipoAlertaActiva): string {
  switch (tipo) {
    case "SOBRECONSUMO_HORAS":
      return "Sobreconsumo horas";
    case "SOBRECONSUMO_CATEGORIA":
      return "Déficit por categoría";
    case "GASTO_VS_AVANCE":
      return `Gasto vs avance (+${TOLERANCIA_GASTO_VS_AVANCE_PUNTOS} pts)`;
    case "GASTO_SIN_ASIGNACION":
      return "Gasto sin asignación";
    case "GASTO_SIN_EQUIPO":
      return "Gasto sin equipo";
    case "LIDER_INCONSISTENTE":
      return "Líder inconsistente";
    case "SIN_LIDER_VALIDO":
      return "Sin líder válido";
    case "FECHAS_INVALIDAS":
      return "Fechas inválidas";
    case "PROYECTO_NO_INICIADO_CON_ACTIVIDAD":
      return "Proyecto no iniciado con actividad";
    default:
      return tipo;
  }
}

/** Profesional declarado operativamente en el entregable (LIDER o APOYO). */
export function profesionalDeclaradoEnEquipoEntregable(
  entregableId: string,
  profesionalId: string,
  equipo_entregable: EquipoEntregable[],
): boolean {
  const eid = entregableId.trim();
  const pid = profesionalId.trim();
  if (!eid || !pid) return false;
  return equipo_entregable.some(
    (eq) =>
      (eq.entregable_id ?? "").trim() === eid &&
      (eq.profesional_id ?? "").trim() === pid &&
      (eq.rol_en_entregable === "LIDER" || eq.rol_en_entregable === "APOYO"),
  );
}

/** Gasto real DIRECTA válido sin fila en equipo_entregable (alerta principal Proyectos). */
export function calcularAlertasGastoSinEquipoEntregable(input: AlertasActivasAppSlice): AlertaActiva[] {
  const { entregable: ent, proyecto: pr, profesionales, registro_horas, equipo_entregable } = input;
  const eid = (ent.id ?? "").trim();
  if (!eid) return [];

  const entregablesCtx = input.entregables ?? [ent];
  const proyectosCtx = input.proyectos ?? [pr];
  const gastoSinEquipo = listarProfesionalesGastoSinEquipoDeclarado(
    eid,
    equipo_entregable,
    profesionales,
    registro_horas,
    entregablesCtx,
    proyectosCtx,
  );

  return gastoSinEquipo
    .filter((g) => !profesionalDeclaradoEnEquipoEntregable(eid, g.profesional_id, equipo_entregable))
    .map((g) => ({
      tipo: "GASTO_SIN_EQUIPO" as const,
      id: `sin-equipo-${g.profesional_id}`,
      etiqueta: etiquetaCortaAlertaActiva("GASTO_SIN_EQUIPO"),
      detalle: `${g.nombre} (${g.horas_reales.toFixed(1)} h)`,
    }));
}

/**
 * Advertencia legacy por asignaciones_horas (no cuenta en contadores principales de Proyectos).
 * Solo aplica si el profesional ya está en equipo_entregable pero sin asignación legacy.
 */
export function calcularAdvertenciasLegacyAsignacionEntregable(input: AlertasActivasAppSlice): AlertaActiva[] {
  const {
    entregable: ent,
    proyecto: pr,
    profesionales,
    registro_horas,
    asignaciones_horas,
    equipo_entregable,
  } = input;
  const eid = (ent.id ?? "").trim();
  if (!eid) return [];

  const profMap = new Map(profesionales.map((p) => [p.id, p]));
  const entregablesCtx = input.entregables ?? [ent];
  const proyectosCtx = input.proyectos ?? [pr];
  const { entById, projById, profById } = buildConsumoMaps(entregablesCtx, proyectosCtx, profesionales);
  const registrosValidos = registro_horas.filter((r) =>
    esRegistroConsumoRealValido(r, entById, projById, profById),
  );

  const gastoProf = new Map<string, number>();
  for (const r of registrosValidos) {
    if ((r.entregable_id ?? "").trim() !== eid) continue;
    const pid = (r.profesional_id ?? "").trim();
    if (!pid) continue;
    gastoProf.set(pid, (gastoProf.get(pid) ?? 0) + Number(r.horas));
  }

  const asigsEnt = asignaciones_horas.filter((a) => a.entregable_id === eid);
  const out: AlertaActiva[] = [];

  for (const [pid, horasTrabajadas] of gastoProf) {
    if (horasTrabajadas <= 0) continue;
    if (!profesionalDeclaradoEnEquipoEntregable(eid, pid, equipo_entregable)) continue;
    const asigsProfEnt = asigsEnt.filter((a) => a.profesional_id === pid);
    if (asigsProfEnt.length > 0) continue;
    const nombre = profMap.get(pid)?.nombre_completo ?? pid;
    out.push({
      tipo: "GASTO_SIN_ASIGNACION",
      id: `legacy-sin-asig-${pid}`,
      etiqueta: "Sin asignación legacy",
      detalle: `${nombre}: en equipo pero sin fila en asignaciones_horas`,
    });
  }

  return out;
}

function alertasDeficitCategoria(control: CategoriaControlRow[]): AlertaActiva[] {
  const out: AlertaActiva[] = [];
  for (const row of control) {
    if (row.estado === "DEFICIT") {
      out.push({
        tipo: "SOBRECONSUMO_CATEGORIA",
        id: `deficit-${row.categoria}`,
        etiqueta: etiquetaCortaAlertaActiva("SOBRECONSUMO_CATEGORIA"),
        detalle: `${row.categoria}: gasto ${row.gastoReal.toFixed(1)} h > presupuesto ${row.presupuesto.toFixed(1)} h`,
      });
    } else if (row.estado === "SIN_PRESUPUESTO_CON_GASTO") {
      out.push({
        tipo: "SOBRECONSUMO_CATEGORIA",
        id: `sin-pres-${row.categoria}`,
        etiqueta: etiquetaCortaAlertaActiva("SOBRECONSUMO_CATEGORIA"),
        detalle: `${row.categoria}: gasto ${row.gastoReal.toFixed(1)} h sin presupuesto`,
      });
    }
  }
  return out;
}

/** Condiciones vigentes sobre un entregable (fuente de verdad para contadores en Proyectos). */
export function calcularAlertasActivasEntregable(input: AlertasActivasAppSlice): AlertaActiva[] {
  const { entregable: ent, proyecto: pr, profesionales, registro_horas, equipo_entregable } = input;

  const eid = (ent.id ?? "").trim();
  if (!eid) return [];

  const profMap = new Map(profesionales.map((p) => [p.id, p]));
  const horasPresupuesto = horasPresupuestoEntregable(ent);
  const entregablesCtx = input.entregables ?? [ent];
  const proyectosCtx = input.proyectos ?? [pr];
  const { entById, projById, profById } = buildConsumoMaps(entregablesCtx, proyectosCtx, profesionales);
  const registrosValidos = registro_horas.filter((r) =>
    esRegistroConsumoRealValido(r, entById, projById, profById),
  );

  const gastoProf = new Map<string, number>();
  for (const r of registrosValidos) {
    if ((r.entregable_id ?? "").trim() !== eid) continue;
    const pid = (r.profesional_id ?? "").trim();
    if (!pid) continue;
    gastoProf.set(pid, (gastoProf.get(pid) ?? 0) + Number(r.horas));
  }

  const horasGastadas = [...gastoProf.values()].reduce((s, h) => s + h, 0);
  const pctConsumoHoras = horasPresupuesto > 0 ? (horasGastadas / horasPresupuesto) * 100 : null;
  const avanceRealPct = toPct(Number(ent.avance_real));

  const alertas: AlertaActiva[] = [];

  if (horasPresupuesto > 0 && horasGastadas > horasPresupuesto) {
    alertas.push({
      tipo: "SOBRECONSUMO_HORAS",
      id: "sobreconsumo-total",
      etiqueta: etiquetaCortaAlertaActiva("SOBRECONSUMO_HORAS"),
      detalle: `Gasto ${horasGastadas.toFixed(1)} h > presupuesto ${horasPresupuesto.toFixed(1)} h`,
    });
  }

  const gastoCategoria = gastoRealPorCategoriaDesdeMapaProf(gastoProf, profMap);
  const controlCategorias = buildControlCategoriasEntregable(ent, gastoCategoria);
  alertas.push(...alertasDeficitCategoria(controlCategorias));

  if (pctConsumoHoras != null && pctConsumoHoras > avanceRealPct + TOLERANCIA_GASTO_VS_AVANCE_PUNTOS) {
    alertas.push({
      tipo: "GASTO_VS_AVANCE",
      id: "gasto-vs-avance",
      etiqueta: etiquetaCortaAlertaActiva("GASTO_VS_AVANCE"),
      detalle: `Consumo ${pctConsumoHoras.toFixed(1)}% vs avance real ${avanceRealPct.toFixed(1)}%`,
    });
  }

  alertas.push(...calcularAlertasGastoSinEquipoEntregable(input));

  const lid = (ent.lider_id ?? "").trim();
  if (!lid) {
    alertas.push({
      tipo: "SIN_LIDER_VALIDO",
      id: "sin-lider",
      etiqueta: etiquetaCortaAlertaActiva("SIN_LIDER_VALIDO"),
    });
  } else {
    const liderProf = profMap.get(lid);
    if (esProfesionalPorDefinir(liderProf)) {
      alertas.push({
        tipo: "SIN_LIDER_VALIDO",
        id: "lider-por-definir",
        etiqueta: etiquetaCortaAlertaActiva("SIN_LIDER_VALIDO"),
        detalle: "Líder «Por definir»",
      });
    }
  }

  for (const item of auditarSincronizacionLideresConEquipo([ent], equipo_entregable, profesionales)) {
    alertas.push({
      tipo: "LIDER_INCONSISTENTE",
      id: `lider-inc-${item.motivo.slice(0, 24)}`,
      etiqueta: etiquetaCortaAlertaActiva("LIDER_INCONSISTENTE"),
      detalle: item.motivo,
    });
  }

  const fechasVal = validateEntregableFechas(entregableToFechasInput(ent));
  if (!fechasVal.ok) {
    alertas.push({
      tipo: "FECHAS_INVALIDAS",
      id: "fechas-invalidas",
      etiqueta: etiquetaCortaAlertaActiva("FECHAS_INVALIDAS"),
      detalle: fechasVal.message,
    });
  }

  return filtrarAlertasActivasPorContexto(alertas, input.contexto ?? "TODAS");
}

export function entregableTieneAlertasActivas(alertas: AlertaActiva[]): boolean {
  return alertas.length > 0;
}

export function contarAlertasActivasEntregable(alertas: AlertaActiva[]): number {
  return alertas.length;
}

/** Alertas a nivel proyecto (no asociadas a un solo entregable). */
export function calcularAlertasActivasProyecto(proyecto: Proyecto, tieneActividadReal: boolean): AlertaActiva[] {
  if (proyecto.estado !== "NO_INICIADO") return [];
  if (!tieneActividadReal) return [];
  return [
    {
      tipo: "PROYECTO_NO_INICIADO_CON_ACTIVIDAD",
      id: "proyecto-no-iniciado-actividad",
      etiqueta: etiquetaCortaAlertaActiva("PROYECTO_NO_INICIADO_CON_ACTIVIDAD"),
      detalle: "Hay actividad registrada en entregables del proyecto",
    },
  ];
}

/** Deriva flags legacy usados en badges existentes (solo lectura UI). */
export function derivarFlagsAlertaLegacy(alertas: AlertaActiva[]): {
  alertaSobreconsumoHoras: boolean;
  alertaGastoVsAvance: boolean;
  alertaSinAsignacion: boolean;
} {
  const tipos = new Set(alertas.map((a) => a.tipo));
  return {
    alertaSobreconsumoHoras: tipos.has("SOBRECONSUMO_HORAS") || tipos.has("SOBRECONSUMO_CATEGORIA"),
    alertaGastoVsAvance: tipos.has("GASTO_VS_AVANCE"),
    alertaSinAsignacion: tipos.has("GASTO_SIN_EQUIPO"),
  };
}

/** Estilo de badge por tipo (Proyectos). */
export function claseBadgeAlertaActiva(tipo: TipoAlertaActiva): string {
  switch (tipo) {
    case "SOBRECONSUMO_HORAS":
    case "SOBRECONSUMO_CATEGORIA":
      return "rounded-r6 border border-rose-300 bg-rose-50 px-2 py-1 font-semibold text-rose-800";
    case "GASTO_VS_AVANCE":
      return "rounded-r6 border border-amber-300 bg-amber-50 px-2 py-1 font-semibold text-amber-800";
    case "GASTO_SIN_ASIGNACION":
    case "GASTO_SIN_EQUIPO":
      return "rounded-r6 border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-800";
    case "LIDER_INCONSISTENTE":
    case "SIN_LIDER_VALIDO":
      return "rounded-r6 border border-violet-300 bg-violet-50 px-2 py-1 font-semibold text-violet-900";
    case "FECHAS_INVALIDAS":
      return "rounded-r6 border border-orange-300 bg-orange-50 px-2 py-1 font-semibold text-orange-900";
    case "PROYECTO_NO_INICIADO_CON_ACTIVIDAD":
      return "rounded-r6 border border-amber-400 bg-amber-100 px-2 py-1 font-semibold text-amber-950";
    default:
      return "rounded-r6 border border-bdr bg-surface2 px-2 py-1 font-semibold text-t800";
  }
}
