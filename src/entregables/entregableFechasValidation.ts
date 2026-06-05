import { z } from "zod";
import type { Entregable } from "@/context/AppDataContext";
import {
  calculateAvanceTeorico,
  dateToUtcEpoch,
  ENTREGABLE_SEGUIMIENTO_YEAR_MAX,
  ENTREGABLE_SEGUIMIENTO_YEAR_MIN,
  resolveEstado,
  type EntregableSeguimientoPayload,
} from "@/entregables/entregableSeguimiento";

export const MSG_ENTREGABLE_FECHA_ISO = `Fecha inválida o fuera de rango (${ENTREGABLE_SEGUIMIENTO_YEAR_MIN}–${ENTREGABLE_SEGUIMIENTO_YEAR_MAX}). Use AAAA-MM-DD con año de 4 dígitos.`;

export type EntregableFechasInput = {
  tipo_flujo: "CON_REVISIONES" | "SIN_REVISIONES";
  fecha_inicio: string;
  fecha_termino: string;
  fecha_revA: string | null;
  fecha_revB: string | null;
  fecha_revP: string | null;
};

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

/** Reglas de fechas compartidas entre Formularios y modal Proyectos. */
export function refineEntregableFechas(data: EntregableFechasInput, ctx: z.RefinementCtx): void {
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
}

export const entregableFechasSchema = z
  .object({
    tipo_flujo: z.enum(["CON_REVISIONES", "SIN_REVISIONES"]),
    fecha_inicio: z.string().min(1, "Requerido"),
    fecha_termino: z.string().min(1, "Requerido"),
  fecha_revA: z.string().nullable().optional(),
  fecha_revB: z.string().nullable().optional(),
  fecha_revP: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) =>
    refineEntregableFechas(
      {
        tipo_flujo: data.tipo_flujo,
        fecha_inicio: data.fecha_inicio,
        fecha_termino: data.fecha_termino,
        fecha_revA: data.fecha_revA ?? null,
        fecha_revB: data.fecha_revB ?? null,
        fecha_revP: data.fecha_revP ?? null,
      },
      ctx,
    ),
  );

export function entregableToFechasInput(ent: Entregable): EntregableFechasInput {
  const tipo = ent.tipo_flujo || "CON_REVISIONES";
  return {
    tipo_flujo: tipo,
    fecha_inicio: ent.fecha_inicio || "",
    fecha_termino: ent.fecha_termino || "",
    fecha_revA: tipo === "SIN_REVISIONES" ? null : ent.fecha_revA || "",
    fecha_revB: tipo === "SIN_REVISIONES" ? null : ent.fecha_revB || "",
    fecha_revP: ent.fecha_revP || (tipo === "SIN_REVISIONES" ? ent.fecha_termino || "" : ""),
  };
}

export function validateEntregableFechas(
  input: EntregableFechasInput,
): { ok: true } | { ok: false; message: string } {
  const result = entregableFechasSchema.safeParse(input);
  if (result.success) return { ok: true };
  const issue = result.error.issues[0];
  return { ok: false, message: issue?.message ?? "Fechas inválidas." };
}

export function buildEntregablePatchFromFechasDraft(
  ent: Entregable,
  draft: EntregableFechasInput,
): Pick<
  Entregable,
  "fecha_inicio" | "fecha_termino" | "fecha_revA" | "fecha_revB" | "fecha_revP" | "avance_teorico" | "estado"
> {
  const tipo = draft.tipo_flujo;
  const fechas =
    tipo === "SIN_REVISIONES"
      ? {
          fecha_inicio: draft.fecha_inicio,
          fecha_termino: draft.fecha_termino,
          fecha_revA: null as string | null,
          fecha_revB: null as string | null,
          fecha_revP: draft.fecha_termino,
        }
      : {
          fecha_inicio: draft.fecha_inicio,
          fecha_termino: draft.fecha_termino,
          fecha_revA: (draft.fecha_revA ?? "").trim() || null,
          fecha_revB: (draft.fecha_revB ?? "").trim() || null,
          fecha_revP: (draft.fecha_revP ?? "").trim() || null,
        };

  const seguimiento: EntregableSeguimientoPayload = {
    tipo_flujo: tipo,
    fecha_inicio: fechas.fecha_inicio,
    fecha_termino: fechas.fecha_termino,
    fecha_revA: fechas.fecha_revA,
    fecha_revB: fechas.fecha_revB,
    fecha_revP: fechas.fecha_revP,
    avance_real: ent.avance_real,
  };
  const avance_teorico = calculateAvanceTeorico(seguimiento);
  const estado = resolveEstado(seguimiento, avance_teorico);

  return { ...fechas, avance_teorico, estado };
}
