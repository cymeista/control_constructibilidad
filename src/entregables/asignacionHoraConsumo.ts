/**
 * Bloque 2: lectura de gasto real (RegistroHora) por asignación, sin modificar registros ni consumo global.
 */

import type {
  AsignacionHora,
  AsignacionHoraCategoria,
  Entregable,
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

/** Fecha local YYYY-MM-DD (ventana superior “hoy” alineada al calendario del usuario). */
export function fechaHoyIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function registroToConsumoInput(r: RegistroHora): RegistroHoraConsumoInput {
  return {
    tipo_hora: r.tipo_hora,
    proyecto_id: r.proyecto_id,
    entregable_id: r.entregable_id,
    profesional_id: r.profesional_id,
    horas: r.horas,
  };
}

/** Mapas para validar consumo real (RegistroHora DIRECTA); reutilizable en lecturas Bloque 4. */
export function buildConsumoMaps(
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): {
  entById: Map<string, EntregableConsumoTarget>;
  projById: Map<string, ProyectoTarifasInput>;
  profById: Map<string, ProfesionalCargoInput>;
} {
  const entTargets: EntregableConsumoTarget[] = entregables.map((e) => ({
    id: e.id,
    proyecto_id: e.proyecto_id,
  }));
  const projInputs: ProyectoTarifasInput[] = proyectos.map((p) => ({
    id: p.id,
    tarifa_l2: p.tarifa_l2,
    tarifa_p4: p.tarifa_p4,
    tarifa_p3: p.tarifa_p3,
    tarifa_p2: p.tarifa_p2,
  }));
  const profInputs: ProfesionalCargoInput[] = profesionales.map((p) => ({
    id: p.id,
    cargo: p.cargo,
  }));
  return {
    entById: new Map(entTargets.map((e) => [e.id, e])),
    projById: new Map(projInputs.map((p) => [p.id, p])),
    profById: new Map(profInputs.map((p) => [p.id, p])),
  };
}

/**
 * Suma horas DIRECTA válidas (misma regla que consumo real) del mismo profesional y entregable,
 * con fecha_inicio_vigencia <= fecha_registro <= fechaFinInclusive (ISO).
 * Bloque 3: fechaFinInclusive = fecha_cierre. Bloque 2 vigente: fechaFinInclusive = hoy.
 */
export function sumaHorasGastadasRealesEnVentana(
  asignacion: Pick<AsignacionHora, "profesional_id" | "entregable_id" | "fecha_inicio_vigencia">,
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaFinInclusive: string,
): number {
  const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);

  const eidAsig = (asignacion.entregable_id ?? "").trim();
  const pidAsig = (asignacion.profesional_id ?? "").trim();
  const inicioVig = (asignacion.fecha_inicio_vigencia ?? "").trim() || "1900-01-01";
  const fin = (fechaFinInclusive ?? "").trim();
  if (!fin) return 0;

  let sum = 0;
  for (const r of registro_horas) {
    if ((r.profesional_id ?? "").trim() !== pidAsig) continue;
    if ((r.entregable_id ?? "").trim() !== eidAsig) continue;

    const f = (r.fecha ?? "").trim();
    if (!f || f < inicioVig || f > fin) continue;

    const input = registroToConsumoInput(r);
    if (!esRegistroConsumoRealValido(input, entById, projById, profById)) continue;

    sum += Number(r.horas);
  }

  return sum;
}

/**
 * Suma todas las horas DIRECTA válidas del profesional en el entregable (sin filtro de fechas).
 * Techo físico de RegistroHora para auditoría / comparación con imputaciones cerradas.
 */
export function sumaGastoRealDirectoValidoProfesionalEntregable(
  profesionalId: string,
  entregableId: string,
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): number {
  const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);
  const eidAsig = (entregableId ?? "").trim();
  const pidAsig = (profesionalId ?? "").trim();
  if (!eidAsig || !pidAsig) return 0;

  let sum = 0;
  for (const r of registro_horas) {
    if ((r.profesional_id ?? "").trim() !== pidAsig) continue;
    if ((r.entregable_id ?? "").trim() !== eidAsig) continue;

    const input = registroToConsumoInput(r);
    if (!esRegistroConsumoRealValido(input, entById, projById, profById)) continue;

    sum += Number(r.horas);
  }

  return sum;
}

