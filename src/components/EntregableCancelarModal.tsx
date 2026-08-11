/**
 * Modal de cancelación segura de entregable (no altera horas ni presupuesto).
 */

import { useEffect, useState } from "react";
import type { Entregable } from "@/context/AppDataContext";
import { buildPatchCancelarEntregable } from "@/entregables/entregableCancelacion";
import { fechaHoyIsoLocal } from "@/entregables/asignacionHoraConsumo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  entregable: Entregable | null;
  clienteNombre: string;
  proyectoNombre: string;
  saldoPendienteHoras: number;
  onClose: () => void;
  onConfirm: (patch: {
    cancelado: true;
    fecha_cancelacion: string;
    motivo_cancelacion: string;
    pausado: false;
    fecha_pausa: null;
    motivo_pausa: null;
    fecha_reinicio_tentativa: null;
    fecha_termino_tentativa: null;
  }) => void;
};

export default function EntregableCancelarModal({
  open,
  entregable,
  clienteNombre,
  proyectoNombre,
  saldoPendienteHoras,
  onClose,
  onConfirm,
}: Props) {
  const [fecha, setFecha] = useState(fechaHoyIsoLocal());
  const [motivo, setMotivo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFecha(fechaHoyIsoLocal());
      setMotivo("");
      setConfirmado(false);
      setError(null);
    }
  }, [open, entregable?.id]);

  if (!open || !entregable) return null;

  const handleSubmit = () => {
    if (!confirmado) {
      setError("Marque la confirmación explícita para continuar.");
      return;
    }
    const built = buildPatchCancelarEntregable({ fechaCancelacion: fecha, motivo });
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
        aria-labelledby="cancelar-ent-titulo"
        className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-r12 border border-bdr bg-surface shadow-sh3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-bdr px-4 py-3">
          <h2 id="cancelar-ent-titulo" className="text-[15px] font-semibold text-t900">
            Cancelar entregable
          </h2>
          <p className="mt-1 text-[13px] font-medium text-t800">{entregable.nombre}</p>
          <p className="mt-0.5 text-[12px] text-t500">
            {clienteNombre} · {proyectoNombre}
          </p>
        </div>

        <div className="space-y-3 p-4 text-[12px]">
          <p className="rounded-r8 border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] leading-snug text-amber-950">
            Esta acción no eliminará el entregable ni modificará horas reales. El saldo pendiente dejará de
            proyectarse y será tratado como saldo anulado.
          </p>

          <p className="text-t600">
            Saldo pendiente actual:{" "}
            <span className="font-mono font-semibold tabular-nums text-t800">
              {saldoPendienteHoras.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h
            </span>
          </p>

          <div className="flex flex-col gap-1">
            <Label htmlFor="cancelar-ent-fecha" className="text-[10px] font-semibold uppercase text-t400">
              Fecha de cancelación
            </Label>
            <input
              id="cancelar-ent-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-9 rounded-r8 border border-bdr2 bg-white px-3 text-[13px] text-t800 outline-none focus:border-copper"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="cancelar-ent-motivo" className="text-[10px] font-semibold uppercase text-t400">
              Motivo (obligatorio)
            </Label>
            <textarea
              id="cancelar-ent-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-r8 border border-bdr2 bg-white px-3 py-2 text-[13px] text-t800 outline-none focus:border-copper"
              placeholder="Indique por qué se cancela o no se ejecutará…"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-t700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            <span>
              Confirmo cancelar este entregable. Entiendo que el presupuesto y el gasto real se conservan, y que el
              saldo pendiente no se proyectará.
            </span>
          </label>

          {error ? <p className="text-[11px] font-medium text-[#B91C1C]">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-bdr bg-surface2 px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Volver
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={handleSubmit}>
            Confirmar cancelación
          </Button>
        </div>
      </div>
    </div>
  );
}
