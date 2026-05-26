/**
 * Bloque Dashboard 2: curva real de horas DIRECTAS desde RegistroHora (solo lectura).
 * Semana = lunes (fecha−4) … domingo (fecha+2) siendo `fecha` el viernes de cierre del registro.
 * Prorrateo por día calendario (horas/7 por día); meses con cierre calendario real.
 */

import type { RegistroHora } from "@/context/AppDataContext";
import { acumularDirectasProrrateadasMensual } from "@/entregables/dashboardDirectasMensualProrrateo";
import type {
  EntregableConsumoTarget,
  ProfesionalCargoInput,
  ProyectoTarifasInput,
} from "@/entregables/registroHoraConsumo";

function parseFechaIsoLocal(fecha: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12 || d < 1 || d > 31) {
    return null;
  }
  return { y, m0: mo - 1, d };
}

export type DashboardCurvaRealResult = {
  /** Horas prorrateadas por mes calendario `anio` (índice 0 = enero). */
  realMensual: number[];
  realAcumulado: number[];
  /** Último mes 1–12 con carga > 0 en `realMensual`, o null. */
  ultimoMesConCarga1a12: number | null;
  /** Suma de `horas` de registros DIRECTA incluidos en la curva (sin prorrateo; auditoría). */
  sumaHorasDirectasSinProrrateo: number;
  /** Suma de `realMensual` (debe coincidir con la porción de centihoras asignada a ese año). */
  sumaRealMensualEnAnio: number;
  kpis: {
    directasRealesAcumuladasYTD: number;
    directasRealesMesActual: number;
    pctCargabilidadAreaAcumYTD: number | null;
    horasFaltantesVsObjetivoAjustadoMes: number;
  };
};

/**
 * Suma horas INDIRECTAS cuyo `fecha` cae en [inicio, fin] inclusive (día calendario local).
 */
export function sumarIndirectasRegistroEnRango(
  registros: RegistroHora[],
  inicioIso: string,
  finIso: string,
): number {
  const ini = parseFechaIsoLocal(inicioIso);
  const fin = parseFechaIsoLocal(finIso);
  if (!ini || !fin) return 0;
  const tIni = new Date(ini.y, ini.m0, ini.d, 0, 0, 0, 0).getTime();
  const tFin = new Date(fin.y, fin.m0, fin.d, 23, 59, 59, 999).getTime();
  let s = 0;
  for (const r of registros) {
    if (r.tipo_hora !== "INDIRECTA") continue;
    const p = parseFechaIsoLocal(r.fecha);
    if (!p) continue;
    const t = new Date(p.y, p.m0, p.d, 12, 0, 0, 0).getTime();
    if (t < tIni || t > tFin) continue;
    const h = Number(r.horas);
    if (!Number.isFinite(h) || h <= 0) continue;
    s += h;
  }
  return s;
}

/**
 * Construye la curva real mensual/acumulada y KPIs del Bloque 2.
 * Todas las DIRECTAS cargadas con fecha válida y horas &gt; 0 (prorrateo en centihoras por semana).
 */
export function buildDashboardCurvaRealRegistroHora(
  registro_horas: RegistroHora[],
  _entById: Map<string, EntregableConsumoTarget>,
  _projById: Map<string, ProyectoTarifasInput>,
  _profById: Map<string, ProfesionalCargoInput>,
  anio: number,
  fechaReferencia: Date,
  /** `objetivoAjustadoMesActual` del dashboard (curva objetivo × factor). */
  objetivoAjustadoMesActual: number,
): DashboardCurvaRealResult {
  let sumaHorasDirectasSinProrrateo = 0;
  for (const r of registro_horas) {
    if (r.tipo_hora !== "DIRECTA") continue;
    const h = Number(r.horas);
    if (!Number.isFinite(h) || h <= 0) continue;
    if (!parseFechaIsoLocal(r.fecha)) continue;
    sumaHorasDirectasSinProrrateo += h;
  }

  const realMensual = acumularDirectasProrrateadasMensual(registro_horas, anio);
  let ac = 0;
  const realAcumulado = realMensual.map((h) => {
    ac += h;
    return ac;
  });

  let ultimoMesConCarga1a12: number | null = null;
  for (let m = 11; m >= 0; m--) {
    if ((realMensual[m] ?? 0) > 0) {
      ultimoMesConCarga1a12 = m + 1;
      break;
    }
  }

  const sumaRealMensualEnAnio = realMensual.reduce((a, b) => a + b, 0);

  const mesCalendario = fechaReferencia.getMonth() + 1;
  const anioHoy = fechaReferencia.getFullYear();
  const mesCorteYtd = anio === anioHoy ? mesCalendario : 12;
  const mesKpiMesActual = anio === anioHoy ? mesCalendario : 12;

  const directasRealesAcumuladasYTD = realMensual
    .slice(0, mesCorteYtd)
    .reduce((a, b) => a + b, 0);
  const directasRealesMesActual =
    mesKpiMesActual >= 1 && mesKpiMesActual <= 12 ? realMensual[mesKpiMesActual - 1]! : 0;

  const ultimoDiaMes = new Date(anio, mesCorteYtd, 0).getDate();
  const finMesIso = `${anio}-${String(mesCorteYtd).padStart(2, "0")}-${String(ultimoDiaMes).padStart(2, "0")}`;
  const indirectasYtd = sumarIndirectasRegistroEnRango(registro_horas, `${anio}-01-01`, finMesIso);
  const den = directasRealesAcumuladasYTD + indirectasYtd;
  const pctCargabilidadAreaAcumYTD =
    den > 0 && Number.isFinite(den) ? (directasRealesAcumuladasYTD / den) * 100 : null;

  const horasFaltantesVsObjetivoAjustadoMes = Math.max(
    0,
    (Number.isFinite(objetivoAjustadoMesActual) ? objetivoAjustadoMesActual : 0) -
      (Number.isFinite(directasRealesMesActual) ? directasRealesMesActual : 0),
  );

  return {
    realMensual,
    realAcumulado,
    ultimoMesConCarga1a12,
    sumaHorasDirectasSinProrrateo,
    sumaRealMensualEnAnio,
    kpis: {
      directasRealesAcumuladasYTD,
      directasRealesMesActual,
      pctCargabilidadAreaAcumYTD,
      horasFaltantesVsObjetivoAjustadoMes,
    },
  };
}