/**
 * Suma `horas_gastadas_imputadas_al_cierre` de otras asignaciones CERRADAS mismo prof + entregable + categoría.
 * Si `excludeAsignacionId` está definido y no vacío, excluye esa fila (cierre de una ACTIVA existente).
 */
export function sumaHorasImputadasCierrePreviasProfEntregableCategoria(
  asignaciones: AsignacionHora[],
  profesionalId: string,
  entregableId: string,
  categoria: AsignacionHoraCategoria,
  excludeAsignacionId?: string,
): number {
  const pid = (profesionalId ?? "").trim();
  const eid = (entregableId ?? "").trim();
  const ex = (excludeAsignacionId ?? "").trim();

  return asignaciones
    .filter(
      (a) =>
        a.estado === "CERRADA" &&
        (a.profesional_id ?? "").trim() === pid &&
        (a.entregable_id ?? "").trim() === eid &&
        a.categoria === categoria &&
        (!ex || a.id !== ex),
    )
    .reduce((s, a) => {
      const g = a.horas_gastadas_imputadas_al_cierre;
      const n = g != null && Number.isFinite(Number(g)) ? Number(g) : 0;
      return s + Math.max(0, n);
    }, 0);
}

export type ResultadoImputacionIncrementalAlCierre = {
  gastoBrutoEnVentana: number;
  yaImputadoPreviamente: number;
  gastoIncremental: number;
  horasGastadasImputadasAlCierre: number;
  excesoOperativoSobreCompromiso: number;
};

/**
 * Imputación presupuestaria al cierre: incremental respecto a cierres previos del mismo par+categoría,
 * acotada a horas comprometidas (no imputar más cupo histórico que el compromiso).
 */
export function resolverImputacionIncrementalAlCierre(params: {
  gastoBrutoEnVentana: number;
  yaImputadoPreviamente: number;
  horasComprometidas: number;
}): ResultadoImputacionIncrementalAlCierre {
  const gross = Math.max(0, Number(params.gastoBrutoEnVentana) || 0);
  const prev = Math.max(0, Number(params.yaImputadoPreviamente) || 0);
  const comprom = Math.max(0, Number(params.horasComprometidas) || 0);
  const incremental = Math.max(0, gross - prev);
  const imputadas = Math.min(incremental, comprom);
  const exceso = Math.max(0, incremental - comprom);
  return {
    gastoBrutoEnVentana: gross,
    yaImputadoPreviamente: prev,
    gastoIncremental: incremental,
    horasGastadasImputadasAlCierre: imputadas,
    excesoOperativoSobreCompromiso: exceso,
  };
}

/**
 * ¿La fecha del registro cae en la ventana [inicio_vigencia, fecha_cierre] de alguna asignación CERRADA
 * del mismo profesional + entregable + categoría?
 * Nota: el gasto activo neto (Bloque 2) ya no excluye el registro entero con esta regla; usa descuento
 * cuantitativo por `sumaHorasImputadasCierreCerradasSolapadasVentanaActiva`. Se mantiene exportada por si
 * hace falta auditoría puntual por fecha.
 */
export function fechaRegistroCubiertaPorAsignacionCerrada(
  fechaRegistroIso: string,
  asignacionesTodas: AsignacionHora[],
  profesionalId: string,
  entregableId: string,
  categoria: AsignacionHoraCategoria,
): boolean {
  const f = (fechaRegistroIso ?? "").trim();
  if (!f) return false;
  const pid = (profesionalId ?? "").trim();
  const eid = (entregableId ?? "").trim();
  if (!pid || !eid) return false;

  for (const a of asignacionesTodas) {
    if (a.estado !== "CERRADA") continue;
    if ((a.profesional_id ?? "").trim() !== pid) continue;
    if ((a.entregable_id ?? "").trim() !== eid) continue;
    if (a.categoria !== categoria) continue;
    const ini = (a.fecha_inicio_vigencia ?? "").trim() || "1900-01-01";
    const fin = (a.fecha_cierre ?? "").trim();
    if (!fin) continue;
    if (f >= ini && f <= fin) return true;
  }
  return false;
}

