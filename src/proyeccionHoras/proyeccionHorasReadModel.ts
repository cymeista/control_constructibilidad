/**
 * Read model: Proyección / Gantt de Horas.
 * Solo lectura — no muta AppData, entregables, registros ni curvas.
 *
 * Fechas: mismas que Gantt Proyectos (`entregable.fecha_inicio` / `fecha_termino`).
 * Ventana de proyección: desde max(fecha_inicio, fecha_consulta) hasta fecha_termino
 * (replanifica el saldo pendiente al futuro; no reparte horas en el calendario pasado).
 * Saldo: presupuesto vigente por categoría (hrs_*) − gasto real DIRECTA (`registro_horas`),
 * alineado con Gestión de Horas / `buildControlCategoriasEntregable`.
 * L2 excluido por defecto.
 */

import type {
  Cliente,
  Entregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import type { CurvaObjetivoAnual } from "@/entregables/curvaObjetivoAnualTypes";
import { buildConsumoMaps, fechaHoyIsoLocal } from "@/entregables/asignacionHoraConsumo";
import { esRegistroConsumoRealValido } from "@/entregables/registroHoraConsumo";
import { entregableEsCompletado } from "@/entregables/entregableDashboardFiltros";
import {
  buildControlCategoriasEntregable,
  gastoRealPorCategoriaDesdeMapaProf,
  presupuestoCategoriaEntregable,
} from "@/horas/entregableControlCategoria";
import { seleccionarCurvaObjetivoPorAnio } from "@/entregables/dashboardCurvaObjetivoAnual";
import { parseLocalDateString } from "@/lib/localDate";
import {
  distribuirHorasPorDiasHabiles,
  horasFueraDeHorizonte,
  listarMesesHorizonte,
  mesInicioHorizonteDesdeConsulta,
  mesKeyFromIso,
  resolverVentanaProyeccionEfectiva,
} from "@/proyeccionHoras/proyeccionHorasDistribucion";
import type {
  ProyeccionHorasAgregadoRow,
  ProyeccionHorasEntregableRow,
  ProyeccionHorasHorizonteMeses,
  ProyeccionHorasObservacion,
  ProyeccionHorasOpciones,
  ProyeccionHorasSnapshot,
  ProyeccionVsCurvaMes,
} from "@/proyeccionHoras/proyeccionHorasTypes";

const EPS = 1e-9;

export type ProyeccionHorasInput = {
  clientes: Cliente[];
  proyectos: Proyecto[];
  entregables: Entregable[];
  profesionales: Profesional[];
  registro_horas: RegistroHora[];
  curvas_objetivo_anual: CurvaObjetivoAnual[];
};

function n0(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fechasEntregableValidas(ent: Entregable): { ok: true; inicio: string; termino: string } | { ok: false; motivo: "SIN_FECHAS" | "FECHAS_INVALIDAS" } {
  const inicio = (ent.fecha_inicio ?? "").trim();
  const termino = (ent.fecha_termino ?? "").trim();
  if (!inicio || !termino) return { ok: false, motivo: "SIN_FECHAS" };
  const a = parseLocalDateString(inicio);
  const b = parseLocalDateString(termino);
  if (!a || !b) return { ok: false, motivo: "FECHAS_INVALIDAS" };
  if (inicio > termino) return { ok: false, motivo: "FECHAS_INVALIDAS" };
  return { ok: true, inicio, termino };
}

function proyectoEsActivo(pr: Proyecto | undefined): boolean {
  return pr?.estado === "ACTIVO";
}

/** Gasto DIRECTA válido por entregable → profesional (misma base que Gestión de Horas). */
function buildGastoProfPorEntregable(
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): Map<string, Map<string, number>> {
  const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);
  const out = new Map<string, Map<string, number>>();
  for (const r of registro_horas) {
    if (!esRegistroConsumoRealValido(r, entById, projById, profById)) continue;
    const eid = (r.entregable_id ?? "").trim();
    const pid = (r.profesional_id ?? "").trim();
    if (!eid || !pid) continue;
    let m = out.get(eid);
    if (!m) {
      m = new Map();
      out.set(eid, m);
    }
    m.set(pid, (m.get(pid) ?? 0) + n0(r.horas));
  }
  return out;
}

/**
 * Saldo por categoría: max(0, presupuesto − gastoReal).
 * Presupuesto = hrs_* vigentes (incluye redistribuciones).
 */
export function calcularSaldosCategoriaProyeccion(
  ent: Entregable,
  gastoProf: Map<string, number>,
  profMap: Map<string, Profesional>,
): { l2: number; p4: number; p3: number; p2: number } {
  const gastoCat = gastoRealPorCategoriaDesdeMapaProf(gastoProf, profMap);
  const rows = buildControlCategoriasEntregable(ent, gastoCat);
  const by = Object.fromEntries(rows.map((r) => [r.categoria, Math.max(0, r.saldo)])) as Record<
    string,
    number
  >;
  return {
    l2: by.L2 ?? 0,
    p4: by.P4 ?? 0,
    p3: by.P3 ?? 0,
    p2: by.P2 ?? 0,
  };
}

export function saldoProyectableTotal(
  saldos: { l2: number; p4: number; p3: number; p2: number },
  incluirL2: boolean,
): number {
  const base = saldos.p4 + saldos.p3 + saldos.p2;
  return incluirL2 ? base + saldos.l2 : base;
}

function vaciarMeses(mesesHorizonte: string[]): { mes: string; horas: number }[] {
  return mesesHorizonte.map((mes) => ({ mes, horas: 0 }));
}

function sumarMeses(
  base: { mes: string; horas: number }[],
  add: { mes: string; horas: number }[],
): { mes: string; horas: number }[] {
  const map = new Map(base.map((m) => [m.mes, m.horas]));
  for (const a of add) {
    map.set(a.mes, (map.get(a.mes) ?? 0) + a.horas);
  }
  return base.map((m) => ({ mes: m.mes, horas: Math.round((map.get(m.mes) ?? 0) * 100) / 100 }));
}

function buildComparacionCurva(input: {
  mesesHorizonte: string[];
  horasProyectadasPorMes: Map<string, number>;
  curvas: CurvaObjetivoAnual[];
  factorCargabilidadPct: number;
}): { filas: ProyeccionVsCurvaMes[]; curvasUsadas: ProyeccionHorasSnapshot["curvas_usadas"] } {
  const factorPct = Math.round(Math.max(0, Math.min(100, input.factorCargabilidadPct)));
  const f = factorPct / 100;
  const anios = new Set<number>();
  for (const mes of input.mesesHorizonte) {
    anios.add(Number(mes.slice(0, 4)));
  }
  const curvasUsadas: ProyeccionHorasSnapshot["curvas_usadas"] = [];
  const curvaByAnio = new Map<number, CurvaObjetivoAnual | null>();
  for (const anio of [...anios].sort()) {
    const c = seleccionarCurvaObjetivoPorAnio(input.curvas, anio);
    curvaByAnio.set(anio, c);
    curvasUsadas.push({
      anio,
      curva_id: c?.id ?? null,
      curva_nombre: c?.nombre ?? null,
      fuente: c
        ? `curvas_objetivo_anual · ${c.nombre} (${anio}) · objetivo_mensual (base 100%) × ${factorPct}%`
        : `Sin curva objetivo para ${anio}`,
    });
  }

  let acumDisp = 0;
  let acumProj = 0;
  const filas: ProyeccionVsCurvaMes[] = [];
  for (const mes of input.mesesHorizonte) {
    const anio = Number(mes.slice(0, 4));
    const mesNum = Number(mes.slice(5, 7));
    const curva = curvaByAnio.get(anio) ?? null;
    const rowMes = curva?.meses.find((m) => m.mes === mesNum);
    const capacidad_base =
      rowMes && Number.isFinite(rowMes.objetivo_mensual) ? Math.round(rowMes.objetivo_mensual * 100) / 100 : 0;
    const horas_disponibles = Math.round(capacidad_base * f * 100) / 100;
    const horas_proyectadas = Math.round((input.horasProyectadasPorMes.get(mes) ?? 0) * 100) / 100;
    const diferencia = Math.round((horas_disponibles - horas_proyectadas) * 100) / 100;
    acumDisp += horas_disponibles;
    acumProj += horas_proyectadas;
    const utilizacion_pct =
      horas_disponibles > EPS ? Math.round((horas_proyectadas / horas_disponibles) * 10000) / 100 : null;
    filas.push({
      mes,
      capacidad_base,
      factor_cargabilidad_pct: factorPct,
      horas_disponibles,
      horas_proyectadas,
      diferencia,
      utilizacion_pct,
      acumulado_disponible: Math.round(acumDisp * 100) / 100,
      acumulado_proyectado: Math.round(acumProj * 100) / 100,
      brecha_acumulada: Math.round((acumDisp - acumProj) * 100) / 100,
      fuente_curva: curva
        ? `curvas_objetivo_anual/${curva.id}`
        : "sin_curva",
      observacion: curva ? undefined : `No hay curva objetivo anual para ${anio}`,
    });
  }
  return { filas, curvasUsadas };
}

/**
 * Construye el snapshot de proyección de horas pendientes.
 * No persiste; no modifica entradas.
 */
export function buildProyeccionHorasSnapshot(
  data: ProyeccionHorasInput,
  opciones: ProyeccionHorasOpciones = {},
): ProyeccionHorasSnapshot {
  const fecha_consulta = (opciones.fechaConsulta ?? fechaHoyIsoLocal()).trim();
  const horizonte_meses: ProyeccionHorasHorizonteMeses = opciones.horizonteMeses ?? 8;
  const incluir_l2 = opciones.incluirL2 === true;
  const soloProyectosActivos = opciones.soloProyectosActivos !== false;
  const factorCargabilidadPct = opciones.factorCargabilidadPct ?? 85;

  const mes_inicio_horizonte = mesInicioHorizonteDesdeConsulta(fecha_consulta);
  const meses_horizonte = listarMesesHorizonte(mes_inicio_horizonte, horizonte_meses);
  const mes_fin_horizonte = meses_horizonte[meses_horizonte.length - 1] ?? mes_inicio_horizonte;
  const setHorizonte = new Set(meses_horizonte);

  const cliMap = new Map(data.clientes.map((c) => [c.id, c]));
  const projMap = new Map(data.proyectos.map((p) => [p.id, p]));
  const profMap = new Map(data.profesionales.map((p) => [p.id, p]));
  const gastoPorEnt = buildGastoProfPorEntregable(
    data.registro_horas,
    data.entregables,
    data.proyectos,
    data.profesionales,
  );

  const observaciones: ProyeccionHorasObservacion[] = [];
  const conteos = {
    entregables_proyectados: 0,
    excluidos_sin_fechas: 0,
    excluidos_completados: 0,
    excluidos_saldo_cero: 0,
    excluidos_proyecto_no_activo: 0,
    excluidos_fuera_horizonte: 0,
    excluidos_sin_dias_habiles: 0,
    excluidos_saldo_vencido: 0,
  };

  const entregablesOut: ProyeccionHorasEntregableRow[] = [];

  for (const ent of data.entregables) {
    const pr = projMap.get(ent.proyecto_id);
    const cl = pr ? cliMap.get(pr.cliente_id) : undefined;
    const labelProj = pr?.codigo ?? "—";

    const pushObs = (
      codigo: ProyeccionHorasObservacion["codigo"],
      detalle: string,
    ) => {
      observaciones.push({
        codigo,
        entregable_id: ent.id,
        entregable_nombre: ent.nombre,
        proyecto_codigo: labelProj,
        detalle,
      });
    };

    if (entregableEsCompletado(ent)) {
      conteos.excluidos_completados += 1;
      pushObs("COMPLETADO", `Estado/avance indica completado (estado=${ent.estado}, avance_real=${ent.avance_real}).`);
      continue;
    }

    if (soloProyectosActivos && !proyectoEsActivo(pr)) {
      conteos.excluidos_proyecto_no_activo += 1;
      pushObs(
        "PROYECTO_NO_ACTIVO",
        `Proyecto ${labelProj} con estado ${pr?.estado ?? "—"}; se excluye de la proyección (solo ACTIVO).`,
      );
      continue;
    }

    const saldos = calcularSaldosCategoriaProyeccion(
      ent,
      gastoPorEnt.get(ent.id) ?? new Map(),
      profMap,
    );
    const saldo_horas_total = saldoProyectableTotal(saldos, incluir_l2);
    if (saldo_horas_total <= EPS) {
      conteos.excluidos_saldo_cero += 1;
      pushObs("SALDO_CERO", "Saldo proyectable ≤ 0 (presupuesto − gasto real; L2 excluido salvo flag).");
      continue;
    }

    const fechas = fechasEntregableValidas(ent);
    if (!fechas.ok) {
      conteos.excluidos_sin_fechas += 1;
      pushObs(
        fechas.motivo,
        fechas.motivo === "SIN_FECHAS"
          ? "Falta fecha_inicio o fecha_termino del entregable (mismas que Gantt Proyectos)."
          : "Fechas de entregable inválidas o inicio > término.",
      );
      continue;
    }

    const ventana = resolverVentanaProyeccionEfectiva(fechas.inicio, fechas.termino, fecha_consulta);
    if (!ventana.ok) {
      if (ventana.motivo === "VENCIDO") {
        conteos.excluidos_saldo_vencido += 1;
        pushObs(
          "SALDO_VENCIDO",
          `Saldo pendiente ${saldo_horas_total.toFixed(1)} h no proyectable: ${ventana.detalle}`,
        );
      } else if (ventana.motivo === "SIN_DIAS_HABILES") {
        conteos.excluidos_sin_dias_habiles += 1;
        pushObs("SIN_DIAS_HABILES", ventana.detalle);
      } else {
        conteos.excluidos_sin_fechas += 1;
        pushObs("FECHAS_INVALIDAS", ventana.detalle);
      }
      continue;
    }

    const mesIniEf = mesKeyFromIso(ventana.fecha_inicio_efectiva);
    const mesFinEf = mesKeyFromIso(ventana.fecha_termino_efectiva);
    const solapaHorizonte =
      mesIniEf != null &&
      mesFinEf != null &&
      mesFinEf >= mes_inicio_horizonte &&
      mesIniEf <= mes_fin_horizonte;
    if (!solapaHorizonte) {
      conteos.excluidos_fuera_horizonte += 1;
      pushObs(
        "FUERA_HORIZONTE",
        `Ventana efectiva ${ventana.fecha_inicio_efectiva}→${ventana.fecha_termino_efectiva} no solapa el horizonte ${mes_inicio_horizonte}→${mes_fin_horizonte}.`,
      );
      continue;
    }

    // 100% del saldo pendiente sobre la ventana futura (desde consulta / inicio efectivo).
    const dist = distribuirHorasPorDiasHabiles(
      saldo_horas_total,
      ventana.fecha_inicio_efectiva,
      ventana.fecha_termino_efectiva,
      setHorizonte,
    );
    if (dist.sin_dias_habiles || dist.meses.length === 0) {
      conteos.excluidos_sin_dias_habiles += 1;
      pushObs(
        "SIN_DIAS_HABILES",
        "No hay días hábiles (lun–vie) en la intersección de la ventana efectiva con el horizonte.",
      );
      continue;
    }

    const mesesCompletos = meses_horizonte.map((mes) => {
      const hit = dist.meses.find((m) => m.mes === mes);
      return {
        mes,
        horas: hit?.horas ?? 0,
        dias_habiles: hit?.dias_habiles ?? 0,
      };
    });
    const horas_en_horizonte = Math.round(mesesCompletos.reduce((s, m) => s + m.horas, 0) * 100) / 100;
    const horas_fuera_horizonte = horasFueraDeHorizonte(
      saldo_horas_total,
      ventana.fecha_inicio_efectiva,
      ventana.fecha_termino_efectiva,
      meses_horizonte,
    );

    conteos.entregables_proyectados += 1;
    entregablesOut.push({
      cliente_id: cl?.id ?? "",
      cliente_nombre: cl?.nombre ?? "—",
      proyecto_id: pr?.id ?? "",
      proyecto_codigo: pr?.codigo ?? "—",
      proyecto_nombre: pr?.nombre ?? "—",
      proyecto_estado: pr?.estado ?? "—",
      entregable_id: ent.id,
      entregable_codigo: (ent.fase_codigo ?? "").trim(),
      entregable_nombre: ent.nombre,
      entregable_estado: String(ent.estado ?? ""),
      fecha_inicio: fechas.inicio,
      fecha_termino: fechas.termino,
      fecha_inicio_efectiva: ventana.fecha_inicio_efectiva,
      fecha_termino_efectiva: ventana.fecha_termino_efectiva,
      saldo_horas_total: Math.round(saldo_horas_total * 100) / 100,
      saldo_p4: Math.round(saldos.p4 * 100) / 100,
      saldo_p3: Math.round(saldos.p3 * 100) / 100,
      saldo_p2: Math.round(saldos.p2 * 100) / 100,
      saldo_l2: Math.round(saldos.l2 * 100) / 100,
      horas_en_horizonte,
      horas_fuera_horizonte,
      meses: mesesCompletos,
    });
  }

  entregablesOut.sort((a, b) => {
    const c = a.cliente_nombre.localeCompare(b.cliente_nombre, "es");
    if (c) return c;
    const p = a.proyecto_codigo.localeCompare(b.proyecto_codigo, "es");
    if (p) return p;
    return a.entregable_nombre.localeCompare(b.entregable_nombre, "es");
  });

  const byProyecto = new Map<string, ProyeccionHorasEntregableRow[]>();
  const byCliente = new Map<string, ProyeccionHorasEntregableRow[]>();
  for (const row of entregablesOut) {
    const lp = byProyecto.get(row.proyecto_id) ?? [];
    lp.push(row);
    byProyecto.set(row.proyecto_id, lp);
    const lc = byCliente.get(row.cliente_id) ?? [];
    lc.push(row);
    byCliente.set(row.cliente_id, lc);
  }

  const agregados_proyecto: ProyeccionHorasAgregadoRow[] = [...byProyecto.entries()].map(([pid, rows]) => {
    const first = rows[0]!;
    let meses = vaciarMeses(meses_horizonte);
    let saldo = 0;
    let enH = 0;
    for (const r of rows) {
      meses = sumarMeses(meses, r.meses);
      saldo += r.saldo_horas_total;
      enH += r.horas_en_horizonte;
    }
    return {
      nivel: "proyecto" as const,
      id: pid,
      etiqueta: `${first.proyecto_codigo} · ${first.proyecto_nombre}`,
      cliente_id: first.cliente_id,
      proyecto_id: pid,
      saldo_horas_total: Math.round(saldo * 100) / 100,
      horas_en_horizonte: Math.round(enH * 100) / 100,
      meses,
      n_entregables: rows.length,
    };
  });

  const agregados_cliente: ProyeccionHorasAgregadoRow[] = [...byCliente.entries()].map(([cid, rows]) => {
    const first = rows[0]!;
    let meses = vaciarMeses(meses_horizonte);
    let saldo = 0;
    let enH = 0;
    for (const r of rows) {
      meses = sumarMeses(meses, r.meses);
      saldo += r.saldo_horas_total;
      enH += r.horas_en_horizonte;
    }
    return {
      nivel: "cliente" as const,
      id: cid,
      etiqueta: first.cliente_nombre,
      cliente_id: cid,
      saldo_horas_total: Math.round(saldo * 100) / 100,
      horas_en_horizonte: Math.round(enH * 100) / 100,
      meses,
      n_entregables: rows.length,
    };
  });

  let mesesTotal = vaciarMeses(meses_horizonte);
  let saldoTotal = 0;
  let enHTotal = 0;
  for (const r of entregablesOut) {
    mesesTotal = sumarMeses(mesesTotal, r.meses);
    saldoTotal += r.saldo_horas_total;
    enHTotal += r.horas_en_horizonte;
  }
  const total_general: ProyeccionHorasAgregadoRow = {
    nivel: "total",
    id: "TOTAL",
    etiqueta: "Total general",
    saldo_horas_total: Math.round(saldoTotal * 100) / 100,
    horas_en_horizonte: Math.round(enHTotal * 100) / 100,
    meses: mesesTotal,
    n_entregables: entregablesOut.length,
  };

  const horasProyectadasPorMes = new Map<string, number>();
  for (const m of mesesTotal) horasProyectadasPorMes.set(m.mes, m.horas);

  const { filas: comparacion_curva, curvasUsadas: curvas_usadas } = buildComparacionCurva({
    mesesHorizonte: meses_horizonte,
    horasProyectadasPorMes,
    curvas: data.curvas_objetivo_anual ?? [],
    factorCargabilidadPct,
  });

  return {
    generado_en: new Date().toISOString(),
    fecha_consulta,
    mes_inicio_horizonte,
    mes_fin_horizonte,
    horizonte_meses,
    incluir_l2,
    factor_cargabilidad_pct: Math.round(Math.max(0, Math.min(100, factorCargabilidadPct))),
    meses_horizonte,
    entregables: entregablesOut,
    agregados_cliente,
    agregados_proyecto,
    total_general,
    comparacion_curva,
    observaciones,
    conteos,
    curvas_usadas,
  };
}

/** Expuesto para trazabilidad / Excel hoja 3. */
export function presupuestoVigenteCategoria(ent: Entregable, cat: "L2" | "P4" | "P3" | "P2"): number {
  return presupuestoCategoriaEntregable(ent, cat);
}
