import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import type { Entregable } from "@/context/AppDataContext";
import { Button } from "@/components/ui/button";
import { EntregableFechasFormFields } from "@/components/entregables/EntregableFechasFormFields";
import { useEntregableFechasEdit } from "@/hooks/useEntregableFechasEdit";

function fmtDate(iso: string | null | undefined): string {
  const s = (iso ?? "").trim();
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

type Props = {
  entregable: Entregable;
  puedeEditar: boolean;
};

export default function EntregableFechasSection({ entregable, puedeEditar }: Props) {
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
    <div className="mt-4 rounded-r10 border border-bdr bg-white/80 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-t400">
        <Calendar size={14} /> Fechas del entregable
      </p>
      <p className="mt-1 text-[10px] leading-snug text-t500">
        Estos cambios actualizan el entregable y se reflejan en Formularios, Dashboard y Gantt.
      </p>
      <p className="mt-0.5 text-[10px] text-t400">
        Flujo: {conRevisiones ? "Con revisiones (A / B / P)" : "Sin revisiones (Rev.P = término)"}
      </p>

      {savedOk && !editing ? (
        <p className="mt-2 rounded-r6 border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-900">
          Fechas guardadas correctamente.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-r6 border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900">
          {error}
        </p>
      ) : null}

      {editing && puedeEditar ? (
        <div className="mt-3">
          <EntregableFechasFormFields draft={draft} conRevisiones={conRevisiones} onChange={handleDraftChange} />
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
          <dt className="text-t500">Inicio</dt>
          <dd className="text-t800">{fmtDate(entregable.fecha_inicio)}</dd>
          <dt className="text-t500">Término</dt>
          <dd className="text-t800">{fmtDate(entregable.fecha_termino)}</dd>
          {conRevisiones ? (
            <>
              <dt className="text-t500">Rev. A</dt>
              <dd className="text-t800">{fmtDate(entregable.fecha_revA)}</dd>
              <dt className="text-t500">Rev. B</dt>
              <dd className="text-t800">{fmtDate(entregable.fecha_revB)}</dd>
              <dt className="text-t500">Rev. P</dt>
              <dd className="text-t800">{fmtDate(entregable.fecha_revP)}</dd>
            </>
          ) : (
            <>
              <dt className="text-t500">Rev. P</dt>
              <dd className="text-t800">{fmtDate(entregable.fecha_revP ?? entregable.fecha_termino)}</dd>
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
                className="min-h-[36px] bg-[#4F46E5] text-[11px] text-white hover:bg-[#3730A3]"
                onClick={handleGuardar}
              >
                Guardar fechas
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[36px] text-[11px]"
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
              className="min-h-[36px] text-[11px]"
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
        <p className="mt-2 text-[10px] text-t500">Solo ADMIN puede editar fechas (mismo permiso que Formularios).</p>
      )}
    </div>
  );
}
