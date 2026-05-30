import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, ClipboardList, Target } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import KpiCard, { kpiCardsGridClassName5 } from "@/components/KpiCard";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/security/AuthContext";
import { canEditarEvaluacion } from "@/security/permissions";
import type {
  Profesional,
  Entregable,
  Proyecto,
  RegistroHora,
  EvaluacionDesempenoProfesional,
} from "@/context/AppDataContext";
import {
  listarParticipacionProfesionalEquipo,
  type ParticipacionBloqueProyecto,
  type ParticipacionEntregableFila,
} from "@/profesionales/profesionalParticipacionEquipoReadModel";

/* ─── helpers ─── */

function fmtHoras1(n: number) {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtUf2(n: number) {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function fmtDateLong(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fechaKey(iso: string): string {
  const s = String(iso).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function nombreProyectoSafe(p: Proyecto | undefined): string {
  if (!p) return "Sin proyecto";
  const n = (p.nombre ?? "").trim();
  if (n) return n;
  const c = (p.codigo ?? "").trim();
  if (c) return c;
  return p.id ? `Proyecto ${p.id}` : "Sin nombre";
}

function nombreEntregableSafe(e: Entregable | undefined): string {
  if (!e) return "Sin entregable";
  const n = (e.nombre ?? "").trim();
  if (n) return n;
  return e.id ? `Entregable ${e.id}` : "Sin nombre";
}

type ParticipacionGrupoCliente = {
  clienteKey: string;
  clienteNombre: string;
  proyectos: {
    proyectoId: string;
    proyecto: Proyecto | undefined;
    filas: ParticipacionEntregableFila[];
  }[];
};

/** Agrupación solo visual: Cliente → Proyecto → Entregables (sin alterar datos del read model). */
function agruparParticipacionPorCliente(bloques: ParticipacionBloqueProyecto[]): ParticipacionGrupoCliente[] {
  const byCliente = new Map<string, ParticipacionGrupoCliente>();
  for (const bloque of bloques) {
    const clienteNombre = (bloque.clienteNombre ?? "—").trim() || "—";
    const clienteKey = clienteNombre;
    if (!byCliente.has(clienteKey)) {
      byCliente.set(clienteKey, { clienteKey, clienteNombre, proyectos: [] });
    }
    byCliente.get(clienteKey)!.proyectos.push({
      proyectoId: bloque.proyectoId,
      proyecto: bloque.proyecto,
      filas: bloque.filas,
    });
  }
  return Array.from(byCliente.values())
    .map((g) => ({
      ...g,
      proyectos: g.proyectos.sort((a, b) =>
        nombreProyectoSafe(a.proyecto).localeCompare(nombreProyectoSafe(b.proyecto), "es"),
      ),
    }))
    .sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre, "es"));
}

function ParticipacionEntregableDetallePanel({ fila }: { fila: ParticipacionEntregableFila }) {
  return (
    <div className="mt-1.5 space-y-1 rounded-r6 border border-bdr bg-[#F7F8FA] px-3 py-2 text-[11px] text-t700">
      <p>
        <span className="text-t500">Rol:</span> {fila.rolLabel}
      </p>
      <p>
        <span className="text-t500">Avance real:</span> {fila.avancePct}%
      </p>
      {fila.sinGastoReal ? (
        <p className="font-mono text-t600">Sin gasto real</p>
      ) : (
        <>
          <p className="font-mono text-t600">
            <span className="text-t500 font-sans">Gasto real profesional:</span> {fmtHoras1(fila.horasProf)} h
          </p>
          <p className="font-mono text-t600">
            <span className="text-t500 font-sans">Gasto real total entregable (P4+P3+P2):</span>{" "}
            {fmtHoras1(fila.horasTotalesEnt)} h
          </p>
          <p className="font-mono text-t600">
            <span className="text-t500 font-sans">Colaboración en entregable:</span> {fila.pctColaboracion}%
          </p>
        </>
      )}
    </div>
  );
}

function ParticipacionEntregableFilaColapsable({
  fila,
  expanded,
  onToggle,
}: {
  fila: ParticipacionEntregableFila;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="text-t700">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-1.5 rounded-r6 py-1 text-left transition-colors hover:bg-[#F7F8FA]"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-t400 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="min-w-0 truncate font-medium text-t800">{nombreEntregableSafe(fila.ent)}</span>
      </button>
      {expanded ? <ParticipacionEntregableDetallePanel fila={fila} /> : null}
    </li>
  );
}

function ParticipacionBloquesLista({ bloques }: { bloques: ParticipacionBloqueProyecto[] }) {
  const grupos = useMemo(() => agruparParticipacionPorCliente(bloques), [bloques]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggleEntregable = useCallback((entregableId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entregableId)) next.delete(entregableId);
      else next.add(entregableId);
      return next;
    });
  }, []);

  if (grupos.length === 0) return null;

  return (
    <div className="flex max-h-[min(50vh,420px)] flex-col gap-5 overflow-y-auto text-[12px] pr-0.5">
      {grupos.map((grupo) => (
        <section key={grupo.clienteKey} className="min-w-0">
          <p className="text-[13px] font-semibold leading-snug text-t900">{grupo.clienteNombre}</p>
          <div className="mt-2 flex flex-col gap-3 border-l-2 border-[#E0E7FF] pl-3 sm:pl-4">
            {grupo.proyectos.map((proy) => (
              <div key={proy.proyectoId} className="min-w-0">
                <p className="text-[12px] font-medium leading-snug text-t800">
                  {nombreProyectoSafe(proy.proyecto)}
                </p>
                <ul className="mt-1.5 flex flex-col gap-0.5 border-l border-bdr pl-3 sm:pl-4">
                  {proy.filas.map((fila) => (
                    <ParticipacionEntregableFilaColapsable
                      key={fila.entregable_id}
                      fila={fila}
                      expanded={expandedIds.has(fila.entregable_id)}
                      onToggle={() => toggleEntregable(fila.entregable_id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type DraftObjetivo = { id: string; objetivo: string; evaluacion: string; estado: string };

function EvalDesempenoModal({
  open,
  profesionalNombre,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  profesionalNombre: string;
  initial: EvaluacionDesempenoProfesional | null;
  onClose: () => void;
  onSave: (payload: {
    objetivos: { id?: string; objetivo: string; evaluacion: string; estado?: string | null }[];
    comentario_general?: string | null;
  }) => void;
}) {
  const isBelowMd = useIsBelowMd();
  const [objetivos, setObjetivos] = useState<DraftObjetivo[]>([]);
  const [comentarioGeneral, setComentarioGeneral] = useState("");
  const [editingObjetivoId, setEditingObjetivoId] = useState<string | null>(null);
  const [objetivosNuevosIds, setObjetivosNuevosIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    const objs = initial?.objetivos?.length
      ? initial.objetivos.map((o) => ({
          id: o.id,
          objetivo: o.objetivo,
          evaluacion: o.evaluacion,
          estado: o.estado ?? "",
        }))
      : [{ id: crypto.randomUUID(), objetivo: "", evaluacion: "", estado: "" }];
    setObjetivos(objs);
    setComentarioGeneral(initial?.comentario_general ?? "");
    setEditingObjetivoId(null);
    setObjetivosNuevosIds(new Set());
  }, [open, initial]);

  if (!open) return null;

  const addObjetivo = () => {
    const id = crypto.randomUUID();
    setObjetivos((prev) => [...prev, { id, objetivo: "", evaluacion: "", estado: "" }]);
    setObjetivosNuevosIds((prev) => new Set(prev).add(id));
    setEditingObjetivoId(id);
  };

  const removeObjetivo = (id: string) => {
    setObjetivos((prev) => (prev.length <= 1 ? prev : prev.filter((o) => o.id !== id)));
    setObjetivosNuevosIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setEditingObjetivoId((current) => (current === id ? null : current));
  };

  const cancelarEdicionObjetivo = (id: string) => {
    if (objetivosNuevosIds.has(id)) {
      removeObjetivo(id);
      return;
    }
    setEditingObjetivoId(null);
  };

  const confirmarEdicionObjetivo = (id: string) => {
    setObjetivosNuevosIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setEditingObjetivoId(null);
  };

  const handleSave = () => {
    onSave({
      objetivos: objetivos.map((o) => ({
        id: o.id,
        objetivo: o.objetivo,
        evaluacion: o.evaluacion,
        estado: o.estado.trim() !== "" ? o.estado.trim() : null,
      })),
      comentario_general: comentarioGeneral.trim() !== "" ? comentarioGeneral.trim() : null,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 md:items-center md:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-prof-titulo"
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-r12 border border-bdr bg-surface shadow-sh3 md:h-auto md:max-h-[92vh] md:max-w-2xl md:rounded-r12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-bdr px-4 py-3">
          <h2 id="eval-prof-titulo" className="text-[15px] font-semibold text-t900">
            Evaluación de desempeño
          </h2>
          <p className="mt-1 text-[13px] font-medium text-t800">{profesionalNombre}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:pb-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-t400">
              Objetivos
            </span>
            <button
              type="button"
              className="rounded-r8 border border-bdr px-3 py-1.5 text-[11px] font-semibold text-t700 hover:bg-surface2"
              onClick={addObjetivo}
            >
              Agregar objetivo
            </button>
          </div>
          <div className="flex flex-col gap-4">
            {objetivos.map((o, idx) => {
              const isEditingMobile = isBelowMd && editingObjetivoId === o.id;
              const isCollapsedMobile = isBelowMd && editingObjetivoId !== o.id;
              const preview =
                o.objetivo.trim() ||
                o.evaluacion.trim() ||
                (objetivosNuevosIds.has(o.id) ? "Nuevo objetivo (sin guardar)" : "(Sin texto)");

              const formFields = (
                <>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-t400">
                    Texto del objetivo
                  </label>
                  <textarea
                    value={o.objetivo}
                    onChange={(e) =>
                      setObjetivos((prev) =>
                        prev.map((x) => (x.id === o.id ? { ...x, objetivo: e.target.value } : x)),
                      )
                    }
                    rows={2}
                    className="mb-2 w-full resize-y rounded-r8 border border-bdr2 bg-surface px-3 py-2 text-[13px] text-t800 outline-none focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.12)]"
                  />
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-t400">
                    Evaluación / comentario del evaluador
                  </label>
                  <textarea
                    value={o.evaluacion}
                    onChange={(e) =>
                      setObjetivos((prev) =>
                        prev.map((x) => (x.id === o.id ? { ...x, evaluacion: e.target.value } : x)),
                      )
                    }
                    rows={2}
                    className="mb-2 w-full resize-y rounded-r8 border border-bdr2 bg-surface px-3 py-2 text-[13px] text-t800 outline-none focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.12)]"
                  />
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-t400">
                    Estado (opcional)
                  </label>
                  <input
                    type="text"
                    value={o.estado}
                    onChange={(e) =>
                      setObjetivos((prev) =>
                        prev.map((x) => (x.id === o.id ? { ...x, estado: e.target.value } : x)),
                      )
                    }
                    className="w-full rounded-r8 border border-bdr2 bg-surface px-3 py-2 text-[13px] text-t800 outline-none focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.12)]"
                    placeholder="Ej. En curso, Logrado…"
                  />
                </>
              );

              return (
                <div key={o.id} className="rounded-r10 border border-bdr bg-surface2 p-3">
                  {isCollapsedMobile ? (
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-semibold uppercase text-t400">
                            Objetivo {idx + 1}
                          </span>
                          <p className="mt-1 line-clamp-2 text-[13px] text-t700">{preview}</p>
                          {o.estado.trim() ? (
                            <p className="mt-1 text-[11px] text-t500">Estado: {o.estado}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="min-h-[40px] flex-1 rounded-r8 border border-bdr bg-white px-3 py-2 text-[12px] font-semibold text-t700"
                          onClick={() => setEditingObjetivoId(o.id)}
                        >
                          Editar
                        </button>
                        {objetivos.length > 1 ? (
                          <button
                            type="button"
                            className="min-h-[40px] rounded-r8 border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700"
                            onClick={() => removeObjetivo(o.id)}
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {isEditingMobile ? (
                    <div className="flex flex-col">
                      <div className="mb-3 flex items-center justify-between gap-2 border-b border-bdr pb-2">
                        <span className="text-[10px] font-semibold uppercase text-t400">
                          Objetivo {idx + 1}
                          {objetivosNuevosIds.has(o.id) ? " · Nuevo" : ""}
                        </span>
                      </div>
                      {formFields}
                      {objetivos.length > 1 ? (
                        <button
                          type="button"
                          className="mt-4 w-full min-h-[44px] rounded-r8 border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-semibold text-red-700"
                          onClick={() => removeObjetivo(o.id)}
                        >
                          Eliminar objetivo
                        </button>
                      ) : null}
                      <div className="sticky bottom-0 z-10 -mx-3 mt-4 border-t border-bdr bg-surface2 px-3 pt-3 pb-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom)))]">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="min-h-[44px] flex-1 rounded-r8 border border-bdr bg-white px-3 py-2.5 text-[12px] font-semibold text-t700"
                            onClick={() => cancelarEdicionObjetivo(o.id)}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="min-h-[44px] flex-1 rounded-r8 bg-copper px-3 py-2.5 text-[12px] font-semibold text-white hover:opacity-95"
                            onClick={() => confirmarEdicionObjetivo(o.id)}
                          >
                            Guardar objetivo
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="hidden md:block">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase text-t400">
                        Objetivo {idx + 1}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-t500 hover:text-t700"
                        onClick={() => removeObjetivo(o.id)}
                        disabled={objetivos.length <= 1}
                      >
                        Eliminar
                      </button>
                    </div>
                    {formFields}
                  </div>
                </div>
              );
            })}
          </div>
          <label className="mb-1 mt-5 block text-[10px] font-semibold uppercase text-t400">
            Comentario general (opcional)
          </label>
          <textarea
            value={comentarioGeneral}
            onChange={(e) => setComentarioGeneral(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-r8 border border-bdr2 bg-surface px-3 py-2 text-[13px] text-t800 outline-none focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.12)]"
          />
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-bdr bg-surface2 px-4 py-3 pb-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom)))] md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-r8 border border-bdr px-4 py-2 text-[12px] font-semibold text-t600 hover:bg-surface md:min-h-0 md:flex-none"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-r8 bg-copper px-4 py-2 text-[12px] font-semibold text-white hover:opacity-95 md:min-h-0 md:flex-none"
            onClick={handleSave}
          >
            Guardar evaluación
          </button>
        </div>
      </div>
    </div>
  );
}

function labelProfesionalEnSelect(p: Profesional, conCargo: boolean) {
  if (!conCargo) return p.nombre_completo;
  const inactivo = p.activo === false ? " · Inactivo" : "";
  return `${p.nombre_completo} · ${p.cargo}${inactivo}`;
}

export default function ProfesionalesPage() {
  const { role } = useAuth();
  const isBelowMd = useIsBelowMd();
  const puedeEditarEval = role ? canEditarEvaluacion(role) : false;
  const {
    clientes,
    profesionales,
    proyectos,
    entregables,
    registro_horas,
    equipo_entregable,
    evaluaciones_desempeno_profesional,
    upsertEvaluacionDesempenoProfesional,
  } = useAppData();

  const proyectosMap = useMemo(() => {
    const m = new Map<string, Proyecto>();
    proyectos.forEach((p) => m.set(p.id, p));
    return m;
  }, [proyectos]);

  const entregablesMap = useMemo(() => {
    const m = new Map<string, Entregable>();
    entregables.forEach((e) => m.set(e.id, e));
    return m;
  }, [entregables]);

  const [selectedId, setSelectedId] = useState<string>("");
  useEffect(() => {
    if (profesionales.length === 0) {
      setSelectedId("");
      return;
    }
    setSelectedId((cur) => (profesionales.some((p) => p.id === cur) ? cur : profesionales[0].id));
  }, [profesionales]);

  const selected = useMemo(
    () => profesionales.find((p) => p.id === selectedId),
    [profesionales, selectedId],
  );

  const registrosProf = useMemo(
    () => registro_horas.filter((r) => selected && r.profesional_id === selected.id),
    [registro_horas, selected],
  );

  const kpis = useMemo(() => {
    if (!selected) {
      return {
        directas: 0,
        indirectas: 0,
        vacaciones: 0,
        cargabilidadPct: null as number | null,
      };
    }
    const sumTipo = (tipo: RegistroHora["tipo_hora"]) =>
      registrosProf
        .filter((r) => r.tipo_hora === tipo && Number(r.horas) > 0)
        .reduce((s, r) => s + Number(r.horas), 0);
    const directas = sumTipo("DIRECTA");
    const indirectas = sumTipo("INDIRECTA");
    const vacaciones = sumTipo("VACACIONES");
    const denom = directas + indirectas;
    const cargabilidadPct = denom === 0 ? null : (directas / denom) * 100;
    return { directas, indirectas, vacaciones, cargabilidadPct };
  }, [registrosProf, selected]);

  const ventaAcumuladaAnual = useMemo(() => {
    if (!selected) return { uf: 0, noValorizados: 0, year: new Date().getFullYear() };
    const year = new Date().getFullYear();
    let uf = 0;
    let noValorizados = 0;
    const cargo = selected.cargo;
    const getTarifaUf = (p: Proyecto | undefined): number | null => {
      if (!p) return null;
      if (cargo === "L2") return Number(p.tarifa_l2);
      if (cargo === "P4") return Number(p.tarifa_p4);
      if (cargo === "P3") return Number(p.tarifa_p3);
      if (cargo === "P2") return Number(p.tarifa_p2);
      return null;
    };
    for (const r of registrosProf) {
      if (r.tipo_hora !== "DIRECTA") continue;
      const fecha = String(r.fecha ?? "").trim();
      if (!fecha.startsWith(String(year) + "-")) continue;
      const horas = Number(r.horas);
      if (!Number.isFinite(horas) || horas <= 0) continue;

      const pid =
        (r.proyecto_id ?? "").trim() ||
        ((r.entregable_id ? entregablesMap.get(r.entregable_id)?.proyecto_id : "") ?? "").trim();
      const proj = pid ? proyectosMap.get(pid) : undefined;
      const tarifa = getTarifaUf(proj);
      if (tarifa == null || !Number.isFinite(tarifa) || tarifa < 0) {
        noValorizados += 1;
        continue;
      }
      uf += horas * tarifa;
    }
    return { uf, noValorizados, year };
  }, [selected, registrosProf, entregablesMap, proyectosMap]);

  const ultimaSemanaInfo = useMemo(() => {
    if (!selected || registrosProf.length === 0) return null;
    const keys = registrosProf.map((r) => fechaKey(r.fecha)).filter(Boolean);
    const maxKey = keys.reduce((a, b) => (a >= b ? a : b), keys[0]);
    const mismoDia = registrosProf.filter((r) => fechaKey(r.fecha) === maxKey);
    const sumTipo = (tipo: RegistroHora["tipo_hora"]) =>
      mismoDia.filter((r) => r.tipo_hora === tipo).reduce((s, r) => s + Number(r.horas), 0);
    const directas = sumTipo("DIRECTA");
    const indirectas = sumTipo("INDIRECTA");
    const vacaciones = sumTipo("VACACIONES");
    const total = directas + indirectas + vacaciones;
    const directRows = mismoDia.filter((r) => r.tipo_hora === "DIRECTA");
    return {
      fechaCierre: maxKey,
      directas,
      indirectas,
      vacaciones,
      total,
      directRows,
    };
  }, [registrosProf, selected]);

  const participacionInput = useMemo(
    () =>
      selected
        ? {
            profesionalId: selected.id,
            equipo_entregable,
            entregables,
            proyectos,
            clientes,
            registro_horas,
            profesionales,
          }
        : null,
    [selected, equipo_entregable, entregables, proyectos, clientes, registro_horas, profesionales],
  );

  const participacionPorProyecto = useMemo(() => {
    if (!participacionInput) return [];
    return listarParticipacionProfesionalEquipo(participacionInput, "participacion_actual");
  }, [participacionInput]);

  const completadosLider = useMemo(() => {
    if (!participacionInput) return [];
    return listarParticipacionProfesionalEquipo(participacionInput, "completados_lider");
  }, [participacionInput]);

  const completadosApoyo = useMemo(() => {
    if (!participacionInput) return [];
    return listarParticipacionProfesionalEquipo(participacionInput, "completados_apoyo");
  }, [participacionInput]);

  const evalGuardada = useMemo(
    () =>
      selected
        ? evaluaciones_desempeno_profesional.find((e) => e.profesional_id === selected.id) ?? null
        : null,
    [evaluaciones_desempeno_profesional, selected],
  );

  const [evalModalOpen, setEvalModalOpen] = useState(false);

  const onGuardarEval = useCallback(
    (payload: {
      objetivos: { id?: string; objetivo: string; evaluacion: string; estado?: string | null }[];
      comentario_general?: string | null;
    }) => {
      if (!selected) return;
      upsertEvaluacionDesempenoProfesional(selected.id, payload);
    },
    [selected, upsertEvaluacionDesempenoProfesional],
  );

  const groupedProfesionales = useMemo(() => {
    const groups: Record<string, Profesional[]> = { L2: [], P4: [], P3: [], P2: [] };
    profesionales.forEach((p) => {
      if (groups[p.cargo]) groups[p.cargo].push(p);
    });
    return groups;
  }, [profesionales]);

  const cargabilidadLabel =
    kpis.cargabilidadPct === null ? "Sin datos" : `${kpis.cargabilidadPct.toFixed(1)}%`;
  const cargColor =
    kpis.cargabilidadPct === null
      ? "#64748B"
      : kpis.cargabilidadPct >= 85
        ? "#047857"
        : kpis.cargabilidadPct >= 60
          ? "#B45309"
          : "#B91C1C";

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
      <SectionHeader
        number="06"
        title="Profesionales"
        hint={
          isBelowMd
            ? "Horas, participación y evaluación por profesional."
            : "Vista operativa por profesional: consolidación de horas, participación y evaluación de desempeño."
        }
      />

      {profesionales.length === 0 ? (
        <div className="rounded-r12 border border-dashed border-bdr bg-surface2 px-6 py-10 text-center text-[13px] text-t500">
          No hay profesionales en el sistema.
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-r12 border border-bdr bg-white p-[14px_16px] shadow-sh1 md:p-[14px_20px]">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.09em] text-t300 md:hidden">
              Seleccionar profesional
            </label>
            <div className="relative mb-4 w-full min-w-0 md:hidden">
              <select
                className="w-full appearance-none rounded-r8 border border-bdr2 bg-surface2 px-[14px] py-3 text-[13px] font-medium leading-snug text-t700 focus:border-blue2 focus:outline-none focus:ring-[3px] focus:ring-bluebg/30"
                value={selected?.id ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <optgroup label="L2 — Líder Técnico">
                  {groupedProfesionales.L2.map((p) => (
                    <option key={p.id} value={p.id}>
                      {labelProfesionalEnSelect(p, true)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="P4 — Profesional 4">
                  {groupedProfesionales.P4.map((p) => (
                    <option key={p.id} value={p.id}>
                      {labelProfesionalEnSelect(p, true)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="P3 — Profesional 3">
                  {groupedProfesionales.P3.map((p) => (
                    <option key={p.id} value={p.id}>
                      {labelProfesionalEnSelect(p, true)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="P2 — Profesional 2">
                  {groupedProfesionales.P2.map((p) => (
                    <option key={p.id} value={p.id}>
                      {labelProfesionalEnSelect(p, true)}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-[11px] w-[11px] -translate-y-1/2 text-t300" />
            </div>

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-t400">
              Profesional seleccionado
            </p>
            <p className="mb-3 font-sans text-[1.05rem] font-semibold text-t900">
              {selected?.nombre_completo ?? "—"}
              {selected && selected.activo === false ? (
                <span className="ml-2 text-[11px] font-medium text-t500">(Inactivo)</span>
              ) : null}
              {selected ? (
                <span className="mt-0.5 block text-[12px] font-medium text-t500 md:hidden">{selected.cargo}</span>
              ) : null}
            </p>
            <label className="mb-1 hidden text-[10px] font-semibold uppercase tracking-[0.09em] text-t300 md:block">
              Cambiar profesional
            </label>
            <div className="relative hidden w-full min-w-0 md:block md:max-w-[440px]">
              <select
                className="w-full appearance-none rounded-r8 border border-bdr2 bg-surface2 px-[14px] py-2.5 text-[13.5px] font-medium text-t700 focus:border-blue2 focus:outline-none focus:ring-[3px] focus:ring-bluebg/30"
                value={selected?.id ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <optgroup label="L2 — Líder Técnico">
                  {groupedProfesionales.L2.map((p) => (
                    <option key={p.id} value={p.id}>
                      {labelProfesionalEnSelect(p, false)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="P4 — Profesional 4">
                  {groupedProfesionales.P4.map((p) => (
                    <option key={p.id} value={p.id}>
                      {labelProfesionalEnSelect(p, false)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="P3 — Profesional 3">
                  {groupedProfesionales.P3.map((p) => (
                    <option key={p.id} value={p.id}>
                      {labelProfesionalEnSelect(p, false)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="P2 — Profesional 2">
                  {groupedProfesionales.P2.map((p) => (
                    <option key={p.id} value={p.id}>
                      {labelProfesionalEnSelect(p, false)}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-[11px] w-[11px] -translate-y-1/2 text-t300" />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                <div className="mb-[14px] grid grid-cols-2 gap-2 rounded-r12 border border-bdr bg-white p-3 shadow-sh1 md:hidden">
                  <div>
                    <p className="text-[9px] font-semibold uppercase text-t400">Cargo</p>
                    <p className="text-[12px] font-medium text-t800">{selected.cargo}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase text-t400">Cargabilidad</p>
                    <p className="font-mono text-[12px] font-semibold text-t800">{cargabilidadLabel}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase text-t400">Horas directas</p>
                    <p className="font-mono text-[12px] font-semibold text-t800">{fmtHoras1(kpis.directas)} h</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase text-t400">Horas indirectas</p>
                    <p className="font-mono text-[12px] font-semibold text-t800">{fmtHoras1(kpis.indirectas)} h</p>
                  </div>
                </div>

                {/* KPIs */}
                <div className={`mb-[18px] ${kpiCardsGridClassName5}`}>
                  <KpiCard
                    label="Horas directas totales"
                    value={`${fmtHoras1(kpis.directas)} h`}
                    subtitle={isBelowMd ? "Tipo DIRECTA" : "Suma tipo DIRECTA (solo horas > 0)"}
                    topColor="#4F46E5"
                  />
                  <KpiCard
                    label="Horas indirectas totales"
                    value={`${fmtHoras1(kpis.indirectas)} h`}
                    subtitle={isBelowMd ? "Tipo INDIRECTA" : "Suma tipo INDIRECTA (solo horas > 0)"}
                    topColor="#047857"
                  />
                  <KpiCard
                    label="Horas de vacaciones"
                    value={`${fmtHoras1(kpis.vacaciones)} h`}
                    subtitle={isBelowMd ? "Tipo VACACIONES" : "Suma tipo VACACIONES (solo horas > 0)"}
                    topColor="#6366F1"
                  />
                  <KpiCard
                    label="% de cargabilidad"
                    value={cargabilidadLabel}
                    subtitle={isBelowMd ? "Directas / (dir.+ind.)" : "Directas ÷ (directas + indirectas); sin vacaciones"}
                    topColor="#3730A3"
                    tag={kpis.cargabilidadPct === null ? undefined : "Referencia"}
                    tagColor={cargColor}
                  />
                  <KpiCard
                    label="Venta acumulada anual"
                    value={`${fmtUf2(ventaAcumuladaAnual.uf)} UF`}
                    subtitle={
                      isBelowMd
                        ? `${ventaAcumuladaAnual.year} · directas UF`
                        : `${ventaAcumuladaAnual.year} · horas directas valorizadas`
                    }
                    topColor="#0D9488"
                    tag={ventaAcumuladaAnual.noValorizados > 0 ? `${ventaAcumuladaAnual.noValorizados} sin tarifa` : undefined}
                    tagColor={ventaAcumuladaAnual.noValorizados > 0 ? "#B91C1C" : undefined}
                  />
                </div>

                {/* Última semana cargada */}
                <div className="mb-[18px] rounded-r12 border border-bdr bg-white p-[18px_20px] shadow-sh1">
                  <div className="mb-4 flex items-center gap-2">
                    <ClipboardList className="h-[13px] w-[13px] text-t300 opacity-70" />
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-t300">
                      Última semana cargada
                    </span>
                  </div>
                  {!ultimaSemanaInfo ? (
                    <p className="text-[12px] italic text-t400">
                      Sin registros de horas para este profesional.
                    </p>
                  ) : (
                    <>
                      <p className="mb-1 text-[13px] font-semibold text-t800">
                        Fecha de semana / cierre: {fmtDateLong(ultimaSemanaInfo.fechaCierre)}
                      </p>
                      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-t600">
                        <span>
                          Directas:{" "}
                          <strong className="text-t800">{fmtHoras1(ultimaSemanaInfo.directas)} h</strong>
                        </span>
                        <span>
                          Indirectas:{" "}
                          <strong className="text-t800">{fmtHoras1(ultimaSemanaInfo.indirectas)} h</strong>
                        </span>
                        <span>
                          Vacaciones:{" "}
                          <strong className="text-t800">{fmtHoras1(ultimaSemanaInfo.vacaciones)} h</strong>
                        </span>
                        <span>
                          Total semana:{" "}
                          <strong className="text-t800">{fmtHoras1(ultimaSemanaInfo.total)} h</strong>
                        </span>
                      </div>
                      {Math.abs(ultimaSemanaInfo.total - 40) > 0.05 ? (
                        <p className="mb-3 rounded-r8 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900/90">
                          Total semana distinto de 40 h (solo referencia).
                        </p>
                      ) : null}

                      <p className="mb-2 text-[10px] font-semibold uppercase text-t400">
                        Detalle horas directas
                      </p>
                      <div className="space-y-2 md:hidden">
                        {ultimaSemanaInfo.directRows.length === 0 ? (
                          <p className="py-3 text-center text-[12px] italic text-t400">
                            Sin horas directas en esta fecha.
                          </p>
                        ) : (
                          ultimaSemanaInfo.directRows.map((r) => {
                            const proj = r.proyecto_id ? proyectosMap.get(r.proyecto_id) : undefined;
                            const entr = r.entregable_id ? entregablesMap.get(r.entregable_id) : undefined;
                            return (
                              <article key={r.id} className="rounded-r8 border border-bdr bg-surface2 p-3 text-[12px]">
                                <p className="font-medium text-t800">{nombreProyectoSafe(proj)}</p>
                                <p className="text-t600">{nombreEntregableSafe(entr)}</p>
                                <p className="mt-1 text-right font-mono font-semibold tabular-nums text-t900">
                                  {fmtHoras1(Number(r.horas))} h
                                </p>
                              </article>
                            );
                          })
                        )}
                      </div>
                      <div className="hidden overflow-x-auto rounded-r8 border border-bdr md:block">
                        <table className="w-full min-w-[420px] border-collapse text-left text-[12px]">
                          <thead>
                            <tr className="border-b border-bdr bg-surface2">
                              <th className="px-3 py-2 font-semibold text-t600">Proyecto</th>
                              <th className="px-3 py-2 font-semibold text-t600">Entregable</th>
                              <th className="px-3 py-2 text-right font-semibold text-t600">Horas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ultimaSemanaInfo.directRows.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-3 py-4 text-center italic text-t400">
                                  Sin horas directas en esta fecha.
                                </td>
                              </tr>
                            ) : (
                              ultimaSemanaInfo.directRows.map((r) => {
                                const proj = r.proyecto_id ? proyectosMap.get(r.proyecto_id) : undefined;
                                const entr = r.entregable_id ? entregablesMap.get(r.entregable_id) : undefined;
                                return (
                                  <tr key={r.id} className="border-b border-bdr last:border-b-0">
                                    <td className="px-3 py-2 text-t800">{nombreProyectoSafe(proj)}</td>
                                    <td className="px-3 py-2 text-t700">{nombreEntregableSafe(entr)}</td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-t800">
                                      {fmtHoras1(Number(r.horas))}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      <p className="mt-4 text-[10px] font-semibold uppercase text-t400">
                        Horas indirectas (total del día)
                      </p>
                      <p className="mt-1 font-mono text-[13px] font-semibold text-t800">
                        {fmtHoras1(ultimaSemanaInfo.indirectas)} h
                      </p>
                      <p className="mt-4 text-[10px] font-semibold uppercase text-t400">
                        Vacaciones (total del día)
                      </p>
                      <p className="mt-1 font-mono text-[13px] font-semibold text-t800">
                        {fmtHoras1(ultimaSemanaInfo.vacaciones)} h
                      </p>
                    </>
                  )}
                </div>

                {/* Participación / Completados */}
                <div className="mb-[18px] grid grid-cols-1 gap-[14px] xl:grid-cols-3">
                  {/* Participación actual */}
                  <div className="flex min-h-[200px] flex-col rounded-r12 border border-bdr bg-white p-[18px_20px] shadow-sh1">
                    <div className="mb-3 border-b border-bdr pb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-t300">
                        Participación actual
                      </span>
                    </div>
                    {participacionPorProyecto.length === 0 ? (
                      <p className="py-6 text-center text-[12px] italic text-t400">
                        No hay equipo declarado para este profesional en entregables en ejecución.
                      </p>
                    ) : (
                      <ParticipacionBloquesLista bloques={participacionPorProyecto} />
                    )}
                  </div>

                  {/* Completados líder */}
                  <div className="flex min-h-[200px] flex-col rounded-r12 border border-bdr bg-white p-[18px_20px] shadow-sh1">
                    <div className="mb-3 border-b border-bdr pb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-t300">
                        Completados como líder
                      </span>
                    </div>
                    {completadosLider.length === 0 ? (
                      <p className="py-6 text-center text-[12px] italic text-t400">
                        No hay equipo declarado como líder en entregables completados (avance real 100%).
                      </p>
                    ) : (
                      <ParticipacionBloquesLista bloques={completadosLider} />
                    )}
                  </div>

                  {/* Completados apoyo */}
                  <div className="flex min-h-[200px] flex-col rounded-r12 border border-bdr bg-white p-[18px_20px] shadow-sh1">
                    <div className="mb-3 border-b border-bdr pb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-t300">
                        Completados como apoyo
                      </span>
                    </div>
                    {completadosApoyo.length === 0 ? (
                      <p className="py-6 text-center text-[12px] italic text-t400">
                        No hay equipo declarado como apoyo en entregables completados (avance real 100%).
                      </p>
                    ) : (
                      <ParticipacionBloquesLista bloques={completadosApoyo} />
                    )}
                  </div>
                </div>

                {/* Evaluación desempeño */}
                <div className="rounded-r12 border border-bdr bg-white p-[18px_20px] shadow-sh1">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-bdr pb-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-[14px] w-[14px] text-t400" />
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-t300">
                        Evaluación de desempeño
                      </span>
                    </div>
                    {puedeEditarEval ? (
                      <button
                        type="button"
                        className="min-h-[44px] w-full rounded-r8 bg-copper px-4 py-2.5 text-[12px] font-semibold text-white hover:opacity-95 sm:w-auto md:min-h-0 md:py-2"
                        onClick={() => setEvalModalOpen(true)}
                      >
                        Gestionar evaluación
                      </button>
                    ) : null}
                  </div>
                  {!evalGuardada ? (
                    <p className="text-[12px] italic text-t400">Sin evaluación registrada</p>
                  ) : (
                    <div className="text-[12px] text-t700">
                      <p>
                        <span className="font-semibold text-t800">Objetivos:</span>{" "}
                        {evalGuardada.objetivos.length}
                      </p>
                      <p className="mt-1">
                        <span className="font-semibold text-t800">Última actualización:</span>{" "}
                        {new Date(evalGuardada.updated_at).toLocaleString("es-CL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                      {evalGuardada.objetivos.length > 0 ? (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-[11px] text-t600">
                          {evalGuardada.objetivos.slice(0, 6).map((o) => (
                            <li key={o.id}>
                              {(o.objetivo || "(Sin texto)").slice(0, 120)}
                              {(o.objetivo || "").length > 120 ? "…" : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {evalGuardada.objetivos.length > 6 ? (
                        <p className="mt-2 text-[11px] text-t400">
                          … y {evalGuardada.objetivos.length - 6} objetivos más.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <EvalDesempenoModal
                  open={evalModalOpen}
                  profesionalNombre={selected.nombre_completo}
                  initial={evalGuardada}
                  onClose={() => setEvalModalOpen(false)}
                  onSave={onGuardarEval}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
