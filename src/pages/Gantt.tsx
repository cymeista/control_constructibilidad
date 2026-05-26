import { useState, useMemo, useCallback, useRef } from "react";
import { useAppData } from "@/context/AppDataContext";
import type { Entregable, Proyecto, Cliente } from "@/context/AppDataContext";
import SectionHeader from "@/components/SectionHeader";
import {
  ChevronRight,
  ChevronDown,
  CalendarX,
  Expand,
  Minimize2,
  Filter,
  Eye,
  CalendarDays,
} from "lucide-react";

/* ─────────── Types ─────────── */

interface GanttMonth {
  year: number;
  month: number; // 0-indexed
  label: string;
  days: number;
  isTodayMonth: boolean;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: {
    title: string;
    proyecto?: string;
    estado: string;
    inicio: string;
    termino: string;
    avance: string;
    ufPresup: string;
    ufCons: string;
  } | null;
}

/* ─────────── Helpers ─────────── */

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function formatDateCL(d: string): string {
  const date = parseDate(d);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Buckets visuales alineados con la leyenda del Gantt (mismos hex que los chips superiores).
 * No altera el estado persistido; solo sirve para color de barras / badges en esta vista.
 */
type GanttEstadoVisual =
  | "EN_PLAZO_OK"
  | "RIESGO"
  | "CRITICO"
  | "COMPLETADO_ADELANTADO"
  | "NO_INICIADO";

const GANTT_LEGEND_COLORS: Record<GanttEstadoVisual, string> = {
  EN_PLAZO_OK: "#4F46E5",
  RIESGO: "#B45309",
  CRITICO: "#B91C1C",
  COMPLETADO_ADELANTADO: "#047857",
  NO_INICIADO: "#475569",
};

/** Mayor = peor (para barra agregada de proyecto). */
const GANTT_WORST_RANK: Record<GanttEstadoVisual, number> = {
  CRITICO: 5,
  RIESGO: 4,
  NO_INICIADO: 3,
  EN_PLAZO_OK: 2,
  COMPLETADO_ADELANTADO: 1,
};

function normalizeEstadoParaColorGantt(estado: string): GanttEstadoVisual {
  const u = String(estado)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  if (u === "CRITICO" || u.includes("CRITICO")) return "CRITICO";
  if (u === "RIESGO" || u.includes("RIESGO")) return "RIESGO";
  if (
    u === "COMPLETADO" ||
    u === "ADELANTADO" ||
    u.includes("COMPLETADO") ||
    u.includes("ADELANTADO")
  ) {
    return "COMPLETADO_ADELANTADO";
  }
  if (u === "EN_PLAZO" || u === "OK" || u.includes("EN PLAZO")) return "EN_PLAZO_OK";
  if (u === "NO_INICIADO" || u.includes("NO INICIADO")) return "NO_INICIADO";
  return "NO_INICIADO";
}

function peorEstadoVisualGantt(ents: Entregable[]): GanttEstadoVisual {
  if (ents.length === 0) return "NO_INICIADO";
  let worst = normalizeEstadoParaColorGantt(String(ents[0].estado));
  let rank = GANTT_WORST_RANK[worst];
  for (let i = 1; i < ents.length; i++) {
    const v = normalizeEstadoParaColorGantt(String(ents[i].estado));
    const r = GANTT_WORST_RANK[v];
    if (r > rank) {
      worst = v;
      rank = r;
    }
  }
  return worst;
}

const GANTT_WORST_LABEL: Record<GanttEstadoVisual, string> = {
  EN_PLAZO_OK: "En plazo / OK",
  RIESGO: "En riesgo",
  CRITICO: "Crítico",
  COMPLETADO_ADELANTADO: "Completado / Adelantado",
  NO_INICIADO: "No iniciado",
};

function getStatusBarColor(estado: Entregable["estado"]): string {
  return GANTT_LEGEND_COLORS[normalizeEstadoParaColorGantt(String(estado))];
}

function getStatusBadgeStyle(estado: Entregable["estado"]) {
  const v = normalizeEstadoParaColorGantt(String(estado));
  switch (v) {
    case "EN_PLAZO_OK":
      return { bg: "#E0E7FF", text: "#4338CA" };
    case "RIESGO":
      return { bg: "#FFF7ED", text: "#B45309" };
    case "CRITICO":
      return { bg: "#FEF2F2", text: "#B91C1C" };
    case "COMPLETADO_ADELANTADO":
      return { bg: "#ECFDF5", text: "#047857" };
    case "NO_INICIADO":
    default:
      return { bg: "#F1F5F9", text: "#475569" };
  }
}

function generateMonths(minDate: Date, maxDate: Date): GanttMonth[] {
  const months: GanttMonth[] = [];
  const today = new Date();
  let d = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  while (d <= end) {
    const year = d.getFullYear();
    const month = d.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    months.push({
      year,
      month,
      label: `${MONTH_NAMES[month]}-${year}`,
      days,
      isTodayMonth: today.getFullYear() === year && today.getMonth() === month,
    });
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

/* ─────────── Sub-components ─────────── */

type ResumenEstadoMovil = "CRITICO" | "RIESGO" | "EN_PLAZO" | "COMPLETADO";

const RESUMEN_RANK: Record<ResumenEstadoMovil, number> = {
  CRITICO: 4,
  RIESGO: 3,
  EN_PLAZO: 2,
  COMPLETADO: 1,
};

function entregableEsCriticoOVencido(ent: Entregable): boolean {
  const visual = normalizeEstadoParaColorGantt(String(ent.estado));
  if (visual === "CRITICO") return true;
  const endMs = parseDate(ent.fecha_termino).getTime();
  return Number.isFinite(endMs) && endMs < Date.now();
}

function resumenEstadoDesdeEntregables(ents: Entregable[]): ResumenEstadoMovil {
  if (ents.length === 0) return "EN_PLAZO";
  if (ents.every((e) => normalizeEstadoParaColorGantt(String(e.estado)) === "COMPLETADO_ADELANTADO")) {
    return "COMPLETADO";
  }
  if (ents.some(entregableEsCriticoOVencido)) return "CRITICO";
  if (ents.some((e) => normalizeEstadoParaColorGantt(String(e.estado)) === "RIESGO")) return "RIESGO";
  return "EN_PLAZO";
}

function rangoFechasEntregables(ents: Entregable[]) {
  if (ents.length === 0) {
    return { minStart: null as string | null, maxEnd: null as string | null, minStartMs: null, maxEndMs: null };
  }
  let minStart = ents[0].fecha_inicio;
  let maxEnd = ents[0].fecha_termino;
  let minStartMs = parseDate(minStart).getTime();
  let maxEndMs = parseDate(maxEnd).getTime();
  for (const e of ents) {
    const sMs = parseDate(e.fecha_inicio).getTime();
    const eMs = parseDate(e.fecha_termino).getTime();
    if (Number.isFinite(sMs) && sMs < minStartMs) {
      minStartMs = sMs;
      minStart = e.fecha_inicio;
    }
    if (Number.isFinite(eMs) && eMs > maxEndMs) {
      maxEndMs = eMs;
      maxEnd = e.fecha_termino;
    }
  }
  return { minStart, maxEnd, minStartMs, maxEndMs };
}

function proximoHitoEntregable(ent: Entregable): string {
  const candidates = [
    { iso: ent.fecha_revA, label: "Rev. A" },
    { iso: ent.fecha_revB, label: "Rev. B" },
    { iso: ent.fecha_revP, label: "Rev. P" },
  ].filter((x) => x.iso) as { iso: string; label: string }[];

  const nowMs = Date.now();
  const parsed = candidates
    .map((x) => ({ ...x, ms: parseDate(x.iso).getTime() }))
    .filter((x) => Number.isFinite(x.ms));

  const upcoming = parsed.filter((x) => x.ms >= nowMs).sort((a, b) => a.ms - b.ms)[0];
  const fallback = [...parsed].sort((a, b) => a.ms - b.ms)[0];
  const picked = upcoming ?? fallback;
  return picked ? `${picked.label}: ${formatDateCL(picked.iso)}` : "—";
}

function sortEntregablesMovil(ents: Entregable[]) {
  return [...ents].sort((a, b) => {
    const ac = entregableEsCriticoOVencido(a) ? 1 : 0;
    const bc = entregableEsCriticoOVencido(b) ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return parseDate(a.fecha_termino).getTime() - parseDate(b.fecha_termino).getTime();
  });
}

function ResumenBadgeMovil({ estado }: { estado: ResumenEstadoMovil }) {
  const cfg: Record<ResumenEstadoMovil, { bg: string; text: string; label: string }> = {
    CRITICO: { bg: "#FEF2F2", text: "#B91C1C", label: "Crítico" },
    RIESGO: { bg: "#FFF7ED", text: "#B45309", label: "En riesgo" },
    EN_PLAZO: { bg: "#E0E7FF", text: "#4338CA", label: "En plazo" },
    COMPLETADO: { bg: "#ECFDF5", text: "#047857", label: "Completado" },
  };
  const s = cfg[estado];
  return (
    <span
      className="inline-flex shrink-0 rounded-r4 px-1.5 py-0.5 text-[9px] font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

function GanttStatusBadge({ estado }: { estado: Entregable["estado"] }) {
  const s = getStatusBadgeStyle(estado);
  const v = normalizeEstadoParaColorGantt(String(estado));
  const labels: Record<GanttEstadoVisual, string> = {
    EN_PLAZO_OK: "OK",
    RIESGO: "RIES",
    CRITICO: "CRIT",
    COMPLETADO_ADELANTADO: "C/A",
    NO_INICIADO: "N/I",
  };
  return (
    <span
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-[3px] px-[6px] py-[2px] text-[9px] font-semibold tracking-[.04em]"
      style={{ background: s.bg, color: s.text }}
    >
      {labels[v] ?? String(estado).slice(0, 5)}
    </span>
  );
}

/* ─────────── Main Page ─────────── */

export default function Gantt() {
  const { entregables, proyectos, clientes, profesionales } = useAppData();

  const profMap = useMemo(() => {
    const m = new Map<string, string>();
    profesionales.forEach((p) => m.set(p.id, p.nombre_completo));
    return m;
  }, [profesionales]);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set(clientes.map((c) => c.id)));
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set(proyectos.map((p) => p.id)));
  const [filterActive, setFilterActive] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, data: null });
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ── compute timeline ── */
  const months = useMemo(() => {
    if (entregables.length === 0) return [];
    const dates = entregables.map((e) => parseDate(e.fecha_inicio));
    const ends = entregables.map((e) => parseDate(e.fecha_termino));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...ends.map((d) => d.getTime())));
    // Add buffer
    minDate.setMonth(minDate.getMonth() - 1);
    maxDate.setMonth(maxDate.getMonth() + 1);
    return generateMonths(minDate, maxDate);
  }, [entregables]);

  /* ── grouping ── */
  const grouped = useMemo(() => {
    const clientMap = new Map<string, Cliente>();
    clientes.forEach((c) => clientMap.set(c.id, c));
    const projectMap = new Map<string, Proyecto>();
    proyectos.forEach((p) => projectMap.set(p.id, p));

    // client -> projects -> deliverables
    const tree: {
      client: Cliente;
      projects: {
        project: Proyecto;
        deliverables: Entregable[];
      }[];
    }[] = [];

    const clientProjects = new Map<string, Proyecto[]>();
    proyectos.forEach((p) => {
      const arr = clientProjects.get(p.cliente_id) || [];
      arr.push(p);
      clientProjects.set(p.cliente_id, arr);
    });

    const projectEnts = new Map<string, Entregable[]>();
    entregables.forEach((e) => {
      const arr = projectEnts.get(e.proyecto_id) || [];
      arr.push(e);
      projectEnts.set(e.proyecto_id, arr);
    });

    clientes.forEach((client) => {
      const projs = clientProjects.get(client.id) || [];
      const projects = projs.map((project) => ({
        project,
        deliverables: projectEnts.get(project.id) || [],
      }));
      if (projects.length > 0) {
        tree.push({ client, projects });
      }
    });

    return { tree, clientMap, projectMap };
  }, [clientes, proyectos, entregables]);

  /* ── filtered view ── */
  const visibleTree = useMemo(() => {
    if (!filterActive) return grouped.tree;
    return grouped.tree
      .map((c) => ({
        ...c,
        projects: c.projects
          .map((p) => ({
            ...p,
            deliverables: p.deliverables.filter(
              (e) => e.estado !== "COMPLETADO" && e.estado !== "NO_INICIADO"
            ),
          }))
          .filter((p) => p.deliverables.length > 0),
      }))
      .filter((c) => c.projects.length > 0);
  }, [grouped.tree, filterActive]);

  /* ── Mobile tree: Cliente → Proyecto → Entregables (solo presentación) ── */
  const mobileTree = useMemo(() => {
    const clientNodes = visibleTree.map((c) => {
      const allEnts = c.projects.flatMap((p) => p.deliverables);
      const clientRange = rangoFechasEntregables(allEnts);
      const projects = c.projects
        .map((p) => {
          const sortedEnts = sortEntregablesMovil(p.deliverables);
          const projRange = rangoFechasEntregables(sortedEnts);
          return {
            project: p.project,
            deliverables: sortedEnts,
            minStart: projRange.minStart,
            maxEnd: projRange.maxEnd,
            minStartMs: projRange.minStartMs,
            maxEndMs: projRange.maxEndMs,
            resumen: resumenEstadoDesdeEntregables(sortedEnts),
          };
        })
        .sort((a, b) => {
          const ra = RESUMEN_RANK[a.resumen];
          const rb = RESUMEN_RANK[b.resumen];
          if (ra !== rb) return rb - ra;
          const sa = a.minStartMs ?? Number.POSITIVE_INFINITY;
          const sb = b.minStartMs ?? Number.POSITIVE_INFINITY;
          return sa - sb;
        });

      return {
        client: c.client,
        projects,
        minStart: clientRange.minStart,
        maxEnd: clientRange.maxEnd,
        minStartMs: clientRange.minStartMs,
        maxEndMs: clientRange.maxEndMs,
        nProjects: projects.length,
        nEntregables: allEnts.length,
        nCriticosVencidos: allEnts.filter(entregableEsCriticoOVencido).length,
        resumen: resumenEstadoDesdeEntregables(allEnts),
      };
    });

    return clientNodes.sort((a, b) => {
      const ra = RESUMEN_RANK[a.resumen];
      const rb = RESUMEN_RANK[b.resumen];
      if (ra !== rb) return rb - ra;
      const sa = a.minStartMs ?? Number.POSITIVE_INFINITY;
      const sb = b.minStartMs ?? Number.POSITIVE_INFINITY;
      return sa - sb;
    });
  }, [visibleTree]);

  /* ── expand/collapse helpers ── */
  const toggleClient = useCallback((id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleProject = useCallback((id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedClients(new Set(clientes.map((c) => c.id)));
    setExpandedProjects(new Set(proyectos.map((p) => p.id)));
  }, [clientes, proyectos]);

  const collapseAll = useCallback(() => {
    setExpandedClients(new Set());
    setExpandedProjects(new Set());
  }, []);

  /* ── bar render helper ── */
  const renderBarInCell = (
    item: { fecha_inicio: string; fecha_termino: string; estado: Entregable["estado"] },
    month: GanttMonth,
    type: "project" | "deliverable",
    tooltipData?: TooltipState["data"],
    barColorOverride?: string,
  ) => {
    const start = parseDate(item.fecha_inicio);
    const end = parseDate(item.fecha_termino);
    const monthStart = new Date(month.year, month.month, 1);
    const monthEnd = new Date(month.year, month.month, month.days);

    if (end < monthStart || start > monthEnd) return null;

    const left = start.getFullYear() === month.year && start.getMonth() === month.month
      ? (start.getDate() - 1) / month.days
      : 0;
    const right = end.getFullYear() === month.year && end.getMonth() === month.month
      ? end.getDate() / month.days
      : 1;

    const width = Math.max((right - left) * 100, 2);

    const color = barColorOverride ?? getStatusBarColor(item.estado);
    const height = type === "project" ? "12px" : "9px";
    const radius = type === "project" ? "4px" : "2px";
    const opacity = type === "project" ? 0.9 : 0.8;

    return (
      <div
        key={`bar-${month.year}-${month.month}`}
        className="absolute"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          left: `${left * 100}%`,
          width: `${width}%`,
          height,
          background: color,
          borderRadius: radius,
          opacity,
          transition: "opacity .15s, filter .15s",
          cursor: "pointer",
          pointerEvents: "auto",
        }}
        onMouseEnter={(ev) => {
          if (tooltipData) {
            setTooltip({
              visible: true,
              x: ev.clientX + 12,
              y: ev.clientY - 12,
              data: tooltipData,
            });
          }
        }}
        onMouseMove={(ev) => {
          if (tooltipData) {
            setTooltip((prev) => ({
              ...prev,
              x: ev.clientX + 12,
              y: ev.clientY - 12,
            }));
          }
        }}
        onMouseLeave={() => setTooltip({ visible: false, x: 0, y: 0, data: null })}
      />
    );
  };

  /* ── today line position ── */
  const todayLineOffset = useMemo(() => {
    if (months.length === 0) return null;
    const today = new Date();
    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      if (m.year === today.getFullYear() && m.month === today.getMonth()) {
        return { monthIndex: i, dayOffset: ((today.getDate() - 1) / m.days) * 100 };
      }
    }
    return null;
  }, [months]);

  const colWidth = 90; // px per month column
  const labelWidth = 280;

  /* ── total deliverable count for hint ── */
  const totalDeliverables = visibleTree.reduce(
    (sum, c) => sum + c.projects.reduce((s, p) => s + p.deliverables.length, 0),
    0
  );

  if (months.length === 0) {
    return (
      <div className="min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
        <SectionHeader number="06" title="Carta Gantt de Entregables" hint="Sin datos" />
        <div className="flex flex-col items-center justify-center py-[60px] text-center">
          <CalendarX className="mb-3 h-[2.5rem] w-[2.5rem] opacity-25" style={{ color: "#9CA3AF" }} />
          <p className="text-[13px] text-t300">No hay entregables para mostrar en el rango seleccionado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
      <SectionHeader
        number="06"
        title="Carta Gantt de Entregables"
        hint={`${totalDeliverables} entregables · ${months.length} meses`}
      />

      {/* Controls */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-t-[12px] border border-bdr border-b-0 px-[18px] py-3"
        style={{ background: "#F7F8FA" }}
      >
        {/* View controls */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-t300">Vista:</span>
          <button
            className="inline-flex items-center gap-[5px] rounded-r4 border border-bdr bg-white px-3 py-[5px] text-[11px] font-semibold text-t700 transition-all duration-150 hover:border-[#C7D2FE] hover:bg-[#E0E7FF] hover:text-[#4F46E5]"
            onClick={expandAll}
          >
            <Expand className="h-3 w-3" /> Expandir Todo
          </button>
          <button
            className="inline-flex items-center gap-[5px] rounded-r4 border border-bdr bg-white px-3 py-[5px] text-[11px] font-semibold text-t700 transition-all duration-150 hover:border-[#C7D2FE] hover:bg-[#E0E7FF] hover:text-[#4F46E5]"
            onClick={collapseAll}
          >
            <Minimize2 className="h-3 w-3" /> Colapsar Todo
          </button>
        </div>

        <div className="mx-1 h-5 w-px bg-bdr" />

        {/* Filter */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-t300">Filtro:</span>
          <button
            className={`inline-flex items-center justify-center gap-[5px] w-full rounded-r4 border px-3 py-[5px] text-[11px] font-semibold transition-all duration-150 sm:w-auto ${
              !filterActive
                ? "border-[#C7D2FE] bg-[#E0E7FF] text-[#4F46E5]"
                : "border-bdr bg-white text-t700 hover:border-[#C7D2FE] hover:bg-[#E0E7FF] hover:text-[#4F46E5]"
            }`}
            onClick={() => setFilterActive(false)}
          >
            <Eye className="h-3 w-3" /> Todos
          </button>
          <button
            className={`inline-flex items-center justify-center gap-[5px] w-full rounded-r4 border px-3 py-[5px] text-[11px] font-semibold transition-all duration-150 sm:w-auto ${
              filterActive
                ? "border-[#C7D2FE] bg-[#E0E7FF] text-[#4F46E5]"
                : "border-bdr bg-white text-t700 hover:border-[#C7D2FE] hover:bg-[#E0E7FF] hover:text-[#4F46E5]"
            }`}
            onClick={() => setFilterActive(true)}
          >
            <Filter className="h-3 w-3" /> Solo Activos
          </button>
        </div>

        {/* Legend */}
        <div className="ml-auto flex flex-wrap items-center gap-[14px]">
          {[
            { color: "#4F46E5", label: "En Plazo / OK" },
            { color: "#B45309", label: "En Riesgo" },
            { color: "#B91C1C", label: "Crítico" },
            { color: "#047857", label: "Completado / Adelantado" },
            { color: "#475569", label: "No Iniciado" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-[6px]">
              <span className="inline-block rounded-[3px]" style={{ width: "22px", height: "8px", background: item.color }} />
              <span className="text-[11px] text-t500">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile agenda (cards) ── */}
      <div className="md:hidden">
        <div className="mb-4 rounded-r12 border border-bdr bg-white p-4 shadow-sh1">
          <p className="text-[11px] font-semibold text-t600">
            Vista móvil resumida. Para editar o revisar la carta completa, usar escritorio/tablet.
          </p>
        </div>

        {mobileTree.length === 0 ? (
          <div className="rounded-r12 border border-dashed border-bdr bg-surface2 px-6 py-10 text-center text-[12px] text-t500">
            No hay entregables para mostrar.
          </div>
        ) : (
          <div className="space-y-3">
            {mobileTree.map((cn) => {
              const clientOpen = expandedClients.has(cn.client.id);
              const inicioCliente = cn.minStart ? formatDateCL(cn.minStart) : "—";
              const terminoCliente = cn.maxEnd ? formatDateCL(cn.maxEnd) : "—";

              return (
                <section key={cn.client.id} className="overflow-hidden rounded-r12 border border-bdr bg-white shadow-sh1">
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 border-b border-bdr bg-surface2 p-3 text-left"
                    onClick={() => toggleClient(cn.client.id)}
                  >
                    {clientOpen ? (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-t500" />
                    ) : (
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-t500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14px] font-semibold text-t900">{cn.client.nombre}</h3>
                        <ResumenBadgeMovil estado={cn.resumen} />
                      </div>
                      <p className="mt-1 text-[11px] text-t600">
                        {inicioCliente} → {terminoCliente}
                      </p>
                      <p className="mt-1 text-[10px] text-t500">
                        {cn.nProjects} proy. · {cn.nEntregables} entr.
                        {cn.nCriticosVencidos > 0 ? ` · ${cn.nCriticosVencidos} crít./venc.` : ""}
                      </p>
                    </div>
                  </button>

                  {clientOpen ? (
                    <div className="space-y-2 p-2">
                      {cn.projects.map((pn) => {
                        const projOpen = expandedProjects.has(pn.project.id);
                        const inicioProj = pn.minStart ? formatDateCL(pn.minStart) : "—";
                        const terminoProj = pn.maxEnd ? formatDateCL(pn.maxEnd) : "—";

                        return (
                          <div key={pn.project.id} className="rounded-r10 border border-bdr bg-white">
                            <button
                              type="button"
                              className="flex w-full items-start gap-2 p-2.5 text-left"
                              onClick={() => toggleProject(pn.project.id)}
                            >
                              {projOpen ? (
                                <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-t400" />
                              ) : (
                                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-t400" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-[12px] font-semibold text-t800">
                                    <span className="font-mono text-t600">{pn.project.codigo}</span> · {pn.project.nombre}
                                  </p>
                                  <ResumenBadgeMovil estado={pn.resumen} />
                                </div>
                                <p className="mt-0.5 text-[10px] text-t600">
                                  {inicioProj} → {terminoProj} · {pn.deliverables.length} entr.
                                </p>
                              </div>
                            </button>

                            {projOpen ? (
                              <div className="space-y-1.5 border-t border-bdr bg-surface2/50 p-2">
                                {pn.deliverables.map((ent) => {
                                  const codeParts = [ent.fase_codigo, ent.tarea_codigo]
                                    .filter(Boolean)
                                    .join(" · ");
                                  const liderNombre =
                                    profMap.get(ent.lider_id)?.trim() || "Sin líder definido";

                                  return (
                                    <article
                                      key={ent.id}
                                      className="rounded-r8 border border-bdr bg-white px-2.5 py-2"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-t900">
                                          {ent.nombre}
                                        </p>
                                        <GanttStatusBadge estado={ent.estado} />
                                      </div>
                                      {codeParts ? (
                                        <p className="mt-0.5 truncate text-[10px] text-t500">{codeParts}</p>
                                      ) : null}
                                      <p className="mt-1 font-mono text-[10px] text-t600">
                                        {formatDateCL(ent.fecha_inicio)} → {formatDateCL(ent.fecha_termino)}
                                      </p>
                                      <p className="mt-1 text-[10px] text-t600">
                                        Real {Math.round(ent.avance_real * 100)}% · Teórico{" "}
                                        {Math.round(ent.avance_teorico * 100)}%
                                      </p>
                                      <p className="mt-0.5 text-[10px] text-t500">
                                        Hito: {proximoHitoEntregable(ent)}
                                      </p>
                                      <p className="text-[10px] text-t500">Líder: {liderNombre}</p>
                                    </article>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Gantt container (desktop/tablet) */}
      <div className="hidden md:block">
        <div className="relative overflow-hidden rounded-b-[12px] border border-bdr bg-white shadow-sh1">
        {/* Scroll area */}
        <div ref={scrollRef} className="overflow-x-auto overflow-y-visible">
          <div
            className="relative"
            style={{
              display: "grid",
              gridTemplateColumns: `${labelWidth}px repeat(${months.length}, ${colWidth}px)`,
              minWidth: "100%",
            }}
          >
            {/* ── Header Row ── */}
            {/* Sticky label header */}
            <div
              className="sticky left-0 z-10 border-b-2 border-bdr border-r-2 border-r-[#C8CCDB] bg-[#F7F8FA] px-[14px] py-[10px]"
              style={{ whiteSpace: "nowrap" }}
            >
              <span className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.1em] text-t300">
                <CalendarDays className="h-3 w-3" /> Entregable
              </span>
            </div>
            {/* Month headers */}
            {months.map((m) => (
              <div
                key={`hdr-${m.year}-${m.month}`}
                className="border-b-2 border-bdr border-r border-bdr px-[6px] py-[8px] text-center"
                style={{
                  background: m.isTodayMonth ? "#E0E7FF" : "#F7F8FA",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  className="text-[10px] font-semibold tracking-[.04em]"
                  style={{ color: m.isTodayMonth ? "#4F46E5" : "#6B7280" }}
                >
                  {m.label}
                </span>
              </div>
            ))}

            {/* ── Today Line ── */}
            {todayLineOffset && (
              <div
                className="pointer-events-none absolute top-0 z-20"
                style={{
                  left: `${labelWidth + todayLineOffset.monthIndex * colWidth + (todayLineOffset.dayOffset / 100) * colWidth}px`,
                  width: "2px",
                  height: "100%",
                  background: "rgba(239,68,68,.6)",
                }}
              >
                <span
                  className="absolute left-[4px] top-[2px] whitespace-nowrap text-[8px] font-bold tracking-[.06em]"
                  style={{ color: "#EF4444" }}
                >
                  HOY
                </span>
              </div>
            )}

            {/* ── Data Rows ── */}
            {visibleTree.map(({ client, projects }) => {
              const clientExpanded = expandedClients.has(client.id);

              return (
                <div key={client.id} style={{ display: "contents" }}>
                  {/* Client Row */}
                  <div
                    className="sticky left-0 z-[5] cursor-pointer select-none border-b border-r-2 border-r-[#C8CCDB] border-[rgba(255,255,255,.06)] px-[14px] py-[9px]"
                    style={{ background: "#3730A3", color: "#C8D8F0" }}
                    onClick={() => toggleClient(client.id)}
                  >
                    <div className="flex items-center gap-[8px]">
                      <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: client.color }} />
                      <span className="flex-1 text-[10.5px] font-semibold uppercase tracking-[.04em]">
                        {client.nombre}
                      </span>
                      {clientExpanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )}
                    </div>
                  </div>
                  {/* Client timeline cells */}
                  {months.map((m) => (
                    <div
                      key={`c-${client.id}-${m.year}-${m.month}`}
                      className="relative border-b border-[rgba(255,255,255,.06)]"
                      style={{ background: "rgba(21,25,42,.97)" }}
                    />
                  ))}

                  {/* Project Rows */}
                  {clientExpanded &&
                    projects.map(({ project, deliverables }) => {
                      const projectExpanded = expandedProjects.has(project.id);
                      const projEntsInRange = deliverables.filter((e) => {
                        const s = parseDate(e.fecha_inicio);
                        const en = parseDate(e.fecha_termino);
                        const minM = new Date(months[0].year, months[0].month, 1);
                        const maxM = new Date(months[months.length - 1].year, months[months.length - 1].month, months[months.length - 1].days);
                        return s <= maxM && en >= minM;
                      });

                      if (projEntsInRange.length === 0 && filterActive) return null;

                      const projStart = projEntsInRange.length > 0
                        ? new Date(Math.min(...projEntsInRange.map((e) => parseDate(e.fecha_inicio).getTime())))
                        : parseDate(project.fecha_inicio);
                      const projEnd = projEntsInRange.length > 0
                        ? new Date(Math.max(...projEntsInRange.map((e) => parseDate(e.fecha_termino).getTime())))
                        : parseDate(project.fecha_termino);

                      const worstVisual = peorEstadoVisualGantt(projEntsInRange);
                      const worstColor = GANTT_LEGEND_COLORS[worstVisual];
                      const worstStatusLabel = GANTT_WORST_LABEL[worstVisual];

                      return (
                        <div key={project.id} style={{ display: "contents" }}>
                          {/* Project label */}
                          <div
                            className="sticky left-0 z-[5] cursor-pointer select-none border-b border-r-2 border-r-[#C8CCDB] border-bdr px-[14px] py-[8px] transition-colors duration-[120ms] hover:bg-[#E5E9F5]"
                            style={{ background: "#F0F2F8", paddingLeft: "28px" }}
                            onClick={() => toggleProject(project.id)}
                          >
                            <div className="flex items-center gap-[6px]">
                              <span
                                className="inline-block shrink-0 transition-transform duration-200"
                                style={{ transform: projectExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                              >
                                <ChevronRight className="h-3 w-3 text-t300" />
                              </span>
                              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-semibold text-t700">
                                {project.nombre}
                              </span>
                              <span className="shrink-0 rounded-[10px] bg-bdr px-[6px] py-[1px] text-[9.5px] font-semibold text-[#6B7280]">
                                {deliverables.length}
                              </span>
                            </div>
                          </div>
                          {/* Project timeline cells */}
                          {months.map((m) => (
                            <div
                              key={`p-${project.id}-${m.year}-${m.month}`}
                              className="relative cursor-pointer border-b border-bdr transition-colors duration-150 hover:bg-[#E8ECF7]"
                              style={{ background: "#F0F2F8" }}
                            >
                              {renderBarInCell(
                                {
                                  fecha_inicio: projStart.toISOString().slice(0, 10),
                                  fecha_termino: projEnd.toISOString().slice(0, 10),
                                  estado: "NO_INICIADO",
                                },
                                m,
                                "project",
                                {
                                  title: project.nombre,
                                  estado: worstStatusLabel,
                                  inicio: formatDateCL(project.fecha_inicio),
                                  termino: formatDateCL(project.fecha_termino),
                                  avance: `${Math.round((projEntsInRange.reduce((s, e) => s + e.avance_real, 0) / Math.max(projEntsInRange.length, 1)) * 100)}%`,
                                  ufPresup: `${project.uf_presupuestadas.toLocaleString("es-CL")} UF`,
                                  ufCons: `${projEntsInRange.reduce((s, e) => s + e.uf_consumidas, 0).toLocaleString("es-CL")} UF`,
                                },
                                worstColor,
                              )}
                            </div>
                          ))}

                          {/* Deliverable Rows */}
                          {projectExpanded &&
                            deliverables.map((ent) => {
                              const start = parseDate(ent.fecha_inicio);
                              const end = parseDate(ent.fecha_termino);
                              const minM = new Date(months[0].year, months[0].month, 1);
                              const maxM = new Date(
                                months[months.length - 1].year,
                                months[months.length - 1].month,
                                months[months.length - 1].days
                              );
                              if (end < minM || start > maxM) return null;

                              const projName = grouped.projectMap.get(ent.proyecto_id)?.nombre || "";

                              return (
                                <div key={ent.id} style={{ display: "contents" }}>
                                  {/* Deliverable label */}
                                  <div
                                    className="sticky left-0 z-[5] border-b border-r-2 border-r-[#C8CCDB] border-[#EDE9FE] px-[14px] py-[7px]"
                                    style={{ background: "white", paddingLeft: "44px" }}
                                  >
                                    <div className="flex items-center gap-[6px]">
                                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-t700">
                                        {ent.nombre}
                                      </span>
                                      <GanttStatusBadge estado={ent.estado} />
                                    </div>
                                  </div>
                                  {/* Deliverable timeline cells */}
                                  {months.map((m) => (
                                    <div
                                      key={`e-${ent.id}-${m.year}-${m.month}`}
                                      className="relative border-b border-[#EDE9FE]"
                                      style={{ background: "white" }}
                                    >
                                      {renderBarInCell(
                                        ent,
                                        m,
                                        "deliverable",
                                        {
                                          title: ent.nombre,
                                          proyecto: projName,
                                          estado: ent.estado,
                                          inicio: formatDateCL(ent.fecha_inicio),
                                          termino: formatDateCL(ent.fecha_termino),
                                          avance: `${Math.round(ent.avance_real * 100)}%`,
                                          ufPresup: `${ent.uf_presupuestadas.toLocaleString("es-CL")} UF`,
                                          ufCons: `${ent.uf_consumidas.toLocaleString("es-CL")} UF`,
                                        }
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {/* Empty state inside grid */}
            {visibleTree.length === 0 && (
              <div
                style={{
                  display: "contents",
                }}
              >
                <div className="sticky left-0 z-[5] border-b border-r-2 border-r-[#C8CCDB] border-bdr bg-white px-[14px] py-[7px]" />
                {months.map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="relative border-b border-bdr bg-white"
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Empty overlay */}
        {visibleTree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-[60px] text-center">
            <CalendarX className="mb-3 h-[2.5rem] w-[2.5rem] opacity-25" style={{ color: "#9CA3AF" }} />
            <p className="text-[13px] text-t300">No hay entregables para mostrar en el rango seleccionado</p>
          </div>
        )}
      </div>
      </div>

      {/* Tooltip */}
      <div className="hidden md:block">
        {tooltip.visible && tooltip.data && (
          <div
            className="pointer-events-none fixed z-[999] rounded-[8px] border border-bdr bg-white p-[10px_14px] shadow-sh3"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              minWidth: "200px",
              maxWidth: "280px",
            }}
          >
            <h4 className="mb-[6px] font-playfair text-[12px] font-semibold leading-[1.3] text-t900">
              {tooltip.data.title}
            </h4>
            <div className="flex flex-col gap-[2px]">
              {tooltip.data.proyecto && (
                <div className="flex justify-between gap-3 text-[11px]">
                  <span className="text-t500">Proyecto</span>
                  <span className="font-semibold text-t700">{tooltip.data.proyecto}</span>
                </div>
              )}
              <div className="flex justify-between gap-3 text-[11px]">
                <span className="text-t500">Estado</span>
                <span className="font-semibold text-t700">{tooltip.data.estado}</span>
              </div>
              <div className="flex justify-between gap-3 text-[11px]">
                <span className="text-t500">Inicio</span>
                <span className="font-semibold text-t700">{tooltip.data.inicio}</span>
              </div>
              <div className="flex justify-between gap-3 text-[11px]">
                <span className="text-t500">Término</span>
                <span className="font-semibold text-t700">{tooltip.data.termino}</span>
              </div>
              <div className="flex justify-between gap-3 text-[11px]">
                <span className="text-t500">Avance</span>
                <span className="font-semibold text-t700">{tooltip.data.avance}</span>
              </div>
              <div className="flex justify-between gap-3 text-[11px]">
                <span className="text-t500">UF Presup.</span>
                <span className="font-semibold text-t700">{tooltip.data.ufPresup}</span>
              </div>
              <div className="flex justify-between gap-3 text-[11px]">
                <span className="text-t500">UF Consum.</span>
                <span className="font-semibold text-t700">{tooltip.data.ufCons}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
