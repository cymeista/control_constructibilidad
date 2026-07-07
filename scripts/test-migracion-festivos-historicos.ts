/**
 * Pruebas PASO 3B — migración festivos históricos (sin persistir ni tocar Supabase).
 * Ejecutar: npx tsx scripts/test-migracion-festivos-historicos.ts
 */

import type { Profesional, RegistroHora } from "../src/context/AppDataContext";
import {
  MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD,
  MIGRACION_FESTIVOS_HISTORICOS_HORAS_ESPERADAS,
  MIGRACION_FESTIVOS_HISTORICOS_MANIFEST,
} from "../src/horas/migracionFestivosHistoricosManifest";
import {
  aplicarMigracionFestivosHistoricosEnRegistros,
  ejecutarPreflightMigracionFestivosHistoricos,
  simularRegistroHorasMigradosFestivos,
} from "../src/horas/migracionFestivosHistoricosPreflight";

const PROF_MAP: Record<string, { id: string; nombre: string }> = {
  CL1009502: { id: "7485c6ac-f434-4473-994d-329ef9c91e9e", nombre: "Michael Patrick Ross Alvarez" },
  CL1012513: { id: "422d795c-a3d7-40f2-a66f-ed04f416ebd3", nombre: "Alberto Ordoñez Polo" },
  CL1032946: { id: "p1", nombre: "Nicolás Alejandro Cifuentes Montoya" },
  CL1036783: { id: "6d276e56-b32b-461a-bbd7-09fce061452f", nombre: "Ricardo Atala Gattás Pérez" },
  CL1042842: { id: "c1b565b4-63c5-4e3f-8068-4e0fa73c630a", nombre: "Javier Andres Hernandez Farias" },
  CL1044599: { id: "3af4abf3-822b-4fca-813e-ade4babf91d5", nombre: "Dario Alonso Lara Sandoval" },
};

const profesionales: Profesional[] = Object.entries(PROF_MAP).map(([codigo, p]) => ({
  id: p.id,
  codigo,
  nombre_completo: p.nombre,
  cargo: "P3",
  activo: true,
  created_at: "",
  updated_at: "",
})) as Profesional[];

function buildManifestRegs(tipo: "INDIRECTA" | "FESTIVO"): RegistroHora[] {
  return MIGRACION_FESTIVOS_HISTORICOS_MANIFEST.map((m) => ({
    id: m.registro_hora_id,
    profesional_id: PROF_MAP[m.profesional_codigo]!.id,
    proyecto_id: null,
    entregable_id: null,
    tipo_hora: tipo,
    fecha: m.fecha,
    horas: m.horas,
    descripcion: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }));
}

let failed = 0;
function test(name: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) failed++;
}

const ids = MIGRACION_FESTIVOS_HISTORICOS_MANIFEST.map((m) => m.registro_hora_id);
test("1 — Manifiesto con 24 IDs únicos", new Set(ids).size === 24 && ids.length === 24);

const horasSum = MIGRACION_FESTIVOS_HISTORICOS_MANIFEST.reduce((s, m) => s + m.horas, 0);
test("2 — Suma esperada 174 horas", horasSum === MIGRACION_FESTIVOS_HISTORICOS_HORAS_ESPERADAS);

const regsIndirecta = buildManifestRegs("INDIRECTA");
const pfOk = ejecutarPreflightMigracionFestivosHistoricos(regsIndirecta, profesionales);
test("3 — Preflight LISTO con 24 INDIRECTA", pfOk.estado_global === "LISTO_PARA_MIGRAR");
test("  horas a reclasificar", pfOk.horas_a_reclasificar === 174);

const regsFestivo = buildManifestRegs("FESTIVO");
const pfYa = ejecutarPreflightMigracionFestivosHistoricos(regsFestivo, profesionales);
test("4 — Preflight YA_MIGRADO con 24 FESTIVO", pfYa.estado_global === "YA_MIGRADO");

const missing = regsIndirecta.filter((r) => r.id !== ids[0]);
const pfMissing = ejecutarPreflightMigracionFestivosHistoricos(missing, profesionales);
test("5 — Bloqueo si falta un ID", pfMissing.estado_global === "BLOQUEADO");

