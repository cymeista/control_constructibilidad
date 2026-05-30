import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Button } from "@/components/ui/button";
import { EntregableRedistribuirHorasTrigger } from "@/components/EntregableRedistribuirHorasTrigger";
import type { AsignacionHoraCategoria } from "@/context/AppDataContext";
import type { CategoriaControlRow } from "@/horas/entregableControlCategoria";
import {
  listarProfesionalesGastoPorCategoria,
  pctConsumoPresupuestoCategoria,
  type ProfesionalGastoEnCategoria,
} from "@/horas/entregableControlCategoria";
import type { Entregable, Profesional } from "@/context/AppDataContext";

const fmtH = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtP = (n: number) => `${n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function etiquetaEstadoCategoria(row: CategoriaControlRow): string {
  if (row.estado === "OK") return "OK";
  if (row.estado === "SIN_PRESUPUESTO_CON_GASTO") return "Sin presupuesto con gasto";
  return `Déficit ${fmtH(row.deficitHoras)} h`;
}

function claseEstadoCategoria(estado: CategoriaControlRow["estado"]): string {
  if (estado === "OK") return "bg-emerald-100 text-emerald-800";
  if (estado === "DEFICIT") return "bg-rose-100 text-rose-800";
  return "bg-orange-100 text-orange-800";
}

type Props = {
  entregable: Entregable;
  controlCategorias: CategoriaControlRow[];
  gastoPorProfesional: Map<string, number>;
  profMap: Map<string, Profesional>;
  tieneDeficitCategoria: boolean;
  puedeGestionarEquipo: boolean;
  puedeRedistribuir: boolean;
  accionesSecundarias?: ReactNode;
  mobile?: boolean;
};

function etiquetaPctPresupCategoria(pct: number | null): string {
  if (pct === null) return "Sin presupuesto";
  return fmtP(pct);
}

function TablaDetalleCategoria({
  categoria,
  filas,
  totalGastoCategoria,
  presupuestoCategoria,
  puedeGestionarEquipo,
  onAgregarApoyo,
  compact,
}: {
  categoria: AsignacionHoraCategoria;
  filas: ProfesionalGastoEnCategoria[];
  totalGastoCategoria: number;
  presupuestoCategoria: number;
  puedeGestionarEquipo: boolean;
  onAgregarApoyo: (profesionalId: string) => void;
  compact?: boolean;
}) {
  const pctTotalCategoria = pctConsumoPresupuestoCategoria(totalGastoCategoria, presupuestoCategoria);
  if (filas.length === 0) {
    return (
      <p className={`text-t500 ${compact ? "px-3 py-2 text-[11px]" : "px-4 py-3 text-[11px]"}`}>
        Sin gasto real en categoría {categoria}.
      </p>
    );
  }

  const table = (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="border-b border-bdr bg-surface2/80 text-[9px] font-semibold uppercase text-t500">
          <th className="px-3 py-1.5 text-left">Profesional</th>
          <th className="px-3 py-1.5 text-right">Horas reales</th>
          <th className="px-3 py-1.5 text-right">% Presup. categoría</th>
          <th className="px-3 py-1.5 text-left">Equipo</th>
          {puedeGestionarEquipo ? <th className="px-3 py-1.5 text-right">Acción</th> : null}
        </tr>
      </thead>
      <tbody>
        {filas.map((p) => (
          <tr key={p.profesional_id} className="border-b border-bdr/50 last:border-b-0">
            <td className="px-3 py-1.5 font-medium text-t800">{p.nombre}</td>
            <td className="px-3 py-1.5 text-right font-mono text-t700">{fmtH(p.horasReales)} h</td>
            <td className="px-3 py-1.5 text-right font-mono text-t700">{etiquetaPctPresupCategoria(p.pctPresupCategoria)}</td>
            <td className="px-3 py-1.5">
              <span
                className={`rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold ${
                  p.enEquipo ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"
                }`}
              >
                {p.enEquipo ? "En equipo" : "No declarado"}
              </span>
            </td>
            {puedeGestionarEquipo ? (
              <td className="px-3 py-1.5 text-right">
                {!p.enEquipo ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => onAgregarApoyo(p.profesional_id)}
                  >
                    Agregar como apoyo
                  </Button>
                ) : (
                  <span className="text-[10px] text-t400">—</span>
                )}
              </td>
            ) : null}
          </tr>
        ))}
        <tr className="bg-surface2/50 font-semibold text-t800">
          <td className="px-3 py-1.5">Total categoría {categoria}</td>
          <td className="px-3 py-1.5 text-right font-mono">{fmtH(totalGastoCategoria)} h</td>
          <td className="px-3 py-1.5 text-right font-mono">{etiquetaPctPresupCategoria(pctTotalCategoria)}</td>
          <td colSpan={puedeGestionarEquipo ? 2 : 1} />
        </tr>
      </tbody>
    </table>
  );

  return compact ? <div className="overflow-x-auto">{table}</div> : table;
}

export default function HorasEntregableDetalleOperativo({
  entregable,
  controlCategorias,
  gastoPorProfesional,
  profMap,
  tieneDeficitCategoria,
  puedeGestionarEquipo,
  puedeRedistribuir,
  accionesSecundarias,
  mobile,
}: Props) {
  const { equipo_entregable, agregarIntegranteEquipoEntregable } = useAppData();
  const [categoriaExpandida, setCategoriaExpandida] = useState<AsignacionHoraCategoria | null>(null);
  const [mensajeEquipo, setMensajeEquipo] = useState<string | null>(null);
  const [errorEquipo, setErrorEquipo] = useState<string | null>(null);

  const detallePorCategoria = useMemo(() => {
    const out = new Map<AsignacionHoraCategoria, ProfesionalGastoEnCategoria[]>();
    for (const c of controlCategorias) {
      out.set(
        c.categoria,
        listarProfesionalesGastoPorCategoria(
          entregable.id,
          c.categoria,
          c.presupuesto,
          gastoPorProfesional,
          profMap,
          equipo_entregable ?? [],
        ),
      );
    }
    return out;
  }, [controlCategorias, entregable.id, gastoPorProfesional, profMap, equipo_entregable]);

  const toggleCategoria = (cat: AsignacionHoraCategoria) => {
    setCategoriaExpandida((prev) => (prev === cat ? null : cat));
  };

  const handleAgregarApoyo = (profesionalId: string) => {
    setErrorEquipo(null);
    setMensajeEquipo(null);
    const res = agregarIntegranteEquipoEntregable({
      entregable_id: entregable.id,
      profesional_id: profesionalId,
      rol_en_entregable: "APOYO",
    });
    if (!res.ok) {
      setErrorEquipo(res.error);
      return;
    }
    setMensajeEquipo("Profesional agregado como apoyo.");
  };

  const renderDetalleExpandido = (c: CategoriaControlRow) => {
    const filas = detallePorCategoria.get(c.categoria) ?? [];
    const totalGastoCategoria = filas.reduce((s, p) => s + p.horasReales, 0);
    return (
      <TablaDetalleCategoria
        categoria={c.categoria}
        filas={filas}
        totalGastoCategoria={totalGastoCategoria}
        presupuestoCategoria={c.presupuesto}
        puedeGestionarEquipo={puedeGestionarEquipo}
        onAgregarApoyo={handleAgregarApoyo}
        compact={mobile}
      />
    );
  };

  const tablaControl = mobile ? (
    <div className="divide-y divide-bdr/70 rounded-r8 border border-bdr bg-white">
      {controlCategorias.map((c) => {
        const abierta = categoriaExpandida === c.categoria;
        return (
          <div key={c.categoria} className="text-[11px]">
            <div className="space-y-1 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-t800">{c.categoria}</span>
                <span className={`rounded-r4 px-1.5 py-0.5 text-[9px] font-semibold ${claseEstadoCategoria(c.estado)}`}>
                  {etiquetaEstadoCategoria(c)}
                </span>
              </div>
              <p className="text-t600">
                Presupuesto {fmtH(c.presupuesto)} h · Gasto real {fmtH(c.gastoReal)} h ·{" "}
                {c.saldo >= 0 ? (
                  <span className="text-emerald-800">Saldo {fmtH(c.saldo)} h</span>
                ) : (
                  <span className="text-rose-800">Déficit {fmtH(c.deficitHoras)} h</span>
                )}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-0 text-[10px] font-semibold text-t600"
                onClick={() => toggleCategoria(c.categoria)}
              >
                <ChevronRight size={14} className={`transition-transform ${abierta ? "rotate-90" : ""}`} />
                {abierta ? "Ocultar detalle" : "Ver detalle"}
              </Button>
            </div>
            {abierta ? (
              <div className="border-t border-bdr bg-surface2/30 pb-2">{renderDetalleExpandido(c)}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  ) : (
    <div className="overflow-hidden rounded-r8 border border-bdr bg-white">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-bdr bg-surface2 text-[9px] font-semibold uppercase tracking-wide text-t500">
            <th className="px-3 py-2 text-left">Categoría</th>
            <th className="px-3 py-2 text-right">Presupuesto</th>
            <th className="px-3 py-2 text-right">Gasto real</th>
            <th className="px-3 py-2 text-right">Saldo / déficit</th>
            <th className="px-3 py-2 text-left">Estado</th>
            <th className="px-3 py-2 text-center">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {controlCategorias.map((c) => {
            const abierta = categoriaExpandida === c.categoria;
            return (
              <Fragment key={c.categoria}>
                <tr className="border-b border-bdr/60">
                  <td className="px-3 py-2 font-semibold text-t800">{c.categoria}</td>
                  <td className="px-3 py-2 text-right font-mono text-t700">{fmtH(c.presupuesto)} h</td>
                  <td className="px-3 py-2 text-right font-mono text-t700">{fmtH(c.gastoReal)} h</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {c.saldo >= 0 ? (
                      <span className="text-emerald-800">{fmtH(c.saldo)} h</span>
                    ) : (
                      <span className="text-rose-800">−{fmtH(c.deficitHoras)} h</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold ${claseEstadoCategoria(c.estado)}`}
                    >
                      {etiquetaEstadoCategoria(c)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-0.5 px-2 text-[10px] font-semibold"
                      onClick={() => toggleCategoria(c.categoria)}
                      aria-expanded={abierta}
                    >
                      <ChevronDown size={14} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
                      Ver
                    </Button>
                  </td>
                </tr>
                {abierta ? (
                  <tr className="border-b border-bdr/60 bg-surface2/25">
                    <td colSpan={6} className="px-2 py-2">
                      {renderDetalleExpandido(c)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={`space-y-3 ${mobile ? "" : "mt-1"}`}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-t500">Control por categoría</p>
        <p className="mt-0.5 text-[10px] text-t400">
          Presupuesto desde el entregable · gasto real desde RegistroHora DIRECTA válida
        </p>
        {mensajeEquipo ? (
          <p className="mt-1 rounded-r6 border border-emerald-300/50 bg-emerald-50/80 px-2 py-1 text-[11px] text-emerald-900">
            {mensajeEquipo}
          </p>
        ) : null}
        {errorEquipo ? (
          <p className="mt-1 rounded-r6 border border-rose-300/50 bg-rose-50/80 px-2 py-1 text-[11px] text-rose-900">
            {errorEquipo}
          </p>
        ) : null}
        <div className="mt-2">{tablaControl}</div>
        {tieneDeficitCategoria && puedeRedistribuir ? (
          <div className="mt-2">
            <EntregableRedistribuirHorasTrigger
              ent={entregable}
              dense
              showBadges={false}
              buttonLabel="Redistribuir presupuesto"
            />
          </div>
        ) : null}
      </div>

      {accionesSecundarias ? <div className="flex flex-wrap gap-2">{accionesSecundarias}</div> : null}
    </div>
  );
}
