import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAppData } from "@/context/AppDataContext";
import {
  auditarImputacionesCierrePotencialmenteIncorrectas,
  calcularPropuestasReparacionIncremental,
  type AuditoriaImputacionCierreGrupo,
  type PropuestaReparacionAsignacion,
} from "@/entregables/asignacionHoraImputacionAudit";

const fmtH = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function grupoKey(g: Pick<AuditoriaImputacionCierreGrupo, "profesional_id" | "entregable_id" | "categoria">) {
  return `${g.profesional_id}\u0000${g.entregable_id}\u0000${g.categoria}`;
}

function idCorto(id: string) {
  const t = id.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 8)}…`;
}

export default function AuditoriaImputacionesCierrePanel() {
  const {
    asignaciones_horas,
    registro_horas,
    entregables,
    proyectos,
    profesionales,
    repararImputacionesCierreAsignaciones,
  } = useAppData();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const grupos = useMemo(
    () =>
      auditarImputacionesCierrePotencialmenteIncorrectas(
        asignaciones_horas,
        registro_horas,
        entregables,
        proyectos,
        profesionales,
      ),
    [asignaciones_horas, registro_horas, entregables, proyectos, profesionales],
  );

  const propuestasPorGrupo = useMemo(() => {
    const m = new Map<string, PropuestaReparacionAsignacion[]>();
    for (const g of grupos) {
      const cerradas = asignaciones_horas.filter(
        (a) =>
          a.estado === "CERRADA" &&
          (a.profesional_id ?? "").trim() === g.profesional_id &&
          (a.entregable_id ?? "").trim() === g.entregable_id &&
          a.categoria === g.categoria,
      );
      m.set(
        grupoKey(g),
        calcularPropuestasReparacionIncremental(cerradas, registro_horas, entregables, proyectos, profesionales),
      );
    }
    return m;
  }, [grupos, asignaciones_horas, registro_horas, entregables, proyectos, profesionales]);

  const propuestaPorId = useMemo(() => {
    const flat = new Map<string, PropuestaReparacionAsignacion>();
    for (const arr of propuestasPorGrupo.values()) {
      for (const p of arr) flat.set(p.asignacion_id, p);
    }
    return flat;
  }, [propuestasPorGrupo]);

  const candidatasIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of propuestaPorId.values()) {
      if (p.es_candidata_reparacion) s.add(p.asignacion_id);
    }
    return s;
  }, [propuestaPorId]);

  const seleccionValida = useMemo(() => {
    for (const id of selectedIds) {
      if (!candidatasIds.has(id)) return false;
      if (!propuestaPorId.has(id)) return false;
    }
    return selectedIds.size > 0;
  }, [selectedIds, candidatasIds, propuestaPorId]);

  const previewRepair = useMemo(() => {
    const rows: {
      id: string;
      imputadaAntes: number;
      imputadaDespues: number;
      devAntes: number | null;
      devDespues: number;
    }[] = [];
    for (const id of [...selectedIds].sort()) {
      const a = asignaciones_horas.find((x) => x.id === id);
      const p = propuestaPorId.get(id);
      if (!a || !p) continue;
      const imAnt =
        a.horas_gastadas_imputadas_al_cierre != null && Number.isFinite(Number(a.horas_gastadas_imputadas_al_cierre))
          ? Number(a.horas_gastadas_imputadas_al_cierre)
          : 0;
      const devAnt =
        a.horas_devueltas_presupuesto != null && Number.isFinite(Number(a.horas_devueltas_presupuesto))
          ? Number(a.horas_devueltas_presupuesto)
          : null;
      rows.push({
        id,
        imputadaAntes: imAnt,
        imputadaDespues: p.sugerido_imputacion,
        devAntes: devAnt,
        devDespues: p.devueltas_sugeridas,
      });
    }
    return rows;
  }, [selectedIds, asignaciones_horas, propuestaPorId]);

  const toggleExpanded = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  const toggleSelect = (id: string, on: boolean) => {
    if (!candidatasIds.has(id)) return;
    const next = new Set(selectedIds);
    if (on) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const seleccionarCandidatasGrupo = (g: AuditoriaImputacionCierreGrupo, on: boolean) => {
    const props = propuestasPorGrupo.get(grupoKey(g)) ?? [];
    const next = new Set(selectedIds);
    for (const p of props) {
      if (!p.es_candidata_reparacion) continue;
      if (on) next.add(p.asignacion_id);
      else next.delete(p.asignacion_id);
    }
    setSelectedIds(next);
  };

  const ejecutarReparacion = () => {
    const items = [...selectedIds].map((id) => ({
      id,
      horas_gastadas_imputadas_al_cierre: propuestaPorId.get(id)!.sugerido_imputacion,
    }));
    const r = repararImputacionesCierreAsignaciones(items);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    setSelectedIds(new Set());
    setConfirmText("");
    setConfirmOpen(false);
  };

  return (
    <div className="mb-10 rounded-r12 border border-bdr bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-t900">Auditoría de imputaciones cerradas</h2>
          <p className="mt-1 max-w-[920px] text-[12px] text-t600">
            Lista grupos con posible sobreimputación histórica (misma regla que{" "}
            <span className="font-mono text-[11px]">auditarImputacionesCierrePotencialmenteIncorrectas</span>). La
            reparación solo actualiza campos de imputación al cierre en asignaciones <span className="font-semibold">CERRADAS</span>;
            no modifica RegistroHora ni entregables.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="gap-2 bg-[#0D9488] hover:bg-[#0F766E]"
          disabled={!seleccionValida}
          onClick={() => {
            setConfirmText("");
            setConfirmOpen(true);
          }}
        >
          <Wrench size={14} /> Corregir seleccionadas
        </Button>
      </div>

      <div className="mb-3 rounded-r10 border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-950">
        Marca solo las filas candidatas que quieras ajustar. La corrección es idempotente: una segunda ejecución no debería
        cambiar valores ya alineados con la propuesta incremental.
      </div>

      {grupos.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-t500">No se detectaron grupos con las condiciones de alerta.</p>
      ) : (
        <div className="overflow-x-auto rounded-r10 border border-bdr">
          <table className="min-w-[1600px] w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-bdr bg-slate-50 text-[9px] font-semibold uppercase tracking-wide text-t500">
                <th className="px-2 py-2">Det.</th>
                <th className="px-2 py-2">Profesional</th>
                <th className="px-2 py-2">Proyecto</th>
                <th className="px-2 py-2">Entregable</th>
                <th className="px-2 py-2">Cat.</th>
                <th className="px-2 py-2">Motivo</th>
                <th className="px-2 py-2 text-right">Cerradas</th>
                <th className="px-2 py-2 text-right">Σ imputada</th>
                <th className="px-2 py-2 text-right">Gasto real RH</th>
                <th className="px-2 py-2 text-right">Sobreimp. posible</th>
                <th className="px-2 py-2 min-w-[220px]">Imputación sugerida (por asignación)</th>
                <th className="px-2 py-2 min-w-[200px]">Acción propuesta</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const key = grupoKey(g);
                const open = expanded.has(key);
                const props = propuestasPorGrupo.get(key) ?? [];
                const sugLines = props.map((p) => (
                  <span key={p.asignacion_id} className="block font-mono text-[10px]">
                    {idCorto(p.asignacion_id)}: {fmtH(p.actual_imputacion)} → {fmtH(p.sugerido_imputacion)} h
                    {p.es_candidata_reparacion ? " *" : ""}
                  </span>
                ));
                const nCand = props.filter((p) => p.es_candidata_reparacion).length;
                return (
                  <Fragment key={key}>
                    <tr className="border-b border-bdr/60 align-top hover:bg-slate-50/40">
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1"
                          onClick={() => toggleExpanded(key)}
                        >
                          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </Button>
                      </td>
                      <td className="px-2 py-2 font-medium text-t800">{g.profesional_nombre}</td>
                      <td className="px-2 py-2">
                        <span className="font-mono text-copper">{g.proyecto_codigo}</span>
                        <span className="block text-[10px] text-t600">{g.proyecto_nombre}</span>
                      </td>
                      <td className="px-2 py-2">{g.entregable_nombre}</td>
                      <td className="px-2 py-2 font-mono">{g.categoria}</td>
                      <td className="px-2 py-2 text-[10px] text-t700">{g.motivos.join(", ")}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{g.asignaciones.length}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtH(g.suma_imputada_cerrada)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtH(g.gasto_real_unico_registro)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-amber-900">{fmtH(g.posible_sobreimputacion)}</td>
                      <td className="px-2 py-2 text-[10px] leading-snug">{sugLines}</td>
                      <td className="px-2 py-2 text-[10px] text-t600">{g.propuesta_correccion_sugerida}</td>
                    </tr>
                    {open ? (
                      <tr className="border-b border-bdr bg-slate-50/50">
                        <td colSpan={12} className="px-3 py-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-t500">
                              Detalle · {nCand} candidata(s)
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px]"
                              onClick={() => seleccionarCandidatasGrupo(g, true)}
                            >
                              Marcar candidatas del grupo
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px]"
                              onClick={() => seleccionarCandidatasGrupo(g, false)}
                            >
                              Desmarcar grupo
                            </Button>
                          </div>
                          <div className="overflow-x-auto rounded-r8 border border-bdr bg-white">
                            <table className="min-w-[1100px] w-full border-collapse text-left text-[11px]">
                              <thead>
                                <tr className="border-b border-bdr bg-white text-[9px] font-semibold uppercase tracking-wide text-t500">
                                  <th className="px-2 py-2">Sel.</th>
                                  <th className="px-2 py-2">ID</th>
                                  <th className="px-2 py-2 text-right">Bruto ventana</th>
                                  <th className="px-2 py-2 text-right">Ya imput. orden</th>
                                  <th className="px-2 py-2 text-right">Incremental</th>
                                  <th className="px-2 py-2 text-right">Comp.</th>
                                  <th className="px-2 py-2 text-right">Imput. actual</th>
                                  <th className="px-2 py-2 text-right">Imput. sugerida</th>
                                  <th className="px-2 py-2 text-right">Dev. actual</th>
                                  <th className="px-2 py-2 text-right">Dev. sugerida</th>
                                  <th className="px-2 py-2">Candidata</th>
                                </tr>
                              </thead>
                              <tbody>
                                {props.map((p) => (
                                  <tr key={p.asignacion_id} className="border-b border-bdr/60">
                                    <td className="px-2 py-2">
                                      <Checkbox
                                        checked={selectedIds.has(p.asignacion_id)}
                                        disabled={!p.es_candidata_reparacion}
                                        onCheckedChange={(v) => toggleSelect(p.asignacion_id, Boolean(v))}
                                      />
                                    </td>
                                    <td className="px-2 py-2 font-mono text-[10px] text-t600">{p.asignacion_id}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{fmtH(p.gasto_bruto_ventana)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{fmtH(p.ya_imputado_previo_en_orden)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{fmtH(p.gasto_incremental)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{fmtH(p.horas_comprometidas)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{fmtH(p.actual_imputacion)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-emerald-900">
                                      {fmtH(p.sugerido_imputacion)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums">
                                      {p.devueltas_actual != null ? fmtH(p.devueltas_actual) : "—"}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums">{fmtH(p.devueltas_sugeridas)}</td>
                                    <td className="px-2 py-2 text-[10px]">{p.es_candidata_reparacion ? "Sí" : "No"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setConfirmText("");
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar reparación de imputaciones</DialogTitle>
            <DialogDescription className="text-[13px] text-t700">
              Se actualizarán solo las asignaciones <span className="font-semibold">cerradas</span> seleccionadas. Los
              registros de horas no se modifican. Para continuar escribe <span className="font-semibold">CORREGIR</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[320px] overflow-y-auto rounded-r10 border border-bdr bg-surface2 p-3 text-[12px]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-bdr text-[9px] font-semibold uppercase text-t500">
                  <th className="py-1 pr-2">Asignación</th>
                  <th className="py-1 text-right">Imput. antes</th>
                  <th className="py-1 text-right">Imput. después</th>
                  <th className="py-1 text-right">Dev. antes</th>
                  <th className="py-1 text-right">Dev. después</th>
                </tr>
              </thead>
              <tbody>
                {previewRepair.map((row) => (
                  <tr key={row.id} className="border-b border-bdr/60">
                    <td className="py-1.5 pr-2 font-mono text-[10px]">{idCorto(row.id)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtH(row.imputadaAntes)}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold text-emerald-800">
                      {fmtH(row.imputadaDespues)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {row.devAntes != null ? fmtH(row.devAntes) : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{fmtH(row.devDespues)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-t400">Confirmación escrita</label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Escribe CORREGIR"
              className="mt-1"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#0D9488] hover:bg-[#0F766E]"
              disabled={confirmText.trim().toUpperCase() !== "CORREGIR" || !seleccionValida}
              onClick={ejecutarReparacion}
            >
              Aplicar corrección
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
