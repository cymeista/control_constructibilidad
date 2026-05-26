import { useMemo, useState, type ReactNode } from "react";
import { useAppData } from "@/context/AppDataContext";
import SectionHeader from "@/components/SectionHeader";
import KpiCard, { kpiCardsGridClassName8 } from "@/components/KpiCard";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import {
  buildCapacidadEquipoSnapshot,
  colorCumplimientoObjetivo,
  colorEstadoComposicion,
  labelCumplimientoObjetivo,
  labelEstadoComposicion,
  labelPresion,
  type EstadoComposicionCarga,
  type FilaCapacidadProfesional,
  type FilaPresionCartera,
} from "@/capacidad/capacidadEquipoReadModel";
import { PERIODOS_CAPACIDAD_OPCIONES, type PeriodoCapacidadId } from "@/capacidad/capacidadPeriodo";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const fmtH = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const fmtPct = (n: number | null) =>
  n == null ? "—" : `${(n * 100).toLocaleString("es-CL", { maximumFractionDigits: 0 })}%`;

function fmtCargabilidadReal(n: number | null, totalRegistrado: number): string {
  if (n == null) return "—";
  if (totalRegistrado <= 0) return "Sin registro";
  return fmtPct(n);
}

function fmtFechaCorte(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

function CampoCompacto({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1 leading-snug">
      <span className="shrink-0 text-[10px] font-semibold text-t500">{label}:</span>
      <span className="min-w-0 text-[11px] text-t800">{children}</span>
    </div>
  );
}

function ProfesionalCapacidadMobileCard({ f }: { f: FilaCapacidadProfesional }) {
  const colComp = colorEstadoComposicion(f.estadoComposicion);
  const colCumpl = f.etiquetaCumplimiento ? colorCumplimientoObjetivo(f.etiquetaCumplimiento) : null;
  return (
    <article className="rounded-r10 border border-bdr bg-white p-3 shadow-sm">
      <p className="text-[13px] font-semibold text-t900">{f.nombre}</p>
      <p className="text-[11px] text-t500">{f.cargo}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3">
        <div className="min-w-0 space-y-1">
          <CampoCompacto label="Dir.">
            <span className="font-mono tabular-nums">{fmtH(f.horasDirectas)}</span>
          </CampoCompacto>
          <CampoCompacto label="Ind.">
            <span className="font-mono tabular-nums">{fmtH(f.horasIndirectas)}</span>
          </CampoCompacto>
          <CampoCompacto label="Total">
            <span className="font-mono tabular-nums">{fmtH(f.totalRegistrado)}</span>
          </CampoCompacto>
        </div>
        <div className="min-w-0 space-y-1">
          <CampoCompacto label="Carg.">
            <span className="font-mono tabular-nums font-semibold">
              {fmtCargabilidadReal(f.cargabilidadReal, f.totalRegistrado)}
            </span>
          </CampoCompacto>
          <CampoCompacto label="Obj.">
            <span className="font-mono tabular-nums">{fmtH(f.objetivoDirectoRef)}</span>
          </CampoCompacto>
          <CampoCompacto label="Cumpl.">
            <span className="font-mono tabular-nums font-semibold">{fmtPct(f.cumplimientoObjetivoDirecto)}</span>
          </CampoCompacto>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-block rounded-r6 border px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: colComp.bg, color: colComp.text, borderColor: colComp.border }}
        >
          {labelEstadoComposicion(f.estadoComposicion)}
        </span>
        {f.etiquetaCumplimiento && colCumpl ? (
          <span
            className="inline-block rounded-r6 border px-1.5 py-0.5 text-[9px] font-medium"
            style={{ background: colCumpl.bg, color: colCumpl.text, borderColor: colCumpl.border }}
          >
            {labelCumplimientoObjetivo(f.etiquetaCumplimiento)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function PresionCarteraMobileCard({ r }: { r: FilaPresionCartera }) {
  const presionStyle =
    r.presion === "critica"
      ? { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" }
      : r.presion === "alta"
        ? { bg: "#FFF7ED", text: "#B45309", border: "#FED7AA" }
        : r.presion === "media"
          ? { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" }
          : { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" };
  return (
    <article className="rounded-r10 border border-bdr bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-t500">{r.clienteNombre}</p>
      <p className="mt-0.5 text-[11px] text-t600">{r.proyectoNombre}</p>
      <p className="mt-1 text-[13px] font-semibold text-t900">{r.entregableNombre}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <CampoCompacto label="Fecha">
          <span className="font-mono">{r.fechaProxima}</span>
        </CampoCompacto>
        <CampoCompacto label="Presión">
          <span
            className="inline-block rounded-r6 border px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: presionStyle.bg, color: presionStyle.text, borderColor: presionStyle.border }}
          >
            {labelPresion(r.presion)}
          </span>
        </CampoCompacto>
        <CampoCompacto label="Presup.">
          <span className="font-mono tabular-nums">{fmtH(r.horasPresupuesto)}</span>
        </CampoCompacto>
        <CampoCompacto label="Gastadas">
          <span className="font-mono tabular-nums">{fmtH(r.horasGastadas)}</span>
        </CampoCompacto>
        <CampoCompacto label="Pend.">
          <span className="font-mono tabular-nums font-semibold">
            {fmtH(r.horasPendientes)}
            {r.sobreconsumido ? (
              <span className="ml-1 text-[9px] font-semibold text-violet-800">Sobrecons.</span>
            ) : null}
          </span>
        </CampoCompacto>
        <CampoCompacto label="Avances">
          <span className="tabular-nums">
            {r.avanceRealPct.toFixed(0)}% / {r.avanceTeoricoPct.toFixed(0)}%
          </span>
        </CampoCompacto>
      </div>
    </article>
  );
}

function BarraHorizontal({ pct, color }: { pct: number; color: string }) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-surface2">
      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

function CapacidadEquipo() {
  const data = useAppData();
  const isBelowMd = useIsBelowMd();
  const [periodoId, setPeriodoId] = useState<PeriodoCapacidadId>("mes_actual");
  const [pctObjetivo, setPctObjetivo] = useState(85);

  const snapshot = useMemo(
    () =>
      buildCapacidadEquipoSnapshot(periodoId, pctObjetivo, {
        profesionales: data.profesionales,
        registro_horas: data.registro_horas,
        proyectos: data.proyectos,
        entregables: data.entregables,
        clientes: data.clientes,
        asignaciones_horas: data.asignaciones_horas,
      }),
    [
      periodoId,
      pctObjetivo,
      data.profesionales,
      data.registro_horas,
      data.proyectos,
      data.entregables,
      data.clientes,
      data.asignaciones_horas,
    ],
  );

  const {
    kpis,
    filasProfesionales,
    presionCartera,
    riesgos,
    distribucionComposicion,
    fechas,
    periodo,
    sinCargaEnPeriodo,
    porcentajeObjetivo,
    subtituloHorasDirectasKpi,
    presionCarteraKpiSubtitulo,
    directasReglaDashboardMensual,
  } = snapshot;

  const inicioFmt = fmtFechaCorte(fechas.inicioPeriodo);
  const finTeoricaFmt = fmtFechaCorte(fechas.finPeriodoTeorica);
  const corteFmt = fmtFechaCorte(fechas.corteReal);

  const subtituloCargabilidadRealEquipo = useMemo(() => {
    const fin =
      !periodo.esFuturo && fechas.corteReal && !sinCargaEnPeriodo ? corteFmt : finTeoricaFmt;
    return `Periodo: ${inicioFmt} al ${fin} · Directas ÷ total registrado`;
  }, [
    periodo.esFuturo,
    sinCargaEnPeriodo,
    fechas.corteReal,
    fechas.inicioPeriodo,
    fechas.finPeriodoTeorica,
    inicioFmt,
    corteFmt,
    finTeoricaFmt,
  ]);

  const estadosOrden: EstadoComposicionCarga[] = ["baja", "normal", "alta", "muy_alta"];
  const totalProfConCarga =
    estadosOrden.reduce((s, e) => s + distribucionComposicion[e], 0) || 1;

  const mesLabelCortoKpi = useMemo(() => {
    if (!directasReglaDashboardMensual) return null;
    const parts = subtituloHorasDirectasKpi.split("·");
    const last = parts[parts.length - 1]?.trim();
    return last || null;
  }, [directasReglaDashboardMensual, subtituloHorasDirectasKpi]);

  const subtituloDirectasMobile = directasReglaDashboardMensual
    ? mesLabelCortoKpi
      ? `Mes actual · Dashboard · ${mesLabelCortoKpi}`
      : "Mes actual · regla Dashboard"
    : `Acum. hasta ${corteFmt}`;

  const subtituloCargabilidadMobile = `${inicioFmt}–${!periodo.esFuturo && !sinCargaEnPeriodo ? corteFmt : finTeoricaFmt} · Dir./total`;

  const subtituloPresionMobile = `${fmtH(kpis.horasPendientesProximas)} / ${fmtH(kpis.capacidadDisponibleProximas)} h · 4 sem.`;

  return (
    <div className="capacidad-equipo-page min-w-0 max-w-full space-y-8 overflow-x-hidden pb-20 text-t800 md:pb-0">
      <SectionHeader
        number="CAPACIDAD"
        title="Capacidad del Equipo"
        hint="Utilización real, capacidad disponible y presión de cartera"
      />

      <p className="max-w-3xl text-[13px] leading-relaxed text-t600">
        Esta vista compara la capacidad disponible del equipo con las horas reales registradas y la presión de
        cartera. La asignación por profesional se usa como referencia operativa, no como programación semanal
        rígida.
      </p>

      <div className="flex w-full min-w-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <label htmlFor="periodo-capacidad" className="text-[12px] font-medium text-t600">
          Periodo
        </label>
        <select
          id="periodo-capacidad"
          value={periodoId}
          onChange={(e) => setPeriodoId(e.target.value as PeriodoCapacidadId)}
          className="w-full rounded-r8 border border-bdr bg-white px-3 py-2.5 text-[13px] text-t800 shadow-sm sm:max-w-xs"
        >
          {PERIODOS_CAPACIDAD_OPCIONES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 text-[12px] leading-relaxed text-t700">
        {periodo.esFuturo ? (
          <p>
            <span className="font-medium text-t900">Periodo seleccionado:</span> {inicioFmt} al {finTeoricaFmt}
            <span className="text-t500"> · ventana futura (sin horas reales ni fecha de corte)</span>
          </p>
        ) : (
          <>
            <p>
              <span className="font-medium text-t900">Periodo seleccionado:</span> {inicioFmt} al {finTeoricaFmt}
            </p>
            {sinCargaEnPeriodo ? (
              <p className="mt-1 font-medium text-amber-800">
                Sin carga registrada en el periodo seleccionado.
              </p>
            ) : (
              <p className="mt-1">
                <span className="font-medium text-t900">Fecha de corte real:</span> {corteFmt}
                <span className="text-t500">
                  {" "}
                  · última carga de profesionales cargables dentro del periodo
                </span>
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-r12 border border-bdr bg-white px-4 py-4 shadow-sh1 md:flex-row md:flex-wrap md:items-end md:gap-6 md:px-5">
        <div className="min-w-0 w-full flex-1">
          <Label className="text-[12px] font-medium text-t700">Cargabilidad objetivo</Label>
          <p className="mt-0.5 text-[11px] text-t500">
            Capacidad objetivo = nominal acumulada × {Math.round(porcentajeObjetivo * 100)}%
          </p>
          <div className="mt-3 flex w-full items-center gap-3">
            <Slider
              min={60}
              max={100}
              step={5}
              value={[pctObjetivo]}
              onValueChange={(v) => setPctObjetivo(v[0] ?? 85)}
              className="min-w-0 flex-1"
            />
            <span className="min-w-[3rem] font-mono text-[13px] font-semibold tabular-nums text-t900">
              {pctObjetivo}%
            </span>
          </div>
        </div>
        {!periodo.esFuturo && !sinCargaEnPeriodo ? (
          <div className="text-[12px] text-t600">
            <p>
              <span className="font-medium text-t800">Cálculo real hasta:</span> {corteFmt}
            </p>
            <p className="mt-0.5 text-[11px] text-t500">
              Capacidad nominal y horas reales acumuladas desde {inicioFmt} hasta {corteFmt}
            </p>
          </div>
        ) : null}
      </div>

      <div className={kpiCardsGridClassName8}>
        <KpiCard
          label="Objetivo directo ref. equipo"
          value={`${fmtH(kpis.capacidadObjetivoEquipo)} h`}
          subtitle={
            isBelowMd
              ? `Ref. ${Math.round(porcentajeObjetivo * 100)}% · corte ${corteFmt}`
              : `Referencia acumulada a fecha de corte · ${Math.round(porcentajeObjetivo * 100)}%`
          }
          topColor="#1e4a6e"
        />
        <KpiCard
          label="Horas directas reales"
          value={`${fmtH(kpis.horasDirectasReales)} h`}
          subtitle={isBelowMd ? subtituloDirectasMobile : subtituloHorasDirectasKpi}
          topColor="#047857"
        />
        <KpiCard
          label="Cargabilidad real del equipo"
          value={sinCargaEnPeriodo && !periodo.esFuturo ? "Sin registro" : fmtPct(kpis.cargabilidadRealEquipo)}
          subtitle={isBelowMd ? subtituloCargabilidadMobile : subtituloCargabilidadRealEquipo}
          topColor="#B45309"
        />
        <KpiCard
          label="Cumplimiento objetivo directo"
          value={
            sinCargaEnPeriodo && !periodo.esFuturo ? "Sin registro" : fmtPct(kpis.cumplimientoObjetivoDirectoEquipo)
          }
          subtitle={isBelowMd ? "Directas ÷ obj. ref." : "Directas ÷ objetivo directo ref. · puede superar 100%"}
          topColor="#6366f1"
        />
        <KpiCard
          label="Horas indirectas"
          value={`${fmtH(kpis.horasIndirectas)} h`}
          subtitle={isBelowMd ? "Fuera de carg. real" : "No entran en cargabilidad real"}
          topColor="#64748b"
        />
        <KpiCard
          label="Profesionales sobre objetivo directo"
          value={String(kpis.profesionalesSobreObjetivoDirecto)}
          subtitle={isBelowMd ? "Cumpl. obj. > 100%" : "Cumplimiento objetivo directo > 100%"}
          topColor="#7c3aed"
        />
        <KpiCard
          label="Profesionales con baja cargabilidad"
          value={String(kpis.profesionalesBajaCargabilidad)}
          subtitle={isBelowMd ? "Dir./total < 70%" : "Directas / total registrado < 70%"}
          topColor="#475569"
        />
        <KpiCard
          label="Presión de cartera próxima"
          value={fmtPct(kpis.presionCarteraRatio)}
          subtitle={
            isBelowMd
              ? subtituloPresionMobile
              : `${fmtH(kpis.horasPendientesProximas)} h pend. / ${fmtH(kpis.capacidadDisponibleProximas)} h cap. · ${presionCarteraKpiSubtitulo}`
          }
          topColor="#7c3aed"
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-r12 border border-bdr bg-white p-5 shadow-sh1 lg:col-span-2">
          <h3 className="font-playfair text-[1rem] font-semibold text-t900">Cargabilidad real por profesional</h3>
          <p className="mt-1 text-[11px] text-t500">
            Proporción de horas directas sobre el total registrado (directas + indirectas)
          </p>
          <div className="mt-4 space-y-2.5">
            {filasProfesionales.length === 0 ? (
              <p className="text-[12px] text-t400">No hay profesionales cargables en el equipo.</p>
            ) : (
              filasProfesionales.map((f) => {
                const col = colorEstadoComposicion(f.estadoComposicion);
                const barPct = (f.cargabilidadReal ?? 0) * 100;
                return (
                  <div key={f.profesionalId} className="grid grid-cols-[minmax(120px,1fr)_minmax(100px,120px)_1fr] items-center gap-3">
                    <span className="truncate text-[12px] font-medium text-t800" title={f.nombre}>
                      {f.nombre}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-t600">
                      {fmtCargabilidadReal(f.cargabilidadReal, f.totalRegistrado)}
                    </span>
                    <BarraHorizontal pct={barPct} color={col.text} />
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-r12 border border-bdr bg-white p-5 shadow-sh1">
          <h3 className="font-playfair text-[1rem] font-semibold text-t900">Composición de carga</h3>
          <div className="mt-4 space-y-3">
            {estadosOrden.map((e) => {
              const n = distribucionComposicion[e];
              const col = colorEstadoComposicion(e);
              return (
                <div key={e}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="font-medium text-t700">{labelEstadoComposicion(e)}</span>
                    <span className="tabular-nums text-t500">
                      {n} ({((n / totalProfConCarga) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <BarraHorizontal pct={(n / totalProfConCarga) * 100} color={col.text} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-r12 border border-bdr bg-white shadow-sh1">
        <div className="border-b border-bdr bg-surface2 px-5 py-4">
          <h3 className="font-playfair text-[1.05rem] font-semibold text-t900">Detalle por profesional</h3>
          {periodo.esFuturo ? (
            <p className="mt-1 text-[11px] text-t500">
              Periodo futuro: sin cálculo de horas reales ni cargabilidad.
            </p>
          ) : sinCargaEnPeriodo ? (
            <p className="mt-1 text-[11px] font-medium text-amber-800">
              Sin carga registrada en el periodo seleccionado ({inicioFmt} al {finTeoricaFmt}).
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-t600">
              Cálculo realizado entre {inicioFmt} y {corteFmt}, según última carga registrada del periodo.
            </p>
          )}
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-t500">
            La cargabilidad real mide la proporción de horas directas sobre el total registrado. El cumplimiento
            objetivo compara directas reales contra una referencia objetivo; superar 100% no implica sobrecarga
            laboral.
          </p>
        </div>
        <div className="space-y-2 p-3 md:hidden">
          {filasProfesionales.map((f) => (
            <ProfesionalCapacidadMobileCard key={f.profesionalId} f={f} />
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[920px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-bdr bg-surface2 text-[10px] font-semibold uppercase tracking-wide text-t600">
                <th className="px-4 py-3">Profesional</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3 text-right">Directas</th>
                <th className="px-4 py-3 text-right">Indirectas</th>
                <th className="px-4 py-3 text-right">Total registrado</th>
                <th className="px-4 py-3 text-right">Cargabilidad real</th>
                <th className="px-4 py-3 text-right">Objetivo directo ref.</th>
                <th className="px-4 py-3 text-right">Cumpl. objetivo directo</th>
                <th className="px-4 py-3">Composición</th>
              </tr>
            </thead>
            <tbody className="text-t800">
              {filasProfesionales.map((f) => {
                const colComp = colorEstadoComposicion(f.estadoComposicion);
                const colCumpl = f.etiquetaCumplimiento ? colorCumplimientoObjetivo(f.etiquetaCumplimiento) : null;
                return (
                  <tr key={f.profesionalId} className="border-b border-bdr hover:bg-surface2/60">
                    <td className="px-4 py-2.5 font-medium text-t900">{f.nombre}</td>
                    <td className="px-4 py-2.5 text-t600">{f.cargo}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtH(f.horasDirectas)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-t500">{fmtH(f.horasIndirectas)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtH(f.totalRegistrado)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                      {fmtCargabilidadReal(f.cargabilidadReal, f.totalRegistrado)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtH(f.objetivoDirectoRef)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono tabular-nums font-semibold">{fmtPct(f.cumplimientoObjetivoDirecto)}</span>
                      {f.etiquetaCumplimiento && colCumpl ? (
                        <span
                          className="ml-1.5 inline-block rounded-r6 border px-1.5 py-0.5 text-[9px] font-medium"
                          style={{ background: colCumpl.bg, color: colCumpl.text, borderColor: colCumpl.border }}
                        >
                          {labelCumplimientoObjetivo(f.etiquetaCumplimiento)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-block rounded-r6 border px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: colComp.bg, color: colComp.text, borderColor: colComp.border }}
                      >
                        {labelEstadoComposicion(f.estadoComposicion)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-r12 border border-bdr bg-white shadow-sh1">
        <div className="border-b border-bdr bg-surface2 px-5 py-4">
          <h3 className="font-playfair text-[1.05rem] font-semibold text-t900">Presión de cartera próxima</h3>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-t600">
            Entregables activos (Gestión de Horas), vencidos incompletos o con hitos en las próximas 4 semanas.
            Pendiente calculado sobre P4+P3+P2; excluye L2. Gasto = hrs_gastadas (RegistroHora DIRECTA válida).
          </p>
          <ul className="mt-2 hidden list-inside list-disc text-[11px] text-t500 md:block">
            <li>Proyecto ACTIVO; entregable con proyecto y cliente válidos.</li>
            <li>
              Incluye: activos visibles (no completados / no iniciados), vencidos incompletos, o no iniciados con
              fechas en el horizonte.
            </li>
            <li>Excluye completados, no iniciados lejanos fuera de 4 semanas y proyectos no activos.</li>
            <li>
              Presupuesto = hrs_p4 + hrs_p3 + hrs_p2. Pendiente = máx(0, presupuesto − hrs_gastadas). Sobreconsumo →
              pendiente 0.
            </li>
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-t500 md:hidden">
            P4+P3+P2 · excluye L2 · pendiente = máx(0, presup − gastadas).
          </p>
        </div>
        <div className="space-y-2 p-3 md:hidden">
          {presionCartera.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-t500">Sin entregables con presión en la ventana próxima.</p>
          ) : (
            presionCartera.map((r) => <PresionCarteraMobileCard key={r.entregableId} r={r} />)
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1000px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-bdr bg-surface2 text-[10px] font-semibold uppercase tracking-wide text-t600">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Proyecto</th>
                <th className="px-4 py-3">Entregable</th>
                <th className="px-4 py-3">Fecha próxima</th>
                <th className="px-4 py-3 text-right">Avance real</th>
                <th className="px-4 py-3 text-right">Avance teórico</th>
                <th className="px-4 py-3 text-right">Presup. P4+P3+P2</th>
                <th className="px-4 py-3 text-right">Gastadas</th>
                <th className="px-4 py-3 text-right">Pendientes</th>
                <th className="px-4 py-3">Presión</th>
              </tr>
            </thead>
            <tbody className="text-t800">
              {presionCartera.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-t500">
                    Sin entregables con presión en la ventana próxima.
                  </td>
                </tr>
              ) : (
                presionCartera.map((r) => {
                  const presionStyle =
                    r.presion === "critica"
                      ? { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" }
                      : r.presion === "alta"
                        ? { bg: "#FFF7ED", text: "#B45309", border: "#FED7AA" }
                        : r.presion === "media"
                          ? { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" }
                          : { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" };
                  return (
                    <tr key={r.entregableId} className="border-b border-bdr hover:bg-surface2/60">
                      <td className="px-4 py-2.5 text-t800">{r.clienteNombre}</td>
                      <td className="px-4 py-2.5 text-t700">{r.proyectoNombre}</td>
                      <td className="px-4 py-2.5 font-medium text-t900">{r.entregableNombre}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px]">{r.fechaProxima}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.avanceRealPct.toFixed(0)}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.avanceTeoricoPct.toFixed(0)}%</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtH(r.horasPresupuesto)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtH(r.horasGastadas)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                        {fmtH(r.horasPendientes)}
                        {r.sobreconsumido ? (
                          <span className="ml-1.5 inline-block rounded-r4 border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-900">
                            Sobreconsumido
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-block rounded-r6 border px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: presionStyle.bg,
                            color: presionStyle.text,
                            borderColor: presionStyle.border,
                          }}
                        >
                          {labelPresion(r.presion)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-r12 border border-bdr bg-white p-5 shadow-sh1">
        <h3 className="font-playfair text-[1.05rem] font-semibold text-t900">Riesgos de carga</h3>
        <ul className="mt-3 space-y-2">
          {riesgos.length === 0 ? (
            <li className="text-[12px] text-t500">Sin riesgos destacados con los criterios actuales.</li>
          ) : (
            riesgos.map((r) => (
              <li
                key={r.id}
                className={`rounded-r8 border px-3 py-2 text-[12px] leading-snug ${
                  r.severidad === "critico"
                    ? "border-rose-200 bg-rose-50 text-rose-950"
                    : r.severidad === "atencion"
                      ? "border-amber-200 bg-amber-50 text-amber-950"
                      : "border-bdr bg-surface2 text-t700"
                }`}
              >
                {r.texto}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export default CapacidadEquipo;
