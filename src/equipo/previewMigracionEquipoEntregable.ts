/**
 * Previsualización de migración a equipo_entregable (solo lectura).
 * No persiste datos ni modifica AppData.
 */

import type {
  AsignacionHora,
  AsignacionHoraRol,
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

export type IntegranteOrigenEquipo = "asignacion_activa" | "asignacion_cerrada" | "lider_id_entregable";

export type EstadoVisualPreviewEquipo =
  | "OK"
  | "Sin equipo"
  | "Revisar líder"
  | "Múltiples líderes"
  | "Gasto sin equipo";

export type IntegranteEquipoPropuesto = {
  profesional_id: string;
  rol: AsignacionHoraRol;
  origenes: IntegranteOrigenEquipo[];
  /** Se unificaron varias filas ACTIVA/CERRADA del mismo profesional. */
  duplicadoResuelto: boolean;
  /** El rol final priorizó LIDER sobre APOYO en el mismo entregable. */
  conflictoRolDuplicado: boolean;
};

export type GastoSinEquipoSugerencia = {
  profesional_id: string;
  horas_reales: number;
  pct_colaboracion: number;
  sugerencia: "Agregar como apoyo";
};

export type ColaboracionPorProfesional = {
  profesional_id: string;
  horas_reales: number;
  pct_colaboracion: number;
};

export type FilaPreviewMigracionEquipo = {
  entregable_id: string;
  cliente_nombre: string;
  proyecto_codigo: string;
  proyecto_nombre: string;
  entregable_nombre: string;
  avance_real: number;
  avance_pct: number;
  estado_avance: "En ejecución" | "Completado";
  lider_id_actual: string | null;
  lider_nombre_actual: string;
  lideres_propuestos: { profesional_id: string; nombre: string; origenes: IntegranteOrigenEquipo[] }[];
  apoyos_propuestos: { profesional_id: string; nombre: string; origenes: IntegranteOrigenEquipo[] }[];
  integrantes: IntegranteEquipoPropuesto[];
  gasto_sin_equipo: GastoSinEquipoSugerencia[];
  horas_reales_totales: number;
  colaboracion: ColaboracionPorProfesional[];
  estado_visual: EstadoVisualPreviewEquipo;
  observaciones: string[];
  sin_equipo_propuesto: boolean;
  multiples_lideres: boolean;
  conflicto_lider_id_vs_asignaciones: boolean;
  duplicados_resueltos: number;
};

export type ResumenPreviewMigracionEquipo = {
  total_entregables: number;
  entregables_con_equipo: number;
  entregables_sin_equipo: number;
  total_lideres_propuestos: number;
  total_apoyos_propuestos: number;
  conflictos_multiples_lideres: number;
  conflictos_lider_id_vs_asignaciones: number;
  profesionales_gasto_sin_equipo: number;
  duplicados_resueltos_automaticamente: number;
};

export type PreviewMigracionEquipoEntregable = {
  resumen: ResumenPreviewMigracionEquipo;
  filas: FilaPreviewMigracionEquipo[];
};

export type PreviewMigracionEquipoInput = {
  clientes: { id: string; nombre: string }[];
  proyectos: Proyecto[];
  entregables: Entregable[];
  profesionales: Profesional[];
  asignaciones_horas: AsignacionHora[];
  registro_horas: RegistroHora[];
};

function avancePct(avanceReal: number): number {
  const ar = Number(avanceReal);
  if (!Number.isFinite(ar)) return 0;
  return Math.round(ar * 10000) / 100;
}

function estadoAvanceDesdeReal(avanceReal: number): "En ejecución" | "Completado" {
  const ar = Number(avanceReal);
  if (!Number.isFinite(ar)) return "En ejecución";
  return ar >= 1 ? "Completado" : "En ejecución";
}

function horasDirectasValidasPorProfesionalEnEntregable(
  entregableId: string,
  registro_horas: RegistroHoraConsumoInput[],
  entById: Map<string, EntregableConsumoTarget>,
  projById: Map<string, ProyectoTarifasInput>,
  profById: Map<string, ProfesionalCargoInput>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of registro_horas) {
    if (!esRegistroConsumoRealValido(r, entById, projById, profById)) continue;
    if ((r.entregable_id ?? "").trim() !== entregableId) continue;
    const pid = (r.profesional_id ?? "").trim();
    const h = Number(r.horas);
    out.set(pid, (out.get(pid) ?? 0) + h);
  }
  return out;
}

