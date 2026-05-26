import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppData, type AsignacionHora } from "@/context/AppDataContext";
import type { BrechaHistoricaParResultado } from "@/entregables/asignacionBrechasHistoricasDetector";

const fmtNum = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

export type ModoNormalizacionSinAsignacion = "cerrada" | "activa";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brecha: BrechaHistoricaParResultado | null;
  onApplied: (modo: ModoNormalizacionSinAsignacion) => void;
  onError: (msg: string) => void;
};

export default function NormalizarSinAsignacionDialog({
  open,
  onOpenChange,
  brecha,
  onApplied,
  onError,
}: Props) {
  const { entregables, profesionales, proyectos, addAsignacionHoraHistoricaCerrada, addAsignacionHora } =
    useAppData();

  const [modo, setModo] = useState<ModoNormalizacionSinAsignacion>("cerrada");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaCierre, setFechaCierre] = useState("");
  const [horasStr, setHorasStr] = useState("");
  const [rol, setRol] = useState<AsignacionHora["rol_en_entregable"]>("APOYO");

  const ent = brecha ? entregables.find((e) => e.id === brecha.entregable_id) : undefined;
  const prof = brecha ? profesionales.find((p) => p.id === brecha.profesional_id) : undefined;
  const proyectoCodigo = ent ? proyectos.find((p) => p.id === ent.proyecto_id)?.codigo : undefined;

  useEffect(() => {
    if (!open || !brecha || brecha.categoria_detector !== "SIN_ASIGNACION") return;
    setModo("cerrada");
    setFechaInicio(brecha.primera_fecha_gasto);
    setFechaCierre(brecha.ultima_fecha_gasto);
    setHorasStr(String(brecha.horas_totales_gasto));
    const e = entregables.find((x) => x.id === brecha.entregable_id);
    const p = profesionales.find((x) => x.id === brecha.profesional_id);
    const esLider = e != null && p != null && e.lider_id === p.id;
    setRol(esLider ? "LIDER" : "APOYO");
  }, [open, brecha, entregables, profesionales]);

  const gastoMinimoCaso = brecha?.horas_totales_gasto ?? 0;
  const horasNum = Number(horasStr.replace(",", "."));
  const horasOkCerrada = Number.isFinite(horasNum) && horasNum > 0;
  const horasOkActiva =
    Number.isFinite(horasNum) && horasNum + 1e-9 >= gastoMinimoCaso && horasNum > 0;
  const puedeEnviarCerrada =
    brecha != null &&
    brecha.categoria_detector === "SIN_ASIGNACION" &&
    prof != null &&
    ent != null &&
    fechaInicio.trim() !== "" &&
    fechaCierre.trim() !== "" &&
    fechaCierre >= fechaInicio &&
    horasOkCerrada;
  const puedeEnviarActiva =
    brecha != null &&
    brecha.categoria_detector === "SIN_ASIGNACION" &&
    prof != null &&
    ent != null &&
    fechaInicio.trim() !== "" &&
    horasOkActiva;
  const puedeEnviar = modo === "cerrada" ? puedeEnviarCerrada : puedeEnviarActiva;

  const handleConfirm = () => {
    if (!brecha || !prof || !ent) return;
    const h = Number(horasStr.replace(",", "."));
    if (!Number.isFinite(h) || h <= 0) {
      onError("Las horas comprometidas deben ser mayores a 0.");
      return;
    }
    if (modo === "activa") {
      if (h + 1e-9 < brecha.horas_totales_gasto) {
        onError(
          `En modo vigente (ACTIVA) las horas comprometidas no pueden ser menores al gasto ya registrado en este caso (${fmtNum(brecha.horas_totales_gasto)} h).`,
        );
        return;
      }
      const res = addAsignacionHora({
        entregable_id: brecha.entregable_id,
        proyecto_id: brecha.proyecto_id,
        profesional_id: brecha.profesional_id,
        rol_en_entregable: rol,
        categoria: prof.cargo,
        horas_comprometidas: h,
        estado: "ACTIVA",
        fecha_inicio_vigencia: fechaInicio.trim(),
        fecha_cierre: null,
        motivo_cierre: null,
        horas_gastadas_imputadas_al_cierre: null,
        horas_devueltas_presupuesto: null,
      });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onOpenChange(false);
      onApplied("activa");
      return;
    }
    if (fechaCierre < fechaInicio) {
      onError("La fecha de cierre no puede ser anterior al inicio de vigencia.");
      return;
    }
    const res = addAsignacionHoraHistoricaCerrada({
      entregable_id: brecha.entregable_id,
      proyecto_id: brecha.proyecto_id,
      profesional_id: brecha.profesional_id,
      rol_en_entregable: rol,
      categoria: prof.cargo,
      horas_comprometidas: h,
      fecha_inicio_vigencia: fechaInicio.trim(),
      fecha_cierre: fechaCierre.trim(),
      motivo_cierre: "Normalización histórica asistida (SIN_ASIGNACION · CERRADA)",
    });
    if (!res.ok) {
      onError(res.error);
      return;
    }
    onOpenChange(false);
    onApplied("cerrada");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Normalizar · asignación histórica</DialogTitle>
          <DialogDescription>
            Elige si regularizas con un tramo <strong>cerrado</strong> o dejas la asignación <strong>ACTIVA</strong> desde
            el inicio del gasto. No se modifica RegistroHora.
          </DialogDescription>
        </DialogHeader>

        {brecha && brecha.categoria_detector === "SIN_ASIGNACION" ? (
          <div className="space-y-4 text-[13px] text-t700">
            <div className="rounded-r8 border border-bdr bg-surface2 px-3 py-2 text-[12px] text-t600">
              <p>
                <span className="font-medium text-t800">Proyecto:</span> {proyectoCodigo ?? brecha.proyecto_codigo ?? "—"}
              </p>
              <p>
                <span className="font-medium text-t800">Entregable:</span> {brecha.entregable_nombre ?? "—"}
              </p>
              <p>
                <span className="font-medium text-t800">Profesional:</span> {brecha.profesional_nombre ?? "—"}
              </p>
              <p>
                <span className="font-medium text-t800">Gasto detectado:</span> {fmtNum(brecha.horas_totales_gasto)} h
                ({brecha.cantidad_registros} reg.)
              </p>
            </div>

            {!prof ? (
              <p className="text-[12px] text-destructive">No se encontró el profesional en maestros.</p>
            ) : !ent ? (
              <p className="text-[12px] text-destructive">No se encontró el entregable en maestros.</p>
            ) : (
              <>
                <div>
                  <Label className="text-t600">Modo de normalización</Label>
                  <Select
                    value={modo}
                    onValueChange={(v) => {
                      const m = v as ModoNormalizacionSinAsignacion;
                      setModo(m);
                      if (m === "cerrada" && brecha) {
                        setFechaCierre(brecha.ultima_fecha_gasto);
                        setHorasStr(String(brecha.horas_totales_gasto));
                      }
                      if (m === "activa" && brecha) {
                        setHorasStr(String(brecha.horas_totales_gasto));
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cerrada">Histórico cerrado (asignación CERRADA)</SelectItem>
                      <SelectItem value="activa">Histórico vigente (asignación ACTIVA, sin cierre)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-t500">
                    {modo === "cerrada"
                      ? "Para entregables terminados o tramos que quieras cerrar hacia atrás."
                      : "Para entregables en ejecución: cupo de la categoría del profesional y reglas operativas actuales se aplican al confirmar."}
                  </p>
                </div>

                <div className="rounded-r8 border border-bdr bg-muted/30 px-3 py-2 text-[11px] text-t600">
                  <span className="font-semibold text-t800">Modo seleccionado:</span>{" "}
                  {modo === "cerrada" ? "CERRADA (ventana con fecha de cierre)" : "ACTIVA (vigente, sin fecha de cierre)"}
                </div>

                <div>
                  <Label className="text-t600">Categoría (cargo del profesional)</Label>
                  <p className="mt-1 rounded-md border border-bdr bg-muted/40 px-3 py-2 font-mono text-[13px]">
                    {prof.cargo}
                  </p>
                  <p className="mt-1 text-[11px] text-t500">
                    Horas comprometidas son siempre en esta categoría (L2 / P4 / P3 / P2), alineado al modelo actual.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="nh-inicio">Inicio vigencia</Label>
                    <Input
                      id="nh-inicio"
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      className="mt-1"
                    />
                    <p className="mt-0.5 text-[10px] text-t500">Propuesta: primera fecha de gasto del caso.</p>
                  </div>
                  {modo === "cerrada" ? (
                    <div>
                      <Label htmlFor="nh-cierre">Fecha cierre</Label>
                      <Input
                        id="nh-cierre"
                        type="date"
                        value={fechaCierre}
                        onChange={(e) => setFechaCierre(e.target.value)}
                        className="mt-1"
                      />
                      <p className="mt-0.5 text-[10px] text-t500">Propuesta: última fecha de gasto del caso.</p>
                    </div>
                  ) : (
                    <div>
                      <Label>Fecha cierre</Label>
                      <p className="mt-1 rounded-md border border-dashed border-bdr bg-surface2 px-3 py-2 text-[12px] text-t500">
                        Sin cierre — asignación ACTIVA (se gestiona con el flujo operativo habitual).
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="nh-horas">Horas comprometidas ({prof.cargo})</Label>
                  <Input
                    id="nh-horas"
                    type="number"
                    step="0.1"
                    min={modo === "activa" ? gastoMinimoCaso : 0.01}
                    value={horasStr}
                    onChange={(e) => setHorasStr(e.target.value)}
                    className="mt-1"
                  />
                  <p className="mt-1 text-[11px] text-t500">
                    {modo === "activa"
                      ? `Mínimo propuesto: ${fmtNum(gastoMinimoCaso)} h (gasto ya registrado en el caso). Puede aumentar; no se aplican márgenes automáticos.`
                      : `Propuesta: ${fmtNum(gastoMinimoCaso)} h del caso; editable. Cupo de categoría no aplica en CERRADA (flujo histórico existente).`}
                  </p>
                </div>

                <div>
                  <Label>Rol en entregable</Label>
                  <Select value={rol} onValueChange={(v) => setRol(v as AsignacionHora["rol_en_entregable"])}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LIDER">Líder</SelectItem>
                      <SelectItem value="APOYO">Apoyo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-[#B45309] hover:bg-[#9A3412]"
            disabled={!puedeEnviar}
            onClick={handleConfirm}
          >
            {modo === "cerrada" ? "Crear asignación CERRADA" : "Crear asignación ACTIVA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
