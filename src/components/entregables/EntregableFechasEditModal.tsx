import { useEffect } from "react";
import type { Entregable } from "@/context/AppDataContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EntregableFechasFormFields } from "@/components/entregables/EntregableFechasFormFields";
import { useEntregableFechasEdit } from "@/hooks/useEntregableFechasEdit";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entregable: Entregable;
  proyectoNombre?: string;
  proyectoCodigo?: string;
};

export function EntregableFechasEditModal({
  open,
  onOpenChange,
  entregable,
  proyectoNombre,
  proyectoCodigo,
}: Props) {
  const { draft, error, conRevisiones, resetDraft, handleDraftChange, guardar } =
    useEntregableFechasEdit(entregable);

  useEffect(() => {
    if (open) resetDraft();
  }, [open, entregable, resetDraft]);

  const handleGuardar = () => {
    if (guardar()) onOpenChange(false);
  };

  const handleCancelar = () => {
    resetDraft();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-r10">
        <DialogHeader>
          <DialogTitle>Editar fechas del entregable</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-left text-[12px] text-t600">
              {proyectoCodigo || proyectoNombre ? (
                <p>
                  <span className="font-mono font-semibold text-copper">{proyectoCodigo}</span>
                  {proyectoNombre ? ` · ${proyectoNombre}` : null}
                </p>
              ) : null}
              <p className="font-semibold text-t800">{entregable.nombre}</p>
              <p className="pt-1 leading-snug">
                Estos cambios actualizan el entregable y se reflejan en Proyectos, Formularios y Gantt.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <EntregableFechasFormFields draft={draft} conRevisiones={conRevisiones} onChange={handleDraftChange} />

        {error ? (
          <p className="rounded-r6 border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-900">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="rounded-r8" onClick={handleCancelar}>
            Cancelar
          </Button>
          <Button type="button" className="rounded-r8 bg-[#4F46E5] hover:bg-[#3730A3]" onClick={handleGuardar}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
