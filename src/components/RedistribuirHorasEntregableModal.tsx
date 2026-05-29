import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AsignacionHoraCategoria,
  Cliente,
  Entregable,
  HistorialRedistribucionHoras,
  HorasPorCategoria,
  Proyecto,
} from "@/context/AppDataContext";
import { useAppData } from "@/context/AppDataContext";
import {
  CATEGORIAS_REDIST,
  UF_REDISTRIBUCION_TOLERANCIA,
  calcularRedistribucionAgregarHorasDestinoCompleto,
  calcularUfEntregablePorCategoria,
  construirLineasRedistribucion,
  esMultiploDeMediaHora,
  historialRedistribucionPorEntregable,
  horasEntregableARecord,
  normalizarAMediaHoraMasCercano,
  redondearMediaHoraHaciaArriba,
  tarifasDesdeProyecto,
  validarRedistribucionHoras,
  type ResultadoRedistribDestinoCompleto,
  type SugerenciaRedistribAgregar,
} from "@/entregables/redistribucionHorasEntregable";
import { fechaHoyIsoLocal } from "@/entregables/asignacionHoraConsumo";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ent: Entregable;
  clientes: Cliente[];
  proyectos: Proyecto[];
};

export function RedistribuirHorasEntregableModal({ open, onOpenChange, ent, clientes, proyectos }: Props) {
  const {
    asignaciones_horas,
    registro_horas,
    entregables,
    profesionales,
    historial_redistribuciones_horas,
    ejecutarRedistribucionHorasEntregable: ejecutar,
  } = useAppData();

  const proyecto = useMemo(() => proyectos.find((p) => p.id === ent.proyecto_id), [proyectos, ent.proyecto_id]);
  const cliente = useMemo(
    () => (proyecto ? clientes.find((c) => c.id === proyecto.cliente_id) : undefined),
    [clientes, proyecto],
  );

  const tarifasResult = useMemo(() => (proyecto ? tarifasDesdeProyecto(proyecto) : null), [proyecto]);
  const tarifas = tarifasResult && "ok" in tarifasResult && tarifasResult.ok ? tarifasResult.tarifas : null;
  const tarifasError = tarifasResult && "ok" in tarifasResult && !tarifasResult.ok ? tarifasResult.error : null;

  const historialEnt = useMemo(
    () => historialRedistribucionPorEntregable(historial_redistribuciones_horas ?? [], ent.id).slice(0, 8),
    [historial_redistribuciones_horas, ent.id],
  );

  const hoy = fechaHoyIsoLocal();
  const lineas = useMemo(
    () =>
      construirLineasRedistribucion(
        ent,
        asignaciones_horas,
        registro_horas,
        entregables,
        proyectos,
        profesionales,
        hoy,
      ),
    [ent, asignaciones_horas, registro_horas, entregables, proyectos, profesionales, hoy],
  );

  const horasActuales = useMemo(() => horasEntregableARecord(ent), [ent]);

  const [horasEdit, setHorasEdit] = useState<HorasPorCategoria>(horasActuales);
  const [comentario, setComentario] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [categoriaDestino, setCategoriaDestino] = useState<AsignacionHoraCategoria>("L2");
  const [horasAAgregarTexto, setHorasAAgregarTexto] = useState("");
  /** True si el usuario tocó los inputs de horas finales sin recalcular compensación UF automática. */
  const [edicionManualHorasPropuestas, setEdicionManualHorasPropuestas] = useState(false);
  const [ultimoResultadoRedist, setUltimoResultadoRedist] = useState<ResultadoRedistribDestinoCompleto | null>(null);
  const resultadosPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setHorasEdit(horasEntregableARecord(ent));
      setComentario("");
      setErrores([]);
      setCategoriaDestino("L2");
      setHorasAAgregarTexto("");
      setEdicionManualHorasPropuestas(false);
      setUltimoResultadoRedist(null);
    }
  }, [open, ent]);

  const horasAAgregarBrutoNum = useMemo(
    () => Number(String(horasAAgregarTexto).replace(",", ".").trim()),
    [horasAAgregarTexto],
  );
  const horasAAgregarRedondeadas = useMemo(() => {
    if (!Number.isFinite(horasAAgregarBrutoNum) || horasAAgregarBrutoNum <= 0) return 0;
    return redondearMediaHoraHaciaArriba(horasAAgregarBrutoNum);
  }, [horasAAgregarBrutoNum]);
  const ufRequeridaDestino = useMemo(() => {
    if (!tarifas || horasAAgregarRedondeadas <= 0) return 0;
    return horasAAgregarRedondeadas * tarifas[categoriaDestino];
  }, [tarifas, horasAAgregarRedondeadas, categoriaDestino]);

  const ufAntes = useMemo(
    () => (tarifas ? calcularUfEntregablePorCategoria(horasActuales, tarifas) : 0),
    [horasActuales, tarifas],
  );
  const ufDespues = useMemo(
    () => (tarifas ? calcularUfEntregablePorCategoria(horasEdit, tarifas) : 0),
    [horasEdit, tarifas],
  );
  const diffUf = ufDespues - ufAntes;
  const ufCuadrada = tarifas && Math.abs(diffUf) <= UF_REDISTRIBUCION_TOLERANCIA;

  const onCalcularRedistribucion = useCallback(() => {
    if (!tarifas) {
      setErrores([tarifasError ?? "Sin tarifas de proyecto."]);
      setUltimoResultadoRedist(null);
      return;
    }
    const raw = Number(String(horasAAgregarTexto).replace(",", ".").trim());
    if (!Number.isFinite(raw) || raw <= 0) {
      setErrores(["Indique horas a agregar mayores a 0 (acepta coma o punto decimal)."]);
      setUltimoResultadoRedist(null);
      return;
    }
    const res = calcularRedistribucionAgregarHorasDestinoCompleto(lineas, tarifas, horasActuales, categoriaDestino, raw);
    setUltimoResultadoRedist(res);
    setEdicionManualHorasPropuestas(false);
    if (res.codigo === "ok") {
      setHorasEdit(res.propuesta);
      setErrores([]);
      requestAnimationFrame(() => {
        resultadosPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      setHorasEdit(horasEntregableARecord(ent));
      setErrores(
        res.mensajes.length > 0
          ? res.mensajes
          : ["No se pudo calcular la redistribución. Revise categoría, horas y disponibilidad en otras categorías."],
      );
    }
  }, [tarifas, tarifasError, lineas, horasActuales, categoriaDestino, horasAAgregarTexto, ent]);

  const onAplicarSugerencia = useCallback((s: SugerenciaRedistribAgregar) => {
    setHorasEdit({ ...s.horasPropuestas });
    setEdicionManualHorasPropuestas(false);
    setErrores([]);
    setUltimoResultadoRedist(null);
  }, []);

  const onGuardar = useCallback(() => {
    if (!tarifas) {
      setErrores([tarifasError ?? "Sin tarifas de proyecto."]);
      return;
    }
    const errs = validarRedistribucionHoras(horasActuales, horasEdit, lineas, tarifas, comentario);
    if (errs.length) {
      setErrores(errs);
      return;
    }
    const r = ejecutar({ entregableId: ent.id, horasNuevas: horasEdit, comentario });
    if (!r.ok) {
      setErrores(r.errors);
      return;
    }
    onOpenChange(false);
  }, [tarifas, tarifasError, horasActuales, horasEdit, lineas, comentario, ejecutar, ent.id, onOpenChange]);

  const ctxLine = [
    cliente ? `${cliente.nombre} (${cliente.codigo})` : "Cliente —",
    proyecto ? `${proyecto.codigo} · ${proyecto.nombre}` : "Proyecto —",
    `Fase ${(ent.fase_codigo ?? "").trim() || "—"}`,
    `«${ent.nombre}»`,
  ].join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-r10 p-0 sm:max-w-6xl">
        <div className="border-b border-bdr px-6 py-4">
          <DialogHeader className="text-left">
            <DialogTitle>Redistribuir horas por categoría</DialogTitle>
            <DialogDescription>
              Ajusta L2 / P4 / P3 / P2 del entregable conservando UF total dentro de ±{UF_REDISTRIBUCION_TOLERANCIA} UF. No
              modifica asignaciones ni registros de horas.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:gap-8">
            <div className="space-y-4 text-[12px] text-t800">
              <div className="rounded-r8 border border-bdr bg-surface2 px-3 py-2 text-[11px] leading-snug text-t700">
                {ctxLine}
              </div>

              {!tarifas ? (
                <div className="rounded-r8 border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                  {tarifasError ?? "Proyecto no encontrado o sin tarifas válidas."}
                </div>
              ) : null}

              <div>
                <div className="mb-1 font-semibold text-t900">Situación actual por categoría</div>
                <div className="overflow-x-auto rounded-r8 border border-bdr">
                  <table className="w-full min-w-[560px] border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-bdr bg-surface2 text-left text-t500">
                        <th className="p-2">Cat.</th>
                        <th className="p-2">Presup.</th>
                        <th className="p-2">Cons. hist.</th>
                        <th className="p-2">Gasto act.</th>
                        <th className="p-2">Comprom.</th>
                        <th className="p-2">Disp. mover</th>
                        <th className="p-2">Déficit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((ln) => (
                        <tr
                          key={ln.categoria}
                          className={`border-b border-bdr/60 ${ln.categoria === categoriaDestino ? "bg-teal-500/8" : ""}`}
                        >
                          <td className="p-2 font-mono font-semibold">{ln.categoria}</td>
                          <td className="p-2 font-mono">{ln.presupuesto.toFixed(1)}</td>
                          <td className="p-2 font-mono">{ln.consumidoHistoricoCerrado.toFixed(1)}</td>
                          <td className="p-2 font-mono">{ln.gastoRealActivo.toFixed(1)}</td>
                          <td className="p-2 font-mono">{ln.comprometidoActivo.toFixed(1)}</td>
                          <td className="p-2 font-mono">{ln.disponibleParaMover.toFixed(1)}</td>
                          <td className={`p-2 font-mono ${ln.deficitHoras > 0 ? "font-semibold text-[#B91C1C]" : ""}`}>
                            {ln.deficitHoras.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-r8 border border-bdr bg-white px-3 py-3 shadow-xs">
                <div className="text-[13px] font-semibold text-t900">Agregar horas a categoría</div>
                <p className="mt-1 text-[11px] leading-snug text-t600">
                  Elija la categoría que necesita más horas y cuántas desea sumar. El sistema compensa UF automáticamente
                  desde otras categorías con disponibilidad para mover, priorizando la mayor UF disponible por categoría.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] font-semibold">
                      Categoría destino <span className="text-[#B91C1C]">*</span>
                    </Label>
                    <Select
                      value={categoriaDestino}
                      onValueChange={(v) => {
                        if (v) setCategoriaDestino(v as AsignacionHoraCategoria);
                      }}
                    >
                      <SelectTrigger className="w-full rounded-r8 font-mono">
                        <SelectValue placeholder="Destino" />
                      </SelectTrigger>
                      <SelectContent className="z-[300]" position="popper">
                        {CATEGORIAS_REDIST.map((c) => (
                          <SelectItem key={c} value={c} className="font-mono">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="redist-horas-agregar" className="text-[11px] font-semibold">
                      Horas a agregar <span className="text-[#B91C1C]">*</span>
                    </Label>
                    <Input
                      id="redist-horas-agregar"
                      type="text"
                      inputMode="decimal"
                      className="max-w-[12rem] rounded-r8 font-mono"
                      placeholder="Ej. 20 o 20,5"
                      value={horasAAgregarTexto}
                      onChange={(e) => setHorasAAgregarTexto(e.target.value)}
                    />
                  </div>
                </div>
                {tarifas && horasAAgregarRedondeadas > 0 ? (
                  <p className="mt-2 text-[10px] leading-snug text-t500">
                    Tras redondeo (0,5 h hacia arriba): <span className="font-mono font-semibold">{horasAAgregarRedondeadas.toFixed(1)}</span> h en{" "}
                    <span className="font-mono">{categoriaDestino}</span> ≈{" "}
                    <span className="font-mono font-semibold">{ufRequeridaDestino.toFixed(4)}</span> UF a compensar.
                  </p>
                ) : (
                  <p className="mt-2 text-[10px] leading-snug text-t500">
                    Las horas se redondean hacia arriba al múltiplo de 0,5 h (p. ej. 13,1 → 13,5; 13,6 → 14,0).
                  </p>
                )}
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="rounded-r8"
                    onClick={onCalcularRedistribucion}
                    disabled={!tarifas}
                  >
                    Calcular redistribución
                  </Button>
                </div>

                {ultimoResultadoRedist?.codigo === "ok" ? (
                  <div className="mt-3 rounded-r8 border border-teal-600/35 bg-teal-500/10 px-3 py-2 text-[11px] text-teal-950">
                    <p className="font-semibold">Simulación calculada</p>
                    <p className="mt-1 leading-snug">
                      +{ultimoResultadoRedist.addRoundedSolicitud.toFixed(1)} h en{" "}
                      <span className="font-mono font-semibold">{categoriaDestino}</span>, compensado desde otras
                      categorías. ΔUF{" "}
                      <span className="font-mono font-semibold">
                        {ultimoResultadoRedist.diferenciaUf.toFixed(4)}
                      </span>{" "}
                      (dentro de tolerancia). Revise «Horas finales propuestas» a la derecha y guarde con comentario.
                    </p>
                    <div className="mt-2 overflow-x-auto rounded-r6 border border-teal-600/20 bg-white/80">
                      <table className="w-full min-w-[280px] border-collapse text-[10px]">
                        <thead>
                          <tr className="border-b border-teal-600/15 text-left text-t500">
                            <th className="p-1.5">Cat.</th>
                            <th className="p-1.5">Antes</th>
                            <th className="p-1.5">Después</th>
                            <th className="p-1.5">Δ h</th>
                          </tr>
                        </thead>
                        <tbody>
                          {CATEGORIAS_REDIST.map((c) => {
                            const dh = ultimoResultadoRedist.propuesta[c] - horasActuales[c];
                            return (
                              <tr key={c} className="border-b border-teal-600/10">
                                <td className="p-1.5 font-mono font-semibold">{c}</td>
                                <td className="p-1.5 font-mono">{horasActuales[c].toFixed(1)}</td>
                                <td className="p-1.5 font-mono">{ultimoResultadoRedist.propuesta[c].toFixed(1)}</td>
                                <td
                                  className={`p-1.5 font-mono ${dh > 0 ? "text-teal-800" : dh < 0 ? "text-rose-800" : ""}`}
                                >
                                  {dh > 0 ? "+" : ""}
                                  {dh.toFixed(1)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {ultimoResultadoRedist && ultimoResultadoRedist.codigo !== "ok" ? (
                  <div
                    className={
                      ultimoResultadoRedist.codigo === "sin_disponibilidad"
                        ? "mt-3 rounded-r8 border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-950"
                        : "mt-3 rounded-r8 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950"
                    }
                  >
                    <p className="mb-1 font-semibold">No se pudo cuadrar la redistribución</p>
                    <ul className="list-inside list-disc space-y-1 leading-snug">
                      {ultimoResultadoRedist.mensajes.map((m, i) => (
                        <li key={`${i}-${m.slice(0, 120)}`}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {ultimoResultadoRedist && ultimoResultadoRedist.sugerencias.length > 0 ? (
                  <div className="mt-3 space-y-2 rounded-r8 border border-bdr bg-surface2 px-3 py-2">
                    <div className="text-[12px] font-semibold text-t900">Alternativas sugeridas</div>
                    <p className="text-[10px] leading-snug text-t600">
                      Ordenadas por cercanía al incremento pedido. Pulse para cargar horas finales y comparación UF.
                    </p>
                    <ul className="space-y-2">
                      {ultimoResultadoRedist.sugerencias.map((s, idx) => (
                        <li
                          key={`${s.descripcion}-${idx}`}
                          className="flex flex-col gap-1.5 rounded-r6 border border-bdr/80 bg-white px-2 py-2 text-[11px] text-t800"
                        >
                          <span className="leading-snug">{s.descripcion}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-fit shrink-0 rounded-r8 text-[11px]"
                            onClick={() => onAplicarSugerencia(s)}
                          >
                            Aplicar propuesta sugerida
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {historialEnt.length > 0 ? (
                <div>
                  <div className="mb-1 font-semibold text-t900">Historial reciente (este entregable)</div>
                  <ul className="max-h-44 space-y-1 overflow-y-auto rounded-r8 border border-bdr bg-surface2/60 px-3 py-2 text-[11px] text-t700">
                    {historialEnt.map((h: HistorialRedistribucionHoras) => (
                      <li key={h.id} className="border-b border-bdr/40 pb-1 last:border-0">
                        <span className="font-mono text-t600">{h.fecha}</span> · ΔUF {h.diferencia_uf.toFixed(4)} ·{" "}
                        <span className="italic text-t600">
                          {h.comentario.length > 80 ? `${h.comentario.slice(0, 80)}…` : h.comentario}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div ref={resultadosPanelRef} className="space-y-4 text-[12px] text-t800">
              <div>
                <div className="mb-1 font-semibold text-t900">Horas finales propuestas</div>
                <p className="mb-2 text-[11px] leading-snug text-t600">
                  Valores que quedarían en el entregable tras la redistribución. Si edita aquí, pulse de nuevo{" "}
                  <span className="font-semibold">Calcular redistribución</span> para alinear compensación UF automática.
                </p>
                {edicionManualHorasPropuestas ? (
                  <div className="mb-2 rounded-r6 border border-amber-200/90 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
                    Ha modificado horas manualmente: la compensación multiorigen puede no coincidir con estos valores. Use{" "}
                    <span className="font-semibold">Calcular redistribución</span> o revise UF antes de guardar.
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
                  {CATEGORIAS_REDIST.map((c) => (
                    <div key={c} className="flex flex-col gap-1">
                      <Label className="text-[11px]">{c}</Label>
                      <Input
                        type="number"
                        step={0.5}
                        className="font-mono"
                        value={horasEdit[c]}
                        onChange={(ev) => {
                          const v = Number(ev.target.value);
                          setEdicionManualHorasPropuestas(true);
                          setHorasEdit((prev) => ({ ...prev, [c]: Number.isFinite(v) ? v : prev[c] }));
                        }}
                        onBlur={() => {
                          setHorasEdit((prev) => ({
                            ...prev,
                            [c]: normalizarAMediaHoraMasCercano(prev[c]),
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-r8 border border-bdr bg-white px-3 py-2">
                <div className="font-semibold text-t900">Comparación UF</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                  <span>
                    UF antes: <span className="font-mono font-semibold">{ufAntes.toFixed(4)}</span>
                  </span>
                  <span>
                    UF después: <span className="font-mono font-semibold">{ufDespues.toFixed(4)}</span>
                  </span>
                  <span>
                    ΔUF: <span className="font-mono font-semibold">{diffUf.toFixed(4)}</span>
                  </span>
                  {tarifas ? (
                    <span
                      className={ufCuadrada ? "font-semibold text-[#047857]" : "font-semibold text-[#B91C1C]"}
                    >
                      {ufCuadrada
                        ? "UF cuadrada (dentro de tolerancia)"
                        : "Fuera de tolerancia ±0,05 UF — no se puede guardar"}
                    </span>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="mb-1 font-semibold text-t900">Horas antes / después y movimiento económico</div>
                <div className="overflow-x-auto rounded-r8 border border-bdr">
                  <table className="w-full min-w-[520px] border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-bdr bg-surface2 text-left text-t500">
                        <th className="p-2">Cat.</th>
                        <th className="p-2">Tarifa</th>
                        <th className="p-2">Antes</th>
                        <th className="p-2">Después</th>
                        <th className="p-2">Δ h</th>
                        <th className="p-2">Δ UF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CATEGORIAS_REDIST.map((c) => {
                        const dh = horasEdit[c] - horasActuales[c];
                        const duf = tarifas ? dh * tarifas[c] : 0;
                        return (
                          <tr key={c} className="border-b border-bdr/60">
                            <td className="p-2 font-mono font-semibold">{c}</td>
                            <td className="p-2 font-mono">{tarifas ? tarifas[c].toFixed(4) : "—"}</td>
                            <td className="p-2 font-mono">{horasActuales[c].toFixed(1)}</td>
                            <td className="p-2 font-mono">{horasEdit[c].toFixed(1)}</td>
                            <td className="p-2 font-mono">{dh.toFixed(1)}</td>
                            <td className="p-2 font-mono">{tarifas ? duf.toFixed(4) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="redist-comentario" className="text-[11px] font-semibold">
                  Comentario (obligatorio)
                </Label>
                <Textarea
                  id="redist-comentario"
                  rows={3}
                  placeholder="Motivo de la redistribución de horas…"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  className="rounded-r8 text-[12px]"
                />
              </div>

              {errores.length > 0 ? (
                <ul className="list-inside list-disc rounded-r8 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
                  {errores.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-bdr px-6 py-4 sm:gap-0">
          <Button type="button" variant="outline" className="rounded-r8" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-r8"
            onClick={onGuardar}
            disabled={!tarifas || !CATEGORIAS_REDIST.every((c) => esMultiploDeMediaHora(horasEdit[c]))}
          >
            Guardar redistribución
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
