import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import SectionHeader from "@/components/SectionHeader";
import AuditoriaImputacionesCierrePanel from "@/components/AuditoriaImputacionesCierrePanel";
import KpiCard from "@/components/KpiCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppData, type Entregable, type Proyecto } from "@/context/AppDataContext";
import {
  analizarBloqueoEliminacionProyectos,
  MENSAJE_BLOQUEO_PROYECTO_POR_REGISTRO_HORAS,
} from "@/proyectos/proyectoEliminacionRegla";

const fmtH = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtUF = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SEED_PROJECT_IDS = new Set(Array.from({ length: 20 }, (_, i) => `pr${i + 1}`));
const SEED_ENTREGABLE_IDS = new Set(Array.from({ length: 38 }, (_, i) => `e${i + 1}`));
const SEED_REGISTRO_IDS = new Set(Array.from({ length: 8 }, (_, i) => `rh${i + 1}`));

type Clasificacion = "REAL" | "DEMO" | "DUDOSO";

function horasPresupuestoEntregable(ent: Entregable): number {
  return Number(ent.hrs_l2) + Number(ent.hrs_p4) + Number(ent.hrs_p3) + Number(ent.hrs_p2);
}

type RowProyectoAudit = {
  proyecto: Proyecto;
  clienteNombre: string;
  nEntregables: number;
  ufPres: number;
  ufGast: number;
  horasPres: number;
  horasGast: number;
  nAsignaciones: number;
  nRegistros: number;
  seed: boolean;
  clasificacion: Clasificacion;
  observacion: string;
  entregables: {
    ent: Entregable;
    horasPres: number;
    horasGast: number;
    nAsignaciones: number;
    nRegistros: number;
  }[];
};

