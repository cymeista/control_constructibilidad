import { useState, useMemo } from "react";
import { Eye, X } from "lucide-react";
import { useAppData, type Entregable } from "@/context/AppDataContext";
import SectionHeader from "@/components/SectionHeader";
import FilterBar from "@/components/FilterBar";
import StatusPill, { entregableEstadoToStatusVariant } from "@/components/StatusPill";
import DataTable from "@/components/DataTable";

/* ─────────── Helpers ─────────── */
const fmtNum = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

function dateStatus(d: string | null): "past" | "soon" | "ok" {
  if (!d) return "ok";
  const target = new Date(d);
  const now = new Date();
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "past";
  if (diffDays <= 7) return "soon";
  return "ok";
}

function ProgressBar({ value, color = "#4F46E5" }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-[5px] flex-1 rounded-[3px] bg-bdr" style={{ minWidth: 44 }}>
        <div
          className="h-full rounded-[3px] transition-all"
          style={{ transitionDuration: "350ms", width: `${pct}%`, background: color }}
        />
      </div>
      <span className="min-w-[34px] text-right text-[11px] font-mono text-t500">{pct.toFixed(0)}%</span>
    </div>
  );
}

const STATUS_PILLS = [
  { key: "CRITICO", label: "Crítico", desc: "Atraso crítico", color: "#B91C1C" },
  { key: "RIESGO", label: "Riesgo", desc: "En riesgo", color: "#B45309" },
  { key: "OK", label: "OK", desc: "En plazo", color: "#047857" },
  { key: "ADELANTADO", label: "Adelantado", desc: "Adelantado", color: "#047857" },
  { key: "NO_INICIADO", label: "No Iniciado", desc: "Pendiente", color: "#475569" },
  { key: "COMPLETADO", label: "Completado", desc: "Finalizado", color: "#4F46E5" },
] as const;

function estadoAlertaLabel(estado: string) {
  return STATUS_PILLS.find((p) => p.key === estado)?.label ?? estado;
}

function statusColorForEstado(estado: string) {
  if (estado === "COMPLETADO") return "#4F46E5";
  if (estado === "EN_PLAZO" || estado === "ADELANTADO" || estado === "OK") return "#047857";
  if (estado === "RIESGO") return "#B45309";
  if (estado === "CRITICO") return "#B91C1C";
  return "#475569";
}

type AlertaRow = Entregable & {
  _codigo: string;
  _proyecto: string;
  _cliente: string;
  _lider: string;
  _pm: string;
  _brecha: number;
  _sobreconsumo: number;
};

function breveDescripcion(row: AlertaRow) {
  const parts: string[] = [];
  parts.push(`Brecha ${row._brecha >= 0 ? "+" : ""}${fmtNum(row._brecha * 100)}%`);
  parts.push(
    row._sobreconsumo > 0
      ? `Sobreconsumo UF +${fmtNum(row._sobreconsumo)}%`
      : `Sobreconsumo UF ${fmtNum(row._sobreconsumo)}%`,
  );
  const nota = (row.nota_seguimiento ?? "").trim();
  if (nota) parts.push(nota.length > 120 ? `${nota.slice(0, 120)}…` : nota);
  return parts.join(" · ");
}

function proximaRevisionLabel(row: AlertaRow) {
  const fechas = [
    { tag: "Rev. A", iso: row.fecha_revA },
    { tag: "Rev. B", iso: row.fecha_revB },
    { tag: "Rev. P", iso: row.fecha_revP },
  ].filter((f) => f.iso);
  if (fechas.length === 0) return "Sin fechas de revisión";
  const ordenadas = [...fechas].sort((a, b) => String(a.iso).localeCompare(String(b.iso)));
  const f = ordenadas[0]!;
  return `${f.tag}: ${fmtDate(f.iso)}`;
}

