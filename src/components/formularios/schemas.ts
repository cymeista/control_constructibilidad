import { z } from "zod";
import {
  dateToUtcEpoch,
  ENTREGABLE_SEGUIMIENTO_YEAR_MAX,
  ENTREGABLE_SEGUIMIENTO_YEAR_MIN,
} from "@/entregables/entregableSeguimiento";

/* ─── Entity Schemas ─── */

const MSG_ENTREGABLE_FECHA_ISO = `Fecha inválida o fuera de rango (${ENTREGABLE_SEGUIMIENTO_YEAR_MIN}–${ENTREGABLE_SEGUIMIENTO_YEAR_MAX}). Use AAAA-MM-DD con año de 4 dígitos.`;

function refineEntregableFechaCampo(
  val: string | null | undefined,
  path: "fecha_inicio" | "fecha_termino" | "fecha_revA" | "fecha_revB" | "fecha_revP",
  ctx: z.RefinementCtx,
) {
  const s = (val ?? "").trim();
  if (!s) return;
  if (dateToUtcEpoch(s) == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: MSG_ENTREGABLE_FECHA_ISO });
  }
}

export const entregableSchema = z.object({
  id: z.string().optional(),
  proyecto_id: z.string().min(1, "Seleccione un proyecto"),
  fase_codigo: z.string().trim().min(1, "Ingrese fase_codigo"),
  tarea_codigo: z.string().trim().min(1, "Ingrese tarea_codigo"),
  nombre: z.string().min(2, "Mínimo 2 caracteres").max(200, "Máximo 200 caracteres"),
  lider_id: z.string().min(1, "Seleccione un líder"),
  revisor_id: z.string().min(1, "Seleccione un revisor"),
  tipo_flujo: z.enum(["CON_REVISIONES", "SIN_REVISIONES"]),
  estado: z.string().min(1, "Estado requerido"),
  avance_real: z.coerce.number().min(0, "≥ 0").max(1, "≤ 1"),
  avance_teorico: z.coerce.number().min(0, "≥ 0").max(1, "≤ 1"),
  fecha_inicio: z.string().min(1, "Requerido"),
  fecha_termino: z.string().min(1, "Requerido"),
  fecha_revA: z.string().nullable().optional(),
  fecha_revB: z.string().nullable().optional(),
  fecha_revP: z.string().nullable().optional(),
  uf_presupuestadas: z.coerce.number().min(0, "≥ 0"),
  /** hrs_gastadas / uf_consumidas: solo desde RegistroHora (no formulario). */
  hrs_l2: z.coerce.number().min(0, "≥ 0"),
  hrs_p4: z.coerce.number().min(0, "≥ 0"),
  hrs_p3: z.coerce.number().min(0, "≥ 0"),
  hrs_p2: z.coerce.number().min(0, "≥ 0"),
  hrs_presupuestadas: z.coerce.number().min(0, "≥ 0"),
}).superRefine((data, ctx) => {
  refineEntregableFechaCampo(data.fecha_inicio, "fecha_inicio", ctx);
  refineEntregableFechaCampo(data.fecha_termino, "fecha_termino", ctx);

  if (data.tipo_flujo === "CON_REVISIONES") {
    if (!data.fecha_revA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_revA"],
        message: "Requerido para flujo con revisiones",
      });
    }
    if (!data.fecha_revB) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_revB"],
        message: "Requerido para flujo con revisiones",
      });
    }
    if (!data.fecha_revP) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_revP"],
        message: "Requerido para flujo con revisiones",
      });
    }

    refineEntregableFechaCampo(data.fecha_revA, "fecha_revA", ctx);
    refineEntregableFechaCampo(data.fecha_revB, "fecha_revB", ctx);
    refineEntregableFechaCampo(data.fecha_revP, "fecha_revP", ctx);

    const inicio = data.fecha_inicio;
    const revA = data.fecha_revA || "";
    const revB = data.fecha_revB || "";
    const revP = data.fecha_revP || "";
    const termino = data.fecha_termino;

    if (inicio && revA && revB && revP && termino) {
      const isOrdered = inicio <= revA && revA <= revB && revB <= revP && revP <= termino;
      if (!isOrdered) {
        const message = "En CON_REVISIONES debe cumplirse: inicio <= Rev.A <= Rev.B <= Rev.P <= término.";
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fecha_inicio"], message });
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fecha_revA"], message });
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fecha_revB"], message });
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fecha_revP"], message });
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fecha_termino"], message });
      }
    }
  } else if (data.tipo_flujo === "SIN_REVISIONES") {
    const revA = (data.fecha_revA ?? "").trim();
    const revB = (data.fecha_revB ?? "").trim();
    if (revA !== "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_revA"],
        message: "En SIN_REVISIONES no aplica Rev.A; déjela vacía.",
      });
    }
    if (revB !== "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_revB"],
        message: "En SIN_REVISIONES no aplica Rev.B; déjela vacía.",
      });
    }
    const termino = (data.fecha_termino ?? "").trim();
    const revP = (data.fecha_revP ?? "").trim();
    if (termino && revP && revP !== termino) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_revP"],
        message: "En SIN_REVISIONES Rev.P debe coincidir con la fecha de término.",
      });
    }
    refineEntregableFechaCampo(data.fecha_revP, "fecha_revP", ctx);
  }
});

