/**
 * Auditoría de consistencia de imputaciones al cierre (solo lectura; no modifica datos).
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
  horasDevueltasPresupuestoAlCierre,
  sumaGastoRealDirectoValidoProfesionalEntregable,
  sumaHorasGastadasRealesEnVentana,
} from "@/entregables/asignacionHoraConsumo";

const EPS = 1e-6;

export type PropuestaReparacionAsignacion = {
  asignacion_id: string;
  fecha_cierre: string | null;
  gasto_bruto_ventana: number;
  ya_imputado_previo_en_orden: number;
  gasto_incremental: number;
  horas_comprometidas: number;
  sugerido_imputacion: number;
  actual_imputacion: number;
  devueltas_actual: number | null;
  devueltas_sugeridas: number;
  es_candidata_reparacion: boolean;
};

/** Orden: fecha_cierre ASC, luego created_at ASC, luego id (filas sin fecha_cierre al final). */
export function ordenarCerradasParaReparacion(cerradas: AsignacionHora[]): AsignacionHora[] {
  return [...cerradas].sort((x, y) => {
    const fx = (x.fecha_cierre ?? "").trim();
    const fy = (y.fecha_cierre ?? "").trim();
    const fxOk = fx.length > 0;
    const fyOk = fy.length > 0;
    if (fxOk !== fyOk) return fxOk ? -1 : 1;
    if (fx !== fy) return fx.localeCompare(fy);
    const cx = (x.created_at ?? "").trim();
    const cy = (y.created_at ?? "").trim();
    if (cx !== cy) return cx.localeCompare(cy);
    return x.id.localeCompare(y.id);
  });
}

/**
 * Propuesta determinista e idempotente: mismo criterio que el cierre incremental actual,
 * aplicado en orden cronológico de cierre (running sum de imputaciones sugeridas).
 */
export function calcularPropuestasReparacionIncremental(
  cerradasMismoGrupo: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): PropuestaReparacionAsignacion[] {
  const ordenadas = ordenarCerradasParaReparacion(cerradasMismoGrupo.filter((a) => a.estado === "CERRADA"));
  let running = 0;
  const out: PropuestaReparacionAsignacion[] = [];

  for (const a of ordenadas) {
    const fc = (a.fecha_cierre ?? "").trim();
    const yaPrevio = running;
    let bruto = 0;
    let incremental = 0;
    let sugerido = 0;

    if (fc) {
      bruto = sumaHorasGastadasRealesEnVentana(
        {
          profesional_id: a.profesional_id,
          entregable_id: a.entregable_id,
          fecha_inicio_vigencia: a.fecha_inicio_vigencia,
        },
        registro_horas,
        entregables,
        proyectos,
        profesionales,
        fc,
      );
      incremental = Math.max(0, bruto - yaPrevio);
      const comprom = Math.max(0, Number(a.horas_comprometidas) || 0);
      sugerido = Math.min(incremental, comprom);
      running += sugerido;
    }

    const actual =
      a.horas_gastadas_imputadas_al_cierre != null && Number.isFinite(Number(a.horas_gastadas_imputadas_al_cierre))
        ? Math.max(0, Number(a.horas_gastadas_imputadas_al_cierre))
        : 0;
    const devAct =
      a.horas_devueltas_presupuesto != null && Number.isFinite(Number(a.horas_devueltas_presupuesto))
        ? Math.max(0, Number(a.horas_devueltas_presupuesto))
        : null;
    const devSug = horasDevueltasPresupuestoAlCierre(a.horas_comprometidas, sugerido);

    out.push({
      asignacion_id: a.id,
      fecha_cierre: fc || null,
      gasto_bruto_ventana: bruto,
      ya_imputado_previo_en_orden: yaPrevio,
      gasto_incremental: incremental,
      horas_comprometidas: a.horas_comprometidas,
      sugerido_imputacion: sugerido,
      actual_imputacion: actual,
      devueltas_actual: devAct,
      devueltas_sugeridas: devSug,
      es_candidata_reparacion: Math.abs(actual - sugerido) > EPS,
    });
  }

  return out;
}

export type AuditoriaImputacionMotivo =
  | "MULTIPLE_CERRADA_SOLAPE_VENTANA"
  | "SOBREIMPUTACION_VS_REGISTRO"
  | "IMPUTADA_SUPERIOR_COMPROMISO";

export type AuditoriaImputacionCierreFila = {
  asignacion_id: string;
  horas_comprometidas: number;
  horas_imputadas_cierre: number;
  fecha_inicio_vigencia: string;
  fecha_cierre: string | null;
};

export type AuditoriaImputacionCierreGrupo = {
  profesional_id: string;
  profesional_nombre: string;
  proyecto_id: string;
  proyecto_codigo: string;
  proyecto_nombre: string;
  entregable_id: string;
  entregable_nombre: string;
  categoria: AsignacionHoraCategoria;
  asignaciones: AuditoriaImputacionCierreFila[];
  suma_imputada_cerrada: number;
  gasto_real_unico_registro: number;
  posible_sobreimputacion: number;
  motivos: AuditoriaImputacionMotivo[];
  propuesta_correccion_sugerida: string;
};

function ventanaCerrada(a: AsignacionHora): { inicio: string; fin: string } | null {
  if (a.estado !== "CERRADA") return null;
  const fin = (a.fecha_cierre ?? "").trim();
  if (!fin) return null;
  const inicio = (a.fecha_inicio_vigencia ?? "").trim() || "1900-01-01";
  return { inicio, fin };
}

function ventanasSolapan(a: AsignacionHora, b: AsignacionHora): boolean {
  const va = ventanaCerrada(a);
  const vb = ventanaCerrada(b);
  if (!va || !vb) return false;
  return va.inicio <= vb.fin && vb.inicio <= va.fin;
}