export default function AuditoriaProyectos() {
  const navigate = useNavigate();
  const {
    clientes,
    proyectos,
    entregables,
    asignaciones_horas,
    registro_horas,
    historial_redistribuciones_horas,
    deleteProyectosCascade,
  } = useAppData();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const clienteById = useMemo(() => new Map(clientes.map((c) => [c.id, c.nombre])), [clientes]);
  const entregablesByProyecto = useMemo(() => {
    const m = new Map<string, Entregable[]>();
    for (const e of entregables) {
      if (!m.has(e.proyecto_id)) m.set(e.proyecto_id, []);
      m.get(e.proyecto_id)!.push(e);
    }
    return m;
  }, [entregables]);

  const registrosByEntregable = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of registro_horas) {
      const eid = (r.entregable_id ?? "").trim();
      if (!eid) continue;
      if (!m.has(eid)) m.set(eid, []);
      m.get(eid)!.push(String(r.id ?? ""));
    }
    return m;
  }, [registro_horas]);

  const asignacionesByEntregable = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of asignaciones_horas) {
      const eid = (a.entregable_id ?? "").trim();
      if (!eid) continue;
      if (!m.has(eid)) m.set(eid, []);
      m.get(eid)!.push(String(a.id ?? ""));
    }
    return m;
  }, [asignaciones_horas]);

  const rows = useMemo<RowProyectoAudit[]>(() => {
    return [...proyectos]
      .map((p) => {
        const ents = entregablesByProyecto.get(p.id) ?? [];
        const clienteNombre = clienteById.get(p.cliente_id) ?? "—";

        let ufPres = 0;
        let ufGast = 0;
        let horasPres = 0;
        let horasGast = 0;
        let nAsignaciones = 0;
        let nRegistros = 0;

        const entRows = ents.map((ent) => {
          const hp = horasPresupuestoEntregable(ent);
          const hg = Number(ent.hrs_gastadas);
          const regs = registrosByEntregable.get(ent.id) ?? [];
          const asigs = asignacionesByEntregable.get(ent.id) ?? [];
          return {
            ent,
            horasPres: hp,
            horasGast: hg,
            nAsignaciones: asigs.length,
            nRegistros: regs.length,
          };
        });

        for (const er of entRows) {
          ufPres += Number(er.ent.uf_presupuestadas);
          ufGast += Number(er.ent.uf_consumidas);
          horasPres += er.horasPres;
          horasGast += er.horasGast;
          nAsignaciones += er.nAsignaciones;
          nRegistros += er.nRegistros;
        }

        const seed = SEED_PROJECT_IDS.has(p.id);

        // Señales fuertes de “uso real” sobre datos seed
        const hasAsignaciones = nAsignaciones > 0;
        const hasNonSeedRegs = entRows.some((er) => (registrosByEntregable.get(er.ent.id) ?? []).some((id) => !SEED_REGISTRO_IDS.has(id)));
        const hasNonSeedEntregables = entRows.some((er) => !SEED_ENTREGABLE_IDS.has(er.ent.id));

        let clasificacion: Clasificacion;
        let observacion = "";
        if (!seed) {
          clasificacion = "REAL";
          observacion = "ID no coincide con seed (pr1..pr20).";
        } else if (hasAsignaciones || hasNonSeedRegs || hasNonSeedEntregables) {
          clasificacion = "DUDOSO";
          const parts = [
            hasAsignaciones ? "tiene asignaciones" : null,
            hasNonSeedRegs ? "tiene registros no-seed" : null,
            hasNonSeedEntregables ? "tiene entregables no-seed" : null,
          ].filter(Boolean);
          observacion = `Proyecto seed con señales de uso real: ${parts.join(", ")}.`;
        } else {
          clasificacion = "DEMO";
          observacion = "Coincide con seed (pr1..pr20) sin señales fuertes de uso real.";
        }

        return {
          proyecto: p,
          clienteNombre,
          nEntregables: ents.length,
          ufPres,
          ufGast,
          horasPres,
          horasGast,
          nAsignaciones,
          nRegistros,
          seed,
          clasificacion,
          observacion,
          entregables: entRows.sort((a, b) => a.ent.nombre.localeCompare(b.ent.nombre, "es")),
        } satisfies RowProyectoAudit;
      })
      .sort((a, b) => {
        const o: Record<Clasificacion, number> = { DUDOSO: 0, DEMO: 1, REAL: 2 };
        const dx = o[a.clasificacion] - o[b.clasificacion];
        if (dx !== 0) return dx;
        return (a.proyecto.codigo + a.proyecto.nombre).localeCompare(b.proyecto.codigo + b.proyecto.nombre, "es");
      });
  }, [proyectos, entregablesByProyecto, clienteById, registrosByEntregable, asignacionesByEntregable]);

  const totals = useMemo(() => {
    const totalProy = rows.length;
    const ufPres = rows.reduce((s, r) => s + r.ufPres, 0);
    const ufGast = rows.reduce((s, r) => s + r.ufGast, 0);
    const hPres = rows.reduce((s, r) => s + r.horasPres, 0);
    const hGast = rows.reduce((s, r) => s + r.horasGast, 0);
    const selectedRows = rows.filter((r) => selected.has(r.proyecto.id));
    const selectedProy = selectedRows.length;
    const selectedUf = selectedRows.reduce((s, r) => s + r.ufPres, 0);
    return { totalProy, ufPres, ufGast, hPres, hGast, selectedUf, selectedProy };
  }, [rows, selected]);

  const deletePreview = useMemo(() => {
    const pids = [...selected];
    const ents = entregables.filter((e) => selected.has(e.proyecto_id));
    const entIds = new Set(ents.map((e) => e.id));
    const asigs = asignaciones_horas.filter(
      (a) => entIds.has(a.entregable_id) || (a.proyecto_id && selected.has(a.proyecto_id)),
    );
    const redist = (historial_redistribuciones_horas ?? []).filter((h) => selected.has(h.proyecto_id) || entIds.has(h.entregable_id));
    return { pids, ents, asigs, redist };
  }, [selected, entregables, asignaciones_horas, historial_redistribuciones_horas]);

  const eliminacionGastoAnalisis = useMemo(
    () => analizarBloqueoEliminacionProyectos([...selected], entregables, registro_horas, proyectos),
    [selected, entregables, registro_horas, proyectos],
  );

  const toggleExpanded = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const toggleSelected = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const canDelete = selected.size > 0;

  return (
    <div className="animate-fade-in min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-10">
      <SectionHeader
        number="TEMP"
        title="Auditoría de Proyectos"
        hint="Página temporal para depuración: identifica qué proyectos aportan UF y permite eliminación asistida con confirmación explícita."
      />

      <AuditoriaImputacionesCierrePanel />

      <div className="mb-3 rounded-r12 border border-bdr bg-amber-50/50 p-4 text-[12px] text-t700">
        <p className="font-semibold text-amber-900">Antes de eliminar, exporta un respaldo.</p>
        <p className="mt-1">
          Recomendado: usa <span className="font-semibold">Configuración → Exportar Todo (JSON)</span>.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3 gap-2" onClick={() => navigate("/configuracion")}>
          <ExternalLink size={14} /> Ir a exportar respaldo
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <KpiCard label="Total proyectos" value={String(totals.totalProy)} subtitle="Proyectos cargados en la app" topColor="#1e4a6e" />
        <KpiCard label="Total UF presup." value={fmtUF(totals.ufPres)} subtitle="Suma de UF por entregable" topColor="#c45d2c" />
        <KpiCard label="Total UF gast." value={fmtUF(totals.ufGast)} subtitle="Suma de consumo UF por entregable" topColor="#1e4a6e" />
        <KpiCard label="Total hrs presup." value={fmtH(totals.hPres)} subtitle="L2+P4+P3+P2 por entregable" topColor="#1e4a6e" />
        <KpiCard label="Total hrs gast." value={fmtH(totals.hGast)} subtitle="hrs_gastadas por entregable" topColor="#1e4a6e" />
        <KpiCard label="UF seleccionadas" value={fmtUF(totals.selectedUf)} subtitle="UF presup. de proyectos marcados" topColor={totals.selectedUf > 0 ? "#b91c1c" : "#16a34a"} />
        <KpiCard label="Proyectos seleccionados" value={String(totals.selectedProy)} subtitle="Listos para eliminación asistida" topColor={totals.selectedProy > 0 ? "#b91c1c" : "#16a34a"} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-r12 border border-bdr bg-surface p-3">
        <div className="text-[12px] text-t600">
          La UF por proyecto se calcula como <span className="font-semibold">Σ entregables.uf_presupuestadas</span>.
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!canDelete}
          onClick={() => {
            setConfirmText("");
            setConfirmOpen(true);
          }}
        >
          <Trash2 size={14} /> Eliminar proyectos seleccionados
        </Button>
      </div>

      <div className="overflow-x-auto rounded-r12 border border-bdr bg-white">
        <table className="min-w-[1400px] w-full border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-bdr bg-slate-50 text-[9px] font-semibold uppercase tracking-wide text-t500">
              <th className="px-2 py-2">Sel.</th>
              <th className="px-2 py-2">Clasificación</th>
              <th className="px-2 py-2">ID</th>
              <th className="px-2 py-2">Código</th>
              <th className="px-2 py-2">Nombre</th>
              <th className="px-2 py-2">Cliente</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2 text-right">Entregables</th>
              <th className="px-2 py-2 text-right">UF presup.</th>
              <th className="px-2 py-2 text-right">UF gast.</th>
              <th className="px-2 py-2 text-right">Hrs presup.</th>
              <th className="px-2 py-2 text-right">Hrs gast.</th>
              <th className="px-2 py-2 text-right">Asignaciones</th>
              <th className="px-2 py-2 text-right">Reg. horas</th>
              <th className="px-2 py-2">Observación / recomendación</th>
              <th className="px-2 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pid = r.proyecto.id;
              const isOpen = expanded.has(pid);
              const isSelected = selected.has(pid);
              const clsChip =
                r.clasificacion === "REAL"
                  ? "bg-emerald-500/10 text-emerald-900 border-emerald-600/25"
                  : r.clasificacion === "DEMO"
                    ? "bg-slate-500/10 text-slate-900 border-slate-600/25"
                    : "bg-amber-500/10 text-amber-900 border-amber-600/25";
              return (
                <>
                  <tr key={pid} className="border-b border-bdr/60 hover:bg-copper/[0.03]">
                    <td className="px-2 py-2">
                      <Checkbox checked={isSelected} onCheckedChange={(v) => toggleSelected(pid, Boolean(v))} />
                    </td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex items-center rounded-r6 border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${clsChip}`}>
                        {r.clasificacion}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-[10px] text-t600">{pid}</td>
                    <td className="px-2 py-2 font-mono text-[10px] text-copper">{r.proyecto.codigo}</td>
                    <td className="px-2 py-2 font-medium text-t800">{r.proyecto.nombre}</td>
                    <td className="px-2 py-2 text-t600">{r.clienteNombre}</td>
                    <td className="px-2 py-2 text-t600">{r.proyecto.estado}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-t700">{r.nEntregables}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtUF(r.ufPres)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtUF(r.ufGast)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtH(r.horasPres)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtH(r.horasGast)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-t700">{r.nAsignaciones}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-t700">{r.nRegistros}</td>
                    <td className="px-2 py-2 text-t600">{r.observacion}</td>
                    <td className="px-2 py-2">
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => toggleExpanded(pid)}>
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span className="ml-1">{isOpen ? "Cerrar" : "Expandir"}</span>
                      </Button>
                    </td>
                  </tr>

                  {isOpen ? (
                    <tr key={`${pid}__detail`} className="border-b border-bdr bg-slate-50/40">
                      <td colSpan={16} className="px-3 py-3">
                        <div className="overflow-x-auto rounded-r10 border border-bdr bg-white">
                          <table className="min-w-[1200px] w-full border-collapse text-left text-[11px]">
                            <thead>
                              <tr className="border-b border-bdr bg-slate-50 text-[9px] font-semibold uppercase tracking-wide text-t500">
                                <th className="px-2 py-2">ID entregable</th>
                                <th className="px-2 py-2">Nombre</th>
                                <th className="px-2 py-2">Fase / tarea</th>
                                <th className="px-2 py-2">Estado</th>
                                <th className="px-2 py-2 text-right">UF presup.</th>
                                <th className="px-2 py-2 text-right">UF gast.</th>
                                <th className="px-2 py-2 text-right">Hrs L2</th>
                                <th className="px-2 py-2 text-right">Hrs P4</th>
                                <th className="px-2 py-2 text-right">Hrs P3</th>
                                <th className="px-2 py-2 text-right">Hrs P2</th>
                                <th className="px-2 py-2 text-right">Hrs presup.</th>
                                <th className="px-2 py-2 text-right">Hrs gast.</th>
                                <th className="px-2 py-2 text-right">Asignaciones</th>
                                <th className="px-2 py-2 text-right">Reg. horas</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.entregables.length === 0 ? (
                                <tr>
                                  <td colSpan={14} className="px-2 py-3 text-center text-t500">
                                    Sin entregables.
                                  </td>
                                </tr>
                              ) : (
                                r.entregables.map((er) => (
                                  <tr key={er.ent.id} className="border-b border-bdr/60">
                                    <td className="px-2 py-2 font-mono text-[10px] text-t600">{er.ent.id}</td>
                                    <td className="px-2 py-2 font-medium text-t800">{er.ent.nombre}</td>
                                    <td className="px-2 py-2 text-t600">
                                      {[er.ent.fase_codigo, er.ent.tarea_codigo].filter(Boolean).join(" · ") || "—"}
                                    </td>
                                    <td className="px-2 py-2 text-t600">{String(er.ent.estado)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtUF(Number(er.ent.uf_presupuestadas))}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtUF(Number(er.ent.uf_consumidas))}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtH(Number(er.ent.hrs_l2))}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtH(Number(er.ent.hrs_p4))}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtH(Number(er.ent.hrs_p3))}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtH(Number(er.ent.hrs_p2))}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtH(er.horasPres)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtH(er.horasGast)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{er.nAsignaciones}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-t700">{er.nRegistros}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmText("");
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {eliminacionGastoAnalisis.bloqueado ? "No se puede eliminar" : "Confirmar eliminación asistida"}
            </DialogTitle>
            <DialogDescription>
              {eliminacionGastoAnalisis.bloqueado ? (
                <span className="text-[13px] text-t700">{MENSAJE_BLOQUEO_PROYECTO_POR_REGISTRO_HORAS}</span>
              ) : (
                <>
                  Esta acción <span className="font-semibold">no se puede deshacer</span> salvo que tengas respaldo/export.
                  Los <span className="font-semibold">registros de horas no se eliminan</span> (no hay asociados a estos proyectos).
                  Para continuar, escribe <span className="font-semibold">ELIMINAR</span>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {eliminacionGastoAnalisis.bloqueado ? (
            <div className="rounded-r10 border border-[#FECACA] bg-[#FEF2F2] p-3 text-[12px] text-[#7F1D1D]">
              <div className="font-semibold uppercase tracking-wide text-[11px]">Detalle del bloqueo</div>
              <div className="mt-2">
                Registros de horas asociados:{" "}
                <span className="font-mono font-semibold">{eliminacionGastoAnalisis.nRegistros}</span>
                {" · "}
                Horas totales:{" "}
                <span className="font-mono font-semibold">{eliminacionGastoAnalisis.totalHoras.toFixed(1)}</span>
              </div>
              {eliminacionGastoAnalisis.proyectosConGasto.length > 0 ? (
                <div className="mt-2">
                  <div className="font-semibold">Proyectos con gasto</div>
                  <ul className="mt-1 list-disc pl-5">
                    {eliminacionGastoAnalisis.proyectosConGasto.map((p) => (
                      <li key={p.id}>
                        <span className="font-mono">{p.codigo}</span> — {p.nombre}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {eliminacionGastoAnalisis.entregablesConGasto.length > 0 ? (
                <div className="mt-2">
                  <div className="font-semibold">Entregables con gasto</div>
                  <ul className="mt-1 list-disc pl-5">
                    {eliminacionGastoAnalisis.entregablesConGasto.slice(0, 12).map((e) => (
                      <li key={e.id}>
                        {e.nombre} — <span className="font-mono">{e.horas.toFixed(1)}</span> h
                      </li>
                    ))}
                  </ul>
                  {eliminacionGastoAnalisis.entregablesConGasto.length > 12 ? (
                    <p className="mt-1 text-[11px] text-t600">
                      … y {eliminacionGastoAnalisis.entregablesConGasto.length - 12} más
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="rounded-r10 border border-bdr bg-amber-50/50 p-3 text-[12px] text-t700">
                <p className="font-semibold text-amber-900">Qué se eliminará</p>
                <ul className="mt-1 list-disc pl-5">
                  <li>{deletePreview.pids.length} proyecto(s)</li>
                  <li>{deletePreview.ents.length} entregable(s) asociados (incl. notas en entregable)</li>
                  <li>{deletePreview.asigs.length} asignación(es) asociadas</li>
                  <li>{deletePreview.redist.length} registro(s) de historial de redistribución asociados</li>
                </ul>
                <p className="mt-2 text-[11px] text-t600">
                  No se eliminan registros de horas, profesionales ni clientes. Los clientes pueden quedar “huérfanos” y no se
                  tocan en esta herramienta.
                </p>
              </div>

              <div className="mt-3 overflow-x-auto rounded-r10 border border-bdr bg-white">
                <table className="min-w-[700px] w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-bdr bg-slate-50 text-[9px] font-semibold uppercase tracking-wide text-t500">
                      <th className="px-2 py-2">ID</th>
                      <th className="px-2 py-2">Código</th>
                      <th className="px-2 py-2">Nombre</th>
                      <th className="px-2 py-2 text-right">UF presup. (aporte)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .filter((r) => selected.has(r.proyecto.id))
                      .map((r) => (
                        <tr key={`prev_${r.proyecto.id}`} className="border-b border-bdr/60">
                          <td className="px-2 py-2 font-mono text-[10px] text-t600">{r.proyecto.id}</td>
                          <td className="px-2 py-2 font-mono text-[10px] text-copper">{r.proyecto.codigo}</td>
                          <td className="px-2 py-2 text-t700">{r.proyecto.nombre}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtUF(r.ufPres)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-t400">Confirmación escrita</label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Escribe ELIMINAR"
                  className="mt-1 w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px] text-t700 outline-none focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.12)]"
                />
              </div>
            </>
          )}

          <DialogFooter className="mt-3 gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {eliminacionGastoAnalisis.bloqueado ? "Entendido" : "Cancelar"}
            </Button>
            {!eliminacionGastoAnalisis.bloqueado ? (
              <Button
                type="button"
                variant="destructive"
                disabled={confirmText.trim().toUpperCase() !== "ELIMINAR" || selected.size === 0}
                onClick={() => {
                  if (eliminacionGastoAnalisis.bloqueado) return;
                  const ids = [...selected];
                  deleteProyectosCascade(ids);
                  setSelected(new Set());
                  setConfirmText("");
                  setConfirmOpen(false);
                }}
              >
                Eliminar definitivamente
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

