/**
 * Filtros de entregables visibles en Gestión de Horas (vista Activos por defecto).
 * Fuente de verdad para Reporte Ejecutivo y otras vistas que deban alinearse con Horas.
 */

import type { Cliente, Entregable, Proyecto } from "@/context/AppDataContext";

export type AlcanceEntregablesGestionHoras = {
  /** "todos" o id de cliente. */
  clienteId?: string;
  /** "todos" o id de proyecto. */
  proyectoId?: string;
};

export function estadoNormalizadoEntregableGestionHoras(s: string): string {
  return String(s)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Misma regla que Gestión de Horas con filtro «Activos / no completados» (predeterminado):
 * excluye COMPLETADO y NO_INICIADO (sin ventana de completados recientes).
 */
export function entregablePasaFiltroActivosGestionHoras(e: Entregable): boolean {
  const est = estadoNormalizadoEntregableGestionHoras(e.estado);
  return est !== "COMPLETADO" && est !== "NO_INICIADO" && est !== "NO INICIADO";
}

export function entregableTieneProyectoYCliente(
  e: Entregable,
  proyectosById: Map<string, Proyecto>,
  clientesById: Map<string, Cliente>,
): boolean {
  const pr = proyectosById.get(e.proyecto_id);
  if (!pr) return false;
  return clientesById.has(pr.cliente_id);
}

function resolverProyectoIdsAlcance(
  proyectos: Proyecto[],
  alcance: AlcanceEntregablesGestionHoras,
): Set<string> | null {
  const proyectoId = alcance.proyectoId ?? "todos";
  const clienteId = alcance.clienteId ?? "todos";
  if (proyectoId !== "todos") return new Set([proyectoId]);
  if (clienteId !== "todos") {
    return new Set(proyectos.filter((p) => p.cliente_id === clienteId).map((p) => p.id));
  }
  return null;
}

/**
 * Conjunto base de entregables activos visibles (Gestión de Horas, filtro Activos, sin filtro de alertas).
 */
export function obtenerEntregablesActivosVisibles(
  entregables: Entregable[],
  proyectos: Proyecto[],
  clientes: Cliente[],
  alcance: AlcanceEntregablesGestionHoras = {},
): Entregable[] {
  const projMap = new Map(proyectos.map((p) => [p.id, p]));
  const clientMap = new Map(clientes.map((c) => [c.id, c]));
  const proyectoIds = resolverProyectoIdsAlcance(proyectos, alcance);

  return entregables.filter((e) => {
    if (proyectoIds && !proyectoIds.has(e.proyecto_id)) return false;
    if (!entregableTieneProyectoYCliente(e, projMap, clientMap)) return false;
    return entregablePasaFiltroActivosGestionHoras(e);
  });
}