function hayParSolapado(cerradas: AsignacionHora[]): boolean {
  for (let i = 0; i < cerradas.length; i++) {
    for (let j = i + 1; j < cerradas.length; j++) {
      if (ventanasSolapan(cerradas[i]!, cerradas[j]!)) return true;
    }
  }
  return false;
}

function buildPropuesta(motivos: AuditoriaImputacionMotivo[]): string {
  const partes: string[] = [
    "Revisar manualmente las filas listadas. Las nuevas asignaciones cerradas usan imputación incremental (gasto bruto en ventana menos imputaciones ya registradas en otras CERRADAS del mismo profesional, entregable y categoría, con tope a horas comprometidas).",
  ];
  if (motivos.includes("SOBREIMPUTACION_VS_REGISTRO") || motivos.includes("MULTIPLE_CERRADA_SOLAPE_VENTANA")) {
    partes.push(
      "Si la suma de imputaciones supera el gasto real en RegistroHora, considerar ajustar solo los campos de imputación al cierre en datos históricos tras validación, o consolidar asignaciones.",
    );
  }
  if (motivos.includes("IMPUTADA_SUPERIOR_COMPROMISO")) {
    partes.push("Corregir filas donde horas imputadas al cierre exceden horas comprometidas si no corresponde a datos legítimos.");
  }
  return partes.join(" ");
}

/**
 * Detecta grupos (profesional + entregable + categoría) con posible doble imputación o inconsistencias.
 * No altera `asignaciones` ni `registro_horas`.
 */
export function auditarImputacionesCierrePotencialmenteIncorrectas(
  asignaciones: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): AuditoriaImputacionCierreGrupo[] {
  const byKey = new Map<
    string,
    {
      profesional_id: string;
      entregable_id: string;
      categoria: AsignacionHoraCategoria;
      cerradas: AsignacionHora[];
    }
  >();

  for (const a of asignaciones) {
    if (a.estado !== "CERRADA") continue;
    const pid = (a.profesional_id ?? "").trim();
    const eid = (a.entregable_id ?? "").trim();
    if (!pid || !eid) continue;
    const key = `${pid}\u0000${eid}\u0000${a.categoria}`;
    const cur = byKey.get(key);
    if (cur) cur.cerradas.push(a);
    else byKey.set(key, { profesional_id: pid, entregable_id: eid, categoria: a.categoria, cerradas: [a] });
  }

  const out: AuditoriaImputacionCierreGrupo[] = [];

  for (const { profesional_id, entregable_id, categoria, cerradas } of byKey.values()) {
    if (cerradas.length === 0) continue;

    const sumaImputada = cerradas.reduce((s, a) => {
      const g = a.horas_gastadas_imputadas_al_cierre;
      const n = g != null && Number.isFinite(Number(g)) ? Number(g) : 0;
      return s + Math.max(0, n);
    }, 0);

    const gastoReal = sumaGastoRealDirectoValidoProfesionalEntregable(
      profesional_id,
      entregable_id,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
    );

    const hayMultiSolape = cerradas.length >= 2 && hayParSolapado(cerradas);
    const sobreVsReg = sumaImputada > gastoReal + EPS;
    const imputadaMayorCompromiso = cerradas.some((a) => {
      const im = a.horas_gastadas_imputadas_al_cierre;
      const n = im != null && Number.isFinite(Number(im)) ? Number(im) : 0;
      return n > a.horas_comprometidas + EPS;
    });

    const motivos: AuditoriaImputacionMotivo[] = [];
    if (hayMultiSolape) motivos.push("MULTIPLE_CERRADA_SOLAPE_VENTANA");
    if (sobreVsReg) motivos.push("SOBREIMPUTACION_VS_REGISTRO");
    if (imputadaMayorCompromiso) motivos.push("IMPUTADA_SUPERIOR_COMPROMISO");

    if (motivos.length === 0) continue;

    const prof = profesionales.find((p) => p.id === profesional_id);
    const ent = entregables.find((e) => e.id === entregable_id);
    const proj = ent ? proyectos.find((p) => p.id === ent.proyecto_id) : undefined;

    const filas: AuditoriaImputacionCierreFila[] = cerradas.map((a) => ({
      asignacion_id: a.id,
      horas_comprometidas: a.horas_comprometidas,
      horas_imputadas_cierre:
        a.horas_gastadas_imputadas_al_cierre != null && Number.isFinite(Number(a.horas_gastadas_imputadas_al_cierre))
          ? Math.max(0, Number(a.horas_gastadas_imputadas_al_cierre))
          : 0,
      fecha_inicio_vigencia: (a.fecha_inicio_vigencia ?? "").trim(),
      fecha_cierre: a.fecha_cierre != null && String(a.fecha_cierre).trim() !== "" ? String(a.fecha_cierre).trim() : null,
    }));

    out.push({
      profesional_id,
      profesional_nombre: prof?.nombre_completo ?? profesional_id,
      proyecto_id: ent?.proyecto_id ?? "",
      proyecto_codigo: proj?.codigo ?? "",
      proyecto_nombre: proj?.nombre ?? "",
      entregable_id,
      entregable_nombre: ent?.nombre ?? entregable_id,
      categoria,
      asignaciones: filas,
      suma_imputada_cerrada: sumaImputada,
      gasto_real_unico_registro: gastoReal,
      posible_sobreimputacion: Math.max(0, sumaImputada - gastoReal),
      motivos,
      propuesta_correccion_sugerida: buildPropuesta(motivos),
    });
  }

  return out;
}
