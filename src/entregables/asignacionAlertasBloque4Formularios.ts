/**
 * Alertas operativas adicionales en Formularios → Asignaciones (solo lectura).
 * Bloque 4: déficit gasto real DIRECTO vs horas comprometidas asignadas; solape de ventanas.
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
  buildConsumoMaps,
  sumaGastoRealDirectoValidoProfesionalEntregable,
} from "@/entregables/asignacionHoraConsumo";
import { esRegistroConsumoRealValido, type RegistroHoraConsumoInput } from "@/entregables/registroHoraConsumo";

const EPS = 1e-6;

const CATEGORIAS: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];

function esCategoriaAsignacion(c: string): c is AsignacionHoraCategoria {
  return c === "L2" || c === "P4" || c === "P3" || c === "P2";
}

function ventanaAsignacionIso(
  a: AsignacionHora,
  fechaHoy: string,
): { ini: string; fin: string } | null {
  const ini = (a.fecha_inicio_vigencia ?? "").trim() || "1900-01-01";
  if (a.estado === "ACTIVA") {
    const fin = (fechaHoy ?? "").trim();
    if (!fin) return null;
    return { ini, fin };
  }
  if (a.estado === "CERRADA") {
    const fc = (a.fecha_cierre ?? "").trim();
    if (!fc) return null;
    return { ini, fin: fc };
  }
  return null;
}

function intervalosIsoSolapan(ini1: string, fin1: string, ini2: string, fin2: string): boolean {
  const s = ini1 > ini2 ? ini1 : ini2;
  const e = fin1 < fin2 ? fin1 : fin2;
  return s <= e;
}

export type AlertaBloque4DeficitGastoRealVsAsignado = {
  profesional_id: string;
  entregable_id: string;
  proyecto_id: string;
  categoria: AsignacionHoraCategoria;
  gasto_real_directo: number;
  horas_asignadas_totales: number;
  deficit: number;
};

/** Fase 1: lectura operativa total por triple (sin ventanas temporales para el gasto real). */
export type EstadoResumenTripleFase1 = "en_rango" | "deficit" | "sin_asignacion";

export type ResumenAsignacionTripleFase1 = {
  profesional_id: string;
  entregable_id: string;
  proyecto_id: string;
  categoria: AsignacionHoraCategoria;
  gasto_real_total: number;
  horas_asignadas_totales: number;
  saldo: number;
  deficit: number;
  estado: EstadoResumenTripleFase1;
};

/**
 * Resumen por profesional + entregable + categoría (= cargo del profesional).
 * Gasto real: suma DIRECTA válida; asignado: suma horas_comprometidas ACTIVA+CERRADA.
 */
export function listarResumenAsignacionTripleFase1(
  registro_horas: RegistroHora[],
  asignaciones_horas: AsignacionHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): ResumenAsignacionTripleFase1[] {
  const maps = buildConsumoMaps(entregables, proyectos, profesionales);
  const keys = clavesProfEntregableConActividad(registro_horas, asignaciones_horas, maps);
  const entMap = new Map(entregables.map((e) => [e.id, e]));
  const out: ResumenAsignacionTripleFase1[] = [];

  for (const k of keys) {
    const i = k.indexOf("\x00");
    const pid = k.slice(0, i);
    const eid = k.slice(i + 1);
    const prof = profesionales.find((p) => p.id === pid);
    if (!prof || !esCategoriaAsignacion(prof.cargo)) continue;
    const cat = prof.cargo;

    const gastoRealTotal = sumaGastoRealDirectoValidoProfesionalEntregable(
      pid,
      eid,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
    );
    const horasAsign = sumaHorasComprometidasActivasYCerradasProfEntregableCategoria(
      asignaciones_horas,
      pid,
      eid,
      cat,
    );
    const saldo = horasAsign - gastoRealTotal;
    const deficit = Math.max(0, gastoRealTotal - horasAsign);

    let estado: EstadoResumenTripleFase1;
    if (gastoRealTotal > EPS && horasAsign <= EPS) {
      estado = "sin_asignacion";
    } else if (deficit > EPS) {
      estado = "deficit";
    } else {
      estado = "en_rango";
    }

    const ent = entMap.get(eid);
    out.push({
      profesional_id: pid,
      entregable_id: eid,
      proyecto_id: (ent?.proyecto_id ?? "").trim(),
      categoria: cat,
      gasto_real_total: gastoRealTotal,
      horas_asignadas_totales: horasAsign,
      saldo,
      deficit,
      estado,
    });
  }
  return out;
}

/**
 * Suma `horas_comprometidas` de asignaciones ACTIVAS y CERRADAS del mismo prof + entregable + categoría.
 */
export function sumaHorasComprometidasActivasYCerradasProfEntregableCategoria(
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
        (a.estado === "ACTIVA" || a.estado === "CERRADA") &&
        (a.profesional_id ?? "").trim() === pid &&
        (a.entregable_id ?? "").trim() === eid &&
        a.categoria === categoria &&
        (!ex || a.id !== ex),
    )
    .reduce((s, a) => {
      const h = Number(a.horas_comprometidas);
      return s + (Number.isFinite(h) && h > 0 ? h : 0);
    }, 0);
}

