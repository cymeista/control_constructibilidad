import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppData } from "@/context/AppDataContext";
import type {
  EvaluacionEntregableRespaldo,
  EvaluacionEntregableRespuesta,
  Profesional,
  RespuestaEvaluacionEntregableValor,
  TipoEvaluacionEntregableTipo,
} from "@/context/AppDataContext";
import EvaluacionRespaldosSection from "@/components/evaluacion/EvaluacionRespaldosSection";
import { newEvaluacionId } from "@/evaluacion/evaluacionRespaldos";
import { useAuth } from "@/security/AuthContext";
import { canUploadEvaluacionRespaldoStorage } from "@/supabase/supabaseEvaluacionStorage";
import {
  calcularPuntajesEvaluacion,
  fmtHorasEval,
  fmtPctColaboracion,
  listarEntregablesEvaluables,
  preguntasActivasPorTipo,
  puntajePorRespuesta,
  sugerirTipoEvaluacionPorNombreEntregable,
  type EntregableEvaluableOpcion,
} from "@/evaluacion/evaluacionEntregablesLogic";
import { formatGanttDateCL } from "@/gantt/ganttChartUtils";

type RespuestasMap = Record<string, RespuestaEvaluacionEntregableValor | "">;

export default function CrearEvaluacionEntregableModal({
  open,
  onOpenChange,
  profesionalInicialId,
  profesionales,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profesionalInicialId: string;
  profesionales: Profesional[];
  onGuardado: () => void;
}) {
  const {
    equipo_entregable,
    entregables,
    proyectos,
    clientes,
    registro_horas,
    profesionales: profsData,
    preguntas_evaluacion_entregables,
    addEvaluacionEntregable,
    addPreguntaEvaluacionEntregable,
  } = useAppData();
  const { role, authSource } = useAuth();
  const canUploadStorage = canUploadEvaluacionRespaldoStorage(authSource, role);

  const [pendingEvaluacionId, setPendingEvaluacionId] = useState(() => newEvaluacionId());
  const [profesionalId, setProfesionalId] = useState(profesionalInicialId);
  const [entregableId, setEntregableId] = useState("");
  const [tipo, setTipo] = useState<TipoEvaluacionEntregableTipo>("ENTREGABLE");
  const [respuestas, setRespuestas] = useState<RespuestasMap>({});
  const [comentario, setComentario] = useState("");
  const [nuevaPreguntaTexto, setNuevaPreguntaTexto] = useState("");
  const [nuevaPreguntaCategoria, setNuevaPreguntaCategoria] = useState("Adicional");
  const [mostrarAgregarPregunta, setMostrarAgregarPregunta] = useState(false);
  const [respaldos, setRespaldos] = useState<EvaluacionEntregableRespaldo[]>([]);

  useEffect(() => {
    if (open) {
      setProfesionalId(profesionalInicialId);
      setEntregableId("");
      setTipo("ENTREGABLE");
      setRespuestas({});
      setComentario("");
      setNuevaPreguntaTexto("");
      setMostrarAgregarPregunta(false);
      setRespaldos([]);
      setPendingEvaluacionId(newEvaluacionId());
    }
  }, [open, profesionalInicialId]);

  const opciones = useMemo(
    () =>
      listarEntregablesEvaluables({
        profesionalId,
        equipo_entregable: equipo_entregable ?? [],
        entregables,
        proyectos,
        clientes,
        registro_horas,
        profesionales: profsData,
      }),
    [
      profesionalId,
      equipo_entregable,
      entregables,
      proyectos,
      clientes,
      registro_horas,
      profsData,
    ],
  );

  const opcionSel = useMemo(
    () => opciones.find((o) => o.entregableId === entregableId) ?? null,
    [opciones, entregableId],
  );

  useEffect(() => {
    if (!opcionSel) return;
    setTipo(sugerirTipoEvaluacionPorNombreEntregable(opcionSel.entregable.nombre));
  }, [opcionSel?.entregableId]);

  const preguntas = useMemo(
    () => preguntasActivasPorTipo(preguntas_evaluacion_entregables, tipo),
    [preguntas_evaluacion_entregables, tipo],
  );

  useEffect(() => {
    setRespuestas((prev) => {
      const next: RespuestasMap = {};
      for (const p of preguntas) {
        next[p.id] = prev[p.id] ?? "";
      }
      return next;
    });
  }, [preguntas]);

  const respuestasCompletas = useMemo(() => {
    const rows: { respuesta: RespuestaEvaluacionEntregableValor }[] = [];
    for (const p of preguntas) {
      const r = respuestas[p.id];
      if (r === "CUMPLE" || r === "CUMPLE_PARCIAL" || r === "NO_CUMPLE") {
        rows.push({ respuesta: r });
      }
    }
    return rows;
  }, [preguntas, respuestas]);

  const puntajes = useMemo(
    () => calcularPuntajesEvaluacion(respuestasCompletas),
    [respuestasCompletas],
  );

  const todasRespondidas =
    preguntas.length > 0 && respuestasCompletas.length === preguntas.length;

  const puedeGuardar = Boolean(profesionalId && opcionSel && todasRespondidas && puntajes.nota_final != null);

  const handleAgregarPregunta = useCallback(() => {
    const texto = nuevaPreguntaTexto.trim();
    if (!texto) return;
    addPreguntaEvaluacionEntregable({
      tipo_evaluacion: tipo,
      categoria: nuevaPreguntaCategoria.trim() || "Adicional",
      texto,
    });
    setNuevaPreguntaTexto("");
    setMostrarAgregarPregunta(false);
  }, [addPreguntaEvaluacionEntregable, nuevaPreguntaTexto, nuevaPreguntaCategoria, tipo]);

  const handleGuardar = useCallback(() => {
    if (!opcionSel || !puedeGuardar || puntajes.nota_final == null) return;

    const respuestasRows: EvaluacionEntregableRespuesta[] = preguntas.map((p) => {
      const r = respuestas[p.id] as RespuestaEvaluacionEntregableValor;
      return {
        pregunta_id: p.id,
        texto: p.texto,
        categoria: p.categoria,
        respuesta: r,
        puntaje: puntajePorRespuesta(r),
      };
    });

    const fecha = new Date().toISOString().slice(0, 10);
    addEvaluacionEntregable(
      {
        profesional_id: profesionalId,
        entregable_id: opcionSel.entregableId,
        proyecto_id: opcionSel.proyecto.id,
        cliente_id: opcionSel.cliente.id,
        rol_en_entregable: opcionSel.rol,
        tipo_evaluacion: tipo,
        respuestas: respuestasRows,
        puntaje_obtenido: puntajes.puntaje_obtenido,
        puntaje_maximo: puntajes.puntaje_maximo,
        nota_final: puntajes.nota_final,
        comentario: comentario.trim() || undefined,
        fecha_evaluacion: fecha,
        respaldos,
      },
      { id: pendingEvaluacionId },
    );
    onGuardado();
    onOpenChange(false);
  }, [
    opcionSel,
    puedeGuardar,
    puntajes,
    preguntas,
    respuestas,
    profesionalId,
    tipo,
    comentario,
    respaldos,
    pendingEvaluacionId,
    addEvaluacionEntregable,
    onGuardado,
    onOpenChange,
  ]);

  const preguntasPorCategoria = useMemo(() => {
    const map = new Map<string, typeof preguntas>();
    for (const p of preguntas) {
      const cat = p.categoria || "General";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return [...map.entries()];
  }, [preguntas]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear nueva evaluación</DialogTitle>
          <DialogDescription>
            Entregables completados al 100% con término RevP desde junio 2026.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase text-t500">Profesional</span>
            <select
              value={profesionalId}
              onChange={(e) => {
                setProfesionalId(e.target.value);
                setEntregableId("");
              }}
              className="h-9 rounded-r6 border border-bdr bg-white px-2 text-[12px]"
            >
              <option value="">Seleccionar…</option>
              {[...profesionales]
                .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, "es"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre_completo}
                  </option>
                ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase text-t500">Entregable evaluable</span>
            <select
              value={entregableId}
              onChange={(e) => setEntregableId(e.target.value)}
              disabled={!profesionalId}
              className="h-9 rounded-r6 border border-bdr bg-white px-2 text-[12px] disabled:opacity-50"
            >
              <option value="">
                {opciones.length === 0 ? "Sin entregables evaluables" : "Seleccionar…"}
              </option>
              {opciones.map((o) => (
                <option key={o.entregableId} value={o.entregableId}>
                  {o.labelLinea}
                </option>
              ))}
            </select>
          </label>

          {opcionSel ? (
            <EntregableResumenCard opcion={opcionSel} />
          ) : null}

          <fieldset className="space-y-2">
            <span className="text-[10px] font-semibold uppercase text-t500">Tipo de evaluación</span>
            <div className="flex flex-wrap gap-2">
              {(["TALLER", "ENTREGABLE"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`rounded-r6 border px-3 py-1.5 text-[12px] font-medium ${
                    tipo === t
                      ? "border-indigo-600 bg-indigo-50 text-indigo-800"
                      : "border-bdr bg-white text-t700"
                  }`}
                  onClick={() => setTipo(t)}
                >
                  {t === "TALLER" ? "Taller" : "Entregable"}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-r8 border border-indigo-100 bg-indigo-50/50 px-3 py-2 font-mono text-[12px] text-indigo-900">
            {puntajes.puntaje_obtenido.toLocaleString("es-CL", { maximumFractionDigits: 1 })} /{" "}
            {puntajes.puntaje_maximo} puntos
            {puntajes.nota_final != null ? (
              <span className="ml-2 font-semibold">· Nota final: {puntajes.nota_final.toFixed(1)}</span>
            ) : (
              <span className="ml-2 text-t600">· Sin nota (responde todas las preguntas)</span>
            )}
          </div>

          <p className="text-[11px] leading-snug text-t600">
            Evalúa si el criterio se cumplió según el estándar esperado. Cumple = cumple el estándar; Cumple
            parcial = cumple parcialmente; No cumple = no cumple el estándar.
          </p>

          {preguntasPorCategoria.map(([cat, items]) => (
            <div key={cat} className="space-y-2">
              <p className="text-[11px] font-semibold text-indigo-800">{cat}</p>
              {items.map((p) => (
                <PreguntaRespuestaBlock
                  key={p.id}
                  texto={p.texto}
                  valor={respuestas[p.id] ?? ""}
                  onChange={(v) => setRespuestas((prev) => ({ ...prev, [p.id]: v }))}
                />
              ))}
            </div>
          ))}

          {mostrarAgregarPregunta ? (
            <div className="space-y-2 rounded-r8 border border-dashed border-bdr p-3">
              <p className="text-[11px] font-semibold text-t700">Nueva pregunta ({tipo === "TALLER" ? "Taller" : "Entregable"})</p>
              <p className="text-[11px] leading-snug text-t600">
                Redacta la pregunta como un criterio positivo. Ejemplo: «El entregable fue emitido con respaldo
                técnico suficiente». Así las respuestas Cumple / Cumple parcial / No cumple serán coherentes.
              </p>
              <input
                type="text"
                placeholder="Categoría (opcional)"
                value={nuevaPreguntaCategoria}
                onChange={(e) => setNuevaPreguntaCategoria(e.target.value)}
                className="h-8 w-full rounded-r6 border border-bdr px-2 text-[12px]"
              />
              <textarea
                placeholder="Texto de la pregunta"
                value={nuevaPreguntaTexto}
                onChange={(e) => setNuevaPreguntaTexto(e.target.value)}
                rows={2}
                className="w-full rounded-r6 border border-bdr px-2 py-1 text-[12px]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-r6 bg-indigo-700 px-3 py-1.5 text-[11px] font-semibold text-white"
                  onClick={handleAgregarPregunta}
                >
                  Guardar pregunta
                </button>
                <button
                  type="button"
                  className="rounded-r6 border border-bdr px-3 py-1.5 text-[11px] text-t700"
                  onClick={() => setMostrarAgregarPregunta(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-700"
                onClick={() => setMostrarAgregarPregunta(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar pregunta
              </button>
              <p className="text-[10px] leading-snug text-t500">
                Redacta la pregunta como un criterio positivo. Ejemplo: «El entregable fue emitido con respaldo
                técnico suficiente».
              </p>
            </div>
          )}

          <EvaluacionRespaldosSection
            respaldos={respaldos}
            onChange={setRespaldos}
            editable
            evaluacionId={pendingEvaluacionId}
            canUploadStorage={canUploadStorage}
          />

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase text-t500">Comentario (opcional)</span>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={2}
              className="w-full rounded-r6 border border-bdr px-2 py-1 text-[12px]"
            />
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            className="rounded-r6 border border-bdr px-4 py-2 text-[12px] font-medium text-t700"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!puedeGuardar}
            className="rounded-r6 bg-indigo-700 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
            onClick={handleGuardar}
          >
            Guardar evaluación
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntregableResumenCard({ opcion }: { opcion: EntregableEvaluableOpcion }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-r8 border border-bdr bg-surface2/40 p-3 text-[11px] sm:grid-cols-3">
      <span className="text-t500">Cliente</span>
      <span className="col-span-1 text-t800 sm:col-span-2">{opcion.cliente.nombre}</span>
      <span className="text-t500">Proyecto</span>
      <span className="col-span-1 text-t800 sm:col-span-2">
        {opcion.proyecto.codigo} — {opcion.proyecto.nombre}
      </span>
      <span className="text-t500">Rol</span>
      <span className="text-t800">{opcion.rolLabel}</span>
      <span className="text-t500">Término RevP</span>
      <span className="text-t800">{formatGanttDateCL(opcion.fechaTerminoRevP)}</span>
      <span className="text-t500">Avance</span>
      <span className="text-t800">{opcion.avancePct.toFixed(0)}%</span>
      <span className="text-t500">Horas reales</span>
      <span className="text-t800">{fmtHorasEval(opcion.horasProf)} h</span>
      <span className="text-t500">Colaboración</span>
      <span className="text-t800">{fmtPctColaboracion(opcion.pctColaboracion)}</span>
    </div>
  );
}

function PreguntaRespuestaBlock({
  texto,
  valor,
  onChange,
}: {
  texto: string;
  valor: RespuestaEvaluacionEntregableValor | "";
  onChange: (v: RespuestaEvaluacionEntregableValor) => void;
}) {
  const opts: { id: RespuestaEvaluacionEntregableValor; label: string }[] = [
    { id: "CUMPLE", label: "Cumple" },
    { id: "CUMPLE_PARCIAL", label: "Cumple parcial" },
    { id: "NO_CUMPLE", label: "No cumple" },
  ];
  return (
    <div className="rounded-r8 border border-bdr bg-white px-3 py-2">
      <p className="text-[12px] leading-snug text-t900">{texto}</p>
      <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`rounded-r6 border px-2.5 py-1 text-[11px] font-medium ${
              valor === o.id
                ? "border-indigo-600 bg-indigo-50 text-indigo-800"
                : "border-bdr bg-white text-t600"
            }`}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