/**
 * Intersección no vacía de dos rangos de fecha ISO YYYY-MM-DD (inclusive en ambos extremos).
 */
function ventanasFechaIsoSolapan(
  aIni: string,
  aFin: string,
  bIni: string,
  bFin: string,
): boolean {
  const s = aIni > bIni ? aIni : bIni;
  const e = aFin < bFin ? aFin : bFin;
  return s <= e;
}

/**
 * Suma `horas_gastadas_imputadas_al_cierre` de asignaciones CERRADAS (mismo prof + entregable + categoría)
 * cuya ventana [inicio_vigencia, fecha_cierre] intersecta la ventana activa leída [inicioVigenciaActiva, fechaHoy].
 * Solo cerradas con `fecha_cierre` definida aportan. No altera datos; solo lectura para neto ACTIVO.
 */
export function sumaHorasImputadasCierreCerradasSolapadasVentanaActiva(
  asignaciones: AsignacionHora[],
  profesionalId: string,
  entregableId: string,
  categoria: AsignacionHoraCategoria,
  inicioVigenciaActiva: string,
  fechaHoy: string,
): number {
  const pid = (profesionalId ?? "").trim();
  const eid = (entregableId ?? "").trim();
  const aIni = (inicioVigenciaActiva ?? "").trim() || "1900-01-01";
  const aFin = (fechaHoy ?? "").trim();
  if (!pid || !eid || !aFin) return 0;

  let sum = 0;
  for (const a of asignaciones) {
    if (a.estado !== "CERRADA") continue;
    if ((a.profesional_id ?? "").trim() !== pid) continue;
    if ((a.entregable_id ?? "").trim() !== eid) continue;
    if (a.categoria !== categoria) continue;
    const cIni = (a.fecha_inicio_vigencia ?? "").trim() || "1900-01-01";
    const cFin = (a.fecha_cierre ?? "").trim();
    if (!cFin) continue;
    if (!ventanasFechaIsoSolapan(aIni, aFin, cIni, cFin)) continue;
    const g = a.horas_gastadas_imputadas_al_cierre;
    const n = g != null && Number.isFinite(Number(g)) ? Number(g) : 0;
    sum += Math.max(0, n);
  }
  return sum;
}

/**
 * Gasto DIRECTA válido en ventana activa (inicio_vigencia ACTIVA → hoy), menos la suma de horas ya imputadas
 * al cierre en CERRADAS del mismo prof + entregable + categoría cuya ventana temporal intersecta esa lectura.
 * No excluye filas de RegistroHora por fecha “cubierta” (evita anular 5 h reales por una cerrada de 3,5 h).
 * No modifica RegistroHora.
 */
export function sumaHorasGastadasRealesAsignacionActivaNeta(
  asignacion: AsignacionHora,
  asignacionesTodas: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): number {
  if (asignacion.estado !== "ACTIVA") return 0;
  const inicioVig = (asignacion.fecha_inicio_vigencia ?? "").trim() || "1900-01-01";
  const fin = (fechaHoy ?? "").trim();
  if (!fin) return 0;

  const pidAsig = (asignacion.profesional_id ?? "").trim();
  const eidAsig = (asignacion.entregable_id ?? "").trim();
  const cat = asignacion.categoria;

  const brut = sumaHorasGastadasRealesEnVentana(
    asignacion,
    registro_horas,
    entregables,
    proyectos,
    profesionales,
    fin,
  );

  const imputadoCerradoSolapado = sumaHorasImputadasCierreCerradasSolapadasVentanaActiva(
    asignacionesTodas,
    pidAsig,
    eidAsig,
    cat,
    inicioVig,
    fin,
  );

  return Math.max(0, brut - imputadoCerradoSolapado);
}

