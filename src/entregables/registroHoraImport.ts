/**
 * Importación masiva de horas → RegistroHora (vista previa + payloads).
 * DIRECTA: proyecto + fase/tarea + profesional + fecha + horas (alimenta consumo real vía modelo existente).
 * INDIRECTA / VACACIONES: profesional + fecha + horas; proyecto/entregable se ignoran y persisten en null.
 */

import { format, isValid, parse } from "date-fns";
import type { Entregable, Profesional, Proyecto, RegistroHora } from "@/context/AppDataContext";

export const REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS = [
  "proyecto_codigo",
  "cod_fase",
  "cod_tarea",
  "profesional_codigo",
  "fecha",
  "horas",
  "tipo_hora",
] as const;

export type RegistroHoraImportColumn = (typeof REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS)[number];

/** Texto planilla (normalizado) → tipo interno. Claves en minúsculas tras `normalizeTipoHoraText`. */
export const TIPO_HORA_TEXTO_A_INTERNO: ReadonlyArray<readonly [string, RegistroHora["tipo_hora"]]> = [
  ["horas directas", "DIRECTA"],
  ["hora directa", "DIRECTA"],
  ["horas directa", "DIRECTA"],
  ["directa", "DIRECTA"],
  ["horas indirectas", "INDIRECTA"],
  ["horas indirecta", "INDIRECTA"],
  ["hora indirecta", "INDIRECTA"],
  ["indirecta", "INDIRECTA"],
  ["vacaciones", "VACACIONES"],
  ["horas vacaciones", "VACACIONES"],
  ["hora vacaciones", "VACACIONES"],
  ["vacacion", "VACACIONES"],
];

const TIPO_HORA_LOOKUP = new Map<string, RegistroHora["tipo_hora"]>(
  TIPO_HORA_TEXTO_A_INTERNO.map(([k, v]) => [k, v]),
);

const MAX_HORAS_IMPORT = 168;

export type RegistroHoraImportRowStatus = "OK" | "ERROR";

export interface RegistroHoraImportPreviewRow {
  /** Índice de fila de datos (1 = primera fila después del encabezado). */
  lineIndex: number;
  cells: Record<RegistroHoraImportColumn, string>;
  status: RegistroHoraImportRowStatus;
  errors: string[];
  proyecto_id?: string;
  entregable_id?: string;
  profesional_id?: string;
  /** Listo para `addRegistroHorasBatch` cuando status === OK. */
  payload?: Omit<RegistroHora, "id" | "created_at" | "updated_at">;
}

export interface RegistroHoraImportPreviewResult {
  rows: RegistroHoraImportPreviewRow[];
  headersError: string | null;
  totals: { all: number; ok: number; error: number };
}

export function normalizeImportHeaderCell(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeTipoHoraText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Resuelve texto de planilla a enum interno; null si no hay entrada en la tabla. */
export function mapTipoHoraFromPlanilla(text: string): RegistroHora["tipo_hora"] | null {
  const key = normalizeTipoHoraText(text);
  if (!key) return null;
  return TIPO_HORA_LOOKUP.get(key) ?? null;
}

export type CsvDelimiter = "," | ";";

/** Una línea física de CSV (sin salto de línea). Respeta comillas; `delimiter` es `,` o `;`. */
function parseCsvLine(line: string, delimiter: CsvDelimiter): string[] {
  const row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  row.push(cell);
  return row;
}

function firstNonEmptyPhysicalLine(text: string): string {
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (line.trim() !== "") return line;
  }
  return "";
}

/**
 * Elige `;` si la primera línea no vacía produce más columnas que con `,`
 * (típico Excel regional ES/CL). Si empatan, se mantiene `,` (comportamiento previo).
 */
export function detectCsvDelimiterFromText(text: string): CsvDelimiter {
  const t = text.replace(/^\uFEFF/, "");
  const headerLine = firstNonEmptyPhysicalLine(t);
  if (!headerLine) return ",";
  const byComma = parseCsvLine(headerLine, ",");
  const bySemi = parseCsvLine(headerLine, ";");
  if (bySemi.length > byComma.length) return ";";
  return ",";
}

