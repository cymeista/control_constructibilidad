import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  calcularRedistribucionAgregarHorasDestinoCompleto,
  calcularRedistribucionMaximoDisponible,
  calcularUfEntregablePorCategoria,
  construirLineasRedistribucion,
  evaluarCompensacionParcialDestino,
  etiquetaEstadoLineaRedistribucion,
  historialRedistribucionPorEntregable,
  horasEntregableARecord,
  horasAgregarSugeridasParaRegularizarDeficit,
  MENSAJE_AUTO_SIN_COMBINACION_05H,
  mensajeDeficitCategoriaDestino,
  mensajePresupuestoBajoGastoReal,
  redondearHorasAjusteManual,
  redondearMediaHoraHaciaArriba,
  tarifasDesdeProyecto,
  UF_REDISTRIBUCION_TOLERANCIA,
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
  const [ultimoResultadoRedist, setUltimoResultadoRedist] = useState<ResultadoRedistribDestinoCompleto | null>(null);
  /** UI legacy asignaciones oculta; cálculos internos se mantienen. */
  const mostrarDetalleLegacyAsignacionesUi = false;
  const [legacyAsignacionesAbierto, setLegacyAsignacionesAbierto] = useState(false);
  const [mensajeAuto, setMensajeAuto] = useState<string | null>(null);
  const [detalleAutoExpandido, setDetalleAutoExpandido] = useState(false);
  const [mensajeExitoParcial, setMensajeExitoParcial] = useState<string | null>(null);
  const resultadosPanelRef = useRef<HTMLDivElement>(null);

  const fmtH = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const fmtHorasTabla = (n: number) => {
    const r = redondearHorasAjusteManual(n);
    const dec = Math.abs(r - Math.round(r * 10) / 10) > 1e-6 ? 2 : 1;
    return r.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  useEffect(() => {
    if (open) {
      setHorasEdit(horasEntregableARecord(ent));
      setComentario("");
      setErrores([]);
      setCategoriaDestino("L2");
      setHorasAAgregarTexto("");
      setUltimoResultadoRedist(null);
      setMensajeAuto(null);
      setDetalleAutoExpandido(false);
      setMensajeExitoParcial(null);
      setLegacyAsignacionesAbierto(false);
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

  const erroresGuardadoVivo = useMemo(() => {
    if (!tarifas) return ["Sin tarifas de proyecto válidas."];
    return validarRedistribucionHoras(horasActuales, horasEdit, lineas, tarifas, comentario, {
      exigirMultiploMediaHora: false,
      exigirComentario: true,
    });
  }, [tarifas, horasActuales, horasEdit, lineas, comentario]);

  const puedeGuardar = tarifas != null && erroresGuardadoVivo.length === 0;

  const lineaDestino = useMemo(
    () => lineas.find((l) => l.categoria === categoriaDestino),
    [lineas, categoriaDestino],
  );

  const compensacionParcial = useMemo(() => {
    if (!tarifas || !lineaDestino) {
      return {
        mostrarOpcionMaximo: false,
        deficitHoras: 0,
        deficitUf: 0,
        ufCompensable: 0,
        mensajeInsuficiencia: null,
      };
    }
    return evaluarCompensacionParcialDestino(categoriaDestino, lineas, tarifas);
  }, [tarifas, lineaDestino, categoriaDestino, lineas]);

  const aplicarHorasSugeridasDestino = useCallback(
    (cat: AsignacionHoraCategoria) => {
      const ln = lineas.find((l) => l.categoria === cat);
      if (!ln || ln.deficitHoras <= 0) return;
      const sugerido = horasAgregarSugeridasParaRegularizarDeficit(ln);
      setHorasAAgregarTexto(String(Math.round(sugerido * 10) / 10));
    },
    [lineas],
  );

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
    const lnDest = lineas.find((l) => l.categoria === categoriaDestino);
    if (lnDest) {
      const presupuestoResultante = horasActuales[categoriaDestino] + raw;
      if (presupuestoResultante + 1e-6 < lnDest.gastoRealRegistroHora) {
        setUltimoResultadoRedist(null);
        setMensajeAuto(null);
        setErrores([mensajePresupuestoBajoGastoReal(categoriaDestino, presupuestoResultante, lnDest)]);
        return;
      }
    }
    const res = calcularRedistribucionAgregarHorasDestinoCompleto(lineas, tarifas, horasActuales, categoriaDestino, raw);
    setUltimoResultadoRedist(res);
    if (res.codigo === "ok") {
      setHorasEdit(res.propuesta);
      setMensajeAuto(null);
      setMensajeExitoParcial(null);
      setErrores([]);
      requestAnimationFrame(() => {
        resultadosPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      const raw = Number(String(horasAAgregarTexto).replace(",", ".").trim());
      const incremento = Number.isFinite(raw) && raw > 0 ? raw : 0;
      if (incremento > 0) {
        setHorasEdit((prev) => ({
          ...prev,
          [categoriaDestino]: redondearHorasAjusteManual(
            horasActuales[categoriaDestino] + incremento,
          ),
        }));
      }
      setMensajeAuto(MENSAJE_AUTO_SIN_COMBINACION_05H);
      setDetalleAutoExpandido(false);
      setErrores([]);
      requestAnimationFrame(() => {
        resultadosPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [tarifas, tarifasError, lineas, horasActuales, categoriaDestino, horasAAgregarTexto, ent]);

  const onRedistribuirMaximoDisponible = useCallback(() => {
    if (!tarifas) {
      setErrores([tarifasError ?? "Sin tarifas de proyecto."]);
      return;
    }
    const res = calcularRedistribucionMaximoDisponible(lineas, tarifas, horasActuales, categoriaDestino);
    setUltimoResultadoRedist(null);
    setMensajeAuto(null);
    const hayCambio = CATEGORIAS_REDIST.some(
      (c) => Math.abs(res.horasPropuestas[c] - horasActuales[c]) > 1e-6,
    );
    if (res.ok && hayCambio) {
      setHorasEdit({
        L2: res.horasPropuestas.L2,
        P4: res.horasPropuestas.P4,
        P3: res.horasPropuestas.P3,
        P2: res.horasPropuestas.P2,
      });
      setMensajeExitoParcial(res.mensajeExito);
      setErrores([]);
      requestAnimationFrame(() => {
        resultadosPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      setMensajeExitoParcial(null);
      setErrores(
        res.errores.length > 0
          ? res.errores
          : hayCambio
            ? ["La propuesta parcial no pasó las validaciones de guardado."]
            : ["No se pudo generar la redistribución parcial."],
      );
    }
  }, [tarifas, tarifasError, lineas, horasActuales, categoriaDestino]);

  const onAplicarSugerencia = useCallback((s: SugerenciaRedistribAgregar) => {
    setHorasEdit({ ...s.horasPropuestas });
    setErrores([]);
    setUltimoResultadoRedist(null);
    setMensajeExitoParcial(null);
  }, []);

  const onGuardar = useCallback(() => {
    if (!tarifas) {
      setErrores([tarifasError ?? "Sin tarifas de proyecto."]);
      return;
    }
    const errs = validarRedistribucionHoras(horasActuales, horasEdit, lineas, tarifas, comentario, {
      exigirMultiploMediaHora: false,
    });
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
            <DialogTitle>Redistribuir presupuesto por categoría</DialogTitle>
            <DialogDescription>
              Ajusta L2 / P4 / P3 / P2 según presupuesto y gasto real RegistroHora (DIRECTA válida), conservando UF total
              dentro de ±{UF_REDISTRIBUCION_TOLERANCIA} UF. No modifica asignaciones ni registros de horas.
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
                <div className="mb-1 font-semibold text-t900">Control por categoría (RegistroHora)</div>
                <p className="mb-2 text-[10px] leading-snug text-t500">
                  Misma lectura que Gestión de Horas: presupuesto del entregable vs gasto real DIRECTA válida por categoría
                  del profesional.
                </p>
                <div className="overflow-x-auto rounded-r8 border border-bdr">
                  <table className="w-full min-w-[520px] border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-bdr bg-surface2 text-left text-t500">
                        <th className="p-2">Categoría</th>
                        <th className="p-2 text-right">Presupuesto</th>
                        <th className="p-2 text-right">Gasto real</th>
                        <th className="p-2 text-right">Saldo / déficit</th>
                        <th className="p-2 text-right">Disp. mover</th>
                        <th className="p-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((ln) => {
                        const estadoCls =
                          ln.estado === "OK"
                            ? "bg-emerald-100 text-emerald-800"
                            : ln.estado === "SIN_PRESUPUESTO_CON_GASTO"
                              ? "bg-orange-100 text-orange-800"
                              : "bg-rose-100 text-rose-800";
                        return (
                          <tr
                            key={ln.categoria}
                            className={`border-b border-bdr/60 ${ln.categoria === categoriaDestino ? "bg-teal-500/8" : ""}`}
                          >
                            <td className="p-2 font-mono font-semibold">{ln.categoria}</td>
                            <td className="p-2 text-right font-mono">{fmtH(ln.presupuesto)} h</td>
                            <td className="p-2 text-right font-mono">{fmtH(ln.gastoRealRegistroHora)} h</td>
                            <td
                              className={`p-2 text-right font-mono ${
                                ln.saldoCategoria < 0 ? "font-semibold text-[#B91C1C]" : "text-emerald-800"
                              }`}
                            >
                              {ln.saldoCategoria >= 0 ? (
                                <>Saldo {fmtH(ln.saldoCategoria)} h</>
                              ) : (
                                <>−{fmtH(ln.deficitHoras)} h</>
                              )}
                            </td>
                            <td className="p-2 text-right font-mono">{fmtH(ln.disponibleParaMover)} h</td>
                            <td className="p-2">
                              <span className={`rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold ${estadoCls}`}>
                                {etiquetaEstadoLineaRedistribucion(ln.estado)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {mostrarDetalleLegacyAsignacionesUi ? (
                <div className="rounded-r8 border border-bdr/80 bg-white/60">
                  <button
                    type="button"
                    onClick={() => setLegacyAsignacionesAbierto((v) => !v)}
                    className="flex min-h-[40px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-t500"
                  >
                    Detalle legacy de asignaciones
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-t400 transition-transform ${legacyAsignacionesAbierto ? "rotate-180" : ""}`}
                    />
                  </button>
                  {legacyAsignacionesAbierto ? (
                    <div className="border-t border-bdr px-2 pb-3 pt-1">
                      <p className="mb-2 px-1 text-[10px] leading-snug text-t500">
                        Cupos por asignaciones_horas (cerradas, comprometidas activas, gasto Bloque 2). No define la lectura
                        operativa principal.
                      </p>
                      <div className="overflow-x-auto rounded-r6 border border-bdr">
                        <table className="w-full min-w-[480px] border-collapse text-[10px]">
                          <thead>
                            <tr className="border-b border-bdr bg-surface2 text-left text-t500">
                              <th className="p-1.5">Cat.</th>
                              <th className="p-1.5 text-right">Cons. hist.</th>
                              <th className="p-1.5 text-right">Gasto act.</th>
                              <th className="p-1.5 text-right">Comprom.</th>
                              <th className="p-1.5 text-right">Saldo legacy</th>
                              <th className="p-1.5 text-right">Mín. operativo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineas.map((ln) => (
                              <tr key={`leg-${ln.categoria}`} className="border-b border-bdr/60">
                                <td className="p-1.5 font-mono font-semibold">{ln.categoria}</td>
                                <td className="p-1.5 text-right font-mono">{fmtH(ln.consumidoHistoricoCerrado)} h</td>
                                <td className="p-1.5 text-right font-mono">{fmtH(ln.gastoRealActivo)} h</td>
                                <td className="p-1.5 text-right font-mono">{fmtH(ln.comprometidoActivo)} h</td>
                                <td className="p-1.5 text-right font-mono">{fmtH(ln.saldoLegacyAsignaciones)} h</td>
                                <td className="p-1.5 text-right font-mono">{fmtH(ln.minHorasPermitidas)} h</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-r8 border border-bdr bg-white px-3 py-3 shadow-xs">
                <div className="text-[13px] font-semibold text-t900">Agregar horas a categoría</div>
                <p className="mt-1 text-[11px] leading-snug text-t600">
                  Elija la categoría que necesita más horas y cuántas desea sumar. El sistema compensa UF automáticamente
                  desde otras categorías con saldo positivo (presupuesto − gasto real RegistroHora), priorizando la mayor UF
                  disponible por categoría.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] font-semibold">
                      Categoría destino <span className="text-[#B91C1C]">*</span>
                    </Label>
                    <Select
                      value={categoriaDestino}
                      onValueChange={(v) => {
                        if (!v) return;
                        const cat = v as AsignacionHoraCategoria;
                        setCategoriaDestino(cat);
                        aplicarHorasSugeridasDestino(cat);
                        setMensajeAuto(null);
                        setMensajeExitoParcial(null);
                        setErrores([]);
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
                {lineaDestino && lineaDestino.deficitHoras > 0 ? (
                  <div className="mt-3 rounded-r8 border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-snug text-rose-950">
                    <p className="font-semibold">{mensajeDeficitCategoriaDestino(lineaDestino)}</p>
                    {!compensacionParcial.mostrarOpcionMaximo ? (
                      <p className="mt-1 text-rose-900/90">
                        Se sugirieron{" "}
                        <span className="font-mono font-semibold">
                          {fmtH(horasAgregarSugeridasParaRegularizarDeficit(lineaDestino))} h
                        </span>{" "}
                        a agregar (déficit completo). Sumar menos dejará el presupuesto por debajo del gasto real
                        RegistroHora.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {compensacionParcial.mensajeInsuficiencia ? (
                  <div className="mt-3 rounded-r8 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-950">
                    <p>{compensacionParcial.mensajeInsuficiencia}</p>
                  </div>
                ) : null}
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
                <div className="mt-3 flex flex-wrap gap-2">
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
                  {compensacionParcial.mostrarOpcionMaximo ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-r8 border-amber-300 bg-amber-50/80 text-amber-950 hover:bg-amber-100"
                      onClick={onRedistribuirMaximoDisponible}
                      disabled={!tarifas}
                    >
                      Redistribuir máximo disponible
                    </Button>
                  ) : null}
                </div>

                {mensajeExitoParcial ? (
                  <div className="mt-3 rounded-r8 border border-teal-600/35 bg-teal-500/10 px-3 py-2 text-[11px] text-teal-950">
                    <p className="font-semibold">{mensajeExitoParcial}</p>
                    <p className="mt-1 text-teal-900/90">
                      Revise las horas finales y la comparación UF. Complete el comentario para guardar.
                    </p>
                  </div>
                ) : null}

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

                {mensajeAuto ? (
                  <div className="mt-3 rounded-r8 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
                    <p className="leading-snug">{mensajeAuto}</p>
                    {ultimoResultadoRedist && ultimoResultadoRedist.mensajes.length > 0 ? (
                      <button
                        type="button"
                        className="mt-2 text-[10px] font-semibold text-amber-900 underline"
                        onClick={() => setDetalleAutoExpandido((v) => !v)}
                      >
                        {detalleAutoExpandido ? "Ocultar detalle técnico" : "Ver detalle técnico"}
                      </button>
                    ) : null}
                    {detalleAutoExpandido && ultimoResultadoRedist ? (
                      <ul className="mt-2 list-inside list-disc space-y-1 text-[10px] leading-snug text-amber-900/90">
                        {ultimoResultadoRedist.mensajes.map((m, i) => (
                          <li key={`${i}-${m.slice(0, 120)}`}>{m}</li>
                        ))}
                      </ul>
                    ) : null}
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
                <div className="mb-1 font-semibold text-t900">Ajuste manual — horas finales por categoría</div>
                <p className="mb-2 text-[11px] leading-snug text-t600">
                  Edite L2 / P4 / P3 / P2 con precisión de 0,1 h (hasta 0,01 h internamente). La UF se recalcula al
                  instante; puede guardar cuando ΔUF esté dentro de ±{UF_REDISTRIBUCION_TOLERANCIA} UF.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
                  {CATEGORIAS_REDIST.map((c) => {
                    const ln = lineas.find((l) => l.categoria === c);
                    return (
                      <div key={c} className="flex flex-col gap-1">
                        <Label className="text-[11px]">{c}</Label>
                        <Input
                          type="number"
                          step={0.1}
                          min={0}
                          className="font-mono"
                          value={
                            Number.isFinite(horasEdit[c])
                              ? redondearHorasAjusteManual(horasEdit[c])
                              : 0
                          }
                          onChange={(ev) => {
                            const v = Number(ev.target.value);
                            setMensajeAuto(null);
                            setMensajeExitoParcial(null);
                            setHorasEdit((prev) => ({
                              ...prev,
                              [c]: Number.isFinite(v) ? redondearHorasAjusteManual(v) : prev[c],
                            }));
                          }}
                        />
                        {ln ? (
                          <span className="text-[9px] text-t400">
                            Gasto real RegistroHora: {fmtH(ln.gastoRealRegistroHora)} h
                            {ln.deficitHoras > 0
                              ? ` · déficit ${fmtH(ln.deficitHoras)} h`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
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
                {!puedeGuardar && erroresGuardadoVivo.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc rounded-r6 border border-rose-200/80 bg-rose-50/80 px-2.5 py-1.5 text-[10px] text-rose-900">
                    {erroresGuardadoVivo.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                ) : null}
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
                            <td className="p-2 font-mono">{fmtHorasTabla(horasActuales[c])}</td>
                            <td className="p-2 font-mono">{fmtHorasTabla(horasEdit[c])}</td>
                            <td className="p-2 font-mono">
                              {dh > 0 ? "+" : ""}
                              {fmtHorasTabla(dh)}
                            </td>
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
            disabled={!puedeGuardar}
            title={!puedeGuardar ? "Revise ΔUF, mínimos por categoría y comentario" : undefined}
          >
            Guardar redistribución
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
