import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { Slider } from "@/components/ui/slider";
import { useAppData, type Pipeline, type PmInterno } from "@/context/AppDataContext";

/* ─── helpers ─── */
const fmtNum = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

const etapaConfig = {
  CONCEPTUAL: { bg: "#ECFDF5", text: "#047857", label: "Conceptual" },
  FACTIBILIDAD: { bg: "#E0E7FF", text: "#4F46E5", label: "Factibilidad" },
  DETALLE: { bg: "#E0E7FF", text: "#3730A3", label: "Detalle" },
};

const estadoConfig = {
  EN_ESPERA: { bg: "#FFF7ED", text: "#B45309", label: "En espera" },
  EN_COTIZACION: { bg: "#ECFDF5", text: "#047857", label: "En cotización" },
  APROBADO: { bg: "#E0E7FF", text: "#4F46E5", label: "Aprobado" },
  RECHAZADO: { bg: "#F1F5F9", text: "#475569", label: "Rechazado" },
};

/** Filas KPI escritorio (md+): auto-fit como layout original. */
const PIPELINE_KPI_ROW_DESKTOP =
  "mb-[22px] hidden gap-3 md:grid md:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]";

const PIPELINE_KPI_COLUMN_MOBILE = "flex min-w-0 flex-col gap-3";

const cargoChipColors: Record<string, { bg: string; text: string }> = {
  L2: { bg: "#F1F5F9", text: "#475569" },
  P4: { bg: "#E0E7FF", text: "#4F46E5" },
  P3: { bg: "#E0E7FF", text: "#3730A3" },
  P2: { bg: "#ECFDF5", text: "#047857" },
};

/* ─── mini KPI card ─── */
function MiniKpi({
  label,
  value,
  subtitle,
  extraLine,
  tint,
}: {
  label: string;
  value: string;
  subtitle: string;
  extraLine?: string;
  tint?: { bg: string; text: string };
}) {
  return (
    <div
      className="flex flex-col rounded-r8 border border-bdr p-[14px_16px] shadow-sh1 transition-all duration-200 hover:shadow-sh2 hover:-translate-y-px"
      style={{ background: tint ? tint.bg : "#F7F8FA" }}
    >
      <span
        className="text-[10px] font-medium uppercase tracking-[0.07em]"
        style={{ color: tint ? tint.text : "#6B7280" }}
      >
        {label}
      </span>
      <span className="mt-1 text-[22px] font-semibold text-t900 leading-tight">{value}</span>
      <span className="mt-1 text-[11px] text-t500">{subtitle}</span>
      {extraLine ? <span className="mt-0.5 text-[10px] text-t400">{extraLine}</span> : null}
    </div>
  );
}

