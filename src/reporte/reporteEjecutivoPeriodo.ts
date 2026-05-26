import {
  finPeriodoTeoricoCapacidad,
  rangoPeriodoCapacidad,
  type PeriodoCapacidadId,
  type RangoPeriodo,
} from "@/capacidad/capacidadPeriodo";

export type PeriodoReporteEjecutivoId = "mes_actual" | "ultimas_4_semanas" | "ano_actual";

export const PERIODOS_REPORTE_OPCIONES: { id: PeriodoReporteEjecutivoId; label: string }[] = [
  { id: "mes_actual", label: "Mes actual" },
  { id: "ultimas_4_semanas", label: "Últimas 4 semanas" },
  { id: "ano_actual", label: "Año actual acumulado" },
];

export function periodoCapacidadDesdeReporte(id: PeriodoReporteEjecutivoId): PeriodoCapacidadId {
  return id;
}

export function rangoPeriodoReporteEjecutivo(
  id: PeriodoReporteEjecutivoId,
  hoy: string,
): RangoPeriodo & { finTeorica: string } {
  const capId = periodoCapacidadDesdeReporte(id);
  const rango = rangoPeriodoCapacidad(capId, hoy);
  return {
    ...rango,
    finTeorica: finPeriodoTeoricoCapacidad(capId, hoy),
  };
}