/** Shape base; validación DIRECTA + coherencia proyecto↔entregable: `createRegistroHoraSchema`. */
export const registroHoraBaseSchema = z.object({
  id: z.string().optional(),
  profesional_id: z.string().min(1, "Seleccione un profesional"),
  proyecto_id: z.string().nullable().optional(),
  entregable_id: z.string().nullable().optional(),
  tipo_hora: z.enum(["DIRECTA", "INDIRECTA", "VACACIONES"]),
  fecha: z.string().min(1, "Requerido"),
  horas: z
    .coerce.number()
    .min(0.1, "Debe ser > 0")
    .max(
      168,
      "Máximo 168 h por registro: tope teórico de una semana (7×24 h) en este formulario. No es el cupo de asignación al entregable.",
    ),
  descripcion: z.string().nullable().optional(),
});

export type EntregableRefForRegistroHora = { id: string; proyecto_id: string };

/**
 * Bloque 4.1: fuente de consumo real — DIRECTA exige proyecto y entregable coherentes;
 * fase/tarea se resuelven vía el entregable (no se piden en el registro).
 */
export function createRegistroHoraSchema(entregables: EntregableRefForRegistroHora[]) {
  return registroHoraBaseSchema.superRefine((data, ctx) => {
    if (data.tipo_hora !== "DIRECTA") return;

    const pid = (data.proyecto_id ?? "").trim();
    const eid = (data.entregable_id ?? "").trim();

    if (!pid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proyecto_id"],
        message: "En hora directa debe seleccionar un proyecto",
      });
    }
    if (!eid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entregable_id"],
        message: "En hora directa debe seleccionar un entregable",
      });
    }
    if (!pid || !eid) return;

    const ent = entregables.find((e) => e.id === eid);
    if (!ent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entregable_id"],
        message: "Entregable no válido o ya no existe",
      });
      return;
    }
    if (ent.proyecto_id !== pid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entregable_id"],
        message: "El entregable no pertenece al proyecto seleccionado",
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proyecto_id"],
        message: "El proyecto no coincide con el entregable seleccionado",
      });
    }
  });
}

/**
 * Intenta emparejar el texto libre histórico de `cliente` con un registro de la maestra.
 * No es perfecto; si no hay match, devuelve "".
 */
export function guessPipelineClienteIdFromLegacy(
  legacyText: string,
  clientes: ReadonlyArray<{ id: string; codigo: string; nombre: string }>,
): string {
  const t = legacyText.trim();
  if (!t) return "";
  const low = t.toLowerCase();
  for (const c of clientes) {
    if (c.nombre.trim() === t) return c.id;
    if (c.nombre.trim().toLowerCase() === low) return c.id;
    if (c.codigo.trim().toUpperCase() === t.toUpperCase()) return c.id;
  }
  for (const c of clientes) {
    if (t.length >= 3 && c.nombre.toLowerCase().includes(low)) return c.id;
  }
  return "";
}

/** Monto UF del pipeline: Σ horas × tarifa por categoría (vacío / no numérico → 0). */
export function computePipelineMontoUf(input: {
  hrs_L2: unknown;
  hrs_P4: unknown;
  hrs_P3: unknown;
  hrs_P2: unknown;
  tarifa_l2: unknown;
  tarifa_p4: unknown;
  tarifa_p3: unknown;
  tarifa_p2: unknown;
}): number {
  const n = (x: unknown) => {
    const v = Number(x);
    return Number.isFinite(v) ? v : 0;
  };
  const h = (x: unknown) => Math.max(0, n(x));
  const t = (x: unknown) => Math.max(0, n(x));
  return (
    h(input.hrs_L2) * t(input.tarifa_l2) +
    h(input.hrs_P4) * t(input.tarifa_p4) +
    h(input.hrs_P3) * t(input.tarifa_p3) +
    h(input.hrs_P2) * t(input.tarifa_p2)
  );
}

