/**
 * Pruebas locales del importador FESTIVO / NC000 (sin persistir datos).
 * Ejecutar: npx tsx scripts/test-festivo-import.ts
 */

import { buildRegistroHoraImportPreview } from "../src/entregables/registroHoraImport";
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
  extra?: (payload: NonNullable<
    ReturnType<typeof buildRegistroHoraImportPreview>["rows"][0]["payload"]
  >) => void,
): boolean {
  const csv = `${HEADER}\n${row}`;
  const result = buildRegistroHoraImportPreview(csv, ctx);
  const okRow = result.rows.find((r) => r.status === "OK");
  const tipo = okRow?.payload?.tipo_hora;
  const pass = tipo === expectedTipo;
  console.log(`${pass ? "✓" : "✗"} ${name}: esperado=${expectedTipo}, obtenido=${tipo ?? "ERROR"}`);
  if (!pass && !okRow) {
    console.log("  errores:", result.rows[0]?.errors?.join("; "));
  }
  if (pass && extra && okRow?.payload) extra(okRow.payload);
  return pass;
}

let failed = 0;

function test(name: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) failed++;
}

test(
  "0 — tipo explícito HORAS FESTIVOS",
  runImportCase(
    "  tipo FESTIVO sin proyecto",
    csvRow({
      proyecto_codigo: "",
      cod_fase: "",
      cod_tarea: "",
      tipo_hora: "HORAS FESTIVOS",
    }),
    "FESTIVO",
    (p) => {
      test("  proyecto_id null", p.proyecto_id === null);
      test("  entregable_id null", p.entregable_id === null);
    },
  ),
);

test(
  "1 — proyecto_codigo = NC000",
  runImportCase(
    "  tipo FESTIVO",
    csvRow({ proyecto_codigo: "NC000", tipo_hora: "HORAS INDIRECTAS" }),
    "FESTIVO",
    (p) => {
      test("  proyecto_id null", p.proyecto_id === null);
      test("  entregable_id null", p.entregable_id === null);
    },
  ),
);

test(
  "2 — cod_tarea = NC000",
  runImportCase(
    "  tipo FESTIVO",
    csvRow({
      proyecto_codigo: "CENT0015A",
      cod_fase: "COD-CL-GRAL",
      cod_tarea: "NC000",
      tipo_hora: "HORAS INDIRECTAS",
    }),
    "FESTIVO",
  ),
);

test(
  "3 — ADMINISTRATIVAS + cod_tarea = NC000",
  runImportCase(
    "  tipo FESTIVO",
    csvRow({
      proyecto_codigo: "ADMINISTRATIVAS",
      cod_fase: "COD-CL-GRAL",
      cod_tarea: "NC000",
      tipo_hora: "HORAS INDIRECTAS",
    }),
    "FESTIVO",
  ),
);

test(
  "4 — NC001 vacaciones",
  runImportCase(
    "  tipo VACACIONES",
    csvRow({ proyecto_codigo: "NC001", tipo_hora: "HORAS VACACIONES" }),
    "VACACIONES",
  ),
);

test(
  "5 — código normal con letras NC no es festivo",
  runImportCase(
    "  tipo INDIRECTA",
    csvRow({ proyecto_codigo: "CENT0015A", tipo_hora: "HORAS INDIRECTAS" }),
    "INDIRECTA",
  ),
);

test(
  "6 — cod_fase = NC000 sin NC000 en proyecto ni tarea",
  runImportCase(
    "  no es festivo",
    csvRow({
      proyecto_codigo: "CENT0015A",
      cod_fase: "NC000",
      cod_tarea: "T1",
      tipo_hora: "HORAS INDIRECTAS",
    }),
    "INDIRECTA",
  ),
);

test(
  "7a — regresión DIRECTA",
  runImportCase(
    "  DIRECTA resuelve proyecto y entregable",
    csvRow({
      proyecto_codigo: "CENT0015A",
      cod_fase: "F1",
      cod_tarea: "T1",
      tipo_hora: "HORAS DIRECTAS",
    }),
    "DIRECTA",
    (p) => {
      test("  proyecto_id resuelto", p.proyecto_id === "pr-cent");
      test("  entregable_id resuelto", p.entregable_id === "ent-1");
    },
  ),
);

test(
  "7b — regresión INDIRECTA",
  runImportCase(
    "  INDIRECTA",
    csvRow({ proyecto_codigo: "CLAOPEMIN", tipo_hora: "HORAS INDIRECTAS" }),
    "INDIRECTA",
  ),
);

test(
  "7c — regresión VACACIONES",
  runImportCase(
    "  VACACIONES",
    csvRow({ proyecto_codigo: "NC001", tipo_hora: "HORAS VACACIONES" }),
    "VACACIONES",
    (p) => test("  proyecto_id null", p.proyecto_id === null),
  ),
);

console.log(failed === 0 ? "\nTodas las pruebas OK" : `\n${failed} prueba(s) fallida(s)`);
process.exit(failed === 0 ? 0 : 1);
