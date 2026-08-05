/**
 * Exportación Excel (.xlsx) de Proyección / Gantt de Horas.
 * Usa exclusivamente el snapshot ya calculado — no recalcula saldos ni distribución.
 */

import ExcelJS from "exceljs";
import type {
  ProyeccionHorasEntregableRow,
  ProyeccionHorasSnapshot,
} from "@/proyeccionHoras/proyeccionHorasTypes";
import { formatDateForDisplay } from "@/lib/localDate";
import {
  clasificarObservacionesSnapshot,
  etiquetaObservacionVista,
} from "@/proyeccionHoras/proyeccionHorasObservaciones";

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
const DARK_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E293B" },
};
const KPI_CAP_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E4A6E" },
};
const KPI_CARGA_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F766E" },
};
const KPI_OK_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF047857" },
};
const KPI_SOBRE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFB91C1C" },
};
const KPI_UTIL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFB45309" },
};
const OK_ROW_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFECFDF5" },
};
const BLACK_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F172A" },
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

type KpisResumenWsp = {
  capacidadBaseTotal: number;
  capacidadTotal: number;
  factorPct: number;
  cargaTotal: number;
  brechaTotal: number;
  utilizacionTotal: number | null;
  mesesSobrecarga: number;
  mesesTotal: number;
  mesCritico: string;
  utilMesCritico: number | null;
  capacidadPromedio: number;
  brechaAcumuladaCierre: number;
};

function calcularKpisResumenWsp(snapshot: ProyeccionHorasSnapshot): KpisResumenWsp {
  const capacidadBaseTotal = snapshot.comparacion_curva.reduce((s, m) => s + m.capacidad_base, 0);
  const capacidadTotal = snapshot.comparacion_curva.reduce((s, m) => s + m.horas_disponibles, 0);
  const cargaTotal = snapshot.total_general.horas_en_horizonte;
  const brechaTotal = round1(capacidadTotal - cargaTotal);
  const utilizacionTotal =
    capacidadTotal > 1e-9 ? round1((cargaTotal / capacidadTotal) * 100) : null;
  const mesesSobrecarga = snapshot.comparacion_curva.filter(
    (c) => c.horas_proyectadas > c.horas_disponibles + 1e-9,
  ).length;
  let mesCritico = "—";
  let utilMesCritico: number | null = null;
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
      utilMesCritico =
        c.utilizacion_pct != null
          ? round1(c.utilizacion_pct)
          : Number.isFinite(u)
            ? round1(u * 100)
            : null;
    }
  }
  const n = snapshot.comparacion_curva.length;
  const capacidadPromedio = n > 0 ? round1(capacidadTotal / n) : 0;
  const last = snapshot.comparacion_curva[n - 1];
  const brechaAcumuladaCierre = last ? round1(last.brecha_acumulada) : 0;
  return {
    capacidadBaseTotal: round1(capacidadBaseTotal),
    capacidadTotal: round1(capacidadTotal),
    factorPct: snapshot.factor_cargabilidad_pct,
    cargaTotal: round1(cargaTotal),
    brechaTotal,
    utilizacionTotal,
    mesesSobrecarga,
    mesesTotal: n,
    mesCritico,
    utilMesCritico,
    capacidadPromedio,
    brechaAcumuladaCierre,
  };
}

function frasesResumenEjecutivo(k: KpisResumenWsp): string[] {
  const lines: string[] = [];
  const absBrecha = Math.abs(k.brechaTotal);
  if (k.brechaTotal < -1e-9) {
    lines.push(
      `La cartera demanda ${k.cargaTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h frente a una capacidad considerada de ${k.capacidadTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h (${k.factorPct}% de la base ${k.capacidadBaseTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h), generando una sobrecarga neta de ${absBrecha.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h.`,
    );
  } else {
    lines.push(
      `La cartera demanda ${k.cargaTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h frente a una capacidad considerada de ${k.capacidadTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h (${k.factorPct}% de la base ${k.capacidadBaseTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h), con holgura neta de ${absBrecha.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h.`,
    );
  }
  if (k.mesesTotal > 0) {
    lines.push(
      `La capacidad considerada mensual promedio es de ${k.capacidadPromedio.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h (factor ${k.factorPct}%).`,
    );
    lines.push(
      `La carga supera la capacidad considerada en ${k.mesesSobrecarga} de ${k.mesesTotal} meses analizados.`,
    );
  }
  if (k.mesCritico !== "—" && k.utilMesCritico != null) {
    lines.push(
      `El mes más crítico es ${k.mesCritico}, con una utilización de ${k.utilMesCritico.toLocaleString("es-CL", { maximumFractionDigits: 1 })}% sobre la capacidad considerada.`,
    );
  }
  if (k.brechaAcumuladaCierre < -1e-9) {
    lines.push(
      `El acumulado proyectado supera la capacidad considerada al cierre del horizonte (brecha acum. ${k.brechaAcumuladaCierre.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h).`,
    );
  } else {
    lines.push(
      `El acumulado proyectado no supera la capacidad considerada al cierre del horizonte (brecha acum. ${k.brechaAcumuladaCierre.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h).`,
    );
  }
  return lines.slice(0, 5);
}

