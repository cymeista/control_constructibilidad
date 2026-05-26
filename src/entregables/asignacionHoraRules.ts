/**
 * Bloque 1 — Reglas operativas de asignación de horas (sin imputación temporal ni cierre funcional).
 */

import type {
  AsignacionHora,
  AsignacionHoraCategoria,
  Entregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import { sumaGastoActivoActualPorCategoria, sumaGastoRealDirectoValidoProfesionalEntregable } from "@/entregables/asignacionHoraConsumo";
import { sumaHorasComprometidasActivasYCerradasProfEntregableCategoria } from "@/entregables/asignacionAlertasBloque4Formularios";

/** Estados del entregable para los que no se gestionan asignaciones en esta vista (sin nuevo campo operativo). */
const ESTADO_ENTREGABLE_EXCLUYE_ASIGNACIONES = new Set<string>([
  "NO_INICIADO",
  "COMPLETADO",
  "No Iniciado",
  "Completado",
]);

/** Entregables en los que tiene sentido operar asignaciones (excluye No iniciado y Completado, todas las variantes cargadas). */
export function entregableEstadoPermiteAsignaciones(ent: Entregable): boolean {
  return !ESTADO_ENTREGABLE_EXCLUYE_ASIGNACIONES.has(String(ent.estado));
}

/** Completado (variantes de maestro / datos importados). Solo UI / filtros; no altera validación de guardado. */
export function entregableEstadoEsCompletado(ent: Entregable): boolean {
  const s = String(ent.estado);
  return s === "COMPLETADO" || s === "Completado";
}

/**
 * Bloque 1.1: habilitación por datos reales — las cuatro categorías deben ser números finitos ≥ 0 (0 permitido).
 * No se usa flag artificial; el cupo sale siempre de hrs_l2 / hrs_p4 / hrs_p3 / hrs_p2.
 */
export function entregableTienePresupuestoPorCategoriaNumerico(ent: Entregable): boolean {
  const vals = [ent.hrs_l2, ent.hrs_p4, ent.hrs_p3, ent.hrs_p2];
  return vals.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
}

export function presupuestoCategoriaEntregable(ent: Entregable, cat: AsignacionHoraCategoria): number {
  switch (cat) {
    case "L2":
      return ent.hrs_l2;
    case "P4":
      return ent.hrs_p4;
    case "P3":
      return ent.hrs_p3;
    case "P2":
      return ent.hrs_p2;
    default:
      return 0;
  }
}

export function sumaHorasComprometidasActivasCategoria(
  asignaciones: AsignacionHora[],
  entregableId: string,
  categoria: AsignacionHoraCategoria,
  excludeAsignacionId?: string,
): number {
  return asignaciones
    .filter(
      (a) =>
        a.entregable_id === entregableId &&
        a.categoria === categoria &&
        a.estado === "ACTIVA" &&
        (!excludeAsignacionId || a.id !== excludeAsignacionId),
    )
    .reduce((s, a) => s + a.horas_comprometidas, 0);
}

/**
 * Suma horas ya imputadas al cierre en asignaciones CERRADAS (snapshot al cerrar; control presupuestario).
 */
export function sumaHorasImputadasCierreCerradasCategoria(
  asignaciones: AsignacionHora[],
  entregableId: string,
  categoria: AsignacionHoraCategoria,
): number {
  return asignaciones
    .filter(
      (a) =>
        a.entregable_id === entregableId && a.categoria === categoria && a.estado === "CERRADA",
    )
    .reduce((s, a) => {
      const g = a.horas_gastadas_imputadas_al_cierre;
      const n = g != null && Number.isFinite(Number(g)) ? Number(g) : 0;
      return s + Math.max(0, n);
    }, 0);
}

export type DesgloseCupoCategoria = {
  presupuesto: number;
  consumidoHistoricoCerrado: number;
  asignadoActivo: number;
  disponibleReal: number;
};

/** Presupuesto vs consumido cerrado vs cupo ACTIVO; disponible_real = pres − cerrado − activo (mínimo 0). */
export function desgloseCupoCategoriaEntregable(
  ent: Entregable,
  asignaciones: AsignacionHora[],
  categoria: AsignacionHoraCategoria,
  excludeAsignacionId?: string,
): DesgloseCupoCategoria {
  const presupuesto = presupuestoCategoriaEntregable(ent, categoria);
  const consumidoHistoricoCerrado = sumaHorasImputadasCierreCerradasCategoria(
    asignaciones,
    ent.id,
    categoria,
  );
  const asignadoActivo = sumaHorasComprometidasActivasCategoria(
    asignaciones,
    ent.id,
    categoria,
    excludeAsignacionId,
  );
  const disponibleReal = Math.max(0, presupuesto - consumidoHistoricoCerrado - asignadoActivo);
  return { presupuesto, consumidoHistoricoCerrado, asignadoActivo, disponibleReal };
}

/** Sobreconsumo de categoría vs presupuesto maestro del entregable (solo lectura; no altera cupo ni saldo). */
export function sobreconsumoCategoriaVsPresupuestoEntregable(
  presupuesto: number,
  consumidoHistoricoCerrado: number,
  gastoRealActivo: number,
): number {
  return consumidoHistoricoCerrado + gastoRealActivo - presupuesto;
}

export type CategoriaSobreconsumidaVsPresupuesto = {
  categoria: AsignacionHoraCategoria;
  presupuesto: number;
  consumidoHistoricoCerrado: number;
  gastoRealActivo: number;
  sobreconsumo: number;
};

const CATEGORIAS_ASIGNACION: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];

