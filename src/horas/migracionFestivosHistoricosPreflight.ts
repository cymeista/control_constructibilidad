import type { Profesional, RegistroHora } from "@/context/AppDataContext";
import {
  MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD,
  MIGRACION_FESTIVOS_HISTORICOS_HORAS_ESPERADAS,
  MIGRACION_FESTIVOS_HISTORICOS_MANIFEST,
  type MigracionFestivoHistoricoManifestEntry,
} from "@/horas/migracionFestivosHistoricosManifest";

export type MigracionFestivosEstadoGlobal =
  | "LISTO_PARA_MIGRAR"
  | "YA_MIGRADO"
  | "BLOQUEADO";

export type MigracionFestivosEstadoFila = "OK_INDIRECTA" | "OK_FESTIVO" | "BLOQUEADO";

export interface MigracionFestivosPreflightFila {
  estado_fila: MigracionFestivosEstadoFila;
  registro_hora_id: string;
  profesional_nombre: string;
  profesional_codigo: string;
  profesional_id: string;
  fecha: string;
  horas: number;
  tipo_actual: string;
  tipo_propuesto: "FESTIVO";
  validacion: string;
  encontrado: boolean;
}

export interface MigracionFestivosPreflightResult {
  estado_global: MigracionFestivosEstadoGlobal;
  filas: MigracionFestivosPreflightFila[];
  manifest_count: number;
  manifest_ids_unicos: boolean;
  horas_esperadas_manifest: number;
  registros_encontrados: number;
  registros_validos: number;
  registros_bloqueados: number;
  horas_a_reclasificar: number;
  horas_indirecta_actual: number;
  horas_festivo_actual: number;
  horas_indirecta_despues: number;
  horas_festivo_despues: number;
  suma_combinada_actual: number;
  suma_combinada_despues: number;
  total_registro_horas: number;
  indirecta_en_manifest: number;
  festivo_en_manifest: number;
  mensajes_bloqueo: string[];
}

export type MigracionFestivosAplicacionResult =
  | {
      ok: true;
      registros_reclasificados: number;
      horas_reclasificadas: number;
      horas_indirecta_antes: number;
      horas_festivo_antes: number;
      horas_indirecta_despues: number;
      horas_festivo_despues: number;
      suma_combinada_antes: number;
      suma_combinada_despues: number;
      total_registro_horas_antes: number;
      total_registro_horas_despues: number;
    }
  | {
      ok: false;
      error: string;
    };

function sumHorasTipo(regs: RegistroHora[], tipo: RegistroHora["tipo_hora"]): number {
  return regs
    .filter((r) => r.tipo_hora === tipo)
    .reduce((s, r) => s + Number(r.horas), 0);
}

function profCodigoDe(
  reg: RegistroHora | undefined,
  profesionales: Profesional[],
): string {
  if (!reg) return "";
  const p = profesionales.find((x) => x.id === reg.profesional_id);
  return (p?.codigo ?? "").trim().toUpperCase();
}

function profNombreDe(
  reg: RegistroHora | undefined,
  profesionales: Profesional[],
): string {
  if (!reg) return "";
  return profesionales.find((x) => x.id === reg.profesional_id)?.nombre_completo ?? "";
}

function validarFilaManifest(
  entry: MigracionFestivoHistoricoManifestEntry,
  reg: RegistroHora | undefined,
  profesionales: Profesional[],
): { estado_fila: MigracionFestivosEstadoFila; validacion: string; encontrado: boolean } {
  if (!reg) {
    return { estado_fila: "BLOQUEADO", validacion: "ID no encontrado en registro_horas", encontrado: false };
  }

  const issues: string[] = [];
  const cod = profCodigoDe(reg, profesionales);
  if (cod !== entry.profesional_codigo.trim().toUpperCase()) {
    issues.push(`código profesional esperado ${entry.profesional_codigo}, obtenido ${cod || "—"}`);
  }
  if ((reg.fecha ?? "").trim() !== entry.fecha) {
    issues.push(`fecha esperada ${entry.fecha}, obtenida ${reg.fecha}`);
  }
  if (Number(reg.horas) !== entry.horas) {
    issues.push(`horas esperadas ${entry.horas}, obtenidas ${reg.horas}`);
  }
  if ((reg.proyecto_id ?? "").trim() !== "") {
    issues.push("proyecto_id debe ser null");
  }
  if ((reg.entregable_id ?? "").trim() !== "") {
    issues.push("entregable_id debe ser null");
  }

  if (reg.tipo_hora !== "INDIRECTA" && reg.tipo_hora !== "FESTIVO") {
    issues.push(`tipo_hora no permitido: ${reg.tipo_hora}`);
  }

  if (issues.length > 0) {
    return { estado_fila: "BLOQUEADO", validacion: issues.join("; "), encontrado: true };
  }

  if (reg.tipo_hora === "FESTIVO") {
    return { estado_fila: "OK_FESTIVO", validacion: "Ya es FESTIVO", encontrado: true };
  }

  return { estado_fila: "OK_INDIRECTA", validacion: "Listo para migrar", encontrado: true };
}

