/**
 * Tipos de hora de RegistroHora — definición central compartida.
 */

export const REGISTRO_HORA_TIPOS = ["DIRECTA", "INDIRECTA", "VACACIONES", "FESTIVO"] as const;

export type RegistroHoraTipo = (typeof REGISTRO_HORA_TIPOS)[number];

/**
 * Festivos en planilla: `NC000` exacto en `proyecto_codigo` o `cod_tarea` (no startsWith; no `cod_fase`).
 */
export function esFestivoNC000EnPlanilla(proyectoCodigo: string, codTarea: string): boolean {
  return (
    proyectoCodigo.trim().toUpperCase() === "NC000" ||
    codTarea.trim().toUpperCase() === "NC000"
  );
}

/** @deprecated Usar `esFestivoNC000EnPlanilla`. */
export function esFestivoNC000ProyectoCodigo(proyectoCodigo: string): boolean {
  return esFestivoNC000EnPlanilla(proyectoCodigo, "");
}

export function tipoHoraSinProyectoEntregable(tipo: RegistroHoraTipo): boolean {
  return tipo === "INDIRECTA" || tipo === "VACACIONES" || tipo === "FESTIVO";
}

export function etiquetaTipoHoraRegistro(tipo: RegistroHoraTipo): string {
  switch (tipo) {
    case "DIRECTA":
      return "HORAS DIRECTAS";
    case "INDIRECTA":
      return "HORAS INDIRECTAS";
    case "VACACIONES":
      return "HORAS VACACIONES";
    case "FESTIVO":
      return "HORAS FESTIVOS";
  }
}

export const REGISTRO_HORA_TIPO_BADGE: Record<
  RegistroHoraTipo,
  { bg: string; text: string }
> = {
  DIRECTA: { bg: "#ECFDF5", text: "#047857" },
  INDIRECTA: { bg: "#FFF7ED", text: "#B45309" },
  VACACIONES: { bg: "#F1F5F9", text: "#475569" },
  FESTIVO: { bg: "#EDE9FE", text: "#6D28D9" },
};
