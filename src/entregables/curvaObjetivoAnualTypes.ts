/** Detalle mensual de la curva objetivo (12 filas por año). */
export interface CurvaObjetivoMes {
  id: string;
  curva_objetivo_anual_id: string;
  /** 1 = enero … 12 = diciembre */
  mes: number;
  fecha_inicio: string;
  fecha_termino: string;
  profesionales: number;
  feriados_horas: number;
  vacaciones_horas: number;
  ajustes_horas: number;
  objetivo_mensual: number;
  objetivo_acumulado: number;
  created_at: string;
  updated_at: string;
}

/** Cabecera anual: una por año (anio único en v1). */
export interface CurvaObjetivoAnual {
  id: string;
  anio: number;
  nombre: string;
  descripcion: string;
  horas_maximas_mensuales_por_profesional: number;
  meses: CurvaObjetivoMes[];
  created_at: string;
  updated_at: string;
}
