import type { Profesional } from "@/context/AppDataContext";

function normalizarNombreProfesional(nombre: string): string {
  return (nombre ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Excluidos solo en UI de Evaluación (no altera datos ni otras pantallas). */
export function esProfesionalExcluidoDeEvaluacion(nombre: string): boolean {
  const n = normalizarNombreProfesional(nombre);
  if (n === "por definir" || n.includes("por definir")) return true;
  if (n.includes("misael quitral")) return true;
  if (n.includes("hugo izquierdo")) return true;
  return false;
}

export function filtrarProfesionalesParaEvaluacion(profesionales: Profesional[]): Profesional[] {
  return profesionales.filter((p) => !esProfesionalExcluidoDeEvaluacion(p.nombre_completo));
}