type IntegranteAcumulado = {
  rol: AsignacionHoraRol;
  origenes: IntegranteOrigenEquipo[];
  duplicadoResuelto: boolean;
  conflictoRolDuplicado: boolean;
  filasAsignacion: number;
};

function integrantesDesdeAsignacionesParticipacion(
  asignaciones: AsignacionHora[],
): { integrantes: Map<string, IntegranteAcumulado>; duplicadosResueltos: number; observaciones: string[] } {
  const porProf = new Map<string, AsignacionHora[]>();
  for (const a of asignaciones) {
    if (a.estado !== "ACTIVA" && a.estado !== "CERRADA") continue;
    const pid = (a.profesional_id ?? "").trim();
    if (!pid) continue;
    const list = porProf.get(pid) ?? [];
    list.push(a);
    porProf.set(pid, list);
  }

  const integrantes = new Map<string, IntegranteAcumulado>();
  let duplicadosResueltos = 0;
  const observaciones: string[] = [];

  for (const [profId, filas] of porProf) {
    const roles = new Set(filas.map((f) => (f.rol_en_entregable === "LIDER" ? "LIDER" : "APOYO")));
    const conflictoRol = roles.has("LIDER") && roles.has("APOYO");
    const rolFinal: AsignacionHoraRol = roles.has("LIDER") ? "LIDER" : "APOYO";
    const dup = filas.length > 1 || conflictoRol;
    const tieneActiva = filas.some((f) => f.estado === "ACTIVA");
    const tieneCerrada = filas.some((f) => f.estado === "CERRADA");
    const origenes: IntegranteOrigenEquipo[] = [];
    if (tieneActiva) origenes.push("asignacion_activa");
    if (tieneCerrada) origenes.push("asignacion_cerrada");

    if (dup) {
      duplicadosResueltos += 1;
      if (conflictoRol) {
        observaciones.push(
          `Profesional ${profId}: apareció como LIDER y APOYO en asignaciones del entregable; se priorizó LIDER.`,
        );
      } else if (filas.length > 1) {
        observaciones.push(
          `Profesional ${profId}: ${filas.length} asignaciones ACTIVA/CERRADA; se dejó una propuesta de participación.`,
        );
      }
    }
    integrantes.set(profId, {
      rol: rolFinal,
      origenes,
      duplicadoResuelto: dup,
      conflictoRolDuplicado: conflictoRol,
      filasAsignacion: filas.length,
    });
  }

  return { integrantes, duplicadosResueltos, observaciones };
}

function aplicarLiderIdEntregable(
  liderId: string,
  integrantes: Map<string, IntegranteAcumulado>,
  observaciones: string[],
): void {
  const lid = liderId.trim();
  if (!lid) return;

  const existente = integrantes.get(lid);
  if (!existente) {
    integrantes.set(lid, {
      rol: "LIDER",
      origenes: ["lider_id_entregable"],
      duplicadoResuelto: false,
      conflictoRolDuplicado: false,
      filasAsignacion: 0,
    });
    observaciones.push(
      `Se sugirió LIDER desde lider_id del entregable (${lid}); no estaba en asignaciones ACTIVA/CERRADA.`,
    );
    return;
  }

  if (existente.rol !== "LIDER") {
    existente.rol = "LIDER";
    if (!existente.origenes.includes("lider_id_entregable")) {
      existente.origenes.push("lider_id_entregable");
    }
    observaciones.push(
      `lider_id del entregable (${lid}) no coincidía con rol APOYO en asignación; se propuso como LIDER.`,
    );
  } else if (!existente.origenes.includes("lider_id_entregable")) {
    existente.origenes.push("lider_id_entregable");
  }
}

function detectarConflictoLiderIdVsAsignaciones(
  liderIdEntregable: string | null,
  integrantes: Map<string, IntegranteAcumulado>,
): boolean {
  const lid = (liderIdEntregable ?? "").trim();
  if (!lid) return false;

  const lideresDesdeAsignacion = [...integrantes.entries()]
    .filter(
      ([, v]) =>
        v.rol === "LIDER" &&
        (v.origenes.includes("asignacion_activa") || v.origenes.includes("asignacion_cerrada")),
    )
    .map(([id]) => id);

  if (lideresDesdeAsignacion.length === 0) return false;

  return lideresDesdeAsignacion.some((id) => id !== lid);
}