function AlertaDetalleModal({ row, onClose }: { row: AlertaRow; onClose: () => void }) {
  const color = statusColorForEstado(row.estado);
  const dA = dateStatus(row.fecha_revA);
  const dB = dateStatus(row.fecha_revB);
  const dP = dateStatus(row.fecha_revP);
  const nota = (row.nota_seguimiento ?? "").trim();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 md:items-center md:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alerta-detalle-titulo"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-r12 border border-bdr bg-surface shadow-sh3 md:max-h-[90vh] md:max-w-lg md:rounded-r12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-bdr px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="alerta-detalle-titulo" className="text-[15px] font-semibold text-t900">
              {row.nombre}
            </h2>
            <p className="mt-1 text-[12px] text-t600">
              {estadoAlertaLabel(row.estado)} · {row._codigo}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-r8 p-2 text-t500 hover:bg-surface2"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom)))] md:pb-4">
          <div className="mb-3">
            <StatusPill variant={entregableEstadoToStatusVariant(row.estado)} labelOverride={row.estado} />
          </div>
          <dl className="space-y-2 text-[12px]">
            <div>
              <dt className="text-[10px] font-semibold uppercase text-t400">Cliente</dt>
              <dd className="text-t800">{row._cliente}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-t400">Proyecto</dt>
              <dd className="text-t800">
                {row._codigo} · {row._proyecto}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-t400">Líder</dt>
              <dd className="text-t800">{row._lider}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-t400">Project Manager</dt>
              <dd className="text-t800">{row._pm}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-t400">Avance</dt>
              <dd className="mt-1 space-y-2">
                <div>
                  <span className="text-[11px] text-t500">Real</span>
                  <ProgressBar value={row.avance_real} color={color} />
                </div>
                <div>
                  <span className="text-[11px] text-t500">Teórico</span>
                  <ProgressBar value={row.avance_teorico} color="#9CA3AF" />
                </div>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-t400">Brecha / UF</dt>
              <dd className="font-mono text-t800">
                Brecha {row._brecha >= 0 ? "+" : ""}
                {fmtNum(row._brecha * 100)}% · UF {fmtNum(row.uf_presupuestadas)} / {fmtNum(row.uf_consumidas)}{" "}
                ({row._sobreconsumo > 0 ? "+" : ""}
                {fmtNum(row._sobreconsumo)}%)
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-t400">Revisiones</dt>
              <dd className="font-mono text-[11px] text-t700">
                <span className={dA === "past" ? "text-red" : dA === "soon" ? "text-amber" : ""}>
                  A: {fmtDate(row.fecha_revA)}
                </span>
                {" · "}
                <span className={dB === "past" ? "text-red" : dB === "soon" ? "text-amber" : ""}>
                  B: {fmtDate(row.fecha_revB)}
                </span>
                {" · "}
                <span className={dP === "past" ? "text-red" : dP === "soon" ? "text-amber" : ""}>
                  P: {fmtDate(row.fecha_revP)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-t400">Nota de seguimiento</dt>
              <dd className="text-t700">{nota || "Sin nota registrada"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-t400">Seguimiento</dt>
              <dd className="text-t700">
                {nota ? "Con nota de seguimiento" : "Pendiente de nota en esta vista"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="shrink-0 border-t border-bdr px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="min-h-[44px] w-full rounded-r8 bg-copper px-4 py-2.5 text-[12px] font-semibold text-white md:min-h-0"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertaMobileCard({ row, onDetail }: { row: AlertaRow; onDetail: () => void }) {
  const pill = STATUS_PILLS.find((p) => p.key === row.estado);
  const nota = (row.nota_seguimiento ?? "").trim();

  return (
    <article className="rounded-r10 border border-bdr bg-white p-3 shadow-sh1">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-t500">
            {pill?.label ?? row.estado} · Nivel de alerta
          </p>
          <h3 className="mt-0.5 text-[13px] font-semibold leading-snug text-t900">{row.nombre}</h3>
        </div>
        <StatusPill variant={entregableEstadoToStatusVariant(row.estado)} labelOverride={row.estado} />
      </div>
      <dl className="space-y-1.5 text-[11px]">
        <div>
          <dt className="text-[9px] font-semibold uppercase text-t400">Cliente / Proyecto</dt>
          <dd className="text-t700">
            {row._cliente} · {row._codigo}
          </dd>
          <dd className="truncate text-t600">{row._proyecto}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase text-t400">Líder / PM</dt>
          <dd className="text-t700">
            {row._lider} · {row._pm}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase text-t400">Resumen</dt>
          <dd className="line-clamp-2 text-t600">{breveDescripcion(row)}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase text-t400">Próxima revisión</dt>
          <dd className="font-mono text-t700">{proximaRevisionLabel(row)}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase text-t400">Seguimiento</dt>
          <dd className="text-t700">{nota ? "Con nota registrada" : "Pendiente de nota"}</dd>
        </div>
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <span className="text-[10px] text-t500">Avance real</span>
          <ProgressBar value={row.avance_real} color={statusColorForEstado(row.estado)} />
        </div>
      </div>
      <button
        type="button"
        className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-r8 border border-bdr bg-surface2 text-[12px] font-semibold text-t800"
        onClick={onDetail}
      >
        <Eye size={16} />
        Ver detalle
      </button>
    </article>
  );
}

/* ─────────── Page Component ─────────── */
export default function Alertas() {
  const { entregables, proyectos, clientes, profesionales } = useAppData();
  const [detailRow, setDetailRow] = useState<AlertaRow | null>(null);

  /* filters */
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterClient, setFilterClient] = useState("todos");
  const [filterProject, setFilterProject] = useState("todos");
  const [filterLider, setFilterLider] = useState("todos");
  const [filterPM, setFilterPM] = useState("todos");

  /* pagination */
  const [page, setPage] = useState(1);
  const pageSize = 20;

  /* lookup maps */
  const clientMap = useMemo(() => {
    const m = new Map<string, string>();
    clientes.forEach((c) => m.set(c.id, c.nombre));
    return m;
  }, [clientes]);

  const profMap = useMemo(() => {
    const m = new Map<string, string>();
    profesionales.forEach((p) => m.set(p.id, p.nombre_completo));
    return m;
  }, [profesionales]);

  const projMap = useMemo(() => {
    const m = new Map<
      string,
      { codigo: string; nombre: string; cliente_id: string; pm_id: string; pm_nombre: string }
    >();
    proyectos.forEach((p) =>
      m.set(p.id, {
        codigo: p.codigo,
        nombre: p.nombre,
        cliente_id: p.cliente_id,
        pm_id: p.project_manager_id,
        pm_nombre: p.pm_nombre ?? "",
      }),
    );
    return m;
  }, [proyectos]);

  /* status counts for summary pills */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      CRITICO: 0,
      RIESGO: 0,
      OK: 0,
      ADELANTADO: 0,
      NO_INICIADO: 0,
      COMPLETADO: 0,
    };
    entregables.forEach((e) => {
      counts[e.estado] = (counts[e.estado] || 0) + 1;
    });
    return counts;
  }, [entregables]);

  /* derived rows */
  const rows = useMemo(() => {
    let list: AlertaRow[] = entregables.map((e) => {
      const proj = projMap.get(e.proyecto_id);
      const clientName = proj ? clientMap.get(proj.cliente_id) || "—" : "—";
      const pmName = proj ? proj.pm_nombre?.trim() || profMap.get(proj.pm_id) || "—" : "—";
      const liderName = profMap.get(e.lider_id) || "—";
      const brecha = e.avance_real - e.avance_teorico;
      const sobreconsumo =
        e.uf_presupuestadas > 0 ? ((e.uf_consumidas - e.uf_presupuestadas) / e.uf_presupuestadas) * 100 : 0;
      return {
        ...e,
        _codigo: proj?.codigo || "—",
        _proyecto: proj?.nombre || "—",
        _cliente: clientName,
        _lider: liderName,
        _pm: pmName,
        _brecha: brecha,
        _sobreconsumo: sobreconsumo,
      };
    });

    if (filterStatus !== "todos") {
      list = list.filter((r) => r.estado === filterStatus);
    }
    if (filterClient !== "todos") {
      list = list.filter((r) => {
        const proj = projMap.get(r.proyecto_id);
        return proj?.cliente_id === filterClient;
      });
    }
    if (filterProject !== "todos") {
      list = list.filter((r) => r.proyecto_id === filterProject);
    }
    if (filterLider !== "todos") {
      list = list.filter((r) => r.lider_id === filterLider);
    }
    if (filterPM !== "todos") {
      list = list.filter((r) => {
        const proj = projMap.get(r.proyecto_id);
        if (!proj) return false;
        if (proj.pm_id === filterPM) return true;
        const selectedNombre = profMap.get(filterPM);
        return !!selectedNombre && proj.pm_nombre?.trim() === selectedNombre;
      });
    }

    return list;
  }, [entregables, filterStatus, filterClient, filterProject, filterLider, filterPM, clientMap, profMap, projMap]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  const clientOptions = useMemo(
    () => [{ value: "todos", label: "Todos" }, ...clientes.map((c) => ({ value: c.id, label: c.nombre }))],
    [clientes],
  );
  const projectOptions = useMemo(() => {
    const base = [{ value: "todos", label: "Todos" }];
    const filtered = filterClient === "todos" ? proyectos : proyectos.filter((p) => p.cliente_id === filterClient);
    return [...base, ...filtered.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))];
  }, [proyectos, filterClient]);
  const liderOptions = useMemo(
    () => [{ value: "todos", label: "Todos" }, ...profesionales.map((p) => ({ value: p.id, label: p.nombre_completo }))],
    [profesionales],
  );
  const pmOptions = useMemo(
    () => [{ value: "todos", label: "Todos" }, ...profesionales.map((p) => ({ value: p.id, label: p.nombre_completo }))],
    [profesionales],
  );

  const paginationBtnClass =
    "min-h-[44px] rounded-r8 border border-bdr bg-white px-3 py-2 text-[12px] font-medium text-t700 transition-colors hover:bg-surface2 disabled:opacity-40 md:min-h-0 md:py-[6px] md:text-[11px]";

  return (
    <div className="animate-fade-in min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
      <SectionHeader
        number="07"
        title="Centro de Alertas · Monitoreo de Riesgos"
        hint="Todos los entregables con nivel de alerta y consumo"
      />

      <div className="mb-[18px] flex items-baseline gap-3">
        <span
          className="rounded-r4 px-2 py-[2px] text-[10.5px] font-semibold"
          style={{ background: "#E0E7FF", color: "#6366F1", border: "1px solid #C7D2FE" }}
        >
          {rows.length} alertas
        </span>
      </div>

      <div className="mb-[18px] flex flex-wrap gap-[10px]">
        <button
          type="button"
          onClick={() => {
            setFilterStatus("todos");
            setPage(1);
          }}
          className={`flex items-center gap-3 rounded-r8 border px-[18px] py-3 transition-shadow hover:shadow-sh2 ${filterStatus === "todos" ? "border-2 border-t300" : "border-bdr bg-white"}`}
          style={{ transitionDuration: "180ms" }}
        >
          <span className="h-2 w-2 rounded-full bg-t300" />
          <div>
            <div className="font-playfair text-[1.65rem] font-semibold leading-none text-t900">{entregables.length}</div>
            <div className="mt-1 text-[11px] text-t500">Todos</div>
          </div>
        </button>
        {STATUS_PILLS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setFilterStatus(filterStatus === p.key ? "todos" : p.key);
              setPage(1);
            }}
            className={`flex items-center gap-3 rounded-r8 border px-[18px] py-3 transition-shadow hover:shadow-sh2 ${filterStatus === p.key ? "border-2" : "border-bdr bg-white"}`}
            style={
              filterStatus === p.key ? { borderColor: p.color, transitionDuration: "180ms" } : { transitionDuration: "180ms" }
            }
          >
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <div>
              <div className="font-playfair text-[1.65rem] font-semibold leading-none text-t900">
                {statusCounts[p.key] || 0}
              </div>
              <div className="mt-1 text-[11px] text-t500">{p.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mb-[14px] rounded-r8 border border-bdr bg-white p-[12px_18px] shadow-sh1">
        <FilterBar
          filters={[
            {
              key: "estado",
              label: "Nivel Alerta",
              options: [{ value: "todos", label: "Todos" }, ...STATUS_PILLS.map((p) => ({ value: p.key, label: p.label }))],
              value: filterStatus,
              onChange: (v) => {
                setFilterStatus(v);
                setPage(1);
              },
            },
            {
              key: "cliente",
              label: "Cliente",
              options: clientOptions,
              value: filterClient,
              onChange: (v) => {
                setFilterClient(v);
                setFilterProject("todos");
                setPage(1);
              },
            },
            {
              key: "proyecto",
              label: "Proyecto",
              options: projectOptions,
              value: filterProject,
              onChange: (v) => {
                setFilterProject(v);
                setPage(1);
              },
            },
            {
              key: "lider",
              label: "Líder",
              options: liderOptions,
              value: filterLider,
              onChange: (v) => {
                setFilterLider(v);
                setPage(1);
              },
            },
            {
              key: "pm",
              label: "Project Manager",
              options: pmOptions,
              value: filterPM,
              onChange: (v) => {
                setFilterPM(v);
                setPage(1);
              },
            },
          ]}
        />
      </div>

      <p className="mb-2 text-[11px] text-t500 md:hidden">
        Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} de {rows.length} alertas
      </p>

      <div className="space-y-3 md:hidden">
        {paged.length === 0 ? (
          <p className="rounded-r10 border border-dashed border-bdr bg-surface2 py-10 text-center text-[12px] text-t500">
            No se encontraron alertas con los filtros seleccionados.
          </p>
        ) : (
          paged.map((row) => (
            <AlertaMobileCard key={row.id} row={row} onDetail={() => setDetailRow(row)} />
          ))
        )}
      </div>

      <div className="hidden md:block">
        <DataTable
          headers={[
            "Cód. Proyecto",
            "Proyecto",
            "Cliente",
            "Entregable",
            "Líder",
            "PM",
            "Estado",
            "Nivel Alerta",
            "Av. Real",
            "Av. Teórico",
            "Brecha %",
            "Rev.A",
            "Rev.B",
            "Rev.P",
            "UF Presup.",
            "UF Cons.",
            "Sobreconsumo",
            "Acciones",
          ]}
          footerLeft={`Mostrando ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, rows.length)} de ${rows.length} alertas`}
          footerRight={`Última actualización: ${new Date().toLocaleString("es-CL")}`}
        >
          {paged.map((row) => {
            const statusColor = statusColorForEstado(row.estado);
            const dA = dateStatus(row.fecha_revA);
            const dB = dateStatus(row.fecha_revB);
            const dP = dateStatus(row.fecha_revP);

            return (
              <tr key={row.id} className="border-b border-bdr transition-colors hover:bg-[#F6F8FF]">
                <td className="whitespace-nowrap px-[14px] py-[9px] text-[12.5px] font-mono text-t900">{row._codigo}</td>
                <td className="max-w-[160px] truncate px-[14px] py-[9px] text-[12.5px] text-t900" title={row._proyecto}>
                  {row._proyecto}
                </td>
                <td className="max-w-[140px] truncate px-[14px] py-[9px] text-[12.5px] text-t900" title={row._cliente}>
                  {row._cliente}
                </td>
                <td className="max-w-[200px] truncate px-[14px] py-[9px] text-[12.5px] text-t900" title={row.nombre}>
                  {row.nombre}
                </td>
                <td className="max-w-[160px] truncate px-[14px] py-[9px] text-[12.5px] text-t900" title={row._lider}>
                  {row._lider}
                </td>
                <td className="max-w-[140px] truncate px-[14px] py-[9px] text-[12.5px] text-t900" title={row._pm}>
                  {row._pm}
                </td>
                <td className="px-[14px] py-[9px]">
                  <StatusPill variant={entregableEstadoToStatusVariant(row.estado)} labelOverride={row.estado} />
                </td>
                <td className="px-[14px] py-[9px]">
                  <StatusPill variant={entregableEstadoToStatusVariant(row.estado)} labelOverride={row.estado} />
                </td>
                <td className="px-[14px] py-[9px]">
                  <ProgressBar value={row.avance_real} color={statusColor} />
                </td>
                <td className="px-[14px] py-[9px]">
                  <ProgressBar value={row.avance_teorico} color="#9CA3AF" />
                </td>
                <td
                  className={`px-[14px] py-[9px] text-right text-[12px] font-mono font-bold ${row._brecha >= 0 ? "text-green" : "text-red"}`}
                >
                  {row._brecha >= 0 ? "+" : ""}
                  {fmtNum(row._brecha * 100)}%
                </td>
                <td className="whitespace-nowrap px-[14px] py-[9px] text-[11px] font-mono">
                  <span className={dA === "past" ? "text-red" : dA === "soon" ? "text-amber" : "text-t700"}>
                    {fmtDate(row.fecha_revA)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-[14px] py-[9px] text-[11px] font-mono">
                  <span className={dB === "past" ? "text-red" : dB === "soon" ? "text-amber" : "text-t700"}>
                    {fmtDate(row.fecha_revB)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-[14px] py-[9px] text-[11px] font-mono">
                  <span className={dP === "past" ? "text-red" : dP === "soon" ? "text-amber" : "text-t700"}>
                    {fmtDate(row.fecha_revP)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-[14px] py-[9px] text-right text-[11px] font-mono text-t700">
                  {fmtNum(row.uf_presupuestadas)}
                </td>
                <td className="whitespace-nowrap px-[14px] py-[9px] text-right text-[11px] font-mono text-t700">
                  {fmtNum(row.uf_consumidas)}
                </td>
                <td className="px-[14px] py-[9px]">
                  {row._sobreconsumo > 0 ? (
                    <span className="inline-block rounded-r4 bg-[#FEF2F2] px-2 py-[3px] text-[9.5px] font-semibold text-red">
                      +{fmtNum(row._sobreconsumo)}%
                    </span>
                  ) : (
                    <span className="inline-block rounded-r4 bg-[#ECFDF5] px-2 py-[3px] text-[9.5px] font-semibold text-green">
                      {fmtNum(row._sobreconsumo)}%
                    </span>
                  )}
                </td>
                <td className="px-[14px] py-[9px]">
                  <button
                    type="button"
                    className="rounded-r4 p-1.5 text-t500 transition-colors hover:bg-bluebg hover:text-blue"
                    title="Ver detalle"
                    aria-label={`Ver detalle de ${row.nombre}`}
                    onClick={() => setDetailRow(row)}
                  >
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            );
          })}

          {paged.length === 0 && (
            <tr>
              <td colSpan={18} className="px-[14px] py-8 text-center text-[12.5px] text-t300">
                No se encontraron alertas con los filtros seleccionados.
              </td>
            </tr>
          )}
        </DataTable>
      </div>

      {totalPages > 1 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className={paginationBtnClass}>
            Anterior
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              className={`min-h-[44px] rounded-r8 px-3 py-2 text-[12px] font-semibold transition-colors md:min-h-0 md:py-[6px] md:text-[11px] ${
                p === page ? "bg-blue text-white" : "border border-bdr bg-white text-t700 hover:bg-surface2"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={paginationBtnClass}
          >
            Siguiente
          </button>
        </div>
      ) : null}

      {detailRow ? <AlertaDetalleModal row={detailRow} onClose={() => setDetailRow(null)} /> : null}
    </div>
  );
}
