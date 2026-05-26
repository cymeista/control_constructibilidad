/**
 * Detector histórico de brechas entre gasto real (RegistroHora) y cobertura por asignaciones.
 * Solo lectura: no modifica registros ni asignaciones.
 */

import type { AsignacionHora, Entregable, Profesional, Proyecto, RegistroHora } from "@/context/AppDataContext";
import { buildConsumoMaps } from "@/entregables/asignacionHoraConsumo";
import { fechaCubiertaPorAlgunaAsignacion } from "@/entregables/asignacionHoraBloque4";
import {
  esRegistroConsumoRealValido,
  type RegistroHoraConsumoInput,
} from "@/entregables/registroHoraConsumo";

export type CategoriaBrechaHistorica =
  | "SIN_ASIGNACION"
  | "CUBIERTO"
  | "PARCIALMENTE_CUBIERTO"
  | "EXCESO_SOBRE_ASIGNADO";

export type DetectarBrechasHistoricasInput = {
  registro_horas: RegistroHora[];
  entregables: Entregable[];
  proyectos: Proyecto[];
  profesionales: Profesional[];
  asignaciones_horas: AsignacionHora[];
  /** Fecha tope inclusive para ventanas ACTIVAS y comparación de fechas de registro (ej. hoy local ISO). */
  fechaHoy: string;
};

export type BrechaHistoricaParResultado = {
  proyecto_id: string;
  entregable_id: string;
  profesional_id: string;
  primera_fecha_gasto: string;
  ultima_fecha_gasto: string;
  horas_totales_gasto: number;
  cantidad_registros: number;
  horas_cubiertas: number;
  horas_no_cubiertas: number;
  registros_cubiertos: number;
  registros_no_cubiertos: number;
  categoria_detector: CategoriaBrechaHistorica;
  /** Toda la hora válida del par cae en al menos una ventana de asignación (equivale a horas_no_cubiertas ≈ 0). */
  cubre_rango_completo: boolean;
  /** Alguna asignación del par tiene suma de horas en su ventana > horas_comprometidas. */
  tiene_exceso_sobre_comprometido: boolean;
  /** Cobertura incompleta y además exceso en alguna asignación (solo informativo). */
  parcial_y_exceso: boolean;
  proyecto_codigo?: string;
  entregable_nombre?: string;
  profesional_nombre?: string;
};

function keyProfEnt(pid: string, eid: string): string {
  return `${pid}\x00${eid}`;
}

function parseProfEnt(k: string): { profesional_id: string; entregable_id: string } {
  const i = k.indexOf("\x00");
  return { profesional_id: k.slice(0, i), entregable_id: k.slice(i + 1) };
}

/** Suma horas de registros del par cuya fecha cae en la ventana temporal de esta asignación (ACTIVA / CERRADA). */
function sumHorasEnVentanaAsignacion(
  asignacion: AsignacionHora,
  registrosDelPar: RegistroHora[],
  fechaHoy: string,
): number {
  const hoy = (fechaHoy ?? "").trim();
  const ini = (asignacion.fecha_inicio_vigencia ?? "").trim() || "1900-01-01";
  let sum = 0;
  for (const r of registrosDelPar) {
    const f = (r.fecha ?? "").trim();
    if (!f) continue;
    if (f < ini) continue;
    const hrs = Number(r.horas);
    if (!Number.isFinite(hrs) || hrs <= 0) continue;

    if (asignacion.estado === "ACTIVA") {
      if (!hoy || f > hoy) continue;
      sum += hrs;
      continue;
    }
    if (asignacion.estado === "CERRADA") {
      const fc = (asignacion.fecha_cierre ?? "").trim();
      if (!fc || f > fc) continue;
      sum += hrs;
    }
  }
  return sum;
}

function clasificarCategoria(input: {
  cantidadAsignacionesPar: number;
  horas_no_cubiertas: number;
  tiene_exceso: boolean;
}): CategoriaBrechaHistorica {
  if (input.cantidadAsignacionesPar === 0) return "SIN_ASIGNACION";
  if (input.tiene_exceso) return "EXCESO_SOBRE_ASIGNADO";
  if (input.horas_no_cubiertas > 1e-9) return "PARCIALMENTE_CUBIERTO";
  return "CUBIERTO";
}

/**
 * Analiza RegistroHora ya cargado y devuelve una fila por cada par (entregable, profesional) con gasto válido de consumo real.
 */
