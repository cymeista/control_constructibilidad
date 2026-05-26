import { useMemo, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X, Clock, FileEdit, Users, StickyNote, LayoutList } from "lucide-react";
import { useNavigate } from "react-router";
import SectionHeader from "@/components/SectionHeader";
import FilterBar from "@/components/FilterBar";
import KpiCard, { kpiCardsGridClassName6 } from "@/components/KpiCard";
import { MobileCardRow } from "@/components/formularios/EntityMobileCardRows";
import StatusPill, { entregableEstadoToStatusVariant } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EntregableRedistribuirHorasTrigger } from "@/components/EntregableRedistribuirHorasTrigger";
import EntregableNotaSeguimientoModal from "@/components/EntregableNotaSeguimientoModal";
import AsignacionesEntregableConsultaModal from "@/components/AsignacionesEntregableConsultaModal";
import { useAppData, type Profesional, type PmInterno } from "@/context/AppDataContext";
import { useAuth } from "@/security/AuthContext";
import { canViewRouteForSession, canEditNotas, canAsignar } from "@/security/permissions";
import {
  TOLERANCIA_GASTO_VS_AVANCE_PUNTOS,
  agregarTotalesKpiSinL2,
  construirAnalisisEntregablesVista,
  filtrarAnalisisVista,
  agruparClienteProyecto,
  entregableVisibleEnVistaActiva,
  type EntregableVistaAnalisis,
  type FiltroEstadoProyectoVista,
} from "@/proyectos/proyectosVistaReadModel";
import { historialRedistribucionPorEntregable } from "@/entregables/redistribucionHorasEntregable";

