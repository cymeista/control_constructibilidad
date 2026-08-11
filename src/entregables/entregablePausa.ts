/**
 * Pausa / stand-by operativa de entregables (Etapa A).
 * No altera presupuesto, gasto, avance ni fechas oficiales.
 */

import type { Entregable } from "@/context/AppDataContext";
import { parseLocalDateString } from "@/lib/localDate";

export function entregableEstaPausado(e: Pick<Entregable, "pausado" | "cancelado"> | null | undefined): boolean {
  if (!e || e.cancelado === true) return false;
  return e.pausado === true;
}

function isoFechaValida(value: string): boolean {
  return parseLocalDateString(value) != null;
}

export type VentanaTentativaPausaResult =
  | { ok: true; reinicio: string; termino: string }
  | { ok: false; motivo: "SIN_PROGRAMACION" | "INVALIDAS"; detalle: string };

/**
 * Resuelve la ventana tentativa de un entregable pausado.
 * Ambas vacías → sin programación. Solo una o inconsistentes → inválidas.
 */
export function resolverVentanaTentativaPausa(
  ent: Pick<Entregable, "fecha_reinicio_tentativa" | "fecha_termino_tentativa">,
): VentanaTentativaPausaResult {
  const reinicio = (ent.fecha_reinicio_tentativa ?? "").trim();
  const termino = (ent.fecha_termino_tentativa ?? "").trim();
  if (!reinicio && !termino) {
    return {
      ok: false,
      motivo: "SIN_PROGRAMACION",
      detalle: "Pausado sin fecha_reinicio_tentativa ni fecha_termino_tentativa.",
    };
  }
  if (!reinicio || !termino) {
    return {
      ok: false,
      motivo: "INVALIDAS",
      detalle: "Fechas tentativas incompletas: se requieren reinicio y término, o ambas vacías.",
    };
  }
  if (!isoFechaValida(reinicio) || !isoFechaValida(termino)) {
    return {
      ok: false,
      motivo: "INVALIDAS",
      detalle: "Fechas tentativas no son YYYY-MM-DD válidas.",
    };
  }
  if (reinicio > termino) {
    return {
      ok: false,
      motivo: "INVALIDAS",
      detalle: `Reinicio tentativo (${reinicio}) posterior al término tentativo (${termino}).`,
    };
  }
  return { ok: true, reinicio, termino };
}

export type PatchPausarEntregable = {
  pausado: true;
  fecha_pausa: string;
  motivo_pausa: string;
  fecha_reinicio_tentativa: string | null;
  fecha_termino_tentativa: string | null;
};

export type PatchReactivarPausaEntregable = {
  pausado: false;
};

/** Campos de pausa a limpiar al cancelar (exclusión mutua). */
export type PatchLimpiarPausa = {
  pausado: false;
  fecha_pausa: null;
  motivo_pausa: null;
  fecha_reinicio_tentativa: null;
  fecha_termino_tentativa: null;
};

export function buildPatchLimpiarPausa(): PatchLimpiarPausa {
  return {
    pausado: false,
    fecha_pausa: null,
    motivo_pausa: null,
    fecha_reinicio_tentativa: null,
    fecha_termino_tentativa: null,
  };
}

export function buildPatchPausarEntregable(input: {
  fechaPausa: string;
  motivo: string;
  fechaReinicioTentativa?: string | null;
  fechaTerminoTentativa?: string | null;
}): PatchPausarEntregable | { error: string } {
  const fechaPausa = (input.fechaPausa ?? "").trim();
  const motivo = (input.motivo ?? "").trim();
  const reinicio = (input.fechaReinicioTentativa ?? "").trim();
  const termino = (input.fechaTerminoTentativa ?? "").trim();

  if (!isoFechaValida(fechaPausa)) {
    return { error: "Indique una fecha de pausa válida." };
  }
  if (motivo.length < 3) {
    return { error: "El motivo de pausa es obligatorio (mín. 3 caracteres)." };
  }
  if (termino && !reinicio) {
    return { error: "Si indica término tentativo, debe indicar también el reinicio tentativo." };
  }
  if (reinicio && !isoFechaValida(reinicio)) {
    return { error: "Fecha de reinicio tentativo inválida." };
  }
  if (termino && !isoFechaValida(termino)) {
    return { error: "Fecha de término tentativo inválida." };
  }
  if (reinicio && termino && reinicio > termino) {
    return { error: "El reinicio tentativo no puede ser posterior al término tentativo." };
  }

  return {
    pausado: true,
    fecha_pausa: fechaPausa,
    motivo_pausa: motivo,
    fecha_reinicio_tentativa: reinicio || null,
    fecha_termino_tentativa: termino || null,
  };
}

/** Reactivar: solo quita la condición PAUSADO; conserva metadatos/tentativas como referencia. */
export function buildPatchReactivarPausaEntregable(): PatchReactivarPausaEntregable {
  return { pausado: false };
}