export function detectarBrechasHistoricasAsignacion(input: DetectarBrechasHistoricasInput): BrechaHistoricaParResultado[] {
  const { entregables, proyectos, profesionales, asignaciones_horas, fechaHoy } = input;
  const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);

  const grupos = new Map<string, RegistroHora[]>();

  for (const r of input.registro_horas) {
    const consumo: RegistroHoraConsumoInput = {
      tipo_hora: r.tipo_hora,
      proyecto_id: r.proyecto_id,
      entregable_id: r.entregable_id,
      profesional_id: r.profesional_id,
      horas: r.horas,
    };
    if (!esRegistroConsumoRealValido(consumo, entById, projById, profById)) continue;

    const pid = (r.profesional_id ?? "").trim();
    const eid = (r.entregable_id ?? "").trim();
    if (!pid || !eid) continue;

    const hrs = Number(r.horas);
    if (!Number.isFinite(hrs) || hrs <= 0) continue;

    const k = keyProfEnt(pid, eid);
    const arr = grupos.get(k);
    if (arr) arr.push(r);
    else grupos.set(k, [r]);
  }

  const entByIdFull = new Map(entregables.map((e) => [e.id, e]));
  const projByIdFull = new Map(proyectos.map((p) => [p.id, p]));
  const profByIdFull = new Map(profesionales.map((p) => [p.id, p]));

  const resultados: BrechaHistoricaParResultado[] = [];

  for (const [k, regs] of grupos) {
    const { profesional_id, entregable_id } = parseProfEnt(k);
    const ent = entByIdFull.get(entregable_id);
    const proyecto_id = ent?.proyecto_id ?? "";

    let primera = "";
    let ultima = "";
    let horas_totales = 0;
    let horas_cubiertas = 0;
    let horas_no_cubiertas = 0;
    let registros_cubiertos = 0;
    let registros_no_cubiertos = 0;

    for (const r of regs) {
      const f = (r.fecha ?? "").trim();
      const hrs = Number(r.horas);
      horas_totales += hrs;
      if (f) {
        if (!primera || f < primera) primera = f;
        if (!ultima || f > ultima) ultima = f;
      }

      const cubierta = fechaCubiertaPorAlgunaAsignacion(f, profesional_id, entregable_id, asignaciones_horas, fechaHoy);
      if (cubierta) {
        horas_cubiertas += hrs;
        registros_cubiertos += 1;
      } else {
        horas_no_cubiertas += hrs;
        registros_no_cubiertos += 1;
      }
    }

    const asignacionesDelPar = asignaciones_horas.filter(
      (a) =>
        (a.profesional_id ?? "").trim() === profesional_id && (a.entregable_id ?? "").trim() === entregable_id,
    );

    let tiene_exceso = false;
    for (const a of asignacionesDelPar) {
      const sumVentana = sumHorasEnVentanaAsignacion(a, regs, fechaHoy);
      const comp = Number(a.horas_comprometidas);
      if (Number.isFinite(comp) && sumVentana > comp + 1e-9) {
        tiene_exceso = true;
        break;
      }
    }

    const cubre_rango_completo = horas_no_cubiertas <= 1e-9;
    const categoria_detector = clasificarCategoria({
      cantidadAsignacionesPar: asignacionesDelPar.length,
      horas_no_cubiertas,
      tiene_exceso,
    });
    const parcial_y_exceso = tiene_exceso && horas_no_cubiertas > 1e-9;

    const proyecto = proyecto_id ? projByIdFull.get(proyecto_id) : undefined;
    const profRow = profByIdFull.get(profesional_id);

    resultados.push({
      proyecto_id,
      entregable_id,
      profesional_id,
      primera_fecha_gasto: primera,
      ultima_fecha_gasto: ultima,
      horas_totales_gasto: horas_totales,
      cantidad_registros: regs.length,
      horas_cubiertas,
      horas_no_cubiertas,
      registros_cubiertos,
      registros_no_cubiertos,
      categoria_detector,
      cubre_rango_completo,
      tiene_exceso_sobre_comprometido: tiene_exceso,
      parcial_y_exceso,
      proyecto_codigo: proyecto?.codigo,
      entregable_nombre: ent?.nombre,
      profesional_nombre: profRow?.nombre_completo,
    });
  }

  resultados.sort((a, b) => {
    const pa = a.proyecto_id.localeCompare(b.proyecto_id);
    if (pa !== 0) return pa;
    const ea = a.entregable_id.localeCompare(b.entregable_id);
    if (ea !== 0) return ea;
    return a.profesional_id.localeCompare(b.profesional_id);
  });

  return resultados;
}
