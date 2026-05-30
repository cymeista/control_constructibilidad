import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RedistribuirHorasEntregableModal } from "@/components/RedistribuirHorasEntregableModal";
import { useAppData, type Entregable } from "@/context/AppDataContext";
import { fechaHoyIsoLocal } from "@/entregables/asignacionHoraConsumo";
import { listarCategoriasSobreconsumidasVsPresupuestoEntregable } from "@/entregables/asignacionHoraRules";
import { historialRedistribucionPorEntregable } from "@/entregables/redistribucionHorasEntregable";
import { useAuth } from "@/security/AuthContext";
import { canRedistribuir } from "@/security/permissions";

type Props = {
  ent: Entregable;
  /** Fila de tabla: botón y badges más compactos. */
  dense?: boolean;
  /** Control UI: oculta chips de estado (ej. Dashboard). */
  showBadges?: boolean;
  /** Texto del botón principal (por defecto: Redistribuir horas). */
  buttonLabel?: string;
  className?: string;
};

/**
 * Acceso único a `RedistribuirHorasEntregableModal` por entregable: siempre visible (no condicionado a alertas).
 * Badges opcionales: sobreconsumo vs presupuesto, historial de redistribución.
 */
export function EntregableRedistribuirHorasTrigger({
  ent,
  dense,
  showBadges = true,
  buttonLabel = "Redistribuir horas",
  className,
}: Props) {
  const { role } = useAuth();
  const permitido = role ? canRedistribuir(role) : false;
  const {
    clientes,
    proyectos,
    historial_redistribuciones_horas,
    asignaciones_horas,
    registro_horas,
    entregables,
    profesionales,
  } = useAppData();
  const [open, setOpen] = useState(false);
  const hoy = fechaHoyIsoLocal();
  const nRedist = useMemo(
    () => historialRedistribucionPorEntregable(historial_redistribuciones_horas ?? [], ent.id).length,
    [historial_redistribuciones_horas, ent.id],
  );
  const sobre = useMemo(
    () =>
      listarCategoriasSobreconsumidasVsPresupuestoEntregable(
        ent,
        asignaciones_horas,
        registro_horas,
        entregables,
        proyectos,
        profesionales,
        hoy,
      ),
    [ent, asignaciones_horas, registro_horas, entregables, proyectos, profesionales, hoy],
  );

  return (
    <>
      <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
        {showBadges && sobre.length > 0 ? (
          <span
            className="rounded-r6 border border-rose-500/35 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-900"
            title={`Sobreconsumo vs presupuesto: ${sobre.map((s) => s.categoria).join(", ")}`}
          >
            Sobreconsumo
          </span>
        ) : null}
        {showBadges && nRedist > 0 ? (
          <span
            className="rounded-r6 border border-teal-600/35 bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-teal-900"
            title={`${nRedist} redistribución(es); historial reciente en el modal`}
          >
            Redistribuido
          </span>
        ) : null}
        {permitido ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={
              dense
                ? "h-7 shrink-0 rounded-r8 px-2 text-[10px] font-semibold"
                : "h-8 shrink-0 rounded-r8 text-[11px] font-semibold"
            }
            onClick={() => setOpen(true)}
          >
            {buttonLabel}
          </Button>
        ) : null}
      </div>
      <RedistribuirHorasEntregableModal
        open={open}
        onOpenChange={setOpen}
        ent={ent}
        clientes={clientes}
        proyectos={proyectos}
      />
    </>
  );
}
