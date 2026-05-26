import { z } from "zod";
import type { MonedaOriginalProyecto } from "@/proyectos/proyectoMoneda";

/**
 * Campos editables del proyecto. Horas presupuestadas siguen fuera del formulario.
 * `project_manager_id` ya no se usa en UI; se mantiene en el tipo persistido por compatibilidad.
 */
export const proyectoFormFieldsSchema = z.object({
  codigo: z
    .string()
    .transform((s) => s.trim())
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
        .max(200, "El nombre no puede superar 200 caracteres."),
    ),
  cliente_id: z.string().min(1, "Seleccione un cliente."),
  pm_interno_id: z.string().optional().default(""),
  pm_nombre: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(2, "Indique el nombre del PM del proyecto.").max(120, "Máximo 120 caracteres.")),
  tarifa_l2: z.coerce.number().min(0, "La tarifa debe ser ≥ 0."),
  tarifa_p4: z.coerce.number().min(0, "La tarifa debe ser ≥ 0."),
  tarifa_p3: z.coerce.number().min(0, "La tarifa debe ser ≥ 0."),
  tarifa_p2: z.coerce.number().min(0, "La tarifa debe ser ≥ 0."),
  estado: z.enum(["ACTIVO", "COMPLETADO", "NO_INICIADO", "SUSPENDIDO"]),
  fecha_inicio: z.string().min(1, "La fecha de inicio es obligatoria."),
  fecha_termino: z.string().min(1, "La fecha de término es obligatoria."),
  moneda_original: z.enum(["UF", "CLP", "USD"], {
    message: "Seleccione moneda del proyecto.",
  }),
  // Legacy (no es el centro del presupuesto): se mantienen por compatibilidad, pero no se usan como flujo principal.
  monto_original: z.coerce.number().min(0, "El monto debe ser ≥ 0.").optional().default(0),
  monto_uf_calculado: z.coerce.number().min(0, "Debe ser ≥ 0.").optional().default(0),
  // Conversión manual (tasa UF / USD) para convertir tarifas contractuales a UF.
  valor_uf_conversion: z.coerce.number().min(0, "Debe ser ≥ 0 (CLP por 1 UF)."),
  tipo_cambio_usd: z.coerce.number().min(0, "Debe ser ≥ 0 (CLP por 1 USD)."),
  // Tarifas comerciales (en moneda_original) para trazabilidad.
  tarifa_l2_original: z.coerce.number().min(0, "La tarifa debe ser ≥ 0."),
  tarifa_p4_original: z.coerce.number().min(0, "La tarifa debe ser ≥ 0."),
  tarifa_p3_original: z.coerce.number().min(0, "La tarifa debe ser ≥ 0."),
  tarifa_p2_original: z.coerce.number().min(0, "La tarifa debe ser ≥ 0."),
}).superRefine((data, ctx) => {
  if (data.moneda_original === "CLP" && data.valor_uf_conversion <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["valor_uf_conversion"],
      message: "Indique Valor UF usado (CLP por UF), mayor que 0.",
    });
  }
  if (data.moneda_original === "USD") {
    if (data.valor_uf_conversion <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valor_uf_conversion"],
        message: "Indique Valor UF usado (CLP por UF), mayor que 0.",
      });
    }
    if (data.tipo_cambio_usd <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tipo_cambio_usd"],
        message: "Indique Tipo cambio USD usado (CLP por USD), mayor que 0.",
      });
    }
  }
});

export type ProyectoFormValues = z.infer<typeof proyectoFormFieldsSchema>;
export type { MonedaOriginalProyecto };

/**
 * Punto único futuro para recalcular `uf_presupuestadas` y `hrs_presupuestadas` del proyecto
 * a partir de sus entregables (y opcionalmente tarifas). Por ahora no implementado.
 */
export function proyectoPresupuestoDesdeEntregablesPendiente(): void {
  /* Intencionalmente vacío: se conectará cuando el módulo Entregables alimente estos totales. */
}