/** Formulario Pipeline: `monto_uf` se calcula al guardar (no se valida como input manual). */
export const pipelineFormSchema = z.object({
  id: z.string().optional(),
  cliente_id: z.string().min(1, "Seleccione un cliente"),
  nombre_proyecto: z.string().min(2, "Mínimo 2 caracteres").max(200, "Máximo 200 caracteres"),
  etapa: z.enum(["CONCEPTUAL", "FACTIBILIDAD", "DETALLE"]),
  entregable: z.string().min(1, "Requerido"),
  pm_responsable_id: z.string().min(1, "Seleccione un PM"),
  fecha_propuesta: z.string().min(1, "Requerido"),
  estado: z.enum(["EN_ESPERA", "EN_COTIZACION", "APROBADO", "RECHAZADO"]),
  hrs_L2: z.coerce.number().min(0, "≥ 0"),
  hrs_P4: z.coerce.number().min(0, "≥ 0"),
  hrs_P3: z.coerce.number().min(0, "≥ 0"),
  hrs_P2: z.coerce.number().min(0, "≥ 0"),
  tarifa_l2: z.coerce.number().min(0, "≥ 0"),
  tarifa_p4: z.coerce.number().min(0, "≥ 0"),
  tarifa_p3: z.coerce.number().min(0, "≥ 0"),
  tarifa_p2: z.coerce.number().min(0, "≥ 0"),
  observaciones: z.string().nullable().optional(),
});

export const cargaMensualSchema = z.object({
  id: z.string().optional(),
  mes_iso: z.string().min(1, "Requerido"),
  profesional_id: z.string().nullable().optional(),
  hrs_directas: z.coerce.number().min(0, "≥ 0"),
  hrs_indirectas: z.coerce.number().min(0, "≥ 0"),
  hrs_vacaciones: z.coerce.number().min(0, "≥ 0"),
  hrs_objetivo: z.coerce.number().min(0, "≥ 0"),
});

/** Bloque 1 asignaciones: alta con entregable + profesional (categoría = cargo del profesional). */
export const asignacionHoraCreateSchema = z.object({
  entregable_id: z.string().min(1, "Seleccione un entregable"),
  profesional_id: z.string().min(1, "Seleccione un profesional"),
  rol_en_entregable: z.enum(["LIDER", "APOYO"]),
  horas_comprometidas: z.coerce.number().min(0.01, "Debe ser mayor a 0"),
  fecha_inicio_vigencia: z.string().min(1, "Requerido"),
});

export const asignacionHoraEditSchema = z.object({
  rol_en_entregable: z.enum(["LIDER", "APOYO"]),
  horas_comprometidas: z.coerce.number().min(0.01, "Debe ser mayor a 0"),
});

/** Bloque 1: alta de curva objetivo anual (100% capacidad equipo). */
export const curvaObjetivoAnualCreateSchema = z.object({
  anio: z.coerce.number().int().min(2000, "Año mínimo 2000").max(2100, "Año máximo 2100"),
  /** Vacío se reemplaza en el submit por la sugerencia «Curva Año {año}». */
  nombre: z.string().max(200, "Máximo 200 caracteres"),
  descripcion: z.string().max(2000, "Máximo 2000 caracteres").optional(),
  horas_maximas_mensuales_por_profesional: z.coerce.number().positive("Debe ser mayor a 0"),
  profesionales_base: z.coerce.number().int().min(0, "≥ 0"),
});

/* ─── Types ─── */
export type EntregableForm = z.infer<typeof entregableSchema>;
export type RegistroHoraForm = z.infer<typeof registroHoraBaseSchema>;
export type PipelineForm = z.infer<typeof pipelineFormSchema>;
export type CargaMensualForm = z.infer<typeof cargaMensualSchema>;
export type AsignacionHoraCreateForm = z.infer<typeof asignacionHoraCreateSchema>;
export type AsignacionHoraEditForm = z.infer<typeof asignacionHoraEditSchema>;
export type CurvaObjetivoAnualCreateForm = z.infer<typeof curvaObjetivoAnualCreateSchema>;
