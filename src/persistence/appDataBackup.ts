/**
 * Contrato único de backup JSON (AppData / valtica_data_v1).
 * Usar desde Configuración para export/import sin omitir colecciones.
 */

export const APP_DATA_BACKUP_VERSION = 4;

/** Todas las colecciones persistidas en AppData (16). */
export const APP_DATA_COLLECTION_KEYS = [
  "clientes",
  "profesionales",
  "pm_internos",
  "proyectos",
  "entregables",
  "asignaciones_horas",
  "equipo_entregable",
  "registro_horas",
  "pipeline",
  "carga_mensual",
  "curvas_objetivo_anual",
  "historial_redistribuciones_horas",
  "evaluaciones_desempeno_profesional",
  "alertas_revisadas",
  "evaluaciones_entregables",
  "preguntas_evaluacion_entregables",
] as const;

export type AppDataCollectionKey = (typeof APP_DATA_COLLECTION_KEYS)[number];

export const BACKUP_COLLECTION_LABELS: Record<AppDataCollectionKey, string> = {
  clientes: "Clientes",
  profesionales: "Profesionales",
  pm_internos: "PM internos",
  proyectos: "Proyectos",
  entregables: "Entregables",
  asignaciones_horas: "Asignaciones de horas",
  equipo_entregable: "Equipo entregable",
  registro_horas: "Registro de Horas",
  pipeline: "Pipeline",
  carga_mensual: "Carga Mensual",
  curvas_objetivo_anual: "Curva objetivo anual",
  historial_redistribuciones_horas: "Historial redistribuciones",
  evaluaciones_desempeno_profesional: "Evaluaciones desempeño",
  alertas_revisadas: "Alertas revisadas",
  evaluaciones_entregables: "Evaluaciones entregables",
  preguntas_evaluacion_entregables: "Preguntas evaluación",
};

export type AppDataBackupSlice = Record<AppDataCollectionKey, unknown[]>;

/** Import: cada clave ausente o no-array → []. Compatible con backups v3 (14 colecciones). */
export function normalizeBackupImport(parsed: Record<string, unknown>): AppDataBackupSlice {
  const out = {} as AppDataBackupSlice;
  for (const key of APP_DATA_COLLECTION_KEYS) {
    const v = parsed[key];
    out[key] = Array.isArray(v) ? v : [];
  }
  return out;
}

export function backupHasRecognizedData(parsed: Record<string, unknown>): boolean {
  return APP_DATA_COLLECTION_KEYS.some((k) => Array.isArray(parsed[k]));
}

/** Export: garantiza las 16 claves aunque falten propiedades en el objeto en memoria. */
export function buildAppDataBackupPayload(data: Record<string, unknown>): AppDataBackupSlice & {
  backup_version: number;
  exported_at: string;
} {
  const collections = normalizeBackupImport(data);
  return {
    backup_version: APP_DATA_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    ...collections,
  };
}
