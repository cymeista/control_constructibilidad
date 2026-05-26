import { useMemo, useState } from "react";
import { useAppData } from "@/context/AppDataContext";
import SectionHeader from "@/components/SectionHeader";
import ReporteEjecutivoPrint from "@/reporte/ReporteEjecutivoPrint";
import type { HorizonteHitosSemanas } from "@/entregables/entregableHitosRelevantes";
import {
  buildReporteEjecutivoSnapshot,
  nombreExportacionReporteEjecutivo,
  type FiltrosReporteEjecutivo,
} from "@/reporte/reporteEjecutivoReadModel";
import {
  PERIODOS_REPORTE_OPCIONES,
  type PeriodoReporteEjecutivoId,
} from "@/reporte/reporteEjecutivoPeriodo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/security/AuthContext";

const RESUMEN_BASE =
  "La cartera presenta focos de atención en entregables con alertas abiertas y próximos hitos de revisión. La carga real del equipo se sustenta en RegistroHora, con seguimiento de horas directas, indirectas y déficits de asignación.";

export default function ReporteEjecutivoPage() {
  const data = useAppData();
  const { isAuthenticated } = useAuth();
  const [periodoId, setPeriodoId] = useState<PeriodoReporteEjecutivoId>("mes_actual");
  const [clienteId, setClienteId] = useState("todos");
  const [proyectoId, setProyectoId] = useState("todos");
  const [incluirAlertasRevisadas, setIncluirAlertasRevisadas] = useState(false);
  const [horizonteHitosSemanas, setHorizonteHitosSemanas] = useState<HorizonteHitosSemanas>(4);
  const [resumenEditado, setResumenEditado] = useState(RESUMEN_BASE);
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);

  const filtros: FiltrosReporteEjecutivo = useMemo(
    () => ({
      periodoId,
      clienteId,
      proyectoId,
      incluirAlertasRevisadas,
      horizonteHitosSemanas,
    }),
    [periodoId, clienteId, proyectoId, incluirAlertasRevisadas, horizonteHitosSemanas],
  );

  const snapshot = useMemo(
    () =>
      buildReporteEjecutivoSnapshot(filtros, resumenEditado, {
        profesionales: data.profesionales,
        registro_horas: data.registro_horas,
        proyectos: data.proyectos,
        entregables: data.entregables,
        clientes: data.clientes,
        asignaciones_horas: data.asignaciones_horas,
        alertas_revisadas: data.alertas_revisadas,
      }),
    [
      filtros,
      resumenEditado,
      data.profesionales,
      data.registro_horas,
      data.proyectos,
      data.entregables,
      data.clientes,
      data.asignaciones_horas,
      data.alertas_revisadas,
    ],
  );

  const proyectoOptions = useMemo(() => {
    const base = [{ value: "todos", label: "Todos" }];
    const list =
      clienteId === "todos"
        ? data.proyectos
        : data.proyectos.filter((p) => p.cliente_id === clienteId);
    return [...base, ...list.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))];
  }, [data.proyectos, clienteId]);

  const textoSugerido = useMemo(
    () =>
      buildReporteEjecutivoSnapshot(filtros, undefined, {
        profesionales: data.profesionales,
        registro_horas: data.registro_horas,
        proyectos: data.proyectos,
        entregables: data.entregables,
        clientes: data.clientes,
        asignaciones_horas: data.asignaciones_horas,
        alertas_revisadas: data.alertas_revisadas,
      }).resumenEjecutivo,
    [
      filtros,
      data.profesionales,
      data.registro_horas,
      data.proyectos,
      data.entregables,
      data.clientes,
      data.asignaciones_horas,
      data.alertas_revisadas,
    ],
  );

  const exportarPdf = () => {
    const previousTitle = document.title;
    const nombreReporte = nombreExportacionReporteEjecutivo(snapshot.fechaEmision);
    document.title = nombreReporte;
    document.body.classList.add("reporte-ejecutivo-printing");
    window.print();
    window.setTimeout(() => {
      document.body.classList.remove("reporte-ejecutivo-printing");
      document.title = previousTitle;
    }, 1000);
  };

  return (
    <>
      <div className="reporte-ejecutivo-no-print min-w-0 max-w-full space-y-6 overflow-x-hidden pb-20 md:pb-0">
        <SectionHeader
          number="REPORTE"
          title="Reporte Ejecutivo"
          hint="PDF de una hoja para jefatura o cliente interno"
        />

        <div className="rounded-r12 border border-bdr bg-white p-5 shadow-sh1">
        <h3 className="text-[13px] font-semibold text-t900">Configuración</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="re-periodo" className="text-[12px]">
              Periodo
            </Label>
            <select
              id="re-periodo"
              value={periodoId}
              onChange={(e) => setPeriodoId(e.target.value as PeriodoReporteEjecutivoId)}
              className="mt-1 w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px]"
            >
              {PERIODOS_REPORTE_OPCIONES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="re-cliente" className="text-[12px]">
              Cliente
            </Label>
            <select
              id="re-cliente"
              value={clienteId}
              onChange={(e) => {
                setClienteId(e.target.value);
                setProyectoId("todos");
              }}
              className="mt-1 w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px]"
            >
              <option value="todos">Todos</option>
              {data.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="re-proyecto" className="text-[12px]">
              Proyecto
            </Label>
            <select
              id="re-proyecto"
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value)}
              className="mt-1 w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px]"
            >
              {proyectoOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="re-horizonte-hitos" className="text-[12px]">
              Horizonte hitos
            </Label>
            <select
              id="re-horizonte-hitos"
              value={horizonteHitosSemanas}
              onChange={(e) => setHorizonteHitosSemanas(Number(e.target.value) as HorizonteHitosSemanas)}
              className="mt-1 w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px]"
            >
              <option value={3}>3 semanas</option>
              <option value={4}>4 semanas (predeterminado)</option>
              <option value={6}>6 semanas</option>
            </select>
          </div>
          <div className="flex items-end sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-t700">
              <Checkbox
                checked={incluirAlertasRevisadas}
                onCheckedChange={(v) => setIncluirAlertasRevisadas(v === true)}
              />
              Incluir alertas revisadas
            </label>
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor="re-resumen" className="text-[12px]">
            Resumen ejecutivo (máx. 4 líneas)
          </Label>
          <Textarea
            id="re-resumen"
            value={resumenEditado}
            onChange={(e) => setResumenEditado(e.target.value)}
            readOnly={!isAuthenticated}
            rows={4}
            className={`mt-1 text-[13px] ${!isAuthenticated ? "cursor-default bg-surface2" : ""}`}
          />
          {isAuthenticated ? (
            <button
              type="button"
              className="mt-1 text-[11px] font-medium text-[#1e4a6e] hover:underline"
              onClick={() => setResumenEditado(textoSugerido)}
            >
              Usar texto sugerido
            </button>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" variant="default" onClick={() => setMostrarVistaPrevia(true)}>
            Vista previa
          </Button>
          <Button type="button" variant="outline" onClick={exportarPdf}>
            Exportar PDF
          </Button>
          {mostrarVistaPrevia ? (
            <Button type="button" variant="ghost" onClick={() => setMostrarVistaPrevia(false)}>
              Volver
            </Button>
          ) : null}
        </div>
      </div>

        {mostrarVistaPrevia ? (
          <div className="overflow-x-auto rounded-r12 border border-bdr bg-slate-100 p-4">
            <p className="mb-3 text-[12px] font-medium text-t700">Vista previa (A4 horizontal)</p>
            <div className="inline-block shadow-lg">
              <ReporteEjecutivoPrint snap={snapshot} hitosLista={snapshot.proximosHitosCompletos} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Solo impresión PDF: oculto en pantalla, único bloque en el flujo print */}
      <div className="reporte-ejecutivo-print-root hidden print:block">
        <ReporteEjecutivoPrint snap={snapshot} />
      </div>
    </>
  );
}
