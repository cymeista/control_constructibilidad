/**
 * Modal de trabajo del entregable (Etapa 2 — refinamiento UX).
 * Consume EntregableVistaAnalisis; no recalcula ni cambia handlers.
 */

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, LayoutList, StickyNote, X } from "lucide-react";
import type { HistorialRedistribucionHoras } from "@/entregables/redistribucionHorasEntregable";
import type { EntregableVistaAnalisis } from "@/proyectos/proyectosVistaReadModel";
import type { PmInterno, Profesional } from "@/context/AppDataContext";
import {
  calcularSaldoAnuladoHoras,
  entregableEstaCancelado,
} from "@/entregables/entregableCancelacion";
import { entregableEstaPausado } from "@/entregables/entregablePausa";
import {
  claseBadgeAlertaActiva,
  lineasDetalleAlertaDeficitCategoria,
  type AlertaActiva,
} from "@/alertas/alertasActivas";
import { formatDateForDisplayShort } from "@/lib/localDate";
import StatusPill, { entregableEstadoToStatusVariant } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import EntregableFechasSection from "@/components/proyectos/EntregableFechasSection";
import EquipoEntregableSection from "@/components/EquipoEntregableSection";
import { EntregableRedistribuirHorasTrigger } from "@/components/EntregableRedistribuirHorasTrigger";

