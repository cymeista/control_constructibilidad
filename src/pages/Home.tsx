import { useState, useMemo, useEffect } from "react";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { useAppData, type Entregable } from "@/context/AppDataContext";
import {
  buildDashboardCurvaObjetivoSeries,
  seleccionarCurvaObjetivoPorAnio,
} from "@/entregables/dashboardCurvaObjetivoAnual";
import { buildDashboardCurvaRealRegistroHora } from "@/entregables/dashboardCurvaRealRegistroHora";
import { buildDashboardCurvaPropuestaEntregables } from "@/entregables/dashboardCurvaPropuestaEntregables";
import {
  faltanteVsObjetivoAjustadoMesDisplay,
  horasVendidasProyectosAnio,
  resolverHorasPropuestasMesSiguiente,
} from "@/entregables/dashboardKpisPresentacion";
import {
  calculateAvanceTeorico,
  entregableToSeguimientoPayload,
  recalcularSeguimientoTrasAvanceReal,
  resolverEstadoVisualEntregable,
} from "@/entregables/entregableSeguimiento";
import {
  entregableEsCompletadoReciente,
  estadoToDonutSlice,
  type EntregableDonutSlice,
} from "@/entregables/entregableDashboardFiltros";
import KpiCard, { kpiCardsGridClassName } from "@/components/KpiCard";
import { MobileCardRow } from "@/components/formularios/EntityMobileCardRows";
import StatusPill from "@/components/StatusPill";
import SectionHeader from "@/components/SectionHeader";
import FilterBar from "@/components/FilterBar";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import ChartJsLineFrame from "@/components/ChartJsLineFrame";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, StickyNote } from "lucide-react";
import EntregableNotaSeguimientoModal from "@/components/EntregableNotaSeguimientoModal";
import { EntregableRedistribuirHorasTrigger } from "@/components/EntregableRedistribuirHorasTrigger";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/security/AuthContext";
import { canEditAvance, canEditNotas } from "@/security/permissions";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