function derivarEstadoVisual(
  sinEquipo: boolean,
  multiplesLideres: boolean,
  conflictoLiderId: boolean,
  tieneGastoSinEquipo: boolean,
): EstadoVisualPreviewEquipo {
  if (sinEquipo) return "Sin equipo";
  if (multiplesLideres) return "Múltiples líderes";
  if (conflictoLiderId) return "Revisar líder";
  if (tieneGastoSinEquipo) return "Gasto sin equipo";
  return "OK";
}

export function computePreviewMigracionEquipoEntregable(
  input: PreviewMigracionEquipoInput,
): PreviewMigracionEquipoEntregable {
  const profMap = new Map(input.profesionales.map((p) => [p.id, p.nombre_completo]));
  const clienteMap = new Map(input.clientes.map((c) => [c.id, c.nombre]));
  const proyectoMap = new Map(input.proyectos.map((p) => [p.id, p]));

  const entById = new Map<string, EntregableConsumoTarget>(
    input.entregables.map((e) => [e.id, { id: e.id, proyecto_id: e.proyecto_id }]),
  );
  const projById = new Map<string, ProyectoTarifasInput>(input.proyectos.map((p) => [p.id, p]));
  const profById = new Map<string, ProfesionalCargoInput>(
    input.profesionales.map((p) => [p.id, { id: p.id, cargo: p.cargo }]),
  );

  const asignacionesPorEntregable = new Map<string, AsignacionHora[]>();
  for (const a of input.asignaciones_horas) {
    if (a.estado !== "ACTIVA" && a.estado !== "CERRADA") continue;
    const eid = (a.entregable_id ?? "").trim();
    if (!eid) continue;
    const list = asignacionesPorEntregable.get(eid) ?? [];
    list.push(a);
    asignacionesPorEntregable.set(eid, list);
  }

  const filas: FilaPreviewMigracionEquipo[] = [];

  let totalLideres = 0;
  let totalApoyos = 0;
  let conEquipo = 0;
  let sinEquipo = 0;
  let conflictosMultiples = 0;
  let conflictosLiderId = 0;
  let duplicadosGlobal = 0;
  let gastoSinEquipoPairs = 0;

  for (const ent of input.entregables) {
    const proyecto = proyectoMap.get(ent.proyecto_id);
    const clienteNombre = proyecto ? clienteMap.get(proyecto.cliente_id) ?? "—" : "—";
    const asignacionesEnt = asignacionesPorEntregable.get(ent.id) ?? [];

    const { integrantes: acum, duplicadosResueltos, observaciones: obsAsig } =
      integrantesDesdeAsignacionesParticipacion(asignacionesEnt);

    const liderIdActual = (ent.lider_id ?? "").trim() || null;
    if (liderIdActual) {
      aplicarLiderIdEntregable(liderIdActual, acum, obsAsig);
    }

    const integrantes: IntegranteEquipoPropuesto[] = [...acum.entries()].map(([profesional_id, v]) => ({
      profesional_id,
      rol: v.rol,
      origenes: [...v.origenes],
      duplicadoResuelto: v.duplicadoResuelto,
      conflictoRolDuplicado: v.conflictoRolDuplicado,
    }));

    const lideresPropuestos = integrantes
      .filter((i) => i.rol === "LIDER")
      .map((i) => ({
        profesional_id: i.profesional_id,
        nombre: profMap.get(i.profesional_id) ?? i.profesional_id,
        origenes: i.origenes,
      }));

    const apoyosPropuestos = integrantes
      .filter((i) => i.rol === "APOYO")
      .map((i) => ({
        profesional_id: i.profesional_id,
        nombre: profMap.get(i.profesional_id) ?? i.profesional_id,
        origenes: i.origenes,
      }));

    const sinEquipoPropuesto = integrantes.length === 0;
    const multiplesLideres = lideresPropuestos.length > 1;
    if (multiplesLideres) {
      obsAsig.push(`Múltiples líderes propuestos (${lideresPropuestos.length}).`);
    }

    const conflictoLiderId = detectarConflictoLiderIdVsAsignaciones(liderIdActual, acum);
    if (conflictoLiderId) {
      obsAsig.push("El lider_id del entregable no coincide con el líder derivado de asignaciones ACTIVA/CERRADA.");
    }

    const horasPorProf = horasDirectasValidasPorProfesionalEnEntregable(
      ent.id,
      input.registro_horas,
      entById,
      projById,
      profById,
    );
    const horasRealesTotales = [...horasPorProf.values()].reduce((s, h) => s + h, 0);
    const equipoIds = new Set(integrantes.map((i) => i.profesional_id));

    const colaboracion: ColaboracionPorProfesional[] = [...horasPorProf.entries()]
      .map(([profesional_id, horas_reales]) => ({
        profesional_id,
        horas_reales,
        pct_colaboracion:
          horasRealesTotales > 0 ? Math.round((horas_reales / horasRealesTotales) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.horas_reales - a.horas_reales);

    const gasto_sin_equipo: GastoSinEquipoSugerencia[] = [];
    for (const [profesional_id, horas_reales] of horasPorProf) {
      if (horas_reales <= 0) continue;
      if (equipoIds.has(profesional_id)) continue;
      const pct =
        horasRealesTotales > 0 ? Math.round((horas_reales / horasRealesTotales) * 10000) / 100 : 0;
      gasto_sin_equipo.push({
        profesional_id,
        horas_reales,
        pct_colaboracion: pct,
        sugerencia: "Agregar como apoyo",
      });
      gastoSinEquipoPairs += 1;
      obsAsig.push(
        `${profMap.get(profesional_id) ?? profesional_id}: gasto real sin equipo declarado (${horas_reales.toFixed(1)} h). Sugerencia: Agregar como apoyo.`,
      );
    }

    const estado_visual = derivarEstadoVisual(
      sinEquipoPropuesto,
      multiplesLideres,
      conflictoLiderId,
      gasto_sin_equipo.length > 0,
    );

    if (sinEquipoPropuesto) sinEquipo += 1;
    else conEquipo += 1;
    totalLideres += lideresPropuestos.length;
    totalApoyos += apoyosPropuestos.length;
    if (multiplesLideres) conflictosMultiples += 1;
    if (conflictoLiderId) conflictosLiderId += 1;
    duplicadosGlobal += duplicadosResueltos;

    filas.push({
      entregable_id: ent.id,
      cliente_nombre: clienteNombre,
      proyecto_codigo: proyecto?.codigo ?? "—",
      proyecto_nombre: proyecto?.nombre ?? "—",
      entregable_nombre: ent.nombre,
      avance_real: Number(ent.avance_real) || 0,
      avance_pct: avancePct(ent.avance_real),
      estado_avance: estadoAvanceDesdeReal(ent.avance_real),
      lider_id_actual: liderIdActual,
      lider_nombre_actual: liderIdActual ? profMap.get(liderIdActual) ?? liderIdActual : "—",
      lideres_propuestos: lideresPropuestos,
      apoyos_propuestos: apoyosPropuestos,
      integrantes,
      gasto_sin_equipo,
      horas_reales_totales: horasRealesTotales,
      colaboracion,
      estado_visual,
      observaciones: obsAsig,
      sin_equipo_propuesto: sinEquipoPropuesto,
      multiples_lideres: multiplesLideres,
      conflicto_lider_id_vs_asignaciones: conflictoLiderId,
      duplicados_resueltos: duplicadosResueltos,
    });
  }

  filas.sort((a, b) => {
    const c = a.cliente_nombre.localeCompare(b.cliente_nombre, "es");
    if (c !== 0) return c;
    const p = a.proyecto_codigo.localeCompare(b.proyecto_codigo, "es");
    if (p !== 0) return p;
    return a.entregable_nombre.localeCompare(b.entregable_nombre, "es");
  });

  return {
    resumen: {
      total_entregables: filas.length,
      entregables_con_equipo: conEquipo,
      entregables_sin_equipo: sinEquipo,
      total_lideres_propuestos: totalLideres,
      total_apoyos_propuestos: totalApoyos,
      conflictos_multiples_lideres: conflictosMultiples,
      conflictos_lider_id_vs_asignaciones: conflictosLiderId,
      profesionales_gasto_sin_equipo: gastoSinEquipoPairs,
      duplicados_resueltos_automaticamente: duplicadosGlobal,
    },
    filas,
  };
}