const fmtH = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtUF = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number | null) =>
  n == null ? "—" : `${n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtDate = (d: string | null) => formatDateForDisplayShort(d);

/** Presentación: saldo/consumo por categoría a partir de presup./gasto ya calculados. */
function saldoCategoria(presup: number, gasto: number) {
  return Math.round((presup - gasto) * 100) / 100;
}
function consumoCategoriaPct(presup: number, gasto: number): number | null {
  if (!(presup > 1e-9)) return null;
  return Math.round((gasto / presup) * 1000) / 10;
}

function BadgesAlertasActivas({ alertas, className = "" }: { alertas: AlertaActiva[]; className?: string }) {
  if (!alertas.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {alertas.map((a) => (
        <span key={a.id} className={claseBadgeAlertaActiva(a.tipo)} title={a.detalle}>
          {a.etiqueta}
        </span>
      ))}
    </div>
  );
}

export type EntregableTrabajoTab =
  | "resumen"
  | "planificacion"
  | "horas"
  | "equipo"
  | "gestion";

const TABS: { id: EntregableTrabajoTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "planificacion", label: "Planificación" },
  { id: "horas", label: "Horas / Costos" },
  { id: "equipo", label: "Equipo" },
  { id: "gestion", label: "Gestión" },
];

export type EntregableTrabajoModalProps = {
  row: EntregableVistaAnalisis;
  pmMap: Map<string, PmInterno>;
  profMap: Map<string, Profesional>;
  historial: HistorialRedistribucionHoras[];
  secondaryOpen?: boolean;
  puedeVerHoras: boolean;
  puedeVerFormularios: boolean;
  puedeEditarNotas: boolean;
  puedeGestionarEquipo: boolean;
  puedeEditarEntregableFechas: boolean;
  puedeCancelarEntregable: boolean;
  onClose: () => void;
  onGestionHoras: (entregableId: string) => void;
  onAbrirNota: () => void;
  onDetalleFormulario: () => void;
  onAbrirPausa: () => void;
  onReactivarPausa: () => void;
  onAbrirCancelar: () => void;
  onReactivarCancelacion: () => void;
};

export default function EntregableTrabajoModal({
  row,
  pmMap,
  profMap,
  historial,
  secondaryOpen = false,
  puedeVerHoras,
  puedeVerFormularios,
  puedeEditarNotas,
  puedeGestionarEquipo,
  puedeEditarEntregableFechas,
  puedeCancelarEntregable,
  onClose,
  onGestionHoras,
  onAbrirNota,
  onDetalleFormulario,
  onAbrirPausa,
  onReactivarPausa,
  onAbrirCancelar,
  onReactivarCancelacion,
}: EntregableTrabajoModalProps) {
  const ent = row.entregable;
  const cancelado = entregableEstaCancelado(ent);
  const pausado = entregableEstaPausado(ent);
  const liderNombre = profMap.get(ent.lider_id)?.nombre_completo ?? "—";
  const pmNombre =
    (row.proyecto.pm_interno_id && pmMap.get(row.proyecto.pm_interno_id)?.nombre) ||
    row.proyecto.pm_nombre ||
    "—";
  const faseCodigo =
    [ent.fase_codigo, ent.tarea_codigo].filter(Boolean).join(" · ") || null;

  const [tab, setTab] = useState<EntregableTrabajoTab>("resumen");

  useEffect(() => {
    setTab("resumen");
  }, [ent.id]);

  const cerrarSiLibre = () => {
    if (secondaryOpen) return;
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        aria-label="Cerrar modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/35 backdrop-blur-[1px]"
        onClick={cerrarSiLibre}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entregable-trabajo-titulo"
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="fixed inset-0 z-[210] flex items-stretch justify-center p-0 sm:items-center sm:p-3 md:p-4"
        onClick={cerrarSiLibre}
      >
        <div
          className="flex h-[100dvh] w-full max-w-none flex-col overflow-hidden bg-surface shadow-2xl sm:h-[90vh] sm:max-w-[min(92vw,1400px)] sm:rounded-r12 sm:border sm:border-bdr md:h-[88vh] md:max-w-[min(86vw,1400px)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* HEADER */}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-bdr px-4 py-2.5 md:px-5">
            <div className="min-w-0">
              <h2
                id="entregable-trabajo-titulo"
                className="font-sans text-[16px] font-semibold leading-snug text-t900 md:text-[17px]"
              >
                {ent.nombre}
              </h2>
              <p className="mt-0.5 truncate text-[12px] text-t500">
                {row.cliente.nombre}
                <span className="text-t300"> · </span>
                <span className="font-mono text-t600">{row.proyecto.codigo}</span>
                <span className="text-t300"> · </span>
                {row.proyecto.nombre}
                {faseCodigo ? (
                  <>
                    <span className="text-t300"> · </span>
                    <span className="font-mono text-t600">{faseCodigo}</span>
                  </>
                ) : null}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusPill
                  variant={entregableEstadoToStatusVariant(String(ent.estado))}
                  labelOverride={String(ent.estado)}
                />
                {cancelado ? (
                  <span className="rounded-r4 bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    Cancelado
                  </span>
                ) : null}
                {pausado ? (
                  <span className="rounded-r4 bg-sky-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    Pausado
                  </span>
                ) : null}
                {row.redistribuido ? (
                  <span className="rounded-r4 bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-teal-800">
                    Redistribuido
                  </span>
                ) : null}
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>

          {/* FRANJA EJECUTIVA */}
          <div className="shrink-0 border-b border-bdr bg-surface2/50 px-4 py-2 md:px-5">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
              <KpiMini label="Avance" value={fmtPct(row.avanceRealPct)} />
              <KpiMini label="Presup. h" value={fmtH(row.horasPresupuesto)} />
              <KpiMini label="Gasto h" value={fmtH(row.horasGastadas)} />
              <KpiMini label="Saldo" value={fmtH(row.saldoHoras)} emphasize={row.saldoHoras < 0} />
              <KpiMini label="UF P / G" value={`${fmtUF(row.ufPresup)} / ${fmtUF(row.ufGasto)}`} />
              <KpiMini label="Líder" value={liderNombre} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {row.alertasActivas.length > 0 ? (
                <>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-800">
                    Alertas
                  </span>
                  <BadgesAlertasActivas
                    alertas={row.alertasActivas}
                    className="text-[10px] [&_span]:text-[9px] [&_span]:font-bold [&_span]:uppercase"
                  />
                </>
              ) : (
                <span className="text-[11px] text-t400">Sin alertas</span>
              )}
            </div>
          </div>

          {/* TABS sticky */}
          <div className="shrink-0 border-b border-bdr bg-white/90">
            <div className="flex gap-0 overflow-x-auto px-2 md:px-4" role="tablist">
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`shrink-0 border-b-2 px-3.5 py-2.5 text-[12px] font-semibold transition-colors ${
                      active
                        ? "border-[#4F46E5] text-t900"
                        : "border-transparent text-t500 hover:text-t700"
                    }`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CONTENIDO */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-24 text-[13px] md:px-5 md:pb-5">
            {tab === "resumen" ? (
              <TabResumen
                row={row}
                pmNombre={pmNombre}
                cancelado={cancelado}
                pausado={pausado}
                faseCodigo={faseCodigo}
              />
            ) : null}

            {tab === "planificacion" ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
                <div className="min-w-0">
                  <EntregableFechasSection
                    entregable={ent}
                    puedeEditar={puedeEditarEntregableFechas}
                    compactHeader
                  />
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="rounded-r10 border border-bdr bg-white p-4">
                    <p className="text-[12px] font-semibold text-t800">Situación del entregable</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusPill
                        variant={entregableEstadoToStatusVariant(String(ent.estado))}
                        labelOverride={String(ent.estado)}
                      />
                      {cancelado ? (
                        <span className="rounded-r4 bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                          Cancelado
                        </span>
                      ) : null}
                      {pausado ? (
                        <span className="rounded-r4 bg-sky-800 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                          Pausado
                        </span>
                      ) : null}
                    </div>

                    {pausado ? (
                      <dl className="mt-3 grid grid-cols-1 gap-y-1.5 text-[12px] sm:grid-cols-2 sm:gap-x-3">
                        <dt className="text-t500">Desde</dt>
                        <dd className="text-t800">{fmtDate(ent.fecha_pausa ?? null)}</dd>
                        <dt className="text-t500">Motivo</dt>
                        <dd className="text-t800">{ent.motivo_pausa?.trim() || "—"}</dd>
                        <dt className="text-t500">Reinicio tentativo</dt>
                        <dd className="text-t800">
                          {ent.fecha_reinicio_tentativa
                            ? fmtDate(ent.fecha_reinicio_tentativa)
                            : "Sin programación"}
                        </dd>
                        <dt className="text-t500">Término tentativo</dt>
                        <dd className="text-t800">
                          {ent.fecha_termino_tentativa
                            ? fmtDate(ent.fecha_termino_tentativa)
                            : "Sin programación"}
                        </dd>
                      </dl>
                    ) : null}

                    {cancelado ? (
                      <dl className="mt-3 grid grid-cols-1 gap-y-1.5 text-[12px] sm:grid-cols-2 sm:gap-x-3">
                        <dt className="text-t500">Fecha</dt>
                        <dd className="text-t800">{fmtDate(ent.fecha_cancelacion ?? null)}</dd>
                        <dt className="text-t500">Motivo</dt>
                        <dd className="text-t800">{ent.motivo_cancelacion?.trim() || "—"}</dd>
                        <dt className="text-t500">Saldo anulado</dt>
                        <dd className="font-semibold tabular-nums text-slate-800">
                          {fmtH(calcularSaldoAnuladoHoras(row.horasPresupuesto, row.horasGastadas))}
                        </dd>
                      </dl>
                    ) : null}

                    {!pausado && !cancelado ? (
                      <p className="mt-3 text-[12px] text-t600">Entregable activo (sin pausa ni cancelación).</p>
                    ) : null}
                  </div>

                  {puedeCancelarEntregable ? (
                    <div className="rounded-r10 border border-bdr bg-white p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-t400">
                        Acciones de ciclo de vida
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        {!cancelado && !pausado ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="justify-start border-sky-200 text-[12px] text-sky-900"
                            onClick={onAbrirPausa}
                          >
                            Poner en pausa
                          </Button>
                        ) : null}
                        {pausado ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="justify-start border-sky-200 text-[12px] text-sky-900"
                              onClick={onAbrirPausa}
                            >
                              Editar pausa
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="justify-start text-[12px]"
                              onClick={onReactivarPausa}
                            >
                              Reactivar entregable
                            </Button>
                          </>
                        ) : null}
                        {cancelado ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="justify-start text-[12px]"
                            onClick={onReactivarCancelacion}
                          >
                            Reactivar entregable
                          </Button>
                        ) : null}
                      </div>

                      {!cancelado ? (
                        <>
                          <div className="my-3 border-t border-bdr" />
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-rose-700/80">
                            Zona crítica
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full justify-start border-rose-200 text-[12px] text-rose-800 hover:bg-rose-50"
                            onClick={onAbrirCancelar}
                          >
                            Cancelar entregable
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[12px] text-t500">Sin permisos de ciclo de vida para este rol.</p>
                  )}
                </div>
              </div>
            ) : null}

            {tab === "horas" ? (
              <TabHoras
                row={row}
                cancelado={cancelado}
                historial={historial}
                puedeVerHoras={puedeVerHoras}
                onGestionHoras={() => onGestionHoras(ent.id)}
              />
            ) : null}

            {tab === "equipo" ? (
              <EquipoEntregableSection entregable={ent} puedeEditar={puedeGestionarEquipo} wideLayout />
            ) : null}

            {tab === "gestion" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-r10 border border-bdr bg-white p-4">
                  <p className="text-[12px] font-semibold text-t800">Nota de seguimiento</p>
                  {ent.nota_seguimiento ? (
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-t700">
                      {ent.nota_seguimiento}
                    </p>
                  ) : (
                    <p className="mt-2 text-[13px] text-t500">Sin nota registrada.</p>
                  )}
                  {puedeEditarNotas ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-1.5 text-[12px]"
                      onClick={onAbrirNota}
                    >
                      <StickyNote size={14} /> {ent.nota_seguimiento ? "Editar nota" : "Agregar nota"}
                    </Button>
                  ) : null}
                </div>
                {puedeVerFormularios ? (
                  <div className="rounded-r10 border border-bdr bg-white p-4">
                    <p className="text-[12px] font-semibold text-t800">Accesos</p>
                    <p className="mt-1 text-[12px] text-t500">
                      Abrir el registro completo del entregable en Formularios.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-1.5 text-[12px]"
                      onClick={onDetalleFormulario}
                    >
                      <LayoutList size={14} /> Detalle formulario
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function KpiMini({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-r8 bg-white/90 px-2.5 py-1.5 ring-1 ring-bdr/70">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-t400">{label}</p>
      <p
        className={`mt-0.5 truncate text-[14px] font-semibold tabular-nums md:text-[15px] ${
          emphasize ? "text-rose-700" : "text-t900"
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-t400">{label}</p>
      <div className="mt-0.5 text-[13px] text-t800">{children}</div>
    </div>
  );
}

