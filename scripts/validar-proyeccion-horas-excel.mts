/**
 * Smoke: Excel generado desde el mismo snapshot que la UI.
 * Ejecutar: npx tsx scripts/validar-proyeccion-horas-excel.mts
 */

import { buildProyeccionHorasSnapshot } from "../src/proyeccionHoras/proyeccionHorasReadModel.ts";
import { verificarEstructuraExcelProyeccion } from "../src/proyeccionHoras/proyeccionHorasExcelExport.ts";
import type { Cliente, Entregable, Profesional, Proyecto, RegistroHora } from "../src/context/AppDataContext.ts";
import type { CurvaObjetivoAnual } from "../src/entregables/curvaObjetivoAnualTypes.ts";

function baseEnt(partial: Partial<Entregable> & Pick<Entregable, "id" | "nombre">): Entregable {
  return {
    id: partial.id,
    proyecto_id: partial.proyecto_id ?? "pr1",
    fase_codigo: partial.fase_codigo ?? "F1",
    tarea_codigo: "",
    nombre: partial.nombre,
    lider_id: "prof1",
    tipo_flujo: "SIN_REVISIONES",
    estado: partial.estado ?? "EN_PLAZO",
    avance_real: partial.avance_real ?? 0.2,
    avance_teorico: 0.2,
    fecha_inicio: partial.fecha_inicio ?? "2026-08-01",
    fecha_termino: partial.fecha_termino ?? "2026-10-31",
    fecha_revA: null,
    fecha_revB: null,
    fecha_revP: null,
    uf_presupuestadas: 0,
    uf_consumidas: 0,
    hrs_presupuestadas: 0,
    hrs_l2: partial.hrs_l2 ?? 0,
    hrs_p4: partial.hrs_p4 ?? 40,
    hrs_p3: partial.hrs_p3 ?? 20,
    hrs_p2: partial.hrs_p2 ?? 10,
    hrs_gastadas: 0,
    presupuesto_categoria_definido: true,
    created_at: "",
    updated_at: "",
    ...partial,
  } as Entregable;
}

function fixtureData(ents: Entregable[]) {
  const clientes = [{ id: "c1", codigo: "C1", nombre: "Cliente Uno" } as Cliente];
  const proyectos = [
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
  const profesionales = [{ id: "prof1", nombre_completo: "Ana", cargo: "P4" } as Profesional];
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
  return { clientes, proyectos, profesionales, registro_horas, curvas_objetivo_anual, entregables: ents };
}

async function main() {
  const data = fixtureData([
    baseEnt({ id: "e1", nombre: "Ent A", hrs_p4: 40, hrs_l2: 50, fecha_inicio: "2026-08-01", fecha_termino: "2026-09-30" }),
    baseEnt({ id: "e2", nombre: "Ent B", hrs_p3: 30, fecha_inicio: "2026-09-01", fecha_termino: "2026-10-15" }),
    baseEnt({
      id: "eVenc",
      nombre: "Vencido",
      hrs_p4: 15,
      fecha_inicio: "2026-01-01",
      fecha_termino: "2026-06-30",
      avance_real: 0.4,
    }),
  ]);

  const snap8 = buildProyeccionHorasSnapshot(data, {
    fechaConsulta: "2026-08-05",
    horizonteMeses: 8,
    incluirL2: false,
  });
  const v8 = await verificarEstructuraExcelProyeccion(snap8);
  console.log("8m L2=off", v8.ok ? "PASS" : "FAIL", JSON.stringify(v8));

  const snap6 = buildProyeccionHorasSnapshot(data, {
    fechaConsulta: "2026-08-05",
    horizonteMeses: 6,
    incluirL2: false,
  });
  const v6 = await verificarEstructuraExcelProyeccion(snap6);
  const mesesOk = v6.nMesesDetalle === 6;
  console.log("6m columnas", mesesOk && v6.ok ? "PASS" : "FAIL", `meses=${v6.nMesesDetalle}`);

  const snapL2 = buildProyeccionHorasSnapshot(data, {
    fechaConsulta: "2026-08-05",
    horizonteMeses: 8,
    incluirL2: true,
  });
  const vL2 = await verificarEstructuraExcelProyeccion(snapL2);
  const saldoSube = snapL2.total_general.saldo_horas_total > snap8.total_general.saldo_horas_total;
  console.log(
    "L2 on saldo",
    saldoSube && vL2.ok ? "PASS" : "FAIL",
    `sinL2=${snap8.total_general.saldo_horas_total} conL2=${snapL2.total_general.saldo_horas_total}`,
  );

  const obsOk = snap8.observaciones.some((o) => o.codigo === "SALDO_VENCIDO");
  console.log("obs vencido en snapshot (exportadas en hoja 1)", obsOk ? "PASS" : "FAIL");

  // Coincidencia pantalla ↔ excel: total saldo y suma meses horizonte
  const sumaMesesSnap = snap8.total_general.meses.reduce((s, m) => s + m.horas, 0);
  const sumaEntregables = snap8.entregables.reduce((s, e) => s + e.saldo_horas_total, 0);
  console.log(
    "totales snapshot internos",
    Math.abs(sumaEntregables - snap8.total_general.saldo_horas_total) < 0.05 &&
      Math.abs(v8.totalSaldoExcel - snap8.total_general.saldo_horas_total) < 0.05
      ? "PASS"
      : "FAIL",
    `sumaEnt=${sumaEntregables} total=${snap8.total_general.saldo_horas_total} excel=${v8.totalSaldoExcel} sumaMes=${sumaMesesSnap}`,
  );

  const wspRows = snap8.comparacion_curva.length;
  console.log("WSP filas", v8.nFilasComparacion === wspRows ? "PASS" : "FAIL", `${v8.nFilasComparacion}/${wspRows}`);

  if (!v8.ok || !v6.ok || !vL2.ok || !mesesOk || !saldoSube || !obsOk) {
    throw new Error("Validación Excel proyección falló");
  }
  console.log("\nAll Excel smoke checks ok");
}

await main();
