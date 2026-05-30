import type { ReactNode } from "react";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { loadAppData, saveAppData } from "@/persistence/dataRepository";
import {
  aplicarMigracionEquipoEntregableDesdePreview,
  type ResumenAplicacionMigracionEquipo,
} from "@/equipo/aplicarMigracionEquipoEntregable";
import { computePreviewMigracionEquipoEntregable } from "@/equipo/previewMigracionEquipoEntregable";
import { aplicarReglaUnicoLider } from "@/equipo/equipoEntregableRules";
import { recomputarConsumoEnEntregables } from "@/entregables/registroHoraConsumo";
import {
  hydrateMonedaProyectoFromPersisted,
  hydrateTarifasContractualesFromPersisted,
  type MonedaOriginalProyecto,
} from "@/proyectos/proyectoMoneda";
import {
  desgloseCupoCategoriaEntregable,
  disponibleCategoriaParaAsignaciones,
  validateNuevaAsignacionHora,
  validateNuevaAsignacionHistoricaCerrada,
  validateUpdateHorasAsignacionActiva,
  validateCierreAsignacionActiva,
} from "@/entregables/asignacionHoraRules";
import type { AppRole } from "@/security/localUsers";
import {
  fechaHoyIsoLocal,
  horasDevueltasPresupuestoAlCierre,
  resolverImputacionIncrementalAlCierre,
  sumaHorasGastadasRealesEnVentana,
  sumaHorasImputadasCierrePreviasProfEntregableCategoria,
} from "@/entregables/asignacionHoraConsumo";
import type { HistorialRedistribucionHoras, HorasPorCategoria } from "@/entregables/redistribucionHorasEntregable";
import {
  construirHistorialRedistribucion,
  construirLineasRedistribucion,
  horasEntregableARecord,
  tarifasDesdeProyecto,
  validarRedistribucionHoras,
} from "@/entregables/redistribucionHorasEntregable";
import type { CurvaObjetivoAnual, CurvaObjetivoMes } from "@/entregables/curvaObjetivoAnualTypes";
import { crearMesesInicialesCurva, refrescarFechasYObjetivos } from "@/entregables/curvaObjetivoAnual";
import { computePipelineMontoUf, guessPipelineClienteIdFromLegacy } from "@/components/formularios/schemas";
import { analizarBloqueoEliminacionProyectos } from "@/proyectos/proyectoEliminacionRegla";
import type {
  AlertaRevisada,
  EstadoAlertaRevisada,
  TipoAlertaOperativa,
} from "@/alertas/alertasOperativasRevisadas";
import { normalizeAlertasRevisadasCarga } from "@/alertas/alertasOperativasRevisadas";

/* ─────────────── Types ─────────────── */

export interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  color: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profesional {
  id: string;
  codigo: string;
  nombre_completo: string;
  cargo: "L2" | "P2" | "P3" | "P4";
  email: string;
  fecha_ingreso: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PmInterno {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente_id: string;
  /** FK lógica hacia base independiente de PM internos. Vacío cuando no existe asignación. */
  pm_interno_id: string;
  /** Legado: antes FK a profesionales; ya no se usa en el formulario de proyectos. Se normaliza a "" al cargar. */
  project_manager_id: string;
  /** PM propio del proyecto (cliente interno), sin relación con la tabla de Profesionales. */
  pm_nombre: string;
  tarifa_l2: number;
  tarifa_p4: number;
  tarifa_p3: number;
  tarifa_p2: number;
  estado: "ACTIVO" | "COMPLETADO" | "NO_INICIADO" | "SUSPENDIDO";
  fecha_inicio: string;
  fecha_termino: string;
  /** Totales de negocio; hoy pueden venir de datos previos; en el futuro se recalcularán desde entregables. */
  uf_presupuestadas: number;
  hrs_presupuestadas: number;
  /** Moneda comercial del presupuesto (trazabilidad); cálculos internos siguen en UF. */
  moneda_original: MonedaOriginalProyecto;
  /** Monto en moneda_original (≥ 0). */
  monto_original: number;
  /** CLP por 1 UF (ingreso manual). */
  valor_uf_conversion: number;
  /** CLP por 1 USD; solo aplica si moneda_original = USD. */
  tipo_cambio_usd: number;
  /** Equivalente UF derivado de moneda_original y tasas (coherente con fórmulas acordadas). */
  monto_uf_calculado: number;
  /** Tarifas comerciales en moneda_original (trazabilidad). */
  tarifa_l2_original: number;
  tarifa_p4_original: number;
  tarifa_p3_original: number;
  tarifa_p2_original: number;
  created_at: string;
  updated_at: string;
}

export interface Entregable {
  id: string;
  proyecto_id: string;
  fase_codigo?: string;
  tarea_codigo?: string;
  nombre: string;
  lider_id: string;
  revisor_id?: string;
  tipo_flujo?: "CON_REVISIONES" | "SIN_REVISIONES";
  estado:
    | "NO_INICIADO"
    | "EN_PLAZO"
    | "ADELANTADO"
    | "RIESGO"
    | "CRITICO"
    | "COMPLETADO"
    | "Completado"
    | "No Iniciado"
    | "Atraso Crítico: Rev.A"
    | "Atraso Crítico: Rev.B"
    | "Atraso Crítico: Rev.P"
    | "Riesgo: Rev.A"
    | "Riesgo: Rev.B"
    | "Riesgo: Rev.P"
    | "Adelantado"
    | "En Plazo"
    | "Leve Retraso"
    | "Retrasado"
    | "Riesgo: Entrega Final"
    | "Atraso Crítico: Entrega Final";
  avance_real: number;
  avance_teorico: number;
  fecha_inicio: string;
  fecha_termino: string;
  fecha_revA: string | null;
  fecha_revB: string | null;
  fecha_revP: string | null;
  uf_presupuestadas: number;
  uf_consumidas: number;
  hrs_presupuestadas: number;
  /** Bloque 0 asignaciones: presupuesto oficial por categoría (cupos); fuente para control futuro. */
  hrs_l2: number;
  hrs_p4: number;
  hrs_p3: number;
  hrs_p2: number;
  /**
   * true solo tras guardar el entregable con desglose explícito (formulario).
   * false: JSON antiguo o seed con reparto automático — no habilita asignaciones hasta confirmar en el formulario.
   */
  presupuesto_categoria_definido: boolean;
  hrs_gastadas: number;
  /** Nota única de seguimiento operativo (dashboard); persiste con el entregable. */
  nota_seguimiento?: string;
  nota_seguimiento_updated_at?: string | null;
  /** Fecha (YYYY-MM-DD) en que se marcó como completado/100%. */
  fecha_completado?: string | null;
  created_at: string;
  updated_at: string;
}

function nneg(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Reparte hrs_presupuestadas en cuatro categorías cuando no hay valores explícitos en datos viejos. */
function spreadHrsPresupuestadasPorCategoria(total: number): Pick<Entregable, "hrs_l2" | "hrs_p4" | "hrs_p3" | "hrs_p2"> {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const q = Math.floor(t / 4);
  const r = t % 4;
  return {
    hrs_l2: q + (r > 0 ? 1 : 0),
    hrs_p4: q + (r > 1 ? 1 : 0),
    hrs_p3: q + (r > 2 ? 1 : 0),
    hrs_p2: q,
  };
}

function normalizeEntregableRow(e: Entregable, proyectos: Proyecto[]): Entregable {
  const proyectoIdRaw = (e.proyecto_id ?? "").trim();
  const proyectoMatch = proyectos.find((p) => p.id === proyectoIdRaw || p.codigo === proyectoIdRaw);
  const hasExplicitCategoria =
    e.hrs_l2 !== undefined || e.hrs_p4 !== undefined || e.hrs_p3 !== undefined || e.hrs_p2 !== undefined;
  const cat = hasExplicitCategoria
    ? {
        hrs_l2: nneg(e.hrs_l2),
        hrs_p4: nneg(e.hrs_p4),
        hrs_p3: nneg(e.hrs_p3),
        hrs_p2: nneg(e.hrs_p2),
      }
    : spreadHrsPresupuestadasPorCategoria(e.hrs_presupuestadas);
  return {
    ...e,
    proyecto_id: proyectoMatch?.id ?? proyectoIdRaw,
    fase_codigo: (e.fase_codigo ?? "").trim(),
    tarea_codigo: (e.tarea_codigo ?? "").trim(),
    revisor_id: (e.revisor_id ?? "").trim(),
    tipo_flujo: e.tipo_flujo === "SIN_REVISIONES" ? "SIN_REVISIONES" : "CON_REVISIONES",
    ...cat,
    presupuesto_categoria_definido: e.presupuesto_categoria_definido === true,
    nota_seguimiento: typeof e.nota_seguimiento === "string" ? e.nota_seguimiento : "",
    nota_seguimiento_updated_at: e.nota_seguimiento_updated_at != null ? String(e.nota_seguimiento_updated_at) : null,
    fecha_completado: e.fecha_completado != null && String(e.fecha_completado).trim() !== ""
      ? String(e.fecha_completado).trim()
      : null,
  };
}

export type AsignacionHoraCategoria = "L2" | "P4" | "P3" | "P2";
export type AsignacionHoraEstado = "ACTIVA" | "CERRADA";
export type AsignacionHoraRol = "LIDER" | "APOYO";

/** Participación en entregable (equipo); separado de asignaciones_horas. */
export type EquipoEntregableOrigen =
  | "migracion_asignacion_activa"
  | "migracion_asignacion_cerrada"
  | "lider_id_entregable"
  | "manual";

export interface EquipoEntregable {
  id: string;
  entregable_id: string;
  profesional_id: string;
  rol_en_entregable: AsignacionHoraRol;
  origen?: EquipoEntregableOrigen;
  created_at: string;
  updated_at: string;
}

export interface AsignacionHora {
  id: string;
  entregable_id: string;
  proyecto_id: string;
  profesional_id: string;
  rol_en_entregable: AsignacionHoraRol;
  categoria: AsignacionHoraCategoria;
  horas_comprometidas: number;
  estado: AsignacionHoraEstado;
  fecha_inicio_vigencia: string;
  fecha_cierre: string | null;
  motivo_cierre: string | null;
  horas_gastadas_imputadas_al_cierre: number | null;
  horas_devueltas_presupuesto: number | null;
  /** Creación confirmada por ADMIN por encima del cupo de categoría; no modifica hrs_* del entregable. */
  es_sobrecupo?: boolean;
  comentario_sobrecupo?: string | null;
  fecha_autorizacion_sobrecupo?: string | null;
  created_at: string;
  updated_at: string;
}

/** Confirmación persistida al crear una asignación ACTIVA sobre cupo (solo ADMIN). */
export type AsignacionHoraSobrecupoConfirmacion = {
  rolAutor: AppRole;
  comentario: string;
  codigoConfirmacion: string;
  fechaAutorizacion: string;
};

const CATEGORIAS_ASIGNACION: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];

function normalizeAsignacionHoraRow(a: AsignacionHora, entregables: Entregable[]): AsignacionHora {
  const ent = entregables.find((e) => e.id === a.entregable_id);
  const proyecto_id = (ent?.proyecto_id ?? a.proyecto_id ?? "").trim();
  const cat = CATEGORIAS_ASIGNACION.includes(a.categoria) ? a.categoria : "P4";
  const rol: AsignacionHoraRol = a.rol_en_entregable === "LIDER" ? "LIDER" : "APOYO";
  const estado: AsignacionHoraEstado = a.estado === "CERRADA" ? "CERRADA" : "ACTIVA";
  return {
    ...a,
    proyecto_id,
    profesional_id: (a.profesional_id ?? "").trim(),
    entregable_id: (a.entregable_id ?? "").trim(),
    rol_en_entregable: rol,
    categoria: cat,
    horas_comprometidas: nneg(a.horas_comprometidas),
    estado,
    fecha_inicio_vigencia: (a.fecha_inicio_vigencia ?? "").trim(),
    fecha_cierre: a.fecha_cierre != null && String(a.fecha_cierre).trim() !== "" ? String(a.fecha_cierre).trim() : null,
    motivo_cierre: a.motivo_cierre != null && String(a.motivo_cierre).trim() !== "" ? String(a.motivo_cierre).trim() : null,
    horas_gastadas_imputadas_al_cierre:
      a.horas_gastadas_imputadas_al_cierre != null && Number.isFinite(Number(a.horas_gastadas_imputadas_al_cierre))
        ? nneg(a.horas_gastadas_imputadas_al_cierre)
        : null,
    horas_devueltas_presupuesto:
      a.horas_devueltas_presupuesto != null && Number.isFinite(Number(a.horas_devueltas_presupuesto))
        ? nneg(a.horas_devueltas_presupuesto)
        : null,
    es_sobrecupo: Boolean(a.es_sobrecupo),
    comentario_sobrecupo:
      a.comentario_sobrecupo != null && String(a.comentario_sobrecupo).trim() !== ""
        ? String(a.comentario_sobrecupo).trim()
        : null,
    fecha_autorizacion_sobrecupo:
      a.fecha_autorizacion_sobrecupo != null && String(a.fecha_autorizacion_sobrecupo).trim() !== ""
        ? String(a.fecha_autorizacion_sobrecupo).trim()
        : null,
  };
}

export interface RegistroHora {
  id: string;
  profesional_id: string;
  proyecto_id: string | null;
  entregable_id: string | null;
  tipo_hora: "DIRECTA" | "INDIRECTA" | "VACACIONES";
  fecha: string;
  horas: number;
  descripcion: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pipeline {
  id: string;
  /** Texto legado / desnormalizado para búsquedas y compatibilidad. Preferir `cliente_id`. */
  cliente: string;
  /** FK lógica hacia `Clientes.id`. Vacío en datos antiguos sin migración. */
  cliente_id: string;
  nombre_proyecto: string;
  etapa: "CONCEPTUAL" | "FACTIBILIDAD" | "DETALLE";
  entregable: string;
  /** Id de `PmInterno` (PM interno / catálogo Project Managers). */
  pm_responsable_id: string;
  fecha_propuesta: string;
  monto_uf: number;
  estado: "EN_ESPERA" | "EN_COTIZACION" | "APROBADO" | "RECHAZADO";
  hrs_L2: number;
  hrs_P4: number;
  hrs_P3: number;
  hrs_P2: number;
  tarifa_l2: number;
  tarifa_p4: number;
  tarifa_p3: number;
  tarifa_p2: number;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export interface CargaMensual {
  id: string;
  mes_iso: string;
  profesional_id: string | null;
  hrs_directas: number;
  hrs_indirectas: number;
  hrs_vacaciones: number;
  hrs_objetivo: number;
  created_at: string;
  updated_at: string;
}

export type { CurvaObjetivoAnual, CurvaObjetivoMes } from "@/entregables/curvaObjetivoAnualTypes";

/** Evaluaciones de desempeño por profesional (vista Profesionales); independiente de RegistroHora y asignaciones. */
export interface ObjetivoDesempenoProfesional {
  id: string;
  objetivo: string;
  evaluacion: string;
  estado: string | null;
}

export interface EvaluacionDesempenoProfesional {
  id: string;
  profesional_id: string;
  fecha: string;
  updated_at: string;
  objetivos: ObjetivoDesempenoProfesional[];
  comentario_general: string | null;
}

interface AppData {
  clientes: Cliente[];
  profesionales: Profesional[];
  pm_internos: PmInterno[];
  proyectos: Proyecto[];
  entregables: Entregable[];
  /** Bloque 0 módulo asignaciones: histórico y vigencias; sin lógica de negocio aún en UI. */
  asignaciones_horas: AsignacionHora[];
  /** Equipo del entregable (líder/apoyo); sin horas comprometidas ni vigencias. */
  equipo_entregable: EquipoEntregable[];
  registro_horas: RegistroHora[];
  pipeline: Pipeline[];
  carga_mensual: CargaMensual[];
  /** Bloque 1: curva objetivo anual al 100% (equipo); sin RegistroHora ni cargabilidad. */
  curvas_objetivo_anual: CurvaObjetivoAnual[];
  /** Redistribución de hrs_l2/p4/p3/p2 por entregable; no modifica asignaciones ni registros. */
  historial_redistribuciones_horas: HistorialRedistribucionHoras[];
  /** Una fila vigente por profesional_id (upsert). */
  evaluaciones_desempeno_profesional: EvaluacionDesempenoProfesional[];
  /** Alertas operativas marcadas como revisadas/archivadas (solo capa de vista; no altera cálculos). */
  alertas_revisadas: AlertaRevisada[];
}

interface AppDataContextValue extends AppData {
  addCliente: (c: Omit<Cliente, "id" | "created_at" | "updated_at">) => void;
  updateCliente: (id: string, c: Partial<Cliente>) => void;
  deleteCliente: (id: string) => void;
  addProfesional: (p: Omit<Profesional, "id" | "created_at" | "updated_at">) => void;
  updateProfesional: (id: string, p: Partial<Profesional>) => void;
  deleteProfesional: (id: string) => void;
  addPmInterno: (p: Omit<PmInterno, "id" | "created_at" | "updated_at">) => void;
  updatePmInterno: (id: string, p: Partial<PmInterno>) => void;
  deletePmInterno: (id: string) => void;
  addProyecto: (p: Omit<Proyecto, "id" | "created_at" | "updated_at">) => void;
  updateProyecto: (id: string, p: Partial<Proyecto>) => void;
  deleteProyecto: (id: string) => void;
  /**
   * Eliminación en cascada de proyectos sin gasto en RegistroHora.
   * No modifica registro_horas ni clientes/profesionales. Si hay registros asociados, no hace cambios.
   */
  deleteProyectosCascade: (ids: string[]) => void;
  addEntregable: (
    e: Omit<Entregable, "id" | "created_at" | "updated_at" | "presupuesto_categoria_definido">,
  ) => void;
  updateEntregable: (id: string, e: Partial<Entregable>) => void;
  deleteEntregable: (id: string) => void;
  addRegistroHora: (r: Omit<RegistroHora, "id" | "created_at" | "updated_at">) => void;
  /** Misma lógica que addRegistroHora pero un solo recomputo de consumo al final del lote. */
  addRegistroHorasBatch: (items: Omit<RegistroHora, "id" | "created_at" | "updated_at">[]) => void;
  updateRegistroHora: (id: string, r: Partial<RegistroHora>) => void;
  deleteRegistroHora: (id: string) => void;
  addAsignacionHora: (
    a: Omit<AsignacionHora, "id" | "created_at" | "updated_at">,
    sobrecupoConfirmacion?: AsignacionHoraSobrecupoConfirmacion | null,
  ) => { ok: true } | { ok: false; error: string };
  /** Normalización histórica (fase 1): asignación CERRADA sin tocar RegistroHora ni cupo ACTIVO. */
  addAsignacionHoraHistoricaCerrada: (a: {
    entregable_id: string;
    proyecto_id: string;
    profesional_id: string;
    rol_en_entregable: AsignacionHora["rol_en_entregable"];
    categoria: AsignacionHora["categoria"];
    horas_comprometidas: number;
    fecha_inicio_vigencia: string;
    fecha_cierre: string;
    motivo_cierre?: string | null;
  }) => { ok: true } | { ok: false; error: string };
  updateAsignacionHora: (
    id: string,
    a: Partial<AsignacionHora>,
  ) => { ok: true } | { ok: false; error: string };
  /** Bloque 3: cierra ACTIVA; imputación incremental al presupuesto histórico (sin modificar RegistroHora). */
  cerrarAsignacionHora: (
    id: string,
    input: { fecha_cierre: string; motivo_cierre?: string | null },
  ) => { ok: true } | { ok: false; error: string };
  /**
   * Reparación histórica controlada: solo filas CERRADAS; actualiza imputación al cierre y devoluciones.
   * No modifica RegistroHora ni entregables.
   */
  repararImputacionesCierreAsignaciones: (
    items: { id: string; horas_gastadas_imputadas_al_cierre: number }[],
  ) => { ok: true } | { ok: false; error: string };
  deleteAsignacionHora: (id: string) => void;
  /**
   * Migra equipo propuesto (asignaciones ACTIVAS/CERRADAS como rol + lider_id) a `equipo_entregable`.
   * No modifica asignaciones_horas ni incluye sugeridos por gasto real.
   */
  aplicarMigracionEquipoEntregable: () => ResumenAplicacionMigracionEquipo;
  agregarIntegranteEquipoEntregable: (input: {
    entregable_id: string;
    profesional_id: string;
    rol_en_entregable: AsignacionHoraRol;
  }) => { ok: true; liderAnteriorPasadoApoyo: boolean } | { ok: false; error: string };
  cambiarRolIntegranteEquipoEntregable: (
    equipoId: string,
    rol_en_entregable: AsignacionHoraRol,
  ) => { ok: true; liderAnteriorPasadoApoyo: boolean } | { ok: false; error: string };
  quitarIntegranteEquipoEntregable: (equipoId: string) => void;
  addPipeline: (p: Omit<Pipeline, "id" | "created_at" | "updated_at">) => void;
  updatePipeline: (id: string, p: Partial<Pipeline>) => void;
  deletePipeline: (id: string) => void;
  addCargaMensual: (c: Omit<CargaMensual, "id" | "created_at" | "updated_at">) => void;
  updateCargaMensual: (id: string, c: Partial<CargaMensual>) => void;
  deleteCargaMensual: (id: string) => void;
  addCurvaObjetivoAnual: (input: {
    anio: number;
    nombre: string;
    descripcion: string;
    horas_maximas_mensuales_por_profesional: number;
    profesionales_base: number;
  }) => { ok: true } | { ok: false; error: string };
  updateCurvaObjetivoAnual: (
    id: string,
    patch: Partial<{
      nombre: string;
      descripcion: string;
      horas_maximas_mensuales_por_profesional: number;
      meses: CurvaObjetivoMes[];
    }>,
  ) => void;
  deleteCurvaObjetivoAnual: (id: string) => void;
  /** Aplica nuevas horas por categoría con validación dura y registro de historial. */
  ejecutarRedistribucionHorasEntregable: (input: {
    entregableId: string;
    horasNuevas: HorasPorCategoria;
    comentario: string;
  }) => { ok: true } | { ok: false; errors: string[] };
  upsertEvaluacionDesempenoProfesional: (
    profesionalId: string,
    input: {
      objetivos: { id?: string; objetivo: string; evaluacion: string; estado?: string | null }[];
      comentario_general?: string | null;
    },
  ) => void;
  /** Registra revisión de una alerta operativa por `clave_alerta` estable (upsert). */
  marcarAlertaRevisada: (payload: {
    tipo_alerta: TipoAlertaOperativa;
    clave_alerta: string;
    proyecto_id: string;
    entregable_id: string;
    profesional_id: string | null;
    categoria: AsignacionHoraCategoria | null;
    motivo_revision: string;
    comentario: string;
    estado: EstadoAlertaRevisada;
    revisado_por: string;
  }) => void;
}

/* ─────────────── Mock Data ─────────────── */

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);

const seedClientes: Cliente[] = [
  { id: "c1", codigo: "COD", nombre: "Codelco", color: "#B91C1C", activo: true, created_at: now(), updated_at: now() },
  { id: "c2", codigo: "AMSA", nombre: "AMSA Minera Los Pelambres", color: "#047857", activo: true, created_at: now(), updated_at: now() },
  { id: "c3", codigo: "GLEN", nombre: "Glencore", color: "#4F46E5", activo: true, created_at: now(), updated_at: now() },
  { id: "c4", codigo: "TECK", nombre: "Teck", color: "#B45309", activo: true, created_at: now(), updated_at: now() },
  { id: "c5", codigo: "ANGLO", nombre: "Anglo American", color: "#3730A3", activo: true, created_at: now(), updated_at: now() },
  { id: "c6", codigo: "COLL", nombre: "Collahuasi", color: "#6B7280", activo: true, created_at: now(), updated_at: now() },
  { id: "c7", codigo: "EXT", nombre: "Servicios Externos", color: "#9CA3AF", activo: true, created_at: now(), updated_at: now() },
];

const seedProfesionales: Profesional[] = [
  { id: "p1", codigo: "CL1032946", nombre_completo: "Felipe González", cargo: "P4", email: "f.gonzalez@valtica.cl", fecha_ingreso: "2022-03-15", activo: true, created_at: now(), updated_at: now() },
  { id: "p2", codigo: "CL1032947", nombre_completo: "María Silva", cargo: "P3", email: "m.silva@valtica.cl", fecha_ingreso: "2023-01-10", activo: true, created_at: now(), updated_at: now() },
  { id: "p3", codigo: "CL1032948", nombre_completo: "Carlos Rivera", cargo: "P2", email: "c.rivera@valtica.cl", fecha_ingreso: "2023-06-01", activo: true, created_at: now(), updated_at: now() },
  { id: "p4", codigo: "CL1032949", nombre_completo: "Ana Martínez", cargo: "L2", email: "a.martinez@valtica.cl", fecha_ingreso: "2021-08-20", activo: true, created_at: now(), updated_at: now() },
  { id: "p5", codigo: "CL1032950", nombre_completo: "Diego López", cargo: "P4", email: "d.lopez@valtica.cl", fecha_ingreso: "2022-11-05", activo: true, created_at: now(), updated_at: now() },
  { id: "p6", codigo: "CL1032951", nombre_completo: "Valentina Soto", cargo: "P3", email: "v.soto@valtica.cl", fecha_ingreso: "2024-02-14", activo: true, created_at: now(), updated_at: now() },
];

const seedPmInternos: PmInterno[] = [
  {
    id: "pmi1",
    codigo: "PMI001",
    nombre: "Felipe González",
    activo: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "pmi2",
    codigo: "PMI002",
    nombre: "María Silva",
    activo: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "pmi3",
    codigo: "PMI003",
    nombre: "Diego López",
    activo: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "pmi4",
    codigo: "PMI004",
    nombre: "Ana Martínez",
    activo: true,
    created_at: now(),
    updated_at: now(),
  },
];

/** Solo para migrar JSON antiguo que aún tenía project_manager_id hacia pm_nombre. */
const LEGACY_PROJECT_PM_NOMBRE: Record<string, string> = {
  p1: "Felipe González",
  p2: "María Silva",
  p3: "Carlos Rivera",
  p4: "Ana Martínez",
  p5: "Diego López",
  p6: "Valentina Soto",
};

function normalizeProyectoRow(p: Proyecto): Proyecto {
  const legacyId = p.project_manager_id?.trim();
  const pmNombre =
    (p.pm_nombre && p.pm_nombre.trim()) ||
    (legacyId && LEGACY_PROJECT_PM_NOMBRE[legacyId]) ||
    "";
  const uf_presupuestadas = p.uf_presupuestadas ?? 0;
  const monedaH = hydrateMonedaProyectoFromPersisted({
    uf_presupuestadas,
    moneda_original: p.moneda_original,
    monto_original: p.monto_original,
    valor_uf_conversion: p.valor_uf_conversion,
    tipo_cambio_usd: p.tipo_cambio_usd,
  });
  const tarifasH = hydrateTarifasContractualesFromPersisted({
    moneda_original: monedaH.moneda_original,
    valor_uf_conversion: monedaH.valor_uf_conversion,
    tipo_cambio_usd: monedaH.tipo_cambio_usd,
    tarifa_l2: p.tarifa_l2,
    tarifa_p4: p.tarifa_p4,
    tarifa_p3: p.tarifa_p3,
    tarifa_p2: p.tarifa_p2,
    tarifa_l2_original: (p as unknown as Record<string, unknown>).tarifa_l2_original,
    tarifa_p4_original: (p as unknown as Record<string, unknown>).tarifa_p4_original,
    tarifa_p3_original: (p as unknown as Record<string, unknown>).tarifa_p3_original,
    tarifa_p2_original: (p as unknown as Record<string, unknown>).tarifa_p2_original,
  });
  return {
    ...p,
    pm_interno_id: (p.pm_interno_id ?? "").trim(),
    pm_nombre: pmNombre,
    tarifa_l2: p.tarifa_l2 ?? 0,
    tarifa_p4: p.tarifa_p4 ?? 0,
    tarifa_p3: p.tarifa_p3 ?? 0,
    tarifa_p2: p.tarifa_p2 ?? 0,
    project_manager_id: "",
    uf_presupuestadas,
    hrs_presupuestadas: p.hrs_presupuestadas ?? 0,
    ...monedaH,
    ...tarifasH,
  };
}

function normalizePmInternoRow(pm: PmInterno): PmInterno {
  return {
    ...pm,
    codigo: (pm.codigo ?? "").trim().toUpperCase(),
    nombre: (pm.nombre ?? "").trim(),
    activo: pm.activo ?? true,
  };
}

function pipelinePersistedHasTarifaKeys(p: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(p, "tarifa_l2") ||
    Object.prototype.hasOwnProperty.call(p, "tarifa_p4") ||
    Object.prototype.hasOwnProperty.call(p, "tarifa_p3") ||
    Object.prototype.hasOwnProperty.call(p, "tarifa_p2")
  );
}

function toNonNegNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function hydratePipelineClienteRow(row: Pipeline, clientes: Cliente[]): Pipeline {
  let cliente_id = row.cliente_id.trim();
  const legacy = row.cliente;

  if (!cliente_id && legacy) {
    const g = guessPipelineClienteIdFromLegacy(legacy, clientes);
    if (g) cliente_id = g;
  }

  if (cliente_id) {
    const c = clientes.find((x) => x.id === cliente_id);
    if (c) {
      return {
        ...row,
        cliente_id,
        cliente: `${c.codigo} — ${c.nombre}`,
      };
    }
  }

  return { ...row, cliente_id };
}

function normalizePipelineRow(raw: unknown): Pipeline {
  const p = raw as Record<string, unknown>;
  const id = String(p.id ?? "");
  const tarifa_l2 = toNonNegNumber(p.tarifa_l2, 0);
  const tarifa_p4 = toNonNegNumber(p.tarifa_p4, 0);
  const tarifa_p3 = toNonNegNumber(p.tarifa_p3, 0);
  const tarifa_p2 = toNonNegNumber(p.tarifa_p2, 0);
  const hrs_L2 = toNonNegNumber(p.hrs_L2, 0);
  const hrs_P4 = toNonNegNumber(p.hrs_P4, 0);
  const hrs_P3 = toNonNegNumber(p.hrs_P3, 0);
  const hrs_P2 = toNonNegNumber(p.hrs_P2, 0);
  const computedMonto = computePipelineMontoUf({
    hrs_L2,
    hrs_P4,
    hrs_P3,
    hrs_P2,
    tarifa_l2,
    tarifa_p4,
    tarifa_p3,
    tarifa_p2,
  });
  const storedMonto = toNonNegNumber(p.monto_uf, 0);
  const monto_uf = pipelinePersistedHasTarifaKeys(p) ? computedMonto : storedMonto;

  const legacyCliente = String(p.cliente ?? "");
  const rawClienteId = String(p.cliente_id ?? "").trim();

  return {
    id,
    cliente: legacyCliente,
    cliente_id: rawClienteId,
    nombre_proyecto: String(p.nombre_proyecto ?? ""),
    etapa: (["CONCEPTUAL", "FACTIBILIDAD", "DETALLE"] as const).includes(p.etapa as Pipeline["etapa"])
      ? (p.etapa as Pipeline["etapa"])
      : "CONCEPTUAL",
    entregable: String(p.entregable ?? ""),
    pm_responsable_id: String(p.pm_responsable_id ?? ""),
    fecha_propuesta: String(p.fecha_propuesta ?? ""),
    monto_uf,
    estado: (["EN_ESPERA", "EN_COTIZACION", "APROBADO", "RECHAZADO"] as const).includes(p.estado as Pipeline["estado"])
      ? (p.estado as Pipeline["estado"])
      : "EN_ESPERA",
    hrs_L2,
    hrs_P4,
    hrs_P3,
    hrs_P2,
    tarifa_l2,
    tarifa_p4,
    tarifa_p3,
    tarifa_p2,
    observaciones: p.observaciones == null || p.observaciones === "" ? null : String(p.observaciones),
    created_at: String(p.created_at ?? now()),
    updated_at: String(p.updated_at ?? now()),
  };
}

const seedProyectosIncompletos = [
  { id: "pr1", codigo: "COD0064", nombre: "Proyecto Chuquicamata Fase II", cliente_id: "c1", pm_interno_id: "", project_manager_id: "", pm_nombre: "Felipe González", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-01-01", fecha_termino: "2026-12-31", uf_presupuestadas: 4500, hrs_presupuestadas: 12000, created_at: now(), updated_at: now() },
  { id: "pr2", codigo: "COD0065", nombre: "Nivel Traspandino", cliente_id: "c1", pm_interno_id: "", project_manager_id: "", pm_nombre: "Felipe González", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-03-01", fecha_termino: "2026-09-30", uf_presupuestadas: 3200, hrs_presupuestadas: 8500, created_at: now(), updated_at: now() },
  { id: "pr3", codigo: "AMSA0012", nombre: "Expansión Los Vilos", cliente_id: "c2", pm_interno_id: "", project_manager_id: "", pm_nombre: "Diego López", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-02-01", fecha_termino: "2026-06-30", uf_presupuestadas: 2800, hrs_presupuestadas: 7200, created_at: now(), updated_at: now() },
  { id: "pr4", codigo: "AMSA0013", nombre: "Optimización Concentrador", cliente_id: "c2", pm_interno_id: "", project_manager_id: "", pm_nombre: "Diego López", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-04-01", fecha_termino: "2026-04-30", uf_presupuestadas: 1900, hrs_presupuestadas: 5000, created_at: now(), updated_at: now() },
  { id: "pr5", codigo: "GLEN0045", nombre: "Lomas Bayas Expansión", cliente_id: "c3", pm_interno_id: "", project_manager_id: "", pm_nombre: "María Silva", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-01-15", fecha_termino: "2026-08-15", uf_presupuestadas: 2100, hrs_presupuestadas: 6000, created_at: now(), updated_at: now() },
  { id: "pr6", codigo: "TECK0021", nombre: "Quebrada Blanca Fase II", cliente_id: "c4", pm_interno_id: "", project_manager_id: "", pm_nombre: "Ana Martínez", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-05-01", fecha_termino: "2026-12-31", uf_presupuestadas: 3600, hrs_presupuestadas: 9500, created_at: now(), updated_at: now() },
  { id: "pr7", codigo: "ANGLO0078", nombre: "Los Bronces Integrado", cliente_id: "c5", pm_interno_id: "", project_manager_id: "", pm_nombre: "Felipe González", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-03-15", fecha_termino: "2026-10-15", uf_presupuestadas: 4100, hrs_presupuestadas: 11000, created_at: now(), updated_at: now() },
  { id: "pr8", codigo: "COLL0034", nombre: "Rosario Sur", cliente_id: "c6", pm_interno_id: "", project_manager_id: "", pm_nombre: "María Silva", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-02-15", fecha_termino: "2026-05-30", uf_presupuestadas: 2400, hrs_presupuestadas: 6400, created_at: now(), updated_at: now() },
  { id: "pr9", codigo: "EXT0011", nombre: "Consultoría General", cliente_id: "c7", pm_interno_id: "", project_manager_id: "", pm_nombre: "Carlos Rivera", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-01-01", fecha_termino: "2026-12-31", uf_presupuestadas: 800, hrs_presupuestadas: 2400, created_at: now(), updated_at: now() },
  { id: "pr10", codigo: "COD0066", nombre: "Rajos Abiertos Norte", cliente_id: "c1", pm_interno_id: "", project_manager_id: "", pm_nombre: "Diego López", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "NO_INICIADO", fecha_inicio: "2026-01-01", fecha_termino: "2026-12-31", uf_presupuestadas: 5200, hrs_presupuestadas: 14000, created_at: now(), updated_at: now() },
  { id: "pr11", codigo: "AMSA0014", nombre: "Desaladora", cliente_id: "c2", pm_interno_id: "", project_manager_id: "", pm_nombre: "Valentina Soto", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "NO_INICIADO", fecha_inicio: "2026-03-01", fecha_termino: "2027-06-30", uf_presupuestadas: 5800, hrs_presupuestadas: 15000, created_at: now(), updated_at: now() },
  { id: "pr12", codigo: "GLEN0046", nombre: "Alcaparrosa", cliente_id: "c3", pm_interno_id: "", project_manager_id: "", pm_nombre: "Carlos Rivera", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-06-01", fecha_termino: "2026-03-31", uf_presupuestadas: 1700, hrs_presupuestadas: 4600, created_at: now(), updated_at: now() },
  { id: "pr13", codigo: "TECK0022", nombre: "Carmen de Andacollo", cliente_id: "c4", pm_interno_id: "", project_manager_id: "", pm_nombre: "Ana Martínez", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "SUSPENDIDO", fecha_inicio: "2025-01-01", fecha_termino: "2025-06-30", uf_presupuestadas: 900, hrs_presupuestadas: 2800, created_at: now(), updated_at: now() },
  { id: "pr14", codigo: "ANGLO0079", nombre: "El Soldado", cliente_id: "c5", pm_interno_id: "", project_manager_id: "", pm_nombre: "Felipe González", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-04-01", fecha_termino: "2026-07-31", uf_presupuestadas: 2600, hrs_presupuestadas: 7000, created_at: now(), updated_at: now() },
  { id: "pr15", codigo: "COLL0035", nombre: "Ujina", cliente_id: "c6", pm_interno_id: "", project_manager_id: "", pm_nombre: "Valentina Soto", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-05-15", fecha_termino: "2026-09-15", uf_presupuestadas: 3000, hrs_presupuestadas: 8000, created_at: now(), updated_at: now() },
  { id: "pr16", codigo: "EXT0012", nombre: "Asesoría Técnica", cliente_id: "c7", pm_interno_id: "", project_manager_id: "", pm_nombre: "Carlos Rivera", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "COMPLETADO", fecha_inicio: "2024-06-01", fecha_termino: "2025-03-31", uf_presupuestadas: 400, hrs_presupuestadas: 1200, created_at: now(), updated_at: now() },
  { id: "pr17", codigo: "COD0067", nombre: "Ministro Hales Optimización", cliente_id: "c1", pm_interno_id: "", project_manager_id: "", pm_nombre: "Felipe González", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-07-01", fecha_termino: "2026-06-30", uf_presupuestadas: 2200, hrs_presupuestadas: 6000, created_at: now(), updated_at: now() },
  { id: "pr18", codigo: "AMSA0015", nombre: "SST Los Vilos", cliente_id: "c2", pm_interno_id: "", project_manager_id: "", pm_nombre: "Diego López", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-08-01", fecha_termino: "2026-02-28", uf_presupuestadas: 1500, hrs_presupuestadas: 4200, created_at: now(), updated_at: now() },
  { id: "pr19", codigo: "GLEN0047", nombre: "Lomas Bayas SST", cliente_id: "c3", pm_interno_id: "", project_manager_id: "", pm_nombre: "María Silva", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "ACTIVO", fecha_inicio: "2025-09-01", fecha_termino: "2026-05-31", uf_presupuestadas: 1300, hrs_presupuestadas: 3600, created_at: now(), updated_at: now() },
  { id: "pr20", codigo: "TECK0023", nombre: "QB2 Ampliación", cliente_id: "c4", pm_interno_id: "", project_manager_id: "", pm_nombre: "Ana Martínez", tarifa_l2: 0, tarifa_p4: 0, tarifa_p3: 0, tarifa_p2: 0, estado: "NO_INICIADO", fecha_inicio: "2026-06-01", fecha_termino: "2027-12-31", uf_presupuestadas: 6500, hrs_presupuestadas: 18000, created_at: now(), updated_at: now() },
] as const;

const seedProyectos: Proyecto[] = seedProyectosIncompletos.map((row) =>
  normalizeProyectoRow({ ...(row as unknown as Proyecto) }),
);

type SeedEntregableSinCategoria = Omit<
  Entregable,
  "hrs_l2" | "hrs_p4" | "hrs_p3" | "hrs_p2" | "presupuesto_categoria_definido"
>;

const seedEntregablesRaw: SeedEntregableSinCategoria[] = [
  { id: "e1", proyecto_id: "pr1", nombre: "Ingeniería Conceptual", lider_id: "p1", estado: "COMPLETADO", avance_real: 1, avance_teorico: 1, fecha_inicio: "2025-01-01", fecha_termino: "2025-03-31", fecha_revA: "2025-02-15", fecha_revB: "2025-03-10", fecha_revP: "2025-03-25", uf_presupuestadas: 800, uf_consumidas: 800, hrs_presupuestadas: 2400, hrs_gastadas: 2350, created_at: now(), updated_at: now() },
  { id: "e2", proyecto_id: "pr1", nombre: "Ingeniería Básica", lider_id: "p1", estado: "EN_PLAZO", avance_real: 0.72, avance_teorico: 0.68, fecha_inicio: "2025-04-01", fecha_termino: "2025-09-30", fecha_revA: "2025-05-15", fecha_revB: "2025-07-20", fecha_revP: "2025-09-15", uf_presupuestadas: 1500, uf_consumidas: 980, hrs_presupuestadas: 4200, hrs_gastadas: 2850, created_at: now(), updated_at: now() },
  { id: "e3", proyecto_id: "pr1", nombre: "Ingeniería de Detalle", lider_id: "p2", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.15, fecha_inicio: "2025-10-01", fecha_termino: "2026-06-30", fecha_revA: "2025-12-01", fecha_revB: "2026-02-15", fecha_revP: "2026-06-01", uf_presupuestadas: 2200, uf_consumidas: 0, hrs_presupuestadas: 5400, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e4", proyecto_id: "pr2", nombre: "Estudio Geotécnico", lider_id: "p3", estado: "EN_PLAZO", avance_real: 0.45, avance_teorico: 0.42, fecha_inicio: "2025-03-01", fecha_termino: "2025-08-31", fecha_revA: "2025-04-20", fecha_revB: "2025-06-30", fecha_revP: "2025-08-15", uf_presupuestadas: 600, uf_consumidas: 280, hrs_presupuestadas: 1800, hrs_gastadas: 820, created_at: now(), updated_at: now() },
  { id: "e5", proyecto_id: "pr2", nombre: "Diseño Estructural", lider_id: "p1", estado: "EN_PLAZO", avance_real: 0.30, avance_teorico: 0.28, fecha_inicio: "2025-06-01", fecha_termino: "2025-12-31", fecha_revA: "2025-07-15", fecha_revB: "2025-09-30", fecha_revP: "2025-12-01", uf_presupuestadas: 900, uf_consumidas: 240, hrs_presupuestadas: 2400, hrs_gastadas: 720, created_at: now(), updated_at: now() },
  { id: "e6", proyecto_id: "pr2", nombre: "Ingeniería Mecánica", lider_id: "p5", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.05, fecha_inicio: "2026-01-01", fecha_termino: "2026-09-30", fecha_revA: "2026-03-01", fecha_revB: "2026-06-01", fecha_revP: "2026-09-01", uf_presupuestadas: 1700, uf_consumidas: 0, hrs_presupuestadas: 4300, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e7", proyecto_id: "pr3", nombre: "Infraestructura", lider_id: "p5", estado: "RIESGO", avance_real: 0.55, avance_teorico: 0.62, fecha_inicio: "2025-02-01", fecha_termino: "2025-08-31", fecha_revA: "2025-03-15", fecha_revB: "2025-05-30", fecha_revP: "2025-08-01", uf_presupuestadas: 700, uf_consumidas: 420, hrs_presupuestadas: 2000, hrs_gastadas: 1100, created_at: now(), updated_at: now() },
  { id: "e8", proyecto_id: "pr3", nombre: "Diseño Eléctrico", lider_id: "p6", estado: "EN_PLAZO", avance_real: 0.38, avance_teorico: 0.35, fecha_inicio: "2025-04-01", fecha_termino: "2025-10-31", fecha_revA: "2025-05-20", fecha_revB: "2025-07-30", fecha_revP: "2025-10-01", uf_presupuestadas: 600, uf_consumidas: 180, hrs_presupuestadas: 1600, hrs_gastadas: 580, created_at: now(), updated_at: now() },
  { id: "e9", proyecto_id: "pr3", nombre: "Automatización", lider_id: "p5", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0, fecha_inicio: "2025-09-01", fecha_termino: "2026-06-30", fecha_revA: "2025-11-01", fecha_revB: "2026-01-15", fecha_revP: "2026-05-01", uf_presupuestadas: 1500, uf_consumidas: 0, hrs_presupuestadas: 3600, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e10", proyecto_id: "pr4", nombre: "Optimización Circuito", lider_id: "p2", estado: "CRITICO", avance_real: 0.22, avance_teorico: 0.38, fecha_inicio: "2025-04-01", fecha_termino: "2025-09-30", fecha_revA: "2025-05-15", fecha_revB: "2025-07-15", fecha_revP: "2025-09-01", uf_presupuestadas: 500, uf_consumidas: 120, hrs_presupuestadas: 1400, hrs_gastadas: 310, created_at: now(), updated_at: now() },
  { id: "e11", proyecto_id: "pr4", nombre: "Diseño Civil", lider_id: "p4", estado: "EN_PLAZO", avance_real: 0.40, avance_teorico: 0.38, fecha_inicio: "2025-05-01", fecha_termino: "2025-12-31", fecha_revA: "2025-06-15", fecha_revB: "2025-09-01", fecha_revP: "2025-12-01", uf_presupuestadas: 800, uf_consumidas: 260, hrs_presupuestadas: 2200, hrs_gastadas: 780, created_at: now(), updated_at: now() },
  { id: "e12", proyecto_id: "pr4", nombre: "Piping", lider_id: "p6", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.10, fecha_inicio: "2025-08-01", fecha_termino: "2026-04-30", fecha_revA: "2025-10-01", fecha_revB: "2026-01-01", fecha_revP: "2026-04-01", uf_presupuestadas: 600, uf_consumidas: 0, hrs_presupuestadas: 1400, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e13", proyecto_id: "pr5", nombre: "Expansión Planta", lider_id: "p2", estado: "EN_PLAZO", avance_real: 0.48, avance_teorico: 0.45, fecha_inicio: "2025-01-15", fecha_termino: "2025-10-15", fecha_revA: "2025-03-20", fecha_revB: "2025-06-30", fecha_revP: "2025-09-30", uf_presupuestadas: 900, uf_consumidas: 380, hrs_presupuestadas: 2600, hrs_gastadas: 1150, created_at: now(), updated_at: now() },
  { id: "e14", proyecto_id: "pr5", nombre: "Instalaciones", lider_id: "p3", estado: "ADELANTADO", avance_real: 0.65, avance_teorico: 0.55, fecha_inicio: "2025-04-01", fecha_termino: "2025-11-30", fecha_revA: "2025-05-30", fecha_revB: "2025-08-15", fecha_revP: "2025-11-01", uf_presupuestadas: 700, uf_consumidas: 360, hrs_presupuestadas: 2000, hrs_gastadas: 1050, created_at: now(), updated_at: now() },
  { id: "e15", proyecto_id: "pr5", nombre: "Comisionamiento", lider_id: "p2", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0, fecha_inicio: "2025-10-01", fecha_termino: "2026-08-15", fecha_revA: "2025-12-01", fecha_revB: "2026-03-01", fecha_revP: "2026-07-01", uf_presupuestadas: 500, uf_consumidas: 0, hrs_presupuestadas: 1400, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e16", proyecto_id: "pr6", nombre: "Desarrollo Mina", lider_id: "p4", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.05, fecha_inicio: "2025-05-01", fecha_termino: "2026-02-28", fecha_revA: "2025-07-01", fecha_revB: "2025-10-01", fecha_revP: "2026-02-01", uf_presupuestadas: 1100, uf_consumidas: 0, hrs_presupuestadas: 3000, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e17", proyecto_id: "pr6", nombre: "Procesos", lider_id: "p1", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0, fecha_inicio: "2025-08-01", fecha_termino: "2026-06-30", fecha_revA: "2025-10-01", fecha_revB: "2026-01-15", fecha_revP: "2026-06-01", uf_presupuestadas: 1300, uf_consumidas: 0, hrs_presupuestadas: 3600, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e18", proyecto_id: "pr6", nombre: "Infraestructura Soporte", lider_id: "p4", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0, fecha_inicio: "2026-01-01", fecha_termino: "2026-12-31", fecha_revA: "2026-03-01", fecha_revB: "2026-06-01", fecha_revP: "2026-11-01", uf_presupuestadas: 1200, uf_consumidas: 0, hrs_presupuestadas: 2900, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e19", proyecto_id: "pr7", nombre: "Fase I", lider_id: "p1", estado: "EN_PLAZO", avance_real: 0.50, avance_teorico: 0.48, fecha_inicio: "2025-03-15", fecha_termino: "2025-12-31", fecha_revA: "2025-05-01", fecha_revB: "2025-08-15", fecha_revP: "2025-12-01", uf_presupuestadas: 1500, uf_consumidas: 620, hrs_presupuestadas: 4200, hrs_gastadas: 1750, created_at: now(), updated_at: now() },
  { id: "e20", proyecto_id: "pr7", nombre: "Fase II", lider_id: "p5", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.10, fecha_inicio: "2026-01-01", fecha_termino: "2026-10-15", fecha_revA: "2026-03-01", fecha_revB: "2026-06-01", fecha_revP: "2026-10-01", uf_presupuestadas: 1600, uf_consumidas: 0, hrs_presupuestadas: 4300, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e21", proyecto_id: "pr7", nombre: "Integración", lider_id: "p1", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0, fecha_inicio: "2026-07-01", fecha_termino: "2026-12-31", fecha_revA: "2026-09-01", fecha_revB: "2026-11-01", fecha_revP: "2026-12-15", uf_presupuestadas: 1000, uf_consumidas: 0, hrs_presupuestadas: 2500, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e22", proyecto_id: "pr8", nombre: "Estudio Ambiental", lider_id: "p2", estado: "EN_PLAZO", avance_real: 0.60, avance_teorico: 0.58, fecha_inicio: "2025-02-15", fecha_termino: "2025-09-30", fecha_revA: "2025-04-01", fecha_revB: "2025-06-30", fecha_revP: "2025-09-01", uf_presupuestadas: 600, uf_consumidas: 320, hrs_presupuestadas: 1700, hrs_gastadas: 920, created_at: now(), updated_at: now() },
  { id: "e23", proyecto_id: "pr8", nombre: "Diseño Hidraulico", lider_id: "p6", estado: "EN_PLAZO", avance_real: 0.42, avance_teorico: 0.40, fecha_inicio: "2025-05-01", fecha_termino: "2025-11-30", fecha_revA: "2025-06-15", fecha_revB: "2025-08-30", fecha_revP: "2025-11-01", uf_presupuestadas: 500, uf_consumidas: 180, hrs_presupuestadas: 1400, hrs_gastadas: 580, created_at: now(), updated_at: now() },
  { id: "e24", proyecto_id: "pr8", nombre: "Obras Civiles", lider_id: "p2", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.15, fecha_inicio: "2025-09-01", fecha_termino: "2026-05-30", fecha_revA: "2025-11-01", fecha_revB: "2026-02-01", fecha_revP: "2026-05-01", uf_presupuestadas: 1300, uf_consumidas: 0, hrs_presupuestadas: 3300, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e25", proyecto_id: "pr9", nombre: "Consultoría Procesos", lider_id: "p3", estado: "EN_PLAZO", avance_real: 0.35, avance_teorico: 0.32, fecha_inicio: "2025-01-01", fecha_termino: "2025-12-31", fecha_revA: "2025-03-01", fecha_revB: "2025-06-01", fecha_revP: "2025-11-01", uf_presupuestadas: 300, uf_consumidas: 95, hrs_presupuestadas: 900, hrs_gastadas: 310, created_at: now(), updated_at: now() },
  { id: "e26", proyecto_id: "pr9", nombre: "Soporte Técnico", lider_id: "p3", estado: "EN_PLAZO", avance_real: 0.28, avance_teorico: 0.25, fecha_inicio: "2025-04-01", fecha_termino: "2026-12-31", fecha_revA: "2025-06-01", fecha_revB: "2025-10-01", fecha_revP: "2026-06-01", uf_presupuestadas: 500, uf_consumidas: 110, hrs_presupuestadas: 1500, hrs_gastadas: 420, created_at: now(), updated_at: now() },
  { id: "e27", proyecto_id: "pr12", nombre: "Ingeniería Conceptual", lider_id: "p3", estado: "EN_PLAZO", avance_real: 0.55, avance_teorico: 0.52, fecha_inicio: "2025-06-01", fecha_termino: "2025-12-31", fecha_revA: "2025-07-15", fecha_revB: "2025-09-30", fecha_revP: "2025-12-01", uf_presupuestadas: 500, uf_consumidas: 220, hrs_presupuestadas: 1400, hrs_gastadas: 620, created_at: now(), updated_at: now() },
  { id: "e28", proyecto_id: "pr12", nombre: "Diseño Detalle", lider_id: "p2", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.20, fecha_inicio: "2026-01-01", fecha_termino: "2026-03-31", fecha_revA: "2026-01-15", fecha_revB: "2026-02-15", fecha_revP: "2026-03-15", uf_presupuestadas: 1200, uf_consumidas: 0, hrs_presupuestadas: 3200, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e29", proyecto_id: "pr14", nombre: "Expansión Fase 1", lider_id: "p1", estado: "EN_PLAZO", avance_real: 0.40, avance_teorico: 0.38, fecha_inicio: "2025-04-01", fecha_termino: "2025-12-31", fecha_revA: "2025-05-30", fecha_revB: "2025-08-15", fecha_revP: "2025-12-01", uf_presupuestadas: 1000, uf_consumidas: 340, hrs_presupuestadas: 2800, hrs_gastadas: 980, created_at: now(), updated_at: now() },
  { id: "e30", proyecto_id: "pr14", nombre: "Expansión Fase 2", lider_id: "p5", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.05, fecha_inicio: "2026-01-01", fecha_termino: "2026-07-31", fecha_revA: "2026-03-01", fecha_revB: "2026-05-01", fecha_revP: "2026-07-01", uf_presupuestadas: 1600, uf_consumidas: 0, hrs_presupuestadas: 4200, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e31", proyecto_id: "pr15", nombre: "Desarrollo", lider_id: "p6", estado: "EN_PLAZO", avance_real: 0.25, avance_teorico: 0.22, fecha_inicio: "2025-05-15", fecha_termino: "2025-12-31", fecha_revA: "2025-07-01", fecha_revB: "2025-09-15", fecha_revP: "2025-12-01", uf_presupuestadas: 1000, uf_consumidas: 180, hrs_presupuestadas: 2800, hrs_gastadas: 560, created_at: now(), updated_at: now() },
  { id: "e32", proyecto_id: "pr15", nombre: "Construcción", lider_id: "p2", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.10, fecha_inicio: "2026-01-01", fecha_termino: "2026-09-15", fecha_revA: "2026-03-01", fecha_revB: "2026-06-01", fecha_revP: "2026-09-01", uf_presupuestadas: 2000, uf_consumidas: 0, hrs_presupuestadas: 5200, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e33", proyecto_id: "pr17", nombre: "Optimización", lider_id: "p1", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0, fecha_inicio: "2025-07-01", fecha_termino: "2025-12-31", fecha_revA: "2025-08-15", fecha_revB: "2025-10-15", fecha_revP: "2025-12-01", uf_presupuestadas: 800, uf_consumidas: 0, hrs_presupuestadas: 2200, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e34", proyecto_id: "pr17", nombre: "Detalle", lider_id: "p2", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0, fecha_inicio: "2026-01-01", fecha_termino: "2026-06-30", fecha_revA: "2026-02-15", fecha_revB: "2026-04-15", fecha_revP: "2026-06-15", uf_presupuestadas: 1400, uf_consumidas: 0, hrs_presupuestadas: 3800, hrs_gastadas: 0, created_at: now(), updated_at: now() },
  { id: "e35", proyecto_id: "pr18", nombre: "Seguridad", lider_id: "p5", estado: "EN_PLAZO", avance_real: 0.48, avance_teorico: 0.45, fecha_inicio: "2025-08-01", fecha_termino: "2025-11-30", fecha_revA: "2025-09-15", fecha_revB: "2025-10-30", fecha_revP: "2025-11-15", uf_presupuestadas: 500, uf_consumidas: 180, hrs_presupuestadas: 1400, hrs_gastadas: 520, created_at: now(), updated_at: now() },
  { id: "e36", proyecto_id: "pr18", nombre: "Salud Ocupacional", lider_id: "p6", estado: "ADELANTADO", avance_real: 0.70, avance_teorico: 0.55, fecha_inicio: "2025-08-01", fecha_termino: "2026-02-28", fecha_revA: "2025-10-01", fecha_revB: "2025-12-01", fecha_revP: "2026-02-01", uf_presupuestadas: 600, uf_consumidas: 320, hrs_presupuestadas: 1600, hrs_gastadas: 880, created_at: now(), updated_at: now() },
  { id: "e37", proyecto_id: "pr19", nombre: "SST", lider_id: "p2", estado: "EN_PLAZO", avance_real: 0.30, avance_teorico: 0.28, fecha_inicio: "2025-09-01", fecha_termino: "2026-02-28", fecha_revA: "2025-10-15", fecha_revB: "2025-12-15", fecha_revP: "2026-02-01", uf_presupuestadas: 700, uf_consumidas: 170, hrs_presupuestadas: 1900, hrs_gastadas: 520, created_at: now(), updated_at: now() },
  { id: "e38", proyecto_id: "pr19", nombre: "Ambiental", lider_id: "p3", estado: "NO_INICIADO", avance_real: 0, avance_teorico: 0.10, fecha_inicio: "2025-11-01", fecha_termino: "2026-05-31", fecha_revA: "2025-12-15", fecha_revB: "2026-02-15", fecha_revP: "2026-05-01", uf_presupuestadas: 600, uf_consumidas: 0, hrs_presupuestadas: 1700, hrs_gastadas: 0, created_at: now(), updated_at: now() },
];

const seedEntregables: Entregable[] = seedEntregablesRaw.map((e) => ({
  ...e,
  ...spreadHrsPresupuestadasPorCategoria(e.hrs_presupuestadas),
  presupuesto_categoria_definido: false,
}));

const seedTarifasPipeline = { tarifa_l2: 2, tarifa_p4: 1.5, tarifa_p3: 1.2, tarifa_p2: 1 } as const;

const seedPipeline: Pipeline[] = [
  { id: "pl1", cliente_id: "c1", cliente: "COD — Codelco", nombre_proyecto: "Teniente Nuevo Nivel", etapa: "CONCEPTUAL", entregable: "Estudio Preliminar", pm_responsable_id: "pmi1", fecha_propuesta: "2026-05-01", monto_uf: 6040, estado: "EN_COTIZACION", hrs_L2: 200, hrs_P4: 800, hrs_P3: 1200, hrs_P2: 3000, ...seedTarifasPipeline, observaciones: "En revisión cliente", created_at: now(), updated_at: now() },
  { id: "pl2", cliente_id: "c2", cliente: "AMSA — AMSA Minera Los Pelambres", nombre_proyecto: "Nueva Desaladora", etapa: "FACTIBILIDAD", entregable: "Evaluación Técnica", pm_responsable_id: "pmi3", fecha_propuesta: "2026-06-01", monto_uf: 10000, estado: "EN_ESPERA", hrs_L2: 400, hrs_P4: 1200, hrs_P3: 2000, hrs_P2: 5000, ...seedTarifasPipeline, observaciones: "Esperando aprobación directorio", created_at: now(), updated_at: now() },
  { id: "pl3", cliente_id: "c3", cliente: "GLEN — Glencore", nombre_proyecto: "Alcaparrosa Ampliación", etapa: "DETALLE", entregable: "Ingeniería Detalle", pm_responsable_id: "pmi2", fecha_propuesta: "2026-04-01", monto_uf: 4380, estado: "APROBADO", hrs_L2: 100, hrs_P4: 600, hrs_P3: 900, hrs_P2: 2200, ...seedTarifasPipeline, observaciones: "Aprobado en comité", created_at: now(), updated_at: now() },
  { id: "pl4", cliente_id: "c4", cliente: "TECK — Teck", nombre_proyecto: "QB2 Fase 3", etapa: "CONCEPTUAL", entregable: "Concepto General", pm_responsable_id: "pmi4", fecha_propuesta: "2026-08-01", monto_uf: 7900, estado: "EN_COTIZACION", hrs_L2: 300, hrs_P4: 1000, hrs_P3: 1500, hrs_P2: 4000, ...seedTarifasPipeline, observaciones: "Definiendo alcance", created_at: now(), updated_at: now() },
  { id: "pl5", cliente_id: "c5", cliente: "ANGLO — Anglo American", nombre_proyecto: "Collahuasi Joint Venture", etapa: "FACTIBILIDAD", entregable: "Estudio Factibilidad", pm_responsable_id: "pmi1", fecha_propuesta: "2026-07-01", monto_uf: 7030, estado: "EN_ESPERA", hrs_L2: 250, hrs_P4: 900, hrs_P3: 1400, hrs_P2: 3500, ...seedTarifasPipeline, observaciones: "Negociación en curso", created_at: now(), updated_at: now() },
  { id: "pl6", cliente_id: "c6", cliente: "COLL — Collahuasi", nombre_proyecto: "Rosario Norte", etapa: "DETALLE", entregable: "Diseño Final", pm_responsable_id: "pmi2", fecha_propuesta: "2026-03-01", monto_uf: 5470, estado: "APROBADO", hrs_L2: 150, hrs_P4: 700, hrs_P3: 1100, hrs_P2: 2800, ...seedTarifasPipeline, observaciones: "Inicio abril 2026", created_at: now(), updated_at: now() },
  { id: "pl7", cliente_id: "c1", cliente: "COD — Codelco", nombre_proyecto: "El Teniente Subterráneo", etapa: "CONCEPTUAL", entregable: "Conceptualización", pm_responsable_id: "pmi1", fecha_propuesta: "2026-09-01", monto_uf: 12250, estado: "EN_COTIZACION", hrs_L2: 500, hrs_P4: 1500, hrs_P3: 2500, hrs_P2: 6000, ...seedTarifasPipeline, observaciones: "Alta prioridad", created_at: now(), updated_at: now() },
  { id: "pl8", cliente_id: "c7", cliente: "EXT — Servicios Externos", nombre_proyecto: "Asesoría BIM", etapa: "DETALLE", entregable: "Implementación", pm_responsable_id: "pmi2", fecha_propuesta: "2026-04-15", monto_uf: 1560, estado: "APROBADO", hrs_L2: 50, hrs_P4: 200, hrs_P3: 300, hrs_P2: 800, ...seedTarifasPipeline, observaciones: "Cliente interno", created_at: now(), updated_at: now() },
];

const seedCargaMensual: CargaMensual[] = [
  { id: "cm1", mes_iso: "2026-01", profesional_id: null, hrs_directas: 580, hrs_indirectas: 120, hrs_vacaciones: 40, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm2", mes_iso: "2026-02", profesional_id: null, hrs_directas: 620, hrs_indirectas: 110, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm3", mes_iso: "2026-03", profesional_id: null, hrs_directas: 650, hrs_indirectas: 100, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm4", mes_iso: "2026-04", profesional_id: null, hrs_directas: 680, hrs_indirectas: 90, hrs_vacaciones: 30, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm5", mes_iso: "2026-05", profesional_id: null, hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm6", mes_iso: "2026-06", profesional_id: null, hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm7", mes_iso: "2026-07", profesional_id: null, hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm8", mes_iso: "2026-08", profesional_id: null, hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm9", mes_iso: "2026-09", profesional_id: null, hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm10", mes_iso: "2026-10", profesional_id: null, hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm11", mes_iso: "2026-11", profesional_id: null, hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
  { id: "cm12", mes_iso: "2026-12", profesional_id: null, hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 720, created_at: now(), updated_at: now() },
];

const seedRegistroHoras: RegistroHora[] = [
  { id: "rh1", profesional_id: "p1", proyecto_id: "pr1", entregable_id: "e2", tipo_hora: "DIRECTA", fecha: "2026-04-01", horas: 8, descripcion: "Revisión diseño", created_at: now(), updated_at: now() },
  { id: "rh2", profesional_id: "p1", proyecto_id: "pr1", entregable_id: "e2", tipo_hora: "DIRECTA", fecha: "2026-04-02", horas: 7.5, descripcion: "Coordinación", created_at: now(), updated_at: now() },
  { id: "rh3", profesional_id: "p2", proyecto_id: "pr3", entregable_id: "e7", tipo_hora: "DIRECTA", fecha: "2026-04-01", horas: 6, descripcion: "Diseño estructuras", created_at: now(), updated_at: now() },
  { id: "rh4", profesional_id: "p2", proyecto_id: "pr5", entregable_id: "e13", tipo_hora: "DIRECTA", fecha: "2026-04-01", horas: 5, descripcion: "Planta expansión", created_at: now(), updated_at: now() },
  { id: "rh5", profesional_id: "p3", proyecto_id: "pr9", entregable_id: "e25", tipo_hora: "DIRECTA", fecha: "2026-04-01", horas: 4, descripcion: "Consultoría", created_at: now(), updated_at: now() },
  { id: "rh6", profesional_id: "p4", proyecto_id: null, entregable_id: null, tipo_hora: "INDIRECTA", fecha: "2026-04-01", horas: 2, descripcion: "Reunión general", created_at: now(), updated_at: now() },
  { id: "rh7", profesional_id: "p5", proyecto_id: "pr3", entregable_id: "e9", tipo_hora: "DIRECTA", fecha: "2026-04-01", horas: 8, descripcion: "Automatización", created_at: now(), updated_at: now() },
  { id: "rh8", profesional_id: "p6", proyecto_id: "pr4", entregable_id: "e12", tipo_hora: "DIRECTA", fecha: "2026-04-01", horas: 6, descripcion: "Piping", created_at: now(), updated_at: now() },
];

const seedAsignacionesHoras: AsignacionHora[] = [];

function normalizeEvaluacionesDesempenoProfesional(raw: unknown): EvaluacionDesempenoProfesional[] {
  if (!Array.isArray(raw)) return [];
  const byProf = new Map<string, EvaluacionDesempenoProfesional>();
  for (const row of raw) {
    const r = row as Record<string, unknown>;
    const profesional_id = String(r.profesional_id ?? "").trim();
    if (!profesional_id) continue;
    const objetivosRaw = Array.isArray(r.objetivos) ? r.objetivos : [];
    const objetivos: ObjetivoDesempenoProfesional[] = objetivosRaw.map((o) => {
      const x = o as Record<string, unknown>;
      return {
        id: String(x.id ?? uid()),
        objetivo: String(x.objetivo ?? ""),
        evaluacion: String(x.evaluacion ?? ""),
        estado:
          x.estado != null && String(x.estado).trim() !== "" ? String(x.estado).trim() : null,
      };
    });
    const ev: EvaluacionDesempenoProfesional = {
      id: String(r.id ?? uid()),
      profesional_id,
      fecha: String(r.fecha ?? "").trim() || now().slice(0, 10),
      updated_at: String(r.updated_at ?? "").trim() || now(),
      objetivos,
      comentario_general:
        r.comentario_general != null && String(r.comentario_general).trim() !== ""
          ? String(r.comentario_general).trim()
          : null,
    };
    byProf.set(profesional_id, ev);
  }
  return Array.from(byProf.values());
}

const EQUIPO_ENTREGABLE_ORIGENES: EquipoEntregableOrigen[] = [
  "migracion_asignacion_activa",
  "migracion_asignacion_cerrada",
  "lider_id_entregable",
  "manual",
];

function normalizeEquipoEntregableRow(row: EquipoEntregable): EquipoEntregable | null {
  const entregable_id = String(row.entregable_id ?? "").trim();
  const profesional_id = String(row.profesional_id ?? "").trim();
  if (!entregable_id || !profesional_id) return null;
  const rol_en_entregable: AsignacionHoraRol = row.rol_en_entregable === "LIDER" ? "LIDER" : "APOYO";
  const origen =
    row.origen && EQUIPO_ENTREGABLE_ORIGENES.includes(row.origen as EquipoEntregableOrigen)
      ? (row.origen as EquipoEntregableOrigen)
      : undefined;
  const ts = now();
  return {
    ...row,
    id: String(row.id ?? "").trim() || uid(),
    entregable_id,
    profesional_id,
    rol_en_entregable,
    origen,
    created_at: String(row.created_at ?? "").trim() || ts,
    updated_at: String(row.updated_at ?? "").trim() || ts,
  };
}

function normalizeEquipoEntregableCarga(raw: unknown): EquipoEntregable[] {
  if (!Array.isArray(raw)) return [];
  const out: EquipoEntregable[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const n = normalizeEquipoEntregableRow(row as EquipoEntregable);
    if (!n) continue;
    const key = `${n.entregable_id}\0${n.profesional_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/** Estructura persistible válida sin registros; único fallback cuando no hay `valtica_data_v1`. */
function createEmptyAppData(): AppData {
  return {
    clientes: [],
    profesionales: [],
    pm_internos: [],
    proyectos: [],
    entregables: [],
    asignaciones_horas: [],
    equipo_entregable: [],
    registro_horas: [],
    pipeline: [],
    carga_mensual: [],
    curvas_objetivo_anual: [],
    historial_redistribuciones_horas: [],
    evaluaciones_desempeno_profesional: [],
    alertas_revisadas: [],
  };
}

/**
 * Dataset demo original (desarrollo / carga explícita). No se usa como fallback de arranque productivo.
 */
export function getAppDataDemoSeed(): AppData {
  return {
    clientes: seedClientes,
    profesionales: seedProfesionales,
    pm_internos: seedPmInternos,
    proyectos: seedProyectos,
    entregables: seedEntregables,
    asignaciones_horas: seedAsignacionesHoras,
    equipo_entregable: [],
    registro_horas: seedRegistroHoras,
    pipeline: seedPipeline,
    carga_mensual: seedCargaMensual,
    curvas_objetivo_anual: [],
    historial_redistribuciones_horas: [],
    evaluaciones_desempeno_profesional: [],
    alertas_revisadas: [],
  };
}

function getInitialData(): AppData {
  const fallback = createEmptyAppData();
  const raw = loadAppData(fallback);
  const normalizedProyectos = (Array.isArray(raw.proyectos) ? raw.proyectos : fallback.proyectos).map(
    normalizeProyectoRow,
  );
  const entregablesNormalized = (Array.isArray(raw.entregables) ? raw.entregables : fallback.entregables).map((e) =>
    normalizeEntregableRow(e as Entregable, normalizedProyectos),
  );
  const asignacionesRaw = Array.isArray(raw.asignaciones_horas) ? raw.asignaciones_horas : [];
  const asignacionesNormalized = (asignacionesRaw as AsignacionHora[]).map((a) =>
    normalizeAsignacionHoraRow(a, entregablesNormalized),
  );
  const entregablesConConsumo = recomputarConsumoEnEntregables(
    entregablesNormalized,
    Array.isArray(raw.registro_horas) ? raw.registro_horas : fallback.registro_horas,
    normalizedProyectos,
    Array.isArray(raw.profesionales) ? raw.profesionales : fallback.profesionales,
  );
  const clientesList = (Array.isArray(raw.clientes) ? raw.clientes : fallback.clientes) as Cliente[];
  const pipelineHydrated = (Array.isArray(raw.pipeline) ? raw.pipeline : fallback.pipeline)
    .map(normalizePipelineRow)
    .map((row) => hydratePipelineClienteRow(row, clientesList));
  return {
    ...fallback,
    ...raw,
    clientes: clientesList,
    profesionales: Array.isArray(raw.profesionales) ? raw.profesionales : fallback.profesionales,
    pm_internos: Array.isArray(raw.pm_internos) ? raw.pm_internos.map(normalizePmInternoRow) : [],
    proyectos: normalizedProyectos,
    entregables: entregablesConConsumo,
    asignaciones_horas: asignacionesNormalized,
    equipo_entregable: normalizeEquipoEntregableCarga((raw as AppData).equipo_entregable),
    registro_horas: Array.isArray(raw.registro_horas) ? raw.registro_horas : fallback.registro_horas,
    pipeline: pipelineHydrated,
    carga_mensual: Array.isArray(raw.carga_mensual) ? raw.carga_mensual : fallback.carga_mensual,
    curvas_objetivo_anual: Array.isArray((raw as AppData).curvas_objetivo_anual)
      ? (raw as AppData).curvas_objetivo_anual
          .filter((c) => c && Array.isArray(c.meses) && c.meses.length === 12)
          .map((c) => refrescarFechasYObjetivos(c as CurvaObjetivoAnual, now()))
      : fallback.curvas_objetivo_anual,
    historial_redistribuciones_horas: Array.isArray((raw as AppData).historial_redistribuciones_horas)
      ? (raw as AppData).historial_redistribuciones_horas
      : fallback.historial_redistribuciones_horas,
    evaluaciones_desempeno_profesional: normalizeEvaluacionesDesempenoProfesional(
      (raw as AppData).evaluaciones_desempeno_profesional,
    ),
    alertas_revisadas: normalizeAlertasRevisadasCarga((raw as AppData).alertas_revisadas),
  };
}

const TARIFA_PROYECTO_KEYS = ["tarifa_l2", "tarifa_p4", "tarifa_p3", "tarifa_p2"] as const;

/** Bloque 4.3: el patch incluye al menos una tarifa distinta al valor actual. */
function proyectoTarifasChanged(prev: Proyecto | undefined, patch: Partial<Proyecto>): boolean {
  if (!prev) return false;
  for (const k of TARIFA_PROYECTO_KEYS) {
    if (patch[k] === undefined) continue;
    if (Number(prev[k]) !== Number(patch[k])) return true;
  }
  return false;
}

function profesionalCargoChanged(prev: Profesional | undefined, patch: Partial<Profesional>): boolean {
  if (!prev || patch.cargo === undefined) return false;
  return patch.cargo !== prev.cargo;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(getInitialData);

  useEffect(() => {
    saveAppData(data);
  }, [data]);

  const mutate = useCallback(<K extends keyof AppData>(
    key: K,
    fn: (arr: AppData[K]) => AppData[K]
  ) => {
    setData((prev) => ({ ...prev, [key]: fn(prev[key]) }));
  }, []);

  /* ── CRUD helpers ── */
  const makeCrud = <K extends keyof AppData, T extends AppData[K] extends Array<infer U> ? U : never>(
    key: K
  ) => ({
    add: (item: Omit<T, "id" | "created_at" | "updated_at">) => {
      const full = { ...item, id: uid(), created_at: now(), updated_at: now() } as T;
      mutate(key, (arr) => [...(arr as unknown as T[]), full] as AppData[K]);
    },
    update: (id: string, patch: Partial<T>) => {
      mutate(
        key,
        (arr) =>
          (arr as unknown as T[]).map((x: T) =>
            (x as unknown as { id: string }).id === id
              ? (Object.assign({}, x as object, patch, { updated_at: now() }) as T)
              : x,
          ) as AppData[K],
      );
    },
    delete: (id: string) => {
      mutate(
        key,
        (arr) => (arr as unknown as T[]).filter((x: T) => (x as unknown as { id: string }).id !== id) as AppData[K],
      );
    },
  });

  const clientesCrud = makeCrud("clientes");
  const profesionalesCrud = makeCrud("profesionales");
  const pmInternosCrud = makeCrud("pm_internos");
  const proyectosCrud = makeCrud("proyectos");
  /** Consumo real solo desde RegistroHora; nunca desde patch de formulario u otros callers. */
  const stripConsumoDelPatch = (patch: Partial<Entregable>): Partial<Entregable> => {
    const { hrs_gastadas: _hg, uf_consumidas: _uc, ...rest } = patch;
    return rest;
  };

  /** Tras cualquier patch, hrs_gastadas / uf_consumidas se recalculan desde RegistroHora. */
  const updateEntregable = useCallback((id: string, patch: Partial<Entregable>) => {
    setData((prev) => {
      const safePatch = stripConsumoDelPatch(patch);
      const patchKeys = Object.keys(safePatch);
      const soloNota =
        patchKeys.length > 0 &&
        patchKeys.every((k) => k === "nota_seguimiento" || k === "nota_seguimiento_updated_at");
      const ts = now();
      const today = ts.slice(0, 10);
      const merged = prev.entregables.map((x) => {
        if (x.id !== id) return x;
        const next = {
          ...x,
          ...safePatch,
          presupuesto_categoria_definido: soloNota ? x.presupuesto_categoria_definido : true,
          updated_at: ts,
        } as Entregable;

        const estado = String(next.estado ?? "").toUpperCase();
        const completado = estado === "COMPLETADO" || (Number(next.avance_real) || 0) >= 1;
        if (completado) {
          if (!next.fecha_completado || String(next.fecha_completado).trim() === "") {
            next.fecha_completado = today;
          }
        } else {
          // Preferencia: si deja de estar completado, limpiar fecha_completado.
          next.fecha_completado = null;
        }
        return next;
      });
      const updatedRow = merged.find((x) => x.id === id);
      const asignaciones_horas = updatedRow
        ? prev.asignaciones_horas.map((a) =>
            a.entregable_id === id
              ? normalizeAsignacionHoraRow(
                  { ...a, proyecto_id: updatedRow.proyecto_id, updated_at: ts },
                  merged,
                )
              : a,
          )
        : prev.asignaciones_horas;
      const entregables = recomputarConsumoEnEntregables(
        merged,
        prev.registro_horas,
        prev.proyectos,
        prev.profesionales,
      );
      return { ...prev, entregables, asignaciones_horas };
    });
  }, []);

  const addEntregable = useCallback(
    (item: Omit<Entregable, "id" | "created_at" | "updated_at" | "presupuesto_categoria_definido">) => {
    setData((prev) => {
      const { hrs_gastadas: _hg, uf_consumidas: _uc, ...rest } = item;
      const full: Entregable = {
        ...rest,
        presupuesto_categoria_definido: true,
        hrs_gastadas: 0,
        uf_consumidas: 0,
        id: uid(),
        created_at: now(),
        updated_at: now(),
      };
      const nextEnts = [...prev.entregables, full];
      const entregables = recomputarConsumoEnEntregables(
        nextEnts,
        prev.registro_horas,
        prev.proyectos,
        prev.profesionales,
      );
      return { ...prev, entregables };
    });
  },
  [],
);

  const pipelineCrud = makeCrud("pipeline");
  const cargaMensualCrud = makeCrud("carga_mensual");

  const addCurvaObjetivoAnual = useCallback(
    (input: {
      anio: number;
      nombre: string;
      descripcion: string;
      horas_maximas_mensuales_por_profesional: number;
      profesionales_base: number;
    }) => {
      let err: string | null = null;
      setData((prev) => {
        if (prev.curvas_objetivo_anual.some((c) => c.anio === input.anio)) {
          err = `Ya existe una curva objetivo para el año ${input.anio}.`;
          return prev;
        }
        const id = uid();
        const ts = now();
        const meses = crearMesesInicialesCurva(
          input.anio,
          id,
          input.profesionales_base,
          input.horas_maximas_mensuales_por_profesional,
          ts,
          uid,
        );
        const full: CurvaObjetivoAnual = {
          id,
          anio: input.anio,
          nombre: input.nombre.trim(),
          descripcion: (input.descripcion ?? "").trim(),
          horas_maximas_mensuales_por_profesional: input.horas_maximas_mensuales_por_profesional,
          meses,
          created_at: ts,
          updated_at: ts,
        };
        return { ...prev, curvas_objetivo_anual: [...prev.curvas_objetivo_anual, full] };
      });
      return err ? ({ ok: false as const, error: err }) : ({ ok: true as const });
    },
    [],
  );

  const updateCurvaObjetivoAnual = useCallback(
    (
      id: string,
      patch: Partial<{
        nombre: string;
        descripcion: string;
        horas_maximas_mensuales_por_profesional: number;
        meses: CurvaObjetivoMes[];
      }>,
    ) => {
      setData((prev) => {
        const idx = prev.curvas_objetivo_anual.findIndex((c) => c.id === id);
        if (idx === -1) return prev;
        const cur = prev.curvas_objetivo_anual[idx]!;
        const merged: CurvaObjetivoAnual = {
          ...cur,
          ...patch,
          meses: patch.meses !== undefined ? patch.meses : cur.meses,
          updated_at: now(),
        };
        const fixed = refrescarFechasYObjetivos(merged, now());
        const list = [...prev.curvas_objetivo_anual];
        list[idx] = fixed;
        return { ...prev, curvas_objetivo_anual: list };
      });
    },
    [],
  );

  const deleteCurvaObjetivoAnual = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      curvas_objetivo_anual: prev.curvas_objetivo_anual.filter((c) => c.id !== id),
    }));
  }, []);

  const addRegistroHora = useCallback((item: Omit<RegistroHora, "id" | "created_at" | "updated_at">) => {
    setData((prev) => {
      const full: RegistroHora = { ...item, id: uid(), created_at: now(), updated_at: now() };
      const nextRegs = [...prev.registro_horas, full];
      const nextEnts = recomputarConsumoEnEntregables(
        prev.entregables,
        nextRegs,
        prev.proyectos,
        prev.profesionales,
      );
      return { ...prev, registro_horas: nextRegs, entregables: nextEnts };
    });
  }, []);

  const addRegistroHorasBatch = useCallback((items: Omit<RegistroHora, "id" | "created_at" | "updated_at">[]) => {
    if (items.length === 0) return;
    setData((prev) => {
      const news: RegistroHora[] = items.map((item) => ({
        ...item,
        id: uid(),
        created_at: now(),
        updated_at: now(),
      }));
      const nextRegs = [...prev.registro_horas, ...news];
      const nextEnts = recomputarConsumoEnEntregables(
        prev.entregables,
        nextRegs,
        prev.proyectos,
        prev.profesionales,
      );
      return { ...prev, registro_horas: nextRegs, entregables: nextEnts };
    });
  }, []);

  const updateRegistroHora = useCallback((id: string, patch: Partial<RegistroHora>) => {
    setData((prev) => {
      const nextRegs = prev.registro_horas.map((x) =>
        x.id === id ? { ...x, ...patch, updated_at: now() } : x,
      );
      const nextEnts = recomputarConsumoEnEntregables(
        prev.entregables,
        nextRegs,
        prev.proyectos,
        prev.profesionales,
      );
      return { ...prev, registro_horas: nextRegs, entregables: nextEnts };
    });
  }, []);

  const deleteRegistroHora = useCallback((id: string) => {
    setData((prev) => {
      const nextRegs = prev.registro_horas.filter((x) => x.id !== id);
      const nextEnts = recomputarConsumoEnEntregables(
        prev.entregables,
        nextRegs,
        prev.proyectos,
        prev.profesionales,
      );
      return { ...prev, registro_horas: nextRegs, entregables: nextEnts };
    });
  }, []);

  const updateProyecto = useCallback((id: string, patch: Partial<Proyecto>) => {
    setData((prev) => {
      const prevP = prev.proyectos.find((p) => p.id === id);
      const recalcularConsumo = proyectoTarifasChanged(prevP, patch);
      const nextProyectos = prev.proyectos.map((x) =>
        x.id === id ? ({ ...x, ...patch, updated_at: now() } as Proyecto) : x,
      );
      const entregables = recalcularConsumo
        ? recomputarConsumoEnEntregables(
            prev.entregables,
            prev.registro_horas,
            nextProyectos,
            prev.profesionales,
          )
        : prev.entregables;
      return { ...prev, proyectos: nextProyectos, entregables };
    });
  }, []);

  const updateProfesional = useCallback((id: string, patch: Partial<Profesional>) => {
    setData((prev) => {
      const prevPr = prev.profesionales.find((p) => p.id === id);
      const recalcularConsumo = profesionalCargoChanged(prevPr, patch);
      const nextProfesionales = prev.profesionales.map((x) =>
        x.id === id ? ({ ...x, ...patch, updated_at: now() } as Profesional) : x,
      );
      const entregables = recalcularConsumo
        ? recomputarConsumoEnEntregables(
            prev.entregables,
            prev.registro_horas,
            prev.proyectos,
            nextProfesionales,
          )
        : prev.entregables;
      return { ...prev, profesionales: nextProfesionales, entregables };
    });
  }, []);

  const deleteEntregable = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      entregables: prev.entregables.filter((x) => x.id !== id),
      asignaciones_horas: prev.asignaciones_horas.filter((a) => a.entregable_id !== id),
      equipo_entregable: (prev.equipo_entregable ?? []).filter((e) => e.entregable_id !== id),
    }));
  }, []);

  const aplicarMigracionEquipoEntregable = useCallback((): ResumenAplicacionMigracionEquipo => {
    let resumen: ResumenAplicacionMigracionEquipo = {
      integrantes_creados: 0,
      integrantes_omitidos_duplicado: 0,
      integrantes_actualizados_rol: 0,
      lideres_creados: 0,
      apoyos_creados: 0,
      conflictos_multiples_lideres: 0,
      conflictos_lider_id_vs_asignaciones: 0,
      duplicados_resueltos_en_preview: 0,
      sugeridos_gasto_no_aplicados: 0,
      observaciones: [],
    };
    setData((prev) => {
      const preview = computePreviewMigracionEquipoEntregable({
        clientes: prev.clientes,
        proyectos: prev.proyectos,
        entregables: prev.entregables,
        profesionales: prev.profesionales,
        asignaciones_horas: prev.asignaciones_horas,
        registro_horas: prev.registro_horas,
      });
      const applied = aplicarMigracionEquipoEntregableDesdePreview(
        prev.equipo_entregable ?? [],
        preview,
        now(),
        uid,
      );
      resumen = applied.resumen;
      return { ...prev, equipo_entregable: applied.equipo };
    });
    return resumen;
  }, []);

  const agregarIntegranteEquipoEntregable = useCallback(
    (input: {
      entregable_id: string;
      profesional_id: string;
      rol_en_entregable: AsignacionHoraRol;
    }): { ok: true; liderAnteriorPasadoApoyo: boolean } | { ok: false; error: string } => {
      const eid = (input.entregable_id ?? "").trim();
      const pid = (input.profesional_id ?? "").trim();
      const rol = input.rol_en_entregable === "LIDER" ? "LIDER" : "APOYO";
      if (!eid || !pid) return { ok: false, error: "Entregable y profesional son obligatorios." };

      let liderAnteriorPasadoApoyo = false;
      let result: { ok: true; liderAnteriorPasadoApoyo: boolean } | { ok: false; error: string } = {
        ok: true,
        liderAnteriorPasadoApoyo: false,
      };

      setData((prev) => {
        const ent = prev.entregables.find((e) => e.id === eid);
        const prof = prev.profesionales.find((p) => p.id === pid);
        if (!ent) {
          result = { ok: false, error: "El entregable no existe." };
          return prev;
        }
        if (!prof) {
          result = { ok: false, error: "El profesional no existe." };
          return prev;
        }
        const duplicado = (prev.equipo_entregable ?? []).some(
          (e) => (e.entregable_id ?? "").trim() === eid && (e.profesional_id ?? "").trim() === pid,
        );
        if (duplicado) {
          result = { ok: false, error: "Este profesional ya está en el equipo del entregable." };
          return prev;
        }

        let equipo = [...(prev.equipo_entregable ?? [])];
        if (rol === "LIDER") {
          const habiaLider = equipo.some(
            (e) => (e.entregable_id ?? "").trim() === eid && e.rol_en_entregable === "LIDER",
          );
          liderAnteriorPasadoApoyo = habiaLider;
          equipo = aplicarReglaUnicoLider(equipo, eid, pid);
        }

        const row: EquipoEntregable = {
          id: uid(),
          entregable_id: eid,
          profesional_id: pid,
          rol_en_entregable: rol,
          origen: "manual",
          created_at: now(),
          updated_at: now(),
        };
        result = { ok: true, liderAnteriorPasadoApoyo };
        return { ...prev, equipo_entregable: [...equipo, row] };
      });
      return result;
    },
    [],
  );

  const cambiarRolIntegranteEquipoEntregable = useCallback(
    (
      equipoId: string,
      rol_en_entregable: AsignacionHoraRol,
    ): { ok: true; liderAnteriorPasadoApoyo: boolean } | { ok: false; error: string } => {
      const rol = rol_en_entregable === "LIDER" ? "LIDER" : "APOYO";
      let liderAnteriorPasadoApoyo = false;
      let result: { ok: true; liderAnteriorPasadoApoyo: boolean } | { ok: false; error: string } = {
        ok: true,
        liderAnteriorPasadoApoyo: false,
      };

      setData((prev) => {
        const row = (prev.equipo_entregable ?? []).find((e) => e.id === equipoId);
        if (!row) {
          result = { ok: false, error: "Integrante no encontrado." };
          return prev;
        }
        const eid = (row.entregable_id ?? "").trim();
        let equipo = [...(prev.equipo_entregable ?? [])];

        if (rol === "LIDER") {
          const habiaOtroLider = equipo.some(
            (e) =>
              (e.entregable_id ?? "").trim() === eid &&
              e.rol_en_entregable === "LIDER" &&
              e.id !== equipoId,
          );
          liderAnteriorPasadoApoyo = habiaOtroLider;
          equipo = aplicarReglaUnicoLider(equipo, eid, row.profesional_id, equipoId);
        }

        equipo = equipo.map((e) =>
          e.id === equipoId ? { ...e, rol_en_entregable: rol, updated_at: now() } : e,
        );
        result = { ok: true, liderAnteriorPasadoApoyo };
        return { ...prev, equipo_entregable: equipo };
      });
      return result;
    },
    [],
  );

  const quitarIntegranteEquipoEntregable = useCallback((equipoId: string) => {
    setData((prev) => ({
      ...prev,
      equipo_entregable: (prev.equipo_entregable ?? []).filter((e) => e.id !== equipoId),
    }));
  }, []);

  const addAsignacionHora = useCallback(
    (
      item: Omit<AsignacionHora, "id" | "created_at" | "updated_at">,
      sobrecupoConfirmacion?: AsignacionHoraSobrecupoConfirmacion | null,
    ) => {
      let result: { ok: true } | { ok: false; error: string } = { ok: true };
      setData((prev) => {
        const ent = prev.entregables.find((e) => e.id === item.entregable_id);
        const prof = prev.profesionales.find((p) => p.id === item.profesional_id);
        if (!ent || !prof) {
          result = { ok: false, error: "Entregable o profesional no encontrado." };
          return prev;
        }
        const h = Number(item.horas_comprometidas);
        const disp = disponibleCategoriaParaAsignaciones(ent, prev.asignaciones_horas, item.categoria);
        const proponeSobrecupo = Number.isFinite(h) && h > disp + 1e-9;

        let opcionesValidacion: { omitirLimiteCupoNuevasAsignaciones?: boolean } | undefined;
        let esSobrecupo = false;
        let comentarioSobrecupo: string | null = null;
        let fechaAutorizacionSobrecupo: string | null = null;

        if (proponeSobrecupo) {
          const auth = sobrecupoConfirmacion;
          if (!auth || auth.rolAutor !== "ADMIN") {
            const { presupuesto, consumidoHistoricoCerrado, asignadoActivo } = desgloseCupoCategoriaEntregable(
              ent,
              prev.asignaciones_horas,
              item.categoria,
            );
            result = {
              ok: false,
              error: `Supera el cupo disponible en ${item.categoria}: ${disp.toFixed(1)} h disponibles (presupuesto ${presupuesto.toFixed(1)} h − consumido hist. cerrado ${consumidoHistoricoCerrado.toFixed(1)} h − asignado ACTIVO ${asignadoActivo.toFixed(1)} h). Solo un administrador puede crear la asignación sobre cupo con confirmación explícita.`,
            };
            return prev;
          }
          const cod = (auth.codigoConfirmacion ?? "").trim();
          const com = (auth.comentario ?? "").trim();
          if (cod !== "SOBRECUPO" || !com) {
            result = {
              ok: false,
              error:
                "Creación sobre cupo: debe ingresar comentario obligatorio y escribir exactamente SOBRECUPO en el campo de confirmación.",
            };
            return prev;
          }
          opcionesValidacion = { omitirLimiteCupoNuevasAsignaciones: true };
          esSobrecupo = true;
          comentarioSobrecupo = com;
          fechaAutorizacionSobrecupo = (auth.fechaAutorizacion ?? "").trim() || now();
        }

        const err = validateNuevaAsignacionHora(
          ent,
          prof,
          {
            entregable_id: item.entregable_id,
            profesional_id: item.profesional_id,
            categoria: item.categoria,
            horas_comprometidas: item.horas_comprometidas,
            estado: item.estado,
          },
          prev.asignaciones_horas,
          opcionesValidacion,
        );
        if (err) {
          result = { ok: false, error: err };
          return prev;
        }
        const proyecto_id = (ent?.proyecto_id ?? item.proyecto_id ?? "").trim();
        const row = normalizeAsignacionHoraRow(
          {
            ...item,
            estado: "ACTIVA",
            proyecto_id,
            fecha_cierre: null,
            motivo_cierre: null,
            horas_gastadas_imputadas_al_cierre: null,
            horas_devueltas_presupuesto: null,
            es_sobrecupo: esSobrecupo,
            comentario_sobrecupo: comentarioSobrecupo,
            fecha_autorizacion_sobrecupo: fechaAutorizacionSobrecupo,
            id: uid(),
            created_at: now(),
            updated_at: now(),
          } as AsignacionHora,
          prev.entregables,
        );
        return { ...prev, asignaciones_horas: [...prev.asignaciones_horas, row] };
      });
      return result;
    },
    [],
  );

  const addAsignacionHoraHistoricaCerrada = useCallback(
    (item: {
      entregable_id: string;
      proyecto_id: string;
      profesional_id: string;
      rol_en_entregable: AsignacionHora["rol_en_entregable"];
      categoria: AsignacionHora["categoria"];
      horas_comprometidas: number;
      fecha_inicio_vigencia: string;
      fecha_cierre: string;
      motivo_cierre?: string | null;
    }) => {
      let result: { ok: true } | { ok: false; error: string } = { ok: true };
      setData((prev) => {
        const ent = prev.entregables.find((e) => e.id === item.entregable_id);
        const prof = prev.profesionales.find((p) => p.id === item.profesional_id);
        const err = validateNuevaAsignacionHistoricaCerrada(
          ent,
          prof,
          {
            entregable_id: item.entregable_id,
            profesional_id: item.profesional_id,
            categoria: item.categoria,
            horas_comprometidas: item.horas_comprometidas,
            fecha_inicio_vigencia: item.fecha_inicio_vigencia,
            fecha_cierre: item.fecha_cierre,
          },
          prev.asignaciones_horas,
        );
        if (err) {
          result = { ok: false, error: err };
          return prev;
        }
        const proyecto_id = (ent?.proyecto_id ?? item.proyecto_id ?? "").trim();
        const fecha_cierre = item.fecha_cierre.trim();
        const inicio = item.fecha_inicio_vigencia.trim();
        const motivoRaw =
          item.motivo_cierre != null && String(item.motivo_cierre).trim() !== ""
            ? String(item.motivo_cierre).trim()
            : "Normalización histórica asistida (SIN_ASIGNACION)";
        const gastoBruto = sumaHorasGastadasRealesEnVentana(
          {
            profesional_id: item.profesional_id,
            entregable_id: item.entregable_id,
            fecha_inicio_vigencia: inicio,
          },
          prev.registro_horas,
          prev.entregables,
          prev.proyectos,
          prev.profesionales,
          fecha_cierre,
        );
        const yaImputado = sumaHorasImputadasCierrePreviasProfEntregableCategoria(
          prev.asignaciones_horas,
          item.profesional_id,
          item.entregable_id,
          item.categoria,
        );
        const horasComp = nneg(item.horas_comprometidas);
        const imp = resolverImputacionIncrementalAlCierre({
          gastoBrutoEnVentana: gastoBruto,
          yaImputadoPreviamente: yaImputado,
          horasComprometidas: horasComp,
        });
        const gastadas = imp.horasGastadasImputadasAlCierre;
        const devueltas = horasDevueltasPresupuestoAlCierre(horasComp, gastadas);
        const row = normalizeAsignacionHoraRow(
          {
            id: uid(),
            entregable_id: item.entregable_id,
            proyecto_id,
            profesional_id: item.profesional_id,
            rol_en_entregable: item.rol_en_entregable,
            categoria: item.categoria,
            horas_comprometidas: horasComp,
            estado: "CERRADA",
            fecha_inicio_vigencia: inicio,
            fecha_cierre,
            motivo_cierre: motivoRaw,
            horas_gastadas_imputadas_al_cierre: gastadas,
            horas_devueltas_presupuesto: devueltas,
            created_at: now(),
            updated_at: now(),
          } as AsignacionHora,
          prev.entregables,
        );
        return { ...prev, asignaciones_horas: [...prev.asignaciones_horas, row] };
      });
      return result;
    },
    [],
  );

  const updateAsignacionHora = useCallback((id: string, patch: Partial<AsignacionHora>) => {
    let result: { ok: true } | { ok: false; error: string } = { ok: true };
    setData((prev) => {
      const cur = prev.asignaciones_horas.find((a) => a.id === id);
      if (!cur) {
        result = { ok: false, error: "Asignación no encontrada." };
        return prev;
      }
      const allowed: Partial<AsignacionHora> = {};
      if (patch.horas_comprometidas !== undefined) allowed.horas_comprometidas = patch.horas_comprometidas;
      if (patch.rol_en_entregable !== undefined) allowed.rol_en_entregable = patch.rol_en_entregable;
      const patchKeys = Object.keys(patch).filter((k) => patch[k as keyof AsignacionHora] !== undefined);
      const allowedKeys = new Set(["horas_comprometidas", "rol_en_entregable"]);
      const illegal = patchKeys.some((k) => !allowedKeys.has(k));
      if (illegal) {
        result = { ok: false, error: "Solo se pueden editar horas comprometidas y rol en esta versión." };
        return prev;
      }
      if (Object.keys(allowed).length === 0) {
        return prev;
      }
      const nuevasHoras =
        allowed.horas_comprometidas !== undefined ? allowed.horas_comprometidas : cur.horas_comprometidas;
      const ent = prev.entregables.find((e) => e.id === cur.entregable_id);
      const prof = prev.profesionales.find((p) => p.id === cur.profesional_id);
      const err = validateUpdateHorasAsignacionActiva(
        ent,
        prof,
        cur,
        nuevasHoras,
        prev.asignaciones_horas,
        prev.registro_horas,
        prev.entregables,
        prev.proyectos,
        prev.profesionales,
        fechaHoyIsoLocal(),
      );
      if (err) {
        result = { ok: false, error: err };
        return prev;
      }
      const merged = { ...cur, ...allowed, updated_at: now() } as AsignacionHora;
      const asignaciones_horas = prev.asignaciones_horas.map((x) =>
        x.id === id ? normalizeAsignacionHoraRow(merged, prev.entregables) : x,
      );
      return { ...prev, asignaciones_horas };
    });
    return result;
  }, []);

  const cerrarAsignacionHora = useCallback(
    (id: string, input: { fecha_cierre: string; motivo_cierre?: string | null }) => {
      let result: { ok: true } | { ok: false; error: string } = { ok: true };
      setData((prev) => {
        const cur = prev.asignaciones_horas.find((a) => a.id === id);
        const err = validateCierreAsignacionActiva(cur, input.fecha_cierre);
        if (err) {
          result = { ok: false, error: err };
          return prev;
        }
        const fc = input.fecha_cierre.trim();
        const gastoBruto = sumaHorasGastadasRealesEnVentana(
          cur!,
          prev.registro_horas,
          prev.entregables,
          prev.proyectos,
          prev.profesionales,
          fc,
        );
        const yaImputado = sumaHorasImputadasCierrePreviasProfEntregableCategoria(
          prev.asignaciones_horas,
          cur!.profesional_id,
          cur!.entregable_id,
          cur!.categoria,
          cur!.id,
        );
        const imp = resolverImputacionIncrementalAlCierre({
          gastoBrutoEnVentana: gastoBruto,
          yaImputadoPreviamente: yaImputado,
          horasComprometidas: cur!.horas_comprometidas,
        });
        const gastadas = imp.horasGastadasImputadasAlCierre;
        const devueltas = horasDevueltasPresupuestoAlCierre(cur!.horas_comprometidas, gastadas);
        const motivo =
          input.motivo_cierre != null && String(input.motivo_cierre).trim() !== ""
            ? String(input.motivo_cierre).trim()
            : null;
        const merged = {
          ...cur!,
          estado: "CERRADA" as const,
          fecha_cierre: fc,
          motivo_cierre: motivo,
          horas_gastadas_imputadas_al_cierre: gastadas,
          horas_devueltas_presupuesto: devueltas,
          updated_at: now(),
        } as AsignacionHora;
        const asignaciones_horas = prev.asignaciones_horas.map((x) =>
          x.id === id ? normalizeAsignacionHoraRow(merged, prev.entregables) : x,
        );
        return { ...prev, asignaciones_horas };
      });
      return result;
    },
    [],
  );

  const repararImputacionesCierreAsignaciones = useCallback(
    (items: { id: string; horas_gastadas_imputadas_al_cierre: number }[]) => {
      let result: { ok: true } | { ok: false; error: string } = { ok: true };
      if (!items.length) {
        result = { ok: false, error: "No hay asignaciones seleccionadas." };
        return result;
      }
      setData((prev) => {
        for (const item of items) {
          const cur = prev.asignaciones_horas.find((a) => a.id === item.id);
          if (!cur) {
            result = { ok: false, error: `Asignación no encontrada: ${item.id}` };
            return prev;
          }
          if (cur.estado !== "CERRADA") {
            result = { ok: false, error: "Solo se pueden reparar asignaciones cerradas." };
            return prev;
          }
          const nueva = Number(item.horas_gastadas_imputadas_al_cierre);
          if (!Number.isFinite(nueva) || nueva < 0) {
            result = { ok: false, error: "Valor de imputación inválido." };
            return prev;
          }
        }

        const map = new Map(
          items.map((i) => [i.id, Number(i.horas_gastadas_imputadas_al_cierre)] as const),
        );
        const asignaciones_horas = prev.asignaciones_horas.map((a) => {
          const nuevaImput = map.get(a.id);
          if (nuevaImput === undefined) return a;
          const devueltas = horasDevueltasPresupuestoAlCierre(a.horas_comprometidas, nuevaImput);
          const merged = {
            ...a,
            horas_gastadas_imputadas_al_cierre: nuevaImput,
            horas_devueltas_presupuesto: devueltas,
            updated_at: now(),
          } as AsignacionHora;
          return normalizeAsignacionHoraRow(merged, prev.entregables);
        });
        return { ...prev, asignaciones_horas };
      });
      return result;
    },
    [],
  );

  const deleteAsignacionHora = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      asignaciones_horas: prev.asignaciones_horas.filter((a) => a.id !== id),
    }));
  }, []);

  const upsertEvaluacionDesempenoProfesional = useCallback(
    (
      profesionalId: string,
      input: {
        objetivos: { id?: string; objetivo: string; evaluacion: string; estado?: string | null }[];
        comentario_general?: string | null;
      },
    ) => {
      const pid = profesionalId.trim();
      if (!pid) return;
      const ts = now();
      const fechaIso = ts.slice(0, 10);
      const objetivosNormalizados: ObjetivoDesempenoProfesional[] = input.objetivos.map((o) => ({
        id: o.id != null && String(o.id).trim() !== "" ? String(o.id).trim() : uid(),
        objetivo: String(o.objetivo ?? ""),
        evaluacion: String(o.evaluacion ?? ""),
        estado:
          o.estado != null && String(o.estado).trim() !== "" ? String(o.estado).trim() : null,
      }));
      setData((prev) => {
        const idx = prev.evaluaciones_desempeno_profesional.findIndex((e) => e.profesional_id === pid);
        const existing = idx >= 0 ? prev.evaluaciones_desempeno_profesional[idx] : null;
        const row: EvaluacionDesempenoProfesional = {
          id: existing?.id ?? uid(),
          profesional_id: pid,
          fecha: fechaIso,
          updated_at: ts,
          objetivos: objetivosNormalizados,
          comentario_general:
            input.comentario_general != null && String(input.comentario_general).trim() !== ""
              ? String(input.comentario_general).trim()
              : null,
        };
        const arr = [...prev.evaluaciones_desempeno_profesional];
        if (idx >= 0) arr[idx] = row;
        else arr.push(row);
        return { ...prev, evaluaciones_desempeno_profesional: arr };
      });
    },
    [],
  );

  const marcarAlertaRevisada = useCallback(
    (payload: {
      tipo_alerta: TipoAlertaOperativa;
      clave_alerta: string;
      proyecto_id: string;
      entregable_id: string;
      profesional_id: string | null;
      categoria: AsignacionHoraCategoria | null;
      motivo_revision: string;
      comentario: string;
      estado: EstadoAlertaRevisada;
      revisado_por: string;
    }) => {
      const clave = payload.clave_alerta.trim();
      if (!clave) return;
      const com = payload.comentario.trim();
      if (!com) return;
      const ts = now();
      const fechaIso = ts.slice(0, 10);
      setData((prev) => {
        const rows = [...(prev.alertas_revisadas ?? [])];
        const ix = rows.findIndex((r) => r.clave_alerta === clave);
        const row: AlertaRevisada = {
          id: ix >= 0 ? rows[ix]!.id : uid(),
          tipo_alerta: payload.tipo_alerta,
          clave_alerta: clave,
          proyecto_id: payload.proyecto_id.trim(),
          entregable_id: payload.entregable_id.trim(),
          profesional_id: payload.profesional_id?.trim() ? payload.profesional_id.trim() : null,
          categoria: payload.categoria,
          motivo_revision: payload.motivo_revision.trim(),
          comentario: com,
          fecha_revision: fechaIso,
          revisado_por: payload.revisado_por.trim() || "—",
          estado: payload.estado,
          created_at: ix >= 0 ? rows[ix]!.created_at : ts,
          updated_at: ts,
        };
        if (ix >= 0) rows[ix] = row;
        else rows.push(row);
        return { ...prev, alertas_revisadas: rows };
      });
    },
    [],
  );

  const ejecutarRedistribucionHorasEntregable = useCallback(
    (input: { entregableId: string; horasNuevas: HorasPorCategoria; comentario: string }) => {
      let result: { ok: true } | { ok: false; errors: string[] } = { ok: true };
      setData((prev) => {
        const ent = prev.entregables.find((e) => e.id === input.entregableId);
        const pr = ent ? prev.proyectos.find((p) => p.id === ent.proyecto_id) : undefined;
        if (!ent || !pr) {
          result = { ok: false, errors: ["Entregable o proyecto no encontrado."] };
          return prev;
        }
        const tr = tarifasDesdeProyecto(pr);
        if (!tr.ok) {
          result = { ok: false, errors: [tr.error] };
          return prev;
        }
        const fecha = fechaHoyIsoLocal();
        const lineas = construirLineasRedistribucion(
          ent,
          prev.asignaciones_horas,
          prev.registro_horas,
          prev.entregables,
          prev.proyectos,
          prev.profesionales,
          fecha,
        );
        const horasAct = horasEntregableARecord(ent);
        const errs = validarRedistribucionHoras(horasAct, input.horasNuevas, lineas, tr.tarifas, input.comentario, {
          exigirMultiploMediaHora: false,
        });
        if (errs.length) {
          result = { ok: false, errors: errs };
          return prev;
        }
        const merged = prev.entregables.map((x) =>
          x.id === ent.id
            ? ({
                ...x,
                hrs_l2: input.horasNuevas.L2,
                hrs_p4: input.horasNuevas.P4,
                hrs_p3: input.horasNuevas.P3,
                hrs_p2: input.horasNuevas.P2,
                presupuesto_categoria_definido: true,
                updated_at: now(),
              } as Entregable)
            : x,
        );
        const updatedRow = merged.find((x) => x.id === ent.id);
        const asignaciones_horas = updatedRow
          ? prev.asignaciones_horas.map((a) =>
              a.entregable_id === ent.id
                ? normalizeAsignacionHoraRow(
                    { ...a, proyecto_id: updatedRow.proyecto_id, updated_at: now() },
                    merged,
                  )
                : a,
            )
          : prev.asignaciones_horas;
        const entregables = recomputarConsumoEnEntregables(
          merged,
          prev.registro_horas,
          prev.proyectos,
          prev.profesionales,
        );
        const hist = construirHistorialRedistribucion(
          uid(),
          ent,
          horasAct,
          input.horasNuevas,
          tr.tarifas,
          input.comentario,
          fecha,
          now(),
        );
        return {
          ...prev,
          entregables,
          asignaciones_horas,
          historial_redistribuciones_horas: [...prev.historial_redistribuciones_horas, hist],
        };
      });
      return result;
    },
    [],
  );

  /**
   * Elimina proyectos y entregables/asignaciones/historial de redistribución asociados.
   * No elimina nunca `registro_horas`. Si existe cualquier registro vinculado (proyecto o entregable del lote), no altera el estado.
   */
  const deleteProyectosCascade = useCallback((ids: string[]) => {
    const idSet = new Set(ids.map((x) => String(x).trim()).filter(Boolean));
    if (idSet.size === 0) return;
    setData((prev) => {
      const { bloqueado } = analizarBloqueoEliminacionProyectos(
        [...idSet],
        prev.entregables,
        prev.registro_horas,
        prev.proyectos,
      );
      if (bloqueado) return prev;

      const proyectos = prev.proyectos.filter((p) => !idSet.has(p.id));

      const entregablesEliminar = prev.entregables.filter((e) => idSet.has(e.proyecto_id));
      const entSet = new Set(entregablesEliminar.map((e) => e.id));
      const entregables = prev.entregables.filter((e) => !entSet.has(e.id));

      const asignaciones_horas = prev.asignaciones_horas.filter((a) => !entSet.has(a.entregable_id) && !idSet.has(a.proyecto_id));

      const equipo_entregable = (prev.equipo_entregable ?? []).filter((e) => !entSet.has(e.entregable_id));

      const historial_redistribuciones_horas = (prev.historial_redistribuciones_horas ?? []).filter(
        (h) => !idSet.has(h.proyecto_id) && !entSet.has(h.entregable_id),
      );

      return { ...prev, proyectos, entregables, asignaciones_horas, equipo_entregable, historial_redistribuciones_horas };
    });
  }, []);

  const value: AppDataContextValue = {
    ...data,
    addCliente: clientesCrud.add,
    updateCliente: clientesCrud.update,
    deleteCliente: clientesCrud.delete,
    addProfesional: profesionalesCrud.add,
    updateProfesional,
    deleteProfesional: profesionalesCrud.delete,
    addPmInterno: pmInternosCrud.add,
    updatePmInterno: pmInternosCrud.update,
    deletePmInterno: pmInternosCrud.delete,
    addProyecto: proyectosCrud.add,
    updateProyecto,
    deleteProyecto: proyectosCrud.delete,
    deleteProyectosCascade,
    addEntregable,
    updateEntregable,
    deleteEntregable,
    addRegistroHora,
    addRegistroHorasBatch,
    updateRegistroHora,
    deleteRegistroHora,
    addAsignacionHora,
    addAsignacionHoraHistoricaCerrada,
    updateAsignacionHora,
    cerrarAsignacionHora,
    repararImputacionesCierreAsignaciones,
    deleteAsignacionHora,
    aplicarMigracionEquipoEntregable,
    agregarIntegranteEquipoEntregable,
    cambiarRolIntegranteEquipoEntregable,
    quitarIntegranteEquipoEntregable,
    addPipeline: pipelineCrud.add,
    updatePipeline: pipelineCrud.update,
    deletePipeline: pipelineCrud.delete,
    addCargaMensual: cargaMensualCrud.add,
    updateCargaMensual: cargaMensualCrud.update,
    deleteCargaMensual: cargaMensualCrud.delete,
    addCurvaObjetivoAnual,
    updateCurvaObjetivoAnual,
    deleteCurvaObjetivoAnual,
    ejecutarRedistribucionHorasEntregable,
    upsertEvaluacionDesempenoProfesional,
    marcarAlertaRevisada,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export type { HistorialRedistribucionHoras, HorasPorCategoria } from "@/entregables/redistribucionHorasEntregable";
export type { ResumenAplicacionMigracionEquipo } from "@/equipo/aplicarMigracionEquipoEntregable";

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