/**
 * Bloque 2: gasto activo neto (misma ventana con fin = hoy); solo si la asignación está ACTIVA.
 */
export function sumaHorasGastadasRealesAsignacionBloque2(
  asignacion: AsignacionHora,
  asignacionesTodas: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): number {
  return sumaHorasGastadasRealesAsignacionActivaNeta(
    asignacion,
    asignacionesTodas,
    registro_horas,
    entregables,
    proyectos,
    profesionales,
    fechaHoy,
  );
}

/** horas_devueltas al cierre: sobrante no gastado; 0 si hubo exceso de gasto. */
export function horasDevueltasPresupuestoAlCierre(
  horasComprometidas: number,
  horasGastadasImputadas: number,
): number {
  return Math.max(0, horasComprometidas - horasGastadasImputadas);
}

/** horas_comprometidas - gastadas_reales (puede ser negativo; no recortar). */
export function horasPendientesAsignacionBloque2(
  horasComprometidas: number,
  horasGastadasReales: number,
): number {
  return horasComprometidas - horasGastadasReales;
}

/** Suma gasto real vigente (Bloque 2, ventana hasta fechaHoy) de todas las ACTIVAS de esa categoría en el entregable. */
export function sumaGastoActivoActualPorCategoria(
  entregableId: string,
  categoria: AsignacionHoraCategoria,
  asignaciones: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): number {
  let sum = 0;
  for (const a of asignaciones) {
    if (a.entregable_id !== entregableId || a.categoria !== categoria || a.estado !== "ACTIVA") continue;
    sum += sumaHorasGastadasRealesAsignacionBloque2(
      a,
      asignaciones,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
      fechaHoy,
    );
  }
  return sum;
}

/** Suma (horas_comprometidas − gasto real vigente) por ACTIVA; puede ser negativa (sin recortar). */
export function sumaPendienteActivoPorCategoria(
  entregableId: string,
  categoria: AsignacionHoraCategoria,
  asignaciones: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): number {
  let sum = 0;
  for (const a of asignaciones) {
    if (a.entregable_id !== entregableId || a.categoria !== categoria || a.estado !== "ACTIVA") continue;
    const g = sumaHorasGastadasRealesAsignacionBloque2(
      a,
      asignaciones,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
      fechaHoy,
    );
    sum += horasPendientesAsignacionBloque2(a.horas_comprometidas, g);
  }
  return sum;
}

const EPS_EXCESO = 1e-6;

/** Id sintético para incluir un DIRECTA pendiente en simulaciones (no se persiste). */
const ID_REG_HORA_SIM = "__sim_directa_pendiente__";

export type SimulacionRegistroDirecta = {
  tipo_hora: "DIRECTA" | "INDIRECTA" | "VACACIONES";
  profesional_id: string;
  proyecto_id: string | null;
  entregable_id: string | null;
  fecha: string;
  horas: number;
};

/**
 * Lista de registros lista para Bloque 2, opcionalmente reemplazando el ítem en edición
 * y añadiendo una DIRECTA pendiente (misma regla de validez que al guardar).
 */
export function registroHorasConSimulacionDirecta(
  registro_horas: RegistroHora[],
  editItem: RegistroHora | null | undefined,
  sim: SimulacionRegistroDirecta | null,
): RegistroHora[] {
  const base = editItem ? registro_horas.filter((r) => r.id !== editItem.id) : [...registro_horas];
  if (!sim || sim.tipo_hora !== "DIRECTA") return base;
  const h = Number(sim.horas);
  if (!Number.isFinite(h) || h <= 0) return base;
  const pid = (sim.profesional_id ?? "").trim();
  const eid = (sim.entregable_id ?? "").trim();
  const fecha = (sim.fecha ?? "").trim();
  if (!pid || !eid || !fecha) return base;
  const prid = (sim.proyecto_id ?? "").trim();

  const synthetic: RegistroHora = {
    id: ID_REG_HORA_SIM,
    profesional_id: pid,
    proyecto_id: prid || null,
    entregable_id: eid || null,
    tipo_hora: "DIRECTA",
    fecha,
    horas: h,
    descripcion: null,
    created_at: "",
    updated_at: "",
  };
  return [...base, synthetic];
}

