import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAppData } from "@/context/AppDataContext";
import SectionHeader from "@/components/SectionHeader";
import GanttProfesionalDetalleModal from "@/components/gantt/GanttProfesionalDetalleModal";
import {
  ChevronRight,
  ChevronDown,
  CalendarX,
  Expand,
  Minimize2,
  AlertTriangle,
} from "lucide-react";
import {
  buildGanttProfesionalDetalleModal,
  calcularResumenProfesionalGantt,
  construirGanttProfesionalesArbol,
  esProfesionalPorDefinir,
  fmtColaboracionEntregablePct,
  fmtHorasGanttProfesional,
  textoBarraResumenGanttProfesional,
  textoResumenFilaProfesionalGantt,
  textoSublineaEntregableGanttProf,
  type GanttProfesionalEntregableFila,
  type GanttProfFiltroEstado,
  type GanttProfFiltroRol,
} from "@/gantt/ganttProfesionalesReadModel";
import {
  colorBarraPorAvance,
  computeGanttBarSegment,
  ESTADO_EJECUCION_LABEL,
  formatGanttDateCL,
  generateGanttMonths,
  parseGanttDate,
  type GanttMonth,
} from "@/gantt/ganttChartUtils";

/** Anchos columnas fijas izquierda (px). */
const COL_ENTREGABLE = 220;
const COL_ROL = 56;
const COL_HORAS = 76;
const COL_INCIDENCIA = 80;
const COL_ESTADO = 108;
const LEFT_COLUMNS_WIDTH = COL_ENTREGABLE + COL_ROL + COL_HORAS + COL_INCIDENCIA + COL_ESTADO;
const STICKY_LEFT = [0, COL_ENTREGABLE, COL_ENTREGABLE + COL_ROL, COL_ENTREGABLE + COL_ROL + COL_HORAS, COL_ENTREGABLE + COL_ROL + COL_HORAS + COL_INCIDENCIA] as const;

function stickyMetaCol(index: 0 | 1 | 2 | 3 | 4, bg: string): CSSProperties {
  return {
    position: "sticky",
    left: STICKY_LEFT[index],
    zIndex: 6,
    background: bg,
  };
}

function EstadoEjecucionBadge({ estado }: { estado: GanttProfesionalEntregableFila["estadoEjecucion"] }) {
  const cfg = {
    COMPLETADO: { bg: "#ECFDF5", text: "#047857" },
    EN_EJECUCION: { bg: "#E0E7FF", text: "#4338CA" },
    POR_INICIAR: { bg: "#F1F5F9", text: "#475569" },
  }[estado];
  return (
    <span
      className="inline-flex shrink-0 rounded-[3px] px-[6px] py-[2px] text-[9px] font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {ESTADO_EJECUCION_LABEL[estado]}
    </span>
  );
}

