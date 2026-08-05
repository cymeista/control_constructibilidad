/**
 * Proyección / Gantt de Horas — tipos del read model (100% derivado, sin persistencia).
 */

export type ProyeccionHorasHorizonteMeses = 6 | 8 | 12;

export type ProyeccionHorasMesCell = {
  /** YYYY-MM */
  mes: string;
  horas: number;
  /** Días hábiles (lun–vie) del entregable en este mes. */
  dias_habiles: number;
};

export type ProyeccionHorasEntregableRow = {
  cliente_id: string;
  cliente_nombre: string;
  proyecto_id: string;
  proyecto_codigo: string;
  proyecto_nombre: string;
  proyecto_estado: string;
  entregable_id: string;
  /** `fase_codigo` del entregable (si existe). */
  entregable_codigo: string;
  entregable_nombre: string;
  entregable_estado: string;
  /** Fechas originales del entregable (Gantt Proyectos). */
  fecha_inicio: string;
  fecha_termino: string;
  /**
   * Inicio efectivo de proyección: max(fecha_inicio, fecha_consulta).
   * El saldo pendiente se reparte desde aquí (no desde el calendario pasado).
   */
  fecha_inicio_efectiva: string;
  fecha_termino_efectiva: string;
  /** Saldo proyectado (P4+P3+P2 por defecto; +L2 si incluir_l2). */
  saldo_horas_total: number;
  saldo_p4: number;
  saldo_p3: number;
  saldo_p2: number;
  saldo_l2: number;
  /** Horas del saldo que caen dentro del horizonte (suma de `meses`). */
  horas_en_horizonte: number;
  /**
   * Horas cuya ventana efectiva queda después del horizonte (futuro lejano).
   * No incluye calendario pasado: ese saldo se replanifica desde fecha_consulta.
   */
  horas_fuera_horizonte: number;
  meses: ProyeccionHorasMesCell[];
};

export type ProyeccionHorasAgregadoMes = {
  mes: string;
  horas: number;
};

export type ProyeccionHorasAgregadoRow = {
  nivel: "cliente" | "proyecto" | "total";
  id: string;
  etiqueta: string;
  cliente_id?: string;
  proyecto_id?: string;
  saldo_horas_total: number;
  horas_en_horizonte: number;
  meses: ProyeccionHorasAgregadoMes[];
  n_entregables: number;
};

export type ProyeccionHorasObservacion = {
  codigo:
    | "SIN_FECHAS"
    | "FECHAS_INVALIDAS"
    | "SALDO_CERO"
    | "COMPLETADO"
    | "PROYECTO_NO_ACTIVO"
    | "FUERA_HORIZONTE"
    | "SIN_DIAS_HABILES"
    /** Término del entregable anterior a fecha de consulta; saldo no se proyecta al pasado. */
    | "SALDO_VENCIDO";
  entregable_id: string;
  entregable_nombre: string;
  proyecto_codigo: string;
  detalle: string;
};

export type ProyeccionVsCurvaMes = {
  mes: string;
  /** Horas disponibles según curva objetivo (100%, sin factor cargabilidad). */
  horas_disponibles: number;
  horas_proyectadas: number;
  diferencia: number;
  utilizacion_pct: number | null;
  acumulado_disponible: number;
  acumulado_proyectado: number;
  brecha_acumulada: number;
  fuente_curva: string;
  observacion?: string;
};

export type ProyeccionHorasOpciones = {
  /** Fecha de consulta YYYY-MM-DD. Default: hoy local. */
  fechaConsulta?: string;
  /** Horizonte en meses desde el mes vigente. Default: 8. */
  horizonteMeses?: ProyeccionHorasHorizonteMeses;
  /** Incluir L2 en el saldo. Default: false. */
  incluirL2?: boolean;
  /**
   * Solo proyectos ACTIVO. Default: true.
   * Entregables de otros estados de proyecto quedan en observaciones.
   */
  soloProyectosActivos?: boolean;
  /**
   * Factor 0–100 aplicado a objetivo_mensual de la curva (como Dashboard).
   * Default: 100 (sin descuento de cargabilidad).
   */
  factorCargabilidadPct?: number;
};

export type ProyeccionHorasSnapshot = {
  generado_en: string;
  fecha_consulta: string;
  mes_inicio_horizonte: string;
  mes_fin_horizonte: string;
  horizonte_meses: ProyeccionHorasHorizonteMeses;
  incluir_l2: boolean;
  meses_horizonte: string[];
  entregables: ProyeccionHorasEntregableRow[];
  agregados_cliente: ProyeccionHorasAgregadoRow[];
  agregados_proyecto: ProyeccionHorasAgregadoRow[];
  total_general: ProyeccionHorasAgregadoRow;
  comparacion_curva: ProyeccionVsCurvaMes[];
  observaciones: ProyeccionHorasObservacion[];
  conteos: {
    entregables_proyectados: number;
    excluidos_sin_fechas: number;
    excluidos_completados: number;
    excluidos_saldo_cero: number;
    excluidos_proyecto_no_activo: number;
    excluidos_fuera_horizonte: number;
    excluidos_sin_dias_habiles: number;
    /** Término anterior a fecha_consulta con saldo pendiente (no proyectable al pasado). */
    excluidos_saldo_vencido: number;
  };
  /** Trazabilidad de curvas usadas en la comparación. */
  curvas_usadas: {
    anio: number;
    curva_id: string | null;
    curva_nombre: string | null;
    fuente: string;
  }[];
};
