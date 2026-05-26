import { z } from "zod";
import type {
  AsignacionHora,
  CargaMensual,
  Entregable,
  Pipeline,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";

const COD_PROF_RE = /^[A-Z]{2}\d{4,12}$/;

export const profesionalFormFieldsSchema = z.object({
  codigo: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(
      z
        .string()
        .min(6, "El cod_prof debe tener al menos 6 caracteres.")
        .max(20, "El cod_prof no puede superar 20 caracteres.")
        .regex(COD_PROF_RE, "El cod_prof debe tener formato tipo CL1032946."),
    ),
  nombre_completo: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, "El nombre debe tener al menos 2 caracteres.")
        .max(100, "El nombre no puede superar 100 caracteres."),
    ),
  cargo: z.enum(["L2", "P2", "P3", "P4"], {
    message: "Selecciona un cargo válido.",
  }),
  email: z.string().trim().email("Ingresa un email válido."),
  fecha_ingreso: z.string().min(1, "La fecha de ingreso es obligatoria."),
  activo: z.boolean(),
});

export type ProfesionalFormValues = z.infer<typeof profesionalFormFieldsSchema>;

export function buildProfesionalFormSchema(profesionales: Profesional[], editingId?: string | null) {
  return profesionalFormFieldsSchema.superRefine((data, ctx) => {
    const duplicate = profesionales.find(
      (p) => p.codigo.trim().toUpperCase() === data.codigo && p.id !== editingId,
    );
    if (duplicate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ya existe un profesional con este cod_prof.",
        path: ["codigo"],
      });
    }
  });
}

export function isProfesionalReferenced(
  profesionalId: string,
  refs: {
    proyectos: Proyecto[];
    entregables: Entregable[];
    registro_horas: RegistroHora[];
    pipeline: Pipeline[];
    carga_mensual: CargaMensual[];
    asignaciones_horas: AsignacionHora[];
  },
): boolean {
  return (
    refs.proyectos.some((p) => p.project_manager_id === profesionalId) ||
    refs.entregables.some((e) => e.lider_id === profesionalId) ||
    refs.registro_horas.some((r) => r.profesional_id === profesionalId) ||
    refs.pipeline.some((pl) => pl.pm_responsable_id === profesionalId) ||
    refs.carga_mensual.some((c) => c.profesional_id === profesionalId) ||
    refs.asignaciones_horas.some((a) => a.profesional_id === profesionalId)
  );
}
