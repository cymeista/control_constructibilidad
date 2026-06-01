import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { GanttProfesionalDetalleModal as DetalleData } from "@/gantt/ganttProfesionalesReadModel";
import { ESTADO_EJECUCION_LABEL, formatGanttDateCL } from "@/gantt/ganttChartUtils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detalle: DetalleData | null;
};

function fmtHoras(n: number): string {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function fmtPct(n: number | null): string {
  if (n == null) return "Sin gasto";
  return `${n.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
}

export default function GanttProfesionalDetalleModal({ open, onOpenChange, detalle }: Props) {
  if (!detalle) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" />
      </Dialog>
    );
  }

  const d = detalle;
  const saldoLabel = d.saldoCategoria >= 0 ? "Saldo categoría" : "Déficit categoría";
  const saldoValor = Math.abs(d.saldoCategoria);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-[12px] p-0">
        <DialogHeader className="border-b border-bdr px-5 py-4 pr-12">
          <DialogTitle className="font-playfair text-[16px] font-semibold text-t900">
            {d.entregable.nombre}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-t500">
            {d.cliente.nombre} · {d.proyecto.codigo} — {d.proyecto.nombre}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4 text-[12px]">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Row label="Profesional" value={d.profesional.nombre_completo} />
            <Row label="Rol" value={d.rolLabel} />
            <Row label="Categoría" value={d.categoria} />
            <Row
              label="Avance real"
              value={`${d.avancePct.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`}
            />
            <Row
              label="Fecha inicio RevP"
              value={d.fechaInicioRevP ? formatGanttDateCL(d.fechaInicioRevP) : "—"}
            />
            <Row
              label="Fecha término RevP"
              value={d.fechaTerminoRevP ? formatGanttDateCL(d.fechaTerminoRevP) : "—"}
            />
          </dl>

          <section className="rounded-r8 border-2 border-indigo-200 bg-indigo-50/60 p-4">
            <p className="text-[11px] font-semibold text-indigo-950">Gasto real (RegistroHora)</p>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Row
                label="Gasto real del profesional"
                value={`${fmtHoras(d.horasProf)} h`}
                valueClassName="text-[14px] font-semibold text-indigo-950"
              />
              <Row
                label="Gasto real total del entregable"
                value={`${fmtHoras(d.gastoTotalEntregable)} h`}
                valueClassName="text-[14px] font-semibold text-indigo-950"
              />
            </dl>
            <div className="mt-3 rounded-r6 border border-indigo-200/80 bg-white px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-t400">
                Colaboración en entregable
              </p>
              <p className="mt-1 font-playfair text-[1.35rem] font-semibold leading-tight text-indigo-900">
                {fmtPct(d.pctColaboracion)}
              </p>
              <p className="mt-1 text-[10px] text-t500">
                Horas del profesional ÷ gasto real total del entregable (solo DIRECTA válida).
              </p>
            </div>
          </section>

          <section className="rounded-r8 border border-bdr bg-surface2/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-t400">
              Categoría {d.categoria}
            </p>
            <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Row label="Presupuesto categoría" value={`${fmtHoras(d.presupuestoCategoria)} h`} />
              <Row label="Gasto real categoría" value={`${fmtHoras(d.gastoCategoria)} h`} />
              <Row
                label={saldoLabel}
                value={`${fmtHoras(saldoValor)} h`}
                className="sm:col-span-2"
                valueClassName={d.saldoCategoria < 0 ? "text-red-700" : "text-emerald-800"}
              />
            </dl>
          </section>

          {d.comparteCategoria.length > 0 ? (
            <section className="rounded-r8 border border-bdr p-3">
              <p className="text-[11px] font-semibold text-t800">Comparte categoría con:</p>
              <ul className="mt-2 space-y-2">
                {d.comparteCategoria.map((c) => (
                  <li
                    key={c.profesional_id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-t border-bdr/60 pt-2 first:border-t-0 first:pt-0"
                  >
                    <span className="font-medium text-t800">{c.nombre}</span>
                    <span className="font-mono text-[11px] text-t600">
                      {fmtHoras(c.horasReales)} h
                      {c.pctPresupCategoria != null
                        ? ` · ${c.pctPresupCategoria.toLocaleString("es-CL", { maximumFractionDigits: 1 })}% del presup.`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="text-[10px] text-t500">
            Estado por avance: {ESTADO_EJECUCION_LABEL[d.estadoEjecucion]}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  className = "",
  valueClassName = "text-t900",
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-t400">{label}</dt>
      <dd className={`mt-0.5 text-[12px] font-medium ${valueClassName}`}>{value}</dd>
    </div>
  );
}