/**
 * Pares (profesional, entregable) con al menos un RegistroHora DIRECTO válido o alguna asignación ACTIVA/CERRADA.
 */
function clavesProfEntregableConActividad(
  registro_horas: RegistroHora[],
  asignaciones_horas: AsignacionHora[],
  maps: ReturnType<typeof buildConsumoMaps>,
): Set<string> {
  const { entById, projById, profById } = maps;
  const keys = new Set<string>();
  for (const r of registro_horas) {
    const input: RegistroHoraConsumoInput = {
      tipo_hora: r.tipo_hora,
      proyecto_id: r.proyecto_id,
      entregable_id: r.entregable_id,
      profesional_id: r.profesional_id,
      horas: r.horas,
    };
    if (!esRegistroConsumoRealValido(input, entById, projById, profById)) continue;
    const pid = (r.profesional_id ?? "").trim();
    const eid = (r.entregable_id ?? "").trim();
    if (pid && eid) keys.add(`${pid}\x00${eid}`);
  }
  for (const a of asignaciones_horas) {
    if (a.estado !== "ACTIVA" && a.estado !== "CERRADA") continue;
    const pid = (a.profesional_id ?? "").trim();
    const eid = (a.entregable_id ?? "").trim();
    if (pid && eid) keys.add(`${pid}\x00${eid}`);
  }
  return keys;
}

/**
 * Bloque 4 (déficit): gasto real DIRECTO total (prof + entregable) > suma horas_comprometidas ACTIVA+CERRADA
 * en la misma categoría que el cargo del profesional (L2/P4/P3/P2).
 */
export function listarBloque4DeficitGastoRealVsHorasAsignadas(
  registro_horas: RegistroHora[],
  asignaciones_horas: AsignacionHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): AlertaBloque4DeficitGastoRealVsAsignado[] {
  return listarResumenAsignacionTripleFase1(
    registro_horas,
    asignaciones_horas,
    entregables,
    proyectos,
    profesionales,
  )
    .filter((r) => r.deficit > EPS)
    .map((r) => ({
      profesional_id: r.profesional_id,
      entregable_id: r.entregable_id,
      proyecto_id: r.proyecto_id,
      categoria: r.categoria,
      gasto_real_directo: r.gasto_real_total,
      horas_asignadas_totales: r.horas_asignadas_totales,
      deficit: r.deficit,
    }));
}

export type AlertaBloque4VentanasSolapadas = {
  profesional_id: string;
  entregable_id: string;
  proyecto_id: string;
  categoria: AsignacionHoraCategoria;
};

/**
 * Dos o más asignaciones ACTIVA/CERRADA mismo prof + entregable + categoría con ventanas temporales que se solapan.
 */
export function listarBloque4VentanasAsignacionSolapadas(
  asignaciones_horas: AsignacionHora[],
  entregables: Entregable[],
  fechaHoy: string,
): AlertaBloque4VentanasSolapadas[] {
  const hoy = (fechaHoy ?? "").trim();
  if (!hoy) return [];

  const byKey = new Map<string, AsignacionHora[]>();
  for (const a of asignaciones_horas) {
    if (a.estado !== "ACTIVA" && a.estado !== "CERRADA") continue;
    const pid = (a.profesional_id ?? "").trim();
    const eid = (a.entregable_id ?? "").trim();
    const cat = a.categoria;
    if (!pid || !eid || !CATEGORIAS.includes(cat)) continue;
    const k = `${pid}\x00${eid}\x00${cat}`;
    const arr = byKey.get(k) ?? [];
    arr.push(a);
    byKey.set(k, arr);
  }

  const entMap = new Map(entregables.map((e) => [e.id, e]));
  const out: AlertaBloque4VentanasSolapadas[] = [];

  for (const [k, rows] of byKey) {
    if (rows.length < 2) continue;
    const wins: { ini: string; fin: string }[] = [];
    for (const a of rows) {
      const w = ventanaAsignacionIso(a, hoy);
      if (w) wins.push(w);
    }
    if (wins.length < 2) continue;
    let solapa = false;
    for (let i = 0; i < wins.length && !solapa; i++) {
      for (let j = i + 1; j < wins.length; j++) {
        if (intervalosIsoSolapan(wins[i]!.ini, wins[i]!.fin, wins[j]!.ini, wins[j]!.fin)) {
          solapa = true;
          break;
        }
      }
    }
    if (!solapa) continue;
    const parts = k.split("\x00");
    const pid = parts[0]!;
    const eid = parts[1]!;
    const cat = parts[2]! as AsignacionHoraCategoria;
    const ent = entMap.get(eid);
    out.push({
      profesional_id: pid,
      entregable_id: eid,
      proyecto_id: (ent?.proyecto_id ?? "").trim(),
      categoria: cat,
    });
  }
  return out;
}