export type ExcesoPorAsignacionActiva = {
  asignacionId: string;
  categoria: AsignacionHoraCategoria;
  comprometidas: number;
  gastadoProyectado: number;
  exceso: number;
};

/**
 * Asignaciones ACTIVAS del mismo profesional + entregable con categoría = cargo del profesional,
 * cuyo gasto real (Bloque 2) **incluyendo** la fila simulada supera `horas_comprometidas`.
 */
export function excesosTrasSimulacionRegistroDirecto(
  registro_horas: RegistroHora[],
  editItem: RegistroHora | null | undefined,
  sim: SimulacionRegistroDirecta | null,
  asignaciones_horas: AsignacionHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): ExcesoPorAsignacionActiva[] {
  if (!sim || sim.tipo_hora !== "DIRECTA") return [];
  const prof = profesionales.find((p) => p.id === (sim.profesional_id ?? "").trim());
  if (!prof) return [];
  const cat = prof.cargo;
  if (cat !== "L2" && cat !== "P4" && cat !== "P3" && cat !== "P2") return [];

  const regs = registroHorasConSimulacionDirecta(registro_horas, editItem, sim);
  const hoy = (fechaHoy ?? "").trim();
  if (!hoy) return [];

  const pid = (sim.profesional_id ?? "").trim();
  const eid = (sim.entregable_id ?? "").trim();
  const out: ExcesoPorAsignacionActiva[] = [];

  for (const a of asignaciones_horas) {
    if (a.estado !== "ACTIVA") continue;
    if ((a.profesional_id ?? "").trim() !== pid) continue;
    if ((a.entregable_id ?? "").trim() !== eid) continue;
    if (a.categoria !== cat) continue;

    const gast = sumaHorasGastadasRealesAsignacionBloque2(a, asignaciones_horas, regs, entregables, proyectos, profesionales, hoy);
    if (gast > a.horas_comprometidas + EPS_EXCESO) {
      out.push({
        asignacionId: a.id,
        categoria: a.categoria,
        comprometidas: a.horas_comprometidas,
        gastadoProyectado: gast,
        exceso: gast - a.horas_comprometidas,
      });
    }
  }
  return out;
}

export type ProfesionalExcedidoEnEntregable = {
  asignacionId: string;
  profesional_id: string;
  nombre: string;
  categoria: AsignacionHoraCategoria;
  comprometidas: number;
  gastado: number;
  exceso: number;
};

/** ACTIVAS en el entregable con gasto real vigente &gt; comprometidas (solo lectura; no bloquea). */
export function listarProfesionalesExcedidosEnEntregable(
  entregableId: string,
  asignaciones_horas: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): ProfesionalExcedidoEnEntregable[] {
  const eid = (entregableId ?? "").trim();
  const hoy = (fechaHoy ?? "").trim();
  if (!eid || !hoy) return [];

  const out: ProfesionalExcedidoEnEntregable[] = [];
  for (const a of asignaciones_horas) {
    if (a.estado !== "ACTIVA") continue;
    if ((a.entregable_id ?? "").trim() !== eid) continue;
    const g = sumaHorasGastadasRealesAsignacionBloque2(a, asignaciones_horas, registro_horas, entregables, proyectos, profesionales, hoy);
    if (g > a.horas_comprometidas + EPS_EXCESO) {
      const p = profesionales.find((x) => x.id === a.profesional_id);
      out.push({
        asignacionId: a.id,
        profesional_id: a.profesional_id,
        nombre: p?.nombre_completo ?? a.profesional_id,
        categoria: a.categoria,
        comprometidas: a.horas_comprometidas,
        gastado: g,
        exceso: g - a.horas_comprometidas,
      });
    }
  }
  return out;
}