const fmtH = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtUF = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number | null) =>
  n == null ? "—" : `${n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtDate = (d: string | null) =>
  d && d.trim()
    ? new Date(d + "T12:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "2-digit" })
    : "—";

const EPS_DISPONIBLE = 1e-6;

function semaforoKpi(ratio: number, sobrePct: number): { color: string; tag: string } {
  if (sobrePct > 100 || ratio > 1.05) return { color: "#dc2626", tag: "Sobreconsumo" };
  if (ratio > 0.95 || sobrePct > 95) return { color: "#ca8a04", tag: "Atención" };
  return { color: "#16a34a", tag: "Normal" };
}

function formatearDispRefSinL2(disponible: number, unidad: "UF" | "h"): string {
  if (disponible < -EPS_DISPONIBLE) {
    const exceso = Math.abs(disponible);
    return unidad === "UF" ? `Sobreconsumo ${fmtUF(exceso)} UF` : `Sobreconsumo ${fmtH(exceso)} h`;
  }
  return unidad === "UF" ? `${fmtUF(disponible)} UF` : `${fmtH(disponible)} h`;
}

function lineaRefSinL2(
  disponible: number,
  presup: number,
  gastado: number,
  unidad: "UF" | "h",
): string {
  const disp = formatearDispRefSinL2(disponible, unidad);
  return unidad === "UF"
    ? `Ref. sin L2: Presup. ${fmtUF(presup)} · Gastadas ${fmtUF(gastado)} · Disp. ${disp}`
    : `Ref. sin L2: Presup. ${fmtH(presup)} · Gastadas ${fmtH(gastado)} · Disp. ${disp}`;
}

function kpiDisponiblePresentacion(
  disponible: number,
  presup: number,
  gastado: number,
  unidad: "UF" | "h",
  refSinL2?: { disponible: number; presup: number; gastado: number },
): {
  value: string;
  subtitle: string;
  secondaryLine?: string;
  topColor: string;
  tag?: string;
  tagColor?: string;
} {
  const subtitle =
    unidad === "UF"
      ? `Presup. total ${fmtUF(presup)} · Gastadas total ${fmtUF(gastado)}`
      : `Presup. total ${fmtH(presup)} · Gastadas total ${fmtH(gastado)}`;

  const secondaryLine = refSinL2
    ? lineaRefSinL2(refSinL2.disponible, refSinL2.presup, refSinL2.gastado, unidad)
    : undefined;

  if (disponible < -EPS_DISPONIBLE) {
    const exceso = Math.abs(disponible);
    return {
      value: unidad === "UF" ? `Sobreconsumo ${fmtUF(exceso)} UF` : `Sobreconsumo ${fmtH(exceso)} h`,
      subtitle,
      secondaryLine,
      topColor: "#dc2626",
      tag: "Sobreconsumo",
      tagColor: "#dc2626",
    };
  }

  return {
    value: unidad === "UF" ? `${fmtUF(disponible)} UF` : `${fmtH(disponible)} h`,
    subtitle,
    secondaryLine,
    topColor: disponible <= EPS_DISPONIBLE ? "#ca8a04" : "#16a34a",
    tag: disponible <= EPS_DISPONIBLE ? "Atención" : undefined,
    tagColor: disponible <= EPS_DISPONIBLE ? "#ca8a04" : undefined,
  };
}

function codigoFaseEntregable(e: { fase_codigo?: string; tarea_codigo?: string }): string {
  const f = (e.fase_codigo ?? "").trim();
  const t = (e.tarea_codigo ?? "").trim();
  if (f && t) return `${f} / ${t}`;
  return f || t || "";
}

function estadoProyectoLabel(e: string): string {
  switch (e) {
    case "ACTIVO":
      return "Activo";
    case "COMPLETADO":
      return "Completado";
    case "NO_INICIADO":
      return "No iniciado";
    case "SUSPENDIDO":
      return "Suspendido";
    default:
      return e;
  }
}

export default function Proyectos() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const puedeVerHoras = canViewRouteForSession(role, "/horas");
  const puedeVerFormularios = canViewRouteForSession(role, "/formularios");
  const puedeAsignar = role ? canAsignar(role) : false;
  const puedeEditarNotas = role ? canEditNotas(role) : false;
  const {
    clientes,
    proyectos,
    entregables,
    profesionales,
    registro_horas,
    asignaciones_horas,
    historial_redistribuciones_horas,
    pm_internos,
    updateEntregable,
  } = useAppData();

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoProyectoVista>("ACTIVO");
  const [filterCliente, setFilterCliente] = useState("todos");
  const [filterPm, setFilterPm] = useState("todos");
  const [filterLider, setFilterLider] = useState("todos");
  const [soloSobreconsumo, setSoloSobreconsumo] = useState(false);
  const [soloRedistribuidos, setSoloRedistribuidos] = useState(false);
  const [textoBuscar, setTextoBuscar] = useState("");

  const [openClientes, setOpenClientes] = useState<Set<string>>(new Set());
  const [openProyectos, setOpenProyectos] = useState<Set<string>>(new Set());
  const [drawerRow, setDrawerRow] = useState<EntregableVistaAnalisis | null>(null);
  const [notaEnt, setNotaEnt] = useState<EntregableVistaAnalisis | null>(null);
  const [asigModalRow, setAsigModalRow] = useState<EntregableVistaAnalisis | null>(null);

  const pmMap = useMemo(() => new Map(pm_internos.map((p: PmInterno) => [p.id, p])), [pm_internos]);
  const profMap = useMemo(() => new Map(profesionales.map((p: Profesional) => [p.id, p])), [profesionales]);

  const analisisBase = useMemo(
    () =>
      construirAnalisisEntregablesVista({
        clientes,
        proyectos,
        entregables,
        profesionales,
        registro_horas,
        asignaciones_horas,
        historial_redistribuciones_horas,
      }),
    [
      clientes,
      proyectos,
      entregables,
      profesionales,
      registro_horas,
      asignaciones_horas,
      historial_redistribuciones_horas,
    ],
  );

  const pmOptions = useMemo(() => {
    const base = [{ value: "todos", label: "Todos" }, { value: "__sin_pm__", label: "Sin PM asignado" }];
    const seen = new Set<string>();
    const byInterno: { value: string; label: string }[] = [];
    const byNombre: { value: string; label: string }[] = [];
    for (const p of proyectos) {
      const iid = (p.pm_interno_id ?? "").trim();
      const nom = (p.pm_nombre ?? "").trim();
      if (iid) {
        if (!seen.has(`i:${iid}`)) {
          seen.add(`i:${iid}`);
          const pm = pmMap.get(iid);
          byInterno.push({ value: iid, label: pm?.nombre ? `${pm.nombre} (${p.codigo})` : `PM ${iid}` });
        }
      } else if (nom) {
        const key = `nom:${nom}`;
        if (!seen.has(key)) {
          seen.add(key);
          byNombre.push({ value: key, label: `${nom} (nombre)` });
        }
      }
    }
    byInterno.sort((a, b) => a.label.localeCompare(b.label, "es"));
    byNombre.sort((a, b) => a.label.localeCompare(b.label, "es"));
    return [...base, ...byInterno, ...byNombre];
  }, [proyectos, pmMap]);

  const filasFiltradas = useMemo(() => {
    const paso1 = filtrarAnalisisVista(analisisBase, {
      filtroEstadoProyecto: filtroEstado,
      clienteId: filterCliente,
      pmKey: filterPm,
      liderId: filterLider,
      soloSobreconsumo,
      soloRedistribuidos,
      texto: textoBuscar,
    });
    return paso1.filter((r) => entregableVisibleEnVistaActiva(r, filtroEstado));
  }, [
    analisisBase,
    filtroEstado,
    filterCliente,
    filterPm,
    filterLider,
    soloSobreconsumo,
    soloRedistribuidos,
    textoBuscar,
  ]);

  const grouped = useMemo(() => agruparClienteProyecto(filasFiltradas), [filasFiltradas]);

  const kpis = useMemo(() => {
    const proyIds = new Set(filasFiltradas.map((r) => r.proyecto.id));
    const proyActivos = [...proyIds].filter((id) => proyectos.find((p) => p.id === id)?.estado === "ACTIVO").length;
    const proySobre = new Set(
      filasFiltradas.filter((r) => r.alertaSobreconsumoHoras).map((r) => r.proyecto.id),
    ).size;
    const entAlerta = filasFiltradas.filter(
      (r) => r.alertaSobreconsumoHoras || r.alertaGastoVsAvance || r.alertaSinAsignacion,
    ).length;
    const ufPres = filasFiltradas.reduce((s, r) => s + r.ufPresup, 0);
    const ufGas = filasFiltradas.reduce((s, r) => s + r.ufGasto, 0);
    const hPres = filasFiltradas.reduce((s, r) => s + r.horasPresupuesto, 0);
    const hGas = filasFiltradas.reduce((s, r) => s + r.horasGastadas, 0);
    const ratio = hPres > 0 ? hGas / hPres : 0;
    const pctGlobal = hPres > 0 ? (hGas / hPres) * 100 : null;
    const sem = semaforoKpi(ratio, pctGlobal ?? 0);
    const ufDisponibles = ufPres - ufGas;
    const horasDisponibles = hPres - hGas;
    const sinL2 = agregarTotalesKpiSinL2(filasFiltradas);
    const ufDispSinL2 = sinL2.ufPresup - sinL2.ufGasto;
    const horasDispSinL2 = sinL2.horasPresup - sinL2.horasGasto;
    const pctConsumoSinL2 = sinL2.horasPresup > 0 ? (sinL2.horasGasto / sinL2.horasPresup) * 100 : null;
    const ufKpi = kpiDisponiblePresentacion(ufDisponibles, ufPres, ufGas, "UF", {
      disponible: ufDispSinL2,
      presup: sinL2.ufPresup,
      gastado: sinL2.ufGasto,
    });
    const horasKpi = kpiDisponiblePresentacion(horasDisponibles, hPres, hGas, "h", {
      disponible: horasDispSinL2,
      presup: sinL2.horasPresup,
      gastado: sinL2.horasGasto,
    });
    const consumoSinL2Linea =
      sinL2.horasPresup > 0
        ? `Sin L2: ${fmtPct(pctConsumoSinL2)}`
        : "Sin L2: —";
    return {
      proyActivos,
      proySobre,
      entAlerta,
      ufPres,
      ufGas,
      hPres,
      hGas,
      ufDisponibles,
      horasDisponibles,
      pctGlobal,
      sem,
      ufKpi,
      horasKpi,
      consumoSinL2Linea,
      nProyectosVisibles: proyIds.size,
    };
  }, [filasFiltradas, proyectos]);

  const toggleSet = (set: Set<string>, id: string, next: boolean) => {
    const n = new Set(set);
    if (next) n.add(id);
    else n.delete(id);
    return n;
  };

  const guardarNota = useCallback(
    (entregableId: string, texto: string) => {
      if (!puedeEditarNotas) return;
      updateEntregable(entregableId, {
        nota_seguimiento: texto,
        nota_seguimiento_updated_at: new Date().toISOString(),
      });
    },
    [updateEntregable, puedeEditarNotas],
  );

  const goAsignacionesFiltrado = useCallback(
    (ctx: { clienteId: string; proyectoId: string; entregableId: string }) => {
      navigate(
        `/formularios?entity=asignaciones_horas&cliente_id=${encodeURIComponent(
          ctx.clienteId,
        )}&proyecto_id=${encodeURIComponent(ctx.proyectoId)}&entregable_id=${encodeURIComponent(ctx.entregableId)}`,
      );
    },
    [navigate],
  );

  const historialDrawer = useMemo(() => {
    if (!drawerRow) return [];
    return historialRedistribucionPorEntregable(historial_redistribuciones_horas ?? [], drawerRow.entregable.id).slice(0, 12);
  }, [drawerRow, historial_redistribuciones_horas]);

  return (
    <div className="animate-fade-in min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-10">
      <SectionHeader
        number="04"
        title="Proyectos · Vista ejecutiva"
        hint={`Cliente → Proyecto → Entregables. Gasto vs avance: +${TOLERANCIA_GASTO_VS_AVANCE_PUNTOS} pts. Umbrales alineados con Gestión de Horas.`}
      />

      <div className={`mb-4 ${kpiCardsGridClassName6}`}>
        <KpiCard
          label="Proyectos activos (vista)"
          value={String(kpis.proyActivos)}
          subtitle={`${kpis.nProyectosVisibles} proyecto(s) en el filtro actual`}
          topColor="#1e4a6e"
          tag="Estado ACTIVO"
          tagColor="#1e4a6e"
        />
        <KpiCard
          label="Proyectos con sobreconsumo"
          value={String(kpis.proySobre)}
          subtitle="Al menos un entregable con horas gastadas > presupuesto"
          topColor={kpis.proySobre > 0 ? "#dc2626" : "#16a34a"}
        />
        <KpiCard
          label="Entregables con alerta"
          value={String(kpis.entAlerta)}
          subtitle="Sobreconsumo, riesgo gasto vs avance o gasto sin asignación"
          topColor={kpis.entAlerta > 0 ? "#ca8a04" : "#16a34a"}
        />
        <KpiCard
          label="UF DISPONIBLES"
          value={kpis.ufKpi.value}
          subtitle={kpis.ufKpi.subtitle}
          secondaryLine={kpis.ufKpi.secondaryLine}
          topColor={kpis.ufKpi.topColor}
          tag={kpis.ufKpi.tag}
          tagColor={kpis.ufKpi.tagColor}
        />
        <KpiCard
          label="HORAS DISPONIBLES"
          value={kpis.horasKpi.value}
          subtitle={kpis.horasKpi.subtitle}
          secondaryLine={kpis.horasKpi.secondaryLine}
          topColor={kpis.horasKpi.topColor}
          tag={kpis.horasKpi.tag}
          tagColor={kpis.horasKpi.tagColor}
        />
        <KpiCard
          label="CONSUMO DE HORAS"
          value={fmtPct(kpis.pctGlobal)}
          subtitle={
            kpis.hPres > 0
              ? `${fmtH(kpis.hGas)} h gastadas de ${fmtH(kpis.hPres)} h`
              : "Sin horas presupuestadas en el filtro"
          }
          secondaryLine={kpis.consumoSinL2Linea}
          topColor={kpis.sem.color}
          tag={kpis.sem.tag}
          tagColor={kpis.sem.color}
        />
      </div>

      <FilterBar
        filters={[
          {
            key: "estado",
            label: "Estado proyecto",
            value: filtroEstado,
            onChange: (v) => setFiltroEstado(v as FiltroEstadoProyectoVista),
            options: [
              { value: "TODOS", label: "Todos" },
              { value: "ACTIVO", label: "Activos" },
              { value: "COMPLETADO", label: "Completados" },
              { value: "NO_INICIADO", label: "No iniciados" },
              { value: "SOLO_ALERTAS", label: "Solo con alertas" },
            ],
          },
          {
            key: "cliente",
            label: "Cliente",
            value: filterCliente,
            onChange: setFilterCliente,
            options: [{ value: "todos", label: "Todos" }, ...clientes.map((c) => ({ value: c.id, label: c.nombre }))],
          },
          {
            key: "pm",
            label: "PM",
            value: filterPm,
            onChange: setFilterPm,
            options: pmOptions,
          },
          {
            key: "lider",
            label: "Líder",
            value: filterLider,
            onChange: setFilterLider,
            options: [
              { value: "todos", label: "Todos" },
              ...profesionales.map((p) => ({ value: p.id, label: p.nombre_completo })),
            ],
          },
        ]}
      />

      <div className="mb-4 flex flex-col gap-4 rounded-r12 border border-bdr bg-surface/80 p-4 shadow-sh1 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-t400">Búsqueda</label>
          <input
            type="search"
            value={textoBuscar}
            onChange={(e) => setTextoBuscar(e.target.value)}
            placeholder="Cliente, proyecto o entregable…"
            className="w-full rounded-r8 border border-bdr bg-white px-3 py-2.5 text-[13px] text-t700 outline-none transition-all focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.15)]"
          />
        </div>
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
          <div className="flex items-center gap-2">
            <Switch id="sob" checked={soloSobreconsumo} onCheckedChange={setSoloSobreconsumo} />
            <Label htmlFor="sob" className="cursor-pointer text-[12px] text-t600">
              Solo con sobreconsumo
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="red" checked={soloRedistribuidos} onCheckedChange={setSoloRedistribuidos} />
            <Label htmlFor="red" className="cursor-pointer text-[12px] text-t600">
              Solo redistribuidos
            </Label>
          </div>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-r12 border border-dashed border-bdr bg-surface/50 py-16 text-center text-[13px] text-t500">
          No hay resultados con los filtros actuales.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map((bloque) => {
            const cid = bloque.cliente.id;
            const openC = openClientes.has(cid);
            return (
              <div
                key={cid}
                className="overflow-hidden rounded-r12 border border-bdr shadow-sh1"
                style={{
                  background: "linear-gradient(90deg, rgba(30,74,110,0.06) 0%, rgba(255,255,255,0.92) 48%, rgba(196,93,44,0.04) 100%)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenClientes(toggleSet(openClientes, cid, !openC))}
                  className="flex w-full items-start gap-3 border-b border-bdr/60 bg-white/40 px-4 py-3 text-left backdrop-blur-sm transition-colors hover:bg-white/70"
                >
                  <ChevronDown
                    size={20}
                    className={`mt-0.5 shrink-0 text-copper transition-transform ${openC ? "rotate-180" : ""}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-sans text-[15px] font-semibold text-t900">{bloque.cliente.nombre}</span>
                      <span className="rounded-r4 bg-[#1e4a6e]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1e4a6e]">
                        {bloque.proyectos.length} proyecto(s)
                      </span>
                      {bloque.nAlertas > 0 ? (
                        <span className="rounded-r4 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          {bloque.nAlertas} alerta(s)
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-t600">
                      <span>
                        UF {fmtUF(bloque.ufPresup)} / {fmtUF(bloque.ufGasto)}
                      </span>
                      <span>
                        Hrs {fmtH(bloque.horasPresup)} / {fmtH(bloque.horasGasto)}
                      </span>
                    </div>
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {openC ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-bdr/40 bg-white/30"
                    >
                      <div className="space-y-2 p-3 sm:p-4">
                        {bloque.proyectos.map((grp) => {
                          const pid = grp.proyecto.id;
                          const openP = openProyectos.has(pid);
                          const pmNombre =
                            (grp.proyecto.pm_interno_id && pmMap.get(grp.proyecto.pm_interno_id)?.nombre) ||
                            grp.proyecto.pm_nombre ||
                            "—";
                          const liderNom = grp.liderPrincipalId
                            ? profMap.get(grp.liderPrincipalId)?.nombre_completo ?? "—"
                            : "—";
                          return (
                            <div key={pid} className="overflow-hidden rounded-r10 border border-bdr/80 bg-surface shadow-sm">
                              <button
                                type="button"
                                onClick={() => setOpenProyectos(toggleSet(openProyectos, pid, !openP))}
                                className="flex w-full items-start gap-2 border-b border-bdr/50 bg-gradient-to-r from-[#f8fafc] to-white px-3 py-2.5 text-left hover:from-slate-50"
                              >
                                <ChevronDown
                                  size={18}
                                  className={`mt-0.5 shrink-0 text-t500 transition-transform ${openP ? "rotate-180" : ""}`}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[12px] font-semibold text-copper">{grp.proyecto.codigo}</span>
                                    <span className="text-[13px] font-semibold text-t800">{grp.proyecto.nombre}</span>
                                    <span className="rounded-r4 border border-bdr bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase text-t600">
                                      {estadoProyectoLabel(grp.proyecto.estado)}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[11px] text-t500">
                                    PM: {pmNombre} · Líder principal: {liderNom} ·{" "}
                                    {fmtDate(grp.fechaInicioMin)} → {fmtDate(grp.fechaTerminoMax)}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    {grp.flags.sobreconsumo ? (
                                      <span className="rounded-r4 border border-rose-500/35 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-rose-900">
                                        Sobreconsumo
                                      </span>
                                    ) : null}
                                    {grp.flags.redistribuido ? (
                                      <span className="rounded-r4 border border-teal-600/35 bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-teal-900">
                                        Redistribuido
                                      </span>
                                    ) : null}
                                    {grp.flags.enRiesgo ? (
                                      <span className="rounded-r4 border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-900">
                                        En riesgo
                                      </span>
                                    ) : null}
                                    {grp.flags.completado ? (
                                      <span className="rounded-r4 border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-indigo-900">
                                        Completado
                                      </span>
                                    ) : null}
                                    <span className="text-[10px] text-t500">
                                      {grp.nEntregables} entregable(s) · {grp.nEntregablesAlerta} con alerta
                                    </span>
                                  </div>
                                  <div className="mt-1 text-[10px] text-t600">
                                    UF {fmtUF(grp.ufPresup)} / {fmtUF(grp.ufGasto)} · Hrs {fmtH(grp.horasPresup)} /{" "}
                                    {fmtH(grp.horasGasto)}
                                  </div>
                                </div>
                              </button>
                              <AnimatePresence initial={false}>
                                {openP ? (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                  >
                                    <div className="space-y-2 border-t border-bdr/50 bg-slate-50/40 p-3 md:hidden">
                                      {grp.filas.map((row) => {
                                        const e = row.entregable;
                                        const pmRow =
                                          (grp.proyecto.pm_interno_id && pmMap.get(grp.proyecto.pm_interno_id)?.nombre) ||
                                          grp.proyecto.pm_nombre ||
                                          "—";
                                        const lid = profMap.get(e.lider_id)?.nombre_completo ?? "—";
                                        const codigo = codigoFaseEntregable(e);
                                        const cons = row.pctConsumoHoras;
                                        const consColor =
                                          cons != null && cons > 100
                                            ? "#B91C1C"
                                            : cons != null && cons > 95
                                              ? "#B45309"
                                              : undefined;
                                        return (
                                          <article
                                            key={e.id}
                                            className="overflow-hidden rounded-r10 border border-bdr bg-white shadow-sm"
                                          >
                                            <button
                                              type="button"
                                              className="w-full px-3 py-3 text-left"
                                              onClick={() => setDrawerRow(row)}
                                            >
                                              <p className="text-[13px] font-semibold text-[#1e4a6e]">{e.nombre}</p>
                                              {codigo ? <p className="mt-0.5 text-[10px] text-t500">{codigo}</p> : null}
                                              <div className="mt-1.5">
                                                <StatusPill
                                                  variant={entregableEstadoToStatusVariant(String(e.estado))}
                                                  labelOverride={String(e.estado)}
                                                />
                                              </div>
                                            </button>
                                            <div className="border-t border-bdr/80 px-3 pb-3">
                                              <div className="grid grid-cols-1 gap-y-2 py-2 sm:grid-cols-2">
                                                <MobileCardRow label="PM">{pmRow}</MobileCardRow>
                                                <MobileCardRow label="Líder">{lid}</MobileCardRow>
                                                <MobileCardRow label="Avance real">
                                                  <span className="font-mono">{fmtPct(row.avanceRealPct)}</span>
                                                </MobileCardRow>
                                                <MobileCardRow label="Avance teórico">
                                                  <span className="font-mono">{fmtPct(row.avanceTeoricoPct)}</span>
                                                </MobileCardRow>
                                                <MobileCardRow label="Presupuesto horas">
                                                  <span className="font-mono">{fmtH(row.horasPresupuesto)}</span>
                                                </MobileCardRow>
                                                <MobileCardRow label="Horas gastadas">
                                                  <span className="font-mono">{fmtH(row.horasGastadas)}</span>
                                                </MobileCardRow>
                                                <MobileCardRow label="Saldo h">
                                                  <span
                                                    className={`font-mono font-semibold ${row.saldoHoras < 0 ? "text-rose-700" : "text-t800"}`}
                                                  >
                                                    {fmtH(row.saldoHoras)}
                                                  </span>
                                                </MobileCardRow>
                                                <MobileCardRow label="Consumo %">
                                                  <span className="font-mono font-semibold" style={{ color: consColor }}>
                                                    {fmtPct(cons)}
                                                  </span>
                                                </MobileCardRow>
                                                <MobileCardRow label="UF p / g">
                                                  <span className="font-mono">
                                                    {fmtUF(row.ufPresup)} / {fmtUF(row.ufGasto)}
                                                  </span>
                                                </MobileCardRow>
                                              </div>
                                              <div className="flex flex-wrap gap-1.5 text-[10px]">
                                                {row.alertaSobreconsumoHoras ? (
                                                  <span className="rounded-r6 border border-rose-300 bg-rose-50 px-2 py-1 font-semibold text-rose-800">
                                                    Sobreconsumo
                                                  </span>
                                                ) : null}
                                                {row.alertaGastoVsAvance ? (
                                                  <span className="rounded-r6 border border-amber-300 bg-amber-50 px-2 py-1 font-semibold text-amber-800">
                                                    Riesgo gasto vs avance
                                                  </span>
                                                ) : null}
                                                {row.alertaSinAsignacion ? (
                                                  <span className="rounded-r6 border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-800">
                                                    Sin asignación
                                                  </span>
                                                ) : null}
                                                {row.redistribuido ? (
                                                  <span className="rounded-r6 border border-teal-300 bg-teal-50 px-2 py-1 font-semibold text-teal-800">
                                                    Redistribuido
                                                  </span>
                                                ) : null}
                                              </div>
                                              <div className="mt-3 flex flex-wrap gap-2 border-t border-bdr pt-3">
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="min-h-[44px] flex-1 gap-1 text-[12px]"
                                                  onClick={() => setDrawerRow(row)}
                                                >
                                                  Ver detalle
                                                </Button>
                                                {puedeVerHoras ? (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="min-h-[44px] gap-1 px-3 text-[12px]"
                                                    onClick={() => navigate("/horas")}
                                                  >
                                                    <Clock size={14} /> Horas
                                                  </Button>
                                                ) : null}
                                                {puedeAsignar ? (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="min-h-[44px] gap-1 px-3 text-[12px]"
                                                    onClick={() => setAsigModalRow(row)}
                                                  >
                                                    <Users size={14} /> Asignar
                                                  </Button>
                                                ) : null}
                                                {puedeEditarNotas ? (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="min-h-[44px] gap-1 px-3 text-[12px]"
                                                    onClick={() => setNotaEnt(row)}
                                                  >
                                                    <StickyNote size={14} /> Nota
                                                  </Button>
                                                ) : null}
                                                {puedeVerFormularios ? (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="min-h-[44px] gap-1 px-3 text-[12px]"
                                                    onClick={() =>
                                                      navigate(`/formularios?entity=entregables&focus=${encodeURIComponent(e.id)}`)
                                                    }
                                                  >
                                                    <FileEdit size={14} /> Formulario
                                                  </Button>
                                                ) : null}
                                                <div className="w-full [&_button]:min-h-[44px] [&_button]:w-full">
                                                  <EntregableRedistribuirHorasTrigger ent={e} dense showBadges={false} className="w-full" />
                                                </div>
                                              </div>
                                            </div>
                                          </article>
                                        );
                                      })}
                                    </div>
                                    <div className="hidden overflow-x-auto md:block">
                                    <table className="min-w-[1200px] w-full border-collapse text-left text-[11px]">
                                      <thead>
                                        <tr className="border-b border-bdr bg-slate-50/90 text-[9px] font-semibold uppercase tracking-wide text-t500">
                                          <th className="sticky left-0 z-[1] bg-slate-50/95 px-2 py-2">Entregable</th>
                                          <th className="px-2 py-2">PM</th>
                                          <th className="px-2 py-2">Líder</th>
                                          <th className="px-2 py-2">Av. real</th>
                                          <th className="px-2 py-2">Av. teórico</th>
                                          <th className="px-2 py-2">Estado</th>
                                          <th className="px-2 py-2">Rev. A</th>
                                          <th className="px-2 py-2">Rev. B</th>
                                          <th className="px-2 py-2">Rev. P</th>
                                          <th className="px-2 py-2">Inicio</th>
                                          <th className="px-2 py-2">Término</th>
                                          <th className="px-2 py-2">UF p/g</th>
                                          <th className="px-2 py-2">Hrs p/g</th>
                                          <th className="px-2 py-2">Saldo h</th>
                                          <th className="px-2 py-2">Consumo %</th>
                                          <th className="px-2 py-2">Alertas</th>
                                          <th className="px-2 py-2">Acciones</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {grp.filas.map((row) => {
                                          const e = row.entregable;
                                          const pmRow =
                                            (grp.proyecto.pm_interno_id && pmMap.get(grp.proyecto.pm_interno_id)?.nombre) ||
                                            grp.proyecto.pm_nombre ||
                                            "—";
                                          const lid = profMap.get(e.lider_id)?.nombre_completo ?? "—";
                                          const saldoStyle =
                                            row.saldoHoras < 0 ? "font-semibold text-rose-700" : "text-t700";
                                          const cons = row.pctConsumoHoras;
                                          const consStyle =
                                            cons != null && cons > 100
                                              ? "text-rose-700 font-semibold"
                                              : cons != null && cons > 95
                                                ? "text-amber-700 font-semibold"
                                                : "text-t700";
                                          return (
                                            <tr
                                              key={e.id}
                                              className="cursor-pointer border-b border-bdr/50 hover:bg-copper/[0.04]"
                                              onClick={() => setDrawerRow(row)}
                                            >
                                              <td
                                                className="sticky left-0 z-[1] bg-white/95 px-2 py-1.5 font-medium text-t800 shadow-[1px_0_0_0_rgba(15,23,42,0.06)]"
                                                onClick={(ev) => ev.stopPropagation()}
                                              >
                                                <button
                                                  type="button"
                                                  className="text-left text-[12px] font-semibold text-[#1e4a6e] underline-offset-2 hover:underline"
                                                  onClick={() => setDrawerRow(row)}
                                                >
                                                  {e.nombre}
                                                </button>
                                                {e.fase_codigo ? (
                                                  <span className="ml-1 text-[10px] text-t500">({e.fase_codigo})</span>
                                                ) : null}
                                              </td>
                                              <td className="px-2 py-1.5 text-t600">{pmRow}</td>
                                              <td className="px-2 py-1.5 text-t600">{lid}</td>
                                              <td className="px-2 py-1.5 tabular-nums">{fmtPct(row.avanceRealPct)}</td>
                                              <td className="px-2 py-1.5 tabular-nums">{fmtPct(row.avanceTeoricoPct)}</td>
                                              <td className="px-2 py-1.5">
                                                <StatusPill
                                                  variant={entregableEstadoToStatusVariant(String(e.estado))}
                                                  labelOverride={String(e.estado)}
                                                  className="max-w-[140px]"
                                                />
                                              </td>
                                              <td className="px-2 py-1.5 text-t600">{fmtDate(e.fecha_revA)}</td>
                                              <td className="px-2 py-1.5 text-t600">{fmtDate(e.fecha_revB)}</td>
                                              <td className="px-2 py-1.5 text-t600">{fmtDate(e.fecha_revP)}</td>
                                              <td className="px-2 py-1.5 text-t600">{fmtDate(e.fecha_inicio)}</td>
                                              <td className="px-2 py-1.5 text-t600">{fmtDate(e.fecha_termino)}</td>
                                              <td className="px-2 py-1.5 tabular-nums text-t700">
                                                {fmtUF(row.ufPresup)} / {fmtUF(row.ufGasto)}
                                              </td>
                                              <td className="px-2 py-1.5 tabular-nums text-t700">
                                                {fmtH(row.horasPresupuesto)} / {fmtH(row.horasGastadas)}
                                              </td>
                                              <td className={`px-2 py-1.5 tabular-nums ${saldoStyle}`}>{fmtH(row.saldoHoras)}</td>
                                              <td className={`px-2 py-1.5 tabular-nums ${consStyle}`}>{fmtPct(cons)}</td>
                                              <td className="px-2 py-1.5">
                                                <div className="flex flex-wrap gap-0.5">
                                                  {row.alertaSobreconsumoHoras ? (
                                                    <span className="rounded-r4 bg-rose-500/15 px-1 py-0.5 text-[8px] font-bold uppercase text-rose-900">
                                                      Sobreconsumo
                                                    </span>
                                                  ) : null}
                                                  {row.alertaGastoVsAvance ? (
                                                    <span className="rounded-r4 bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold uppercase text-amber-900">
                                                      Riesgo
                                                    </span>
                                                  ) : null}
                                                  {row.alertaSinAsignacion ? (
                                                    <span className="rounded-r4 bg-slate-500/15 px-1 py-0.5 text-[8px] font-bold uppercase text-slate-800">
                                                      Sin asign.
                                                    </span>
                                                  ) : null}
                                                  {row.redistribuido ? (
                                                    <span className="rounded-r4 bg-teal-500/15 px-1 py-0.5 text-[8px] font-bold uppercase text-teal-900">
                                                      Redist.
                                                    </span>
                                                  ) : null}
                                                </div>
                                              </td>
                                              <td className="px-2 py-1.5" onClick={(ev) => ev.stopPropagation()}>
                                                <div className="flex flex-col gap-1">
                                                  <div className="flex flex-wrap gap-1">
                                                    {puedeVerHoras ? (
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-1.5 text-[9px]"
                                                        title="Gestión de Horas"
                                                        onClick={() => navigate("/horas")}
                                                      >
                                                        <Clock size={12} />
                                                      </Button>
                                                    ) : null}
                                                    {puedeAsignar ? (
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-1.5 text-[9px]"
                                                        title="Asignaciones"
                                                        onClick={() => setAsigModalRow(row)}
                                                      >
                                                        <Users size={12} />
                                                      </Button>
                                                    ) : null}
                                                    {puedeEditarNotas ? (
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-1.5 text-[9px]"
                                                        title="Nota"
                                                        onClick={() => setNotaEnt(row)}
                                                      >
                                                        <StickyNote size={12} />
                                                      </Button>
                                                    ) : null}
                                                    {puedeVerFormularios ? (
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-1.5 text-[9px]"
                                                        title="Formulario entregable"
                                                        onClick={() =>
                                                          navigate(`/formularios?entity=entregables&focus=${encodeURIComponent(e.id)}`)
                                                        }
                                                      >
                                                        <FileEdit size={12} />
                                                      </Button>
                                                    ) : null}
                                                  </div>
                                                  <EntregableRedistribuirHorasTrigger ent={e} dense className="justify-start" />
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                    </div>
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {drawerRow ? (
          <>
            <motion.button
              type="button"
              aria-label="Cerrar panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/25 backdrop-blur-[1px]"
              onClick={() => setDrawerRow(null)}
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="fixed inset-0 z-[210] flex flex-col bg-surface shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-full md:max-w-lg md:border-l md:border-bdr"
            >
              <div className="flex items-start justify-between gap-2 border-b border-bdr px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-t400">Entregable</p>
                  <h2 className="mt-0.5 font-sans text-[16px] font-semibold leading-snug text-t900">
                    {drawerRow.entregable.nombre}
                  </h2>
                  <p className="mt-1 text-[11px] text-t500">
                    {drawerRow.cliente.nombre} · {drawerRow.proyecto.codigo} {drawerRow.proyecto.nombre}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => setDrawerRow(null)}>
                  <X size={18} />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 text-[12px] md:pb-3">
                <div className="rounded-r10 border border-bdr bg-white/80 p-3">
                  <p className="text-[10px] font-semibold uppercase text-t400">Resumen</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    <dt className="text-t500">Fase / código</dt>
                    <dd className="text-t800">
                      {[drawerRow.entregable.fase_codigo, drawerRow.entregable.tarea_codigo].filter(Boolean).join(" · ") || "—"}
                    </dd>
                    <dt className="text-t500">PM</dt>
                    <dd className="text-t800">
                      {(drawerRow.proyecto.pm_interno_id && pmMap.get(drawerRow.proyecto.pm_interno_id)?.nombre) ||
                        drawerRow.proyecto.pm_nombre ||
                        "—"}
                    </dd>
                    <dt className="text-t500">Líder</dt>
                    <dd className="text-t800">{profMap.get(drawerRow.entregable.lider_id)?.nombre_completo ?? "—"}</dd>
                    <dt className="text-t500">Estado</dt>
                    <dd>
                      <StatusPill
                        variant={entregableEstadoToStatusVariant(String(drawerRow.entregable.estado))}
                        labelOverride={String(drawerRow.entregable.estado)}
                      />
                    </dd>
                    <dt className="text-t500">Fechas</dt>
                    <dd className="text-t800">
                      {fmtDate(drawerRow.entregable.fecha_inicio)} → {fmtDate(drawerRow.entregable.fecha_termino)}
                    </dd>
                    <dt className="text-t500">Revisiones A/B/P</dt>
                    <dd className="text-t800">
                      {fmtDate(drawerRow.entregable.fecha_revA)} · {fmtDate(drawerRow.entregable.fecha_revB)} ·{" "}
                      {fmtDate(drawerRow.entregable.fecha_revP)}
                    </dd>
                    <dt className="text-t500">UF presup. / gasto</dt>
                    <dd className="tabular-nums text-t800">
                      {fmtUF(drawerRow.ufPresup)} / {fmtUF(drawerRow.ufGasto)}
                    </dd>
                    <dt className="text-t500">Horas presup. / gasto</dt>
                    <dd className="min-w-0 space-y-1.5">
                      <div className="tabular-nums text-t800">
                        {fmtH(drawerRow.horasPresupuesto)} / {fmtH(drawerRow.horasGastadas)}
                      </div>
                      <table className="w-full border-collapse rounded-r6 border border-bdr/80 text-[10px]">
                        <thead>
                          <tr className="border-b border-bdr bg-slate-50/90 text-[9px] font-semibold uppercase text-t500">
                            <th className="px-1.5 py-1 text-left">Cat.</th>
                            <th className="px-1.5 py-1 text-right">Presup.</th>
                            <th className="px-1.5 py-1 text-right">Gasto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drawerRow.horasPorCategoria.map((fila) => (
                            <tr key={fila.categoria} className="border-b border-bdr/50 last:border-b-0">
                              <td className="px-1.5 py-1 font-medium text-t700">{fila.categoria}</td>
                              <td className="px-1.5 py-1 text-right tabular-nums text-t800">{fmtH(fila.horasPresupuesto)}</td>
                              <td className="px-1.5 py-1 text-right tabular-nums text-t800">{fmtH(fila.horasGastadas)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </dd>
                    <dt className="text-t500">Saldo horas</dt>
                    <dd className={`tabular-nums ${drawerRow.saldoHoras < 0 ? "font-semibold text-rose-700" : "text-t800"}`}>
                      {fmtH(drawerRow.saldoHoras)}
                    </dd>
                    <dt className="text-t500">Alertas activas</dt>
                    <dd className="flex flex-wrap gap-1">
                      {drawerRow.alertaSobreconsumoHoras ? (
                        <span className="rounded-r4 bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-900">
                          Sobreconsumo horas
                        </span>
                      ) : null}
                      {drawerRow.alertaGastoVsAvance ? (
                        <span className="rounded-r4 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                          Gasto vs avance (+{TOLERANCIA_GASTO_VS_AVANCE_PUNTOS} pts)
                        </span>
                      ) : null}
                      {drawerRow.alertaSinAsignacion ? (
                        <span className="rounded-r4 bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-800">
                          Gasto sin asignación
                        </span>
                      ) : null}
                      {drawerRow.redistribuido ? (
                        <span className="rounded-r4 bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-teal-900">
                          Redistribuido
                        </span>
                      ) : null}
                      {!drawerRow.alertaSobreconsumoHoras &&
                      !drawerRow.alertaGastoVsAvance &&
                      !drawerRow.alertaSinAsignacion &&
                      !drawerRow.redistribuido ? (
                        <span className="text-t500">Ninguna</span>
                      ) : null}
                    </dd>
                  </dl>
                  {drawerRow.entregable.nota_seguimiento ? (
                    <p className="mt-3 rounded-r8 border border-bdr/80 bg-amber-50/50 p-2 text-[11px] text-t700">
                      <span className="font-semibold text-t600">Nota: </span>
                      {drawerRow.entregable.nota_seguimiento}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-t400">
                    <Users size={14} /> Personas
                  </p>
                  <div className="mt-2 overflow-x-auto rounded-r10 border border-bdr">
                    <table className="w-full min-w-[400px] border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-bdr bg-slate-50 text-[9px] font-semibold uppercase text-t500">
                          <th className="px-2 py-1.5 text-left">Profesional</th>
                          <th className="px-2 py-1.5 text-left">Rol</th>
                          <th className="px-2 py-1.5 text-left">Cat.</th>
                          <th className="px-2 py-1.5 text-right">Hrs trab.</th>
                          <th className="px-2 py-1.5 text-right">Hrs asign. (act./cerr.)</th>
                          <th className="px-2 py-1.5 text-left">Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drawerRow.participantes.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-2 py-3 text-center text-t500">
                              Sin participantes registrados.
                            </td>
                          </tr>
                        ) : (
                          drawerRow.participantes.map((p) => (
                            <tr key={p.profesional.id} className="border-b border-bdr/60">
                              <td className="px-2 py-1.5 font-medium text-t800">{p.profesional.nombre_completo}</td>
                              <td className="px-2 py-1.5 text-t600">{p.rol}</td>
                              <td className="px-2 py-1.5 text-t600">{p.categoria}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-t800">{fmtH(p.horasTrabajadas)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-t700">
                                {fmtH(p.horasAsignadasActivas)} / {fmtH(p.horasAsignadasCerradas)}
                              </td>
                              <td className="px-2 py-1.5 text-t600">{p.observacion || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-semibold uppercase text-t400">Historial redistribuciones</p>
                  {historialDrawer.length === 0 ? (
                    <p className="mt-1 text-[11px] text-t500">Sin movimientos registrados.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {historialDrawer.map((h) => (
                        <li key={h.id} className="rounded-r8 border border-bdr bg-white/90 p-2 text-[11px]">
                          <div className="flex flex-wrap justify-between gap-1 font-semibold text-t800">
                            <span>{fmtDate(h.fecha)}</span>
                            <span className="tabular-nums text-t600">
                              ΔUF {h.diferencia_uf >= 0 ? "+" : ""}
                              {fmtUF(h.diferencia_uf)}
                            </span>
                          </div>
                          {h.comentario ? <p className="mt-1 text-t600">{h.comentario}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-bdr pt-3 pb-2">
                  {puedeVerHoras ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] gap-1 text-[11px] md:min-h-0"
                      onClick={() => navigate("/horas")}
                    >
                      <Clock size={14} /> Gestión de Horas
                    </Button>
                  ) : null}
                  {puedeAsignar ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] gap-1 text-[11px] md:min-h-0"
                      onClick={() => setAsigModalRow(drawerRow)}
                    >
                      <Users size={14} /> Asignaciones
                    </Button>
                  ) : null}
                  {puedeEditarNotas ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] gap-1 text-[11px] md:min-h-0"
                      onClick={() => setNotaEnt(drawerRow)}
                    >
                      <StickyNote size={14} /> {puedeEditarNotas ? "Nota" : "Ver nota"}
                    </Button>
                  ) : null}
                  {puedeVerFormularios ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] gap-1 text-[11px] md:min-h-0"
                      onClick={() =>
                        navigate(
                          `/formularios?entity=entregables&focus=${encodeURIComponent(drawerRow.entregable.id)}`,
                        )
                      }
                    >
                      <LayoutList size={14} /> Detalle formulario
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2">
                  <EntregableRedistribuirHorasTrigger ent={drawerRow.entregable} />
                </div>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <AsignacionesEntregableConsultaModal
        open={asigModalRow != null}
        entregable={asigModalRow?.entregable ?? null}
        proyecto={asigModalRow?.proyecto ?? null}
        onClose={() => setAsigModalRow(null)}
        onGoAsignaciones={goAsignacionesFiltrado}
      />

      <EntregableNotaSeguimientoModal
        open={notaEnt != null}
        entregable={notaEnt?.entregable ?? null}
        clienteNombre={notaEnt?.cliente.nombre ?? ""}
        proyectoNombre={notaEnt ? `${notaEnt.proyecto.codigo} · ${notaEnt.proyecto.nombre}` : ""}
        onClose={() => setNotaEnt(null)}
        onSave={guardarNota}
      />
    </div>
  );
}
