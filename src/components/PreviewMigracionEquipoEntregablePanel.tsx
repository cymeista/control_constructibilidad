import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import type { EquipoEntregable } from "@/context/AppDataContext";
import {
  estimarAplicacionMigracionEquipoEntregable,
  type ResumenAplicacionMigracionEquipo,
} from "@/equipo/aplicarMigracionEquipoEntregable";
import type { PreviewMigracionEquipoInput } from "@/equipo/previewMigracionEquipoEntregable";
import {
  computePreviewMigracionEquipoEntregable,
  type EstadoVisualPreviewEquipo,
  type FilaPreviewMigracionEquipo,
} from "@/equipo/previewMigracionEquipoEntregable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ESTADO_STYLES: Record<EstadoVisualPreviewEquipo, { bg: string; text: string; border: string }> = {
  OK: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
  "Sin equipo": { bg: "#F3F4F6", text: "#4B5563", border: "#D1D5DB" },
  "Revisar líder": { bg: "#FEF3C7", text: "#B45309", border: "#FCD34D" },
  "Múltiples líderes": { bg: "#FEE2E2", text: "#B91C1C", border: "#FECACA" },
  "Gasto sin equipo": { bg: "#EEF2FF", text: "#4338CA", border: "#C7D2FE" },
};

const ORIGEN_LABEL: Record<string, string> = {
  asignacion_activa: "Asignación activa",
  asignacion_cerrada: "Asignación cerrada",
  lider_id_entregable: "lider_id entregable",
};

