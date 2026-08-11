/**
 * Modal para poner / editar pausa de un entregable (no altera horas, presupuesto ni fechas oficiales).
 */

import { useEffect, useState } from "react";
import type { Entregable } from "@/context/AppDataContext";
import { buildPatchPausarEntregable, entregableEstaPausado } from "@/entregables/entregablePausa";
import { fechaHoyIsoLocal } from "@/entregables/asignacionHoraConsumo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  entregable: Entregable | null;
  clienteNombre: string;
  proyectoNombre: string;
  /** Si true (o el entregable ya está pausado), precarga metadata y mantiene pausado=true. */
  modoEdicion?: boolean;
  onClose: () => void;
  onConfirm: (patch: {
    pausado: true;
    fecha_pausa: string;
    motivo_pausa: string;
    fecha_reinicio_tentativa: string | null;
    fecha_termino_tentativa: string | null;
  }) => void;
};

export default function EntregablePausarModal({
  open,
  entregable,
  clienteNombre,
  proyectoNombre,
  modoEdicion,
  onClose,
  onConfirm,
}: Props) {
  const editando =
    modoEdicion === true || (entregable != null && entregableEstaPausado(entregable));

  const [fechaPausa, setFechaPausa] = useState(fechaHoyIsoLocal());
  const [motivo, setMotivo] = useState("");
  const [reinicio, setReinicio] = useState("");
  const [termino, setTermino] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entregable) return;
    if (editando) {
      setFechaPausa((entregable.fecha_pausa ?? "").trim() || fechaHoyIsoLocal());
      setMotivo((entregable.motivo_pausa ?? "").trim());
      setReinicio((entregable.fecha_reinicio_tentativa ?? "").trim());
      setTermino((entregable.fecha_termino_tentativa ?? "").trim());
    } else {
      setFechaPausa(fechaHoyIsoLocal());
      setMotivo("");
      setReinicio("");
      setTermino("");
    }
    setConfirmado(false);
    setError(null);
  }, [open, entregable?.id, editando, entregable]);

  if (!open || !entregable) return null;

  const handleSubmit = () => {
    if (!confirmado) {
      setError("Marque la confirmación explícita para continuar.");
      return;
    }
    const built = buildPatchPausarEntregable({
      fechaPausa,
      motivo,
      fechaReinicioTentativa: reinicio,
      fechaTerminoTentativa: termino,
    });
    if ("error" in built) {
      setError(built.error);
      return;
    }
    onConfirm(built);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pausar-ent-titulo"
        className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-r12 border border-bdr bg-surface shadow-sh3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-bdr px-4 py-3">
          <h2 id="pausar-ent-titulo" className="text-[15px] font-semibold text-t900">
            {editando ? "Editar pausa" : "Poner en pausa"}
          </h2>
          <p className="mt-1 text-[13px] font-medium text-t800">{entregable.nombre}</p>
          <p className="mt-0.5 text-[12px] text-t500">
            {clienteNombre} · {proyectoNombre}
          </p>
        </div>

        <div className="space-y-3 p-4 text-[12px]">
          <p className="rounded-r8 border border-sky-200 bg-sky-50/80 px-3 py-2 text-[11px] leading-snug text-sky-950">
            Esta acción no modifica horas reales, presupuesto, avance ni las fechas oficiales del entregable. El saldo
            pendiente se conserva (no se anula).
            {editando
              ? " Solo se actualiza la metadata de pausa; el entregable permanece pausado."
              : null}
          </p>

          <div className="flex flex-col gap-1">
            <Label htmlFor="pausar-ent-fecha" className="text-[10px] font-semibold uppercase text-t400">
              Fecha de pausa
            </Label>
            <input
              id="pausar-ent-fecha"
              type="date"
              value={fechaPausa}
              onChange={(e) => setFechaPausa(e.target.value)}
              className="h-9 rounded-r8 border border-bdr2 bg-white px-3 text-[13px] text-t800 outline-none focus:border-copper"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="pausar-ent-motivo" className="text-[10px] font-semibold uppercase text-t400">
              Motivo (obligatorio)
            </Label>
            <textarea
              id="pausar-ent-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-r8 border border-bdr2 bg-white px-3 py-2 text-[13px] text-t800 outline-none focus:border-copper"
              placeholder="Indique por qué se detiene temporalmente…"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pausar-ent-reinicio" className="text-[10px] font-semibold uppercase text-t400">
                Reinicio tentativo (opcional)
              </Label>
              <input
                id="pausar-ent-reinicio"
                type="date"
                value={reinicio}
                onChange={(e) => setReinicio(e.target.value)}
                className="h-9 rounded-r8 border border-bdr2 bg-white px-3 text-[13px] text-t800 outline-none focus:border-copper"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pausar-ent-termino" className="text-[10px] font-semibold uppercase text-t400">
                Término tentativo (opcional)
              </Label>
              <input
                id="pausar-ent-termino"
                type="date"
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                className="h-9 rounded-r8 border border-bdr2 bg-white px-3 text-[13px] text-t800 outline-none focus:border-copper"
              />
            </div>
          </div>
          <p className="text-[10px] text-t500">
            Las fechas tentativas son planificación futura; no reemplazan inicio/término oficiales. Si indica término,
            debe indicar también reinicio.
          </p>

          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-t700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            <span>
              {editando
                ? "Confirmo actualizar la metadata de pausa. Presupuesto, gasto y fechas oficiales se conservan; el entregable sigue pausado."
                : "Confirmo poner este entregable en pausa. Entiendo que presupuesto, gasto y fechas oficiales se conservan."}
            </span>
          </label>

          {error ? <p className="text-[11px] font-medium text-[#B91C1C]">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-bdr bg-surface2 px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Volver
          </Button>
          <Button type="button" size="sm" className="bg-sky-800 text-white hover:bg-sky-900" onClick={handleSubmit}>
            {editando ? "Guardar pausa" : "Confirmar pausa"}
          </Button>
        </div>
      </div>
    </div>
  );
}
