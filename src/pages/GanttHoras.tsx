/**
 * Vista Gantt de Horas / Proyección de Horas.
 * Solo lectura: consume `buildProyeccionHorasSnapshot` sin mutar AppData.
 */

import { useMemo, useState } from "react";
import { useAppData } from "@/context/AppDataContext";
import SectionHeader from "@/components/SectionHeader";
import KpiCard, {
  kpiDashboardSingleRowClassName,
  kpiDashboardSingleRowItemClassName,
} from "@/components/KpiCard";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateForDisplay } from "@/lib/localDate";
import { fechaHoyIsoLocal } from "@/entregables/asignacionHoraConsumo";
import {
  buildProyeccionHorasSnapshot,
  type ProyeccionHorasEntregableRow,
  type ProyeccionHorasHorizonteMeses,
  type ProyeccionHorasObservacion,
} from "@/proyeccionHoras";

const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

const fmtH = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const fmtPct = (n: number | null) =>
  n == null
    ? "—"
    : `${n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;

function labelMesCorto(mesIso: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mesIso);
  if (!m) return mesIso;
  const y = m[1]!.slice(2);
  const idx = Number(m[2]) - 1;
  const corto = idx >= 0 && idx < 12 ? MESES_CORTO[idx] : "?";
  return `${corto}-${y}`;
}

function fmtFechaCorta(iso: string): string {
  return formatDateForDisplay(iso, "-");
}

function etiquetaObservacion(codigo: ProyeccionHorasObservacion["codigo"]): string {
  switch (codigo) {
    case "SIN_FECHAS":
      return "Sin fechas";
    case "FECHAS_INVALIDAS":
      return "Fechas inválidas";
    case "SALDO_CERO":
      return "Saldo cero";
    case "COMPLETADO":
      return "Completado";
    case "PROYECTO_NO_ACTIVO":
      return "Proyecto no activo";
    case "FUERA_HORIZONTE":
      return "Fuera de horizonte";
    case "SIN_DIAS_HABILES":
      return "Sin días hábiles";
    case "SALDO_VENCIDO":
      return "Saldo vencido";
    default:
      return codigo;
  }
}

type GrupoProyecto = {
  proyecto: {
    id: string;
    etiqueta: string;
    cliente_nombre: string;
    saldo: number;
    meses: { mes: string; horas: number }[];
    n: number;
  };
  entregables: ProyeccionHorasEntregableRow[];
};

export default function GanttHoras() {
  const {
    clientes,
    proyectos,
    entregables,
    profesionales,
    registro_horas,
    curvas_objetivo_anual,
  } = useAppData();

  const [horizonteMeses, setHorizonteMeses] = useState<ProyeccionHorasHorizonteMeses>(8);
  const [incluirL2, setIncluirL2] = useState(false);

  const fechaConsulta = useMemo(() => fechaHoyIsoLocal(), []);

  const snapshot = useMemo(
    () =>
      buildProyeccionHorasSnapshot(
        {
          clientes,
          proyectos,
          entregables,
          profesionales,
          registro_horas,
          curvas_objetivo_anual: curvas_objetivo_anual ?? [],
        },
        {
          fechaConsulta,
          horizonteMeses,
          incluirL2,
          factorCargabilidadPct: 100,
        },
      ),
    [
      clientes,
      proyectos,
      entregables,
      profesionales,
      registro_horas,
      curvas_objetivo_anual,
      fechaConsulta,
      horizonteMeses,
      incluirL2,
    ],
  );

  const grupos = useMemo((): GrupoProyecto[] => {
    const byId = new Map<string, GrupoProyecto>();
    for (const agg of snapshot.agregados_proyecto) {
      byId.set(agg.id, {
        proyecto: {
          id: agg.id,
          etiqueta: agg.etiqueta,
          cliente_nombre: "",
          saldo: agg.saldo_horas_total,
          meses: agg.meses,
          n: agg.n_entregables,
        },
        entregables: [],
      });
    }
    for (const row of snapshot.entregables) {
      let g = byId.get(row.proyecto_id);
      if (!g) {
        g = {
          proyecto: {
            id: row.proyecto_id,
            etiqueta: `${row.proyecto_codigo} · ${row.proyecto_nombre}`,
            cliente_nombre: row.cliente_nombre,
            saldo: 0,
            meses: snapshot.meses_horizonte.map((mes) => ({ mes, horas: 0 })),
            n: 0,
          },
          entregables: [],
        };
        byId.set(row.proyecto_id, g);
      }
      g.proyecto.cliente_nombre = row.cliente_nombre;
      g.entregables.push(row);
    }
    return [...byId.values()].sort((a, b) => {
      const c = a.proyecto.cliente_nombre.localeCompare(b.proyecto.cliente_nombre, "es");
      if (c) return c;
      return a.proyecto.etiqueta.localeCompare(b.proyecto.etiqueta, "es");
    });
  }, [snapshot]);

  const horasDisponiblesTotal = useMemo(
    () => snapshot.comparacion_curva.reduce((s, m) => s + m.horas_disponibles, 0),
    [snapshot.comparacion_curva],
  );
  const horasProyectadasTotal = snapshot.total_general.horas_en_horizonte;
  const brechaTotal = Math.round((horasDisponiblesTotal - horasProyectadasTotal) * 100) / 100;
  const utilizacionTotal =
    horasDisponiblesTotal > 1e-9
      ? Math.round((horasProyectadasTotal / horasDisponiblesTotal) * 10000) / 100
      : null;

  const nObservaciones =
    snapshot.observaciones.length +
    snapshot.comparacion_curva.filter((c) => Boolean(c.observacion)).length;

  const stickyLeft =
    "sticky left-0 z-[1] bg-inherit shadow-[2px_0_0_0_rgba(15,23,42,0.04)]";

  return (
    <div className="space-y-5">
      <SectionHeader
        number="GH"
        title="Gantt de Horas"
        hint="Proyección mensual del saldo pendiente por entregable (días hábiles desde inicio efectivo). Solo lectura."
      />

      <div className="flex flex-wrap items-end gap-4 rounded-r10 border border-bdr bg-white px-3 py-3 shadow-xs">
        <div className="flex min-w-[9rem] flex-col gap-1.5">
          <Label className="text-[11px] font-semibold text-t600">Horizonte</Label>
          <Select
            value={String(horizonteMeses)}
            onValueChange={(v) => {
              const n = Number(v);
              if (n === 6 || n === 8 || n === 12) setHorizonteMeses(n);
            }}
          >
            <SelectTrigger className="h-9 w-[9.5rem] rounded-r8 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="8">8 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Checkbox
            id="gantt-horas-incluir-l2"
            checked={incluirL2}
            onCheckedChange={(v) => setIncluirL2(v === true)}
          />
          <Label htmlFor="gantt-horas-incluir-l2" className="cursor-pointer text-[12px] font-medium text-t800">
            Incluir L2
          </Label>
        </div>

        <div className="flex min-w-[10rem] flex-col gap-1 pb-1.5 text-[11px] text-t600">
          <span className="font-semibold">Fecha de consulta</span>
          <span className="font-mono text-[12px] text-t800">{fmtFechaCorta(fechaConsulta)}</span>
        </div>

        <p className="pb-1.5 text-[10px] leading-snug text-t500 sm:ml-auto sm:max-w-sm sm:text-right">
          Saldo = presupuesto vigente − gasto real DIRECTA
          {incluirL2 ? " (L2+P4+P3+P2)" : " (P4+P3+P2; L2 excluido)"}. Distribución desde inicio efectivo.
        </p>
      </div>

      <div className={kpiDashboardSingleRowClassName}>
        <div className={kpiDashboardSingleRowItemClassName}>
          <KpiCard
            compact
            label="Horas proyectadas"
            value={fmtH(horasProyectadasTotal)}
            subtitle="En horizonte"
            topColor="#0F766E"
          />
        </div>
        <div className={kpiDashboardSingleRowItemClassName}>
          <KpiCard
            compact
            label="Disponibles (curva)"
            value={fmtH(horasDisponiblesTotal)}
            subtitle="Objetivo mensual 100%"
            topColor="#1e4a6e"
          />
        </div>
        <div className={kpiDashboardSingleRowItemClassName}>
          <KpiCard
            compact
            label="Brecha total"
            value={fmtH(brechaTotal)}
            subtitle={brechaTotal < 0 ? "Sobrecarga" : "Holgura"}
            topColor={brechaTotal < 0 ? "#B91C1C" : "#047857"}
          />
        </div>
        <div className={kpiDashboardSingleRowItemClassName}>
          <KpiCard
            compact
            label="Utilización"
            value={fmtPct(utilizacionTotal)}
            subtitle="Proyectadas / disponibles"
            topColor="#B45309"
          />
        </div>
        <div className={kpiDashboardSingleRowItemClassName}>
          <KpiCard
            compact
            label="Entregables"
            value={String(snapshot.conteos.entregables_proyectados)}
            subtitle="Proyectados"
            topColor="#475569"
          />
        </div>
        <div className={kpiDashboardSingleRowItemClassName}>
          <KpiCard
            compact
            label="Observaciones"
            value={String(nObservaciones)}
            subtitle="Datos / exclusiones"
            topColor={nObservaciones > 0 ? "#B45309" : "#64748B"}
          />
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-[13px] font-semibold text-t900">Detalle por proyecto / entregable</h3>
        <div className="overflow-x-auto rounded-r10 border border-bdr bg-white shadow-xs">
          <table className="w-full min-w-[960px] border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-bdr bg-surface2 text-left text-[10px] uppercase tracking-wide text-t500">
                <th className={`${stickyLeft} bg-surface2 p-2 font-semibold`}>Cliente / Proyecto / Entregable</th>
                <th className="p-2 font-semibold whitespace-nowrap">Inicio</th>
                <th className="p-2 font-semibold whitespace-nowrap">Término</th>
                <th className="p-2 font-semibold whitespace-nowrap">Inicio ef.</th>
                <th className="p-2 text-right font-semibold whitespace-nowrap">Saldo h</th>
                {snapshot.meses_horizonte.map((mes) => (
                  <th key={mes} className="p-2 text-right font-semibold whitespace-nowrap">
                    {labelMesCorto(mes)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + snapshot.meses_horizonte.length}
                    className="p-4 text-center text-t500"
                  >
                    No hay entregables proyectables con el filtro actual.
                  </td>
                </tr>
              ) : (
                grupos.map((g) => (
                  <GrupoProyectoRows
                    key={g.proyecto.id}
                    grupo={g}
                    mesesHorizonte={snapshot.meses_horizonte}
                    stickyLeft={stickyLeft}
                  />
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-bdr bg-teal-500/10 font-semibold text-t900">
                <td className={`${stickyLeft} bg-teal-50 p-2`}>Total general</td>
                <td className="p-2">—</td>
                <td className="p-2">—</td>
                <td className="p-2">—</td>
                <td className="p-2 text-right font-mono tabular-nums">
                  {fmtH(snapshot.total_general.saldo_horas_total)}
                </td>
                {snapshot.total_general.meses.map((m) => (
                  <td key={m.mes} className="p-2 text-right font-mono tabular-nums">
                    {m.horas > 1e-9 ? fmtH(m.horas) : "—"}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[13px] font-semibold text-t900">Resumen vs curva objetivo</h3>
        <div className="overflow-x-auto rounded-r10 border border-bdr bg-white shadow-xs">
          <table className="w-full min-w-[720px] border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-bdr bg-surface2 text-left text-[10px] uppercase tracking-wide text-t500">
                <th className="p-2 font-semibold">Mes</th>
                <th className="p-2 text-right font-semibold">Disponibles</th>
                <th className="p-2 text-right font-semibold">Proyectadas</th>
                <th className="p-2 text-right font-semibold">Diferencia</th>
                <th className="p-2 text-right font-semibold">Utiliz. %</th>
                <th className="p-2 text-right font-semibold">Acum. disp.</th>
                <th className="p-2 text-right font-semibold">Acum. proy.</th>
                <th className="p-2 text-right font-semibold">Brecha acum.</th>
                <th className="p-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.comparacion_curva.map((c) => {
                const sobrecarga = c.horas_proyectadas > c.horas_disponibles + 1e-9;
                return (
                  <tr key={c.mes} className="border-b border-bdr/60">
                    <td className="p-2 font-mono font-semibold">{labelMesCorto(c.mes)}</td>
                    <td className="p-2 text-right font-mono tabular-nums">{fmtH(c.horas_disponibles)}</td>
                    <td className="p-2 text-right font-mono tabular-nums">{fmtH(c.horas_proyectadas)}</td>
                    <td
                      className={`p-2 text-right font-mono tabular-nums ${
                        c.diferencia < 0 ? "text-[#B91C1C]" : "text-emerald-800"
                      }`}
                    >
                      {fmtH(c.diferencia)}
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums">{fmtPct(c.utilizacion_pct)}</td>
                    <td className="p-2 text-right font-mono tabular-nums">{fmtH(c.acumulado_disponible)}</td>
                    <td className="p-2 text-right font-mono tabular-nums">{fmtH(c.acumulado_proyectado)}</td>
                    <td
                      className={`p-2 text-right font-mono tabular-nums ${
                        c.brecha_acumulada < 0 ? "text-[#B91C1C]" : ""
                      }`}
                    >
                      {fmtH(c.brecha_acumulada)}
                    </td>
                    <td className="p-2">
                      <span
                        className={`inline-block rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold ${
                          sobrecarga
                            ? "bg-rose-100 text-rose-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {sobrecarga ? "SOBRECARGA" : "OK"}
                      </span>
                      {c.observacion ? (
                        <span className="mt-0.5 block text-[9px] text-amber-800">{c.observacion}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {snapshot.curvas_usadas.length > 0 ? (
          <ul className="text-[10px] leading-snug text-t500">
            {snapshot.curvas_usadas.map((c) => (
              <li key={c.anio}>
                {c.anio}: {c.fuente}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-[13px] font-semibold text-t900">Observaciones</h3>
        {snapshot.observaciones.length === 0 ? (
          <p className="rounded-r8 border border-bdr bg-surface2/50 px-3 py-2 text-[11px] text-t600">
            Sin observaciones de exclusión. Conteos: completados {snapshot.conteos.excluidos_completados},
            saldo cero {snapshot.conteos.excluidos_saldo_cero}, no activos{" "}
            {snapshot.conteos.excluidos_proyecto_no_activo}.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-r10 border border-amber-200/80 bg-amber-50/40">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="sticky top-0 border-b border-amber-200/80 bg-amber-50 text-left text-[10px] uppercase text-amber-900/80">
                  <th className="p-2 font-semibold">Tipo</th>
                  <th className="p-2 font-semibold">Proyecto</th>
                  <th className="p-2 font-semibold">Entregable</th>
                  <th className="p-2 font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.observaciones.map((o) => (
                  <tr key={`${o.codigo}-${o.entregable_id}`} className="border-b border-amber-100/80">
                    <td className="p-2 whitespace-nowrap font-semibold text-amber-950">
                      {etiquetaObservacion(o.codigo)}
                    </td>
                    <td className="p-2 font-mono text-t700">{o.proyecto_codigo}</td>
                    <td className="p-2 text-t800">{o.entregable_nombre}</td>
                    <td className="p-2 text-t600">{o.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function GrupoProyectoRows({
  grupo,
  mesesHorizonte,
  stickyLeft,
}: {
  grupo: GrupoProyecto;
  mesesHorizonte: string[];
  stickyLeft: string;
}) {
  const { proyecto, entregables } = grupo;
  return (
    <>
      <tr className="border-b border-bdr bg-slate-50/90 font-semibold text-t900">
        <td className={`${stickyLeft} bg-slate-50 p-2`}>
          <span className="block text-[10px] font-medium uppercase tracking-wide text-t500">
            {proyecto.cliente_nombre || "—"}
          </span>
          <span className="text-[12px]">{proyecto.etiqueta}</span>
          <span className="ml-1 text-[10px] font-normal text-t500">({proyecto.n})</span>
        </td>
        <td className="p-2 text-t400">—</td>
        <td className="p-2 text-t400">—</td>
        <td className="p-2 text-t400">—</td>
        <td className="p-2 text-right font-mono tabular-nums">{fmtH(proyecto.saldo)}</td>
        {mesesHorizonte.map((mes) => {
          const h = proyecto.meses.find((m) => m.mes === mes)?.horas ?? 0;
          return (
            <td key={mes} className="p-2 text-right font-mono tabular-nums">
              {h > 1e-9 ? fmtH(h) : "—"}
            </td>
          );
        })}
      </tr>
      {entregables.map((e) => (
        <tr key={e.entregable_id} className="border-b border-bdr/50 bg-white text-t800">
          <td className={`${stickyLeft} bg-white p-2 pl-4`}>
            <span className="text-t900">{e.entregable_nombre}</span>
            {e.entregable_codigo ? (
              <span className="ml-1 font-mono text-[10px] text-t400">{e.entregable_codigo}</span>
            ) : null}
          </td>
          <td className="p-2 font-mono whitespace-nowrap text-[10px]">{fmtFechaCorta(e.fecha_inicio)}</td>
          <td className="p-2 font-mono whitespace-nowrap text-[10px]">{fmtFechaCorta(e.fecha_termino)}</td>
          <td className="p-2 font-mono whitespace-nowrap text-[10px]">
            {fmtFechaCorta(e.fecha_inicio_efectiva)}
          </td>
          <td className="p-2 text-right font-mono tabular-nums">{fmtH(e.saldo_horas_total)}</td>
          {e.meses.map((m) => (
            <td key={m.mes} className="p-2 text-right font-mono tabular-nums">
              {m.horas > 1e-9 ? fmtH(m.horas) : "—"}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