const badFecha = regsIndirecta.map((r) =>
  r.id === ids[0]! ? { ...r, fecha: "2026-01-01" } : r,
);
test(
  "6 — Bloqueo si cambia fecha",
  ejecutarPreflightMigracionFestivosHistoricos(badFecha, profesionales).estado_global === "BLOQUEADO",
);

const badHoras = regsIndirecta.map((r) =>
  r.id === ids[0]! ? { ...r, horas: 7 } : r,
);
test(
  "7 — Bloqueo si cambian horas",
  ejecutarPreflightMigracionFestivosHistoricos(badHoras, profesionales).estado_global === "BLOQUEADO",
);

const badProf = regsIndirecta.map((r) =>
  r.id === ids[0]! ? { ...r, profesional_id: "otro-id" } : r,
);
test(
  "8 — Bloqueo si cambia profesional",
  ejecutarPreflightMigracionFestivosHistoricos(badProf, profesionales).estado_global === "BLOQUEADO",
);

const mixed = regsIndirecta.map((r, i) =>
  i === 0 ? { ...r, tipo_hora: "FESTIVO" as const } : r,
);
test(
  "9 — Bloqueo estado mixto",
  ejecutarPreflightMigracionFestivosHistoricos(mixed, profesionales).estado_global === "BLOQUEADO",
);

const badProj = regsIndirecta.map((r) =>
  r.id === ids[0]! ? { ...r, proyecto_id: "pr-x" } : r,
);
test(
  "10 — Bloqueo si proyecto_id no null",
  ejecutarPreflightMigracionFestivosHistoricos(badProj, profesionales).estado_global === "BLOQUEADO",
);

const beforeLen = regsIndirecta.length;
const beforeJson = JSON.stringify(regsIndirecta);
ejecutarPreflightMigracionFestivosHistoricos(regsIndirecta, profesionales);
test("11 — Preflight no modifica arreglo", JSON.stringify(regsIndirecta) === beforeJson);
test("  longitud conservada", regsIndirecta.length === beforeLen);

const sim = simularRegistroHorasMigradosFestivos(regsIndirecta, "2026-07-07T12:00:00.000Z");
const manifestIdSet = new Set(ids);
let soloTipo = true;
for (let i = 0; i < regsIndirecta.length; i++) {
  const a = regsIndirecta[i]!;
  const b = sim[i]!;
  if (!manifestIdSet.has(a.id)) continue;
  if (a.tipo_hora !== "INDIRECTA") continue;
  if (
    a.id !== b.id ||
    a.profesional_id !== b.profesional_id ||
    a.fecha !== b.fecha ||
    a.horas !== b.horas ||
    a.proyecto_id !== b.proyecto_id ||
    a.entregable_id !== b.entregable_id ||
    a.descripcion !== b.descripcion ||
    a.created_at !== b.created_at
  ) {
    soloTipo = false;
  }
  if (b.tipo_hora !== "FESTIVO") soloTipo = false;
}
test("12 — Simulación solo cambia tipo_hora (+ updated_at)", soloTipo);

const applied = aplicarMigracionFestivosHistoricosEnRegistros(
  regsIndirecta,
  profesionales,
  "2026-07-07T12:00:00.000Z",
);
test(
  "13 — Total registros conservado al aplicar",
  applied.ok && applied.next.length === regsIndirecta.length,
);

const applied2 = aplicarMigracionFestivosHistoricosEnRegistros(
  applied.ok ? applied.next : [],
  profesionales,
  "2026-07-07T12:00:01.000Z",
);
test("14 — Segunda aplicación bloqueada (YA_MIGRADO)", applied2.ok === false);

if (applied.ok) {
  test("  suma INDIRECTA+FESTIVO conservada", applied.result.suma_combinada_antes === applied.result.suma_combinada_despues);
  test("  24 registros reclasificados", applied.result.registros_reclasificados === 24);
}

console.log(failed === 0 ? "\nTodas las pruebas OK" : `\n${failed} prueba(s) fallida(s)`);
process.exit(failed === 0 ? 0 : 1);