export default function GanttProfesionales() {
  const {
    equipo_entregable,
    entregables,
    proyectos,
    clientes,
    profesionales,
    registro_horas,
  } = useAppData();

  const [expandedProf, setExpandedProf] = useState<Set<string>>(
    () => new Set(profesionales.map((p) => p.id)),
  );
  const [filtroProfesionalId, setFiltroProfesionalId] = useState("");
  const [filtroClienteId, setFiltroClienteId] = useState("");
  const [filtroProyectoId, setFiltroProyectoId] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<GanttProfFiltroEstado>("TODOS");
  const [filtroRol, setFiltroRol] = useState<GanttProfFiltroRol>("TODOS");
  const [ocultarPorDefinir, setOcultarPorDefinir] = useState(false);
  const [mostrarSeya001, setMostrarSeya001] = useState(false);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleFila, setDetalleFila] = useState<{
    profId: string;
    fila: GanttProfesionalEntregableFila;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const arbol = useMemo(
    () =>
      construirGanttProfesionalesArbol({
        equipo_entregable: equipo_entregable ?? [],
        entregables,
        proyectos,
        clientes,
        profesionales,
        registro_horas,
        filtros: {
          profesionalId: filtroProfesionalId || undefined,
          clienteId: filtroClienteId || undefined,
          proyectoId: filtroProyectoId || undefined,
          estado: filtroEstado,
          rol: filtroRol,
          ocultarPorDefinir,
          mostrarSeya001,
        },
      }),
    [
      equipo_entregable,
      entregables,
      proyectos,
      clientes,
      profesionales,
      registro_horas,
      filtroProfesionalId,
      filtroClienteId,
      filtroProyectoId,
      filtroEstado,
      filtroRol,
      ocultarPorDefinir,
      mostrarSeya001,
    ],
  );

  const detalleModal = useMemo(() => {
    if (!detalleFila) return null;
    const prof = profesionales.find((p) => p.id === detalleFila.profId);
    if (!prof) return null;
    return buildGanttProfesionalDetalleModal(prof, detalleFila.fila, {
      profesionales,
      registro_horas,
      entregables,
      proyectos,
    });
  }, [detalleFila, profesionales, registro_horas, entregables, proyectos]);

  const months = useMemo(() => {
    const fechas: Date[] = [];
    for (const n of arbol) {
      for (const f of n.entregables) {
        if (!f.fechasRevPCompletas) continue;
        const s = parseGanttDate(f.fechasBarra.fecha_inicio);
        const e = parseGanttDate(f.fechasBarra.fecha_termino);
        if (Number.isFinite(s.getTime())) fechas.push(s);
        if (Number.isFinite(e.getTime())) fechas.push(e);
      }
    }
    if (fechas.length === 0) return [];
    const minDate = new Date(Math.min(...fechas.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...fechas.map((d) => d.getTime())));
    minDate.setMonth(minDate.getMonth() - 1);
    maxDate.setMonth(maxDate.getMonth() + 1);
    return generateGanttMonths(minDate, maxDate);
  }, [arbol]);

  const totalEntregables = arbol.reduce((s, n) => s + n.entregables.length, 0);

  const toggleProf = useCallback((id: string) => {
    setExpandedProf((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedProf(new Set(arbol.map((n) => n.profesional.id)));
  }, [arbol]);

  const collapseAll = useCallback(() => {
    setExpandedProf(new Set());
  }, []);

  const openDetalle = useCallback((profId: string, fila: GanttProfesionalEntregableFila) => {
    setDetalleFila({ profId, fila });
    setDetalleOpen(true);
  }, []);

  const proyectosFiltrados = useMemo(() => {
    if (!filtroClienteId) return proyectos;
    return proyectos.filter((p) => p.cliente_id === filtroClienteId);
  }, [proyectos, filtroClienteId]);

  const todayLineOffset = useMemo(() => {
    if (months.length === 0) return null;
    const today = new Date();
    for (let i = 0; i < months.length; i++) {
      const m = months[i]!;
      if (m.year === today.getFullYear() && m.month === today.getMonth()) {
        return { monthIndex: i, dayOffset: ((today.getDate() - 1) / m.days) * 100 };
      }
    }
    return null;
  }, [months]);

  const colWidth = 90;
  const gridTemplateColumns = `${COL_ENTREGABLE}px ${COL_ROL}px ${COL_HORAS}px ${COL_INCIDENCIA}px ${COL_ESTADO}px repeat(${months.length}, ${colWidth}px)`;

  const renderResumenProfesional = (
    entregablesVisibles: GanttProfesionalEntregableFila[],
    month: GanttMonth,
  ) => {
    const resumen = calcularResumenProfesionalGantt(entregablesVisibles);
    if (!resumen.fecha_inicio || !resumen.fecha_termino) return null;

    const seg = computeGanttBarSegment(
      { fecha_inicio: resumen.fecha_inicio, fecha_termino: resumen.fecha_termino },
      month,
    );
    if (!seg) return null;

    const avgAvance =
      entregablesVisibles
        .filter((f) => f.fechasRevPCompletas)
        .reduce((s, f) => s + f.entregable.avance_real, 0) / Math.max(resumen.conFechas, 1);
    const color = colorBarraPorAvance(avgAvance);
    const barLabel = textoBarraResumenGanttProfesional(resumen);
    const tooltip = textoResumenFilaProfesionalGantt(resumen);

    return (
      <div
        key={`resumen-${month.year}-${month.month}`}
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          left: `${seg.leftPct}%`,
          width: `${seg.widthPct}%`,
          height: "12px",
          background: color,
          borderRadius: "4px",
          opacity: 0.92,
        }}
        title={tooltip}
      >
        {seg.leftPct === 0 && seg.widthPct > 12 ? (
          <span className="block truncate px-1 text-[8px] font-semibold leading-[12px] text-white">
            {barLabel}
          </span>
        ) : null}
      </div>
    );
  };

  const renderBar = (
    fila: GanttProfesionalEntregableFila,
    month: GanttMonth,
    profId: string,
  ) => {
    if (!fila.fechasRevPCompletas) return null;
    const seg = computeGanttBarSegment(fila.fechasBarra, month);
    if (!seg) return null;
    const color = colorBarraPorAvance(fila.entregable.avance_real);
    const barTitle = textoSublineaEntregableGanttProf(fila);

    return (
      <button
        type="button"
        key={`bar-${fila.entregableId}-${month.year}-${month.month}`}
        className="absolute cursor-pointer border-0 p-0"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          left: `${seg.leftPct}%`,
          width: `${seg.widthPct}%`,
          height: "9px",
          background: color,
          borderRadius: "2px",
          opacity: 0.85,
        }}
        title={barTitle}
        onClick={() => openDetalle(profId, fila)}
        aria-label={`Ver detalle ${barTitle}`}
      />
    );
  };

  if (months.length === 0 && arbol.length === 0) {
    return (
      <div className="min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
        <SectionHeader
          number="06b"
          title="Gantt Profesionales"
          hint="Asignación de personas en el tiempo · Sin participación en equipo"
        />
        <div className="flex flex-col items-center justify-center py-[60px] text-center">
          <CalendarX className="mb-3 h-10 w-10 opacity-25 text-t300" />
          <p className="text-[13px] text-t300">No hay profesionales con entregables en equipo_entregable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
      <SectionHeader
        number="06b"
        title="Gantt Profesionales"
        hint={`Asignación de personas en el tiempo · ${arbol.length} profesionales · ${totalEntregables} entregables${months.length ? ` · ${months.length} meses` : ""}`}
      />

      <div
        className="mb-4 flex flex-wrap items-end gap-3 rounded-r12 border border-bdr bg-white px-4 py-3 shadow-sh1"
      >
        <FilterSelect
          label="Profesional"
          value={filtroProfesionalId}
          onChange={setFiltroProfesionalId}
          options={[
            { value: "", label: "Todos" },
            ...profesionales.map((p) => ({ value: p.id, label: p.nombre_completo })),
          ]}
        />
        <FilterSelect
          label="Cliente"
          value={filtroClienteId}
          onChange={(v) => {
            setFiltroClienteId(v);
            setFiltroProyectoId("");
          }}
          options={[
            { value: "", label: "Todos" },
            ...clientes.map((c) => ({ value: c.id, label: c.nombre })),
          ]}
        />
        <FilterSelect
          label="Proyecto"
          value={filtroProyectoId}
          onChange={setFiltroProyectoId}
          options={[
            { value: "", label: "Todos" },
            ...proyectosFiltrados.map((p) => ({
              value: p.id,
              label: `${p.codigo} — ${p.nombre}`,
            })),
          ]}
        />
        <FilterSelect
          label="Estado"
          value={filtroEstado}
          onChange={(v) => setFiltroEstado(v as GanttProfFiltroEstado)}
          options={[
            { value: "TODOS", label: "Todos" },
            { value: "POR_INICIAR", label: "Por iniciar" },
            { value: "EN_EJECUCION", label: "En ejecución" },
            { value: "COMPLETADO", label: "Completado" },
          ]}
        />
        <FilterSelect
          label="Rol"
          value={filtroRol}
          onChange={(v) => setFiltroRol(v as GanttProfFiltroRol)}
          options={[
            { value: "TODOS", label: "Todos" },
            { value: "LIDER", label: "Líder" },
            { value: "APOYO", label: "Apoyo" },
          ]}
        />
        <label className="flex min-w-[140px] cursor-pointer items-center gap-2 rounded-r6 border border-bdr bg-white px-3 py-2 sm:max-w-none">
          <input
            type="checkbox"
            checked={ocultarPorDefinir}
            onChange={(e) => setOcultarPorDefinir(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-bdr"
          />
          <span className="text-[12px] font-medium text-t700">Ocultar Por definir</span>
        </label>
        <label className="flex min-w-[140px] cursor-pointer items-center gap-2 rounded-r6 border border-bdr bg-white px-3 py-2 sm:max-w-none">
          <input
            type="checkbox"
            checked={mostrarSeya001}
            onChange={(e) => setMostrarSeya001(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-bdr"
          />
          <span className="text-[12px] font-medium text-t700">Mostrar SEYA001</span>
        </label>
      </div>

      <div
        className="flex flex-wrap items-center gap-3 rounded-t-[12px] border border-bdr border-b-0 px-[18px] py-3"
        style={{ background: "#F7F8FA" }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-r4 border border-bdr bg-white px-3 py-1 text-[11px] font-semibold text-t700 hover:bg-[#E0E7FF]"
            onClick={expandAll}
          >
            <Expand className="h-3 w-3" /> Expandir
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-r4 border border-bdr bg-white px-3 py-1 text-[11px] font-semibold text-t700 hover:bg-[#E0E7FF]"
            onClick={collapseAll}
          >
            <Minimize2 className="h-3 w-3" /> Colapsar
          </button>
        </div>
        <div className="ml-auto flex flex-wrap gap-3 text-[11px] text-t500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-5 rounded-sm" style={{ background: "#047857" }} /> Completado
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-5 rounded-sm" style={{ background: "#4F46E5" }} /> En ejecución
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-5 rounded-sm" style={{ background: "#475569" }} /> Por iniciar
          </span>
        </div>
      </div>

      {/* Móvil */}
      <div className="md:hidden">
        {arbol.length === 0 ? (
          <div className="rounded-b-[12px] border border-bdr bg-white px-6 py-10 text-center text-[12px] text-t500">
            Sin resultados para los filtros seleccionados.
          </div>
        ) : (
          <div className="space-y-3 rounded-b-[12px] border border-bdr bg-white p-3 shadow-sh1">
            {arbol.map((n) => {
              const open = expandedProf.has(n.profesional.id);
              const resumen = calcularResumenProfesionalGantt(n.entregables);
              return (
                <section key={n.profesional.id} className="overflow-hidden rounded-r10 border border-bdr">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 bg-surface2 px-3 py-2.5 text-left"
                    onClick={() => toggleProf(n.profesional.id)}
                  >
                    {open ? <ChevronDown className="h-4 w-4 text-t500" /> : <ChevronRight className="h-4 w-4 text-t500" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-t900">
                        {n.profesional.nombre_completo}
                        {esProfesionalPorDefinir(n.profesional.nombre_completo) ? (
                          <span className="ml-1 text-[10px] font-normal text-t500">(placeholder)</span>
                        ) : null}
                      </p>
                      <p className="text-[10px] text-t500">
                        {n.profesional.cargo} · {textoResumenFilaProfesionalGantt(resumen)}
                        {resumen.sinFechas > 0 ? ` · ${resumen.sinFechas} sin fechas` : ""}
                      </p>
                      {!open && resumen.fecha_inicio && resumen.fecha_termino ? (
                        <p className="mt-0.5 font-mono text-[10px] text-t600">
                          {formatGanttDateCL(resumen.fecha_inicio)} → {formatGanttDateCL(resumen.fecha_termino)}
                        </p>
                      ) : null}
                    </div>
                  </button>
                  {open ? (
                    <div className="space-y-2 border-t border-bdr p-2">
                      {n.entregables.map((f) => (
                        <button
                          type="button"
                          key={f.entregableId}
                          className="w-full rounded-r8 border border-bdr bg-white px-3 py-2.5 text-left hover:bg-surface2/80"
                          onClick={() => openDetalle(n.profesional.id, f)}
                        >
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
                            <dt className="text-t400">Entregable</dt>
                            <dd className="font-medium text-t900">{f.entregable.nombre}</dd>
                            <dt className="text-t400">Rol</dt>
                            <dd className="text-t800">{f.rolLabel}</dd>
                            <dt className="text-t400">Horas</dt>
                            <dd className="font-mono text-t800">{fmtHorasGanttProfesional(f.horasProf)} h</dd>
                            <dt className="text-t400">Incidencia</dt>
                            <dd className="font-mono text-t800">{fmtColaboracionEntregablePct(f.pctColaboracion)}</dd>
                            <dt className="text-t400">Estado</dt>
                            <dd>
                              <EstadoEjecucionBadge estado={f.estadoEjecucion} />
                            </dd>
                            <dt className="text-t400">Fechas RevP</dt>
                            <dd className="font-mono text-[10px] text-t600">
                              {f.sinFechasRevP ? (
                                <span className="inline-flex items-center gap-1 text-amber-800">
                                  <AlertTriangle className="h-3 w-3" />
                                  Sin fechas completas
                                </span>
                              ) : (
                                <>
                                  {formatGanttDateCL(f.fechasBarra.fecha_inicio)} →{" "}
                                  {formatGanttDateCL(f.fechasBarra.fecha_termino)}
                                </>
                              )}
                            </dd>
                          </dl>
                          <p className="mt-2 text-[10px] font-semibold text-indigo-700">Ver detalle</p>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Escritorio: columnas fijas + Gantt con scroll horizontal solo en timeline */}
      <div className="hidden md:block">
        {months.length === 0 ? (
          <div className="rounded-b-[12px] border border-bdr bg-amber-50 px-6 py-8 text-center text-[12px] text-amber-900">
            Hay entregables en equipo pero ninguno tiene fechas RevP completas para dibujar la carta.
          </div>
        ) : (
          <div className="overflow-hidden rounded-b-[12px] border border-bdr bg-white shadow-sh1">
            <div ref={scrollRef} className="overflow-x-auto">
              <div
                className="relative min-w-max"
                style={{
                  display: "grid",
                  gridTemplateColumns,
                }}
              >
                {/* Cabecera columnas */}
                <div
                  className="border-b-2 border-r border-bdr px-2 py-2 text-[9px] font-semibold uppercase tracking-wide text-t300"
                  style={{ ...stickyMetaCol(0, "#F7F8FA"), borderRightWidth: 2 }}
                >
                  Entregable
                </div>
                <div
                  className="border-b-2 border-r border-bdr px-2 py-2 text-center text-[9px] font-semibold uppercase tracking-wide text-t300"
                  style={stickyMetaCol(1, "#F7F8FA")}
                >
                  Rol
                </div>
                <div
                  className="border-b-2 border-r border-bdr px-2 py-2 text-right text-[9px] font-semibold uppercase tracking-wide text-t300"
                  style={stickyMetaCol(2, "#F7F8FA")}
                >
                  Hrs gastadas
                </div>
                <div
                  className="border-b-2 border-r border-bdr px-2 py-2 text-right text-[9px] font-semibold uppercase tracking-wide text-t300"
                  style={stickyMetaCol(3, "#F7F8FA")}
                >
                  Incidencia
                </div>
                <div
                  className="border-b-2 border-r-2 border-bdr border-r-[#C8CCDB] px-2 py-2 text-center text-[9px] font-semibold uppercase tracking-wide text-t300"
                  style={stickyMetaCol(4, "#F7F8FA")}
                >
                  Estado
                </div>
                {months.map((m) => (
                  <div
                    key={`hdr-${m.year}-${m.month}`}
                    className="flex items-center justify-center border-b-2 border-r border-bdr px-1 py-2"
                    style={{ background: m.isTodayMonth ? "#E0E7FF" : "#F7F8FA" }}
                  >
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: m.isTodayMonth ? "#4F46E5" : "#6B7280" }}
                    >
                      {m.label}
                    </span>
                  </div>
                ))}

                {todayLineOffset ? (
                  <div
                    className="pointer-events-none absolute top-0 z-20"
                    style={{
                      left: `${LEFT_COLUMNS_WIDTH + todayLineOffset.monthIndex * colWidth + (todayLineOffset.dayOffset / 100) * colWidth}px`,
                      width: "2px",
                      height: "100%",
                      background: "rgba(239,68,68,.6)",
                    }}
                  />
                ) : null}

                {arbol.map((n) => {
                  const profOpen = expandedProf.has(n.profesional.id);
                  const resumen = calcularResumenProfesionalGantt(n.entregables);
                  return (
                    <div key={n.profesional.id} style={{ display: "contents" }}>
                      {/* Fila madre profesional — columnas izquierdas unificadas */}
                      <div
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer border-b border-r-2 border-r-[#C8CCDB] border-bdr px-3 py-2"
                        style={{
                          gridColumn: "1 / 6",
                          ...stickyMetaCol(0, "#3730A3"),
                          color: "#E0E7FF",
                          width: LEFT_COLUMNS_WIDTH,
                          maxWidth: LEFT_COLUMNS_WIDTH,
                        }}
                        onClick={() => toggleProf(n.profesional.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleProf(n.profesional.id);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {profOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                          <span className="flex-1 text-[11px] font-semibold">{n.profesional.nombre_completo}</span>
                          <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[9px]">
                            {n.entregables.length}
                          </span>
                        </div>
                        <p className="mt-1 pl-5 text-[9px] text-indigo-200/90">
                          {textoResumenFilaProfesionalGantt(resumen)}
                          {resumen.sinFechas > 0 ? ` · ${resumen.sinFechas} sin fechas` : ""}
                        </p>
                      </div>
                      {months.map((m) => (
                        <div
                          key={`ph-${n.profesional.id}-${m.year}-${m.month}`}
                          className="relative border-b border-bdr"
                          style={{ background: profOpen ? "rgba(55,48,163,.10)" : "rgba(55,48,163,.20)" }}
                        >
                          {!profOpen ? renderResumenProfesional(n.entregables, m) : null}
                        </div>
                      ))}

                      {/* Subfilas entregables */}
                      {profOpen &&
                        n.entregables.map((f) => (
                          <div key={f.entregableId} style={{ display: "contents" }}>
                            <div
                              role="button"
                              tabIndex={0}
                              className="cursor-pointer border-b border-r border-bdr px-2 py-1.5 text-[10px] leading-snug text-t800"
                              style={stickyMetaCol(0, "#fff")}
                              title={`${f.labelLinea}${f.sinFechasRevP ? " · Sin fechas RevP completas" : ""}`}
                              onClick={() => openDetalle(n.profesional.id, f)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openDetalle(n.profesional.id, f);
                                }
                              }}
                            >
                              <span className="line-clamp-2 font-medium text-t900">{f.entregable.nombre}</span>
                              {f.sinFechasRevP ? (
                                <span className="mt-0.5 flex items-center gap-0.5 text-[9px] text-amber-800">
                                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                  Sin fechas RevP
                                </span>
                              ) : null}
                            </div>
                            <div
                              className="flex cursor-pointer items-center justify-center border-b border-r border-bdr px-1 py-1.5 text-[10px] text-t700"
                              style={stickyMetaCol(1, "#fff")}
                              onClick={() => openDetalle(n.profesional.id, f)}
                            >
                              {f.rolLabel}
                            </div>
                            <div
                              className="cursor-pointer border-b border-r border-bdr px-2 py-1.5 text-right font-mono text-[10px] tabular-nums text-t800"
                              style={stickyMetaCol(2, "#fff")}
                              onClick={() => openDetalle(n.profesional.id, f)}
                            >
                              {fmtHorasGanttProfesional(f.horasProf)} h
                            </div>
                            <div
                              className="cursor-pointer border-b border-r border-bdr px-2 py-1.5 text-right font-mono text-[10px] tabular-nums text-t800"
                              style={stickyMetaCol(3, "#fff")}
                              onClick={() => openDetalle(n.profesional.id, f)}
                            >
                              {fmtColaboracionEntregablePct(f.pctColaboracion)}
                            </div>
                            <div
                              className="flex cursor-pointer items-center justify-center border-b border-r-2 border-r-[#C8CCDB] border-bdr px-1 py-1.5"
                              style={stickyMetaCol(4, "#fff")}
                              onClick={() => openDetalle(n.profesional.id, f)}
                            >
                              <EstadoEjecucionBadge estado={f.estadoEjecucion} />
                            </div>
                            {months.map((m) => (
                              <div
                                key={`c-${f.entregableId}-${m.year}-${m.month}`}
                                className="relative min-h-[28px] cursor-pointer border-b border-bdr bg-white"
                                onClick={() => openDetalle(n.profesional.id, f)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openDetalle(n.profesional.id, f);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label={`Gantt ${f.entregable.nombre}`}
                              >
                                {renderBar(f, m, n.profesional.id)}
                              </div>
                            ))}
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <GanttProfesionalDetalleModal
        open={detalleOpen}
        onOpenChange={setDetalleOpen}
        detalle={detalleModal}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex min-w-[140px] flex-1 flex-col gap-1 sm:max-w-[200px]">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-t400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-r6 border border-bdr bg-white px-2 text-[12px] text-t800"
      >
        {options.map((o) => (
          <option key={o.value || "__all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
