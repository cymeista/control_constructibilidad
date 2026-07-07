/**
 * Pruebas locales del importador FESTIVO / NC000 (sin persistir datos).
 * Ejecutar: npx tsx scripts/test-festivo-import.ts
 */

import { buildRegistroHoraImportPreview } from "../src/entregables/registroHoraImport";
import { createRegistroHoraSchema } from "../src/components/formularios/schemas";
import type { Entregable, Profesional, Proyecto } from "../src/context/AppDataContext";

const HEADER =
  "proyecto_codigo;cod_fase;cod_tarea;profesional_codigo;fecha;horas;tipo_hora";

const ctx = {
  proyectos: [
    { id: "pr-cent", codigo: "CENT0015A", nombre: "Centro", cliente_id: "c1" } as Proyecto,
    { id: "pr-nc001", codigo: "NC001", nombre: "Vacaciones", cliente_id: "c1" } as Proyecto,
  ],
  entregables: [
    {
      id: "ent-1",
      proyecto_id: "pr-cent",
      fase_codigo: "F1",
      tarea_codigo: "T1",
      nombre: "Entregable test",
    } as Entregable,
  ],
  profesionales: [
    {
      id: "prof-1",
      codigo: "CL1012513",
      nombre_completo: "Test Prof",
      cargo: "P3",
    } as Profesional,
  ],
  registro_horas: [],
  equipo_entregable: [],
};

function csvRow(cells: {
  proyecto_codigo: string;
  cod_fase?: string;
  cod_tarea?: string;
  profesional_codigo?: string;
  fecha?: string;
  horas?: string;
  tipo_hora: string;
}): string {
  return [
    cells.proyecto_codigo,
    cells.cod_fase ?? "****",
    cells.cod_tarea ?? "****",
    cells.profesional_codigo ?? "CL1012513",
    cells.fecha ?? "03-07-2026",
    cells.horas ?? "8.5",
    cells.tipo_hora,
  ].join(";");
}

function runImportCase(
  name: string,
  row: string,
  expectedTipo: string,
  extra?: (payload: NonNullable<ReturnType<typeof buildRegistroHoraImportPreview>["rows"][0]["payload"]>) => void,
): boolean {
  const csv = `${HEADER}\n${row}`;
  const result = buildRegistroHoraImportPreview(csv, ctx);
  const okRow = result.rows.find((r) => r.status === "OK");
  const tipo = okRow?.payload?.tipo_hora;
  const pass = tipo === expectedTipo;
  console.log(`${pass ? "✓" : "✗"} ${name}: esperado=${expectedTipo}, obtenido=${tipo ?? "ERROR"}`);
  if (!pass && okRow === undefined) {
    const err = result.rows[0];
    console.log("  errores:", err?.errors?.join("; "));
  }
  if (pass && extra && okRow?.payload) extra(okRow.payload);
  return pass;
}

let passed = 0;
let total = 0;

function check(name: string, ok: boolean) {
  total++;
  if (ok) passed++;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

total++;
if (
  runImportCase(
    "Caso 1 — NC000 marcado como indirecta",
    csvRow({ proyecto_codigo: "NC000", tipo_hora: "HORAS INDIRECTAS" }),
    "FESTIVO",
    (p) => {
      check("  proyecto_id null", p.proyecto_id === null);
      check("  entregable_id null", p.entregable_id === null);
    },
  )
) {
  passed++;
}

total++;
if (
  runImportCase(
    "Caso 2 — NC000 con espacios y minúsculas",
    csvRow({ proyecto_codigo: " nc000 ", tipo_hora: "HORAS INDIRECTAS" }),
    "FESTIVO",
  )
) {
  passed++;
}

total++;
if (
  runImportCase(
    "Caso 3 — NC001 vacaciones",
    csvRow({ proyecto_codigo: "NC001", tipo_hora: "HORAS VACACIONES" }),
    "VACACIONES",
  )
) {
  passed++;
}

total++;
if (
  runImportCase(
    "Caso 4 — Proyecto normal CENT0015A",
    csvRow({ proyecto_codigo: "CENT0015A", tipo_hora: "HORAS INDIRECTAS" }),
    "INDIRECTA",
  )
) {
  passed++;
}

total++;
if (
  runImportCase(
    "Caso 5 — Tipo explícito HORAS FESTIVOS",
    csvRow({ proyecto_codigo: "", tipo_hora: "HORAS FESTIVOS" }),
    "FESTIVO",
  )
) {
  passed++;
}

const schema = createRegistroHoraSchema([{ id: "ent-1", proyecto_id: "pr-cent" }]);
const caso6 = schema.safeParse({
  profesional_id: "prof-1",
  tipo_hora: "FESTIVO",
  fecha: "2026-07-03",
  horas: 8,
  proyecto_id: null,
  entregable_id: null,
});
total++;
check("Caso 6 — Formulario manual FESTIVO pasa validación", caso6.success);

total++;
if (
  runImportCase(
    "Caso 7 — Regresión DIRECTA",
    csvRow({
      proyecto_codigo: "CENT0015A",
      cod_fase: "F1",
      cod_tarea: "T1",
      tipo_hora: "HORAS DIRECTAS",
    }),
    "DIRECTA",
    (p) => {
      check("  proyecto_id resuelto", p.proyecto_id === "pr-cent");
      check("  entregable_id resuelto", p.entregable_id === "ent-1");
    },
  )
) {
  passed++;
}

total++;
if (
  runImportCase(
    "Caso 8 — Regresión VACACIONES",
    csvRow({ proyecto_codigo: "NC001", tipo_hora: "HORAS VACACIONES" }),
    "VACACIONES",
    (p) => {
      check("  proyecto_id null", p.proyecto_id === null);
    },
  )
) {
  passed++;
}

console.log(`\n${passed}/${total} pruebas OK`);
process.exit(passed === total ? 0 : 1);
