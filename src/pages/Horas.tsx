import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, AlertTriangle, ExternalLink } from "lucide-react";
import { useNavigate, type NavigateFunction } from "react-router";
import { useAppData } from "@/context/AppDataContext";
import SectionHeader from "@/components/SectionHeader";
import KpiCard, { kpiCardsGridClassName } from "@/components/KpiCard";
import FilterBar from "@/components/FilterBar";
import StatusPill, { entregableEstadoToStatusVariant } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { MobileCardRow } from "@/components/formularios/EntityMobileCardRows";
import type { AsignacionHoraCategoria, Cliente, Entregable, Profesional, Proyecto } from "@/context/AppDataContext";
import { buildConsumoMaps } from "@/entregables/asignacionHoraConsumo";
import { esRegistroConsumoRealValido } from "@/entregables/registroHoraConsumo";
import { EntregableRedistribuirHorasTrigger } from "@/components/EntregableRedistribuirHorasTrigger";
import { useAuth } from "@/security/AuthContext";
import { canAsignar, canViewRouteForSession } from "@/security/permissions";
import {
  entregablePasaFiltroActivosGestionHoras,
  estadoNormalizadoEntregableGestionHoras,
} from "@/entregables/entregableGestionHorasFiltros";

const TOLERANCIA_GASTO_VS_AVANCE_PUNTOS = 20;
const CATEGORIAS: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];

type ProfBreakdown = {
  profesional: Profesional;
  categoria: AsignacionHoraCategoria;
  rol: "LIDER" | "APOYO" | "SIN_ROL";
  horasPresupuestoCategoria: number;
  horasGastadas: number;
  sinAsignacion: boolean;
  alertaSobreconsumoCategoria: boolean;
};

type EntregableAnalisis = {
  cliente: Cliente;
  proyecto: Proyecto;
  entregable: Entregable;
  horasPresupuesto: number;
  horasGastadas: number;
  pctHorasGastadas: number | null;
  avanceRealPct: number;
  avanceTeoricoPct: number;
  diferenciaGastoVsAvance: number | null;
  sobreconsumoHoras: number;
  sobreconsumoPct: number | null;
  alertaSobreconsumo: boolean;
  alertaGastoVsAvance: boolean;
  alertaSinAsignacion: boolean;
  professionals: ProfBreakdown[];
};

