/**
 * Validaciones del read model Proyección de Horas (paso 1).
 * Ejecutable con: npx tsx src/proyeccionHoras/proyeccionHorasValidaciones.ts
 */

import {
  distribuirHorasPorDiasHabiles,
  listarMesesHorizonte,
  mesInicioHorizonteDesdeConsulta,
  resolverVentanaProyeccionEfectiva,
} from "@/proyeccionHoras/proyeccionHorasDistribucion";
import {
  buildProyeccionHorasSnapshot,
  calcularSaldosCategoriaProyeccion,
  saldoProyectableTotal,
  type ProyeccionHorasInput,
} from "@/proyeccionHoras/proyeccionHorasReadModel";
import type {
  Cliente,
  Entregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import type { CurvaObjetivoAnual } from "@/entregables/curvaObjetivoAnualTypes";

type Caso = { nombre: string; ok: boolean; detalle?: string };

function assertClose(a: number, b: number, eps = 0.02): boolean {
  return Math.abs(a - b) <= eps;
}

function baseEnt(partial: Partial<Entregable> & Pick<Entregable, "id" | "nombre">): Entregable {
  const {
    id,
    nombre,
    proyecto_id,
    fase_codigo,
    estado,
    avance_real,
    fecha_inicio,
    fecha_termino,
    hrs_l2,
    hrs_p4,
    hrs_p3,
    hrs_p2,
    ...rest
  } = partial;
  return {
    id,
    proyecto_id: proyecto_id ?? "pr1",
    fase_codigo: fase_codigo ?? "F1",
    tarea_codigo: "",
    nombre,
    lider_id: "prof1",
    tipo_flujo: "SIN_REVISIONES",
    estado: estado ?? "EN_PLAZO",
    avance_real: avance_real ?? 0.2,
    avance_teorico: 0.2,
    fecha_inicio: fecha_inicio ?? "2026-08-01",
    fecha_termino: fecha_termino ?? "2026-08-31",
    fecha_revA: null,
    fecha_revB: null,
    fecha_revP: null,
    uf_presupuestadas: 0,
    uf_consumidas: 0,
    hrs_presupuestadas: 0,
    hrs_l2: hrs_l2 ?? 0,
    hrs_p4: hrs_p4 ?? 0,
    hrs_p3: hrs_p3 ?? 0,
    hrs_p2: hrs_p2 ?? 0,
    hrs_gastadas: 0,
    presupuesto_categoria_definido: true,
    created_at: "",
    updated_at: "",
    ...rest,
  } as Entregable;
}

function fixture(): ProyeccionHorasInput {
  const clientes: Cliente[] = [
    { id: "c1", codigo: "C1", nombre: "Cliente Uno", created_at: "", updated_at: "" } as Cliente,
  ];
  const proyectos: Proyecto[] = [
    {
      id: "pr1",
      cliente_id: "c1",
      codigo: "P-001",
      nombre: "Proyecto Demo",
      estado: "ACTIVO",
      fecha_inicio: "2026-01-01",
      fecha_termino: "2026-12-31",
      tarifa_l2: 2,
      tarifa_p4: 1.5,
      tarifa_p3: 1,
      tarifa_p2: 0.8,
    } as Proyecto,
  ];
  const profesionales: Profesional[] = [
    { id: "prof1", nombre_completo: "Ana P4", cargo: "P4" } as Profesional,
    { id: "prof2", nombre_completo: "Luis L2", cargo: "L2" } as Profesional,
  ];
  const registro_horas: RegistroHora[] = [];
  const curvas_objetivo_anual: CurvaObjetivoAnual[] = [
    {
      id: "cur2026",
      anio: 2026,
      nombre: "Curva 2026",
      descripcion: "",
      horas_maximas_mensuales_por_profesional: 160,
      meses: Array.from({ length: 12 }, (_, i) => ({
        id: `m${i + 1}`,
        curva_objetivo_anual_id: "cur2026",
        mes: i + 1,
        fecha_inicio: "",
        fecha_termino: "",
        profesionales: 10,
        feriados_horas: 0,
        vacaciones_horas: 0,
        ajustes_horas: 0,
        objetivo_mensual: 1000,
        objetivo_acumulado: 1000 * (i + 1),
        created_at: "",
        updated_at: "",
      })),
      created_at: "",
      updated_at: "",
    },
  ];
  return { clientes, proyectos, profesionales, registro_horas, curvas_objetivo_anual, entregables: [] };
}

export function ejecutarValidacionesProyeccionHoras(): Caso[] {
  const casos: Caso[] = [];

  // 1. Un solo mes
  {
    const d = distribuirHorasPorDiasHabiles(100, "2026-08-03", "2026-08-14");
    const suma = d.meses.reduce((s, m) => s + m.horas, 0);
    casos.push({
      nombre: "1. Entregable en un solo mes — suma = saldo",
      ok: d.meses.length === 1 && d.meses[0]!.mes === "2026-08" && assertClose(suma, 100),
      detalle: JSON.stringify(d.meses),
    });
  }

  // 2. Dos meses
  {
    const d = distribuirHorasPorDiasHabiles(100, "2026-08-20", "2026-09-10");
    const suma = d.meses.reduce((s, m) => s + m.horas, 0);
    casos.push({
      nombre: "2. Entregable cruzando dos meses — suma = saldo",
      ok: d.meses.length === 2 && assertClose(suma, 100),
      detalle: JSON.stringify(d.meses),
    });
  }

  // 3. Tres o más meses (ejemplo del brief: 20-08 → 10-10)
  {
    const d = distribuirHorasPorDiasHabiles(100, "2026-08-20", "2026-10-10");
    const suma = d.meses.reduce((s, m) => s + m.horas, 0);
    casos.push({
      nombre: "3. Entregable cruzando tres meses — suma = saldo",
      ok: d.meses.length === 3 && assertClose(suma, 100),
      detalle: JSON.stringify(d.meses),
    });
  }

  // 4. Saldo 0
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "e0",
        nombre: "Sin saldo",
        hrs_p4: 10,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-09-30",
      }),
    ];
    data.registro_horas = [
      {
        id: "r1",
        tipo_hora: "DIRECTA",
        proyecto_id: "pr1",
        entregable_id: "e0",
        profesional_id: "prof1",
        horas: 10,
        fecha: "2026-07-01",
      } as RegistroHora,
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 8,
      incluirL2: false,
    });
    casos.push({
      nombre: "4. Saldo 0 no genera carga",
      ok: snap.entregables.length === 0 && snap.conteos.excluidos_saldo_cero >= 1,
      detalle: `proy=${snap.entregables.length} excl_cero=${snap.conteos.excluidos_saldo_cero}`,
    });
  }

  // 5. Sin fechas
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "eSinF",
        nombre: "Sin fechas",
        hrs_p4: 40,
        fecha_inicio: "",
        fecha_termino: "",
      }),
    ];
    const snap = buildProyeccionHorasSnapshot(data, { fechaConsulta: "2026-08-05", horizonteMeses: 8 });
    casos.push({
      nombre: "5. Sin fechas → observación / excluido con conteo",
      ok: snap.entregables.length === 0 && snap.conteos.excluidos_sin_fechas >= 1,
      detalle: snap.observaciones.map((o) => o.codigo).join(","),
    });
  }

  // 6. Distribución suma saldo (refuerzo con filtro horizonte)
  {
    const meses = listarMesesHorizonte("2026-08", 8);
    const d = distribuirHorasPorDiasHabiles(100, "2026-08-20", "2026-10-10", meses);
    const suma = d.meses.reduce((s, m) => s + m.horas, 0);
    casos.push({
      nombre: "6. Distribución por días hábiles suma el saldo (en rango completo dentro de horizonte)",
      ok: assertClose(suma, 100),
      detalle: `suma=${suma}`,
    });
  }

  // 7–8. L2 excluido / incluido
  {
    const ent = baseEnt({
      id: "eL2",
      nombre: "Con L2",
      hrs_l2: 50,
      hrs_p4: 30,
      hrs_p3: 20,
      hrs_p2: 10,
    });
    const saldos = calcularSaldosCategoriaProyeccion(ent, new Map(), new Map());
    const sinL2 = saldoProyectableTotal(saldos, false);
    const conL2 = saldoProyectableTotal(saldos, true);
    casos.push({
      nombre: "7. L2 excluido por defecto",
      ok: assertClose(sinL2, 60) && !assertClose(sinL2, conL2),
      detalle: `sinL2=${sinL2} conL2=${conL2}`,
    });
    casos.push({
      nombre: "8. L2 incluido con flag",
      ok: assertClose(conL2, 110),
      detalle: `conL2=${conL2}`,
    });
  }

  // 9. Meses fuera del horizonte no aparecen
  {
    const meses = listarMesesHorizonte("2026-08", 6);
    const d = distribuirHorasPorDiasHabiles(100, "2026-08-01", "2027-03-31", meses);
    const fuera = d.meses.some((m) => !meses.includes(m.mes));
    casos.push({
      nombre: "9. Meses fuera del horizonte no aparecen",
      ok: !fuera && d.meses.every((m) => meses.includes(m.mes)),
      detalle: d.meses.map((m) => m.mes).join(","),
    });
  }

  // 10–11. Totales proyecto / general
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "e1",
        nombre: "E1",
        hrs_p4: 40,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-08-31",
      }),
      baseEnt({
        id: "e2",
        nombre: "E2",
        hrs_p3: 60,
        fecha_inicio: "2026-09-01",
        fecha_termino: "2026-09-30",
      }),
    ];
    const snap = buildProyeccionHorasSnapshot(data, { fechaConsulta: "2026-08-05", horizonteMeses: 8 });
    const sumaEnt = snap.entregables.reduce((s, e) => s + e.saldo_horas_total, 0);
    const sumaProj = snap.agregados_proyecto.reduce((s, p) => s + p.saldo_horas_total, 0);
    casos.push({
      nombre: "10. Totales por proyecto cuadran con entregables",
      ok: assertClose(sumaEnt, sumaProj) && snap.agregados_proyecto.length === 1,
      detalle: `ent=${sumaEnt} proj=${sumaProj}`,
    });
    casos.push({
      nombre: "11. Total general cuadra con proyectos",
      ok: assertClose(snap.total_general.saldo_horas_total, sumaProj),
      detalle: `total=${snap.total_general.saldo_horas_total}`,
    });
  }

  // 12. Comparación curva
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "eC",
        nombre: "Carga",
        hrs_p4: 200,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-08-31",
      }),
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 6,
      factorCargabilidadPct: 100,
    });
    const ago = snap.comparacion_curva.find((c) => c.mes === "2026-08");
    casos.push({
      nombre: "12. Comparación con curva objetivo (diff = disponible − proyectado)",
      ok:
        !!ago &&
        assertClose(ago.capacidad_base, 1000) &&
        assertClose(ago.horas_disponibles, 1000) &&
        assertClose(ago.horas_proyectadas, 200) &&
        assertClose(ago.diferencia, 800) &&
        ago.factor_cargabilidad_pct === 100 &&
        ago.utilizacion_pct != null &&
        assertClose(ago.utilizacion_pct, 20),
      detalle: ago ? JSON.stringify(ago) : "sin fila agosto",
    });

    const snap85 = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 6,
      factorCargabilidadPct: 85,
    });
    const ago85 = snap85.comparacion_curva.find((c) => c.mes === "2026-08");
    casos.push({
      nombre: "12b. Factor 85%: capacidad considerada = base × 0.85; carga intacta",
      ok:
        !!ago85 &&
        assertClose(ago85.capacidad_base, 1000) &&
        assertClose(ago85.horas_disponibles, 850) &&
        assertClose(ago85.horas_proyectadas, 200) &&
        assertClose(ago85.diferencia, 650) &&
        ago85.factor_cargabilidad_pct === 85 &&
        ago85.utilizacion_pct != null &&
        assertClose(ago85.utilizacion_pct, (200 / 850) * 100) &&
        assertClose(snap85.total_general.horas_en_horizonte, snap.total_general.horas_en_horizonte),
      detalle: ago85 ? JSON.stringify(ago85) : "sin fila agosto 85%",
    });
  }

  // Horizonte desde consulta (no hardcode)
  {
    const m = mesInicioHorizonteDesdeConsulta("2026-03-15");
    const list = listarMesesHorizonte(m, 8);
    casos.push({
      nombre: "Horizonte 8 meses desde mes vigente de consulta",
      ok: m === "2026-03" && list[0] === "2026-03" && list[7] === "2026-10",
      detalle: list.join(","),
    });
  }

  // --- Replanificación desde fecha de consulta ---

  // R1. No iniciado: distribuye desde fecha_inicio
  {
    const v = resolverVentanaProyeccionEfectiva("2026-09-01", "2026-10-31", "2026-08-05");
    const d = v.ok
      ? distribuirHorasPorDiasHabiles(80, v.fecha_inicio_efectiva, v.fecha_termino_efectiva)
      : null;
    const suma = d?.meses.reduce((s, m) => s + m.horas, 0) ?? 0;
    casos.push({
      nombre: "R1. No iniciado distribuye desde fecha_inicio",
      ok:
        v.ok === true &&
        v.fecha_inicio_efectiva === "2026-09-01" &&
        v.replanificado_desde_consulta === false &&
        assertClose(suma, 80),
      detalle: v.ok ? `${v.fecha_inicio_efectiva}→${v.fecha_termino_efectiva} suma=${suma}` : v.detalle,
    });
  }

  // R2. Ya iniciado: distribuye desde fecha_consulta (hábil)
  {
    const consulta = "2026-08-05"; // miércoles
    const v = resolverVentanaProyeccionEfectiva("2026-06-01", "2026-10-31", consulta);
    casos.push({
      nombre: "R2. Ya iniciado distribuye desde fecha_consulta",
      ok: v.ok === true && v.fecha_inicio_efectiva === consulta && v.replanificado_desde_consulta === true,
      detalle: v.ok ? `${v.fecha_inicio_efectiva}→${v.fecha_termino_efectiva}` : v.detalle,
    });
  }

  // R3. Inicio pasado + término futuro: 100% del saldo en meses futuros (nada en meses &lt; consulta)
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "eReplan",
        nombre: "Replan",
        hrs_p4: 120,
        fecha_inicio: "2026-05-01",
        fecha_termino: "2026-10-31",
      }),
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 8,
    });
    const row = snap.entregables.find((e) => e.entregable_id === "eReplan");
    const sumaMeses = row?.meses.reduce((s, m) => s + m.horas, 0) ?? 0;
    const mesesAntesConsulta = row?.meses.filter((m) => m.mes < "2026-08" && m.horas > 1e-9) ?? [];
    const distEfectiva = row
      ? distribuirHorasPorDiasHabiles(row.saldo_horas_total, row.fecha_inicio_efectiva, row.fecha_termino_efectiva)
      : null;
    const sumaEfectiva = distEfectiva?.meses.reduce((s, m) => s + m.horas, 0) ?? 0;
    casos.push({
      nombre: "R3. Inicio pasado + término futuro: 100% saldo en ventana futura",
      ok:
        !!row &&
        row.fecha_inicio_efectiva === "2026-08-05" &&
        assertClose(row.saldo_horas_total, 120) &&
        assertClose(sumaEfectiva, 120) &&
        mesesAntesConsulta.length === 0 &&
        assertClose(sumaMeses + row.horas_fuera_horizonte, 120),
      detalle: row
        ? `efectiva=${row.fecha_inicio_efectiva} sumaHoriz=${sumaMeses} fuera=${row.horas_fuera_horizonte} sumaEf=${sumaEfectiva}`
        : "sin fila",
    });
  }

  // R4. Vencido con saldo → observación
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "eVenc",
        nombre: "Vencido",
        hrs_p4: 40,
        fecha_inicio: "2026-01-01",
        fecha_termino: "2026-07-15",
        estado: "EN_PLAZO",
        avance_real: 0.5,
      }),
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 8,
    });
    casos.push({
      nombre: "R4. Entregable vencido con saldo queda observado",
      ok:
        snap.entregables.length === 0 &&
        snap.conteos.excluidos_saldo_vencido >= 1 &&
        snap.observaciones.some((o) => o.codigo === "SALDO_VENCIDO"),
      detalle: `vencidos=${snap.conteos.excluidos_saldo_vencido} obs=${snap.observaciones.map((o) => o.codigo).join(",")}`,
    });
  }

  // R5. Suma mensual = saldo pendiente proyectable (ventana efectiva completa)
  {
    const v = resolverVentanaProyeccionEfectiva("2026-03-01", "2026-11-30", "2026-08-05");
    const saldo = 250;
    const d = v.ok
      ? distribuirHorasPorDiasHabiles(saldo, v.fecha_inicio_efectiva, v.fecha_termino_efectiva)
      : null;
    const suma = d?.meses.reduce((s, m) => s + m.horas, 0) ?? 0;
    casos.push({
      nombre: "R5. Suma mensual = saldo pendiente proyectable",
      ok: v.ok === true && assertClose(suma, saldo),
      detalle: v.ok ? `suma=${suma} saldo=${saldo} meses=${d?.meses.length}` : v.detalle,
    });
  }

  // C1. Cancelado no proyecta; saldo anulado; gasto/presupuesto intactos en entidad
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "eAct",
        nombre: "Activo",
        hrs_p4: 100,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-08-31",
        cancelado: false,
      }),
      baseEnt({
        id: "eCan",
        nombre: "Cancelado",
        hrs_p4: 180,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-08-31",
        avance_real: 0.25,
        estado: "EN_PLAZO",
        cancelado: true,
        fecha_cancelacion: "2026-08-05",
        motivo_cancelacion: "Proyecto reorientado",
      }),
    ];
    data.registro_horas = [
      {
        id: "rh1",
        profesional_id: "prof1",
        entregable_id: "eCan",
        proyecto_id: "pr1",
        fecha: "2026-07-10",
        horas: 40,
        tipo_hora: "DIRECTA",
        descripcion: null,
        created_at: "",
        updated_at: "",
      } as RegistroHora,
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 8,
      factorCargabilidadPct: 100,
    });
    const ids = snap.entregables.map((e) => e.entregable_id);
    const obsCan = snap.observaciones.find((o) => o.codigo === "ENTREGABLE_CANCELADO");
    const entCan = data.entregables.find((e) => e.id === "eCan")!;
    casos.push({
      nombre: "C1. Cancelado excluido; activo proyecta; obs con saldo anulado",
      ok:
        ids.includes("eAct") &&
        !ids.includes("eCan") &&
        snap.conteos.excluidos_cancelados === 1 &&
        !!obsCan &&
        obsCan.detalle.includes("140.0") &&
        entCan.avance_real === 0.25 &&
        entCan.hrs_p4 === 180 &&
        entCan.fecha_inicio === "2026-08-01",
      detalle: `ids=${ids.join(",")} cancelados=${snap.conteos.excluidos_cancelados} obs=${obsCan?.detalle ?? "—"}`,
    });
  }

  // C2. Sin campos cancelado (backup antiguo) sigue proyectando
  {
    const data = fixture();
    const ent = baseEnt({
      id: "eOld",
      nombre: "Legacy",
      hrs_p4: 50,
      fecha_inicio: "2026-08-01",
      fecha_termino: "2026-08-31",
    });
    delete (ent as { cancelado?: boolean }).cancelado;
    data.entregables = [ent];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 6,
    });
    casos.push({
      nombre: "C2. Backup sin cancelado proyecta normalmente",
      ok: snap.entregables.length === 1 && snap.conteos.excluidos_cancelados === 0,
      detalle: `proy=${snap.entregables.length} cancelados=${snap.conteos.excluidos_cancelados}`,
    });
  }

  // C3. Reactivado (cancelado=false) proyecta saldo
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "eRe",
        nombre: "Reactivado",
        hrs_p4: 80,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-08-31",
        cancelado: false,
        fecha_cancelacion: null,
        motivo_cancelacion: null,
      }),
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 6,
    });
    casos.push({
      nombre: "C3. Reactivado (cancelado=false) proyecta saldo",
      ok:
        snap.entregables.length === 1 &&
        assertClose(snap.entregables[0]!.saldo_horas_total, 80) &&
        snap.conteos.excluidos_cancelados === 0,
      detalle: `proy=${snap.entregables.length} saldo=${snap.entregables[0]?.saldo_horas_total}`,
    });
  }

  // P1. Pausado sin tentativas → 0 mensuales + horas pausadas
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "eP0",
        nombre: "Pausado sin prog",
        hrs_p4: 100,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-12-31",
        pausado: true,
        fecha_pausa: "2026-08-10",
        motivo_pausa: "Stand by",
        fecha_reinicio_tentativa: null,
        fecha_termino_tentativa: null,
      }),
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 8,
      factorCargabilidadPct: 100,
    });
    casos.push({
      nombre: "P1. Pausado sin tentativas: 0 carga, saldo en horas pausadas",
      ok:
        snap.entregables.length === 0 &&
        assertClose(snap.horas_pausadas_sin_programacion, 100) &&
        snap.entregables_pausados_sin_programacion === 1 &&
        snap.observaciones.some((o) => o.codigo === "SALDO_PAUSADO_SIN_PROGRAMACION") &&
        snap.conteos.excluidos_cancelados === 0,
      detalle: `proy=${snap.entregables.length} pausadas=${snap.horas_pausadas_sin_programacion}`,
    });
  }

  // P2. Pausado con tentativas Oct–Nov
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "eP1",
        nombre: "Pausado con tentativas",
        hrs_p4: 100,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-12-31",
        pausado: true,
        fecha_pausa: "2026-08-10",
        motivo_pausa: "Espera",
        fecha_reinicio_tentativa: "2026-10-01",
        fecha_termino_tentativa: "2026-11-30",
      }),
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 8,
      factorCargabilidadPct: 100,
    });
    const row = snap.entregables[0];
    const ago = row?.meses.find((m) => m.mes === "2026-08")?.horas ?? 0;
    const sep = row?.meses.find((m) => m.mes === "2026-09")?.horas ?? 0;
    const oct = row?.meses.find((m) => m.mes === "2026-10")?.horas ?? 0;
    const nov = row?.meses.find((m) => m.mes === "2026-11")?.horas ?? 0;
    const suma = (row?.meses.reduce((s, m) => s + m.horas, 0) ?? 0);
    casos.push({
      nombre: "P2. Pausado con tentativas: 0 en pausa; 100% en Oct–Nov",
      ok:
        !!row &&
        row.proyeccion_tentativa === true &&
        assertClose(ago, 0) &&
        assertClose(sep, 0) &&
        oct + nov > 99 &&
        assertClose(suma, 100) &&
        assertClose(snap.horas_pausadas_sin_programacion, 0),
      detalle: row
        ? `ago=${ago} sep=${sep} oct=${oct} nov=${nov} suma=${suma}`
        : "sin fila",
    });
  }

  // P3. Tentativas inválidas
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "ePbad",
        nombre: "Pausa inválida",
        hrs_p4: 50,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-12-31",
        pausado: true,
        fecha_pausa: "2026-08-10",
        motivo_pausa: "Datos legacy",
        fecha_reinicio_tentativa: "2026-11-01",
        fecha_termino_tentativa: "2026-10-01",
      }),
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 6,
    });
    casos.push({
      nombre: "P3. Tentativas inválidas: no proyecta + observación",
      ok:
        snap.entregables.length === 0 &&
        assertClose(snap.horas_pausadas_sin_programacion, 0) &&
        snap.observaciones.some((o) => o.codigo === "PAUSA_FECHAS_TENTATIVAS_INVALIDAS"),
      detalle: snap.observaciones.map((o) => o.codigo).join(","),
    });
  }

  // P4. Pausado con DIRECTA históricas: reales en mes no suman a carga; saldo intacto
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "eReal",
        nombre: "Pausado con real",
        hrs_p4: 100,
        fecha_inicio: "2026-06-01",
        fecha_termino: "2026-12-31",
        pausado: true,
        fecha_pausa: "2026-08-10",
        motivo_pausa: "Stand by",
        fecha_reinicio_tentativa: "2026-10-01",
        fecha_termino_tentativa: "2026-11-30",
      }),
    ];
    data.registro_horas = [
      {
        id: "rhR1",
        profesional_id: "prof1",
        proyecto_id: "pr1",
        entregable_id: "eReal",
        tipo_hora: "DIRECTA",
        fecha: "2026-08-03",
        horas: 25,
        descripcion: "",
        created_at: "",
        updated_at: "",
      } as RegistroHora,
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 8,
      factorCargabilidadPct: 100,
    });
    const row = snap.entregables[0];
    const carga = snap.total_general.meses.reduce((s, m) => s + m.horas, 0);
    const realesAgo = row?.meses.find((m) => m.mes === "2026-08")?.horas_reales ?? 0;
    const proyAgo = row?.meses.find((m) => m.mes === "2026-08")?.horas ?? 0;
    casos.push({
      nombre: "P4. Reales históricas no suman a carga; saldo = 75; Aug proy=0",
      ok:
        !!row &&
        assertClose(row.saldo_horas_total, 75) &&
        assertClose(row.horas_reales_total ?? 0, 25) &&
        assertClose(realesAgo, 25) &&
        assertClose(proyAgo, 0) &&
        assertClose(carga, 75) &&
        assertClose(row.meses.reduce((s, m) => s + m.horas, 0), 75),
      detalle: row
        ? `saldo=${row.saldo_horas_total} realTot=${row.horas_reales_total} carga=${carga} realesAgo=${realesAgo} proyAgo=${proyAgo}`
        : "sin fila",
    });
  }

  // P5. Horas posteriores a pausa → observación
  {
    const data = fixture();
    data.entregables = [
      baseEnt({
        id: "ePost",
        nombre: "Pausa con horas post",
        hrs_p4: 80,
        fecha_inicio: "2026-08-01",
        fecha_termino: "2026-12-31",
        pausado: true,
        fecha_pausa: "2026-08-10",
        motivo_pausa: "Pausa",
        fecha_reinicio_tentativa: "2026-10-01",
        fecha_termino_tentativa: "2026-10-31",
      }),
    ];
    data.registro_horas = [
      {
        id: "rhPost",
        profesional_id: "prof1",
        proyecto_id: "pr1",
        entregable_id: "ePost",
        tipo_hora: "DIRECTA",
        fecha: "2026-08-20",
        horas: 8,
        descripcion: "",
        created_at: "",
        updated_at: "",
      } as RegistroHora,
    ];
    const snap = buildProyeccionHorasSnapshot(data, {
      fechaConsulta: "2026-08-05",
      horizonteMeses: 6,
    });
    casos.push({
      nombre: "P5. DIRECTA posterior a pausa genera HORAS_POSTERIORES_A_PAUSA",
      ok: snap.observaciones.some((o) => o.codigo === "HORAS_POSTERIORES_A_PAUSA"),
      detalle: snap.observaciones.map((o) => o.codigo).join(","),
    });
  }

  return casos;
}

/** Formatea resultados para consola / diagnóstico. */
export function formatearResultadoValidacionesProyeccionHoras(casos: Caso[]): string {
  const lines = casos.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.nombre}${c.detalle ? ` · ${c.detalle}` : ""}`);
  const fail = casos.filter((c) => !c.ok).length;
  lines.push("", `${casos.length - fail}/${casos.length} ok`);
  return lines.join("\n");
}
