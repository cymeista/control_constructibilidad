import type { AsignacionHoraCategoria } from "@/context/AppDataContext";

export type TipoAlertaOperativa =
  | "BLOQUE_1_SIN_COBERTURA"
  | "BLOQUE_2_EXCESO_COMPROMISO"
  | "BLOQUE_3_SOBRECONSUMO_CATEGORIA"
  | "BLOQUE_4_GASTO_REAL_MAYOR_ASIGNADO"
  | "BLOQUE_4_VENTANAS_SOLAPADAS"
  | "BLOQUE_FASE1_GASTO_SIN_ASIGNACION";

export type EstadoAlertaRevisada = "REVISADA" | "ACEPTADA" | "NO_ACCIONABLE";

/** Motivos operativos guardados (etiqueta legible en UI). */
export type MotivoRevisionPreset =
  | "PROYECTO_CERRADO_HISTORICO"
  | "SOBREGASTO_ACEPTADO"
  | "NO_SE_NORMALIZARA"
  | "AJUSTE_MENOR"
  | "OTRO";

export const MOTIVO_REVISION_OPCIONES: { id: MotivoRevisionPreset; label: string }[] = [
  { id: "PROYECTO_CERRADO_HISTORICO", label: "Proyecto cerrado / histórico" },
  { id: "SOBREGASTO_ACEPTADO", label: "Sobregasto aceptado" },
  { id: "NO_SE_NORMALIZARA", label: "No se normalizará" },
  { id: "AJUSTE_MENOR", label: "Ajuste menor" },
  { id: "OTRO", label: "Otro" },
];

export interface AlertaRevisada {
  id: string;
  tipo_alerta: TipoAlertaOperativa;
  clave_alerta: string;
  proyecto_id: string;
  entregable_id: string;
  profesional_id: string | null;
  categoria: AsignacionHoraCategoria | null;
  motivo_revision: string;
  comentario: string;
  fecha_revision: string;
  revisado_por: string;
  estado: EstadoAlertaRevisada;
  created_at: string;
  updated_at: string;
}

function tid(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** BLOQUE_1|proyecto_id|entregable_id|profesional_id */
export function claveAlertaBloque1(proyectoId: string, entregableId: string, profesionalId: string): string {
  return `BLOQUE_1|${tid(proyectoId)}|${tid(entregableId)}|${tid(profesionalId)}`;
}

/** BLOQUE_2|proyecto_id|entregable_id|profesional_id|categoria */
export function claveAlertaBloque2(
  proyectoId: string,
  entregableId: string,
  profesionalId: string,
  categoria: AsignacionHoraCategoria,
): string {
  return `BLOQUE_2|${tid(proyectoId)}|${tid(entregableId)}|${tid(profesionalId)}|${categoria}`;
}

/** BLOQUE_3|proyecto_id|entregable_id|categoria */
export function claveAlertaBloque3(proyectoId: string, entregableId: string, categoria: AsignacionHoraCategoria): string {
  return `BLOQUE_3|${tid(proyectoId)}|${tid(entregableId)}|${categoria}`;
}

/** BLOQUE_4|proyecto_id|entregable_id|profesional_id|categoria — déficit gasto real vs horas comprometidas */
export function claveAlertaBloque4GastoVsAsignado(
  proyectoId: string,
  entregableId: string,
  profesionalId: string,
  categoria: AsignacionHoraCategoria,
): string {
  return `BLOQUE_4|${tid(proyectoId)}|${tid(entregableId)}|${tid(profesionalId)}|${categoria}`;
}

/** BLOQUE_4_SOLAP|proyecto_id|entregable_id|profesional_id|categoria — ventanas de asignación solapadas */
export function claveAlertaBloque4VentanasSolapadas(
  proyectoId: string,
  entregableId: string,
  profesionalId: string,
  categoria: AsignacionHoraCategoria,
): string {
  return `BLOQUE_4_SOLAP|${tid(proyectoId)}|${tid(entregableId)}|${tid(profesionalId)}|${categoria}`;
}

/** FASE1_A|proyecto_id|entregable_id|profesional_id|categoria — gasto real sin horas asignadas */
export function claveAlertaFase1GastoSinAsignacion(
  proyectoId: string,
  entregableId: string,
  profesionalId: string,
  categoria: AsignacionHoraCategoria,
): string {
  return `FASE1_A|${tid(proyectoId)}|${tid(entregableId)}|${tid(profesionalId)}|${categoria}`;
}

export function mapaAlertasRevisadasPorClave(rows: AlertaRevisada[]): Map<string, AlertaRevisada> {
  const m = new Map<string, AlertaRevisada>();
  for (const r of rows) {
    const k = tid(r.clave_alerta);
    if (k) m.set(k, r);
  }
  return m;
}

const TIPOS_VALIDOS = new Set<string>([
  "BLOQUE_1_SIN_COBERTURA",
  "BLOQUE_2_EXCESO_COMPROMISO",
  "BLOQUE_3_SOBRECONSUMO_CATEGORIA",
  "BLOQUE_4_GASTO_REAL_MAYOR_ASIGNADO",
  "BLOQUE_4_VENTANAS_SOLAPADAS",
  "BLOQUE_FASE1_GASTO_SIN_ASIGNACION",
]);
const ESTADOS_VALIDOS = new Set<string>(["REVISADA", "ACEPTADA", "NO_ACCIONABLE"]);
const CAT_VALIDAS = new Set<string>(["L2", "P4", "P3", "P2"]);

/** Carga desde JSON persistido; descarta filas inválidas. */
export function normalizeAlertasRevisadasCarga(raw: unknown): AlertaRevisada[] {
  if (!Array.isArray(raw)) return [];
  const out: AlertaRevisada[] = [];
  for (const item of raw) {
    const x = item as Record<string, unknown>;
    const clave = tid(String(x.clave_alerta ?? ""));
    const tipo = String(x.tipo_alerta ?? "");
    if (!clave || !TIPOS_VALIDOS.has(tipo)) continue;
    const estadoRaw = String(x.estado ?? "REVISADA");
    const estado = ESTADOS_VALIDOS.has(estadoRaw) ? (estadoRaw as EstadoAlertaRevisada) : "REVISADA";
    const catRaw = x.categoria != null && String(x.categoria).trim() !== "" ? String(x.categoria).trim() : null;
    const categoria =
      catRaw && CAT_VALIDAS.has(catRaw) ? (catRaw as AsignacionHoraCategoria) : null;
    const pid = x.profesional_id != null && String(x.profesional_id).trim() !== "" ? String(x.profesional_id).trim() : null;
    out.push({
      id: tid(String(x.id ?? "")) || `ar_${out.length}`,
      tipo_alerta: tipo as TipoAlertaOperativa,
      clave_alerta: clave,
      proyecto_id: tid(String(x.proyecto_id ?? "")),
      entregable_id: tid(String(x.entregable_id ?? "")),
      profesional_id: pid,
      categoria,
      motivo_revision: String(x.motivo_revision ?? "").trim() || "—",
      comentario: String(x.comentario ?? "").trim(),
      fecha_revision: tid(String(x.fecha_revision ?? "")) || "1970-01-01",
      revisado_por: String(x.revisado_por ?? "").trim() || "—",
      estado,
      created_at: String(x.created_at ?? "").trim() || "",
      updated_at: String(x.updated_at ?? "").trim() || "",
    });
  }
  return out;
}