/**
 * Categorías donde (consumo histórico cerrado + gasto real ACTIVO) supera el presupuesto del entregable.
 * Alerta operativa; no modifica disponibleReal ni validaciones de guardado.
 */
export function listarCategoriasSobreconsumidasVsPresupuestoEntregable(
  ent: Entregable,
  asignaciones: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): CategoriaSobreconsumidaVsPresupuesto[] {
  const out: CategoriaSobreconsumidaVsPresupuesto[] = [];
  for (const cat of CATEGORIAS_ASIGNACION) {
    const d = desgloseCupoCategoriaEntregable(ent, asignaciones, cat);
    const gastoRealActivo = sumaGastoActivoActualPorCategoria(
      ent.id,
      cat,
      asignaciones,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
      fechaHoy,
    );
    const sobreconsumo = sobreconsumoCategoriaVsPresupuestoEntregable(
      d.presupuesto,
      d.consumidoHistoricoCerrado,
      gastoRealActivo,
    );
    if (sobreconsumo > 0) {
      out.push({
        categoria: cat,
        presupuesto: d.presupuesto,
        consumidoHistoricoCerrado: d.consumidoHistoricoCerrado,
        gastoRealActivo,
        sobreconsumo,
      });
    }
  }
  return out;
}

/** Cupo libre para nuevas horas ACTIVAS en la categoría (excluye una fila al editar solo en la parte ACTIVA). */
export function disponibleCategoriaParaAsignaciones(
  ent: Entregable,
  asignaciones: AsignacionHora[],
  categoria: AsignacionHoraCategoria,
  excludeAsignacionId?: string,
): number {
  return desgloseCupoCategoriaEntregable(ent, asignaciones, categoria, excludeAsignacionId).disponibleReal;
}

export type OpcionesValidacionNuevaAsignacionHora = {
  /** Solo tras confirmación ADMIN en UI; no aumenta presupuesto del entregable. */
  omitirLimiteCupoNuevasAsignaciones?: boolean;
};

export function validateNuevaAsignacionHora(
  ent: Entregable | undefined,
  prof: Profesional | undefined,
  input: {
    entregable_id: string;
    profesional_id: string;
    categoria: AsignacionHoraCategoria;
    horas_comprometidas: number;
    estado: AsignacionHora["estado"];
  },
  asignaciones: AsignacionHora[],
  opciones?: OpcionesValidacionNuevaAsignacionHora,
): string | null {
  if (!ent) return "El entregable no existe.";
  if (!entregableTienePresupuestoPorCategoriaNumerico(ent)) {
    return "El entregable no tiene horas presupuestadas por categoría válidas (L2, P4, P3, P2). Cargue esos valores en el entregable.";
  }
  if (!prof) return "El profesional no existe.";
  if (prof.cargo !== input.categoria) {
    return `La categoría debe coincidir con el cargo del profesional (${prof.cargo}).`;
  }
  if (input.estado !== "ACTIVA") return "Solo se pueden crear asignaciones ACTIVAS en esta versión.";
  const duplicada = asignaciones.some(
    (a) =>
      a.entregable_id === input.entregable_id &&
      a.profesional_id === input.profesional_id &&
      a.estado === "ACTIVA",
  );
  if (duplicada) return "Ya existe una asignación ACTIVA para este profesional en este entregable.";
  const h = Number(input.horas_comprometidas);
  if (!Number.isFinite(h) || h <= 0) return "Las horas comprometidas deben ser mayores a 0.";
  const disp = disponibleCategoriaParaAsignaciones(ent, asignaciones, input.categoria);
  if (!opciones?.omitirLimiteCupoNuevasAsignaciones && h > disp) {
    const { presupuesto, consumidoHistoricoCerrado, asignadoActivo } = desgloseCupoCategoriaEntregable(
      ent,
      asignaciones,
      input.categoria,
    );
    return `Supera el cupo disponible en ${input.categoria}: ${disp.toFixed(1)} h disponibles (presupuesto ${presupuesto.toFixed(1)} h − consumido hist. cerrado ${consumidoHistoricoCerrado.toFixed(1)} h − asignado ACTIVO ${asignadoActivo.toFixed(1)} h).`;
  }
  return null;
}

/**
 * Normalización histórica asistida: crea asignación ya CERRADA sin consumir cupo de ACTIVAS.
 * Fase 1: solo filas detector SIN_ASIGNACION (sin asignaciones previas para el par entregable+profesional).
 */
