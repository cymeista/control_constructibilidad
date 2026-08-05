/**
 * Exportación Excel (.xlsx) de Proyección / Gantt de Horas.
 * Usa exclusivamente el snapshot ya calculado — no recalcula saldos ni distribución.
 */

import ExcelJS from "exceljs";
import type {
  ProyeccionHorasEntregableRow,
  ProyeccionHorasObservacion,
  ProyeccionHorasSnapshot,
} from "@/proyeccionHoras/proyeccionHorasTypes";
import { formatDateForDisplay } from "@/lib/localDate";

const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2E8F0" },
};
const SUBTOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFCCFBF1" },
};
const SOBRECARGA_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEE2E2" },
};
const OBS_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEF3C7" },
};

function labelMesCorto(mesIso: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mesIso);
  if (!m) return mesIso;
  const y = m[1]!.slice(2);
  const idx = Number(m[2]) - 1;
  const corto = idx >= 0 && idx < 12 ? MESES_CORTO[idx]! : "?";
  return `${corto}-${y}`;
}

function fmtFechaDdMmYyyy(iso: string): string {
  return formatDateForDisplay(iso, "-");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function etiquetaObservacion(codigo: ProyeccionHorasObservacion["codigo"]): string {
  switch (codigo) {
    case "SIN_FECHAS":
      return "Sin fechas";
    case "FECHAS_INVALIDAS":
      return "Fechas inválidas";
    case "SALDO_CERO":
      return "Saldo cero";
    case "COMPLETADO":
      return "Completado";
    case "PROYECTO_NO_ACTIVO":
      return "Proyecto no activo";
    case "FUERA_HORIZONTE":
      return "Fuera de horizonte";
    case "SIN_DIAS_HABILES":
      return "Sin días hábiles";
    case "SALDO_VENCIDO":
      return "Saldo vencido";
    default:
      return codigo;
  }
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, size: 10, color: { argb: "FF334155" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 22;
}

type GrupoExport = {
  cliente_nombre: string;
  proyecto_id: string;
  proyecto_codigo: string;
  proyecto_nombre: string;
  saldo: number;
  meses: { mes: string; horas: number }[];
  entregables: ProyeccionHorasEntregableRow[];
};

function agruparPorProyecto(snapshot: ProyeccionHorasSnapshot): GrupoExport[] {
  const byId = new Map<string, GrupoExport>();
  for (const agg of snapshot.agregados_proyecto) {
    const first = snapshot.entregables.find((e) => e.proyecto_id === agg.id);
    byId.set(agg.id, {
      cliente_nombre: first?.cliente_nombre ?? "",
      proyecto_id: agg.id,
      proyecto_codigo: first?.proyecto_codigo ?? agg.etiqueta.split(" · ")[0] ?? "",
      proyecto_nombre: first?.proyecto_nombre ?? agg.etiqueta,
      saldo: agg.saldo_horas_total,
      meses: agg.meses,
      entregables: [],
    });
  }
  for (const row of snapshot.entregables) {
    let g = byId.get(row.proyecto_id);
    if (!g) {
      g = {
        cliente_nombre: row.cliente_nombre,
        proyecto_id: row.proyecto_id,
        proyecto_codigo: row.proyecto_codigo,
        proyecto_nombre: row.proyecto_nombre,
        saldo: row.saldo_horas_total,
        meses: snapshot.meses_horizonte.map((mes) => ({
          mes,
          horas: row.meses.find((m) => m.mes === mes)?.horas ?? 0,
        })),
        entregables: [],
      };
      byId.set(row.proyecto_id, g);
    }
    g.cliente_nombre = row.cliente_nombre;
    g.proyecto_codigo = row.proyecto_codigo;
    g.proyecto_nombre = row.proyecto_nombre;
    g.entregables.push(row);
  }
  return [...byId.values()].sort((a, b) => {
    const c = a.cliente_nombre.localeCompare(b.cliente_nombre, "es");
    if (c) return c;
    return a.proyecto_codigo.localeCompare(b.proyecto_codigo, "es");
  });
}

function buildHojaDetalle(wb: ExcelJS.Workbook, snapshot: ProyeccionHorasSnapshot): void {
  const ws = wb.addWorksheet("Detalle Gantt Horas", {
    views: [{ state: "frozen", xSplit: 5, ySplit: 1 }],
  });

  const meses = snapshot.meses_horizonte;
  const headers = [
    "Cliente",
    "Proyecto código",
    "Proyecto nombre",
    "Entregable código",
    "Entregable nombre",
    "Fecha inicio",
    "Fecha término",
    "Inicio efectivo",
    "Término efectivo",
    "Saldo horas",
    ...meses.map(labelMesCorto),
  ];

  const headerRow = ws.addRow(headers);
  styleHeaderRow(headerRow);

  const grupos = agruparPorProyecto(snapshot);

  for (const g of grupos) {
    const sub = ws.addRow([
      g.cliente_nombre,
      g.proyecto_codigo,
      g.proyecto_nombre,
      "",
      `SUBTOTAL (${g.entregables.length} entregables)`,
      "",
      "",
      "",
      "",
      round1(g.saldo),
      ...meses.map((mes) => round1(g.meses.find((m) => m.mes === mes)?.horas ?? 0)),
    ]);
    sub.font = { bold: true, size: 10 };
    sub.fill = SUBTOTAL_FILL;
    for (let c = 10; c <= 10 + meses.length; c++) {
      const cell = sub.getCell(c);
      cell.numFmt = "0.0";
      cell.alignment = { horizontal: "right" };
    }

    for (const e of g.entregables) {
      const row = ws.addRow([
        e.cliente_nombre,
        e.proyecto_codigo,
        e.proyecto_nombre,
        e.entregable_codigo || "",
        e.entregable_nombre,
        fmtFechaDdMmYyyy(e.fecha_inicio),
        fmtFechaDdMmYyyy(e.fecha_termino),
        fmtFechaDdMmYyyy(e.fecha_inicio_efectiva),
        fmtFechaDdMmYyyy(e.fecha_termino_efectiva),
        round1(e.saldo_horas_total),
        ...meses.map((mes) => round1(e.meses.find((m) => m.mes === mes)?.horas ?? 0)),
      ]);
      row.font = { size: 10 };
      for (let c = 10; c <= 10 + meses.length; c++) {
        const cell = row.getCell(c);
        cell.numFmt = "0.0";
        cell.alignment = { horizontal: "right" };
      }
    }
  }

  const total = snapshot.total_general;
  const totalRow = ws.addRow([
    "",
    "",
    "",
    "",
    "TOTAL GENERAL",
    "",
    "",
    "",
    "",
    round1(total.saldo_horas_total),
    ...meses.map((mes) => round1(total.meses.find((m) => m.mes === mes)?.horas ?? 0)),
  ]);
  totalRow.font = { bold: true, size: 10 };
  totalRow.fill = TOTAL_FILL;
  for (let c = 10; c <= 10 + meses.length; c++) {
    const cell = totalRow.getCell(c);
    cell.numFmt = "0.0";
    cell.alignment = { horizontal: "right" };
  }

  // Observaciones al final
  ws.addRow([]);
  const obsTitle = ws.addRow(["OBSERVACIONES"]);
  obsTitle.font = { bold: true, size: 11 };
  const obsHeader = ws.addRow(["Tipo", "Proyecto", "Entregable", "Motivo"]);
  styleHeaderRow(obsHeader);
  obsHeader.fill = OBS_HEADER_FILL;

  if (snapshot.observaciones.length === 0) {
    ws.addRow(["—", "—", "—", "Sin observaciones de exclusión en el snapshot."]);
  } else {
    for (const o of snapshot.observaciones) {
      ws.addRow([etiquetaObservacion(o.codigo), o.proyecto_codigo, o.entregable_nombre, o.detalle]);
    }
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  const widths = [22, 14, 28, 14, 32, 12, 12, 12, 12, 11, ...meses.map(() => 10)];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function buildHojaResumenWsp(wb: ExcelJS.Workbook, snapshot: ProyeccionHorasSnapshot): void {
  const ws = wb.addWorksheet("Resumen WSP", {
    views: [{ state: "frozen", ySplit: 12 }],
  });

  const horasDisponiblesTotal = snapshot.comparacion_curva.reduce((s, m) => s + m.horas_disponibles, 0);
  const horasProyectadasTotal = snapshot.total_general.horas_en_horizonte;
  const brechaTotal = round1(horasDisponiblesTotal - horasProyectadasTotal);
  const utilizacionTotal =
    horasDisponiblesTotal > 1e-9
      ? round1((horasProyectadasTotal / horasDisponiblesTotal) * 100)
      : null;

  const mesesSobrecarga = snapshot.comparacion_curva.filter(
    (c) => c.horas_proyectadas > c.horas_disponibles + 1e-9,
  );
  let mesCritico = "—";
  let peorUtil = -1;
  for (const c of snapshot.comparacion_curva) {
    const u =
      c.horas_disponibles > 1e-9
        ? c.horas_proyectadas / c.horas_disponibles
        : c.horas_proyectadas > 0
          ? Infinity
          : 0;
    if (u > peorUtil) {
      peorUtil = u;
      mesCritico = labelMesCorto(c.mes);
    }
  }

  const meta: [string, string | number][] = [
    ["Horizonte (meses)", snapshot.horizonte_meses],
    ["Fecha de consulta", fmtFechaDdMmYyyy(snapshot.fecha_consulta)],
    ["Incluir L2", snapshot.incluir_l2 ? "Sí" : "No"],
    ["Mes inicio horizonte", snapshot.mes_inicio_horizonte],
    ["Mes fin horizonte", snapshot.mes_fin_horizonte],
    ["Horas proyectadas totales", round1(horasProyectadasTotal)],
    ["Horas disponibles totales", round1(horasDisponiblesTotal)],
    ["Brecha total", brechaTotal],
    ["Utilización total %", utilizacionTotal ?? "—"],
    ["Mes más crítico", mesCritico],
    ["Meses con sobrecarga", mesesSobrecarga.length],
  ];

  for (const [k, v] of meta) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true, size: 10 };
    r.getCell(2).font = { size: 10 };
    if (typeof v === "number" && (k.includes("Horas") || k.includes("Brecha"))) {
      r.getCell(2).numFmt = "0.0";
    }
  }

  ws.addRow([]);

  const headers = [
    "Mes",
    "Horas disponibles",
    "Horas proyectadas",
    "Brecha",
    "Utilización %",
    "Disponible acumulado",
    "Proyectado acumulado",
    "Brecha acumulada",
    "Estado",
  ];
  const headerRow = ws.addRow(headers);
  styleHeaderRow(headerRow);
  const tableStartRow = headerRow.number;

  for (const c of snapshot.comparacion_curva) {
    const sobrecarga = c.horas_proyectadas > c.horas_disponibles + 1e-9;
    const row = ws.addRow([
      labelMesCorto(c.mes),
      round1(c.horas_disponibles),
      round1(c.horas_proyectadas),
      round1(c.diferencia),
      c.utilizacion_pct == null ? "—" : round1(c.utilizacion_pct),
      round1(c.acumulado_disponible),
      round1(c.acumulado_proyectado),
      round1(c.brecha_acumulada),
      sobrecarga ? "SOBRECARGA" : "OK",
    ]);
    row.font = { size: 10 };
    for (const col of [2, 3, 4, 6, 7, 8]) {
      row.getCell(col).numFmt = "0.0";
      row.getCell(col).alignment = { horizontal: "right" };
    }
    if (typeof row.getCell(5).value === "number") {
      row.getCell(5).numFmt = "0.0";
      row.getCell(5).alignment = { horizontal: "right" };
    }
    if (sobrecarga) {
      row.fill = SOBRECARGA_FILL;
      row.getCell(9).font = { bold: true, size: 10, color: { argb: "FFB91C1C" } };
    } else {
      row.getCell(9).font = { bold: true, size: 10, color: { argb: "FF047857" } };
    }
  }

  const tableEndRow = tableStartRow + snapshot.comparacion_curva.length;
  ws.autoFilter = {
    from: { row: tableStartRow, column: 1 },
    to: { row: tableEndRow, column: headers.length },
  };

  [22, 16, 16, 12, 12, 18, 18, 16, 12].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function buildHojaCurva(wb: ExcelJS.Workbook, snapshot: ProyeccionHorasSnapshot): void {
  const ws = wb.addWorksheet("Curva objetivo", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = ["Mes", "Año", "Horas disponibles / objetivo mensual", "Fuente", "Observación"];
  const headerRow = ws.addRow(headers);
  styleHeaderRow(headerRow);

  const fuentePorAnio = new Map(snapshot.curvas_usadas.map((c) => [c.anio, c]));

  for (const c of snapshot.comparacion_curva) {
    const anio = Number(c.mes.slice(0, 4));
    const meta = fuentePorAnio.get(anio);
    const fuente =
      meta?.fuente ??
      (c.fuente_curva !== "sin_curva"
        ? `curvas_objetivo_anual.objetivo_mensual (${c.fuente_curva})`
        : "Sin curva objetivo para el año");
    const obs =
      c.observacion ??
      (c.fuente_curva === "sin_curva"
        ? `No hay curva objetivo anual para ${anio}`
        : meta?.curva_nombre
          ? `Curva: ${meta.curva_nombre}`
          : "");

    const row = ws.addRow([labelMesCorto(c.mes), anio, round1(c.horas_disponibles), fuente, obs]);
    row.font = { size: 10 };
    row.getCell(3).numFmt = "0.0";
    row.getCell(3).alignment = { horizontal: "right" };
    if (c.fuente_curva === "sin_curva" || c.observacion) {
      row.getCell(5).font = { size: 10, color: { argb: "FFB45309" } };
    }
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  [12, 8, 36, 55, 40].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

/** Construye el workbook ExcelJS a partir del snapshot (misma fuente que la UI). */
export async function buildProyeccionHorasWorkbook(
  snapshot: ProyeccionHorasSnapshot,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Valtica App";
  wb.created = new Date();
  wb.modified = new Date();
  buildHojaDetalle(wb, snapshot);
  buildHojaResumenWsp(wb, snapshot);
  buildHojaCurva(wb, snapshot);
  return wb;
}

export function nombreArchivoProyeccionHoras(fechaConsulta: string): string {
  const d = (fechaConsulta ?? "").trim() || new Date().toISOString().slice(0, 10);
  return `proyeccion_horas_${d}.xlsx`;
}

/** Genera y descarga el .xlsx en el navegador. */
export async function downloadProyeccionHorasExcel(snapshot: ProyeccionHorasSnapshot): Promise<void> {
  const wb = await buildProyeccionHorasWorkbook(snapshot);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoProyeccionHoras(snapshot.fecha_consulta);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Verificación estructural (tests / smoke): hojas y totales del snapshot. */
export async function verificarEstructuraExcelProyeccion(
  snapshot: ProyeccionHorasSnapshot,
): Promise<{
  ok: boolean;
  hojas: string[];
  nMesesDetalle: number;
  totalSaldoExcel: number;
  totalSaldoSnapshot: number;
  nFilasComparacion: number;
  detalle: string[];
}> {
  const wb = await buildProyeccionHorasWorkbook(snapshot);
  const hojas = wb.worksheets.map((w) => w.name);
  const detalle: string[] = [];
  const expected = ["Detalle Gantt Horas", "Resumen WSP", "Curva objetivo"];
  for (const name of expected) {
    if (!hojas.includes(name)) detalle.push(`Falta hoja: ${name}`);
  }

  const wsDetalle = wb.getWorksheet("Detalle Gantt Horas");
  const header = wsDetalle?.getRow(1);
  const nMesesDetalle = Math.max(0, (header?.cellCount ?? 10) - 10);
  if (nMesesDetalle !== snapshot.meses_horizonte.length) {
    detalle.push(
      `Meses detalle Excel=${nMesesDetalle} vs snapshot=${snapshot.meses_horizonte.length}`,
    );
  }

  // Buscar fila TOTAL GENERAL
  let totalSaldoExcel = NaN;
  if (wsDetalle) {
    wsDetalle.eachRow((row) => {
      if (String(row.getCell(5).value ?? "") === "TOTAL GENERAL") {
        totalSaldoExcel = Number(row.getCell(10).value);
      }
    });
  }
  const totalSaldoSnapshot = round1(snapshot.total_general.saldo_horas_total);
  if (!Number.isFinite(totalSaldoExcel) || Math.abs(totalSaldoExcel - totalSaldoSnapshot) > 0.05) {
    detalle.push(`Total saldo Excel=${totalSaldoExcel} vs snapshot=${totalSaldoSnapshot}`);
  }

  const wsWsp = wb.getWorksheet("Resumen WSP");
  let nFilasComparacion = 0;
  if (wsWsp) {
    wsWsp.eachRow((row, rowNumber) => {
      if (rowNumber > 12 && row.getCell(1).value && String(row.getCell(1).value) !== "Mes") {
        const v = String(row.getCell(9).value ?? "");
        if (v === "OK" || v === "SOBRECARGA") nFilasComparacion += 1;
      }
    });
  }
  if (nFilasComparacion !== snapshot.comparacion_curva.length) {
    detalle.push(
      `Filas WSP=${nFilasComparacion} vs comparacion_curva=${snapshot.comparacion_curva.length}`,
    );
  }

  return {
    ok: detalle.length === 0,
    hojas,
    nMesesDetalle,
    totalSaldoExcel,
    totalSaldoSnapshot,
    nFilasComparacion,
    detalle,
  };
}
