import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EntregableFormPanel,
  type EntregableProyectoBloqueado,
} from "@/components/formularios/forms";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proyecto: EntregableProyectoBloqueado;
  onCreated: (nombre: string) => void;
};

export function CrearEntregableModal({ open, onOpenChange, proyecto, onCreated }: Props) {
  const handleSaved = (nombre?: string) => {
    onOpenChange(false);
    if (nombre?.trim()) onCreated(nombre.trim());
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,880px)] max-w-2xl flex-col overflow-hidden rounded-r10 p-0">
        <DialogHeader className="shrink-0 border-b border-bdr px-5 py-4 text-left">
          <DialogTitle className="text-[16px] font-semibold text-t900">Crear entregable</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-left text-[12px] text-t600">
              <p>
                <span className="font-mono font-semibold text-copper">{proyecto.codigo}</span>
                <span className="text-t500"> · </span>
                <span className="font-medium text-t800">{proyecto.nombre}</span>
              </p>
              <p className="leading-snug">
                El proyecto queda fijo. Complete los mismos campos que en Formularios; el guardado usa el flujo
                estándar de entregables.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {open ? (
            <EntregableFormPanel
              key={proyecto.id}
              proyectoBloqueado={proyecto}
              embedMode
              onSaved={handleSaved}
              onCancel={handleCancel}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