/** CSV mínimo: separador `,` o `;` (autodetectado en la cabecera), comillas dobles opcionales. */
export function parseCsvToMatrix(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiterFromText(t);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  const flushCell = () => {
    row.push(cell);
    cell = "";
  };
  const flushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < t.length) {
    const c = t[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      flushCell();
      i++;
      continue;
    }
    if (c === "\r") {
      if (t[i + 1] === "\n") {
        flushCell();
        flushRow();
        i += 2;
        continue;
      }
    }
    if (c === "\n") {
      flushCell();
      flushRow();
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  flushCell();
  if (row.length > 0) rows.push(row);

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseHorasCell(raw: string): { ok: true; value: number } | { ok: false; message: string } {
  const s = raw.trim().replace(",", ".");
  if (s === "") return { ok: false, message: "horas vacías" };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, message: "horas no numéricas" };
  if (n <= 0) return { ok: false, message: "horas deben ser > 0" };
  if (n > MAX_HORAS_IMPORT) return { ok: false, message: `horas no pueden superar ${MAX_HORAS_IMPORT}` };
  return { ok: true, value: n };
}

const FECHA_FORMATOS = ["dd-MM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd"] as const;

function parseFechaPlanilla(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  for (const f of FECHA_FORMATOS) {
    const d = parse(t, f, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }
  return null;
}

function rowIsBlank(cells: Record<RegistroHoraImportColumn, string>): boolean {
  return REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS.every((k) => !(cells[k]?.trim()));
}

function findEntregablesPorFaseTarea(
  entregables: Entregable[],
  proyectoId: string,
  codFase: string,
  codTarea: string,
): Entregable[] {
  const f = codFase.trim();
  const ta = codTarea.trim();
  return entregables.filter(
    (e) =>
      e.proyecto_id === proyectoId &&
      (e.fase_codigo ?? "").trim() === f &&
      (e.tarea_codigo ?? "").trim() === ta,
  );
}

export interface RegistroHoraImportContext {
  proyectos: Proyecto[];
  entregables: Entregable[];
  profesionales: Profesional[];
}

export function buildRegistroHoraImportPreview(
  csvText: string,
  ctx: RegistroHoraImportContext,
): RegistroHoraImportPreviewResult {
  const matrix = parseCsvToMatrix(csvText);
  if (matrix.length === 0) {
    return {
      rows: [],
      headersError: "El archivo no contiene filas.",
      totals: { all: 0, ok: 0, error: 0 },
    };
  }

  const headerRow = matrix[0]!.map((h) => normalizeImportHeaderCell(h));
  const colIndex: Partial<Record<RegistroHoraImportColumn, number>> = {};
  headerRow.forEach((h, idx) => {
    if (REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS.includes(h as RegistroHoraImportColumn)) {
      colIndex[h as RegistroHoraImportColumn] = idx;
    }
  });

  const missing = REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS.filter((k) => colIndex[k] === undefined);
  if (missing.length > 0) {
    return {
      rows: [],
      headersError: `Faltan columnas obligatorias: ${missing.join(", ")}. Use exactamente: ${REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS.join(", ")}.`,
      totals: { all: 0, ok: 0, error: 0 },
    };
  }

  const projByCodigo = new Map(ctx.proyectos.map((p) => [p.codigo.trim(), p]));
  const profByCodigo = new Map(ctx.profesionales.map((p) => [p.codigo.trim(), p]));

  const rows: RegistroHoraImportPreviewRow[] = [];
  let ok = 0;
  let error = 0;

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r]!;
    const cells = {} as Record<RegistroHoraImportColumn, string>;
    for (const k of REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS) {
      const idx = colIndex[k]!;
      cells[k] = (line[idx] ?? "").trim();
    }

    if (rowIsBlank(cells)) continue;

    const lineIndex = r;
    const errors: string[] = [];
    const profCod = cells.profesional_codigo.trim();

    if (!(cells.tipo_hora ?? "").trim()) errors.push("tipo_hora vacío");
    const tipoResolved = mapTipoHoraFromPlanilla(cells.tipo_hora ?? "");
    if ((cells.tipo_hora ?? "").trim() && tipoResolved === null) {
      errors.push("tipo_hora no reconocido");
    }

    const horasParsed =
      (cells.horas ?? "").trim() === ""
        ? ({ ok: false as const, message: "horas vacías" })
        : parseHorasCell(cells.horas ?? "");
    if (!horasParsed.ok) errors.push(horasParsed.message);

    if (!(cells.fecha ?? "").trim()) errors.push("fecha vacía");
    const fechaIso = (cells.fecha ?? "").trim() ? parseFechaPlanilla(cells.fecha ?? "") : null;
    if ((cells.fecha ?? "").trim() && !fechaIso) {
      errors.push(`fecha no válida (formatos: ${FECHA_FORMATOS.join(", ")})`);
    }

    if (!profCod) errors.push("profesional_codigo vacío");

    let proyecto_id: string | undefined;
    let entregable_id: string | undefined;
    let profesional_id: string | undefined;

    const profesional = profCod ? profByCodigo.get(profCod) : undefined;
    if (profCod && !profesional) errors.push(`profesional no encontrado: ${profCod}`);
    else if (profesional) profesional_id = profesional.id;

    if (tipoResolved === "DIRECTA") {
      const proyectoCod = cells.proyecto_codigo.trim();
      if (!proyectoCod) errors.push("proyecto_codigo vacío");
      if (!(cells.cod_fase ?? "").trim()) errors.push("cod_fase vacío");
      if (!(cells.cod_tarea ?? "").trim()) errors.push("cod_tarea vacío");

      const proyecto = proyectoCod ? projByCodigo.get(proyectoCod) : undefined;
      if (proyectoCod && !proyecto) errors.push(`proyecto no encontrado: ${proyectoCod}`);
      else if (proyecto) proyecto_id = proyecto.id;

      if (proyecto && (cells.cod_fase ?? "").trim() && (cells.cod_tarea ?? "").trim()) {
        const matches = findEntregablesPorFaseTarea(ctx.entregables, proyecto.id, cells.cod_fase, cells.cod_tarea);
        if (matches.length === 0) {
          errors.push("no existe entregable con esa fase y tarea en el proyecto");
        } else if (matches.length > 1) {
          errors.push("más de un entregable coincide (fase/tarea ambigua en el proyecto)");
        } else {
          entregable_id = matches[0]!.id;
        }
      }
    }

    let canImport = false;
    let payload: Omit<RegistroHora, "id" | "created_at" | "updated_at"> | undefined;

    if (tipoResolved === "DIRECTA") {
      canImport =
        errors.length === 0 &&
        horasParsed.ok &&
        Boolean(fechaIso) &&
        Boolean(proyecto_id) &&
        Boolean(entregable_id) &&
        Boolean(profesional_id);
      if (canImport && horasParsed.ok) {
        payload = {
          profesional_id: profesional_id!,
          proyecto_id: proyecto_id!,
          entregable_id: entregable_id!,
          tipo_hora: "DIRECTA",
          fecha: fechaIso!,
          horas: horasParsed.value,
          descripcion: null,
        };
      }
    } else if (tipoResolved === "INDIRECTA" || tipoResolved === "VACACIONES") {
      canImport =
        errors.length === 0 && horasParsed.ok && Boolean(fechaIso) && Boolean(profesional_id);
      if (canImport && horasParsed.ok) {
        payload = {
          profesional_id: profesional_id!,
          proyecto_id: null,
          entregable_id: null,
          tipo_hora: tipoResolved,
          fecha: fechaIso!,
          horas: horasParsed.value,
          descripcion: null,
        };
      }
    }

    if (canImport && payload) {
      ok++;
      rows.push({
        lineIndex,
        cells,
        status: "OK",
        errors: [],
        proyecto_id: payload.proyecto_id ?? undefined,
        entregable_id: payload.entregable_id ?? undefined,
        profesional_id: payload.profesional_id,
        payload,
      });
    } else {
      error++;
      const errList =
        errors.length > 0
          ? errors
          : ["No se pudo construir el registro (revisar datos)"];
      rows.push({
        lineIndex,
        cells,
        status: "ERROR",
        errors: errList,
        proyecto_id,
        entregable_id,
        profesional_id,
      });
    }
  }

  return {
    rows,
    headersError: null,
    totals: { all: rows.length, ok, error },
  };
}

