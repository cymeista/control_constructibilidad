import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";

/** Texto sugerido al crear; si el usuario lo deja o solo ajusta el año, se mantiene alineado al año elegido. */
function nombreSugeridoCurva(anio: number): string {
  return `Curva Año ${anio}`;
}

const PATRON_NOMBRE_AUTO = /^curva\s+año\s+\d{4}$/i;
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppData, type CurvaObjetivoAnual } from "@/context/AppDataContext";
import type { CurvaObjetivoMes } from "@/entregables/curvaObjetivoAnualTypes";
import {
  aplicarProfesionalesDesdeMesHaciaAdelante,
  recalcularObjetivosMeses,
} from "@/entregables/curvaObjetivoAnual";
import { curvaObjetivoAnualCreateSchema, type CurvaObjetivoAnualCreateForm } from "@/components/formularios/schemas";

const MESES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function parseProfesionalesMes(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function parseHorasNoNegativas(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseHorasAjuste(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

type Props = {
  editItem?: CurvaObjetivoAnual | null;
  onSaved: () => void;
  onCancel: () => void;
  onBusinessError: (msg: string) => void;
};

export function CurvaObjetivoAnualFormPanel({ editItem, onSaved, onCancel, onBusinessError }: Props) {
  const { addCurvaObjetivoAnual, updateCurvaObjetivoAnual } = useAppData();

  const y0 = new Date().getFullYear();
  const createForm = useForm<CurvaObjetivoAnualCreateForm>({
    resolver: zodResolver(curvaObjetivoAnualCreateSchema) as Resolver<CurvaObjetivoAnualCreateForm>,
    defaultValues: {
      anio: y0,
      nombre: nombreSugeridoCurva(y0),
      descripcion: "",
      horas_maximas_mensuales_por_profesional: 180,
      profesionales_base: 0,
    },
  });

  const anioCreacion = createForm.watch("anio");

  useEffect(() => {
    if (editItem) return;
    const y = Number(anioCreacion);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return;
    const current = String(createForm.getValues("nombre") ?? "").trim();
    if (current === "" || PATRON_NOMBRE_AUTO.test(current)) {
      createForm.setValue("nombre", nombreSugeridoCurva(y), { shouldDirty: false, shouldValidate: true });
    }
  }, [editItem, anioCreacion, createForm]);

  const editHeaderForm = useForm<{
    nombre: string;
    descripcion: string;
    horas_maximas_mensuales_por_profesional: number;
  }>({
    defaultValues: {
      nombre: "",
      descripcion: "",
      horas_maximas_mensuales_por_profesional: 180,
    },
  });

  const [meses, setMeses] = useState<CurvaObjetivoMes[]>([]);

  const recalcConHorasMax = useCallback(
    (lista: CurvaObjetivoMes[], hMax: number) => recalcularObjetivosMeses(hMax, lista),
    [],
  );

  /** Sincronizar al abrir otra curva o al refrescar la misma (p. ej. `updated_at` tras guardado). */
  useEffect(() => {
    if (!editItem) return;
    editHeaderForm.reset({
      nombre: editItem.nombre,
      descripcion: editItem.descripcion,
      horas_maximas_mensuales_por_profesional: editItem.horas_maximas_mensuales_por_profesional,
    });
    setMeses(editItem.meses.map((m) => ({ ...m })));
  }, [editItem?.id, editItem?.updated_at, editHeaderForm, editItem]);

  const onCreateSubmit: SubmitHandler<CurvaObjetivoAnualCreateForm> = (data) => {
    const nombreFinal = (data.nombre ?? "").trim() || nombreSugeridoCurva(data.anio);
    const r = addCurvaObjetivoAnual({
      anio: data.anio,
      nombre: nombreFinal,
      descripcion: data.descripcion ?? "",
      horas_maximas_mensuales_por_profesional: data.horas_maximas_mensuales_por_profesional,
      profesionales_base: data.profesionales_base,
    });
    if (!r.ok) {
      onBusinessError(r.error);
      return;
    }
    onSaved();
    const yn = new Date().getFullYear();
    createForm.reset({
      anio: yn,
      nombre: nombreSugeridoCurva(yn),
      descripcion: "",
      horas_maximas_mensuales_por_profesional: 180,
      profesionales_base: 0,
    });
  };

  const onSaveEdit = () => {
    if (!editItem) return;
    const h = editHeaderForm.getValues();
    const hMax = Number(h.horas_maximas_mensuales_por_profesional);
    if (!Number.isFinite(hMax) || hMax <= 0) {
      onBusinessError("Horas máximas mensuales por profesional deben ser mayores a 0.");
      return;
    }
    updateCurvaObjetivoAnual(editItem.id, {
      nombre: h.nombre.trim(),
      descripcion: (h.descripcion ?? "").trim(),
      horas_maximas_mensuales_por_profesional: hMax,
      meses: recalcConHorasMax(meses, hMax),
    });
    onSaved();
  };

  const horasMaxParaRecalc = () => {
    const hMax = Number(editHeaderForm.getValues("horas_maximas_mensuales_por_profesional"));
    return Number.isFinite(hMax) && hMax > 0 ? hMax : editItem?.horas_maximas_mensuales_por_profesional ?? 0;
  };

  const patchMes = (mesNum: number, patch: Partial<CurvaObjetivoMes>) => {
    const base = horasMaxParaRecalc();
    setMeses((prev) => {
      const raw = prev.map((m) => (m.mes === mesNum ? { ...m, ...patch } : m));
      return recalcConHorasMax(raw, base);
    });
  };

  const aplicarProfesionalesAdelante = (desdeMes: number) => {
    const row = meses.find((m) => m.mes === desdeMes);
    if (!row) return;
    const base = horasMaxParaRecalc();
    setMeses((prev) =>
      recalcConHorasMax(aplicarProfesionalesDesdeMesHaciaAdelante(prev, desdeMes, row.profesionales), base),
    );
  };

  const onHorasMaxMensualesChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value === "" ? NaN : Number(e.target.value);
    if (Number.isFinite(v) && v > 0) {
      setMeses((prev) => recalcConHorasMax(prev, v));
    }
  };

  const isEditDirty = useMemo(() => {
    if (!editItem) return false;
    const h = editHeaderForm.watch();
    if (h.nombre !== editItem.nombre || (h.descripcion ?? "") !== editItem.descripcion) return true;
    if (Number(h.horas_maximas_mensuales_por_profesional) !== editItem.horas_maximas_mensuales_por_profesional)
      return true;
    if (meses.length !== editItem.meses.length) return true;
    for (let i = 0; i < meses.length; i++) {
      const a = meses[i]!;
      const b = editItem.meses.find((x) => x.mes === a.mes);
      if (!b) return true;
      if (
        a.profesionales !== b.profesionales ||
        a.feriados_horas !== b.feriados_horas ||
        a.vacaciones_horas !== b.vacaciones_horas ||
        a.ajustes_horas !== b.ajustes_horas
      )
        return true;
    }
    return false;
  }, [editItem, editHeaderForm, meses]);

  if (!editItem) {
    const ce = createForm.formState.errors;
    return (
      <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
        <p className="text-[12px] text-t500">
          Curva objetivo al <strong>100%</strong> de capacidad del equipo (sin factor de cargabilidad). Una curva por
          año calendario.
        </p>
        <div className="rounded-r8 border border-bdr bg-surface2/80 px-3 py-2.5 text-[12px] leading-snug text-t700">
          <p className="font-semibold text-t800">Flujo en dos pasos</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 marker:text-t500">
            <li>
              <strong>Paso 1 — Alta:</strong> defines año, cuántos profesionales hay de partida en todo el año (
              <span className="font-medium">Profesionales base</span>), horas máximas por profesional al mes y un
              nombre identificador. Al guardar se generan automáticamente las <strong>12 filas mensuales</strong> con
              esa dotación base.
            </li>
            <li>
              <strong>Paso 2 — Detalle:</strong> abres la curva creada y en la tabla mensual puedes cambiar{" "}
              <strong>profesionales mes a mes</strong>, feriados, vacaciones y ajustes (y usar «→ hasta dic.» cuando
              corresponda).
            </li>
          </ol>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
              Año <span className="text-[#B91C1C]">*</span>
            </Label>
            <Input
              className="rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px]"
              type="number"
              step={1}
              {...createForm.register("anio")}
            />
            {ce.anio && <p className="text-[11px] text-[#B91C1C]">{ce.anio.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
              Profesionales base (inicial los 12 meses) <span className="text-[#B91C1C]">*</span>
            </Label>
            <Input
              className="rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px]"
              type="number"
              step={1}
              min={0}
              {...createForm.register("profesionales_base")}
            />
            <p className="text-[11px] leading-snug text-t500">
              Este valor copia la dotación a <strong>enero–diciembre</strong> al crear la curva. Luego podrás afinar
              cada mes al editar la curva (columna «Prof.»).
            </p>
            {ce.profesionales_base && <p className="text-[11px] text-[#B91C1C]">{ce.profesionales_base.message}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
            Nombre identificador
          </Label>
          <Input
            className="rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px]"
            placeholder={nombreSugeridoCurva(Number(anioCreacion) || y0)}
            {...createForm.register("nombre")}
          />
          <p className="text-[11px] leading-snug text-t500">
            Viene sugerido según el año (ej. «Curva Año 2026»). Puedes dejarlo o cambiarlo; solo sirve para reconocer
            la curva en el listado.
          </p>
          {ce.nombre && <p className="text-[11px] text-[#B91C1C]">{ce.nombre.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">Descripción</Label>
          <Textarea className="min-h-[72px] rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px]" {...createForm.register("descripcion")} />
          {ce.descripcion && <p className="text-[11px] text-[#B91C1C]">{ce.descripcion.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5 md:max-w-md">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
            Horas máximas mensuales por profesional <span className="text-[#B91C1C]">*</span>
          </Label>
          <Input
            className="rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px]"
            type="number"
            inputMode="decimal"
            step="any"
            {...createForm.register("horas_maximas_mensuales_por_profesional")}
          />
          <p className="text-[11px] leading-snug text-t500">
            Enteros (p. ej. 160) o decimales. La validación de que sea &gt; 0 la hace el formulario al guardar.
          </p>
          {ce.horas_maximas_mensuales_por_profesional && (
            <p className="text-[11px] text-[#B91C1C]">{ce.horas_maximas_mensuales_por_profesional.message}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="outline" className="rounded-r8" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" className="rounded-r8">
            Crear curva y generar 12 meses
          </Button>
        </div>
      </form>
    );
  }

  const ee = editHeaderForm.formState.errors;
  const horasMaxReg = editHeaderForm.register("horas_maximas_mensuales_por_profesional", { valueAsNumber: true });

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-t500">
        Objetivo mensual = (profesionales × horas máx.) − feriados − vacaciones + ajustes. Acumulado = suma corrida
        enero–diciembre. El dashboard podrá leer estos valores y aplicar cargabilidad encima, sin modificar esta curva.
      </p>
      <p className="rounded-r8 border border-bdr bg-surface2/80 px-3 py-2 text-[12px] leading-snug text-t700">
        La columna <strong>Prof.</strong> es la dotación por mes: edítala aquí mes a mes o usa «→ hasta dic.» para
        propagar el valor del mes actual hacia diciembre. En el alta de la curva, «Profesionales base» solo rellenó el
        punto de partida en los 12 meses.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold uppercase text-[#374151]">Año</Label>
          <Input className="rounded-r8 border-[#C8CCDB] bg-surface2 px-[14px] py-[10px] text-[13px]" readOnly value={editItem.anio} />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label className="text-[11px] font-semibold uppercase text-[#374151]">Nombre</Label>
          <Input className="rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px]" {...editHeaderForm.register("nombre")} />
          {ee.nombre && <p className="text-[11px] text-[#B91C1C]">{ee.nombre.message}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px] font-semibold uppercase text-[#374151]">Descripción</Label>
        <Textarea className="min-h-[72px] rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px]" {...editHeaderForm.register("descripcion")} />
      </div>
      <div className="flex flex-col gap-1.5 md:max-w-xs">
        <Label className="text-[11px] font-semibold uppercase text-[#374151]">Horas máx. mensuales / profesional</Label>
        <Input
          className="rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px]"
          type="number"
          inputMode="decimal"
          step="any"
          name={horasMaxReg.name}
          ref={horasMaxReg.ref}
          onBlur={horasMaxReg.onBlur}
          onChange={(e) => {
            horasMaxReg.onChange(e);
            onHorasMaxMensualesChange(e);
          }}
        />
      </div>

      <div className="overflow-x-auto rounded-r8 border border-bdr">
        <table className="w-full min-w-[880px] border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-bdr bg-surface2 text-left text-t500">
              <th className="px-2 py-2 font-medium">Mes</th>
              <th className="px-2 py-2 font-medium">Inicio</th>
              <th className="px-2 py-2 font-medium">Término</th>
              <th className="px-2 py-2 font-medium">Prof.</th>
              <th className="px-2 py-2 font-medium w-[100px]"></th>
              <th className="px-2 py-2 font-medium">Feriados (h)</th>
              <th className="px-2 py-2 font-medium">Vacaciones (h)</th>
              <th className="px-2 py-2 font-medium">Ajustes (h)</th>
              <th className="px-2 py-2 font-medium">Obj. mensual</th>
              <th className="px-2 py-2 font-medium">Obj. acum.</th>
            </tr>
          </thead>
          <tbody>
            {meses
              .slice()
              .sort((a, b) => a.mes - b.mes)
              .map((m) => (
                <tr key={m.id} className="border-b border-bdr/70">
                  <td className="px-2 py-1.5 font-medium text-t800">{MESES_ES[m.mes - 1]}</td>
                  <td className="px-2 py-1.5 font-mono text-t600">{m.fecha_inicio}</td>
                  <td className="px-2 py-1.5 font-mono text-t600">{m.fecha_termino}</td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-[72px] font-mono text-[12px]"
                      type="number"
                      min={0}
                      step={1}
                      value={m.profesionales}
                      onChange={(e) => patchMes(m.mes, { profesionales: parseProfesionalesMes(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 whitespace-nowrap px-2 text-[10px]"
                      title={`Aplicar ${m.profesionales} profesionales desde ${MESES_ES[m.mes - 1]} hasta diciembre`}
                      onClick={() => aplicarProfesionalesAdelante(m.mes)}
                    >
                      → hasta dic.
                    </Button>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-[80px] font-mono text-[12px]"
                      type="number"
                      min={0}
                      step={0.1}
                      value={m.feriados_horas}
                      onChange={(e) => patchMes(m.mes, { feriados_horas: parseHorasNoNegativas(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-[80px] font-mono text-[12px]"
                      type="number"
                      min={0}
                      step={0.1}
                      value={m.vacaciones_horas}
                      onChange={(e) => patchMes(m.mes, { vacaciones_horas: parseHorasNoNegativas(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-[80px] font-mono text-[12px]"
                      type="number"
                      step={0.1}
                      value={m.ajustes_horas}
                      onChange={(e) => patchMes(m.mes, { ajustes_horas: parseHorasAjuste(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-t900">
                    {Number.isFinite(m.objetivo_mensual) ? m.objetivo_mensual.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-[#047857]">
                    {Number.isFinite(m.objetivo_acumulado) ? m.objetivo_acumulado.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" variant="outline" className="rounded-r8" onClick={onCancel}>
          Volver
        </Button>
        <Button type="button" className="rounded-r8" disabled={!isEditDirty} onClick={onSaveEdit}>
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
