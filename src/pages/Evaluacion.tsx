import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import KpiCard, { kpiCardsGridClassName6 } from "@/components/KpiCard";
import CrearEvaluacionEntregableModal from "@/components/evaluacion/CrearEvaluacionEntregableModal";
import EvaluacionEntregableDetalleModal, {
  type EvaluacionEntregableDetalleView,
} from "@/components/evaluacion/EvaluacionEntregableDetalleModal";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/security/AuthContext";
import { canGestionarEvaluacionEntregable } from "@/security/permissions";
import {
  notaGeneralGlobal,
  resumenEvaluacionesProfesional,
  TIPO_EVALUACION_LABEL,
} from "@/evaluacion/evaluacionEntregablesLogic";
import {
  esProfesionalExcluidoDeEvaluacion,
  filtrarProfesionalesParaEvaluacion,
} from "@/evaluacion/evaluacionProfesionalesExcluidos";
import type { EvaluacionEntregable } from "@/context/AppDataContext";

function fmtNota(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(1);
}

export default function Evaluacion() {
  const {
    profesionales,
    entregables,
    proyectos,
    clientes,
    evaluaciones_entregables,
    deleteEvaluacionEntregable,
  } = useAppData();
  const { role, user } = useAuth();
  const puedeGestionar = canGestionarEvaluacionEntregable(role);

  const profesionalesEvaluacion = useMemo(
    () => filtrarProfesionalesParaEvaluacion(profesionales),
    [profesionales],
  );

  const [profesionalId, setProfesionalId] = useState(
    () => filtrarProfesionalesParaEvaluacion(profesionales)[0]?.id ?? "",
  );
  const [crearOpen, setCrearOpen] = useState(false);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleView, setDetalleView] = useState<EvaluacionEntregableDetalleView | null>(null);

  useEffect(() => {
    const actual = profesionales.find((p) => p.id === profesionalId);
    if (actual && !esProfesionalExcluidoDeEvaluacion(actual.nombre_completo)) return;
    setProfesionalId(profesionalesEvaluacion[0]?.id ?? "");
  }, [profesionalId, profesionales, profesionalesEvaluacion]);

  const profSel = useMemo(
    () => profesionalesEvaluacion.find((p) => p.id === profesionalId) ?? null,
    [profesionalesEvaluacion, profesionalId],
  );

  const resumen = useMemo(
    () => resumenEvaluacionesProfesional(evaluaciones_entregables, profesionalId),
    [evaluaciones_entregables, profesionalId],
  );

  const notaGlobal = useMemo(
    () => notaGeneralGlobal(evaluaciones_entregables),
    [evaluaciones_entregables],
  );

  const historial = useMemo(() => {
    return evaluaciones_entregables
      .filter((e) => e.profesional_id === profesionalId)
      .sort((a, b) => b.fecha_evaluacion.localeCompare(a.fecha_evaluacion));
  }, [evaluaciones_entregables, profesionalId]);

  const entMap = useMemo(() => new Map(entregables.map((e) => [e.id, e])), [entregables]);
  const projMap = useMemo(() => new Map(proyectos.map((p) => [p.id, p])), [proyectos]);
  const cliMap = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  const enrichEvaluacion = useCallback(
    (ev: EvaluacionEntregable): EvaluacionEntregableDetalleView => {
      const ent = entMap.get(ev.entregable_id);
      const pr = projMap.get(ev.proyecto_id);
      const cl = ev.cliente_id ? cliMap.get(ev.cliente_id) : pr ? cliMap.get(pr.cliente_id) : undefined;
      const prof = profesionales.find((p) => p.id === ev.profesional_id);
      return {
        evaluacion: ev,
        profesionalNombre: prof?.nombre_completo ?? "—",
        clienteNombre: cl?.nombre ?? "—",
        proyectoLabel: pr ? `${pr.codigo} — ${pr.nombre}` : "—",
        entregableNombre: ent?.nombre ?? "—",
        rolLabel: ev.rol_en_entregable === "LIDER" ? "Líder" : "Apoyo",
        evaluador: user,
      };
    },
    [entMap, projMap, cliMap, profesionales, user],
  );

  const openDetalle = useCallback(
    (ev: EvaluacionEntregable) => {
      setDetalleView(enrichEvaluacion(ev));
      setDetalleOpen(true);
    },
    [enrichEvaluacion],
  );

  const handleEliminar = useCallback(
    (id: string) => {
      if (!puedeGestionar) return;
      if (!window.confirm("¿Eliminar esta evaluación?")) return;
      deleteEvaluacionEntregable(id);
    },
    [puedeGestionar, deleteEvaluacionEntregable],
  );

  const kpiSubtitle = resumen.sinEvaluaciones ? "Sin evaluaciones" : "Profesional seleccionado";

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
      <SectionHeader
        number="07"
        title="Evaluación"
        hint="Desempeño en entregables completados"
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-t500">
            Profesional
          </span>
          <select
            value={profesionalId}
            onChange={(e) => setProfesionalId(e.target.value)}
            className="h-10 w-full rounded-r8 border border-bdr bg-white px-3 text-[13px] text-t900"
          >
            {profesionalesEvaluacion.length === 0 ? (
              <option value="">Sin profesionales</option>
            ) : (
              [...profesionalesEvaluacion]
                .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, "es"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre_completo}
                  </option>
                ))
            )}
          </select>
        </label>
        {puedeGestionar ? (
          <button
            type="button"
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-r8 bg-indigo-700 px-4 py-2.5 text-[13px] font-semibold text-white sm:w-auto"
            onClick={() => setCrearOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Crear nueva evaluación
          </button>
        ) : null}
      </div>

      {profSel ? (
        <h2 className="mb-3 text-[15px] font-semibold text-t900">{profSel.nombre_completo}</h2>
      ) : null}

      <div className={`${kpiCardsGridClassName6} mb-6`}>
        <KpiCard
          label="Nota media"
          value={fmtNota(resumen.notaMedia)}
          subtitle={kpiSubtitle}
          topColor="#4338CA"
        />
        <KpiCard
          label="Evaluaciones"
          value={String(resumen.cantidadEvaluaciones)}
          subtitle={kpiSubtitle}
          topColor="#1e4a6e"
        />
        <KpiCard
          label="Entregables evaluados"
          value={String(resumen.entregablesEvaluados)}
          subtitle={kpiSubtitle}
          topColor="#047857"
        />
        <KpiCard
          label="Nota máxima"
          value={fmtNota(resumen.notaMaxima)}
          subtitle={kpiSubtitle}
          topColor="#B45309"
        />
        <KpiCard
          label="Nota mínima"
          value={fmtNota(resumen.notaMinima)}
          subtitle={kpiSubtitle}
          topColor="#B91C1C"
        />
        <KpiCard
          label="Nota general"
          value={fmtNota(notaGlobal)}
          subtitle="Promedio global (todos los profesionales)"
          topColor="#6B7280"
        />
      </div>

      <div className="rounded-r12 border border-bdr bg-white shadow-sh1">
        <div className="border-b border-bdr px-4 py-3">
          <h3 className="text-[13px] font-semibold text-t900">Historial de evaluaciones</h3>
        </div>

        {historial.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-t500">
            {resumen.sinEvaluaciones
              ? "Sin evaluaciones para este profesional."
              : "Sin resultados."}
          </p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-bdr bg-surface2/80 text-[10px] uppercase tracking-wide text-t500">
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Proyecto</th>
                    <th className="px-3 py-2">Entregable</th>
                    <th className="px-3 py-2">Rol</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Nota</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {historial.map((ev) => {
                    const view = enrichEvaluacion(ev);
                    return (
                      <tr key={ev.id} className="border-b border-bdr last:border-0">
                        <td className="px-3 py-2 font-mono text-[11px]">{ev.fecha_evaluacion}</td>
                        <td className="px-3 py-2">{view.clienteNombre}</td>
                        <td className="px-3 py-2">{view.proyectoLabel}</td>
                        <td className="max-w-[200px] truncate px-3 py-2" title={view.entregableNombre}>
                          {view.entregableNombre}
                        </td>
                        <td className="px-3 py-2">{view.rolLabel}</td>
                        <td className="px-3 py-2">{TIPO_EVALUACION_LABEL[ev.tipo_evaluacion]}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {ev.nota_final.toFixed(1)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-indigo-700 hover:underline"
                            onClick={() => openDetalle(ev)}
                          >
                            Ver detalle
                          </button>
                          {puedeGestionar ? (
                            <button
                              type="button"
                              className="ml-2 text-t400 hover:text-red-700"
                              title="Eliminar"
                              onClick={() => handleEliminar(ev.id)}
                            >
                              <Trash2 className="inline h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 p-3 md:hidden">
              {historial.map((ev) => {
                const view = enrichEvaluacion(ev);
                return (
                  <article
                    key={ev.id}
                    className="rounded-r10 border border-bdr bg-white p-3 shadow-sh1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-[11px] text-t500">{ev.fecha_evaluacion}</p>
                      <span className="text-[14px] font-bold text-indigo-800">
                        {ev.nota_final.toFixed(1)}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
                      <dt className="text-t400">Cliente</dt>
                      <dd>{view.clienteNombre}</dd>
                      <dt className="text-t400">Proyecto</dt>
                      <dd className="line-clamp-2">{view.proyectoLabel}</dd>
                      <dt className="text-t400">Entregable</dt>
                      <dd>{view.entregableNombre}</dd>
                      <dt className="text-t400">Rol</dt>
                      <dd>{view.rolLabel}</dd>
                      <dt className="text-t400">Tipo</dt>
                      <dd>{TIPO_EVALUACION_LABEL[ev.tipo_evaluacion]}</dd>
                    </dl>
                    <div className="mt-2 flex gap-3">
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-indigo-700"
                        onClick={() => openDetalle(ev)}
                      >
                        Ver detalle
                      </button>
                      {puedeGestionar ? (
                        <button
                          type="button"
                          className="text-[12px] text-red-700"
                          onClick={() => handleEliminar(ev.id)}
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      {puedeGestionar ? (
        <CrearEvaluacionEntregableModal
          open={crearOpen}
          onOpenChange={setCrearOpen}
          profesionalInicialId={profesionalId}
          profesionales={profesionalesEvaluacion}
          onGuardado={() => setCrearOpen(false)}
        />
      ) : null}

      <EvaluacionEntregableDetalleModal
        open={detalleOpen}
        onOpenChange={setDetalleOpen}
        detalle={detalleView}
      />
    </div>
  );
}