export function payloadsFromOkRows(result: RegistroHoraImportPreviewResult): Omit<
  RegistroHora,
  "id" | "created_at" | "updated_at"
>[] {
  return result.rows.filter((r) => r.status === "OK" && r.payload).map((r) => r.payload!);
}

const REGISTRO_HORA_IMPORT_ERROR_EXPORT_HEADERS = [
  "linea",
  "estado",
  ...REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS,
  "proyecto_id",
  "entregable_id",
  "profesional_id",
  "errores",
] as const;

function escapeHtmlCell(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Filas con status ERROR de la vista previa (misma validación que la tabla del diálogo). */
export function registroHoraImportFilasConError(
  preview: RegistroHoraImportPreviewResult,
): RegistroHoraImportPreviewRow[] {
  return preview.rows.filter((r) => r.status === "ERROR");
}

/**
 * Descarga un .xls (HTML) con las filas en error para corregir en Excel.
 * @returns false si no hay filas con error.
 */
export function downloadRegistroHoraImportErroresExcel(
  preview: RegistroHoraImportPreviewResult,
  sourceFileName?: string | null,
): boolean {
  const errorRows = registroHoraImportFilasConError(preview);
  if (errorRows.length === 0) return false;

  const headerCells = REGISTRO_HORA_IMPORT_ERROR_EXPORT_HEADERS.map(
    (h) => `<th>${escapeHtmlCell(h)}</th>`,
  ).join("");

  const bodyRows = errorRows
    .map((row) => {
      const cells = [
        String(row.lineIndex),
        row.status,
        ...REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS.map((k) => row.cells[k] ?? ""),
        row.proyecto_id ?? "",
        row.entregable_id ?? "",
        row.profesional_id ?? "",
        row.errors.join("; "),
      ];
      return `<tr>${cells.map((c) => `<td>${escapeHtmlCell(c)}</td>`).join("")}</tr>`;
    })
    .join("");

  const html = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" /></head><body><table border="1"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;

  const base = (sourceFileName ?? "importacion_horas").replace(/\.(csv|xls|xlsx)$/i, "");
  const filename = `${base}_errores.xls`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
