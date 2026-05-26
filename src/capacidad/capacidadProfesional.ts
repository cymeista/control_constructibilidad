/**
 * Reglas de cargabilidad por profesional (solo vista Capacidad del Equipo).
 */

import type { Profesional } from "@/context/AppDataContext";

export const CAPACIDAD_NOMINAL_MES_ESTANDAR_H = 160;
export const CAPACIDAD_NOMINAL_MES_RICARDO_H = 110;

/** Normaliza para comparar nombres (sin acentos, minúsculas, espacios colapsados). */
export function normalizarNombreProfesional(nombre: string): string {
  return (nombre ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Perfiles excluidos de toda la vista Capacidad del Equipo (solo lectura).
 * Coincidencia por nombre completo o variantes razonables (tokens clave).
 */
export function esNombreProfesionalExcluidoCapacidad(nombre: string): boolean {
  const n = normalizarNombreProfesional(nombre);
  if (!n) return true;

  if (n === "por definir" || n.includes("por definir")) return true;

  if (n.includes("misael") && n.includes("quitral")) return true;
  if (n.startsWith("misael quitral") || n.includes(" misael quitral ")) return true;

  if (n.includes("hugo") && n.includes("izquierdo")) return true;
  if (n.startsWith("hugo izquierdo") || n.includes(" hugo izquierdo ")) return true;

  return false;
}

export function esRicardoGattas(prof: Pick<Profesional, "nombre_completo">): boolean {
  const n = normalizarNombreProfesional(prof.nombre_completo);
  return n.includes("ricardo") && (n.includes("gattas") || n.includes("gatt"));
}

export function capacidadNominalMensualBase(prof: Pick<Profesional, "nombre_completo">): number {
  return esRicardoGattas(prof) ? CAPACIDAD_NOMINAL_MES_RICARDO_H : CAPACIDAD_NOMINAL_MES_ESTANDAR_H;
}

/**
 * Profesionales que participan en KPIs, gráficos y tabla de cargabilidad de esta vista.
 * Debe aplicarse antes de cualquier agregado o cálculo.
 */
export function esProfesionalCargable(prof: Pick<Profesional, "nombre_completo" | "activo">): boolean {
  if (!prof.activo) return false;
  if (esNombreProfesionalExcluidoCapacidad(prof.nombre_completo)) return false;
  return true;
}

export function filtrarProfesionalesCargables(profesionales: Profesional[]): Profesional[] {
  return profesionales.filter(esProfesionalCargable);
}

export function idsProfesionalesCargables(profesionales: Profesional[]): Set<string> {
  return new Set(filtrarProfesionalesCargables(profesionales).map((p) => p.id));
}
