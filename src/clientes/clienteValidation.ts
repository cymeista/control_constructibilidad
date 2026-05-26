import { z } from "zod";
import type { Cliente, Pipeline, Proyecto } from "@/context/AppDataContext";

/** Formato hex (#RGB o #RRGGBB), alineado con input type="color" y futuras columnas en Postgres. */
const HEX_COLOR_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

/**
 * Esquema base de cliente (sin reglas que dependan de la lista actual).
 * La UI y futuros adapters (p. ej. Supabase) pueden reutilizar el mismo contrato de campos.
 */
export const clienteFormFieldsSchema = z.object({
  codigo: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(2, "El código debe tener al menos 2 caracteres.")
        .max(10, "El código no puede superar 10 caracteres."),
    ),
  nombre: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(2, "El nombre debe tener al menos 2 caracteres.")
        .max(100, "El nombre no puede superar 100 caracteres."),
    ),
  color: z
    .string()
    .transform((s) => {
      const t = s.trim();
      return t === "" ? "#4F46E5" : t;
    })
    .pipe(
      z
        .string()
        .regex(HEX_COLOR_RE, "Usa un color en formato hexadecimal (ej: #4F46E5)."),
    ),
  /** Siempre enviado por el formulario (switch); sin .default para alinear tipos con react-hook-form. */
  activo: z.boolean(),
});

export type ClienteFormValues = z.infer<typeof clienteFormFieldsSchema>;

/**
 * Incluye unicidad de código respecto a clientes ya persistidos (insensible a mayúsculas y espacios).
 * `editingId`: id del registro en edición, o null/undefined si es alta nueva.
 */
export function buildClienteFormSchema(clientes: Cliente[], editingId?: string | null) {
  return clienteFormFieldsSchema.superRefine((data, ctx) => {
    const normalized = data.codigo.toLowerCase();
    const duplicate = clientes.find(
      (c) => c.codigo.trim().toLowerCase() === normalized && c.id !== editingId,
    );
    if (duplicate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ya existe un cliente con este código.",
        path: ["codigo"],
      });
    }
  });
}

/** Regla de integridad referencial (hoy en memoria; misma comprobación aplicará vía FK/RLS en Supabase). */
export function isClienteReferencedByProyectos(proyectos: Proyecto[], clienteId: string): boolean {
  return proyectos.some((p) => p.cliente_id === clienteId);
}

export function isClienteReferencedByPipeline(
  pipeline: Pick<Pipeline, "cliente_id">[],
  clienteId: string,
): boolean {
  return pipeline.some((p) => p.cliente_id === clienteId);
}
