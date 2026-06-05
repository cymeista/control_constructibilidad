import { useCallback, useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import type { Entregable } from "@/context/AppDataContext";
import { useAppData } from "@/context/AppDataContext";
import { Button } from "@/components/ui/button";
import {
  buildEntregablePatchFromFechasDraft,
  entregableToFechasInput,
  validateEntregableFechas,
  type EntregableFechasInput,
} from "@/entregables/entregableFechasValidation";

function fmtDate(iso: string | null | undefined): string {
  const s = (iso ?? "").trim();
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-t500">
      {label}
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-r6 border border-bdr bg-white px-2 text-[12px] text-t800 disabled:opacity-60"
      />
    </label>
  );
}

type Props = {
  entregable: Entregable;
  puedeEditar: boolean;
};

export default function EntregableFechasSection({ entregable, puedeEditar }: Props) {
  const { updateEntregable } = useAppData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EntregableFechasInput>(() => entregableToFechasInput(entregable));
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const tipoFlujo = entregable.tipo_flujo || "CON_REVISIONES";
  const conRevisiones = tipoFlujo === "CON_REVISIONES";

  const resetDraft = useCallback(() => {
    setDraft(entregableToFechasInput(entregable));
    setError(null);
    setSavedOk(false);
  }, [entregable]);

  useEffect(() => {
    if (!editing) resetDraft();
  }, [entregable, editing, resetDraft]);

  const handleDraftChange = (patch: Partial<EntregableFechasInput>) => {
    setSavedOk(false);
    setError(null);
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (tipoFlujo === "SIN_REVISIONES" && patch.fecha_termino != null) {
        next.fecha_revP = patch.fecha_termino;
        next.fecha_revA = null;
        next.fecha_revB = null;
      }
      return next;
    });
  };

  const handleGuardar = () => {
    setError(null);
    setSavedOk(false);
    const input: EntregableFechasInput = {
      ...draft,
      tipo_flujo: tipoFlujo,
    };
    const v = validateEntregableFechas(input);
    if (!v.ok) {
      setError(v.message);
      return;
    }
    const patch = buildEntregablePatchFromFechasDraft(entregable, input);
    updateEntregable(entregable.id, patch);
    setEditing(false);
    setSavedOk(true);
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
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DateField
            label="Fecha inicio"
            value={draft.fecha_inicio}
            onChange={(v) => handleDraftChange({ fecha_inicio: v })}
          />
          <DateField
            label="Fecha término"
            value={draft.fecha_termino}
            onChange={(v) => handleDraftChange({ fecha_termino: v })}
          />
          {conRevisiones ? (
            <>
              <DateField
                label="Revisión A"
                value={draft.fecha_revA ?? ""}
                onChange={(v) => handleDraftChange({ fecha_revA: v })}
              />
              <DateField
                label="Revisión B"
                value={draft.fecha_revB ?? ""}
                onChange={(v) => handleDraftChange({ fecha_revB: v })}
              />
              <DateField
                label="Revisión P"
                value={draft.fecha_revP ?? ""}
                onChange={(v) => handleDraftChange({ fecha_revP: v })}
              />
            </>
          ) : (
            <div className="sm:col-span-2 text-[11px] text-t600">
              Rev.P se iguala automáticamente a la fecha de término.
            </div>
          )}
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
