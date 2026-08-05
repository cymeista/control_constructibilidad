/**
 * Cancelación segura de entregables: marca operativa sin alterar horas ni presupuestos.
 */

import type { Entregable } from "@/context/AppDataContext";

export function entregableEstaCancelado(e: Pick<Entregable, "cancelado"> | null | undefined): boolean {
  return e?.cancelado === true;
}

/** Saldo no ejecutable = max(0, presupuesto − gasto). No es gasto real. */
export function calcularSaldoAnuladoHoras(presupuestoVigente: number, gastoReal: number): number {
  const p = Number.isFinite(presupuestoVigente) ? presupuestoVigente : 0;
  const g = Number.isFinite(gastoReal) ? gastoReal : 0;
  return Math.max(0, Math.round((p - g) * 100) / 100);
}

export type PatchCancelarEntregable = {
  cancelado: true;
  fecha_cancelacion: string;
  motivo_cancelacion: string;
};

export type PatchReactivarEntregable = {
  cancelado: false;
  fecha_cancelacion: null;
  motivo_cancelacion: null;
};

export function buildPatchCancelarEntregable(input: {
  fechaCancelacion: string;
  motivo: string;
}): PatchCancelarEntregable | { error: string } {
  const fecha = (input.fechaCancelacion ?? "").trim();
  const motivo = (input.motivo ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { error: "Indique una fecha de cancelación válida." };
  }
  if (motivo.length < 3) {
    return { error: "El motivo de cancelación es obligatorio (mín. 3 caracteres)." };
  }
  return {
    cancelado: true,
    fecha_cancelacion: fecha,
    motivo_cancelacion: motivo,
  };
}

export function buildPatchReactivarEntregable(): PatchReactivarEntregable {
  return {
    cancelado: false,
    fecha_cancelacion: null,
    motivo_cancelacion: null,
  };
}
