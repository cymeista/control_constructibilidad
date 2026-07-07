/**
 * Manifiesto cerrado — migración histórica INDIRECTA → FESTIVO (PASO 3B temporal).
 * No ampliar ni inferir registros fuera de esta lista.
 */

export interface MigracionFestivoHistoricoManifestEntry {
  registro_hora_id: string;
  profesional_codigo: string;
  fecha: string;
  horas: number;
}

export const MIGRACION_FESTIVOS_HISTORICOS_MANIFEST: readonly MigracionFestivoHistoricoManifestEntry[] =
  [
    // 03-04-2026 — 6 h
    { registro_hora_id: "d0583670-1f93-4976-b969-3d9848992cc5", profesional_codigo: "CL1009502", fecha: "2026-04-03", horas: 6 },
    { registro_hora_id: "e1be2e83-7e11-408a-ae23-12b8e50fd6c5", profesional_codigo: "CL1012513", fecha: "2026-04-03", horas: 6 },
    { registro_hora_id: "abc26d4e-5b50-4c2b-9bd1-ee9df107c7cc", profesional_codigo: "CL1032946", fecha: "2026-04-03", horas: 6 },
    { registro_hora_id: "18d22ee1-49ab-431d-83a9-9f2c7fb58a6a", profesional_codigo: "CL1036783", fecha: "2026-04-03", horas: 6 },
    { registro_hora_id: "0239967e-549d-4d15-8624-4fc601fdf185", profesional_codigo: "CL1042842", fecha: "2026-04-03", horas: 6 },
    { registro_hora_id: "f7473059-2208-4bc9-a0c4-9dc928efaf2d", profesional_codigo: "CL1044599", fecha: "2026-04-03", horas: 6 },
    // 01-05-2026 — 6 h
    { registro_hora_id: "fd6fac5d-d601-4ba9-8d4a-c9825a75bb1d", profesional_codigo: "CL1009502", fecha: "2026-05-01", horas: 6 },
    { registro_hora_id: "b28d0905-c34a-489a-a76b-480248f0c609", profesional_codigo: "CL1012513", fecha: "2026-05-01", horas: 6 },
    { registro_hora_id: "b8cba083-5738-4054-a760-9d5ff608a5b3", profesional_codigo: "CL1032946", fecha: "2026-05-01", horas: 6 },
    { registro_hora_id: "0049615c-ef2d-4cd3-aa68-dd048d99d7bc", profesional_codigo: "CL1036783", fecha: "2026-05-01", horas: 6 },
    { registro_hora_id: "20885c2a-6eea-4483-886c-47932a6a62b9", profesional_codigo: "CL1042842", fecha: "2026-05-01", horas: 6 },
    { registro_hora_id: "d90d1544-d6de-4fe9-9c2a-b3cd1e549de7", profesional_codigo: "CL1044599", fecha: "2026-05-01", horas: 6 },
    // 22-05-2026 — 8,5 h
    { registro_hora_id: "b3621620-a730-48c5-a021-9975219e003c", profesional_codigo: "CL1009502", fecha: "2026-05-22", horas: 8.5 },
    { registro_hora_id: "0d4326a8-d6f2-4851-86af-37810c7db6c7", profesional_codigo: "CL1012513", fecha: "2026-05-22", horas: 8.5 },
    { registro_hora_id: "9b30bc21-82a2-41a0-8399-302cab921da0", profesional_codigo: "CL1032946", fecha: "2026-05-22", horas: 8.5 },
    { registro_hora_id: "c87f9e21-0880-4724-99c9-1dec6a272dfd", profesional_codigo: "CL1036783", fecha: "2026-05-22", horas: 8.5 },
    { registro_hora_id: "63df828d-d0c9-4ff5-9ff7-cd00c7daef58", profesional_codigo: "CL1042842", fecha: "2026-05-22", horas: 8.5 },
    { registro_hora_id: "8ec231ae-741b-486e-889d-fee010b1b25d", profesional_codigo: "CL1044599", fecha: "2026-05-22", horas: 8.5 },
    // 03-07-2026 — 8,5 h
    { registro_hora_id: "d7064f68-cc0f-489a-ae47-aa9787949489", profesional_codigo: "CL1009502", fecha: "2026-07-03", horas: 8.5 },
    { registro_hora_id: "1f6ae9ff-f700-46c6-ae93-f0fbeaa0dfec", profesional_codigo: "CL1012513", fecha: "2026-07-03", horas: 8.5 },
    { registro_hora_id: "8456c24b-87d7-4d26-8d95-26400208286a", profesional_codigo: "CL1032946", fecha: "2026-07-03", horas: 8.5 },
    { registro_hora_id: "d68cc989-3bf6-43de-bdc9-eb29b5681182", profesional_codigo: "CL1036783", fecha: "2026-07-03", horas: 8.5 },
    { registro_hora_id: "dca60444-021c-4d7f-b61e-b89bee7d489e", profesional_codigo: "CL1042842", fecha: "2026-07-03", horas: 8.5 },
    { registro_hora_id: "830211b7-bc88-45d2-bacb-6ae5fe76086b", profesional_codigo: "CL1044599", fecha: "2026-07-03", horas: 8.5 },
  ] as const;

export const MIGRACION_FESTIVOS_HISTORICOS_HORAS_ESPERADAS = 174;
export const MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD = 24;

export const MIGRACION_FESTIVOS_HISTORICOS_CONFIRMACION = "MIGRAR 24 FESTIVOS";