/* ─── pipeline card ─── */
function PipelineCard({ item, pmMap }: { item: Pipeline; pmMap: Map<string, PmInterno> }) {
  const pm = pmMap.get(item.pm_responsable_id);
  const etapa = etapaConfig[item.etapa];
  const estado = estadoConfig[item.estado];
  const totalHrs = item.hrs_L2 + item.hrs_P4 + item.hrs_P3 + item.hrs_P2;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex flex-col overflow-hidden rounded-r12 border border-bdr bg-white shadow-sh1 transition-all duration-150 hover:shadow-sh2 hover:-translate-y-px"
    >
      {/* Card head */}
      <div className="px-[14px] pb-[10px] pt-3 border-b border-bdr">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-t300">
          {item.cliente}
        </span>
        <h3 className="mt-[2px] text-[13px] font-semibold text-t900 leading-[1.35]">
          {item.nombre_proyecto}
        </h3>
        <p className="mt-[3px] text-[11px] text-t500 leading-[1.3]">{item.entregable}</p>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-[8px] px-[14px] py-[10px]">
        {/* Etapa */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-t500">Etapa</span>
          <span
            className="rounded-r4 px-2 py-[2px] text-[10px] font-semibold tracking-[0.03em]"
            style={{ background: etapa.bg, color: etapa.text }}
          >
            {etapa.label}
          </span>
        </div>
        {/* Estado */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-t500">Estado</span>
          <span
            className="rounded-r4 px-2 py-[2px] text-[10px] font-semibold tracking-[0.03em]"
            style={{ background: estado.bg, color: estado.text }}
          >
            {estado.label}
          </span>
        </div>
        {/* Monto UF */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-t500">Monto UF</span>
          {item.monto_uf > 0 ? (
            <span className="text-[18px] font-bold text-t900">{fmtNum(item.monto_uf)}</span>
          ) : (
            <span className="text-[13px] font-medium italic text-t300">Por definir</span>
          )}
        </div>
        {/* PM */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-t500">PM Responsable</span>
          <span className="max-w-[60%] text-right text-[11px] font-medium text-t700 truncate">
            {pm ? `${pm.codigo} · ${pm.nombre}` : "—"}
          </span>
        </div>
        {/* Fecha */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-t500">Fecha Propuesta</span>
          <span className="font-mono text-[11px] text-t700">{fmtDate(item.fecha_propuesta)}</span>
        </div>
        {/* Observaciones */}
        {item.observaciones && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] text-t500 shrink-0">Observaciones</span>
            <span className="max-w-[60%] text-right text-[11px] text-t700 leading-[1.3]">
              {item.observaciones}
            </span>
          </div>
        )}
      </div>

      {/* Card foot — hour chips */}
      <div className="flex flex-wrap items-center gap-[5px] border-t border-bdr bg-surface2 px-[14px] py-2">
        {item.hrs_L2 > 0 && (
          <span
            className="rounded-r4 px-[6px] py-[2px] text-[10px] font-semibold"
            style={{ background: cargoChipColors.L2.bg, color: cargoChipColors.L2.text }}
          >
            L2: {item.hrs_L2}
          </span>
        )}
        {item.hrs_P4 > 0 && (
          <span
            className="rounded-r4 px-[6px] py-[2px] text-[10px] font-semibold"
            style={{ background: cargoChipColors.P4.bg, color: cargoChipColors.P4.text }}
          >
            P4: {item.hrs_P4}
          </span>
        )}
        {item.hrs_P3 > 0 && (
          <span
            className="rounded-r4 px-[6px] py-[2px] text-[10px] font-semibold"
            style={{ background: cargoChipColors.P3.bg, color: cargoChipColors.P3.text }}
          >
            P3: {item.hrs_P3}
          </span>
        )}
        {item.hrs_P2 > 0 && (
          <span
            className="rounded-r4 px-[6px] py-[2px] text-[10px] font-semibold"
            style={{ background: cargoChipColors.P2.bg, color: cargoChipColors.P2.text }}
          >
            P2: {item.hrs_P2}
          </span>
        )}
        <span className="ml-auto whitespace-nowrap rounded-r4 border border-bdr bg-white px-[6px] py-[2px] text-[10px] font-semibold text-t500">
          Total: {totalHrs} hrs
        </span>
      </div>
    </motion.div>
  );
}

/* ─── main page ─── */
export default function PipelinePage() {
  const { pipeline, pm_internos } = useAppData();

  const pmMap = useMemo(() => {
    const m = new Map<string, PmInterno>();
    pm_internos.forEach((p) => m.set(p.id, p));
    return m;
  }, [pm_internos]);

  /* filter options */
  const clientes = useMemo(
    () => Array.from(new Set(pipeline.map((p) => p.cliente))).sort(),
    [pipeline]
  );
  const etapas = useMemo(() => Array.from(new Set(pipeline.map((p) => p.etapa))), [pipeline]);
  const estados = useMemo(() => Array.from(new Set(pipeline.map((p) => p.estado))), [pipeline]);
  const pms = useMemo(() => Array.from(new Set(pipeline.map((p) => p.pm_responsable_id))), [pipeline]);

  /* filter state */
  const [filterEstado, setFilterEstado] = useState<string>("Todos");
  const [filterCliente, setFilterCliente] = useState<string>("Todos");
  const [filterEtapa, setFilterEtapa] = useState<string>("Todos");
  const [filterPM, setFilterPM] = useState<string>("Todos");
  const [pctEstimacion, setPctEstimacion] = useState(25);

  const filtered = useMemo(() => {
    return pipeline.filter((p) => {
      if (filterEstado !== "Todos" && p.estado !== filterEstado) return false;
      if (filterCliente !== "Todos" && p.cliente !== filterCliente) return false;
      if (filterEtapa !== "Todos" && p.etapa !== filterEtapa) return false;
      if (filterPM !== "Todos" && p.pm_responsable_id !== filterPM) return false;
      return true;
    });
  }, [pipeline, filterEstado, filterCliente, filterEtapa, filterPM]);

  /* KPIs from ALL pipeline (not filtered) */
  const kpi = useMemo(() => {
    const totalUF = pipeline.reduce((s, p) => s + (p.monto_uf || 0), 0);
    const hrsL2 = pipeline.reduce((s, p) => s + p.hrs_L2, 0);
    const hrsP4 = pipeline.reduce((s, p) => s + p.hrs_P4, 0);
    const hrsP3 = pipeline.reduce((s, p) => s + p.hrs_P3, 0);
    const hrsP2 = pipeline.reduce((s, p) => s + p.hrs_P2, 0);
    return { count: pipeline.length, totalUF, hrsL2, hrsP4, hrsP3, hrsP2 };
  }, [pipeline]);

  /** Totales del pipeline visible (respeta filtros estado / cliente / etapa / PM). */
  const kpiVisible = useMemo(() => {
    const totalUF = filtered.reduce((s, p) => s + (p.monto_uf || 0), 0);
    const hrsL2 = filtered.reduce((s, p) => s + p.hrs_L2, 0);
    const hrsP4 = filtered.reduce((s, p) => s + p.hrs_P4, 0);
    const hrsP3 = filtered.reduce((s, p) => s + p.hrs_P3, 0);
    const hrsP2 = filtered.reduce((s, p) => s + p.hrs_P2, 0);
    return { totalUF, hrsL2, hrsP4, hrsP3, hrsP2, hrsTotal: hrsL2 + hrsP4 + hrsP3 + hrsP2 };
  }, [filtered]);

  const estimacionAdjudicable = useMemo(() => {
    const factor = pctEstimacion / 100;
    return {
      uf: kpiVisible.totalUF * factor,
      hrsTotal: kpiVisible.hrsTotal * factor,
      l2: kpiVisible.hrsL2 * factor,
      p4: kpiVisible.hrsP4 * factor,
      p3: kpiVisible.hrsP3 * factor,
      p2: kpiVisible.hrsP2 * factor,
    };
  }, [kpiVisible, pctEstimacion]);

  /* count label text */
  const countLabel = useMemo(() => {
    const espera = filtered.filter((p) => p.estado === "EN_ESPERA").length;
    const cotizacion = filtered.filter((p) => p.estado === "EN_COTIZACION").length;
    const aprobado = filtered.filter((p) => p.estado === "APROBADO").length;
    const rechazado = filtered.filter((p) => p.estado === "RECHAZADO").length;
    const parts = [`Mostrando ${filtered.length} propuestas`];
    if (espera) parts.push(`${espera} en espera`);
    if (cotizacion) parts.push(`${cotizacion} en cotización`);
    if (aprobado) parts.push(`${aprobado} aprobadas`);
    if (rechazado) parts.push(`${rechazado} rechazadas`);
    return parts.join(" · ");
  }, [filtered]);

  const resetFilters = () => {
    setFilterEstado("Todos");
    setFilterCliente("Todos");
    setFilterEtapa("Todos");
    setFilterPM("Todos");
  };

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
      <SectionHeader
        number="04"
        title="Pipeline Comercial · Proyectos Potenciales"
        hint="Propuestas y oportunidades comerciales"
      />

      {/* KPI — móvil: columna Pipeline (real) | columna Escenario (estimado) */}
      <div className="mb-[22px] grid min-w-0 grid-cols-2 gap-3 md:hidden">
        <div className={PIPELINE_KPI_COLUMN_MOBILE}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-t500">Pipeline</p>
          <MiniKpi label="TOTAL PROPUESTAS" value={String(kpi.count)} subtitle="Activas en pipeline" />
          <MiniKpi label="MONTO TOTAL" value={`${fmtNum(kpi.totalUF)} UF`} subtitle="En propuestas" />
          <MiniKpi
            label="HORAS L2"
            value={String(kpi.hrsL2)}
            subtitle="Requeridas"
            tint={{ bg: "#FDF2F8", text: "#9D174D" }}
          />
          <MiniKpi
            label="HORAS P4"
            value={String(kpi.hrsP4)}
            subtitle="Requeridas"
            tint={{ bg: "#E0E7FF", text: "#3730A3" }}
          />
          <MiniKpi
            label="HORAS P3"
            value={String(kpi.hrsP3)}
            subtitle="Requeridas"
            tint={{ bg: "#F0FDF4", text: "#14532D" }}
          />
          <MiniKpi
            label="HORAS P2"
            value={String(kpi.hrsP2)}
            subtitle="Requeridas"
            tint={{ bg: "#FEFCE8", text: "#713F12" }}
          />
        </div>
        <div className={PIPELINE_KPI_COLUMN_MOBILE}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-t500">Escenario</p>
          <MiniKpi
            label="ESTIMACIÓN ADJUDICABLE UF"
            value={`${fmtNum(estimacionAdjudicable.uf)} UF`}
            subtitle={`Escenario ${pctEstimacion}% del pipeline visible`}
            tint={{ bg: "#F0F9FF", text: "#0369A1" }}
          />
          <MiniKpi
            label="HORAS ESTIMADAS TOTAL"
            value={`${fmtNum(estimacionAdjudicable.hrsTotal)} h`}
            subtitle={`L2+P4+P3+P2 · escenario ${pctEstimacion}%`}
          />
          <MiniKpi
            label="L2 ESTIMADAS"
            value={`${fmtNum(estimacionAdjudicable.l2)} h`}
            subtitle={`L2 × ${pctEstimacion}%`}
            tint={{ bg: "#FDF2F8", text: "#9D174D" }}
          />
          <MiniKpi
            label="P4 ESTIMADAS"
            value={`${fmtNum(estimacionAdjudicable.p4)} h`}
            subtitle={`P4 × ${pctEstimacion}%`}
            tint={{ bg: "#E0E7FF", text: "#3730A3" }}
          />
          <MiniKpi
            label="P3 ESTIMADAS"
            value={`${fmtNum(estimacionAdjudicable.p3)} h`}
            subtitle={`P3 × ${pctEstimacion}%`}
            tint={{ bg: "#F0FDF4", text: "#14532D" }}
          />
          <MiniKpi
            label="P2 ESTIMADAS"
            value={`${fmtNum(estimacionAdjudicable.p2)} h`}
            subtitle={`P2 × ${pctEstimacion}%`}
            tint={{ bg: "#FEFCE8", text: "#713F12" }}
          />
          <div className="flex min-h-[88px] flex-col justify-center rounded-r8 border border-bdr bg-white p-[14px_16px] shadow-sh1">
            <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-t500">
              ESCENARIO ADJUDICACIÓN
            </span>
            <div className="mt-2 flex items-center gap-3">
              <Slider
                min={0}
                max={100}
                step={5}
                value={[pctEstimacion]}
                onValueChange={(v) => setPctEstimacion(v[0] ?? 25)}
                className="flex-1"
              />
              <span className="min-w-[2.75rem] font-mono text-[22px] font-semibold tabular-nums leading-tight text-t900">
                {pctEstimacion}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Row — escritorio */}
      <div className={PIPELINE_KPI_ROW_DESKTOP}>
        <MiniKpi label="TOTAL PROPUESTAS" value={String(kpi.count)} subtitle="Activas en pipeline" />
        <MiniKpi label="MONTO TOTAL" value={`${fmtNum(kpi.totalUF)} UF`} subtitle="En propuestas" />
        <MiniKpi
          label="HORAS L2"
          value={String(kpi.hrsL2)}
          subtitle="Requeridas"
          tint={{ bg: "#FDF2F8", text: "#9D174D" }}
        />
        <MiniKpi
          label="HORAS P4"
          value={String(kpi.hrsP4)}
          subtitle="Requeridas"
          tint={{ bg: "#E0E7FF", text: "#3730A3" }}
        />
        <MiniKpi
          label="HORAS P3"
          value={String(kpi.hrsP3)}
          subtitle="Requeridas"
          tint={{ bg: "#F0FDF4", text: "#14532D" }}
        />
        <MiniKpi
          label="HORAS P2"
          value={String(kpi.hrsP2)}
          subtitle="Requeridas"
          tint={{ bg: "#FEFCE8", text: "#713F12" }}
        />
      </div>

      {/* KPI Row — estimación escenario (pipeline filtrado visible) — escritorio */}
      <div className={PIPELINE_KPI_ROW_DESKTOP}>
        <MiniKpi
          label="ESTIMACIÓN ADJUDICABLE UF"
          value={`${fmtNum(estimacionAdjudicable.uf)} UF`}
          subtitle={`Escenario ${pctEstimacion}% del pipeline visible`}
          tint={{ bg: "#F0F9FF", text: "#0369A1" }}
        />
        <MiniKpi
          label="HORAS ESTIMADAS TOTAL"
          value={`${fmtNum(estimacionAdjudicable.hrsTotal)} h`}
          subtitle={`L2+P4+P3+P2 · escenario ${pctEstimacion}%`}
        />
        <MiniKpi
          label="L2 ESTIMADAS"
          value={`${fmtNum(estimacionAdjudicable.l2)} h`}
          subtitle={`L2 × ${pctEstimacion}%`}
          tint={{ bg: "#FDF2F8", text: "#9D174D" }}
        />
        <MiniKpi
          label="P4 ESTIMADAS"
          value={`${fmtNum(estimacionAdjudicable.p4)} h`}
          subtitle={`P4 × ${pctEstimacion}%`}
          tint={{ bg: "#E0E7FF", text: "#3730A3" }}
        />
        <MiniKpi
          label="P3 ESTIMADAS"
          value={`${fmtNum(estimacionAdjudicable.p3)} h`}
          subtitle={`P3 × ${pctEstimacion}%`}
          tint={{ bg: "#F0FDF4", text: "#14532D" }}
        />
        <MiniKpi
          label="P2 ESTIMADAS"
          value={`${fmtNum(estimacionAdjudicable.p2)} h`}
          subtitle={`P2 × ${pctEstimacion}%`}
          tint={{ bg: "#FEFCE8", text: "#713F12" }}
        />
        <div className="flex min-h-[88px] flex-col justify-center rounded-r8 border border-bdr bg-white p-[14px_16px] shadow-sh1">
          <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-t500">
            ESCENARIO ADJUDICACIÓN
          </span>
          <div className="mt-2 flex items-center gap-3">
            <Slider
              min={0}
              max={100}
              step={5}
              value={[pctEstimacion]}
              onValueChange={(v) => setPctEstimacion(v[0] ?? 25)}
              className="flex-1"
            />
            <span className="min-w-[2.75rem] font-mono text-[22px] font-semibold tabular-nums leading-tight text-t900">
              {pctEstimacion}%
            </span>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-[10px]">
        {/* Estado */}
        <div className="flex flex-col gap-[4px]" style={{ flex: 1, minWidth: 160 }}>
          <label className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-t300">
            Estado
          </label>
          <select
            className="w-full rounded-r4 border border-bdr2 bg-white px-[10px] py-[5px] text-[12px] text-t700 focus:border-blue2 focus:outline-none focus:ring-[3px] focus:ring-bluebg/30"
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
          >
            <option value="Todos">Todos</option>
            {estados.map((e) => (
              <option key={e} value={e}>
                {estadoConfig[e].label}
              </option>
            ))}
          </select>
        </div>
        {/* Cliente */}
        <div className="flex flex-col gap-[4px]" style={{ flex: 1, minWidth: 160 }}>
          <label className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-t300">
            Cliente
          </label>
          <select
            className="w-full rounded-r4 border border-bdr2 bg-white px-[10px] py-[5px] text-[12px] text-t700 focus:border-blue2 focus:outline-none focus:ring-[3px] focus:ring-bluebg/30"
            value={filterCliente}
            onChange={(e) => setFilterCliente(e.target.value)}
          >
            <option value="Todos">Todos</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {/* Etapa */}
        <div className="flex flex-col gap-[4px]" style={{ flex: 1, minWidth: 160 }}>
          <label className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-t300">
            Etapa
          </label>
          <select
            className="w-full rounded-r4 border border-bdr2 bg-white px-[10px] py-[5px] text-[12px] text-t700 focus:border-blue2 focus:outline-none focus:ring-[3px] focus:ring-bluebg/30"
            value={filterEtapa}
            onChange={(e) => setFilterEtapa(e.target.value)}
          >
            <option value="Todos">Todas</option>
            {etapas.map((e) => (
              <option key={e} value={e}>
                {etapaConfig[e].label}
              </option>
            ))}
          </select>
        </div>
        {/* PM */}
        <div className="flex flex-col gap-[4px]" style={{ flex: 1, minWidth: 160 }}>
          <label className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-t300">
            PM
          </label>
          <select
            className="w-full rounded-r4 border border-bdr2 bg-white px-[10px] py-[5px] text-[12px] text-t700 focus:border-blue2 focus:outline-none focus:ring-[3px] focus:ring-bluebg/30"
            value={filterPM}
            onChange={(e) => setFilterPM(e.target.value)}
          >
            <option value="Todos">Todos</option>
            {pms.map((id) => {
              const pm = pmMap.get(id);
              return (
                <option key={id} value={id}>
                  {pm ? `${pm.codigo} · ${pm.nombre}` : id}
                </option>
              );
            })}
          </select>
        </div>
        {/* Reset */}
        <button
          onClick={resetFilters}
          className="ml-auto self-end rounded-r4 border border-bdr bg-white px-3 py-[5px] text-[11px] font-medium text-t500 transition-colors hover:bg-surface2 hover:text-t700"
        >
          Limpiar filtros
        </button>
      </div>

      {/* Count label */}
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-t500">
        {countLabel}
      </div>

      {/* Card grid */}
      <motion.div
        layout
        className="grid gap-[14px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((item) => (
            <PipelineCard key={item.id} item={item} pmMap={pmMap} />
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Empty state */}
      <AnimatePresence>
        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-10 text-center"
          >
            <Inbox className="mb-3 h-8 w-8 text-t300 opacity-25" />
            <p className="text-[13px] text-t300">
              No hay propuestas que coincidan con los filtros seleccionados
            </p>
            <p className="mt-1 text-[11.5px] text-t300">
              Prueba ajustando los filtros o crea una nueva propuesta en Formularios
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