function TabResumen({
  row,
  pmNombre,
  cancelado,
  pausado,
  faseCodigo,
}: {
  row: EntregableVistaAnalisis;
  pmNombre: string;
  cancelado: boolean;
  pausado: boolean;
  faseCodigo: string | null;
}) {
  const ent = row.entregable;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-r10 border border-bdr bg-white p-4">
          <p className="text-[12px] font-semibold text-t800">Planificación general</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="PM">{pmNombre}</Field>
            <Field label="Fase / código">{faseCodigo || "—"}</Field>
            <Field label="Inicio">{fmtDate(ent.fecha_inicio)}</Field>
            <Field label="Término">{fmtDate(ent.fecha_termino)}</Field>
            <Field label="Rev. A">{fmtDate(ent.fecha_revA)}</Field>
            <Field label="Rev. B">{fmtDate(ent.fecha_revB)}</Field>
            <Field label="Rev. P">{fmtDate(ent.fecha_revP)}</Field>
          </div>
        </section>

        <section className="rounded-r10 border border-bdr bg-white p-4">
          <p className="text-[12px] font-semibold text-t800">Estado / seguimiento</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Estado">
              <StatusPill
                variant={entregableEstadoToStatusVariant(String(ent.estado))}
                labelOverride={String(ent.estado)}
              />
            </Field>
            <Field label="Avance teórico">{fmtPct(row.avanceTeoricoPct)}</Field>
            <Field label="Redistribuido">{row.redistribuido ? "Sí (histórico)" : "No"}</Field>
          </div>
          {ent.nota_seguimiento ? (
            <div className="mt-3 rounded-r8 bg-amber-50/70 px-3 py-2 text-[13px] text-t700">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/70">Nota</p>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap">{ent.nota_seguimiento}</p>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-t400">Sin nota de seguimiento.</p>
          )}
        </section>
      </div>

      {pausado ? (
        <section className="rounded-r10 border border-sky-200 bg-sky-50/50 p-4">
          <p className="text-[12px] font-bold uppercase tracking-wide text-sky-900">Pausado</p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Desde">{fmtDate(ent.fecha_pausa ?? null)}</Field>
            <Field label="Motivo">{ent.motivo_pausa?.trim() || "—"}</Field>
            <Field label="Reinicio tentativo">
              {ent.fecha_reinicio_tentativa ? fmtDate(ent.fecha_reinicio_tentativa) : "Sin programación"}
            </Field>
            <Field label="Término tentativo">
              {ent.fecha_termino_tentativa ? fmtDate(ent.fecha_termino_tentativa) : "Sin programación"}
            </Field>
          </div>
        </section>
      ) : null}

      {cancelado ? (
        <section className="rounded-r10 border border-slate-300 bg-slate-50 p-4">
          <p className="text-[12px] font-bold uppercase tracking-wide text-slate-800">Cancelado</p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Fecha">{fmtDate(ent.fecha_cancelacion ?? null)}</Field>
            <Field label="Motivo">{ent.motivo_cancelacion?.trim() || "—"}</Field>
            <Field label="Saldo anulado">
              <span className="font-semibold tabular-nums">
                {fmtH(calcularSaldoAnuladoHoras(row.horasPresupuesto, row.horasGastadas))}
              </span>
            </Field>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TabHoras({
  row,
  cancelado,
  historial,
  puedeVerHoras,
  onGestionHoras,
}: {
  row: EntregableVistaAnalisis;
  cancelado: boolean;
  historial: HistorialRedistribucionHoras[];
  puedeVerHoras: boolean;
  onGestionHoras: () => void;
}) {
  const ent = row.entregable;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        <KpiMini label="UF presupuesto" value={fmtUF(row.ufPresup)} />
        <KpiMini label="UF gasto" value={fmtUF(row.ufGasto)} />
        <KpiMini label="Horas presup." value={fmtH(row.horasPresupuesto)} />
        <KpiMini label="Horas gasto" value={fmtH(row.horasGastadas)} />
        <KpiMini label="Saldo" value={fmtH(row.saldoHoras)} emphasize={row.saldoHoras < 0} />
      </div>
      {cancelado ? (
        <p className="text-[12px] text-slate-700">
          Saldo anulado:{" "}
          <span className="font-semibold tabular-nums">
            {fmtH(calcularSaldoAnuladoHoras(row.horasPresupuesto, row.horasGastadas))}
          </span>
          <span className="text-t500"> · no proyectable · no suma a gasto real</span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-x-auto rounded-r10 border border-bdr bg-white">
          <table className="w-full min-w-[420px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-bdr bg-slate-50/90 text-left text-[10px] font-semibold uppercase tracking-wide text-t500">
                <th className="px-3 py-2.5">Categoría</th>
                <th className="px-3 py-2.5 text-right">Presupuesto</th>
                <th className="px-3 py-2.5 text-right">Gastado</th>
                <th className="px-3 py-2.5 text-right">Saldo</th>
                <th className="px-3 py-2.5 text-right">Consumo</th>
              </tr>
            </thead>
            <tbody>
              {row.horasPorCategoria.map((fila) => {
                const saldo = saldoCategoria(fila.horasPresupuesto, fila.horasGastadas);
                const consumo = consumoCategoriaPct(fila.horasPresupuesto, fila.horasGastadas);
                return (
                  <tr key={fila.categoria} className="border-b border-bdr/50 last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-t800">{fila.categoria}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-t800">
                      {fmtH(fila.horasPresupuesto)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-t800">
                      {fmtH(fila.horasGastadas)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums ${
                        saldo < 0 ? "font-semibold text-rose-700" : "text-t800"
                      }`}
                    >
                      {fmtH(saldo)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-t700">
                      {consumo == null ? "—" : `${fmtPct(consumo)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3">
          <div className="rounded-r10 border border-bdr bg-white p-4">
            <p className="text-[12px] font-semibold text-t800">Alertas y estado</p>
            <div className="mt-2">
              {row.alertasActivas.length > 0 ? (
                <>
                  <BadgesAlertasActivas
                    alertas={row.alertasActivas}
                    className="text-[11px] [&_span]:text-[10px] [&_span]:font-bold [&_span]:uppercase"
                  />
                  {(() => {
                    const deficit = row.alertasActivas.find((a) => a.tipo === "SOBRECONSUMO_CATEGORIA");
                    const lineas = deficit ? lineasDetalleAlertaDeficitCategoria(deficit) : [];
                    if (lineas.length === 0) return null;
                    return (
                      <ul className="mt-2 list-inside list-disc space-y-0.5 text-[12px] text-rose-900/90">
                        {lineas.map((ln) => (
                          <li key={ln}>{ln}</li>
                        ))}
                      </ul>
                    );
                  })()}
                </>
              ) : (
                <p className="text-[12px] text-t500">Sin alertas</p>
              )}
              {row.redistribuido ? (
                <p className="mt-2 text-[11px] text-teal-800">
                  <span className="rounded-r4 bg-teal-500/15 px-1.5 py-0.5 font-bold uppercase">
                    Redistribuido
                  </span>{" "}
                  (histórico)
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-r10 border border-bdr bg-white p-4">
            <p className="text-[12px] font-semibold text-t800">Acciones</p>
            <div className="mt-3 flex flex-col gap-2">
              <EntregableRedistribuirHorasTrigger ent={ent} />
              {puedeVerHoras ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start gap-1.5 text-[12px]"
                  onClick={onGestionHoras}
                >
                  <Clock size={14} /> Control de Horas
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-r10 border border-bdr bg-white p-4">
        <p className="text-[12px] font-semibold text-t800">Historial redistribuciones</p>
        {historial.length === 0 ? (
          <p className="mt-2 text-[12px] text-t500">Sin movimientos registrados.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-bdr text-left text-[10px] font-semibold uppercase tracking-wide text-t500">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2 text-right">Δ UF</th>
                  <th className="px-2 py-2">Comentario</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id} className="border-b border-bdr/40 last:border-b-0">
                    <td className="whitespace-nowrap px-2 py-2 text-t800">{fmtDate(h.fecha)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-t700">
                      {h.diferencia_uf >= 0 ? "+" : ""}
                      {fmtUF(h.diferencia_uf)}
                    </td>
                    <td className="px-2 py-2 text-t600">{h.comentario?.trim() || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