function ProgressBarCell({ value, status }: { value: number; status: string }) {
  const color =
    status === "CRITICO"
      ? "#B91C1C"
      : status === "RIESGO"
      ? "#B45309"
      : status === "EN_PLAZO" || status === "ADELANTADO" || status === "COMPLETADO"
      ? "#047857"
      : "#475569";
  return (
    <div className="flex items-center gap-2">
      <div className="h-[5px] min-w-[44px] flex-1 rounded-[3px] bg-bdr">
        <div
          className="h-full rounded-[3px] transition-all duration-500"
          style={{ width: `${Math.min(value * 100, 100)}%`, background: color }}
        />
      </div>
      <span className="min-w-[34px] text-right font-mono text-[11px] text-t500">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function DateCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-[11.5px] font-mono text-t300">—</span>;
  const d = new Date(date);
  const today = new Date();
  const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  let cls = "text-[11.5px] font-mono text-t500";
  if (diff < 0) cls = "text-[11.5px] font-mono font-medium text-red";
  else if (diff <= 7) cls = "text-[11.5px] font-mono font-medium text-amber";
  return <span className={cls}>{format(d, "dd/MM/yyyy")}</span>;
}

type StatusPillVariant = Parameters<typeof StatusPill>[0]["variant"];

function donutSliceToPillVariant(slice: EntregableDonutSlice): StatusPillVariant {
  switch (slice) {
    case "CRITICO":
      return "CRITICO";
    case "RIESGO":
      return "RIESGO";
    case "NO_INICIADO":
      return "NO_INICIADO";
    case "COMPLETADO":
      return "COMPLETADO";
    case "ADELANTADO":
      return "ADELANTADO";
    default:
      return "OK";
  }
}

/** Texto legible en tabla; estados ya en español se muestran íntegros. */
function estadoToEtiquetaTabla(estado: Entregable["estado"]): string {
  const s = String(estado);
  const legacy: Record<string, string> = {
    COMPLETADO: "Completado",
    NO_INICIADO: "No Iniciado",
    EN_PLAZO: "En Plazo",
    ADELANTADO: "Adelantado",
    RIESGO: "Riesgo",
    CRITICO: "Crítico",
    OK: "En Plazo",
  };
  return legacy[s] ?? s;
}

function estadoToProgressStatus(estado: Entregable["estado"]): string {
  const slice = estadoToDonutSlice(estado);
  if (slice === "CRITICO") return "CRITICO";
  if (slice === "RIESGO") return "RIESGO";
  if (slice === "COMPLETADO") return "COMPLETADO";
  if (slice === "NO_INICIADO") return "NO_INICIADO";
  if (slice === "ADELANTADO") return "ADELANTADO";
  return "EN_PLAZO";
}

function EntregableAvanceRapido({ entregable }: { entregable: Entregable }) {
  const { updateEntregable } = useAppData();
  const { role } = useAuth();
  const puedeEditar = role ? canEditAvance(role) : false;
  const pctFromReal = (ar: number) => Math.round(ar * 10000) / 100;
  const [pctStr, setPctStr] = useState(() => String(pctFromReal(entregable.avance_real)));

  useEffect(() => {
    setPctStr(String(pctFromReal(entregable.avance_real)));
  }, [entregable.id, entregable.avance_real]);

  const handleSave = () => {
    if (!puedeEditar) return;
    const n = Number(String(pctStr).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return;
    const patch = recalcularSeguimientoTrasAvanceReal(entregable, n / 100);
    updateEntregable(entregable.id, patch);
  };

  if (!puedeEditar) {
    return (
      <span className="mt-1 inline-block font-mono text-[11px] text-t600" title="Solo lectura">
        {pctFromReal(entregable.avance_real)}%
      </span>
    );
  }

  return (
    <div className="mt-1 flex max-w-[200px] flex-nowrap items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={pctStr}
        onChange={(e) => setPctStr(e.target.value)}
        className="w-[52px] shrink-0 rounded-r4 border border-bdr px-1 py-0.5 text-[11px] font-mono text-t900"
        aria-label="Avance real en porcentaje"
      />
      <span className="shrink-0 text-[11px] font-medium text-t500">%</span>
      <button
        type="button"
        onClick={handleSave}
        className="shrink-0 whitespace-nowrap rounded-r4 border border-bdr bg-surface px-2 py-0.5 text-[10px] font-semibold text-t700 hover:bg-surface2"
      >
        Guardar
      </button>
    </div>
  );
}

const MES_NOMBRE_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MES_ABBR_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

function mesTitulo(m0: number) {
  const m = MES_NOMBRE_ES[m0];
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : "";
}

function fmtHorasCurva(n: number) {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtUfSeg(u: number) {
  return u.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function horasPropuestaP4P3P2(e: Entregable): number {
  return nneg(e.hrs_p4) + nneg(e.hrs_p3) + nneg(e.hrs_p2);
}

function codigoFaseEntregable(e: Entregable): string {
  const f = (e.fase_codigo ?? "").trim();
  const t = (e.tarea_codigo ?? "").trim();
  if (f && t) return `${f} / ${t}`;
  return f || t || "";
}

function CardCampoCompacto({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1 leading-snug">
      <span className="shrink-0 text-[10px] font-semibold text-t500">{label}:</span>
      <span className="min-w-0 text-[11px] text-t800">{children}</span>
    </div>
  );
}

function DashboardEntregableSeguimientoCard({
  e,
  clienteNombre,
  proyectoCodigo,
  proyectoNombre,
  pmNombre,
  liderNombre,
  estadoVisual,
  status,
  progressStatus,
  completadoReciente,
  hp,
  avanceTeoricoVista,
  puedeEditarNotas,
  onNota,
}: {
  e: Entregable;
  clienteNombre: string;
  proyectoCodigo: string;
  proyectoNombre: string;
  pmNombre: string;
  liderNombre: string;
  estadoVisual: Entregable["estado"];
  status: StatusPillVariant;
  progressStatus: string;
  completadoReciente: boolean;
  hp: number;
  avanceTeoricoVista: number;
  puedeEditarNotas: boolean;
  onNota: () => void;
}) {
  const codigo = codigoFaseEntregable(e);
  return (
    <article className="overflow-hidden rounded-r10 border border-bdr bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-t500">{clienteNombre}</p>
      <p className="mt-0.5 text-[11px] text-t600">
        <span className="font-mono font-semibold text-copper">{proyectoCodigo}</span> · {proyectoNombre}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-t900">{e.nombre}</p>
      {codigo ? <p className="text-[10px] text-t500">{codigo}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusPill variant={status} labelOverride={estadoToEtiquetaTabla(estadoVisual)} />
        {completadoReciente ? (
          <span className="rounded-r6 border border-bdr bg-surface2 px-2 py-0.5 text-[10px] font-semibold text-t500">
            Completado reciente
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <CardCampoCompacto label="PM">{pmNombre}</CardCampoCompacto>
        <CardCampoCompacto label="Líder">{liderNombre}</CardCampoCompacto>
      </div>
      <div className="mt-2 space-y-2">
        <div>
          <p className="mb-0.5 text-[10px] font-semibold text-t500">Avance real</p>
          <ProgressBarCell value={e.avance_real} status={progressStatus} />
          <EntregableAvanceRapido entregable={e} />
        </div>
        <div>
          <p className="mb-0.5 text-[10px] font-semibold text-t500">Avance teórico</p>
          <ProgressBarCell value={avanceTeoricoVista} status={progressStatus} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <div className="min-w-0 space-y-1">
          <CardCampoCompacto label="Rev. A">
            <DateCell date={e.fecha_revA} />
          </CardCampoCompacto>
          <CardCampoCompacto label="Rev. B">
            <DateCell date={e.fecha_revB} />
          </CardCampoCompacto>
          <CardCampoCompacto label="Rev. P">
            <DateCell date={e.fecha_revP} />
          </CardCampoCompacto>
          {e.fecha_termino?.trim() ? (
            <CardCampoCompacto label="Término">
              <DateCell date={e.fecha_termino} />
            </CardCampoCompacto>
          ) : null}
        </div>
        <div className="min-w-0 space-y-1">
          <CardCampoCompacto label="UF">
            <span className="font-mono tabular-nums">
              {fmtUfSeg(e.uf_presupuestadas)} / {fmtUfSeg(e.uf_consumidas)}
            </span>
          </CardCampoCompacto>
          <CardCampoCompacto label="Horas">
            <span className="font-mono tabular-nums">
              {fmtHorasCurva(hp)} / {fmtHorasCurva(e.hrs_gastadas)}
            </span>
          </CardCampoCompacto>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-bdr pt-2">
        <div className="w-full [&_button]:min-h-[40px] [&_button]:w-full">
          <EntregableRedistribuirHorasTrigger ent={e} dense showBadges={false} className="w-full" />
        </div>
        {puedeEditarNotas ? (
          <Button type="button" variant="outline" className="min-h-[40px] gap-1 px-3 text-[12px]" onClick={onNota}>
            <StickyNote className="h-3.5 w-3.5" />
            {puedeEditarNotas ? (e.nota_seguimiento?.trim() ? "Editar nota" : "Nota") : "Ver nota"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function DashboardProximoInicioCard({
  e,
  clienteNombre,
  proyectoCodigo,
  proyectoNombre,
  estadoVisual,
  status,
  hp,
}: {
  e: Entregable;
  clienteNombre: string;
  proyectoCodigo: string;
  proyectoNombre: string;
  estadoVisual: Entregable["estado"];
  status: StatusPillVariant;
  hp: number;
}) {
  return (
    <article className="rounded-r10 border border-bdr bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-t500">{clienteNombre}</p>
      <p className="mt-0.5 text-[11px] text-t600">
        <span className="font-mono font-semibold text-copper">{proyectoCodigo}</span> · {proyectoNombre}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-t900">{e.nombre}</p>
      <div className="mt-2 grid grid-cols-1 gap-y-2 sm:grid-cols-2">
        <MobileCardRow label="Inicio">
          <span className="font-mono text-[12px]">{e.fecha_inicio || "—"}</span>
        </MobileCardRow>
        <MobileCardRow label="Estado">
          <StatusPill variant={status} labelOverride={estadoToEtiquetaTabla(estadoVisual)} />
        </MobileCardRow>
        <MobileCardRow label="UF prop. / gasto">
          <span className="font-mono text-[12px]">
            {fmtUfSeg(e.uf_presupuestadas)} / {fmtUfSeg(e.uf_consumidas)}
          </span>
        </MobileCardRow>
        <MobileCardRow label="Hrs prop. / gasto">
          <span className="font-mono text-[12px]">
            {fmtHorasCurva(hp)} / {fmtHorasCurva(e.hrs_gastadas)}
          </span>
        </MobileCardRow>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-bdr pt-3">
        <div className="w-full [&_button]:min-h-[44px] [&_button]:w-full">
          <EntregableRedistribuirHorasTrigger ent={e} dense showBadges={false} className="w-full" />
        </div>
      </div>
    </article>
  );
}

function nneg(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseFechaInicioMs(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Filtro de estado del bloque seguimiento (normalizado vía `estadoToDonutSlice`). */
type EstadoSeguimientoFiltro =
  | "TODOS"
  | "ACTIVOS"
  | "COMPLETADOS"
  | "NO_INICIADOS"
  | "RIESGO"
  | "ATRASADOS"
  | "ADELANTADOS"
  | "EN_PLAZO";

function entregablePasaFiltroEstadoSeguimiento(e: Entregable, filtro: EstadoSeguimientoFiltro): boolean {
  const slice = estadoToDonutSlice(e.estado);
  switch (filtro) {
    case "TODOS":
      return true;
    case "ACTIVOS":
      if (slice === "NO_INICIADO") return false;
      if (slice !== "COMPLETADO") return true;
      // Completados recientes: se mantienen visibles en Activos por 7 días.
      return entregableEsCompletadoReciente(e, new Date(), 7);
    case "COMPLETADOS":
      return slice === "COMPLETADO";
    case "NO_INICIADOS":
      return slice === "NO_INICIADO";
    case "RIESGO":
      return slice === "RIESGO";
    case "ATRASADOS":
      return slice === "CRITICO";
    case "ADELANTADOS":
      return slice === "ADELANTADO";
    case "EN_PLAZO":
      return slice === "EN_PLAZO";
    default:
      return true;
  }
}

export default function Home() {
  const data = useAppData();
  const { updateEntregable } = data;
  const { role } = useAuth();
  const puedeEditarNotas = role ? canEditNotas(role) : false;
  const [factor, setFactor] = useState(85);
  const [clienteFilter, setClienteFilter] = useState("");
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [liderFilter, setLiderFilter] = useState("");
  const [estadoSeguimientoFiltro, setEstadoSeguimientoFiltro] = useState<EstadoSeguimientoFiltro>("ACTIVOS");
  /** Índice de mes 0–11 para modal de desglose Bloque Dashboard 3 (propuesta). */
  const [propuestaDetalleMesIdx, setPropuestaDetalleMesIdx] = useState<number | null>(null);
  const [closedClienteSeguimiento, setClosedClienteSeguimiento] = useState<Set<string>>(() => new Set());
  const [closedProyectoSeguimiento, setClosedProyectoSeguimiento] = useState<Set<string>>(() => new Set());
  const [notaSegEntregableId, setNotaSegEntregableId] = useState<string | null>(null);
  const isBelowMd = useIsBelowMd();
  const [curvaExplicacionAbierta, setCurvaExplicacionAbierta] = useState(false);

  const anioCalendario = new Date().getFullYear();
  const curvaObjetivoAnualActual = useMemo(
    () => seleccionarCurvaObjetivoPorAnio(data.curvas_objetivo_anual, anioCalendario),
    [data.curvas_objetivo_anual, anioCalendario],
  );
  const curvaObjetivoDashboard = useMemo(() => {
    if (!curvaObjetivoAnualActual) return null;
    return buildDashboardCurvaObjetivoSeries(curvaObjetivoAnualActual, factor, new Date());
  }, [curvaObjetivoAnualActual, factor]);

  const mapsConsumoReal = useMemo(() => {
    const entById = new Map(data.entregables.map((e) => [e.id, { id: e.id, proyecto_id: e.proyecto_id }]));
    const projById = new Map(
      data.proyectos.map((p) => [
        p.id,
        {
          id: p.id,
          tarifa_l2: p.tarifa_l2,
          tarifa_p4: p.tarifa_p4,
          tarifa_p3: p.tarifa_p3,
          tarifa_p2: p.tarifa_p2,
        },
      ]),
    );
    const profById = new Map(data.profesionales.map((p) => [p.id, { id: p.id, cargo: p.cargo }]));
    return { entById, projById, profById };
  }, [data.entregables, data.proyectos, data.profesionales]);

  /** Bloque Dashboard 2: curva real prorrateada + máscara null después del último mes con carga. */
  const curvaChartPack = useMemo(() => {
    if (!curvaObjetivoDashboard) return null;
    const { entById, projById, profById } = mapsConsumoReal;
    const real = buildDashboardCurvaRealRegistroHora(
      data.registro_horas,
      entById,
      projById,
      profById,
      anioCalendario,
      new Date(),
      curvaObjetivoDashboard.kpis.objetivoMesActualAjustado,
    );
    const last = real.ultimoMesConCarga1a12;
    const lastIdx = last != null ? last - 1 : -1;
    const realM =
      lastIdx < 0
        ? real.realMensual.map(() => null as number | null)
        : real.realMensual.map((v, i) => (i > lastIdx ? null : v));
    const realA =
      lastIdx < 0
        ? real.realAcumulado.map(() => null as number | null)
        : real.realAcumulado.map((v, i) => (i > lastIdx ? null : v));
    const propuesta = buildDashboardCurvaPropuestaEntregables(
      data.entregables,
      data.proyectos,
      anioCalendario,
      new Date(),
      curvaObjetivoDashboard.ajusteAcum,
      real.realAcumulado,
    );
    return { obj: curvaObjetivoDashboard, real, realM, realA, factor, propuesta };
  }, [curvaObjetivoDashboard, mapsConsumoReal, data.registro_horas, data.entregables, data.proyectos, anioCalendario]);

  const curvaObjetivoAcumLineData = useMemo(() => {
    if (!curvaChartPack) return null;
    const { obj, factor, realA, propuesta } = curvaChartPack;
    return {
      labels: obj.labels,
      datasets: [
        {
          label: isBelowMd
            ? `Obj. acum. (${factor}%)`
            : `Objetivo acumulado horas directas (ajuste ${factor}%)`,
          data: obj.ajusteAcum,
          borderColor: "#4f46e5",
          backgroundColor: "rgba(79,70,229,0.06)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 14,
          borderWidth: 2,
          order: 1,
        },
        {
          label: isBelowMd ? "Propuesta acum." : "Propuesta acumulada (P4+P3+P2)",
          data: propuesta.propuestaAcumulado,
          borderColor: "#0369a1",
          backgroundColor: "rgba(3,105,161,0.04)",
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 14,
          borderWidth: 2,
          borderDash: [6, 4] as [number, number],
          order: 2,
        },
        {
          label: isBelowMd ? "Real acum." : "Real acumulado (DIRECTA)",
          data: realA,
          borderColor: "#c2410c",
          backgroundColor: "rgba(194,65,12,0.04)",
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 16,
          borderWidth: 2,
          spanGaps: false,
          order: 3,
        },
      ],
    };
  }, [curvaChartPack, isBelowMd]);

  const curvaObjetivoMensualLineData = useMemo(() => {
    if (!curvaChartPack) return null;
    const { obj, factor, realM, propuesta } = curvaChartPack;
    return {
      labels: obj.labels,
      datasets: [
        {
          label: isBelowMd
            ? `Obj. mens. (${factor}%)`
            : `Objetivo mensual horas directas (ajuste ${factor}%)`,
          data: obj.ajusteMensual,
          borderColor: "#4f46e5",
          backgroundColor: "rgba(79,70,229,0.06)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 14,
          borderWidth: 2,
          order: 1,
        },
        {
          label: isBelowMd ? "Propuesta mens." : "Propuesta mensual (P4+P3+P2)",
          data: propuesta.propuestaMensual,
          borderColor: "#0369a1",
          backgroundColor: "rgba(3,105,161,0.04)",
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 14,
          borderWidth: 2,
          borderDash: [6, 4] as [number, number],
          order: 2,
        },
        {
          label: isBelowMd ? "Real mens." : "Real mensual (DIRECTA)",
          data: realM,
          borderColor: "#c2410c",
          backgroundColor: "rgba(194,65,12,0.04)",
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 16,
          borderWidth: 2,
          spanGaps: false,
          order: 3,
        },
      ],
    };
  }, [curvaChartPack, isBelowMd]);

  /* ── Table filtering (bloque seguimiento) ── */
  const filteredEntregables = useMemo(() => {
    return data.entregables.filter((e) => {
      const p = data.proyectos.find((pr) => pr.id === e.proyecto_id);
      const c = p ? data.clientes.find((cl) => cl.id === p.cliente_id) : null;
      if (!entregablePasaFiltroEstadoSeguimiento(e, estadoSeguimientoFiltro)) return false;
      if (clienteFilter && c?.id !== clienteFilter) return false;
      if (proyectoFilter && p?.id !== proyectoFilter) return false;
      if (liderFilter && e.lider_id !== liderFilter) return false;
      return true;
    });
  }, [data, estadoSeguimientoFiltro, clienteFilter, proyectoFilter, liderFilter]);

  const grupoSeguimientoClienteProyecto = useMemo(() => {
    type Pj = { proyectoId: string; proyectoCodigo: string; proyectoNombre: string; items: Entregable[] };
    type Cl = { clienteId: string; clienteNombre: string; proyectos: Pj[] };
    const byCliente = new Map<string, { nombre: string; byProj: Map<string, Entregable[]> }>();
    for (const e of filteredEntregables) {
      const p = data.proyectos.find((pr) => pr.id === e.proyecto_id);
      const c = p ? data.clientes.find((cl) => cl.id === p.cliente_id) : null;
      if (!p || !c) continue;
      const cid = c.id;
      if (!byCliente.has(cid)) byCliente.set(cid, { nombre: c.nombre, byProj: new Map() });
      const bucket = byCliente.get(cid)!;
      if (!bucket.byProj.has(p.id)) bucket.byProj.set(p.id, []);
      bucket.byProj.get(p.id)!.push(e);
    }
    const out: Cl[] = [];
    for (const [clienteId, { nombre, byProj }] of byCliente) {
      const proyectos: Pj[] = [];
      for (const [proyectoId, items] of byProj) {
        const pr = data.proyectos.find((x) => x.id === proyectoId);
        if (!pr) continue;
        const sorted = [...items].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        proyectos.push({
          proyectoId,
          proyectoCodigo: pr.codigo,
          proyectoNombre: pr.nombre,
          items: sorted,
        });
      }
      proyectos.sort((a, b) => a.proyectoCodigo.localeCompare(b.proyectoCodigo, "es"));
      out.push({ clienteId, clienteNombre: nombre, proyectos });
    }
    out.sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre, "es"));
    return out;
  }, [filteredEntregables, data.proyectos, data.clientes]);

  const entregablesProximosInicio3Semanas = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 21 * 86400000);
    end.setHours(23, 59, 59, 999);
    const t0 = start.getTime();
    const t1 = end.getTime();
    return data.entregables.filter((e) => {
      const p = data.proyectos.find((pr) => pr.id === e.proyecto_id);
      const c = p ? data.clientes.find((cl) => cl.id === p.cliente_id) : null;
      if (clienteFilter && c?.id !== clienteFilter) return false;
      if (proyectoFilter && p?.id !== proyectoFilter) return false;
      if (liderFilter && e.lider_id !== liderFilter) return false;
      const tin = parseFechaInicioMs(e.fecha_inicio);
      if (tin == null) return false;
      return tin >= t0 && tin <= t1;
    });
  }, [data.entregables, data.proyectos, data.clientes, clienteFilter, proyectoFilter, liderFilter]);

  /* ── Filter options ── */
  const clienteOptions = useMemo(
    () => [{ value: "", label: "Todos los clientes" }, ...data.clientes.map((c) => ({ value: c.id, label: c.nombre }))],
    [data.clientes]
  );
  const proyectoOptions = useMemo(() => {
    const base = [{ value: "", label: "Todos los proyectos" }];
    const list = data.proyectos
      .filter((p) => !clienteFilter || p.cliente_id === clienteFilter)
      .map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }));
    return [...base, ...list];
  }, [data.proyectos, clienteFilter]);
  const liderOptions = useMemo(
    () => [{ value: "", label: "Todos los líderes" }, ...data.profesionales.map((p) => ({ value: p.id, label: p.nombre_completo }))],
    [data.profesionales]
  );

  const chartOptionsCommon = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            font: { family: "'IBM Plex Sans', sans-serif", size: isBelowMd ? 9 : 11 },
            color: "#64748b",
            boxWidth: isBelowMd ? 10 : 14,
            padding: isBelowMd ? 6 : 14,
          },
        },
        tooltip: {
          backgroundColor: "#ffffff",
          titleColor: "#0f172a",
          bodyColor: "#334155",
          borderColor: "#d8dee9",
          borderWidth: 1,
          padding: isBelowMd ? 10 : 14,
          displayColors: true,
          boxShadow: "0 10px 28px rgba(15,23,42,.08), 0 2px 6px rgba(15,23,42,.04)",
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxRotation: isBelowMd ? 45 : 0,
            autoSkip: true,
            maxTicksLimit: isBelowMd ? 6 : 12,
            font: { family: "'IBM Plex Mono', monospace", size: isBelowMd ? 9 : 10 },
            color: "#94a3b8",
          },
        },
        y: {
          grid: { color: "#e8ecf2", borderDash: [2, 2] as [number, number] },
          ticks: {
            maxTicksLimit: isBelowMd ? 5 : 8,
            font: { family: "'IBM Plex Mono', monospace", size: isBelowMd ? 9 : 10 },
            color: "#94a3b8",
          },
        },
      },
      animation: { duration: 800, easing: "easeOutQuart" as const },
    }),
    [isBelowMd],
  );

  const curvaLegend = useMemo(
    () => ({
      display: true,
      position: (isBelowMd ? "bottom" : "top") as "bottom" | "top",
      labels: {
        font: { family: "'IBM Plex Sans', sans-serif", size: isBelowMd ? 9 : 11 },
        color: "#64748b",
        boxWidth: isBelowMd ? 10 : 14,
        padding: isBelowMd ? 8 : 14,
      },
    }),
    [isBelowMd],
  );

  /** Tooltips: objetivo ajustado, propuesta (Bloque 3) y real; clic en el gráfico abre desglose propuesta del mes. */
  const lineChartOptionsCurvaAcum = useMemo(() => {
    const common = chartOptionsCommon;
    const pack = curvaChartPack;
    const basePlugins = common.plugins;
    if (!pack) {
      return {
        ...common,
        plugins: { ...basePlugins, legend: curvaLegend },
        scales: { ...common.scales, y: { ...common.scales.y, beginAtZero: true } },
      };
    }
    const { obj, realA, factor, propuesta } = pack;
    return {
      ...common,
      interaction: { mode: "index" as const, intersect: false },
      onClick: (_evt: unknown, elements: { index: number }[]) => {
        if (elements.length > 0 && typeof elements[0].index === "number") {
          setPropuestaDetalleMesIdx(elements[0].index);
        }
      },
      plugins: {
        ...basePlugins,
        legend: curvaLegend,
        tooltip: {
          ...basePlugins.tooltip,
          displayColors: false,
          callbacks: {
            title: (items: { dataIndex: number }[]) => {
              const i = items[0]?.dataIndex ?? 0;
              return obj.labels[i] ?? `Mes ${i + 1}`;
            },
            label: () => "",
            afterBody: (items: { dataIndex: number }[]) => {
              const i = items[0]?.dataIndex ?? 0;
              const adj = obj.ajusteAcum[i] ?? 0;
              const pp = propuesta.propuestaAcumulado[i] ?? 0;
              const rv = realA[i];
              const lineReal =
                rv != null && Number.isFinite(rv) ? `Real acumulado (DIRECTA): ${fmtHorasCurva(rv)} h` : "Real acumulado (DIRECTA): —";
              return [
                `Objetivo acumulado de horas directas ajustado al ${factor}%: ${fmtHorasCurva(adj)} h`,
                `Propuesta acumulada (P4+P3+P2): ${fmtHorasCurva(pp)} h`,
                lineReal,
                "",
                "Esta curva no representa el % de cargabilidad real. Representa la meta acumulada de horas directas esperadas, calculada sobre la curva anual ajustada por el factor seleccionado.",
              ];
            },
          },
        },
      },
      scales: { ...common.scales, y: { ...common.scales.y, beginAtZero: true } },
    };
  }, [curvaChartPack, chartOptionsCommon, curvaLegend]);

  const lineChartOptionsCurvaMensual = useMemo(() => {
    const common = chartOptionsCommon;
    const pack = curvaChartPack;
    const basePlugins = common.plugins;
    if (!pack) {
      return {
        ...common,
        plugins: { ...basePlugins, legend: curvaLegend },
        scales: { ...common.scales, y: { ...common.scales.y, beginAtZero: true } },
      };
    }
    const { obj, realM, factor, propuesta } = pack;
    return {
      ...common,
      interaction: { mode: "index" as const, intersect: false },
      onClick: (_evt: unknown, elements: { index: number }[]) => {
        if (elements.length > 0 && typeof elements[0].index === "number") {
          setPropuestaDetalleMesIdx(elements[0].index);
        }
      },
      plugins: {
        ...basePlugins,
        legend: curvaLegend,
        tooltip: {
          ...basePlugins.tooltip,
          displayColors: false,
          callbacks: {
            title: (items: { dataIndex: number }[]) => {
              const i = items[0]?.dataIndex ?? 0;
              return obj.labels[i] ?? `Mes ${i + 1}`;
            },
            label: () => "",
            afterBody: (items: { dataIndex: number }[]) => {
              const i = items[0]?.dataIndex ?? 0;
              const adj = obj.ajusteMensual[i] ?? 0;
              const pm = propuesta.propuestaMensual[i] ?? 0;
              const rv = realM[i];
              const lineReal =
                rv != null && Number.isFinite(rv) ? `Real mensual (DIRECTA): ${fmtHorasCurva(rv)} h` : "Real mensual (DIRECTA): —";
              return [
                `Objetivo mensual de horas directas ajustado al ${factor}%: ${fmtHorasCurva(adj)} h`,
                `Propuesta mensual (P4+P3+P2): ${fmtHorasCurva(pm)} h`,
                lineReal,
                "",
                "Esta curva no representa el % de cargabilidad real. Representa la meta acumulada de horas directas esperadas, calculada sobre la curva anual ajustada por el factor seleccionado.",
              ];
            },
          },
        },
      },
      scales: { ...common.scales, y: { ...common.scales.y, beginAtZero: true } },
    };
  }, [curvaChartPack, chartOptionsCommon, curvaLegend]);

  const nowStr = format(new Date(), "dd/MM/yyyy HH:mm");
  const nowStrCorto = format(new Date(), "dd/MM/yy HH:mm");

  return (
    <div className="min-w-0 max-w-full space-y-10 overflow-x-hidden pb-20 md:pb-0 lg:space-y-12">
      {/* ── Section 1: Curva objetivo anual (equipo) ── */}
      <section className="min-w-0 max-w-full overflow-x-hidden">
        <SectionHeader
          number="01"
          title="Curva objetivo anual · equipo"
          hint={
            isBelowMd
              ? `Actualizado ${nowStrCorto}`
              : `Última actualización: ${nowStr} · CurvaObjetivoAnual + real RegistroHora + propuesta P4+P3+P2 por entregable (solo lectura)`
          }
        />

        <div className="mb-4 flex flex-col gap-3 rounded-r12 border border-bdr bg-surface px-4 py-3 shadow-sh1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:px-5 sm:py-4">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-t400">
            Factor de ajuste del objetivo
          </span>
          <div className="flex min-w-0 w-full items-center gap-3 sm:min-w-[120px] sm:flex-1">
            <input
              type="range"
              min={0}
              max={100}
              value={factor}
              onChange={(e) => setFactor(Number(e.target.value))}
              className="h-[6px] min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface2 accent-copper"
            />
            <span className="shrink-0 min-w-[40px] text-right font-sans text-[1.05rem] font-semibold tabular-nums text-copper sm:text-[1.15rem]">
              {factor}%
            </span>
          </div>
          <span className="min-w-0 text-[11px] leading-snug text-t300 md:hidden">
            Multiplica la curva anual de <strong>horas directas esperadas</strong> (no es cargabilidad real). La curva
            real viene de RegistroHora (DIRECTAS).
          </span>
          <span className="hidden min-w-0 text-[11px] text-t300 md:inline">
            Recalcula en pantalla la <strong>meta de horas directas</strong> (curva anual × factor); no es el % de
            cargabilidad real. La curva <strong>real</strong> viene de RegistroHora (DIRECTAS · prorrateadas por semana).
            No modifica la curva objetivo guardada.
          </span>
        </div>

        {/* Bloque Dashboard 1: solo CurvaObjetivoAnual (lectura; ajuste no persiste) */}
        {!curvaObjetivoAnualActual ? (
          <div className="mb-4 rounded-r12 border border-amber-500/45 bg-amber-500/10 px-4 py-4 text-[13px] text-t800 shadow-sh1">
            <p className="font-semibold text-amber-950">No existe Curva Objetivo Anual para {anioCalendario}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-t700">
              Crea la curva del año en curso en <strong>Formularios → Curva objetivo anual</strong>. Esta sección usa
              únicamente esa fuente para la meta de equipo al 100% y la vista ajustada por factor (%), sin escribir en
              los datos guardados.
            </p>
          </div>
        ) : curvaObjetivoDashboard ? (
          <div className="mb-6 space-y-4">
            {curvaChartPack ? (
              <div className="space-y-3">
                {curvaChartPack.propuesta.exclusiones.totalEntregables -
                  curvaChartPack.propuesta.exclusiones.incluidos >
                0 ? (
                  <div className="rounded-r8 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-t800">
                    <p className="font-semibold text-amber-950">
                      {curvaChartPack.propuesta.exclusiones.totalEntregables -
                        curvaChartPack.propuesta.exclusiones.incluidos}{" "}
                      entregables excluidos de la curva de propuesta
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-t600 md:mt-0 md:inline">
                      <span className="md:hidden">
                        Fechas inválidas: {curvaChartPack.propuesta.exclusiones.porFechasInvalidasOVacias} · término
                        &lt; inicio: {curvaChartPack.propuesta.exclusiones.porTerminoAntesQueInicio} · sin horas:{" "}
                        {curvaChartPack.propuesta.exclusiones.porHorasNoPositivas}
                      </span>
                      <span className="hidden md:inline">
                        {" "}
                        · fechas vacías o inválidas: {curvaChartPack.propuesta.exclusiones.porFechasInvalidasOVacias} ·
                        término &lt; inicio: {curvaChartPack.propuesta.exclusiones.porTerminoAntesQueInicio} · sin horas
                        P4+P3+P2 &gt; 0: {curvaChartPack.propuesta.exclusiones.porHorasNoPositivas}
                      </span>
                    </p>
                  </div>
                ) : null}
                {(() => {
                  const mesIdxActual =
                    anioCalendario === new Date().getFullYear() ? new Date().getMonth() : 11;
                  const ytdRango = `${MES_ABBR_ES[0]}–${MES_ABBR_ES[mesIdxActual]} ${anioCalendario}`;
                  const mesCalTitulo = `${mesTitulo(mesIdxActual)} ${anioCalendario}`;
                  const horasVendidas = horasVendidasProyectosAnio(
                    data.entregables,
                    data.proyectos,
                    anioCalendario,
                  );
                  const propMesSig = resolverHorasPropuestasMesSiguiente(
                    data.entregables,
                    data.proyectos,
                    anioCalendario,
                    new Date(),
                    curvaObjetivoDashboard.ajusteAcum,
                    curvaChartPack.propuesta.propuestaMensual,
                    curvaChartPack.propuesta.kpis.mesKpi1a12,
                  );
                  const faltanteMes = faltanteVsObjetivoAjustadoMesDisplay(
                    curvaObjetivoDashboard.kpis.objetivoMesActualAjustado,
                    curvaChartPack.real.kpis.directasRealesMesActual,
                  );
                  const faltanteValor = faltanteMes.esSobreObjetivo
                    ? `+${fmtHorasCurva(Math.abs(faltanteMes.valorHoras))} h`
                    : `${fmtHorasCurva(faltanteMes.valorHoras)} h`;
                  return (
                    <>
                      <div className={kpiCardsGridClassName}>
                        <KpiCard
                          label="OBJETIVO ANUAL AJUSTADO"
                          value={`${fmtHorasCurva(curvaObjetivoDashboard.kpis.objetivoAnualAjustado)} h`}
                          subtitle={
                            isBelowMd
                              ? `Curva anual × ${factor}%`
                              : `Meta anual horas directas · curva × ${factor}% (no es cargabilidad real)`
                          }
                          topColor="#4f46e5"
                        />
                        <KpiCard
                          label={
                            isBelowMd
                              ? `HORAS VENDIDAS ${anioCalendario}`
                              : `HORAS VENDIDAS EN PROPUESTAS AÑO ${anioCalendario}`
                          }
                          value={`${fmtHorasCurva(horasVendidas)} h`}
                          subtitle={isBelowMd ? `P4+P3+P2 · ${anioCalendario}` : `Proyectos ${anioCalendario} · hrs P4+P3+P2`}
                          topColor="#7c3aed"
                        />
                        <KpiCard
                          label="HORAS PROPUESTAS DEL MES"
                          value={`${fmtHorasCurva(curvaChartPack.propuesta.kpis.horasPropuestasMesActual)} h`}
                          subtitle={isBelowMd ? "Planificadas mes · P4+P3+P2" : "Teóricas / planificadas del mes · P4+P3+P2"}
                          topColor="#0369a1"
                        />
                        <KpiCard
                          label={isBelowMd ? "PROPUESTAS MES SIG." : "HORAS PROPUESTAS MES SIGUIENTE"}
                          value={`${fmtHorasCurva(propMesSig.horas)} h`}
                          subtitle={isBelowMd ? propMesSig.etiquetaMes : `Teóricas / planificadas · ${propMesSig.etiquetaMes}`}
                          topColor="#0369a1"
                        />
                      </div>
                      <div className={kpiCardsGridClassName}>
                        <KpiCard
                          label="DIRECTAS REALES (YTD)"
                          value={`${fmtHorasCurva(curvaChartPack.real.kpis.directasRealesAcumuladasYTD)} h`}
                          subtitle={
                            isBelowMd
                              ? `${ytdRango} · DIRECTA`
                              : `${ytdRango} · RegistroHora DIRECTA · prorrateadas por semana`
                          }
                          topColor="#c2410c"
                        />
                        <KpiCard
                          label="DIRECTAS REALES DEL MES"
                          value={`${fmtHorasCurva(curvaChartPack.real.kpis.directasRealesMesActual)} h`}
                          subtitle={isBelowMd ? `DIRECTA · ${mesCalTitulo}` : `RegistroHora DIRECTA del mes · ${mesCalTitulo}`}
                          topColor="#c2410c"
                        />
                        <KpiCard
                          label={isBelowMd ? "FALTANTE VS OBJ. (MES)" : "FALTANTE VS OBJ. AJUSTADO (MES)"}
                          value={faltanteValor}
                          subtitle={
                            faltanteMes.esSobreObjetivo
                              ? isBelowMd
                                ? "Sobre objetivo del mes"
                                : "Sobre objetivo del mes (real > obj. ajustado)"
                              : isBelowMd
                                ? "Obj. ajustado − directas mes"
                                : "Objetivo ajustado del mes − directas del mes"
                          }
                          topColor={faltanteMes.esSobreObjetivo ? "#047857" : "#B91C1C"}
                        />
                        <KpiCard
                          label={isBelowMd ? "CARGABILIDAD REAL (YTD)" : "CARGABILIDAD REAL ÁREA (YTD)"}
                          value={
                            curvaChartPack.real.kpis.pctCargabilidadAreaAcumYTD != null
                              ? `${curvaChartPack.real.kpis.pctCargabilidadAreaAcumYTD.toFixed(1)}%`
                              : "—"
                          }
                          subtitle={
                            isBelowMd
                              ? "Directas ÷ (directas + indirectas), sin vacaciones"
                              : "Cargabilidad real = directas / (directas + indirectas), sin vacaciones."
                          }
                          topColor="#6366F1"
                        />
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
            <div className="min-w-0 max-w-full rounded-r10 border border-bdr bg-surface px-4 py-3 shadow-sh1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-t400">
                Curva objetivo anual · equipo
              </p>
              <p className="mt-1 text-[14px] font-semibold text-t900">
                {curvaObjetivoAnualActual.nombre}{" "}
                <span className="font-mono text-[12px] font-normal text-t500">({curvaObjetivoAnualActual.anio})</span>
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-t600 md:hidden">
                <strong>Objetivo ajustado</strong> (violeta) = meta acumulada horas directas (curva × {factor}%; no es
                cargabilidad real). <strong>Propuesta</strong> (azul) = P4+P3+P2. <strong>Real</strong> (naranja) =
                DIRECTAS RegistroHora. Toca un mes para desglose.
              </p>
              {curvaExplicacionAbierta ? (
                <p className="mt-2 text-[11px] leading-relaxed text-t500 md:hidden">
                  La curva violeta no es el % de cargabilidad: es la meta de horas directas esperadas según la curva
                  anual × factor. La propuesta suma P4+P3+P2 con prorrateo por día. El real se corta tras el último mes
                  con carga. Cargabilidad real (KPI) = directas / (directas + indirectas), sin vacaciones.
                </p>
              ) : null}
              <button
                type="button"
                className="mt-2 text-[11px] font-semibold text-copper underline-offset-2 hover:underline md:hidden"
                onClick={() => setCurvaExplicacionAbierta((v) => !v)}
              >
                {curvaExplicacionAbierta ? "Ocultar explicación" : "Ver explicación"}
              </button>
              <p className="mt-2 hidden text-[12px] leading-relaxed text-t600 md:block">
                <strong>Objetivo acumulado de horas directas ajustado al {factor}%</strong> (violeta): meta acumulada de
                horas directas esperadas (curva anual guardada × factor seleccionado).{" "}
                <strong>No representa el % de cargabilidad real.</strong>
                <strong> Propuesta</strong> (azul, línea a trazos): suma entregables (hrs_p4+p3+p2), prorrateo lineal por
                día entre fecha_inicio y fecha_termino, agregado por mes. <strong>Real</strong> (naranja): DIRECTAS desde
                RegistroHora (prorrateadas por semana); se corta tras el último mes con carga. El KPI{" "}
                <strong>cargabilidad real</strong> es aparte: directas / (directas + indirectas), sin vacaciones. Clic en
                un mes del gráfico abre el desglose de propuesta. El 100% objetivo sigue en cálculo interno, no dibujado.
              </p>
            </div>
            <div className="grid min-w-0 max-w-full gap-4 lg:grid-cols-2">
              <div className="min-w-0 max-w-full overflow-hidden rounded-r12 border border-bdr bg-surface p-4 shadow-sh1 sm:p-5 lg:p-6">
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-t400">
                  Objetivo acumulado
                </h3>
                <p className="mb-2 text-[11px] leading-snug text-t500 md:hidden">
                  Meta horas directas (ajuste {factor}%), propuesta y real. No confundir con cargabilidad real (%). Toca un
                  mes para desglose.
                </p>
                <p className="mb-2 hidden text-[12px] text-t500 md:block">
                  Objetivo acumulado de horas directas (ajuste {factor}%), propuesta acumulada y real (real cortado al
                  último mes con carga). La curva violeta no es cargabilidad real. Clic en el gráfico: desglose propuesta
                  del mes.
                </p>
                <div className="relative mx-auto w-full max-w-full min-w-0 overflow-x-auto">
                  <ChartJsLineFrame
                    key={isBelowMd ? "curva-acum-m" : "curva-acum-d"}
                    data={curvaObjetivoAcumLineData}
                    options={lineChartOptionsCurvaAcum}
                    heightPx={isBelowMd ? 240 : 300}
                  />
                </div>
              </div>
              <div className="min-w-0 max-w-full overflow-hidden rounded-r12 border border-bdr bg-surface p-4 shadow-sh1 sm:p-5 lg:p-6">
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-t400">
                  Objetivo mensual
                </h3>
                <p className="mb-2 text-[11px] leading-snug text-t500 md:hidden">
                  Meta mensual horas directas (ajuste {factor}%), propuesta y real. Toca un mes para desglose.
                </p>
                <p className="mb-2 hidden text-[12px] text-t500 md:block">
                  Objetivo mensual de horas directas (ajuste {factor}%), propuesta mensual y real (propuesta año completo;
                  real cortado al último mes con carga). La serie violeta no es el % de cargabilidad real. Clic: desglose.
                </p>
                <div className="relative mx-auto w-full max-w-full min-w-0 overflow-x-auto">
                  <ChartJsLineFrame
                    key={isBelowMd ? "curva-mens-m" : "curva-mens-d"}
                    data={curvaObjetivoMensualLineData}
                    options={lineChartOptionsCurvaMensual}
                    heightPx={isBelowMd ? 240 : 300}
                  />
                </div>
              </div>
            </div>

            {curvaChartPack && propuestaDetalleMesIdx != null ? (
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
                role="presentation"
                onClick={() => setPropuestaDetalleMesIdx(null)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="propuesta-detalle-titulo"
                  className="max-h-[85vh] w-full max-w-[640px] overflow-hidden rounded-r12 border border-bdr bg-surface shadow-sh2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-bdr px-4 py-3">
                    <h2 id="propuesta-detalle-titulo" className="text-[14px] font-semibold text-t900">
                      Desglose propuesta (P4+P3+P2) ·{" "}
                      {curvaChartPack.obj.labels[propuestaDetalleMesIdx] ?? `Mes ${propuestaDetalleMesIdx + 1}`}
                    </h2>
                    <button
                      type="button"
                      className="rounded-r6 border border-bdr px-3 py-1.5 text-[11px] font-semibold text-t700 hover:bg-surface2"
                      onClick={() => setPropuestaDetalleMesIdx(null)}
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="max-h-[calc(85vh-56px)] overflow-auto p-4">
                    <p className="mb-3 text-[11px] text-t500">
                      Horas prorrateadas linealmente por día calendario en este mes (solo entregables con fechas válidas
                      y horas P4+P3+P2 &gt; 0).
                    </p>
                    {curvaChartPack.propuesta.detallePorMes[propuestaDetalleMesIdx]?.length ? (
                      <table className="w-full border-collapse text-left text-[12px]">
                        <thead>
                          <tr className="border-b border-bdr text-[10px] font-semibold uppercase text-t400">
                            <th className="py-2 pr-2">Proyecto</th>
                            <th className="py-2 pr-2">Entregable</th>
                            <th className="py-2 text-right">Horas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {curvaChartPack.propuesta.detallePorMes[propuestaDetalleMesIdx].map((row) => (
                            <tr key={row.entregableId} className="border-b border-bdr/80">
                              <td className="py-2 pr-2 text-t700">{row.proyectoNombre}</td>
                              <td className="py-2 pr-2 text-t800">{row.entregableNombre}</td>
                              <td className="py-2 text-right font-mono text-t600">{fmtHorasCurva(row.horas)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-[13px] text-t500">Ningún entregable aporta horas de propuesta en este mes.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── Section 2: Control de Proyectos · seguimiento operativo ── */}
      <section className="min-w-0 max-w-full overflow-x-hidden">
        <SectionHeader
          number="02"
          title="Control de Proyectos · Gestión de Crisis"
          hint="Seguimiento operativo agrupado por cliente y proyecto. Por defecto: activos (excluye completados y no iniciados)."
        />

        <div className="mb-4 hidden flex-wrap items-start justify-end gap-3 md:flex">
          <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-r8 border border-bdr bg-surface2 px-[14px] py-[7px]">
            <span className="border-r border-bdr pr-2 text-[9.5px] font-semibold uppercase text-t300">Ref. Avance</span>
            <span className="rounded-r4 border border-bdr px-1 py-[2px] font-mono text-[10px] text-t500">0–50%</span>
            <span className="text-[9px] text-t300">→</span>
            <span className="inline-block h-[3px] w-[12px] rounded-[2px] bg-blue" />
            <span className="rounded-r4 border border-bdr px-1 py-[2px] font-mono text-[10px] text-t500">51–80%</span>
            <span className="text-[9px] text-t300">→</span>
            <span className="inline-block h-[3px] w-[12px] rounded-[2px] bg-amber" />
            <span className="rounded-r4 border border-bdr px-1 py-[2px] font-mono text-[10px] text-t500">81–100%</span>
            <span className="text-[9px] text-t300">→</span>
            <span className="inline-block h-[3px] w-[12px] rounded-[2px] bg-green" />
          </div>
        </div>

        <FilterBar
          filters={[
            { key: "cliente", label: "Cliente", options: clienteOptions, value: clienteFilter, onChange: setClienteFilter },
            { key: "proyecto", label: "Proyecto", options: proyectoOptions, value: proyectoFilter, onChange: setProyectoFilter },
            { key: "lider", label: "Líder", options: liderOptions, value: liderFilter, onChange: setLiderFilter },
          ]}
        />

        <div className="mb-4 flex w-full min-w-0 flex-col gap-1.5 md:max-w-md">
          <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-t400" htmlFor="filtro-estado-seg">
            Estado
          </label>
          <select
            id="filtro-estado-seg"
            value={estadoSeguimientoFiltro}
            onChange={(e) => setEstadoSeguimientoFiltro(e.target.value as EstadoSeguimientoFiltro)}
            className="w-full rounded-r8 border border-bdr bg-surface px-3 py-2.5 text-[13px] text-t700 outline-none focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.15)]"
          >
            <option value="ACTIVOS">Activos (predeterminado)</option>
            <option value="TODOS">Todos</option>
            <option value="EN_PLAZO">En plazo</option>
            <option value="ADELANTADOS">Adelantados</option>
            <option value="RIESGO">Riesgo</option>
            <option value="ATRASADOS">Atrasados (crítico)</option>
            <option value="COMPLETADOS">Completados</option>
            <option value="NO_INICIADOS">No iniciados</option>
          </select>
        </div>

        <div className="mb-2 text-[12px] text-t500">
          Mostrando {filteredEntregables.length} de {data.entregables.length} entregables · Actualizado: {nowStr}
        </div>

        <div className="overflow-hidden rounded-r12 border border-bdr bg-surface shadow-sh1">
          {grupoSeguimientoClienteProyecto.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-t400">Ningún entregable coincide con los filtros.</p>
          ) : (
            grupoSeguimientoClienteProyecto.map((bloqueCli) => {
              const cliOpen = !closedClienteSeguimiento.has(bloqueCli.clienteId);
              const nEntCliente = bloqueCli.proyectos.reduce((s, p) => s + p.items.length, 0);
              return (
                <div key={bloqueCli.clienteId} className="border-b border-bdr last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 border-l-[3px] border-l-copper bg-surface2 px-3 py-2.5 text-left shadow-[inset_0_-1px_0_0_rgba(15,23,42,0.05)] hover:bg-[#EEF0F6]"
                    onClick={() =>
                      setClosedClienteSeguimiento((prev) => {
                        const n = new Set(prev);
                        if (n.has(bloqueCli.clienteId)) n.delete(bloqueCli.clienteId);
                        else n.add(bloqueCli.clienteId);
                        return n;
                      })
                    }
                  >
                    {cliOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-t600" /> : <ChevronRight className="h-4 w-4 shrink-0 text-t600" />}
                    <span className="text-[12px] font-semibold tracking-tight text-t900">{bloqueCli.clienteNombre}</span>
                    <span className="ml-auto inline-flex shrink-0 items-center rounded-r6 border border-bdr/70 bg-white/70 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-t700 shadow-xs">
                      {nEntCliente} entreg.
                    </span>
                  </button>
                  {cliOpen ? (
                    <div className="border-l border-l-bdr/45 bg-gradient-to-b from-[#FAFBFD] to-surface">
                      {bloqueCli.proyectos.map((bloquePr) => {
                        const prOpen = !closedProyectoSeguimiento.has(bloquePr.proyectoId);
                        return (
                          <div key={bloquePr.proyectoId} className="border-t border-bdr/70">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 py-2 pl-7 pr-3 text-left hover:bg-white/90"
                              onClick={() =>
                                setClosedProyectoSeguimiento((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(bloquePr.proyectoId)) n.delete(bloquePr.proyectoId);
                                  else n.add(bloquePr.proyectoId);
                                  return n;
                                })
                              }
                            >
                              {prOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-t500" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-t500" />
                              )}
                              <span className="rounded-r4 border border-bdr/60 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-t700">
                                {bloquePr.proyectoCodigo}
                              </span>
                              <span className="text-[12px] font-medium text-t800">{bloquePr.proyectoNombre}</span>
                              <span className="text-[11px] text-t500">{bloquePr.items.length} entreg.</span>
                            </button>
                            {prOpen ? (
                              <>
                              <div className="space-y-2 border-t border-bdr/35 bg-white/60 p-3 pl-4 pr-2 pt-2 md:hidden">
                                {bloquePr.items.map((e) => {
                                  const proyecto = data.proyectos.find((p) => p.id === e.proyecto_id);
                                  const pmNombre =
                                    proyecto &&
                                    (proyecto.pm_nombre?.trim() ||
                                      data.profesionales.find((p) => p.id === proyecto.project_manager_id)?.nombre_completo) ||
                                    "—";
                                  const lider = data.profesionales.find((p) => p.id === e.lider_id);
                                  const estadoVisual = resolverEstadoVisualEntregable(e);
                                  const slice = estadoToDonutSlice(estadoVisual);
                                  const status = donutSliceToPillVariant(slice);
                                  const progressStatus = estadoToProgressStatus(estadoVisual);
                                  const completadoReciente =
                                    estadoSeguimientoFiltro === "ACTIVOS" &&
                                    entregableEsCompletadoReciente(e, new Date(), 7);
                                  const hp = horasPropuestaP4P3P2(e);
                                  const avanceTeoricoVista = calculateAvanceTeorico(
                                    entregableToSeguimientoPayload(e, e.avance_real),
                                  );
                                  return (
                                    <DashboardEntregableSeguimientoCard
                                      key={e.id}
                                      e={e}
                                      clienteNombre={bloqueCli.clienteNombre}
                                      proyectoCodigo={bloquePr.proyectoCodigo}
                                      proyectoNombre={bloquePr.proyectoNombre}
                                      pmNombre={pmNombre || "—"}
                                      liderNombre={lider?.nombre_completo || "—"}
                                      estadoVisual={estadoVisual}
                                      status={status}
                                      progressStatus={progressStatus}
                                      completadoReciente={completadoReciente}
                                      hp={hp}
                                      avanceTeoricoVista={avanceTeoricoVista}
                                      puedeEditarNotas={puedeEditarNotas}
                                      onNota={() => setNotaSegEntregableId(e.id)}
                                    />
                                  );
                                })}
                              </div>
                              <div className="hidden overflow-x-auto border-t border-bdr/35 bg-white/60 pb-3 pl-9 pr-2 pt-1 md:block">
                                <table className="w-full min-w-[1220px] text-left text-[12px]">
                                  <thead>
                                    <tr className="border-b border-bdr bg-surface2/90 text-[10px] font-semibold uppercase tracking-wide text-t500">
                                      <th className="px-2 py-2">Entregable</th>
                                      <th className="px-2 py-2">PM</th>
                                      <th className="px-2 py-2">Líder</th>
                                      <th className="px-2 py-2">Av. real</th>
                                      <th className="px-2 py-2">Av. teórico</th>
                                      <th className="px-2 py-2">Estado</th>
                                      <th className="px-2 py-2">Rev. A</th>
                                      <th className="px-2 py-2">Rev. B</th>
                                      <th className="px-2 py-2">Rev. P</th>
                                      <th className="px-2 py-2">UF prop. / UF gasto</th>
                                      <th className="px-2 py-2">Hrs prop. / Hrs gasto</th>
                                      <th className="px-2 py-2">Acciones</th>
                                      <th className="px-2 py-2">Notas</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bloquePr.items.map((e) => {
                                      const proyecto = data.proyectos.find((p) => p.id === e.proyecto_id);
                                      const pmNombre =
                                        proyecto &&
                                        (proyecto.pm_nombre?.trim() ||
                                          data.profesionales.find((p) => p.id === proyecto.project_manager_id)?.nombre_completo);
                                      const lider = data.profesionales.find((p) => p.id === e.lider_id);
                                      const estadoVisual = resolverEstadoVisualEntregable(e);
                                      const slice = estadoToDonutSlice(estadoVisual);
                                      const status = donutSliceToPillVariant(slice);
                                      const progressStatus = estadoToProgressStatus(estadoVisual);
                                      const completadoReciente = estadoSeguimientoFiltro === "ACTIVOS" &&
                                        entregableEsCompletadoReciente(e, new Date(), 7);
                                      const hp = horasPropuestaP4P3P2(e);
                                      const avanceTeoricoVista = calculateAvanceTeorico(
                                        entregableToSeguimientoPayload(e, e.avance_real),
                                      );
                                      return (
                                        <tr key={e.id} className="border-b border-bdr/60 hover:bg-surface2/50">
                                          <td className="max-w-[200px] truncate px-2 py-2 font-medium text-t900">{e.nombre}</td>
                                          <td className="max-w-[120px] truncate px-2 py-2 text-t700">{pmNombre || "—"}</td>
                                          <td className="max-w-[130px] truncate px-2 py-2 text-t700">{lider?.nombre_completo || "—"}</td>
                                          <td className="min-w-[130px] px-2 py-2 align-top">
                                            <ProgressBarCell value={e.avance_real} status={progressStatus} />
                                            <EntregableAvanceRapido entregable={e} />
                                          </td>
                                          <td className="min-w-[72px] px-2 py-2">
                                            <ProgressBarCell value={avanceTeoricoVista} status={progressStatus} />
                                          </td>
                                          <td className="max-w-[220px] px-2 py-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <StatusPill variant={status} labelOverride={estadoToEtiquetaTabla(estadoVisual)} />
                                              {completadoReciente ? (
                                                <span className="rounded-r6 border border-bdr bg-white px-2 py-0.5 text-[10px] font-semibold text-t500">
                                                  Completado reciente
                                                </span>
                                              ) : null}
                                            </div>
                                          </td>
                                          <td className="px-2 py-2">
                                            <DateCell date={e.fecha_revA} />
                                          </td>
                                          <td className="px-2 py-2">
                                            <DateCell date={e.fecha_revB} />
                                          </td>
                                          <td className="px-2 py-2">
                                            <DateCell date={e.fecha_revP} />
                                          </td>
                                          <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-t800">
                                            <span>{fmtUfSeg(e.uf_presupuestadas)}</span>
                                            <span className="text-t400"> / </span>
                                            <span className="text-t600">{fmtUfSeg(e.uf_consumidas)}</span>
                                          </td>
                                          <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-t800">
                                            <span>{fmtHorasCurva(hp)}</span>
                                            <span className="text-t400"> / </span>
                                            <span className="text-t600">{fmtHorasCurva(e.hrs_gastadas)}</span>
                                          </td>
                                          <td className="max-w-[240px] px-2 py-2 align-top">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <EntregableRedistribuirHorasTrigger ent={e} dense showBadges={false} />
                                            </div>
                                          </td>
                                          <td className="px-2 py-2">
                                            {puedeEditarNotas ? (
                                              <button
                                                type="button"
                                                onClick={() => setNotaSegEntregableId(e.id)}
                                                className="inline-flex items-center gap-1 rounded-r6 border border-bdr px-2 py-1 text-[10px] font-semibold text-t600 hover:bg-surface2"
                                                title="Nota de seguimiento"
                                              >
                                                <StickyNote className="h-3.5 w-3.5" />
                                                {puedeEditarNotas ? (e.nota_seguimiento?.trim() ? "Editar" : "Nota") : "Ver nota"}
                                              </button>
                                            ) : null}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-10 rounded-r12 border border-dashed border-copper/35 bg-copper-bg/40 px-4 py-4 shadow-sh1">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copper">
            Próximos a iniciar (próximas 3 semanas)
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-t600">
            Incluye cualquier estado; no aplica el filtro &quot;Activos&quot;. Respeta cliente, proyecto y líder si están
            filtrados.
          </p>
          {entregablesProximosInicio3Semanas.length === 0 ? (
            <p className="mt-3 text-[13px] text-t400">Ningún entregable con inicio en la ventana de 21 días.</p>
          ) : (
            <>
            <div className="mt-3 space-y-2 md:hidden">
              {entregablesProximosInicio3Semanas.map((e) => {
                const proyecto = data.proyectos.find((p) => p.id === e.proyecto_id);
                const cliente = proyecto ? data.clientes.find((c) => c.id === proyecto.cliente_id) : null;
                const estadoVisual = resolverEstadoVisualEntregable(e);
                const slice = estadoToDonutSlice(estadoVisual);
                const status = donutSliceToPillVariant(slice);
                const hp = horasPropuestaP4P3P2(e);
                return (
                  <DashboardProximoInicioCard
                    key={`prox-m-${e.id}`}
                    e={e}
                    clienteNombre={cliente?.nombre || "—"}
                    proyectoCodigo={proyecto?.codigo ?? "—"}
                    proyectoNombre={proyecto?.nombre ?? "—"}
                    estadoVisual={estadoVisual}
                    status={status}
                    hp={hp}
                  />
                );
              })}
            </div>
            <div className="mt-3 hidden overflow-x-auto rounded-r8 border border-bdr bg-surface md:block">
              <table className="w-full min-w-[900px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-bdr bg-surface2 text-[10px] font-semibold uppercase text-t500">
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Proyecto</th>
                    <th className="px-3 py-2">Entregable</th>
                    <th className="px-3 py-2">Inicio</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">UF prop. / gasto</th>
                    <th className="px-3 py-2">Hrs prop. / gasto</th>
                    <th className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {entregablesProximosInicio3Semanas.map((e) => {
                    const proyecto = data.proyectos.find((p) => p.id === e.proyecto_id);
                    const cliente = proyecto ? data.clientes.find((c) => c.id === proyecto.cliente_id) : null;
                    const estadoVisual = resolverEstadoVisualEntregable(e);
                    const slice = estadoToDonutSlice(estadoVisual);
                    const status = donutSliceToPillVariant(slice);
                    const hp = horasPropuestaP4P3P2(e);
                    return (
                      <tr key={`prox-${e.id}`} className="border-b border-bdr/80">
                        <td className="max-w-[140px] truncate px-3 py-2">{cliente?.nombre || "—"}</td>
                        <td className="max-w-[160px] truncate px-3 py-2">
                          <span className="font-mono text-[10px] text-t500">{proyecto?.codigo}</span> {proyecto?.nombre}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 font-medium">{e.nombre}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">{e.fecha_inicio}</td>
                        <td className="px-3 py-2">
                          <StatusPill variant={status} labelOverride={estadoToEtiquetaTabla(estadoVisual)} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">
                          {fmtUfSeg(e.uf_presupuestadas)} <span className="text-t400">/</span> {fmtUfSeg(e.uf_consumidas)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">
                          {fmtHorasCurva(hp)} <span className="text-t400">/</span> {fmtHorasCurva(e.hrs_gastadas)}
                        </td>
                        <td className="max-w-[240px] px-3 py-2 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <EntregableRedistribuirHorasTrigger ent={e} dense showBadges={false} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        <EntregableNotaSeguimientoModal
          open={notaSegEntregableId != null}
          entregable={notaSegEntregableId ? data.entregables.find((x) => x.id === notaSegEntregableId) ?? null : null}
          clienteNombre={
            notaSegEntregableId
              ? (() => {
                  const e = data.entregables.find((x) => x.id === notaSegEntregableId);
                  const p = e ? data.proyectos.find((pr) => pr.id === e.proyecto_id) : null;
                  const c = p ? data.clientes.find((cl) => cl.id === p.cliente_id) : null;
                  return c?.nombre || "—";
                })()
              : "—"
          }
          proyectoNombre={
            notaSegEntregableId
              ? (() => {
                  const e = data.entregables.find((x) => x.id === notaSegEntregableId);
                  const p = e ? data.proyectos.find((pr) => pr.id === e.proyecto_id) : null;
                  return p ? `${p.codigo} — ${p.nombre}` : "—";
                })()
              : "—"
          }
          onClose={() => setNotaSegEntregableId(null)}
          onSave={(id, texto) => {
            if (!puedeEditarNotas) return;
            updateEntregable(id, {
              nota_seguimiento: texto,
              nota_seguimiento_updated_at: new Date().toISOString(),
            });
          }}
        />
      </section>

    </div>
  );
}
