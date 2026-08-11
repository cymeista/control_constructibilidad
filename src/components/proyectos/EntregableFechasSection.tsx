import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import type { Entregable } from "@/context/AppDataContext";
import { Button } from "@/components/ui/button";
import { EntregableFechasFormFields } from "@/components/entregables/EntregableFechasFormFields";
import { useEntregableFechasEdit } from "@/hooks/useEntregableFechasEdit";
import { formatDateForDisplay } from "@/lib/localDate";

type Props = {
  entregable: Entregable;
  puedeEditar: boolean;
  /** Layout más ancho para modal de trabajo (solo clases). */
  compactHeader?: boolean;
};

export default function EntregableFechasSection({
  entregable,
  puedeEditar,
  compactHeader = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const { draft, error, conRevisiones, resetDraft, handleDraftChange, guardar } =
    useEntregableFechasEdit(entregable);

  useEffect(() => {
    if (!editing) resetDraft();
  }, [entregable, editing, resetDraft]);

  const handleGuardar = () => {
    if (guardar()) {
      setEditing(false);
      setSavedOk(true);
    }
  };

  const handleCancelar = () => {
    resetDraft();
    setEditing(false);
  };

  return (
    <div className={`rounded-r10 border border-bdr bg-white p-4 ${compactHeader ? "" : "mt-4"}`}>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-t800">
        <Calendar size={15} /> Programación oficial
      </p>
      <p className="mt-1 text-[12px] leading-snug text-t500">
        Estos cambios actualizan el entregable y se reflejan en Formularios, Dashboard y Gantt.
      </p>
      <p className="mt-0.5 text-[11px] text-t400">
        Flujo: {conRevisiones ? "Con revisiones (A / B / P)" : "Sin revisiones (Rev.P = término)"}
      </p>

      {savedOk && !editing ? (
        <p className="mt-2 rounded-r6 border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[12px] text-emerald-900">
          Fechas guardadas correctamente.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-r6 border border-rose-200 bg-rose-50 px-2 py-1.5 text-[12px] text-rose-900">
          {error}
        </p>
      ) : null}

      {editing && puedeEditar ? (
        <div className="mt-3">
          <EntregableFechasFormFields draft={draft} conRevisiones={conRevisiones} onChange={handleDraftChange} />
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
          <dt className="text-[11px] text-t500">Inicio</dt>
          <dd className="text-t800 sm:col-span-2">{formatDateForDisplay(entregable.fecha_inicio)}</dd>
          <dt className="text-[11px] text-t500">Término</dt>
          <dd className="text-t800 sm:col-span-2">{formatDateForDisplay(entregable.fecha_termino)}</dd>
          {conRevisiones ? (
            <>
              <dt className="text-[11px] text-t500">Rev. A</dt>
              <dd className="text-t800 sm:col-span-2">{formatDateForDisplay(entregable.fecha_revA)}</dd>
              <dt className="text-[11px] text-t500">Rev. B</dt>
              <dd className="text-t800 sm:col-span-2">{formatDateForDisplay(entregable.fecha_revB)}</dd>
              <dt className="text-[11px] text-t500">Rev. P</dt>
              <dd className="text-t800 sm:col-span-2">{formatDateForDisplay(entregable.fecha_revP)}</dd>
            </>
          ) : (
            <>
              <dt className="text-[11px] text-t500">Rev. P</dt>
              <dd className="text-t800 sm:col-span-2">
                {formatDateForDisplay(entregable.fecha_revP ?? entregable.fecha_termino)}
              </dd>
            </>
          )}
        </dl>
      )}

      {puedeEditar ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button
                type="button"
                size="sm"
                className="min-h-[36px] bg-[#4F46E5] text-[12px] text-white hover:bg-[#3730A3]"
                onClick={handleGuardar}
              >
                Guardar fechas
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[36px] text-[12px]"
                onClick={handleCancelar}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[36px] text-[12px]"
              onClick={() => {
                resetDraft();
                setSavedOk(false);
                setEditing(true);
              }}
            >
              Editar fechas
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-t500">Solo ADMIN puede editar fechas (mismo permiso que Formularios).</p>
      )}
    </div>
  );
}
