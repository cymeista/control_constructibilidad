import { z } from "zod";
import type { PmInterno, Proyecto, Pipeline } from "@/context/AppDataContext";

export const pmInternoFormFieldsSchema = z.object({
  codigo: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(
      z
        .string()
        .min(2, "El código debe tener al menos 2 caracteres.")
        .max(20, "El código no puede superar 20 caracteres."),
    ),
  nombre: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, "El nombre debe tener al menos 2 caracteres.")
        .max(120, "El nombre no puede superar 120 caracteres."),
    ),
  activo: z.boolean(),
});

export type PmInternoFormValues = z.infer<typeof pmInternoFormFieldsSchema>;

export function buildPmInternoFormSchema(pmInternos: PmInterno[], editingId?: string | null) {
  return pmInternoFormFieldsSchema.superRefine((data, ctx) => {
    const duplicate = pmInternos.find(
      (pm) => pm.codigo.trim().toUpperCase() === data.codigo && pm.id !== editingId,
    );
    if (duplicate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ya existe un PM interno con este código.",
        path: ["codigo"],
      });
    }
  });
}

export function isPmInternoReferencedByProyectos(
  proyectos: Proyecto[],
  pmInternoId: string,
): boolean {
  return proyectos.some((p) => p.pm_interno_id === pmInternoId);
}

export function isPmInternoReferencedByPipeline(
  pipeline: Pick<Pipeline, "pm_responsable_id">[],
  pmInternoId: string,
): boolean {
  return pipeline.some((p) => p.pm_responsable_id === pmInternoId);
}