export function ejecutarPreflightMigracionFestivosHistoricos(
  registro_horas: RegistroHora[],
  profesionales: Profesional[],
): MigracionFestivosPreflightResult {
  const manifest = MIGRACION_FESTIVOS_HISTORICOS_MANIFEST;
  const manifestIds = manifest.map((m) => m.registro_hora_id);
  const manifestIdsUnicos = new Set(manifestIds);
  const horasManifest = manifest.reduce((s, m) => s + m.horas, 0);

  const mensajes_bloqueo: string[] = [];

  if (manifest.length !== MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD) {
    mensajes_bloqueo.push(`Manifiesto debe tener ${MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD} entradas`);
  }
  if (manifestIdsUnicos.size !== manifest.length) {
    mensajes_bloqueo.push("Manifiesto contiene IDs duplicados");
  }
  if (horasManifest !== MIGRACION_FESTIVOS_HISTORICOS_HORAS_ESPERADAS) {
    mensajes_bloqueo.push(
      `Horas del manifiesto deben sumar ${MIGRACION_FESTIVOS_HISTORICOS_HORAS_ESPERADAS}, suman ${horasManifest}`,
    );
  }

  const regById = new Map(registro_horas.map((r) => [r.id, r]));

  const filas: MigracionFestivosPreflightFila[] = manifest.map((entry) => {
    const reg = regById.get(entry.registro_hora_id);
    const v = validarFilaManifest(entry, reg, profesionales);
    return {
      estado_fila: v.estado_fila,
      registro_hora_id: entry.registro_hora_id,
      profesional_nombre: profNombreDe(reg, profesionales),
      profesional_codigo: entry.profesional_codigo,
      profesional_id: reg?.profesional_id ?? "",
      fecha: entry.fecha,
      horas: entry.horas,
      tipo_actual: reg?.tipo_hora ?? "—",
      tipo_propuesto: "FESTIVO",
      validacion: v.validacion,
      encontrado: v.encontrado,
    };
  });

  const registros_encontrados = filas.filter((f) => f.encontrado).length;
  const registros_bloqueados = filas.filter((f) => f.estado_fila === "BLOQUEADO").length;
  const indirecta_en_manifest = filas.filter((f) => f.estado_fila === "OK_INDIRECTA").length;
  const festivo_en_manifest = filas.filter((f) => f.estado_fila === "OK_FESTIVO").length;
  const registros_validos = indirecta_en_manifest + festivo_en_manifest;

  if (registros_encontrados !== MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD) {
    mensajes_bloqueo.push(
      `Se encontraron ${registros_encontrados}/${MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD} registros del manifiesto`,
    );
  }
  if (registros_bloqueados > 0) {
    mensajes_bloqueo.push(`${registros_bloqueados} fila(s) del manifiesto con validación bloqueada`);
  }
  if (indirecta_en_manifest > 0 && festivo_en_manifest > 0) {
    mensajes_bloqueo.push("Estado mixto: algunos registros INDIRECTA y otros FESTIVO");
  }

  let estado_global: MigracionFestivosEstadoGlobal = "BLOQUEADO";
  if (mensajes_bloqueo.length === 0) {
    if (indirecta_en_manifest === MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD) {
      estado_global = "LISTO_PARA_MIGRAR";
    } else if (festivo_en_manifest === MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD) {
      estado_global = "YA_MIGRADO";
    }
  }

  const horas_a_reclasificar =
    estado_global === "LISTO_PARA_MIGRAR"
      ? filas.filter((f) => f.estado_fila === "OK_INDIRECTA").reduce((s, f) => s + f.horas, 0)
      : 0;

  const horas_indirecta_actual = sumHorasTipo(registro_horas, "INDIRECTA");
  const horas_festivo_actual = sumHorasTipo(registro_horas, "FESTIVO");
  const suma_combinada_actual = horas_indirecta_actual + horas_festivo_actual;

  const horas_indirecta_despues =
    estado_global === "LISTO_PARA_MIGRAR"
      ? horas_indirecta_actual - horas_a_reclasificar
      : horas_indirecta_actual;
  const horas_festivo_despues =
    estado_global === "LISTO_PARA_MIGRAR"
      ? horas_festivo_actual + horas_a_reclasificar
      : estado_global === "YA_MIGRADO"
        ? horas_festivo_actual
        : horas_festivo_actual;

  const suma_combinada_despues = horas_indirecta_despues + horas_festivo_despues;

  return {
    estado_global,
    filas,
    manifest_count: manifest.length,
    manifest_ids_unicos: manifestIdsUnicos.size === manifest.length,
    horas_esperadas_manifest: MIGRACION_FESTIVOS_HISTORICOS_HORAS_ESPERADAS,
    registros_encontrados,
    registros_validos,
    registros_bloqueados,
    horas_a_reclasificar,
    horas_indirecta_actual,
    horas_festivo_actual,
    horas_indirecta_despues,
    horas_festivo_despues,
    suma_combinada_actual,
    suma_combinada_despues,
    total_registro_horas: registro_horas.length,
    indirecta_en_manifest,
    festivo_en_manifest,
    mensajes_bloqueo,
  };
}

