import { useCallback, useState } from "react";
import type { Entregable } from "@/context/AppDataContext";
import { useAppData } from "@/context/AppDataContext";
import {
  buildEntregablePatchFromFechasDraft,
  entregableToFechasInput,
  validateEntregableFechas,
  type EntregableFechasInput,
} from "@/entregables/entregableFechasValidation";

export function useEntregableFechasEdit(entregable: Entregable) {
  const { updateEntregable } = useAppData();
  const tipoFlujo = entregable.tipo_flujo || "CON_REVISIONES";
  const conRevisiones = tipoFlujo === "CON_REVISIONES";

  const [draft, setDraft] = useState<EntregableFechasInput>(() => entregableToFechasInput(entregable));
  const [error, setError] = useState<string | null>(null);

  const resetDraft = useCallback(() => {
    setDraft(entregableToFechasInput(entregable));
    setError(null);
  }, [entregable]);

  const handleDraftChange = useCallback(
    (patch: Partial<EntregableFechasInput>) => {
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
    },
    [tipoFlujo],
  );

  const guardar = useCallback((): boolean => {
    setError(null);
    const input: EntregableFechasInput = { ...draft, tipo_flujo: tipoFlujo };
    const v = validateEntregableFechas(input);
    if (!v.ok) {
      setError(v.message);
      return false;
    }
    const patch = buildEntregablePatchFromFechasDraft(entregable, input);
    updateEntregable(entregable.id, patch);
    return true;
  }, [draft, entregable, tipoFlujo, updateEntregable]);

  return {
    draft,
    error,
    tipoFlujo,
    conRevisiones,
    resetDraft,
    handleDraftChange,
    guardar,
    setError,
  };
}