export function validateNuevaAsignacionHistoricaCerrada(
  ent: Entregable | undefined,
  prof: Profesional | undefined,
  input: {
    entregable_id: string;
    profesional_id: string;
    categoria: AsignacionHoraCategoria;
    horas_comprometidas: number;
    fecha_inicio_vigencia: string;
    fecha_cierre: string;
  },
  asignaciones: AsignacionHora[],
): string | null {
  if (!ent) return "El entregable no existe.";
  if (!entregableTienePresupuestoPorCategoriaNumerico(ent)) {
    return "El entregable no tiene horas presupuestadas por categoría válidas (L2, P4, P3, P2). Cargue esos valores en el entregable.";
  }
  if (!prof) return "El profesional no existe.";
  if (prof.cargo !== input.categoria) {
    return `La categoría debe coincidir con el cargo del profesional (${prof.cargo}).`;
  }
  const ini = (input.fecha_inicio_vigencia ?? "").trim();
  const fc = (input.fecha_cierre ?? "").trim();
  if (!ini || !fc) return "Las fechas de inicio y cierre son obligatorias.";
  if (fc < ini) return "La fecha de cierre no puede ser anterior al inicio de vigencia.";
  const h = Number(input.horas_comprometidas);
  if (!Number.isFinite(h) || h <= 0) return "Las horas comprometidas deben ser mayores a 0.";
  const existePar = asignaciones.some(
    (a) => a.entregable_id === input.entregable_id && a.profesional_id === input.profesional_id,
  );
  if (existePar) {
    return "Ya existe una asignación para este profesional en este entregable. Revise o use otro flujo.";
  }
  return null;
}

/** Bloque 3: solo ACTIVA; fecha_cierre obligatoria y coherente con inicio de vigencia. */
export function validateCierreAsignacionActiva(
  row: AsignacionHora | undefined,
  fechaCierreRaw: string,
): string | null {
  if (!row) return "Asignación no encontrada.";
  if (row.estado !== "ACTIVA") return "Solo se pueden cerrar asignaciones ACTIVAS.";
  const fc = (fechaCierreRaw ?? "").trim();
  if (!fc) return "La fecha de cierre es obligatoria.";
  const inicio = (row.fecha_inicio_vigencia ?? "").trim() || "1900-01-01";
  if (fc < inicio) return "La fecha de cierre no puede ser anterior al inicio de vigencia.";
  return null;
}

export function validateUpdateHorasAsignacionActiva(
  ent: Entregable | undefined,
  prof: Profesional | undefined,
  row: AsignacionHora,
  nuevasHoras: number,
  asignaciones: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  _fechaHoy: string,
): string | null {
  if (row.estado !== "ACTIVA") return "Solo se pueden editar asignaciones ACTIVAS.";
  if (!ent) return "El entregable no existe.";
  if (!entregableTienePresupuestoPorCategoriaNumerico(ent)) {
    return "El entregable no tiene horas presupuestadas por categoría válidas (L2, P4, P3, P2).";
  }
  if (!prof) return "El profesional no existe.";
  if (prof.cargo !== row.categoria) {
    return "La categoría de la asignación no coincide con el cargo actual del profesional.";
  }
  const h = Number(nuevasHoras);
  if (!Number.isFinite(h) || h <= 0) return "Las horas comprometidas deben ser mayores a 0.";
  const disp = disponibleCategoriaParaAsignaciones(ent, asignaciones, row.categoria, row.id);
  if (h > disp) {
    const { presupuesto, consumidoHistoricoCerrado, asignadoActivo } = desgloseCupoCategoriaEntregable(
      ent,
      asignaciones,
      row.categoria,
      row.id,
    );
    return `Supera el cupo disponible en ${row.categoria}: ${disp.toFixed(1)} h disponibles al editar esta fila (presupuesto ${presupuesto.toFixed(1)} h − consumido hist. cerrado ${consumidoHistoricoCerrado.toFixed(1)} h − otros ACTIVOS ${asignadoActivo.toFixed(1)} h).`;
  }
  const gastoRealTotal = sumaGastoRealDirectoValidoProfesionalEntregable(
    row.profesional_id,
    row.entregable_id,
    registro_horas,
    entregables,
    proyectos,
    profesionales,
  );
  const horasOtrasFilas = sumaHorasComprometidasActivasYCerradasProfEntregableCategoria(
    asignaciones,
    row.profesional_id,
    row.entregable_id,
    row.categoria,
    row.id,
  );
  const minHorasEnEstaFila = gastoRealTotal - horasOtrasFilas;
  if (minHorasEnEstaFila > 1e-9 && h + 1e-9 < minHorasEnEstaFila) {
    return `No puede reducir por debajo de ${minHorasEnEstaFila.toFixed(1)} h: el gasto real DIRECTO válido total en el entregable es ${gastoRealTotal.toFixed(1)} h y en otras asignaciones ACTIVA/CERRADA del mismo triple hay ${horasOtrasFilas.toFixed(1)} h comprometidas.`;
  }
  return null;
}