const fmtH = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtP = (n: number) => `${n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function toPct(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 1) return Math.max(0, x * 100);
  return Math.max(0, x);
}

function toCategoria(cargo: string): AsignacionHoraCategoria {
  return CATEGORIAS.includes(cargo as AsignacionHoraCategoria) ? (cargo as AsignacionHoraCategoria) : "P4";
}

function nivelSemaforo(row: EntregableAnalisis): "normal" | "atencion" | "critico" {
  if (row.alertaSobreconsumo || (row.diferenciaGastoVsAvance ?? 0) > 35) return "critico";
  if (row.alertaGastoVsAvance || (row.pctHorasGastadas ?? 0) > 100) return "atencion";
  return "normal";
}

function presupuestoCategoriaEntregable(ent: Entregable, cat: AsignacionHoraCategoria): number {
  switch (cat) {
    case "L2":
      return Number(ent.hrs_l2);
    case "P4":
      return Number(ent.hrs_p4);
    case "P3":
      return Number(ent.hrs_p3);
    case "P2":
      return Number(ent.hrs_p2);
    default:
      return 0;
  }
}

function nombrePmProyecto(pr: Proyecto): string {
  const n = (pr.pm_nombre ?? "").trim();
  return n || "—";
}

function codigoFaseEntregable(ent: Entregable): string {
  const f = (ent.fase_codigo ?? "").trim();
  const t = (ent.tarea_codigo ?? "").trim();
  if (f && t) return `${f} / ${t}`;
  return f || t || "";
}

function irFormulariosAsignacion(row: EntregableAnalisis, navigate: NavigateFunction) {
  navigate(
    `/formularios?entity=asignaciones_horas&cliente_id=${encodeURIComponent(row.cliente.id)}&proyecto_id=${encodeURIComponent(row.proyecto.id)}&entregable_id=${encodeURIComponent(row.entregable.id)}`,
  );
}

function irFormulariosNormalizar(row: EntregableAnalisis, navigate: NavigateFunction) {
  const sinAsig = row.professionals.find((p) => p.sinAsignacion);
  const params = new URLSearchParams({
    entity: "asignaciones_horas",
    cliente_id: row.cliente.id,
    proyecto_id: row.proyecto.id,
    entregable_id: row.entregable.id,
  });
  if (sinAsig) {
    params.set("profesional_id", sinAsig.profesional.id);
    params.set("horas", String(sinAsig.horasGastadas));
  }
  navigate(`/formularios?${params.toString()}`);
}

function EntregableAccionesHoras({
  row,
  puedeVerFormularios,
  puedeAsignar,
  navigate,
  touchFriendly,
}: {
  row: EntregableAnalisis;
  puedeVerFormularios: boolean;
  puedeAsignar: boolean;
  navigate: NavigateFunction;
  touchFriendly?: boolean;
}) {
  const btn = touchFriendly
    ? "min-h-[44px] flex-1 rounded-r8 px-3 py-2.5 text-[12px] font-semibold"
    : "min-h-[40px] flex-1 rounded-r8 px-3 py-2 text-[11px] font-semibold";
  return (
    <div className={`flex flex-wrap gap-2 ${touchFriendly ? "pt-1" : "mt-2"}`}>
      {puedeAsignar ? (
        <Button type="button" variant="outline" className={`${btn} gap-1 border-bdr`} onClick={() => irFormulariosAsignacion(row, navigate)}>
          Asignar
        </Button>
      ) : null}
      <div className="flex min-h-[40px] flex-1 items-stretch [&_button]:min-h-[40px] [&_button]:w-full">
        <EntregableRedistribuirHorasTrigger ent={row.entregable} dense showBadges={false} className="w-full" />
      </div>
      {puedeVerFormularios && row.alertaSinAsignacion ? (
        <Button type="button" variant="outline" className={`${btn} gap-1 border-bdr`} onClick={() => irFormulariosNormalizar(row, navigate)}>
          Normalizar
        </Button>
      ) : null}
      {puedeVerFormularios ? (
        <Button
          type="button"
          variant="outline"
          className={`${btn} gap-1 border-bdr`}
          onClick={() =>
            navigate(`/formularios?entity=entregables&focus=${encodeURIComponent(row.entregable.id)}`)
          }
        >
          Formularios <ExternalLink size={12} />
        </Button>
      ) : null}
    </div>
  );
}

export default function Horas() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const puedeVerFormularios = canViewRouteForSession(role, "/formularios");
  const puedeAsignar = role ? canAsignar(role) : false;
  const {
    clientes,
    proyectos,
    entregables,
    profesionales,
    registro_horas,
    asignaciones_horas,
  } = useAppData();

  const [filterClient, setFilterClient] = useState("todos");
  const [filterProject, setFilterProject] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("ACTIVOS");
  const [filterAlerta, setFilterAlerta] = useState("TODOS");

  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedDeliverables, setExpandedDeliverables] = useState<Set<string>>(new Set());

  const clientMap = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const projMap = useMemo(() => new Map(proyectos.map((p) => [p.id, p])), [proyectos]);
  const profMap = useMemo(() => new Map(profesionales.map((p) => [p.id, p])), [profesionales]);

  const registrosDirectosValidos = useMemo(() => {
    const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);
    return registro_horas.filter((r) => esRegistroConsumoRealValido(r, entById, projById, profById));
  }, [registro_horas, entregables, proyectos, profesionales]);

  const horasGastadasPorEntregableYProf = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const r of registrosDirectosValidos) {
      const eid = (r.entregable_id ?? "").trim();
      const pid = (r.profesional_id ?? "").trim();
      if (!eid || !pid) continue;
      if (!out.has(eid)) out.set(eid, new Map());
      const m = out.get(eid)!;
      m.set(pid, (m.get(pid) ?? 0) + Number(r.horas));
    }
    return out;
  }, [registrosDirectosValidos]);


  const filas = useMemo<EntregableAnalisis[]>(() => {
    const result: EntregableAnalisis[] = [];
    for (const ent of entregables) {
      const pr = projMap.get(ent.proyecto_id);
      if (!pr) continue;
      const cl = clientMap.get(pr.cliente_id);
      if (!cl) continue;

      const horasPresupuesto = Number(ent.hrs_l2) + Number(ent.hrs_p4) + Number(ent.hrs_p3) + Number(ent.hrs_p2);
      const horasGastadas = (registrosDirectosValidos
        .filter((r) => (r.entregable_id ?? "").trim() === ent.id)
        .reduce((s, r) => s + Number(r.horas), 0));
      const pctHorasGastadas = horasPresupuesto > 0 ? (horasGastadas / horasPresupuesto) * 100 : null;
      const avanceRealPct = toPct(Number(ent.avance_real));
      const avanceTeoricoPct = toPct(Number(ent.avance_teorico));
      const diferenciaGastoVsAvance = pctHorasGastadas == null ? null : pctHorasGastadas - avanceRealPct;
      const sobreconsumoHoras = horasGastadas - horasPresupuesto;
      const sobreconsumoPct =
        horasPresupuesto > 0 && sobreconsumoHoras > 0 ? (sobreconsumoHoras / horasPresupuesto) * 100 : null;
      const alertaSobreconsumo = horasPresupuesto > 0 && horasGastadas > horasPresupuesto;
      const alertaGastoVsAvance =
        pctHorasGastadas != null && pctHorasGastadas > avanceRealPct + TOLERANCIA_GASTO_VS_AVANCE_PUNTOS;

      const gastoProf = horasGastadasPorEntregableYProf.get(ent.id) ?? new Map<string, number>();
      const asigsEnt = asignaciones_horas.filter((a) => a.entregable_id === ent.id);
      const pids = new Set<string>([...gastoProf.keys(), ...asigsEnt.map((a) => a.profesional_id)]);
      const gastoCategoria = new Map<AsignacionHoraCategoria, number>([
        ["L2", 0],
        ["P4", 0],
        ["P3", 0],
        ["P2", 0],
      ]);
      gastoProf.forEach((h, pid) => {
        const prof = profMap.get(pid);
        if (!prof) return;
        const cat = toCategoria(prof.cargo);
        gastoCategoria.set(cat, (gastoCategoria.get(cat) ?? 0) + h);
      });

      const professionals: ProfBreakdown[] = [...pids]
        .map((pid) => {
          const p = profMap.get(pid);
          if (!p) return null;
          const asigsProfEnt = asigsEnt.filter((a) => a.profesional_id === pid);
          const rol = asigsProfEnt.some((a) => a.rol_en_entregable === "LIDER")
            ? "LIDER"
            : asigsProfEnt.some((a) => a.rol_en_entregable === "APOYO")
              ? "APOYO"
              : "SIN_ROL";
          const horasGastadasProf = gastoProf.get(pid) ?? 0;
          const categoria = toCategoria(p.cargo);
          const presupuestoCat = presupuestoCategoriaEntregable(ent, categoria);
          const sobreconsumoCategoria = (gastoCategoria.get(categoria) ?? 0) > presupuestoCat + 1e-9;
          const sinAsignacion = horasGastadasProf > 0 && asigsProfEnt.length === 0;
          return {
            profesional: p,
            categoria,
            rol,
            horasPresupuestoCategoria: presupuestoCat,
            horasGastadas: horasGastadasProf,
            sinAsignacion,
            alertaSobreconsumoCategoria: sobreconsumoCategoria,
          } satisfies ProfBreakdown;
        })
        .filter((x): x is ProfBreakdown => x != null)
        .filter((x) => x.horasGastadas > 0)
        .sort((a, b) => a.profesional.nombre_completo.localeCompare(b.profesional.nombre_completo, "es"));

      const alertaSinAsignacion = professionals.some((p) => p.sinAsignacion);
      result.push({
        cliente: cl,
        proyecto: pr,
        entregable: ent,
        horasPresupuesto,
        horasGastadas,
        pctHorasGastadas,
        avanceRealPct,
        avanceTeoricoPct,
        diferenciaGastoVsAvance,
        sobreconsumoHoras,
        sobreconsumoPct,
        alertaSobreconsumo,
        alertaGastoVsAvance,
        alertaSinAsignacion,
        professionals,
      });
    }
    return result;
  }, [
    entregables,
    projMap,
    clientMap,
    registrosDirectosValidos,
    horasGastadasPorEntregableYProf,
    asignaciones_horas,
    profMap,
  ]);

  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      if (filterClient !== "todos" && f.cliente.id !== filterClient) return false;
      if (filterProject !== "todos" && f.proyecto.id !== filterProject) return false;
      const est = estadoNormalizadoEntregableGestionHoras(f.entregable.estado);
      if (filterStatus === "ACTIVOS" && !entregablePasaFiltroActivosGestionHoras(f.entregable)) return false;
      if (filterStatus !== "ACTIVOS" && filterStatus !== "TODOS") {
        if (est !== filterStatus) return false;
      }
      if (filterAlerta === "SOLO_ALERTA") {
        if (!(f.alertaSobreconsumo || f.alertaGastoVsAvance || f.alertaSinAsignacion)) return false;
      }
      return true;
    });
  }, [filas, filterClient, filterProject, filterStatus, filterAlerta]);

  const grouped = useMemo(() => {
    const byClient = new Map<string, { client: Cliente; projects: Map<string, { project: Proyecto; rows: EntregableAnalisis[] }> }>();
    for (const row of filasFiltradas) {
      if (!byClient.has(row.cliente.id)) byClient.set(row.cliente.id, { client: row.cliente, projects: new Map() });
      const c = byClient.get(row.cliente.id)!;
      if (!c.projects.has(row.proyecto.id)) c.projects.set(row.proyecto.id, { project: row.proyecto, rows: [] });
      c.projects.get(row.proyecto.id)!.rows.push(row);
    }
    return [...byClient.values()]
      .map((c) => ({
        client: c.client,
        projects: [...c.projects.values()].sort((a, b) => a.project.nombre.localeCompare(b.project.nombre, "es")),
      }))
      .sort((a, b) => a.client.nombre.localeCompare(b.client.nombre, "es"));
  }, [filasFiltradas]);

  const kpis = useMemo(() => {
    const total = filasFiltradas.length;
    const sobre = filasFiltradas.filter((f) => f.alertaSobreconsumo).length;
    const riesgo = filasFiltradas.filter((f) => f.alertaGastoVsAvance).length;
    const presTotal = filasFiltradas.reduce((s, f) => s + f.horasPresupuesto, 0);
    const gastTotal = filasFiltradas.reduce((s, f) => s + f.horasGastadas, 0);
    const ratio = presTotal > 0 ? gastTotal / presTotal : 0;
    const brechaProm = total > 0
      ? filasFiltradas.reduce((s, f) => s + (f.diferenciaGastoVsAvance ?? 0), 0) / total
      : 0;
    return { total, sobre, riesgo, ratio, brechaProm };
  }, [filasFiltradas]);

  const clientOptions = useMemo(
    () => [{ value: "todos", label: "Todos" }, ...clientes.map((c) => ({ value: c.id, label: c.nombre }))],
    [clientes],
  );
  const projectOptions = useMemo(() => {
    const base = [{ value: "todos", label: "Todos" }];
    const arr = filterClient === "todos" ? proyectos : proyectos.filter((p) => p.cliente_id === filterClient);
    return [...base, ...arr.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nombre}` }))];
  }, [proyectos, filterClient]);
  const statusOptions = [
    { value: "ACTIVOS", label: "Activos / no completados" },
    { value: "TODOS", label: "Todos" },
    { value: "COMPLETADO", label: "Completado" },
    { value: "EN_PLAZO", label: "En plazo" },
    { value: "ADELANTADO", label: "Adelantado" },
    { value: "RIESGO", label: "Riesgo" },
    { value: "CRITICO", label: "Crítico" },
    { value: "NO_INICIADO", label: "No iniciado" },
  ];
  const alertOptions = [
    { value: "SOLO_ALERTA", label: "Solo con alerta" },
    { value: "TODOS", label: "Todos" },
  ];

  const renderDetalleProfesionales = (row: EntregableAnalisis, mobile: boolean): ReactNode => {
    return CATEGORIAS.map((cat) => {
      const rowsCat = row.professionals.filter((p) => p.categoria === cat);
      if (rowsCat.length === 0) return null;
      const alertaCat = rowsCat.some((p) => p.alertaSobreconsumoCategoria);
      if (mobile) {
        return (
          <div key={`${row.entregable.id}-${cat}-m`} className="mb-2 rounded-r8 border border-bdr bg-white">
            <div className="flex items-center justify-between border-b border-bdr bg-surface2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-t500">
              <span>{cat}</span>
              {alertaCat ? <span className="text-[9px] font-semibold text-rose-800">Sobreconsumo</span> : null}
            </div>
            <div className="divide-y divide-bdr/60">
              {rowsCat.map((p) => {
                const estado = p.sinAsignacion
                  ? "Falta asignación"
                  : p.alertaSobreconsumoCategoria
                    ? "Sobreconsumo"
                    : "En rango";
                return (
                  <div key={`${row.entregable.id}-${p.profesional.id}-m`} className="space-y-1.5 px-3 py-2.5">
                    <p className="text-[13px] font-medium text-t900">{p.profesional.nombre_completo}</p>
                    <p className="text-[11px] text-t500">
                      {p.rol === "LIDER" ? "Líder" : p.rol === "APOYO" ? "Apoyo" : "Sin rol"} · Presup. {fmtH(p.horasPresupuestoCategoria)} · Gastadas{" "}
                      {fmtH(p.horasGastadas)}
                    </p>
                    <span
                      className={`inline-block rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold ${
                        p.sinAsignacion
                          ? "bg-orange-100 text-orange-800"
                          : p.alertaSobreconsumoCategoria
                            ? "bg-rose-100 text-rose-800"
                            : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {estado}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
      return (
        <div key={`${row.entregable.id}-${cat}`} className="mb-3 overflow-hidden rounded-r8 border border-bdr bg-white">
          <div className="flex items-center justify-between border-b border-bdr bg-surface2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-t500">
            <span>{cat}</span>
            {alertaCat && (
              <span className="rounded-r4 bg-rose-100 px-1.5 py-0.5 text-[9px] text-rose-800">Sobreconsumo categoría</span>
            )}
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB]">
                <th className="px-3 py-[6px] text-left text-[9px] font-semibold uppercase text-t400">Profesional</th>
                <th className="px-3 py-[6px] text-left text-[9px] font-semibold uppercase text-t400">Rol</th>
                <th className="px-3 py-[6px] text-right text-[9px] font-semibold uppercase text-t400">Presup. categoría</th>
                <th className="px-3 py-[6px] text-right text-[9px] font-semibold uppercase text-t400">Gastadas</th>
                <th className="px-3 py-[6px] text-left text-[9px] font-semibold uppercase text-t400">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rowsCat.map((p) => {
                const estado = p.sinAsignacion
                  ? "Sin asignación"
                  : p.alertaSobreconsumoCategoria
                    ? "Sobreconsumo categoría"
                    : "En rango";
                return (
                  <tr key={`${row.entregable.id}-${p.profesional.id}`} className="border-b border-[#F0F2F8] last:border-b-0">
                    <td className="px-3 py-[6px] text-[11px] text-t700">{p.profesional.nombre_completo}</td>
                    <td className="px-3 py-[6px] text-[11px] text-t600">{p.rol === "SIN_ROL" ? "Sin asignación" : p.rol === "LIDER" ? "Líder" : "Apoyo"}</td>
                    <td className="px-3 py-[6px] text-right text-[11px] font-mono text-t700">{fmtH(p.horasPresupuestoCategoria)}</td>
                    <td className="px-3 py-[6px] text-right text-[11px] font-mono text-t700">{fmtH(p.horasGastadas)}</td>
                    <td className="px-3 py-[6px] text-[10px]">
                      {p.sinAsignacion ? (
                        <span className="rounded-r4 bg-orange-100 px-1.5 py-0.5 text-orange-800">{estado}</span>
                      ) : p.alertaSobreconsumoCategoria ? (
                        <span className="rounded-r4 bg-rose-100 px-1.5 py-0.5 text-rose-800">{estado}</span>
                      ) : (
                        <span className="rounded-r4 bg-emerald-100 px-1.5 py-0.5 text-emerald-800">{estado}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    });
  };

  return (
    <div className="animate-fade-in min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
      <SectionHeader
        number="03"
        title="Gestión de Horas · Análisis Cliente → Proyecto → Entregable"
        hint={`Umbrales: sobreconsumo > 100%, gasto vs avance > +${TOLERANCIA_GASTO_VS_AVANCE_PUNTOS} pts`}
      />

      <div className={`mb-[18px] ${kpiCardsGridClassName}`}>
        <KpiCard
          label="Entregables con sobreconsumo"
          value={`${kpis.sobre}`}
          subtitle={kpis.total > 0 ? `${fmtP((kpis.sobre / kpis.total) * 100)} del total visible` : "Sin datos"}
          topColor="#B91C1C"
        />
        <KpiCard
          label="Riesgo gasto vs avance"
          value={`${kpis.riesgo}`}
          subtitle={`Diferencia > ${TOLERANCIA_GASTO_VS_AVANCE_PUNTOS} puntos`}
          topColor="#B45309"
        />
        <KpiCard
          label="Consumo global de horas"
          value={fmtP(kpis.ratio * 100)}
          subtitle={`${kpis.ratio.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x gasto/presupuesto`}
          topColor={kpis.ratio > 1.15 ? "#B91C1C" : kpis.ratio > 1 ? "#B45309" : "#047857"}
        />
        <KpiCard
          label="Brecha promedio gasto vs avance"
          value={`${kpis.brechaProm >= 0 ? "+" : ""}${fmtP(kpis.brechaProm)}`}
          subtitle="Promedio de (% consumido - % avance real) sobre entregables visibles"
          topColor={kpis.brechaProm > 35 ? "#B91C1C" : kpis.brechaProm > 20 ? "#B45309" : "#475569"}
        />
      </div>

      <div className="mb-[14px] rounded-r8 border border-bdr bg-white p-[12px_18px] shadow-sh1">
        <FilterBar
          filters={[
            { key: "cliente", label: "Cliente", options: clientOptions, value: filterClient, onChange: (v) => { setFilterClient(v); setFilterProject("todos"); } },
            { key: "proyecto", label: "Proyecto", options: projectOptions, value: filterProject, onChange: setFilterProject },
            { key: "estado", label: "Estado entregable", options: statusOptions, value: filterStatus, onChange: setFilterStatus },
            { key: "alerta", label: "Alertas", options: alertOptions, value: filterAlerta, onChange: setFilterAlerta },
          ]}
        />
      </div>

      <div className="mb-3 rounded-r8 border border-bdr bg-surface2 px-4 py-2 text-[11px] text-t500">
        Semáforo: verde normal ({"<="} +20 pts), amarillo atención ({">"} +20 pts), rojo crítico ({">"} +35 pts o sobreconsumo).<br />
        Las horas gastadas consideran registros DIRECTA válidos del entregable, incluso sin asignación.
      </div>

      <div className="hidden overflow-hidden rounded-r12 border border-bdr bg-white shadow-sh1 md:block">
        <div
          className="grid items-center border-b border-bdr bg-surface2 px-5 py-[10px] text-[9px] font-semibold uppercase tracking-[0.09em] text-t300"
          style={{ gridTemplateColumns: "28px 1.2fr 80px 80px 90px 90px 90px 170px" }}
        >
          <span />
          <span>Entregable</span>
          <span className="text-right">Av. real</span>
          <span className="text-right">Av. teórico</span>
          <span className="text-right">Presup. h</span>
          <span className="text-right">Gastadas h</span>
          <span className="text-right">% consumo</span>
          <span>Estado / alerta</span>
        </div>

        {grouped.length === 0 ? (
          <div className="px-5 py-8 text-center text-[12px] italic text-t400">Sin resultados para filtros actuales.</div>
        ) : (
          <div>
            {grouped.map((clientNode) => (
              <div key={clientNode.client.id}>
                <button
                  onClick={() => {
                    const s = new Set(expandedClients);
                    s.has(clientNode.client.id) ? s.delete(clientNode.client.id) : s.add(clientNode.client.id);
                    setExpandedClients(s);
                  }}
                  className="flex w-full items-center gap-3 bg-[#3730A3] px-5 py-[10px] text-left hover:bg-[#312E81]"
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: clientNode.client.color }} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#C8D8F0]">{clientNode.client.nombre}</span>
                  <span className="ml-auto text-[10px] text-white/55">
                    {clientNode.projects.reduce((s, p) => s + p.rows.length, 0)} entregables
                  </span>
                  <ChevronRight size={14} className="text-white/60" style={{ transform: expandedClients.has(clientNode.client.id) ? "rotate(90deg)" : "rotate(0deg)" }} />
                </button>

                {expandedClients.has(clientNode.client.id) && clientNode.projects.map((projectNode) => (
                  <div key={projectNode.project.id}>
                    <button
                      onClick={() => {
                        const s = new Set(expandedProjects);
                        s.has(projectNode.project.id) ? s.delete(projectNode.project.id) : s.add(projectNode.project.id);
                        setExpandedProjects(s);
                      }}
                      className="flex w-full items-center gap-2 border-b border-bdr bg-[#F0F2F8] px-6 py-2 text-left hover:bg-[#EAECF5]"
                    >
                      <ChevronRight size={14} className="text-t300" style={{ transform: expandedProjects.has(projectNode.project.id) ? "rotate(90deg)" : "rotate(0deg)" }} />
                      <span className="text-[11.5px] font-semibold text-t700">{projectNode.project.codigo} · {projectNode.project.nombre}</span>
                      <span className="ml-auto rounded-[10px] bg-bdr px-2 py-[1px] text-[9.5px] font-semibold text-t500">{projectNode.rows.length}</span>
                    </button>

                    {expandedProjects.has(projectNode.project.id) && projectNode.rows.map((row) => {
                      const isOpen = expandedDeliverables.has(row.entregable.id);
                      const sem = nivelSemaforo(row);
                      const semColor = sem === "critico" ? "#B91C1C" : sem === "atencion" ? "#B45309" : "#047857";
                      return (
                        <div key={row.entregable.id}>
                          <button
                            onClick={() => {
                              const s = new Set(expandedDeliverables);
                              s.has(row.entregable.id) ? s.delete(row.entregable.id) : s.add(row.entregable.id);
                              setExpandedDeliverables(s);
                            }}
                            className="grid w-full items-center border-b border-[#EDE9FE] px-5 py-[9px] text-left hover:bg-[#F6F8FF]"
                            style={{ gridTemplateColumns: "28px 1.2fr 80px 80px 90px 90px 90px 170px", paddingLeft: 52, background: isOpen ? "#EEF3FF" : "white" }}
                          >
                            <ChevronRight size={12} className="text-t400" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }} />
                            <div>
                              <div className="text-[12px] font-medium text-t900">{row.entregable.nombre || "Sin nombre"}</div>
                              <div className="text-[10px] text-t300">{row.proyecto.codigo}</div>
                            </div>
                            <span className="text-right text-[11px] font-mono text-t700">{fmtP(row.avanceRealPct)}</span>
                            <span className="text-right text-[11px] font-mono text-t700">{fmtP(row.avanceTeoricoPct)}</span>
                            <span className="text-right text-[11px] font-mono text-t700">{fmtH(row.horasPresupuesto)}</span>
                            <span className="text-right text-[11px] font-mono text-t700">{fmtH(row.horasGastadas)}</span>
                            <span className="text-right text-[11px] font-mono font-semibold" style={{ color: semColor }}>
                              {row.pctHorasGastadas == null ? "—" : fmtP(row.pctHorasGastadas)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <StatusPill variant={entregableEstadoToStatusVariant(row.entregable.estado)} />
                              {(row.alertaSobreconsumo || row.alertaGastoVsAvance || row.alertaSinAsignacion) && (
                                <span className="rounded-r4 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-800">Alerta</span>
                              )}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="border-b-2 border-[#C8CCDB] bg-[#F4F6FB] px-6 py-3" style={{ paddingLeft: 84 }}>
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
                                <span className="rounded-r6 bg-white px-2 py-1 text-t700">Presupuesto: {fmtH(row.horasPresupuesto)} h</span>
                                <span className="rounded-r6 bg-white px-2 py-1 text-t700">Gastadas: {fmtH(row.horasGastadas)} h</span>
                                <span className="rounded-r6 bg-white px-2 py-1 text-t700">Consumo: {row.pctHorasGastadas == null ? "—" : fmtP(row.pctHorasGastadas)}</span>
                                {row.alertaSobreconsumo && (
                                  <span className="rounded-r6 border border-rose-300 bg-rose-50 px-2 py-1 text-rose-800">
                                    Sobreconsumo: +{fmtH(row.sobreconsumoHoras)} h{row.sobreconsumoPct != null ? ` (${fmtP(row.sobreconsumoPct)})` : ""}
                                  </span>
                                )}
                                {row.alertaGastoVsAvance && (
                                  <span className="rounded-r6 border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                                    Gasto superior al avance real: +{fmtP(row.diferenciaGastoVsAvance ?? 0)}
                                  </span>
                                )}
                                {row.alertaSinAsignacion && (
                                  <span className="rounded-r6 border border-orange-300 bg-orange-50 px-2 py-1 text-orange-800">
                                    Gasto sin asignación/cobertura detectado
                                  </span>
                                )}
                              </div>

                              {renderDetalleProfesionales(row, false)}

                              <div className="mt-2 flex flex-wrap gap-2">
                                {puedeVerFormularios ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => navigate("/formularios")}
                                      className="inline-flex items-center gap-1 rounded-r8 border border-bdr bg-white px-3 py-1.5 text-[11px] font-semibold text-t700 hover:bg-surface2"
                                    >
                                      Ir a asignaciones <ExternalLink size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => navigate("/formularios")}
                                      className="inline-flex items-center gap-1 rounded-r8 border border-bdr bg-white px-3 py-1.5 text-[11px] font-semibold text-t700 hover:bg-surface2"
                                    >
                                      Normalizar asignación <ExternalLink size={12} />
                                    </button>
                                  </>
                                ) : null}
                                <EntregableRedistribuirHorasTrigger ent={row.entregable} dense />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-bdr bg-surface2 px-5 py-[9px] text-[11px] text-t400">
          <span>Total entregables visibles: {filasFiltradas.length}</span>
          <span className="inline-flex items-center gap-1"><AlertTriangle size={13} /> Vista solo lectura de consolidación</span>
        </div>
      </div>

      <div className="md:hidden">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-t500">Cliente → Proyecto → Entregable</h2>
        {grouped.length === 0 ? (
          <div className="rounded-r10 border border-bdr bg-white px-4 py-8 text-center text-[12px] italic text-t400">Sin resultados para filtros actuales.</div>
        ) : (
          <div className="space-y-3">
            {grouped.map((clientNode) => (
              <div key={`m-${clientNode.client.id}`} className="overflow-hidden rounded-r10 border border-bdr bg-white shadow-sh1">
                <button
                  type="button"
                  onClick={() => {
                    const s = new Set(expandedClients);
                    s.has(clientNode.client.id) ? s.delete(clientNode.client.id) : s.add(clientNode.client.id);
                    setExpandedClients(s);
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3 bg-[#3730A3] px-4 py-3 text-left"
                >
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: clientNode.client.color }} />
                  <span className="min-w-0 flex-1 text-[13px] font-semibold text-white">{clientNode.client.nombre}</span>
                  <span className="shrink-0 text-[10px] text-white/70">
                    {clientNode.projects.reduce((acc, p) => acc + p.rows.length, 0)} ent.
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-white/70" style={{ transform: expandedClients.has(clientNode.client.id) ? "rotate(90deg)" : "rotate(0deg)" }} />
                </button>

                {expandedClients.has(clientNode.client.id)
                  ? clientNode.projects.map((projectNode) => (
                      <div key={`m-${projectNode.project.id}`} className="border-t border-bdr">
                        <button
                          type="button"
                          onClick={() => {
                            const s = new Set(expandedProjects);
                            s.has(projectNode.project.id) ? s.delete(projectNode.project.id) : s.add(projectNode.project.id);
                            setExpandedProjects(s);
                          }}
                          className="flex min-h-[44px] w-full items-center gap-2 bg-surface2 px-4 py-2.5 text-left"
                        >
                          <ChevronRight size={14} className="shrink-0 text-t400" style={{ transform: expandedProjects.has(projectNode.project.id) ? "rotate(90deg)" : "rotate(0deg)" }} />
                          <span className="min-w-0 flex-1 text-[12px] font-semibold text-t800">
                            {projectNode.project.codigo} · {projectNode.project.nombre}
                          </span>
                          <span className="shrink-0 rounded-r8 bg-bdr px-2 py-0.5 text-[10px] font-semibold text-t600">{projectNode.rows.length}</span>
                        </button>

                        {expandedProjects.has(projectNode.project.id) ? (
                          <div className="space-y-2 border-t border-bdr bg-[#F8F9FC] p-3">
                            {projectNode.rows.map((row) => {
                              const isOpen = expandedDeliverables.has(row.entregable.id);
                              const sem = nivelSemaforo(row);
                              const semColor = sem === "critico" ? "#B91C1C" : sem === "atencion" ? "#B45309" : "#047857";
                              const lider = row.entregable.lider_id ? profMap.get(row.entregable.lider_id) : undefined;
                              const codigo = codigoFaseEntregable(row.entregable);
                              const saldo = row.horasPresupuesto - row.horasGastadas;
                              return (
                                <div key={`m-${row.entregable.id}`} className="overflow-hidden rounded-r10 border border-bdr bg-white">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const s = new Set(expandedDeliverables);
                                      s.has(row.entregable.id) ? s.delete(row.entregable.id) : s.add(row.entregable.id);
                                      setExpandedDeliverables(s);
                                    }}
                                    className="flex w-full items-start gap-2 px-3 py-3 text-left"
                                  >
                                    <ChevronRight size={14} className="mt-0.5 shrink-0 text-t400" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }} />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[13px] font-semibold text-t900">{row.entregable.nombre || "Sin nombre"}</p>
                                      {codigo ? <p className="text-[10px] text-t400">{codigo}</p> : null}
                                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        <StatusPill variant={entregableEstadoToStatusVariant(row.entregable.estado)} />
                                        {(row.alertaSobreconsumo || row.alertaGastoVsAvance || row.alertaSinAsignacion) && (
                                          <span className="rounded-r4 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">Alerta</span>
                                        )}
                                      </div>
                                    </div>
                                  </button>

                                  <div className="border-t border-bdr/80 px-3 pb-3">
                                    <div className="grid grid-cols-1 gap-y-2 py-2 sm:grid-cols-2">
                                      <MobileCardRow label="PM">{nombrePmProyecto(row.proyecto)}</MobileCardRow>
                                      <MobileCardRow label="Líder">{lider?.nombre_completo ?? "—"}</MobileCardRow>
                                      <MobileCardRow label="Av. real">
                                        <span className="font-mono">{fmtP(row.avanceRealPct)}</span>
                                      </MobileCardRow>
                                      <MobileCardRow label="Av. teórico">
                                        <span className="font-mono">{fmtP(row.avanceTeoricoPct)}</span>
                                      </MobileCardRow>
                                      <MobileCardRow label="Presup. h">
                                        <span className="font-mono">{fmtH(row.horasPresupuesto)}</span>
                                      </MobileCardRow>
                                      <MobileCardRow label="Gastadas h">
                                        <span className="font-mono">{fmtH(row.horasGastadas)}</span>
                                      </MobileCardRow>
                                      <MobileCardRow label="% consumo">
                                        <span className="font-mono font-semibold" style={{ color: semColor }}>
                                          {row.pctHorasGastadas == null ? "—" : fmtP(row.pctHorasGastadas)}
                                        </span>
                                      </MobileCardRow>
                                      <MobileCardRow label="Saldo h">
                                        <span className={`font-mono font-semibold ${saldo < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                                          {saldo >= 0 ? "" : "−"}
                                          {fmtH(Math.abs(saldo))}
                                        </span>
                                      </MobileCardRow>
                                    </div>

                                    {isOpen ? (
                                      <div className="space-y-2 border-t border-bdr pt-2">
                                        <div className="flex flex-wrap gap-1.5 text-[10px]">
                                          {row.alertaSobreconsumo ? (
                                            <span className="rounded-r6 border border-rose-300 bg-rose-50 px-2 py-1 text-rose-800">
                                              Sobreconsumo +{fmtH(row.sobreconsumoHoras)} h
                                            </span>
                                          ) : null}
                                          {row.alertaGastoVsAvance ? (
                                            <span className="rounded-r6 border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                                              Déficit +{fmtP(row.diferenciaGastoVsAvance ?? 0)}
                                            </span>
                                          ) : null}
                                          {row.alertaSinAsignacion ? (
                                            <span className="rounded-r6 border border-orange-300 bg-orange-50 px-2 py-1 text-orange-800">
                                              Falta asignación
                                            </span>
                                          ) : null}
                                        </div>
                                        {renderDetalleProfesionales(row, true)}
                                        <EntregableAccionesHoras
                                          row={row}
                                          puedeVerFormularios={puedeVerFormularios}
                                          puedeAsignar={puedeAsignar}
                                          navigate={navigate}
                                          touchFriendly
                                        />
                                      </div>
                                    ) : (
                                      <EntregableAccionesHoras
                                        row={row}
                                        puedeVerFormularios={puedeVerFormularios}
                                        puedeAsignar={puedeAsignar}
                                        navigate={navigate}
                                        touchFriendly
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ))
                  : null}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 flex items-center gap-1 text-[11px] text-t400">
          <AlertTriangle size={13} /> Total entregables visibles: {filasFiltradas.length}
        </p>
      </div>
    </div>
  );
}