export function simularRegistroHorasMigradosFestivos(
  registro_horas: RegistroHora[],
  updatedAt: string,
): RegistroHora[] {
  const ids = new Set(MIGRACION_FESTIVOS_HISTORICOS_MANIFEST.map((m) => m.registro_hora_id));
  return registro_horas.map((r) => {
    if (!ids.has(r.id) || r.tipo_hora !== "INDIRECTA") return r;
    return { ...r, tipo_hora: "FESTIVO", updated_at: updatedAt };
  });
}

export function aplicarMigracionFestivosHistoricosEnRegistros(
  registro_horas: RegistroHora[],
  profesionales: Profesional[],
  updatedAt: string,
):
  | { ok: true; next: RegistroHora[]; result: Exclude<MigracionFestivosAplicacionResult, { ok: false }> }
  | { ok: false; error: string } {
  const antes = ejecutarPreflightMigracionFestivosHistoricos(registro_horas, profesionales);
  if (antes.estado_global !== "LISTO_PARA_MIGRAR") {
    return {
      ok: false,
      error:
        antes.estado_global === "YA_MIGRADO"
          ? "Los 24 registros ya están migrados a FESTIVO."
          : `Preflight bloqueado: ${antes.mensajes_bloqueo.join(" · ") || "validación fallida"}`,
    };
  }

  const horas_indirecta_antes = antes.horas_indirecta_actual;
  const horas_festivo_antes = antes.horas_festivo_actual;
  const total_antes = registro_horas.length;

  const ids = new Set(MIGRACION_FESTIVOS_HISTORICOS_MANIFEST.map((m) => m.registro_hora_id));
  const next = registro_horas.map((r) => {
    if (!ids.has(r.id)) return r;
    if (r.tipo_hora !== "INDIRECTA") return r;
    return { ...r, tipo_hora: "FESTIVO" as const, updated_at: updatedAt };
  });

  const despues = ejecutarPreflightMigracionFestivosHistoricos(next, profesionales);
  if (despues.estado_global !== "YA_MIGRADO") {
    return { ok: false, error: "Tras aplicar, el preflight no reportó YA_MIGRADO." };
  }

  if (next.length !== total_antes) {
    return { ok: false, error: "El total de registro_horas cambió." };
  }

  const horas_reclasificadas = antes.horas_a_reclasificar;
  let cambiosTipo = 0;
  for (let i = 0; i < next.length; i++) {
    const prev = registro_horas[i]!;
    const n = next[i]!;
    if (ids.has(n.id) && prev.tipo_hora !== n.tipo_hora) cambiosTipo++;
    if (ids.has(n.id) && prev.tipo_hora === n.tipo_hora && prev.tipo_hora === "INDIRECTA") {
      return { ok: false, error: `Registro ${n.id} no cambió a FESTIVO.` };
    }
  }
  if (cambiosTipo !== MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD) {
    return {
      ok: false,
      error: `Se esperaban ${MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD} cambios de tipo_hora, hubo ${cambiosTipo}.`,
    };
  }

  return {
    ok: true,
    next,
    result: {
      ok: true,
      registros_reclasificados: MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD,
      horas_reclasificadas,
      horas_indirecta_antes,
      horas_festivo_antes,
      horas_indirecta_despues: despues.horas_indirecta_actual,
      horas_festivo_despues: despues.horas_festivo_actual,
      suma_combinada_antes: horas_indirecta_antes + horas_festivo_antes,
      suma_combinada_despues: despues.suma_combinada_actual,
      total_registro_horas_antes: total_antes,
      total_registro_horas_despues: next.length,
    },
  };
}
