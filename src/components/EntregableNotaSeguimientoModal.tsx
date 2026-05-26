import { useEffect, useState } from "react";
import type { Entregable } from "@/context/AppDataContext";
import { useAuth } from "@/security/AuthContext";
import { canEditNotas } from "@/security/permissions";

type Props = {
  open: boolean;
  entregable: Entregable | null;
  clienteNombre: string;
  proyectoNombre: string;
  onClose: () => void;
  onSave: (entregableId: string, texto: string) => void;
};

export default function EntregableNotaSeguimientoModal({
  open,
  entregable,
  clienteNombre,
  proyectoNombre,
  onClose,
  onSave,
}: Props) {
  const { role } = useAuth();
  const puedeEditar = role ? canEditNotas(role) : false;
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (open && entregable) {
      setTexto(entregable.nota_seguimiento ?? "");
    }
  }, [open, entregable]);

  if (!open || !entregable) return null;

  const handleSave = () => {
    if (!puedeEditar) return;
    onSave(entregable.id, texto);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nota-seg-titulo"
        className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-r12 border border-bdr bg-surface shadow-sh3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-bdr px-4 py-3">
          <h2 id="nota-seg-titulo" className="text-[15px] font-semibold text-t900">
            Nota de seguimiento
          </h2>
          <p className="mt-1 text-[13px] font-medium text-t800">{entregable.nombre}</p>
          <p className="mt-0.5 text-[12px] text-t500">
            {clienteNombre} · {proyectoNombre}
          </p>
          {entregable.nota_seguimiento_updated_at ? (
            <p className="mt-1 text-[10px] text-t400">
              Última actualización:{" "}
              {new Date(entregable.nota_seguimiento_updated_at).toLocaleString("es-CL", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          ) : null}
        </div>
        <div className="p-4">
          <label htmlFor="nota-seg-textarea" className="mb-1 block text-[10px] font-semibold uppercase text-t400">
            Observaciones, acuerdos o contexto
          </label>
          <textarea
            id="nota-seg-textarea"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={10}
            disabled={!puedeEditar}
            className="w-full resize-y rounded-r8 border border-bdr2 bg-surface px-3 py-2 text-[13px] text-t800 outline-none focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.12)]"
            placeholder="Escribe la nota para este entregable…"
          />
          {!puedeEditar ? (
            <p className="mt-2 text-[11px] text-t400">Solo lectura: no tienes permisos para editar notas.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-bdr bg-surface2 px-4 py-3">
          <button
            type="button"
            className="rounded-r8 border border-bdr px-4 py-2 text-[12px] font-semibold text-t600 hover:bg-surface"
            onClick={onClose}
          >
            Cancelar
          </button>
          {puedeEditar ? (
            <button
              type="button"
              className="rounded-r8 bg-copper px-4 py-2 text-[12px] font-semibold text-white hover:opacity-95"
              onClick={handleSave}
            >
              Guardar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