function fmtH(n: number) {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function EstadoBadge({ estado }: { estado: EstadoVisualPreviewEquipo }) {
  const s = ESTADO_STYLES[estado];
  return (
    <span
      className="inline-flex rounded-[10px] border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[.04em]"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      {estado}
    </span>
  );
}

function DeclaracionEquipoBadge({ enEquipo }: { enEquipo: boolean }) {
  if (enEquipo) {
    return (
      <span className="inline-flex shrink-0 rounded-[10px] border border-emerald-300 bg-emerald-50 px-2 py-[2px] text-[10px] font-semibold text-emerald-800">
        En equipo
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 rounded-[10px] border border-indigo-300 bg-indigo-50 px-2 py-[2px] text-[10px] font-semibold text-indigo-800">
      No declarado
    </span>
  );
}

function gastoRealLiderTexto(
  fila: FilaPreviewMigracionEquipo,
  liderProfesionalId: string,
): string {
  const col = fila.colaboracion.find((c) => c.profesional_id === liderProfesionalId);
  if (!col || col.horas_reales <= 0) return "Sin gasto";
  return `${fmtH(col.horas_reales)} h · ${col.pct_colaboracion}%`;
}

function ResumenKpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-r8 border border-bdr bg-[#F7F8FA] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[.06em] text-t500">{label}</p>
      <p className="mt-0.5 font-mono text-[18px] font-bold" style={{ color: accent ?? "#111827" }}>
        {value.toLocaleString("es-CL")}
      </p>
    </div>
  );
}

function FilaDetalle({
  fila,
  profMap,
  expanded,
  onToggle,
}: {
  fila: FilaPreviewMigracionEquipo;
  profMap: Map<string, string>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const apoyos =
    fila.apoyos_propuestos.length === 0
      ? "—"
      : fila.apoyos_propuestos.map((a) => a.nombre).join(", ");
  const equipoIds = new Set(fila.integrantes.map((i) => i.profesional_id));

  return (
    <div className="rounded-r8 border border-bdr bg-white">
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F7F8FA]"
        onClick={onToggle}
      >
        <div className="mt-0.5 shrink-0 text-t500">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold text-t900">{fila.entregable_nombre}</p>
            <EstadoBadge estado={fila.estado_visual} />
            <span className="text-[11px] text-t500">
              {fila.estado_avance} · {fila.avance_pct}%
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-t500">
            {fila.cliente_nombre} · {fila.proyecto_codigo} — {fila.proyecto_nombre}
          </p>
          <div className="mt-2 grid gap-1 text-[11px] text-t700 sm:grid-cols-2">
            <span>
              <span className="text-t500">Líder actual:</span> {fila.lider_nombre_actual}
            </span>
            <span>
              <span className="text-t500">Apoyos propuestos:</span> {apoyos}
            </span>
            <span className="sm:col-span-2">
              <span className="text-t500">Gasto real total entregable:</span>{" "}
              <span className="font-mono">{fmtH(fila.horas_reales_totales)}</span>
              {fila.horas_reales_totales <= 0 ? " (Sin gasto)" : ""}
            </span>
          </div>
          {fila.lideres_propuestos.length > 0 ? (
            <div className="mt-2 space-y-1 rounded-r6 border border-bdr bg-[#F7F8FA] px-3 py-2">
              {fila.lideres_propuestos.map((l) => (
                <p key={l.profesional_id} className="text-[11px] text-t700">
                  <span className="font-semibold text-t800">Líder propuesto:</span> {l.nombre}
                  <span className="text-t500"> · </span>
                  <span className="text-t500">Gasto real del líder:</span>{" "}
                  <span className="font-mono font-medium text-t800">
                    {gastoRealLiderTexto(fila, l.profesional_id)}
                  </span>
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-t500">
              <span className="text-t500">Líder propuesto:</span> —
            </p>
          )}
          {fila.gasto_sin_equipo.length > 0 ? (
            <p className="mt-1.5 text-[11px] font-medium text-indigo-800">
              {fila.gasto_sin_equipo.length} profesional(es) con gasto real no declarados en equipo
            </p>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-bdr px-4 pb-4 pt-3">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.07em] text-t300">
                Equipo propuesto
              </p>
              {fila.integrantes.length === 0 ? (
                <p className="text-[12px] text-t500">Sin integrantes propuestos.</p>
              ) : (
                <ul className="space-y-2">
                  {fila.integrantes.map((i) => (
                    <li
                      key={i.profesional_id}
                      className="rounded-r6 border border-bdr bg-[#F7F8FA] px-3 py-2 text-[11px]"
                    >
                      <p className="font-semibold text-t800">
                        {profMap.get(i.profesional_id) ?? i.profesional_id}{" "}
                        <span className="font-normal text-t500">({i.rol})</span>
                      </p>
                      <p className="mt-0.5 text-t600">
                        Origen: {i.origenes.map((o) => ORIGEN_LABEL[o] ?? o).join(" · ")}
                      </p>
                      {i.duplicadoResuelto ? (
                        <p className="mt-0.5 text-amber-800">Duplicado resuelto automáticamente</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.07em] text-t300">
                Gasto real del entregable según RegistroHora
              </p>
              <p className="mb-2 text-[10px] leading-snug text-t500">
                Incluye a todos con horas DIRECTAS válidas. El badge indica si ya figuran en el equipo propuesto.
              </p>
              {fila.colaboracion.length === 0 ? (
                <p className="text-[12px] text-t500">Sin gasto real registrado.</p>
              ) : (
                <ul className="space-y-2">
                  {fila.colaboracion.map((c) => {
                    const enEquipo = equipoIds.has(c.profesional_id);
                    return (
                      <li
                        key={c.profesional_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-r6 border border-bdr bg-white px-2.5 py-2 text-[11px] text-t700"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="font-medium text-t800">
                            {profMap.get(c.profesional_id) ?? c.profesional_id}
                          </span>
                          <DeclaracionEquipoBadge enEquipo={enEquipo} />
                        </div>
                        <span className="font-mono shrink-0">
                          {fmtH(c.horas_reales)} h · {c.pct_colaboracion}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {fila.gasto_sin_equipo.length > 0 ? (
            <div className="mt-4 rounded-r6 border border-indigo-200 bg-indigo-50/80 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[.07em] text-indigo-900">
                Profesionales con gasto real no declarados en equipo
              </p>
              <p className="mt-1 text-[10px] leading-snug text-indigo-800/90">
                Solo quienes tienen gasto real y no están en el equipo propuesto. Sugerencia pendiente (no se agregan
                automáticamente).
              </p>
              <ul className="mt-2 space-y-1.5">
                {fila.gasto_sin_equipo.map((g) => (
                  <li key={g.profesional_id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium text-indigo-950">
                      {profMap.get(g.profesional_id) ?? g.profesional_id}
                    </span>
                    <span className="text-indigo-800">
                      <span className="font-mono">{fmtH(g.horas_reales)}</span> h · {g.pct_colaboracion}% ·{" "}
                      <span className="font-semibold">{g.sugerencia}</span>
                      <span className="ml-1 text-[10px] text-indigo-600">(origen: sugerido_por_gasto_real)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {fila.observaciones.length > 0 ? (
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.07em] text-t300">
                Conflictos / observaciones
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-[11px] text-t600">
                {fila.observaciones.map((o, idx) => (
                  <li key={idx}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResumenAplicacionMigracionBlock({ resumen }: { resumen: ResumenAplicacionMigracionEquipo }) {
  const items = [
    { label: "Integrantes creados", value: resumen.integrantes_creados },
    { label: "Omitidos (ya existían)", value: resumen.integrantes_omitidos_duplicado },
    { label: "Roles actualizados (LIDER priorizado)", value: resumen.integrantes_actualizados_rol },
    { label: "Líderes creados", value: resumen.lideres_creados },
    { label: "Apoyos creados", value: resumen.apoyos_creados },
    { label: "Conflictos múltiples líderes (detectados)", value: resumen.conflictos_multiples_lideres },
    { label: "Conflictos lider_id vs asignaciones", value: resumen.conflictos_lider_id_vs_asignaciones },
    { label: "Duplicados resueltos en previsualización", value: resumen.duplicados_resueltos_en_preview },
    {
      label: "Sugeridos por gasto real no aplicados",
      value: resumen.sugeridos_gasto_no_aplicados,
    },
  ];
  return (
    <div className="rounded-r8 border border-emerald-500/40 bg-emerald-50/80 p-3">
      <p className="text-[12px] font-semibold text-emerald-950">Migración aplicada</p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between gap-2 text-[11px]">
            <span className="text-emerald-900/90">{item.label}</span>
            <span className="font-mono font-semibold text-emerald-950">{item.value}</span>
          </div>
        ))}
      </div>
      {resumen.observaciones.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-[10px] text-emerald-900/85">
          {resumen.observaciones.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type Props = {
  input: PreviewMigracionEquipoInput;
  equipoActual: EquipoEntregable[];
  onAplicarMigracion: () => ResumenAplicacionMigracionEquipo;
};

export default function PreviewMigracionEquipoEntregablePanel({
  input,
  equipoActual,
  onAplicarMigracion,
}: Props) {
  const equipoActualCount = equipoActual.length;
  const [q, setQ] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoVisualPreviewEquipo | "TODOS">("TODOS");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyResult, setApplyResult] = useState<ResumenAplicacionMigracionEquipo | null>(null);

  const preview = useMemo(() => computePreviewMigracionEquipoEntregable(input), [input]);

  const estimacionMigracion = useMemo(
    () => estimarAplicacionMigracionEquipoEntregable(equipoActual, preview),
    [equipoActual, preview],
  );

  const profMap = useMemo(
    () => new Map(input.profesionales.map((p) => [p.id, p.nombre_completo])),
    [input.profesionales],
  );

  const filasFiltradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return preview.filas.filter((f) => {
      if (filtroEstado !== "TODOS" && f.estado_visual !== filtroEstado) return false;
      if (!needle) return true;
      const hay = [
        f.cliente_nombre,
        f.proyecto_codigo,
        f.proyecto_nombre,
        f.entregable_nombre,
        f.lider_nombre_actual,
        ...f.lideres_propuestos.map((l) => l.nombre),
        ...f.apoyos_propuestos.map((a) => a.nombre),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [preview.filas, q, filtroEstado]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { resumen } = preview;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-r8 border border-indigo-200 bg-indigo-50/50 px-3 py-2.5">
        <p className="text-[12px] font-semibold text-indigo-950">Previsualización y migración inicial</p>
        <p className="mt-1 text-[11px] leading-snug text-indigo-900/90">
          La previsualización deriva participación desde asignaciones ACTIVAS y CERRADAS (solo rol líder/apoyo, sin
          horas ni fechas). «Aplicar migración» escribe en <span className="font-mono">equipo_entregable</span> sin
          modificar <span className="font-mono">asignaciones_horas</span>. Registros actuales en equipo:{" "}
          <span className="font-mono font-semibold">{equipoActualCount}</span>.
        </p>
        <Button
          type="button"
          className="mt-3 bg-[#4F46E5] text-white hover:bg-[#3730A3]"
          onClick={() => setConfirmOpen(true)}
        >
          Aplicar migración de equipo
        </Button>
      </div>

      {applyResult ? <ResumenAplicacionMigracionBlock resumen={applyResult} /> : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto rounded-[12px] border border-bdr bg-white p-6 shadow-sh3 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-playfair text-[16px] font-semibold text-t900">
              Aplicar migración de equipo
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1 text-left text-[12px] text-t600">
                <p className="text-t700">Revise qué ocurrirá al confirmar:</p>
                <ul className="list-inside list-decimal space-y-1.5 leading-snug">
                  <li>
                    Se migrarán asignaciones <strong className="font-semibold text-t800">ACTIVAS</strong> y{" "}
                    <strong className="font-semibold text-t800">CERRADAS</strong> solo como participación líder/apoyo, más
                    el <strong className="font-semibold text-t800">lider_id</strong> del entregable.{" "}
                    <strong className="font-semibold text-t800">No</strong> se migrarán horas, fechas ni cierres
                    históricos.
                  </li>
                  <li>
                    <strong className="font-semibold text-t800">No</strong> se migrarán profesionales detectados solo por
                    gasto real en RegistroHora (seguirán como sugerencia «Agregar como apoyo»).
                  </li>
                  <li>
                    <strong className="font-semibold text-t800">No</strong> se modificarán ni eliminarán registros en{" "}
                    <span className="font-mono text-[11px]">asignaciones_horas</span>.
                  </li>
                </ul>
                <div className="rounded-r8 border border-bdr bg-[#F7F8FA] p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.07em] text-t500">
                    Conteo estimado (según datos actuales)
                  </p>
                  <div className="space-y-1.5">
                    {[
                      {
                        label: "Integrantes que se crearán",
                        value: estimacionMigracion.integrantes_creados,
                        accent: "#047857",
                      },
                      {
                        label: "Líderes que se crearán",
                        value: estimacionMigracion.lideres_creados,
                        accent: "#4F46E5",
                      },
                      {
                        label: "Apoyos que se crearán",
                        value: estimacionMigracion.apoyos_creados,
                        accent: "#4F46E5",
                      },
                      {
                        label: "Sugeridos por gasto real que NO se aplicarán",
                        value: estimacionMigracion.sugeridos_gasto_no_aplicados,
                        accent: "#4338CA",
                      },
                      {
                        label: "Duplicados que se omitirán (ya en equipo)",
                        value: estimacionMigracion.integrantes_omitidos_duplicado,
                        accent: "#6B7280",
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="text-t700">{row.label}</span>
                        <span className="font-mono text-[13px] font-bold" style={{ color: row.accent }}>
                          {row.value.toLocaleString("es-CL")}
                        </span>
                      </div>
                    ))}
                  </div>
                  {estimacionMigracion.integrantes_actualizados_rol > 0 ? (
                    <p className="mt-2 text-[10px] text-amber-800">
                      Además, se actualizarán{" "}
                      <span className="font-mono font-semibold">
                        {estimacionMigracion.integrantes_actualizados_rol}
                      </span>{" "}
                      rol(es) existente(s) de APOYO a LIDER (sin crear fila nueva).
                    </p>
                  ) : null}
                  <p className="mt-2 text-[10px] text-t500">
                    Registros actuales en equipo:{" "}
                    <span className="font-mono font-medium text-t700">{equipoActualCount}</span>
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#4F46E5] text-white hover:bg-[#3730A3]"
              onClick={() => {
                const resumen = onAplicarMigracion();
                setApplyResult(resumen);
                setConfirmOpen(false);
              }}
            >
              Confirmar y aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <ResumenKpi label="Entregables revisados" value={resumen.total_entregables} />
        <ResumenKpi label="Con equipo propuesto" value={resumen.entregables_con_equipo} accent="#047857" />
        <ResumenKpi label="Sin equipo propuesto" value={resumen.entregables_sin_equipo} accent="#6B7280" />
        <ResumenKpi label="Líderes propuestos" value={resumen.total_lideres_propuestos} accent="#4F46E5" />
        <ResumenKpi label="Apoyos propuestos" value={resumen.total_apoyos_propuestos} accent="#4F46E5" />
        <ResumenKpi
          label="Múltiples líderes"
          value={resumen.conflictos_multiples_lideres}
          accent="#B91C1C"
        />
        <ResumenKpi
          label="lider_id vs asignaciones"
          value={resumen.conflictos_lider_id_vs_asignaciones}
          accent="#B45309"
        />
        <ResumenKpi
          label="Gasto sin equipo (casos)"
          value={resumen.profesionales_gasto_sin_equipo}
          accent="#4338CA"
        />
        <ResumenKpi
          label="Duplicados resueltos"
          value={resumen.duplicados_resueltos_automaticamente}
          accent="#6B7280"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t400" />
          <input
            type="search"
            placeholder="Buscar cliente, proyecto, entregable, líder…"
            className="w-full rounded-r8 border border-bdr py-2 pl-9 pr-3 text-[12px] text-t700 focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[rgba(99,102,241,.12)]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="rounded-r8 border border-bdr px-3 py-2 text-[12px] text-t700 focus:border-[#6366F1] focus:outline-none"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoVisualPreviewEquipo | "TODOS")}
        >
          <option value="TODOS">Todos los estados</option>
          {(Object.keys(ESTADO_STYLES) as EstadoVisualPreviewEquipo[]).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-t500">
        Mostrando {filasFiltradas.length} de {preview.filas.length} entregables
      </p>

      <div className="flex max-h-[min(70vh,720px)] flex-col gap-2 overflow-y-auto pr-1">
        {filasFiltradas.length === 0 ? (
          <p className="rounded-r8 border border-bdr bg-[#F7F8FA] px-4 py-8 text-center text-[12px] text-t500">
            No hay entregables que coincidan con el filtro.
          </p>
        ) : (
          filasFiltradas.map((fila) => (
            <FilaDetalle
              key={fila.entregable_id}
              fila={fila}
              profMap={profMap}
              expanded={expanded.has(fila.entregable_id)}
              onToggle={() => toggle(fila.entregable_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