function paintKpiBlock(
  ws: ExcelJS.Worksheet,
  startCol: number,
  label: string,
  value: string,
  fill: ExcelJS.Fill,
): void {
  const r1 = 5;
  const r2 = 7;
  ws.mergeCells(r1, startCol, r1, startCol + 1);
  ws.mergeCells(r2 - 1, startCol, r2, startCol + 1);
  const labelCell = ws.getCell(r1, startCol);
  labelCell.value = label;
  labelCell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
  labelCell.fill = fill;
  labelCell.alignment = { horizontal: "center", vertical: "middle" };
  const valueCell = ws.getCell(r2 - 1, startCol);
  valueCell.value = value;
  valueCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  valueCell.fill = fill;
  valueCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(r1, startCol + 1).fill = fill;
  ws.getCell(r2 - 1, startCol + 1).fill = fill;
  ws.getCell(r2, startCol).fill = fill;
  ws.getCell(r2, startCol + 1).fill = fill;
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

  // Observaciones al final (críticas primero; informativas en bloque aparte)
  ws.addRow([]);
  const obsClasif = clasificarObservacionesSnapshot(snapshot);
  const obsTitle = ws.addRow(["OBSERVACIONES CRÍTICAS"]);
  obsTitle.font = { bold: true, size: 11 };
  const obsHeader = ws.addRow(["Tipo", "Proyecto", "Entregable", "Motivo"]);
  styleHeaderRow(obsHeader);
  obsHeader.fill = OBS_HEADER_FILL;

  if (obsClasif.criticas.length === 0) {
    ws.addRow(["—", "—", "—", "Sin observaciones críticas para la proyección."]);
  } else {
    for (const o of obsClasif.criticas) {
      ws.addRow([
        etiquetaObservacionVista(o.codigo),
        o.proyecto_codigo,
        o.entregable_nombre,
        o.detalle,
      ]);
    }
  }

  ws.addRow([]);
  const infoTitle = ws.addRow([
    `OBSERVACIONES INFORMATIVAS (ocultas en UI por defecto) · completados: ${obsClasif.nCompletados}`,
  ]);
  infoTitle.font = { bold: true, size: 10, color: { argb: "FF64748B" } };
  if (obsClasif.noCriticas.length === 0) {
    ws.addRow(["—", "—", "—", "Sin observaciones informativas."]);
  } else {
    const infoHdr = ws.addRow(["Tipo", "Proyecto", "Entregable", "Motivo"]);
    styleHeaderRow(infoHdr);
    for (const o of obsClasif.noCriticas) {
      ws.addRow([
        etiquetaObservacionVista(o.codigo),
        o.proyecto_codigo,
        o.entregable_nombre,
        o.detalle,
      ]);
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
    views: [{ state: "frozen", ySplit: 4 }],
  });
  const kpis = calcularKpisResumenWsp(snapshot);
  const mesIni = labelMesCorto(snapshot.mes_inicio_horizonte);
  const mesFin = labelMesCorto(snapshot.mes_fin_horizonte);

  ws.mergeCells("A1:M2");
  const title = ws.getCell("A1");
  title.value = "CAPACIDAD PROFESIONAL VS. CARGA DE PROYECTOS";
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.fill = DARK_FILL;
  title.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 1; c <= 13; c++) {
    ws.getCell(1, c).fill = DARK_FILL;
    ws.getCell(2, c).fill = DARK_FILL;
  }
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 18;

  ws.mergeCells("A3:M3");
  const sub = ws.getCell("A3");
  sub.value = `Horizonte ${mesIni}–${mesFin} · Fecha de consulta ${fmtFechaDdMmYyyy(snapshot.fecha_consulta)} · Incluye L2: ${snapshot.incluir_l2 ? "Sí" : "No"} · Capacidad considerada: ${kpis.factorPct}% (base 100%: ${kpis.capacidadBaseTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h)`;
  sub.font = { size: 10, color: { argb: "FFE2E8F0" } };
  sub.fill = DARK_FILL;
  sub.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 1; c <= 13; c++) ws.getCell(3, c).fill = DARK_FILL;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 8;

  const sobrecarga = kpis.brechaTotal < -1e-9;
  paintKpiBlock(
    ws,
    1,
    `CAPACIDAD CONSIDERADA (${kpis.factorPct}%)`,
    `${kpis.capacidadTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h`,
    KPI_CAP_FILL,
  );
  paintKpiBlock(
    ws,
    4,
    "CARGA TOTAL",
    `${kpis.cargaTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h`,
    KPI_CARGA_FILL,
  );
  paintKpiBlock(
    ws,
    7,
    sobrecarga ? "SOBRECARGA" : "BRECHA / HOLGURA",
    `${sobrecarga ? "+" : ""}${Math.abs(kpis.brechaTotal).toLocaleString("es-CL", { maximumFractionDigits: 1 })} h`,
    sobrecarga ? KPI_SOBRE_FILL : KPI_OK_FILL,
  );
  paintKpiBlock(
    ws,
    10,
    "UTILIZACIÓN",
    kpis.utilizacionTotal == null
      ? "—"
      : `${kpis.utilizacionTotal.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`,
    KPI_UTIL_FILL,
  );
  ws.getRow(5).height = 16;
  ws.getRow(6).height = 14;
  ws.getRow(7).height = 22;
  ws.getRow(8).height = 10;

  ws.mergeCells("A9:M9");
  const rej = ws.getCell("A9");
  rej.value = "RESUMEN EJECUTIVO";
  rej.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  rej.fill = BLACK_HEADER_FILL;
  for (let c = 1; c <= 13; c++) ws.getCell(9, c).fill = BLACK_HEADER_FILL;

  const frases = frasesResumenEjecutivo(kpis);
  let rowExec = 10;
  for (const f of frases) {
    ws.mergeCells(rowExec, 1, rowExec, 13);
    const cell = ws.getCell(rowExec, 1);
    cell.value = `• ${f}`;
    cell.font = { size: 10 };
    cell.alignment = { wrapText: true, vertical: "middle" };
    ws.getRow(rowExec).height = 18;
    rowExec += 1;
  }

  rowExec += 1;
  ws.mergeCells(rowExec, 1, rowExec, 13);
  ws.getCell(rowExec, 1).value =
    "Nota técnica: ExcelJS no genera gráficos nativos embebidos; use las tablas mensuales/acumuladas para crear gráficos en Excel.";
  ws.getCell(rowExec, 1).font = { size: 8, italic: true, color: { argb: "FF64748B" } };
  rowExec += 2;

  const detTitleRow = rowExec;
  ws.mergeCells(detTitleRow, 1, detTitleRow, 8);
  ws.getCell(detTitleRow, 1).value = "DETALLE MENSUAL";
  ws.getCell(detTitleRow, 1).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  for (let c = 1; c <= 8; c++) ws.getCell(detTitleRow, c).fill = BLACK_HEADER_FILL;

  ws.mergeCells(detTitleRow, 10, detTitleRow, 13);
  ws.getCell(detTitleRow, 10).value = "EVOLUCIÓN ACUMULADA";
  ws.getCell(detTitleRow, 10).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  for (let c = 10; c <= 13; c++) ws.getCell(detTitleRow, c).fill = BLACK_HEADER_FILL;

  const hdrRow = detTitleRow + 1;
  ["Mes", "Cap. base", "Factor", "Cap. considerada", "Proyectos", "Brecha", "Utilización", "Estado"].forEach(
    (h, i) => {
      const cell = ws.getCell(hdrRow, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      cell.fill = BLACK_HEADER_FILL;
      cell.alignment = { horizontal: "center" };
    },
  );
  ["Mes", "Capacidad acum.", "Proyectos acum.", "Brecha acum."].forEach((h, i) => {
    const cell = ws.getCell(hdrRow, 10 + i);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.fill = BLACK_HEADER_FILL;
    cell.alignment = { horizontal: "center" };
  });

  let dataRow = hdrRow + 1;
  for (const c of snapshot.comparacion_curva) {
    const sobrec = c.horas_proyectadas > c.horas_disponibles + 1e-9;
    const estado = sobrec ? "SOBRECARGA" : "CAPACIDAD DISPONIBLE";
    const fill = sobrec ? SOBRECARGA_FILL : OK_ROW_FILL;

    ws.getCell(dataRow, 1).value = labelMesCorto(c.mes);
    ws.getCell(dataRow, 2).value = round1(c.capacidad_base);
    ws.getCell(dataRow, 2).numFmt = '#,##0.0 "h"';
    ws.getCell(dataRow, 3).value = `${c.factor_cargabilidad_pct}%`;
    ws.getCell(dataRow, 4).value = round1(c.horas_disponibles);
    ws.getCell(dataRow, 4).numFmt = '#,##0.0 "h"';
    ws.getCell(dataRow, 5).value = round1(c.horas_proyectadas);
    ws.getCell(dataRow, 5).numFmt = '#,##0.0 "h"';
    ws.getCell(dataRow, 6).value = round1(c.diferencia);
    ws.getCell(dataRow, 6).numFmt = '#,##0.0 "h"';
    if (c.utilizacion_pct == null) {
      ws.getCell(dataRow, 7).value = "—";
    } else {
      ws.getCell(dataRow, 7).value = round1(c.utilizacion_pct) / 100;
      ws.getCell(dataRow, 7).numFmt = "0.0%";
    }
    ws.getCell(dataRow, 8).value = estado;
    for (let col = 1; col <= 8; col++) {
      ws.getCell(dataRow, col).fill = fill;
      ws.getCell(dataRow, col).font = { size: 9 };
    }
    ws.getCell(dataRow, 8).font = {
      bold: true,
      size: 9,
      color: { argb: sobrec ? "FFB91C1C" : "FF047857" },
    };

    ws.getCell(dataRow, 10).value = labelMesCorto(c.mes);
    ws.getCell(dataRow, 11).value = round1(c.acumulado_disponible);
    ws.getCell(dataRow, 11).numFmt = '#,##0.0 "h"';
    ws.getCell(dataRow, 12).value = round1(c.acumulado_proyectado);
    ws.getCell(dataRow, 12).numFmt = '#,##0.0 "h"';
    ws.getCell(dataRow, 13).value = round1(c.brecha_acumulada);
    ws.getCell(dataRow, 13).numFmt = '#,##0.0 "h"';
    for (let col = 10; col <= 13; col++) {
      ws.getCell(dataRow, col).fill = fill;
      ws.getCell(dataRow, col).font = { size: 9 };
    }
    dataRow += 1;
  }

  [11, 11, 9, 14, 12, 11, 11, 20, 3, 11, 14, 14, 12].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function buildHojaCurva(wb: ExcelJS.Workbook, snapshot: ProyeccionHorasSnapshot): void {
  const ws = wb.addWorksheet("Curva objetivo", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Mes",
    "Capacidad base 100%",
    "Factor aplicado",
    "Capacidad considerada",
    "Fuente",
    "Observación",
  ];
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

    const row = ws.addRow([
      labelMesCorto(c.mes),
      round1(c.capacidad_base),
      `${c.factor_cargabilidad_pct}%`,
      round1(c.horas_disponibles),
      fuente,
      obs,
    ]);
    row.font = { size: 10 };
    row.getCell(2).numFmt = "0.0";
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(4).numFmt = "0.0";
    row.getCell(4).alignment = { horizontal: "right" };
    if (c.fuente_curva === "sin_curva" || c.observacion) {
      row.getCell(6).font = { size: 10, color: { argb: "FFB45309" } };
    }
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  [12, 18, 14, 20, 55, 40].forEach((w, i) => {
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
  const tituloOk =
    String(wsWsp?.getCell("A1").value ?? "").includes("CAPACIDAD PROFESIONAL VS. CARGA");
  if (!tituloOk) detalle.push("Resumen WSP sin título ejecutivo esperado");
  if (wsWsp) {
    wsWsp.eachRow((row) => {
      const estado = String(row.getCell(8).value ?? "");
      if (estado === "SOBRECARGA" || estado === "CAPACIDAD DISPONIBLE") nFilasComparacion += 1;
    });
  }
  if (nFilasComparacion !== snapshot.comparacion_curva.length) {
    detalle.push(
      `Filas WSP=${nFilasComparacion} vs comparacion_curva=${snapshot.comparacion_curva.length}`,
    );
  }

  const kpis = calcularKpisResumenWsp(snapshot);
  const cargaCell = String(wsWsp?.getCell(6, 4).value ?? "");
  if (!cargaCell.includes(String(Math.floor(kpis.cargaTotal))) && kpis.cargaTotal > 0) {
    // KPI CARGA TOTAL está en col 4–5, fila 6 (valor); validación laxa por locale
    const anyKpi =
      String(wsWsp?.getCell(5, 1).value ?? "").includes("CAPACIDAD") ||
      String(wsWsp?.getCell(5, 4).value ?? "").includes("CARGA");
    if (!anyKpi) detalle.push("Resumen WSP sin bloques KPI esperados");
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
