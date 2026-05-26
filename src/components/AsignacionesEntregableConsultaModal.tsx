import { useMemo } from "react";
import { X } from "lucide-react";
import type { Entregable, Proyecto, Profesional, AsignacionHora } from "@/context/AppDataContext";
import { useAppData } from "@/context/AppDataContext";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/security/AuthContext";
import { canViewRouteForSession } from "@/security/permissions";
import { semaforoVsCompromiso, type SemaforoAsignacionConsumo } from "@/entregables/asignacionHoraBloque4";
import {
  fechaHoyIsoLocal,
  horasPendientesAsignacionBloque2,
  sumaHorasGastadasRealesAsignacionBloque2,
} from "@/entregables/asignacionHoraConsumo";

type Props = {
  open: boolean;
  entregable: Entregable | null;
  proyecto: Proyecto | null;
  onClose: () => void;
  onGoAsignaciones: (ctx: { clienteId: string; proyectoId: string; entregableId: string }) => void;
};

function fmtDate(d: string | null | undefined) {
  if (!d || !String(d).trim()) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtH(n: number) {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function AsignacionesEntregableConsultaModal({ open, entregable, proyecto, onClose, onGoAsignaciones }: Props) {
  const { role } = useAuth();
  const puedeIrFormularios = canViewRouteForSession(role, "/formularios");
  const { profesionales, clientes, asignaciones_horas, registro_horas, entregables, proyectos } = useAppData();
  const hoy = fechaHoyIsoLocal();

  const ctx = useMemo(() => {
    if (!entregable || !proyecto) return null;
    const cliente = clientes.find((c) => c.id === proyecto.cliente_id);
    if (!cliente) return null;
    return { clienteId: cliente.id, proyectoId: proyecto.id, entregableId: entregable.id };
  }, [entregable, proyecto, clientes]);

  const rows = useMemo(() => {
    if (!entregable) return [];

    const profMap = new Map<string, Profesional>(profesionales.map((p) => [p.id, p]));
    const base = asignaciones_horas.filter((a) => a.entregable_id === entregable.id);

    const out = base.map((a: AsignacionHora) => {
      const profesional = profMap.get(String(a.profesional_id ?? "").trim()) ?? null;

      // ACTIVA: gasto real en ventana vigente (Bloque 2). CERRADA: uso imputación al cierre (dato ya persistido).
      const gastadas =
        a.estado === "ACTIVA"
          ? sumaHorasGastadasRealesAsignacionBloque2(a, asignaciones_horas, registro_horas, entregables, proyectos, profesionales, hoy)
          : Number(a.horas_gastadas_imputadas_al_cierre ?? 0);

      const saldo = horasPendientesAsignacionBloque2(a.horas_comprometidas, gastadas);
      const exceso = saldo < 0;

      const semaforo: SemaforoAsignacionConsumo | "neutral" = a.estado === "ACTIVA" ? semaforoVsCompromiso(gastadas, a.horas_comprometidas) : "neutral";

      return { a, profesional, gastadas, saldo, exceso, semaforo };
    });

    const orderCat = ["L2", "P4", "P3", "P2"] as const;
    const rolOrder = { LIDER: 0, APOYO: 1 } as const;
    out.sort((x, y) => {
      const stOrder = x.a.estado === "ACTIVA" ? 0 : 1;
      const stOrderY = y.a.estado === "ACTIVA" ? 0 : 1;
      if (stOrder !== stOrderY) return stOrder - stOrderY;

      const catIx = orderCat.indexOf(x.a.categoria as any);
      const catIy = orderCat.indexOf(y.a.categoria as any);
      if (catIx !== catIy) return catIx - catIy;

      const rlIx = rolOrder[x.a.rol_en_entregable];
      const rlIy = rolOrder[y.a.rol_en_entregable];
      if (rlIx !== rlIy) return rlIx - rlIy;

      const n1 = x.profesional?.nombre_completo ?? "";
      const n2 = y.profesional?.nombre_completo ?? "";
      return n1.localeCompare(n2, "es");
    });

    return out;
  }, [entregable, asignaciones_horas, profesionales, registro_horas, entregables, proyectos, hoy]);

  if (!open || !entregable) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/35 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-5xl overflow-hidden rounded-r12 border border-bdr bg-surface shadow-sh3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-bdr px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-t900">Asignaciones del entregable</h2>
              <p className="mt-1 text-[12px] text-t500">
                {entregable.nombre} {entregable.fase_codigo ? `(${entregable.fase_codigo})` : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-t400">Activas + cerradas · Todas las categorías · Líder / Apoyo</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </Button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
          <div className="overflow-x-auto rounded-r10 border border-bdr bg-white/70">
            <table className="min-w-[1100px] w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-bdr bg-slate-50/90 text-[9px] font-semibold uppercase tracking-wide text-t500">
                  <th className="px-2 py-2">Profesional</th>
                  <th className="px-2 py-2">Rol</th>
                  <th className="px-2 py-2">Categoría</th>
                  <th className="px-2 py-2">Estado</th>
                  <th className="px-2 py-2 text-right">Hrs comprometidas</th>
                  <th className="px-2 py-2 text-right">Hrs gastadas</th>
                  <th className="px-2 py-2 text-right">Saldo / exceso</th>
                  <th className="px-2 py-2">Inicio vigencia</th>
                  <th className="px-2 py-2">Cierre</th>
                  <th className="px-2 py-2">Observación o semáforo</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-4 text-center text-t500">
                      Sin asignaciones para este entregable.
                    </td>
                  </tr>
                ) : (
                  rows.map(({ a, profesional, gastadas, saldo, exceso, semaforo }) => {
                    const rolLabel = a.rol_en_entregable === "LIDER" ? "Líder" : "Apoyo";
                    const estadoChip =
                      a.estado === "ACTIVA"
                        ? "rounded-r4 bg-emerald-500/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-800"
                        : "rounded-r4 bg-slate-500/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-800";

                    const saldoCls = exceso ? "text-rose-700 font-semibold" : "text-t700";

                    const obs =
                      a.estado === "CERRADA" ? (a.motivo_cierre ? a.motivo_cierre : "—") : semaforo !== "neutral" ? semaforo.toUpperCase() : "—";

                    return (
                      <tr key={a.id} className="border-b border-bdr/50 hover:bg-copper/[0.04]">
                        <td className="px-2 py-2 font-medium text-t800">{profesional?.nombre_completo ?? "—"}</td>
                        <td className="px-2 py-2 text-t600">{rolLabel}</td>
                        <td className="px-2 py-2 text-t600">{a.categoria}</td>
                        <td className="px-2 py-2">
                          <span className={estadoChip}>{a.estado}</span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-t600">{fmtH(a.horas_comprometidas)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-t700">{fmtH(gastadas)}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${saldoCls}`}>{fmtH(saldo)}</td>
                        <td className="px-2 py-2 text-t600">{fmtDate(a.fecha_inicio_vigencia)}</td>
                        <td className="px-2 py-2 text-t600">{fmtDate(a.fecha_cierre)}</td>
                        <td className="px-2 py-2 text-t600">{obs}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-bdr bg-surface2 px-4 py-3">
          <Button type="button" variant="outline" size="sm" className="rounded-r8" onClick={onClose}>
            Cerrar
          </Button>
          {puedeIrFormularios ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-r8 gap-2 border-bdr"
              disabled={!ctx}
              onClick={() => {
                if (!ctx) return;
                onGoAsignaciones(ctx);
              }}
            >
              Ir a Asignaciones
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

