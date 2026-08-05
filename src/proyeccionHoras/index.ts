/**
 * Proyección / Gantt de Horas — barrel del read model (sin UI ni persistencia).
 */

export * from "@/proyeccionHoras/proyeccionHorasTypes";
export * from "@/proyeccionHoras/proyeccionHorasDistribucion";
export {
  buildProyeccionHorasSnapshot,
  calcularSaldosCategoriaProyeccion,
  saldoProyectableTotal,
  presupuestoVigenteCategoria,
  type ProyeccionHorasInput,
} from "@/proyeccionHoras/proyeccionHorasReadModel";
export {
  ejecutarValidacionesProyeccionHoras,
  formatearResultadoValidacionesProyeccionHoras,
} from "@/proyeccionHoras/proyeccionHorasValidaciones";
