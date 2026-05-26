import { Controller, useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  entregableSchema,
  createRegistroHoraSchema,
  pipelineFormSchema,
  computePipelineMontoUf,
  guessPipelineClienteIdFromLegacy,
  cargaMensualSchema,
  asignacionHoraCreateSchema,
  asignacionHoraEditSchema,
  type EntregableForm,
  type RegistroHoraForm,
  type PipelineForm,
  type CargaMensualForm,
  type AsignacionHoraCreateForm,
  type AsignacionHoraEditForm,
} from "./schemas";

import { buildClienteFormSchema, type ClienteFormValues } from "@/clientes/clienteValidation";
import { MENSAJE_BLOQUEO_PROYECTO_POR_REGISTRO_HORAS } from "@/proyectos/proyectoEliminacionRegla";
import {
  buildProfesionalFormSchema,
  type ProfesionalFormValues,
} from "@/profesionales/profesionalValidation";
import {
  buildPmInternoFormSchema,
  type PmInternoFormValues,
} from "@/pm_internos/pmInternoValidation";
import { calculateAvanceTeorico, resolveEstado } from "@/entregables/entregableSeguimiento";
import {
  proyectoFormFieldsSchema,
  type ProyectoFormValues,
} from "@/proyectos/proyectoValidation";
import { calcularTarifaUfDesdeContractual } from "@/proyectos/proyectoMoneda";
import {
  desgloseCupoCategoriaEntregable,
  disponibleCategoriaParaAsignaciones,
  entregableEstadoEsCompletado,
  entregableEstadoPermiteAsignaciones,
  entregableTienePresupuestoPorCategoriaNumerico,
  listarCategoriasSobreconsumidasVsPresupuestoEntregable,
} from "@/entregables/asignacionHoraRules";
import {
  excesosTrasSimulacionRegistroDirecto,
  fechaHoyIsoLocal,
  horasDevueltasPresupuestoAlCierre,
  horasPendientesAsignacionBloque2,
  resolverImputacionIncrementalAlCierre,
  sumaHorasImputadasCierrePreviasProfEntregableCategoria,
  listarProfesionalesExcedidosEnEntregable,
  registroHorasConSimulacionDirecta,
  sumaGastoActivoActualPorCategoria,
  sumaHorasGastadasRealesAsignacionBloque2,
  sumaHorasGastadasRealesEnVentana,
  sumaPendienteActivoPorCategoria,
} from "@/entregables/asignacionHoraConsumo";
import {
  aggregateGastoSinAsignacionActiva,
  semaforoVsCompromiso,
  type SemaforoAsignacionConsumo,
} from "@/entregables/asignacionHoraBloque4";
import { EntregableRedistribuirHorasTrigger } from "@/components/EntregableRedistribuirHorasTrigger";

import {
  useAppData,
  type Cliente,
  type Profesional,
  type PmInterno,
  type Proyecto,
  type Entregable,
  type AsignacionHoraCategoria,
  type RegistroHora,
  type Pipeline,
  type CargaMensual,
  type AsignacionHora,
  type AsignacionHoraSobrecupoConfirmacion,
} from "@/context/AppDataContext";
import { useAuth } from "@/security/AuthContext";
import { canCrearAsignacionSobrecupo } from "@/security/permissions";

/* ─── Shared form field wrapper ─── */
function Field({ label, error, children, required }: { label: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
        {label}{required && <span className="ml-1 text-[#B91C1C]">*</span>}
      </Label>
      {children}
      {error && <p className="text-[11px] text-[#B91C1C]">{error}</p>}
    </div>
  );
}

/* ─── Generic input with Valtica styling ─── */
function VInput({ className = "", ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      className={`w-full min-w-0 rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px] shadow-xs transition-all duration-150 placeholder:text-t300 focus:border-[#6366F1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] focus-visible:ring-0 ${className}`}
      {...props}
    />
  );
}

/* ─── Generic select trigger with Valtica styling ─── */
function VSelectTrigger({ className = "", ...props }: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={`w-full min-w-0 rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px] shadow-xs transition-all duration-150 focus:border-[#6366F1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] focus:ring-0 ${className}`}
      {...props}
    />
  );
}

/* ─── Date input wrapper ─── */
function VDate(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <VInput type="date" {...props} />
      <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t300" />
    </div>
  );
}

/* ─── FormActions ─── */
function FormActions({ onCancel, onSubmit, onSubmitAndNew, submitLabel, isDirty }: {
  onCancel: () => void;
  onSubmit: () => void;
  onSubmitAndNew?: () => void;
  submitLabel: string;
  isDirty: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const handleSave = () => { onSubmit(); setSaved(true); setTimeout(() => setSaved(false), 800); };
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-col-reverse gap-2 border-t border-bdr bg-white/95 px-4 py-3 backdrop-blur-sm max-md:pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:-mx-6 md:flex-row md:items-center md:justify-end md:gap-2.5 md:px-6 md:py-3.5 md:pb-3.5">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        className="min-h-[44px] w-full rounded-r8 border-bdr bg-white px-5 py-2.5 text-[13px] font-semibold text-t700 hover:bg-surface2 md:w-auto"
      >
        Cancelar
      </Button>
      {onSubmitAndNew && (
        <Button
          type="button"
          variant="outline"
          onClick={onSubmitAndNew}
          className="min-h-[44px] w-full rounded-r8 border-bdr bg-white px-5 py-2.5 text-[13px] font-semibold text-t700 hover:bg-surface2 md:w-auto"
        >
          Guardar y Nuevo
        </Button>
      )}
      <Button
        type="button"
        onClick={handleSave}
        disabled={!isDirty}
        className={`min-h-[44px] w-full rounded-r8 px-6 py-2.5 text-[13px] font-semibold text-white transition-all duration-150 hover:-translate-y-px md:w-auto ${saved ? "bg-[#047857]" : "bg-[#4F46E5] hover:bg-[#3730A3]"}`}
      >
        {saved ? <Check className="mr-1 h-4 w-4" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}

/* ═══════════════════════════════════════════
   1. CLIENTES
   ═══════════════════════════════════════════ */

export function ClienteFormPanel({ editItem, onSaved, onCancel }: {
  editItem?: Cliente | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { clientes, addCliente, updateCliente } = useAppData();

  const clienteSchemaResolved = useMemo(
    () => buildClienteFormSchema(clientes, editItem?.id ?? null),
    [clientes, editItem?.id],
  );

  const clienteResolver = useMemo(
    () => zodResolver(clienteSchemaResolved) as Resolver<ClienteFormValues>,
    [clienteSchemaResolved],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<ClienteFormValues>({
    resolver: clienteResolver,
    defaultValues: editItem
      ? { codigo: editItem.codigo, nombre: editItem.nombre, color: editItem.color, activo: editItem.activo }
      : { color: "#4F46E5", activo: true },
  });

  const onSubmit = (data: ClienteFormValues) => {
    if (editItem) {
      updateCliente(editItem.id, data);
    } else {
      addCliente(data);
    }
    onSaved();
    if (!editItem) reset({ color: "#4F46E5", activo: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Código" error={errors.codigo?.message} required>
        <VInput {...register("codigo")} placeholder="Ej: COD, AMSA" />
      </Field>
      <Field label="Nombre" error={errors.nombre?.message} required>
        <VInput {...register("nombre")} placeholder="Nombre del cliente" />
      </Field>
      <Field label="Color identificador" error={errors.color?.message}>
        <div className="flex items-center gap-3">
          <input
            type="color"
            {...register("color")}
            className="h-12 w-12 cursor-pointer rounded-r8 border border-bdr bg-transparent p-0.5"
          />
          <span className="text-[12px] text-t500">{watch("color") || "#4F46E5"}</span>
        </div>
      </Field>
      <Field label="Activo">
        <div className="flex items-center gap-3">
          <Switch checked={watch("activo")} onCheckedChange={(v) => setValue("activo", v, { shouldDirty: true })} />
          <span className="text-[12px] text-t500">{watch("activo") ? "Sí" : "No"}</span>
        </div>
      </Field>
      <FormActions onCancel={onCancel} onSubmit={handleSubmit(onSubmit)} submitLabel={editItem ? "Actualizar" : "Guardar"} isDirty={isDirty} />
    </form>
  );
}

/* ═══════════════════════════════════════════
   2. PROFESIONALES
   ═══════════════════════════════════════════ */

const cargoTagStyle: Record<string, { bg: string; text: string; border: string }> = {
  L2: { bg: "#FDF2F8", text: "#9D174D", border: "#FBCFE8" },
  P4: { bg: "#E0E7FF", text: "#3730A3", border: "#C7D2FE" },
  P3: { bg: "#F0FDF4", text: "#14532D", border: "#BBF7D0" },
  P2: { bg: "#FEFCE8", text: "#713F12", border: "#FEF08A" },
};

export function ProfesionalFormPanel({ editItem, onSaved, onCancel }: {
  editItem?: Profesional | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { profesionales, addProfesional, updateProfesional } = useAppData();

  const profesionalSchemaResolved = useMemo(
    () => buildProfesionalFormSchema(profesionales, editItem?.id ?? null),
    [profesionales, editItem?.id],
  );

  const profesionalResolver = useMemo(
    () => zodResolver(profesionalSchemaResolved) as Resolver<ProfesionalFormValues>,
    [profesionalSchemaResolved],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfesionalFormValues>({
    resolver: profesionalResolver,
    defaultValues: editItem
      ? { codigo: editItem.codigo, nombre_completo: editItem.nombre_completo, cargo: editItem.cargo, email: editItem.email, fecha_ingreso: editItem.fecha_ingreso, activo: editItem.activo }
      : { cargo: "P4", activo: true },
  });

  const onSubmit = (data: ProfesionalFormValues) => {
    if (editItem) updateProfesional(editItem.id, data);
    else addProfesional(data);
    onSaved();
    if (!editItem) reset({ cargo: "P4", activo: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="cod_prof" error={errors.codigo?.message} required>
          <VInput
            {...register("codigo")}
            placeholder="Ej: CL1032946"
            readOnly={!!editItem}
            aria-readonly={!!editItem}
            title={editItem ? "cod_prof es estable y no se puede editar." : "Código único del profesional"}
          />
        </Field>
        <Field label="Nombre Completo" error={errors.nombre_completo?.message} required>
          <VInput {...register("nombre_completo")} placeholder="Nombre completo" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Cargo" error={errors.cargo?.message} required>
          <Select value={watch("cargo")} onValueChange={(v) => setValue("cargo", v as "L2" | "P2" | "P3" | "P4", { shouldDirty: true })}>
            <VSelectTrigger><SelectValue placeholder="Seleccione cargo" /></VSelectTrigger>
            <SelectContent>
              {(["L2", "P2", "P3", "P4"] as const).map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={cargoTagStyle[c]}>{c}</span>
                    {c === "L2" ? "Líder Técnico" : c === "P4" ? "Profesional 4" : c === "P3" ? "Profesional 3" : "Profesional 2"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Email" error={errors.email?.message} required>
          <VInput {...register("email")} type="email" placeholder="email@valtica.cl" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Fecha de Ingreso" error={errors.fecha_ingreso?.message} required>
          <VDate {...register("fecha_ingreso")} />
        </Field>
        <Field label="Activo">
          <div className="flex items-center gap-3">
            <Switch checked={watch("activo")} onCheckedChange={(v) => setValue("activo", v, { shouldDirty: true })} />
            <span className="text-[12px] text-t500">{watch("activo") ? "Sí" : "No"}</span>
          </div>
        </Field>
      </div>
      <FormActions onCancel={onCancel} onSubmit={handleSubmit(onSubmit)} submitLabel={editItem ? "Actualizar" : "Guardar"} isDirty={isDirty} />
    </form>
  );
}

/* ═══════════════════════════════════════════
   3. PM INTERNOS
   ═══════════════════════════════════════════ */

export function PmInternoFormPanel({ editItem, onSaved, onCancel }: {
  editItem?: PmInterno | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { pm_internos, addPmInterno, updatePmInterno } = useAppData();

  const pmInternoSchemaResolved = useMemo(
    () => buildPmInternoFormSchema(pm_internos, editItem?.id ?? null),
    [pm_internos, editItem?.id],
  );

  const pmInternoResolver = useMemo(
    () => zodResolver(pmInternoSchemaResolved) as Resolver<PmInternoFormValues>,
    [pmInternoSchemaResolved],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<PmInternoFormValues>({
    resolver: pmInternoResolver,
    defaultValues: editItem
      ? { codigo: editItem.codigo, nombre: editItem.nombre, activo: editItem.activo }
      : { activo: true },
  });

  const onSubmit = (data: PmInternoFormValues) => {
    if (editItem) {
      updatePmInterno(editItem.id, data);
    } else {
      addPmInterno(data);
    }
    onSaved();
    if (!editItem) reset({ activo: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Código" error={errors.codigo?.message} required>
          <VInput {...register("codigo")} placeholder="Ej: PMI001" />
        </Field>
        <Field label="Nombre" error={errors.nombre?.message} required>
          <VInput {...register("nombre")} placeholder="Nombre PM interno" />
        </Field>
      </div>
      <Field label="Activo">
        <div className="flex items-center gap-3">
          <Switch checked={watch("activo")} onCheckedChange={(v) => setValue("activo", v, { shouldDirty: true })} />
          <span className="text-[12px] text-t500">{watch("activo") ? "Sí" : "No"}</span>
        </div>
      </Field>
      <FormActions onCancel={onCancel} onSubmit={handleSubmit(onSubmit)} submitLabel={editItem ? "Actualizar" : "Guardar"} isDirty={isDirty} />
    </form>
  );
}

/* ═══════════════════════════════════════════
   4. PROYECTOS
   ═══════════════════════════════════════════ */

export function ProyectoFormPanel({ editItem, onSaved, onCancel }: {
  editItem?: Proyecto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const PM_INTERNO_NONE = "__none__";
  const { clientes, pm_internos, entregables, addProyecto, updateProyecto } = useAppData();

  const proyectoResolver = useMemo(
    () => zodResolver(proyectoFormFieldsSchema) as Resolver<ProyectoFormValues>,
    [],
  );

  const emptyProyectoDefaults = useMemo<ProyectoFormValues>(
    () => ({
      codigo: "",
      nombre: "",
      cliente_id: "",
      pm_interno_id: "",
      pm_nombre: "",
      tarifa_l2: 0,
      tarifa_p4: 0,
      tarifa_p3: 0,
      tarifa_p2: 0,
      estado: "ACTIVO",
      fecha_inicio: "",
      fecha_termino: "",
      moneda_original: "UF",
      monto_original: 0,
      valor_uf_conversion: 0,
      tipo_cambio_usd: 0,
      monto_uf_calculado: 0,
      tarifa_l2_original: 0,
      tarifa_p4_original: 0,
      tarifa_p3_original: 0,
      tarifa_p2_original: 0,
    }),
    [],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProyectoFormValues>({
    resolver: proyectoResolver,
    defaultValues: editItem
      ? {
          codigo: editItem.codigo,
          nombre: editItem.nombre,
          cliente_id: editItem.cliente_id,
          pm_interno_id: editItem.pm_interno_id || "",
          pm_nombre: editItem.pm_nombre,
          tarifa_l2: editItem.tarifa_l2,
          tarifa_p4: editItem.tarifa_p4,
          tarifa_p3: editItem.tarifa_p3,
          tarifa_p2: editItem.tarifa_p2,
          estado: editItem.estado,
          fecha_inicio: editItem.fecha_inicio,
          fecha_termino: editItem.fecha_termino,
          moneda_original: editItem.moneda_original,
          monto_original: editItem.monto_original,
          valor_uf_conversion: editItem.valor_uf_conversion,
          tipo_cambio_usd: editItem.tipo_cambio_usd,
          monto_uf_calculado: editItem.monto_uf_calculado,
          tarifa_l2_original: editItem.tarifa_l2_original,
          tarifa_p4_original: editItem.tarifa_p4_original,
          tarifa_p3_original: editItem.tarifa_p3_original,
          tarifa_p2_original: editItem.tarifa_p2_original,
        }
      : emptyProyectoDefaults,
  });

  useEffect(() => {
    if (editItem) {
      reset({
        codigo: editItem.codigo,
        nombre: editItem.nombre,
        cliente_id: editItem.cliente_id,
        pm_interno_id: editItem.pm_interno_id || "",
        pm_nombre: editItem.pm_nombre,
        tarifa_l2: editItem.tarifa_l2,
        tarifa_p4: editItem.tarifa_p4,
        tarifa_p3: editItem.tarifa_p3,
        tarifa_p2: editItem.tarifa_p2,
        estado: editItem.estado,
        fecha_inicio: editItem.fecha_inicio,
        fecha_termino: editItem.fecha_termino,
        moneda_original: editItem.moneda_original,
        monto_original: editItem.monto_original,
        valor_uf_conversion: editItem.valor_uf_conversion,
        tipo_cambio_usd: editItem.tipo_cambio_usd,
        monto_uf_calculado: editItem.monto_uf_calculado,
        tarifa_l2_original: editItem.tarifa_l2_original,
        tarifa_p4_original: editItem.tarifa_p4_original,
        tarifa_p3_original: editItem.tarifa_p3_original,
        tarifa_p2_original: editItem.tarifa_p2_original,
      });
    } else {
      reset(emptyProyectoDefaults);
    }
  }, [editItem, editItem?.id, emptyProyectoDefaults, reset]);

  const monedaSel = watch("moneda_original");
  const valorUfW = watch("valor_uf_conversion");
  const tipoUsdW = watch("tipo_cambio_usd");
  const tL2Orig = watch("tarifa_l2_original");
  const tP4Orig = watch("tarifa_p4_original");
  const tP3Orig = watch("tarifa_p3_original");
  const tP2Orig = watch("tarifa_p2_original");

  const tL2Uf = calcularTarifaUfDesdeContractual({
    moneda: monedaSel,
    tarifa_original: Number(tL2Orig) || 0,
    valor_uf_conversion: Number(valorUfW) || 0,
    tipo_cambio_usd: Number(tipoUsdW) || 0,
  });
  const tP4Uf = calcularTarifaUfDesdeContractual({
    moneda: monedaSel,
    tarifa_original: Number(tP4Orig) || 0,
    valor_uf_conversion: Number(valorUfW) || 0,
    tipo_cambio_usd: Number(tipoUsdW) || 0,
  });
  const tP3Uf = calcularTarifaUfDesdeContractual({
    moneda: monedaSel,
    tarifa_original: Number(tP3Orig) || 0,
    valor_uf_conversion: Number(valorUfW) || 0,
    tipo_cambio_usd: Number(tipoUsdW) || 0,
  });
  const tP2Uf = calcularTarifaUfDesdeContractual({
    moneda: monedaSel,
    tarifa_original: Number(tP2Orig) || 0,
    valor_uf_conversion: Number(valorUfW) || 0,
    tipo_cambio_usd: Number(tipoUsdW) || 0,
  });

  const horasPresPorCategoria = useMemo(() => {
    if (!editItem?.id) return { l2: 0, p4: 0, p3: 0, p2: 0 };
    const rows = entregables.filter((e) => e.proyecto_id === editItem.id);
    const sum = (k: "hrs_l2" | "hrs_p4" | "hrs_p3" | "hrs_p2") =>
      rows.reduce((acc, r) => acc + Number((r as unknown as Record<string, unknown>)[k] ?? 0), 0);
    return { l2: sum("hrs_l2"), p4: sum("hrs_p4"), p3: sum("hrs_p3"), p2: sum("hrs_p2") };
  }, [editItem?.id, entregables]);
  const totalUfEstimado =
    horasPresPorCategoria.l2 * tL2Uf +
    horasPresPorCategoria.p4 * tP4Uf +
    horasPresPorCategoria.p3 * tP3Uf +
    horasPresPorCategoria.p2 * tP2Uf;

  const usaTextoLibrePm = (watch("pm_interno_id") || PM_INTERNO_NONE) === PM_INTERNO_NONE;

  const onSubmit = (data: ProyectoFormValues) => {
    const pmInternoSeleccionado = pm_internos.find((pm) => pm.id === data.pm_interno_id);
    const pmNombrePersistido = pmInternoSeleccionado?.nombre ?? data.pm_nombre;
    const sanitized: ProyectoFormValues = {
      ...data,
      // El monto global queda como legacy: no lo usamos para presupuesto ni para UF del proyecto.
      monto_original: data.monto_original ?? 0,
      monto_uf_calculado: data.monto_uf_calculado ?? 0,
      valor_uf_conversion: data.moneda_original === "UF" ? 0 : data.valor_uf_conversion,
      tipo_cambio_usd: data.moneda_original === "USD" ? data.tipo_cambio_usd : 0,
      // Tarifas internas UF (source of truth) se guardan en los campos existentes.
      tarifa_l2: data.moneda_original === "UF" ? data.tarifa_l2 : tL2Uf,
      tarifa_p4: data.moneda_original === "UF" ? data.tarifa_p4 : tP4Uf,
      tarifa_p3: data.moneda_original === "UF" ? data.tarifa_p3 : tP3Uf,
      tarifa_p2: data.moneda_original === "UF" ? data.tarifa_p2 : tP2Uf,
      // Trazabilidad: en UF, la "original" es la misma tarifa UF.
      tarifa_l2_original: data.moneda_original === "UF" ? data.tarifa_l2 : data.tarifa_l2_original,
      tarifa_p4_original: data.moneda_original === "UF" ? data.tarifa_p4 : data.tarifa_p4_original,
      tarifa_p3_original: data.moneda_original === "UF" ? data.tarifa_p3 : data.tarifa_p3_original,
      tarifa_p2_original: data.moneda_original === "UF" ? data.tarifa_p2 : data.tarifa_p2_original,
    };

    if (editItem) {
      updateProyecto(editItem.id, {
        ...sanitized,
        pm_nombre: pmNombrePersistido,
        project_manager_id: "",
      });
    } else {
      addProyecto({
        ...sanitized,
        pm_nombre: pmNombrePersistido,
        project_manager_id: "",
        uf_presupuestadas: 0,
        hrs_presupuestadas: 0,
      });
    }
    onSaved();
    if (!editItem) reset(emptyProyectoDefaults);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Código" error={errors.codigo?.message} required>
          <VInput {...register("codigo")} placeholder="Ej: COD0064" />
        </Field>
        <Field label="Nombre" error={errors.nombre?.message} required>
          <VInput {...register("nombre")} placeholder="Nombre del proyecto" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Cliente" error={errors.cliente_id?.message} required>
          <Select value={watch("cliente_id") || ""} onValueChange={(v) => setValue("cliente_id", v, { shouldDirty: true })}>
            <VSelectTrigger><SelectValue placeholder="Seleccione cliente" /></VSelectTrigger>
            <SelectContent>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Project Manager" error={errors.pm_nombre?.message} required>
          <Select
            value={watch("pm_interno_id") || PM_INTERNO_NONE}
            onValueChange={(v) => {
              const pmInternoId = v === PM_INTERNO_NONE ? "" : v;
              const seleccionado = pm_internos.find((pm) => pm.id === pmInternoId);
              setValue("pm_interno_id", pmInternoId, { shouldDirty: true });
              if (seleccionado) {
                setValue("pm_nombre", seleccionado.nombre, { shouldDirty: true, shouldValidate: true });
              } else {
                // Al volver a texto libre, vaciamos snapshot para evitar arrastrar PM anterior del catálogo.
                setValue("pm_nombre", "", { shouldDirty: true, shouldValidate: true });
              }
            }}
          >
            <VSelectTrigger><SelectValue placeholder="Seleccione PM interno o texto libre" /></VSelectTrigger>
            <SelectContent>
              <SelectItem value={PM_INTERNO_NONE}>Sin PM interno (usar texto libre)</SelectItem>
              {pm_internos
                .filter((pm) => pm.activo)
                .map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>{pm.codigo} — {pm.nombre}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          {usaTextoLibrePm && (
            <VInput {...register("pm_nombre")} placeholder="Nombre del project manager" />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Estado" error={errors.estado?.message} required>
          <Select value={watch("estado") || ""} onValueChange={(v) => setValue("estado", v as "ACTIVO" | "COMPLETADO" | "NO_INICIADO" | "SUSPENDIDO", { shouldDirty: true })}>
            <VSelectTrigger><SelectValue placeholder="Estado" /></VSelectTrigger>
            <SelectContent>
              {(["ACTIVO", "COMPLETADO", "NO_INICIADO", "SUSPENDIDO"] as const).map((e) => (
                <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fecha Inicio" error={errors.fecha_inicio?.message} required>
          <VDate {...register("fecha_inicio")} />
        </Field>
        <Field label="Fecha Término" error={errors.fecha_termino?.message} required>
          <VDate {...register("fecha_termino")} />
        </Field>
      </div>
      <div className="space-y-4 rounded-r8 border border-bdr bg-surface2/80 p-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-t600">Moneda y tarifas contractuales</p>
        <p className="text-[11px] text-t500">
          La moneda contractual sirve para ingresar tarifas comerciales y convertirlas a UF. La app sigue usando internamente tarifas en UF para todos los cálculos.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Moneda contractual" error={errors.moneda_original?.message} required>
            <Select
              value={watch("moneda_original")}
              onValueChange={(v) => {
                const next = v as ProyectoFormValues["moneda_original"];
                setValue("moneda_original", next, { shouldDirty: true, shouldValidate: true });
                if (next === "UF") {
                  setValue("valor_uf_conversion", 0, { shouldDirty: true });
                  setValue("tipo_cambio_usd", 0, { shouldDirty: true });
                  // Si vuelvo a UF, uso las tarifas UF existentes como tarifas originales.
                  setValue("tarifa_l2_original", Number(watch("tarifa_l2")) || 0, { shouldDirty: true });
                  setValue("tarifa_p4_original", Number(watch("tarifa_p4")) || 0, { shouldDirty: true });
                  setValue("tarifa_p3_original", Number(watch("tarifa_p3")) || 0, { shouldDirty: true });
                  setValue("tarifa_p2_original", Number(watch("tarifa_p2")) || 0, { shouldDirty: true });
                } else if (next === "CLP") {
                  setValue("tipo_cambio_usd", 0, { shouldDirty: true });
                }
              }}
            >
              <VSelectTrigger><SelectValue placeholder="Moneda" /></VSelectTrigger>
              <SelectContent>
                <SelectItem value="UF">UF</SelectItem>
                <SelectItem value="CLP">CLP</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {monedaSel === "CLP" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Valor UF usado" error={errors.valor_uf_conversion?.message} required>
              <VInput {...register("valor_uf_conversion")} type="number" step="any" min={0} placeholder="CLP por UF" />
            </Field>
          </div>
        )}

        {monedaSel === "USD" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Tipo cambio USD usado" error={errors.tipo_cambio_usd?.message} required>
              <VInput {...register("tipo_cambio_usd")} type="number" step="any" min={0} placeholder="CLP por USD" />
            </Field>
            <Field label="Valor UF usado" error={errors.valor_uf_conversion?.message} required>
              <VInput {...register("valor_uf_conversion")} type="number" step="any" min={0} placeholder="CLP por UF" />
            </Field>
          </div>
        )}

        {monedaSel === "UF" && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field label="Tarifa L2 UF" error={errors.tarifa_l2?.message} required>
              <VInput {...register("tarifa_l2")} type="number" step="0.01" min={0} placeholder="0.00" />
            </Field>
            <Field label="Tarifa P4 UF" error={errors.tarifa_p4?.message} required>
              <VInput {...register("tarifa_p4")} type="number" step="0.01" min={0} placeholder="0.00" />
            </Field>
            <Field label="Tarifa P3 UF" error={errors.tarifa_p3?.message} required>
              <VInput {...register("tarifa_p3")} type="number" step="0.01" min={0} placeholder="0.00" />
            </Field>
            <Field label="Tarifa P2 UF" error={errors.tarifa_p2?.message} required>
              <VInput {...register("tarifa_p2")} type="number" step="0.01" min={0} placeholder="0.00" />
            </Field>
          </div>
        )}

        {monedaSel === "CLP" && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field label="Tarifa L2 CLP" error={errors.tarifa_l2_original?.message} required>
              <VInput {...register("tarifa_l2_original")} type="number" step="any" min={0} placeholder="0" />
            </Field>
            <Field label="Tarifa P4 CLP" error={errors.tarifa_p4_original?.message} required>
              <VInput {...register("tarifa_p4_original")} type="number" step="any" min={0} placeholder="0" />
            </Field>
            <Field label="Tarifa P3 CLP" error={errors.tarifa_p3_original?.message} required>
              <VInput {...register("tarifa_p3_original")} type="number" step="any" min={0} placeholder="0" />
            </Field>
            <Field label="Tarifa P2 CLP" error={errors.tarifa_p2_original?.message} required>
              <VInput {...register("tarifa_p2_original")} type="number" step="any" min={0} placeholder="0" />
            </Field>
          </div>
        )}

        {monedaSel === "USD" && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field label="Tarifa L2 USD" error={errors.tarifa_l2_original?.message} required>
              <VInput {...register("tarifa_l2_original")} type="number" step="any" min={0} placeholder="0" />
            </Field>
            <Field label="Tarifa P4 USD" error={errors.tarifa_p4_original?.message} required>
              <VInput {...register("tarifa_p4_original")} type="number" step="any" min={0} placeholder="0" />
            </Field>
            <Field label="Tarifa P3 USD" error={errors.tarifa_p3_original?.message} required>
              <VInput {...register("tarifa_p3_original")} type="number" step="any" min={0} placeholder="0" />
            </Field>
            <Field label="Tarifa P2 USD" error={errors.tarifa_p2_original?.message} required>
              <VInput {...register("tarifa_p2_original")} type="number" step="any" min={0} placeholder="0" />
            </Field>
          </div>
        )}

        <div className="space-y-2 rounded-r8 border border-[#C8CCDB] bg-white p-3 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-t500">Tarifas equivalentes en UF (solo lectura)</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="text-[12px]"><span className="text-t400">L2:</span>{" "}<span className="font-mono text-t700">{tL2Uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>{" "}UF</div>
            <div className="text-[12px]"><span className="text-t400">P4:</span>{" "}<span className="font-mono text-t700">{tP4Uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>{" "}UF</div>
            <div className="text-[12px]"><span className="text-t400">P3:</span>{" "}<span className="font-mono text-t700">{tP3Uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>{" "}UF</div>
            <div className="text-[12px]"><span className="text-t400">P2:</span>{" "}<span className="font-mono text-t700">{tP2Uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>{" "}UF</div>
          </div>
          {monedaSel === "CLP" && (
            <p className="text-[10px] text-t400">CLP / Valor UF = UF</p>
          )}
          {monedaSel === "USD" && (
            <p className="text-[10px] text-t400">USD × dólar / Valor UF = UF</p>
          )}
        </div>

        <div className="rounded-r8 border border-[#C8CCDB] bg-white p-3 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-t500">Total UF estimado (según entregables)</p>
          <div className="text-[12px] text-t600">
            <span className="font-mono text-t700">
              {Number.isFinite(totalUfEstimado)
                ? totalUfEstimado.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                : "0,0"}
            </span>{" "}UF
            {!editItem?.id && <span className="ml-2 text-[10px] text-t400">Se calculará al crear entregables.</span>}
          </div>
        </div>
      </div>

      {editItem ? (
        <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 text-[12px] text-t500">
          <span className="font-semibold text-t700">Horas presupuestadas del proyecto</span>
          {" "}(<span className="font-mono text-t700">{editItem.hrs_presupuestadas}</span>
          {" "}hrs) siguen consolidándose desde entregables; no se editan aquí. Las UF del maestro se actualizan al guardar este formulario según la sección anterior.
        </div>
      ) : (
        <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 text-[12px] text-t500">
          <span className="font-semibold text-t700">Horas presupuestadas</span>
          {" "}inician en 0 y se consolidan desde entregables (no editables aquí).
        </div>
      )}
      <FormActions onCancel={onCancel} onSubmit={handleSubmit(onSubmit)} submitLabel={editItem ? "Actualizar" : "Guardar"} isDirty={isDirty} />
    </form>
  );
}

/* ═══════════════════════════════════════════
   5. ENTREGABLES
   ═══════════════════════════════════════════ */

const ENTREGABLE_FORM_EMPTY: EntregableForm = {
  proyecto_id: "",
  fase_codigo: "",
  tarea_codigo: "",
  nombre: "",
  lider_id: "",
  revisor_id: "",
  tipo_flujo: "CON_REVISIONES",
  estado: "NO_INICIADO",
  avance_real: 0,
  avance_teorico: 0,
  fecha_inicio: "",
  fecha_termino: "",
  fecha_revA: "",
  fecha_revB: "",
  fecha_revP: "",
  uf_presupuestadas: 0,
  hrs_l2: 0,
  hrs_p4: 0,
  hrs_p3: 0,
  hrs_p2: 0,
  hrs_presupuestadas: 0,
};

function entregableEditToFormValues(editItem: Entregable): EntregableForm {
  const { hrs_gastadas: _hg, uf_consumidas: _uc, ...editRest } = editItem;
  return {
    ...editRest,
    fase_codigo: editItem.fase_codigo || "",
    tarea_codigo: editItem.tarea_codigo || "",
    revisor_id: editItem.revisor_id || "",
    tipo_flujo: editItem.tipo_flujo || "CON_REVISIONES",
    hrs_l2: editItem.hrs_l2 ?? 0,
    hrs_p4: editItem.hrs_p4 ?? 0,
    hrs_p3: editItem.hrs_p3 ?? 0,
    hrs_p2: editItem.hrs_p2 ?? 0,
    fecha_revA: editItem.fecha_revA || "",
    fecha_revB: editItem.fecha_revB || "",
    fecha_revP: editItem.fecha_revP || "",
  };
}

export function EntregableFormPanel({ editItem, onSaved, onCancel }: {
  editItem?: Entregable | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { proyectos, profesionales, addEntregable, updateEntregable } = useAppData();

  const calculateBudgets = (payload: EntregableForm): { hrs: number; uf: number } => {
    const toFiniteNumber = (value: unknown): number => {
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      if (typeof value === "string") {
        const normalized = value.trim().replace(",", ".");
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const hrsL2 = Number(payload.hrs_l2 || 0);
    const hrsP4 = Number(payload.hrs_p4 || 0);
    const hrsP3 = Number(payload.hrs_p3 || 0);
    const hrsP2 = Number(payload.hrs_p2 || 0);

    const hrs = hrsL2 + hrsP4 + hrsP3 + hrsP2;
    const proyectoId = String(payload.proyecto_id ?? "").trim();
    const proyecto = proyectos.find((p) => String(p.id ?? "").trim() === proyectoId);

    if (!proyecto) {
      return { hrs, uf: 0 };
    }

    const tarifaL2 = toFiniteNumber(proyecto.tarifa_l2);
    const tarifaP4 = toFiniteNumber(proyecto.tarifa_p4);
    const tarifaP3 = toFiniteNumber(proyecto.tarifa_p3);
    const tarifaP2 = toFiniteNumber(proyecto.tarifa_p2);

    const uf =
      tarifaL2 * hrsL2 +
      tarifaP4 * hrsP4 +
      tarifaP3 * hrsP3 +
      tarifaP2 * hrsP2;

    return { hrs, uf };
  };

  const entregableResolver = useMemo(
    () => zodResolver(entregableSchema) as Resolver<EntregableForm>,
    [],
  );

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<EntregableForm>({
    resolver: entregableResolver,
    defaultValues: editItem ? entregableEditToFormValues(editItem) : ENTREGABLE_FORM_EMPTY,
  });

  const handleCancelClick = useCallback(() => {
    if (!editItem) {
      reset(ENTREGABLE_FORM_EMPTY);
    }
    onCancel();
  }, [editItem, onCancel, reset]);

  const proyectoId = watch("proyecto_id");
  const tipoFlujo = watch("tipo_flujo");
  const fechaInicio = watch("fecha_inicio");
  const fechaRevB = watch("fecha_revB");
  const fechaTermino = watch("fecha_termino");

  useEffect(() => {
    if (tipoFlujo !== "SIN_REVISIONES") return;
    const t = (fechaTermino ?? "").trim();
    setValue("fecha_revP", t, { shouldDirty: true });
    setValue("fecha_revA", "", { shouldDirty: true });
    setValue("fecha_revB", "", { shouldDirty: true });
  }, [tipoFlujo, fechaTermino, setValue]);
  const hrsL2 = watch("hrs_l2");
  const hrsP4 = watch("hrs_p4");
  const hrsP3 = watch("hrs_p3");
  const hrsP2 = watch("hrs_p2");

  const previewPayload = useMemo(
    () =>
      ({
        proyecto_id: String(proyectoId || "").trim(),
        tipo_flujo: (tipoFlujo || "CON_REVISIONES") as "CON_REVISIONES" | "SIN_REVISIONES",
        fecha_inicio: fechaInicio || "",
        fecha_revB: fechaRevB || "",
        fecha_termino: fechaTermino || "",
        hrs_l2: Number(hrsL2 || 0),
        hrs_p4: Number(hrsP4 || 0),
        hrs_p3: Number(hrsP3 || 0),
        hrs_p2: Number(hrsP2 || 0),
      }) as EntregableForm,
    [proyectoId, tipoFlujo, fechaInicio, fechaRevB, fechaTermino, hrsL2, hrsP4, hrsP3, hrsP2],
  );

  const previewBudgets = useMemo(() => calculateBudgets(previewPayload), [previewPayload]);

  const onSubmit = (data: EntregableForm) => {
    const budgets = calculateBudgets({ ...data, proyecto_id: String(data.proyecto_id || "").trim() });
    const seguimientoPayload =
      data.tipo_flujo === "SIN_REVISIONES"
        ? {
            tipo_flujo: "SIN_REVISIONES" as const,
            fecha_inicio: data.fecha_inicio,
            fecha_termino: data.fecha_termino,
            fecha_revA: null,
            fecha_revB: null,
            fecha_revP: data.fecha_termino,
            avance_real: data.avance_real,
          }
        : {
            tipo_flujo: "CON_REVISIONES" as const,
            fecha_inicio: data.fecha_inicio,
            fecha_termino: data.fecha_termino,
            fecha_revA: data.fecha_revA,
            fecha_revB: data.fecha_revB,
            fecha_revP: data.fecha_revP,
            avance_real: data.avance_real,
          };
    const avanceTeorico = calculateAvanceTeorico(seguimientoPayload);
    const estadoCalculado = resolveEstado(seguimientoPayload, avanceTeorico);
    let payload: EntregableForm & Partial<Entregable> = {
      ...data,
      hrs_presupuestadas: budgets.hrs,
      uf_presupuestadas: budgets.uf,
      avance_teorico: avanceTeorico,
      estado: estadoCalculado,
    };
    if (data.tipo_flujo === "SIN_REVISIONES") {
      payload = {
        ...payload,
        fecha_revP: data.fecha_termino,
        fecha_revA: null as unknown as string,
        fecha_revB: null as unknown as string,
      };
    }

    if (editItem) {
      updateEntregable(editItem.id, payload as Partial<Entregable>);
    } else {
      addEntregable({
        ...(payload as unknown as Omit<Entregable, "id" | "created_at" | "updated_at">),
        hrs_gastadas: 0,
        uf_consumidas: 0,
      });
    }
    onSaved();
    if (!editItem) {
      reset(ENTREGABLE_FORM_EMPTY);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="my-5 flex items-center gap-3">
        <hr className="flex-1 border-bdr" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-t300">Identificación</span>
        <hr className="flex-1 border-bdr" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Proyecto" error={errors.proyecto_id?.message} required>
          <Controller
            control={control}
            name="proyecto_id"
            render={({ field }) => (
              <Select value={field.value || ""} onValueChange={field.onChange}>
                <VSelectTrigger><SelectValue placeholder="Seleccione proyecto" /></VSelectTrigger>
                <SelectContent>
                  {proyectos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Nombre" error={errors.nombre?.message} required>
          <VInput {...register("nombre")} placeholder="Nombre del entregable" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Fase Código" error={errors.fase_codigo?.message} required>
          <VInput {...register("fase_codigo")} placeholder="Ej: FASE-001" />
        </Field>
        <Field label="Tarea Código" error={errors.tarea_codigo?.message} required>
          <VInput {...register("tarea_codigo")} placeholder="Ej: TAREA-001" />
        </Field>
      </div>
      <p className="text-[11px] leading-relaxed text-t500">
        Si el código de fase/tarea cambia desde provisorio a definitivo, edite este mismo entregable. No cree un
        entregable nuevo, para mantener la trazabilidad de horas y asignaciones.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Líder" error={errors.lider_id?.message} required>
          <Select value={watch("lider_id") || ""} onValueChange={(v) => setValue("lider_id", v, { shouldDirty: true })}>
            <VSelectTrigger><SelectValue placeholder="Seleccione líder" /></VSelectTrigger>
            <SelectContent>
              {profesionales.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre_completo} ({p.cargo})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Revisor" error={errors.revisor_id?.message} required>
          <Select value={watch("revisor_id") || ""} onValueChange={(v) => setValue("revisor_id", v, { shouldDirty: true })}>
            <VSelectTrigger><SelectValue placeholder="Seleccione revisor" /></VSelectTrigger>
            <SelectContent>
              {profesionales.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre_completo} ({p.cargo})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tipo Flujo" error={errors.tipo_flujo?.message} required>
          <Select
            value={watch("tipo_flujo") || "CON_REVISIONES"}
            onValueChange={(v) => setValue("tipo_flujo", v as "CON_REVISIONES" | "SIN_REVISIONES", { shouldDirty: true })}
          >
            <VSelectTrigger><SelectValue placeholder="Seleccione flujo" /></VSelectTrigger>
            <SelectContent>
              <SelectItem value="CON_REVISIONES">CON_REVISIONES</SelectItem>
              <SelectItem value="SIN_REVISIONES">SIN_REVISIONES</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="my-5 flex items-center gap-3">
        <hr className="flex-1 border-bdr" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-t300">Fechas</span>
        <hr className="flex-1 border-bdr" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Field label="Fecha Inicio" error={errors.fecha_inicio?.message} required>
          <VDate {...register("fecha_inicio")} />
        </Field>
        <Field label="Fecha Término" error={errors.fecha_termino?.message} required>
          <VDate {...register("fecha_termino")} />
        </Field>
        {tipoFlujo === "CON_REVISIONES" ? (
          <>
            <Field label="Fecha Rev.A" error={errors.fecha_revA?.message} required>
              <VDate {...register("fecha_revA")} />
            </Field>
            <Field label="Fecha Rev.B" error={errors.fecha_revB?.message} required>
              <VDate {...register("fecha_revB")} />
            </Field>
          </>
        ) : null}
        <Field label="Fecha Rev.P" error={errors.fecha_revP?.message} required>
          <VDate {...register("fecha_revP")} disabled={tipoFlujo === "SIN_REVISIONES"} />
          {tipoFlujo === "SIN_REVISIONES" ? (
            <p className="mt-1 text-[10px] leading-snug text-t500">
              Igual a la fecha de término; se actualiza sola al cambiar el término.
            </p>
          ) : null}
        </Field>
      </div>

      <div className="my-5 flex items-center gap-3">
        <hr className="flex-1 border-bdr" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-t300">Presupuesto</span>
        <hr className="flex-1 border-bdr" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Horas L2" error={errors.hrs_l2?.message} required>
          <VInput {...register("hrs_l2")} type="number" step="0.01" placeholder="0.00" />
        </Field>
        <Field label="Horas P4" error={errors.hrs_p4?.message} required>
          <VInput {...register("hrs_p4")} type="number" step="0.01" placeholder="0.00" />
        </Field>
        <Field label="Horas P3" error={errors.hrs_p3?.message} required>
          <VInput {...register("hrs_p3")} type="number" step="0.01" placeholder="0.00" />
        </Field>
        <Field label="Horas P2" error={errors.hrs_p2?.message} required>
          <VInput {...register("hrs_p2")} type="number" step="0.01" placeholder="0.00" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 md:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-t500">
            Resultados Calculados
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-r6 border border-bdr bg-white px-3 py-2">
              <p className="text-[11px] text-t500">Horas Presupuestadas</p>
              <p className="font-mono text-[15px] font-semibold text-t900">
                {previewBudgets.hrs.toFixed(1)}
              </p>
            </div>
            <div className="rounded-r6 border border-bdr bg-white px-3 py-2">
              <p className="text-[11px] text-t500">UF Presupuestadas</p>
              <p className="font-mono text-[15px] font-semibold text-t900">
                {previewBudgets.uf.toFixed(1)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-t300">
            Estos valores se calculan automáticamente desde horas por categoría y tarifas del proyecto.
          </p>
        </div>
      </div>

      <FormActions
        onCancel={handleCancelClick}
        onSubmit={handleSubmit(onSubmit)}
        submitLabel={editItem ? "Actualizar" : "Guardar"}
        isDirty={isDirty}
      />
    </form>
  );
}

/* ═══════════════════════════════════════════
   6. REGISTRO DE HORAS
   ═══════════════════════════════════════════ */

export function RegistroHoraFormPanel({ editItem, onSaved, onCancel }: {
  editItem?: RegistroHora | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { profesionales, proyectos, entregables, registro_horas, asignaciones_horas, addRegistroHora, updateRegistroHora } =
    useAppData();

  const registroHoraSchemaResolved = useMemo(
    () => createRegistroHoraSchema(entregables.map((e) => ({ id: e.id, proyecto_id: e.proyecto_id }))),
    [entregables],
  );

  const registroHoraResolver = useMemo(
    () => zodResolver(registroHoraSchemaResolved) as Resolver<RegistroHoraForm>,
    [registroHoraSchemaResolved],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<RegistroHoraForm>({
    resolver: registroHoraResolver,
    defaultValues: editItem
      ? { ...editItem }
      : { tipo_hora: "DIRECTA", horas: 0 },
  });

  const modoRegistroId = editItem?.id ?? "__nuevo__";
  useEffect(() => {
    if (editItem) {
      reset({
        id: editItem.id,
        profesional_id: editItem.profesional_id,
        proyecto_id: editItem.proyecto_id,
        entregable_id: editItem.entregable_id,
        tipo_hora: editItem.tipo_hora,
        fecha: editItem.fecha,
        horas: editItem.horas,
        descripcion: editItem.descripcion ?? undefined,
      });
    } else {
      reset({ tipo_hora: "DIRECTA", horas: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync solo si cambia `modoRegistroId`
  }, [modoRegistroId, reset]);

  const handleCancelClick = useCallback(() => {
    if (!editItem) {
      reset({ tipo_hora: "DIRECTA", horas: 0 });
    }
    onCancel();
  }, [editItem, onCancel, reset]);

  const tipo = watch("tipo_hora");
  const proyectoId = watch("proyecto_id");
  const profesionalIdW = watch("profesional_id");
  const entregableIdW = watch("entregable_id");
  const fechaW = watch("fecha");
  const horasW = watch("horas");
  const filteredEntregables = entregables.filter((e) => e.proyecto_id === proyectoId);

  const excesoTrasEstaCarga = useMemo(() => {
    if (tipo !== "DIRECTA") return [];
    const h = Number(horasW);
    const sim = {
      tipo_hora: "DIRECTA" as const,
      profesional_id: (profesionalIdW ?? "").trim(),
      proyecto_id: proyectoId ? String(proyectoId).trim() : null,
      entregable_id: entregableIdW ? String(entregableIdW).trim() : null,
      fecha: (fechaW ?? "").trim(),
      horas: h,
    };
    return excesosTrasSimulacionRegistroDirecto(
      registro_horas,
      editItem ?? null,
      sim,
      asignaciones_horas,
      entregables,
      proyectos,
      profesionales,
      fechaHoyIsoLocal(),
    );
  }, [
    tipo,
    horasW,
    fechaW,
    profesionalIdW,
    proyectoId,
    entregableIdW,
    registro_horas,
    editItem,
    asignaciones_horas,
    entregables,
    proyectos,
    profesionales,
  ]);

  const estadoAsignacionRegistroDirecto = useMemo(() => {
    if (tipo !== "DIRECTA" || excesoTrasEstaCarga.length > 0) return null;

    const pid = (profesionalIdW ?? "").trim();
    const eid = (entregableIdW ?? "").trim();
    const fecha = (fechaW ?? "").trim();
    const horasNuevaCarga = Number(horasW);
    if (!pid || !eid || !fecha || !Number.isFinite(horasNuevaCarga) || horasNuevaCarga <= 0) return null;

    const prof = profesionales.find((p) => p.id === pid);
    const cat = prof?.cargo;
    if (cat !== "L2" && cat !== "P4" && cat !== "P3" && cat !== "P2") return null;

    const asignacionesAplicables = asignaciones_horas.filter(
      (a) =>
        a.estado === "ACTIVA" &&
        (a.profesional_id ?? "").trim() === pid &&
        (a.entregable_id ?? "").trim() === eid &&
        a.categoria === cat,
    );

    const nombreProfesional = prof?.nombre_completo ?? "Este profesional";
    const nombreEntregable = entregables.find((e) => e.id === eid)?.nombre ?? eid;

    if (asignacionesAplicables.length === 0) {
      return {
        kind: "sin_asignacion" as const,
        nombreProfesional,
        nombreEntregable,
        horasNuevaCarga,
      };
    }

    const sim = {
      tipo_hora: "DIRECTA" as const,
      profesional_id: pid,
      proyecto_id: proyectoId ? String(proyectoId).trim() : null,
      entregable_id: eid,
      fecha,
      horas: horasNuevaCarga,
    };
    const regsSimulados = registroHorasConSimulacionDirecta(registro_horas, editItem ?? null, sim);
    const hoy = fechaHoyIsoLocal();

    const comprometidas = asignacionesAplicables.reduce((acc, a) => acc + Number(a.horas_comprometidas || 0), 0);
    const gastadoProyectado = asignacionesAplicables.reduce(
      (acc, a) =>
        acc +
        sumaHorasGastadasRealesAsignacionBloque2(
          a,
          asignaciones_horas,
          regsSimulados,
          entregables,
          proyectos,
          profesionales,
          hoy,
        ),
      0,
    );

    return {
      kind: "con_saldo" as const,
      nombreProfesional,
      nombreEntregable,
      horasNuevaCarga,
      saldoDisponible: Math.max(0, comprometidas - gastadoProyectado),
    };
  }, [
    tipo,
    excesoTrasEstaCarga.length,
    profesionalIdW,
    entregableIdW,
    fechaW,
    horasW,
    profesionales,
    asignaciones_horas,
    entregables,
    proyectoId,
    registro_horas,
    editItem,
    proyectos,
  ]);

  const onSubmit = (data: RegistroHoraForm) => {
    const payload: Omit<RegistroHora, "id" | "created_at" | "updated_at"> = {
      profesional_id: data.profesional_id,
      tipo_hora: data.tipo_hora,
      fecha: data.fecha,
      horas: data.horas,
      proyecto_id: data.proyecto_id ?? null,
      entregable_id: data.entregable_id ?? null,
      descripcion: data.descripcion ?? null,
    };
    if (editItem) updateRegistroHora(editItem.id, payload);
    else addRegistroHora(payload);
    onSaved();
    if (!editItem) reset({ tipo_hora: "DIRECTA", horas: 0 });
  };

  const registroAvisoBase = "rounded-r8 border px-4 py-3 text-[12px] shadow-xs";
  const registroAvisoTitle = "font-semibold";
  const registroAvisoText = "mt-1 text-[11px] leading-snug";
  const registroAvisoList = "mt-2 space-y-1.5 text-[11px] leading-snug";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="min-w-0 max-w-full space-y-4">
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4">
        <Field label="Profesional" error={errors.profesional_id?.message} required>
          <Select value={watch("profesional_id") || ""} onValueChange={(v) => setValue("profesional_id", v, { shouldDirty: true })}>
            <VSelectTrigger><SelectValue placeholder="Seleccione profesional" /></VSelectTrigger>
            <SelectContent>
              {profesionales.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre_completo} ({p.cargo})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fecha" error={errors.fecha?.message} required>
          <VDate {...register("fecha")} />
        </Field>
        <Field label="Tipo de Hora" error={errors.tipo_hora?.message} required>
          <Select
            value={watch("tipo_hora") || ""}
            onValueChange={(v) => {
              const t = v as "DIRECTA" | "INDIRECTA" | "VACACIONES";
              setValue("tipo_hora", t, { shouldDirty: true });
              if (t !== "DIRECTA") {
                setValue("proyecto_id", null, { shouldDirty: true });
                setValue("entregable_id", null, { shouldDirty: true });
              }
            }}
          >
            <VSelectTrigger><SelectValue placeholder="Tipo" /></VSelectTrigger>
            <SelectContent>
              {(["DIRECTA", "INDIRECTA", "VACACIONES"] as const).map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {tipo === "DIRECTA" ? (
          <>
            <Field label="Proyecto" error={errors.proyecto_id?.message} required>
              <Select value={watch("proyecto_id") || ""} onValueChange={(v) => { setValue("proyecto_id", v || null, { shouldDirty: true }); setValue("entregable_id", null, { shouldDirty: true }); }}>
                <VSelectTrigger><SelectValue placeholder="Seleccione proyecto" /></VSelectTrigger>
                <SelectContent>
                  {proyectos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Entregable" error={errors.entregable_id?.message} required>
              <Select value={watch("entregable_id") || ""} onValueChange={(v) => setValue("entregable_id", v || null, { shouldDirty: true })}>
                <VSelectTrigger><SelectValue placeholder="Seleccione entregable" /></VSelectTrigger>
                <SelectContent>
                  {filteredEntregables.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        ) : null}
        <Field label="Horas" error={errors.horas?.message} required>
          <VInput {...register("horas")} type="number" step="0.01" placeholder="Ej: 8.00" />
          <p className="mt-1.5 text-[10px] leading-snug text-t500">
            El tope de validación de <span className="font-mono">168</span> h es un límite <strong>general por línea de
            registro</strong> (semana teórica 7×24 h), no el cupo de asignación al entregable ni el presupuesto por
            categoría.
          </p>
        </Field>
      </div>
      {tipo === "DIRECTA" && (
        <p className="text-[11px] text-t500">
          Fase y tarea quedan definidas por el entregable elegido (trazabilidad vía entregable; no se ingresan aquí).
        </p>
      )}
      {tipo === "DIRECTA" && estadoAsignacionRegistroDirecto?.kind === "sin_asignacion" ? (
        <div className={`${registroAvisoBase} border-rose-500/45 bg-rose-500/10 text-rose-950`}>
          <p className={registroAvisoTitle}>Este profesional no tiene horas asignadas en este entregable.</p>
          <p className={`${registroAvisoText} text-rose-900/95`}>
            <span className="font-semibold">{estadoAsignacionRegistroDirecto.nombreProfesional}</span> en «
            {estadoAsignacionRegistroDirecto.nombreEntregable}» · nueva carga{" "}
            <span className="font-mono">{estadoAsignacionRegistroDirecto.horasNuevaCarga.toFixed(1)}</span> h.
          </p>
          <p className={`${registroAvisoText} text-rose-900/95`}>
            Puede guardar igual: es una alerta operativa para revisar asignación.
          </p>
        </div>
      ) : null}
      {tipo === "DIRECTA" && estadoAsignacionRegistroDirecto?.kind === "con_saldo" ? (
        <div className={`${registroAvisoBase} border-emerald-500/35 bg-emerald-500/10 text-emerald-950`}>
          <p className={registroAvisoTitle}>Asignación activa detectada para este profesional en el entregable.</p>
          <p className={`${registroAvisoText} text-emerald-900/95`}>
            A <span className="font-semibold">{estadoAsignacionRegistroDirecto.nombreProfesional}</span> le quedan{" "}
            <span className="font-mono font-semibold">{estadoAsignacionRegistroDirecto.saldoDisponible.toFixed(1)}</span> h
            asignadas disponibles en «{estadoAsignacionRegistroDirecto.nombreEntregable}».
          </p>
        </div>
      ) : null}
      {tipo === "DIRECTA" && excesoTrasEstaCarga.length > 0 ? (
        <div className={`${registroAvisoBase} border-rose-500/45 bg-rose-500/10 text-rose-950`}>
          <p className={registroAvisoTitle}>Esta carga dejaría el compromiso de asignación por debajo del gasto real</p>
          <p className={`${registroAvisoText} text-rose-900/95`}>
            Puede guardar igual: no hay bloqueo. Revise horas comprometidas o cierre de asignación si corresponde.
          </p>
          <ul className={registroAvisoList}>
            {excesoTrasEstaCarga.map((row) => {
              const prof = profesionales.find((p) => p.id === (profesionalIdW ?? "").trim());
              const nombre = prof?.nombre_completo ?? (profesionalIdW || "El profesional");
              return (
                <li key={row.asignacionId}>
                  <span className="font-semibold">{nombre}</span>{" "}
                  <span className="font-mono text-t800">({row.categoria})</span>: asignado{" "}
                  <span className="font-mono">{row.comprometidas.toFixed(1)}</span> h · proyectado con esta carga{" "}
                  <span className="font-mono">{row.gastadoProyectado.toFixed(1)}</span> h · exceso{" "}
                  <span className="font-mono font-semibold">{row.exceso.toFixed(1)}</span> h
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <Field label="Descripción">
        <VInput {...register("descripcion")} placeholder="Descripción del trabajo realizado" />
      </Field>
      <FormActions onCancel={handleCancelClick} onSubmit={handleSubmit(onSubmit)} submitLabel={editItem ? "Actualizar" : "Guardar"} isDirty={isDirty} />
    </form>
  );
}

/* ═══════════════════════════════════════════
   7. PIPELINE
   ═══════════════════════════════════════════ */

const etapaColor: Record<string, { bg: string; text: string }> = {
  CONCEPTUAL: { bg: "#ECFDF5", text: "#047857" },
  FACTIBILIDAD: { bg: "#E0E7FF", text: "#4F46E5" },
  DETALLE: { bg: "#F5F3FF", text: "#8B5CF6" },
};

const estadoPipeColor: Record<string, { bg: string; text: string }> = {
  EN_ESPERA: { bg: "#FFF7ED", text: "#B45309" },
  EN_COTIZACION: { bg: "#ECFDF5", text: "#047857" },
  APROBADO: { bg: "#E0E7FF", text: "#4F46E5" },
  RECHAZADO: { bg: "#F1F5F9", text: "#475569" },
};

export function PipelineFormPanel({ editItem, onSaved, onCancel }: {
  editItem?: Pipeline | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { clientes, pm_internos, addPipeline, updatePipeline } = useAppData();
  const pipelineResolver = useMemo(
    () => zodResolver(pipelineFormSchema) as Resolver<PipelineForm>,
    [],
  );

  const emptyDefaults: PipelineForm = {
    etapa: "CONCEPTUAL",
    estado: "EN_ESPERA",
    cliente_id: "",
    nombre_proyecto: "",
    entregable: "",
    pm_responsable_id: "",
    fecha_propuesta: "",
    hrs_L2: 0,
    hrs_P4: 0,
    hrs_P3: 0,
    hrs_P2: 0,
    tarifa_l2: 0,
    tarifa_p4: 0,
    tarifa_p3: 0,
    tarifa_p2: 0,
    observaciones: "",
  };

  const formDefaults = useMemo((): PipelineForm => {
    if (!editItem) return emptyDefaults;
    const inferredClienteId =
      editItem.cliente_id?.trim() || guessPipelineClienteIdFromLegacy(editItem.cliente, clientes) || "";
    return {
      id: editItem.id,
      cliente_id: inferredClienteId,
      nombre_proyecto: editItem.nombre_proyecto,
      etapa: editItem.etapa,
      entregable: editItem.entregable,
      pm_responsable_id: editItem.pm_responsable_id,
      fecha_propuesta: editItem.fecha_propuesta,
      estado: editItem.estado,
      hrs_L2: editItem.hrs_L2 ?? 0,
      hrs_P4: editItem.hrs_P4 ?? 0,
      hrs_P3: editItem.hrs_P3 ?? 0,
      hrs_P2: editItem.hrs_P2 ?? 0,
      tarifa_l2: editItem.tarifa_l2 ?? 0,
      tarifa_p4: editItem.tarifa_p4 ?? 0,
      tarifa_p3: editItem.tarifa_p3 ?? 0,
      tarifa_p2: editItem.tarifa_p2 ?? 0,
      observaciones: editItem.observaciones ?? "",
    };
  }, [editItem, clientes]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<PipelineForm>({
    resolver: pipelineResolver,
    defaultValues: formDefaults,
  });

  const clientesActivos = useMemo(() => clientes.filter((c) => c.activo), [clientes]);
  const pmActivos = useMemo(() => pm_internos.filter((pm) => pm.activo), [pm_internos]);

  const hrsL2 = watch("hrs_L2");
  const hrsP4 = watch("hrs_P4");
  const hrsP3 = watch("hrs_P3");
  const hrsP2 = watch("hrs_P2");
  const tarifaL2 = watch("tarifa_l2");
  const tarifaP4 = watch("tarifa_p4");
  const tarifaP3 = watch("tarifa_p3");
  const tarifaP2 = watch("tarifa_p2");

  const montoUfCalculado = useMemo(
    () =>
      computePipelineMontoUf({
        hrs_L2: hrsL2,
        hrs_P4: hrsP4,
        hrs_P3: hrsP3,
        hrs_P2: hrsP2,
        tarifa_l2: tarifaL2,
        tarifa_p4: tarifaP4,
        tarifa_p3: tarifaP3,
        tarifa_p2: tarifaP2,
      }),
    [hrsL2, hrsP4, hrsP3, hrsP2, tarifaL2, tarifaP4, tarifaP3, tarifaP2],
  );

  const onSubmit = (data: PipelineForm) => {
    const monto_uf = computePipelineMontoUf(data);
    const cli = clientes.find((c) => c.id === data.cliente_id);
    const clienteDenorm = cli ? `${cli.codigo} — ${cli.nombre}` : "";
    const payload = {
      ...data,
      cliente: clienteDenorm,
      monto_uf,
      observaciones: data.observaciones?.trim() ? data.observaciones : null,
    };
    if (editItem) updatePipeline(editItem.id, payload);
    else addPipeline(payload);
    onSaved();
    if (!editItem) reset(emptyDefaults);
  };

  const totalHrs =
    (Number(hrsL2) || 0) + (Number(hrsP4) || 0) + (Number(hrsP3) || 0) + (Number(hrsP2) || 0);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="my-5 flex items-center gap-3">
        <hr className="flex-1 border-bdr" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-t300">Información General</span>
        <hr className="flex-1 border-bdr" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Cliente" error={errors.cliente_id?.message} required>
          <Select
            value={watch("cliente_id") || ""}
            onValueChange={(v) => setValue("cliente_id", v, { shouldDirty: true })}
          >
            <VSelectTrigger>
              <SelectValue placeholder={clientesActivos.length ? "Seleccione cliente" : "Sin clientes en catálogo"} />
            </VSelectTrigger>
            <SelectContent>
              {clientesActivos.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {clientesActivos.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-amber-700">
              No hay clientes activos. Cree uno en <strong>Formularios → Clientes</strong>.
            </p>
          ) : null}
        </Field>
        <Field label="Nombre Proyecto" error={errors.nombre_proyecto?.message} required>
          <VInput {...register("nombre_proyecto")} placeholder="Nombre del proyecto" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Etapa" error={errors.etapa?.message} required>
          <Select value={watch("etapa") || ""} onValueChange={(v) => setValue("etapa", v as "CONCEPTUAL" | "FACTIBILIDAD" | "DETALLE", { shouldDirty: true })}>
            <VSelectTrigger><SelectValue placeholder="Etapa" /></VSelectTrigger>
            <SelectContent>
              {(["CONCEPTUAL", "FACTIBILIDAD", "DETALLE"] as const).map((e) => {
                const style = etapaColor[e];
                return (
                  <SelectItem key={e} value={e}>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: style.bg, color: style.text }}>{e}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Entregable" error={errors.entregable?.message} required>
          <VInput {...register("entregable")} placeholder="Descripción del entregable" />
        </Field>
      </div>
      <Field label="PM Responsable" error={errors.pm_responsable_id?.message} required>
        <Select value={watch("pm_responsable_id") || ""} onValueChange={(v) => setValue("pm_responsable_id", v, { shouldDirty: true })}>
          <VSelectTrigger><SelectValue placeholder={pmActivos.length ? "Seleccione PM interno" : "Sin PM internos en catálogo"} /></VSelectTrigger>
          <SelectContent>
            {pmActivos.map((pm) => (
              <SelectItem key={pm.id} value={pm.id}>
                {pm.codigo} — {pm.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pmActivos.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-amber-700">
            No hay Project Managers (PM interno) activos. Cree uno en{" "}
            <strong>Formularios → PM Interno</strong> antes de guardar.
          </p>
        ) : null}
      </Field>

      <div className="my-5 flex items-center gap-3">
        <hr className="flex-1 border-bdr" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-t300">Comercial</span>
        <hr className="flex-1 border-bdr" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Fecha Propuesta" error={errors.fecha_propuesta?.message} required>
          <VDate {...register("fecha_propuesta")} />
        </Field>
        <Field label="Estado" error={errors.estado?.message} required>
          <Select value={watch("estado") || ""} onValueChange={(v) => setValue("estado", v as Pipeline["estado"], { shouldDirty: true })}>
            <VSelectTrigger><SelectValue placeholder="Estado" /></VSelectTrigger>
            <SelectContent>
              {(["EN_ESPERA", "EN_COTIZACION", "APROBADO", "RECHAZADO"] as const).map((e) => {
                const style = estadoPipeColor[e];
                return (
                  <SelectItem key={e} value={e}>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: style.bg, color: style.text }}>{e.replace("_", " ")}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="my-5 flex items-center gap-3">
        <hr className="flex-1 border-bdr" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-t300">Requerimiento de Horas</span>
        <hr className="flex-1 border-bdr" />
      </div>
      <div className="grid grid-cols-1 gap-2 md:gap-3">
        {(
          [
            { cargo: "L2" as const, hrs: "hrs_L2" as const, tar: "tarifa_l2" as const },
            { cargo: "P4" as const, hrs: "hrs_P4" as const, tar: "tarifa_p4" as const },
            { cargo: "P3" as const, hrs: "hrs_P3" as const, tar: "tarifa_p3" as const },
            { cargo: "P2" as const, hrs: "hrs_P2" as const, tar: "tarifa_p2" as const },
          ] as const
        ).map(({ cargo, hrs, tar }) => {
          const style = cargoTagStyle[cargo];
          return (
            <div
              key={cargo}
              className="flex flex-wrap items-end gap-3 rounded-r8 border border-bdr bg-surface2/40 px-3 py-2.5 md:flex-nowrap"
            >
              <span
                className="mb-[22px] inline-flex shrink-0 rounded-r4 px-2 py-1 text-[10px] font-semibold uppercase"
                style={{ background: style.bg, color: style.text }}
              >
                {cargo}
              </span>
              <div className="grid min-w-[120px] flex-1 grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-3">
                <Field label={`Horas ${cargo}`} error={errors[hrs]?.message}>
                  <VInput {...register(hrs)} type="number" step="0.01" min={0} placeholder="0" />
                </Field>
                <Field label={`Tarifa ${cargo} (UF)`} error={errors[tar]?.message}>
                  <VInput {...register(tar)} type="number" step="0.01" min={0} placeholder="0" />
                </Field>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
          Monto UF (calculado)
        </Label>
        <VInput
          readOnly
          tabIndex={-1}
          aria-readonly
          value={Number.isFinite(montoUfCalculado) ? montoUfCalculado.toFixed(2) : "0.00"}
          className="cursor-default bg-surface2 text-t800"
        />
        <p className="text-[10px] text-t500">Σ horas × tarifa por categoría · solo lectura · se guarda al enviar</p>
      </div>
      <div className="flex items-center justify-end">
        <span className="rounded-r4 bg-surface2 px-3 py-1.5 text-[11px] font-semibold text-t700">
          Total horas: {totalHrs.toFixed(2)} hrs
        </span>
      </div>
      <Field label="Observaciones">
        <VInput {...register("observaciones")} placeholder="Notas adicionales" />
      </Field>
      <FormActions onCancel={onCancel} onSubmit={handleSubmit(onSubmit)} submitLabel={editItem ? "Actualizar" : "Guardar"} isDirty={isDirty} />
    </form>
  );
}

/* ═══════════════════════════════════════════
   8. CARGA MENSUAL
   ═══════════════════════════════════════════ */

export function CargaMensualFormPanel({ editItem, onSaved, onCancel }: {
  editItem?: CargaMensual | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { profesionales, addCargaMensual, updateCargaMensual } = useAppData();
  const cargaMensualResolver = useMemo(
    () => zodResolver(cargaMensualSchema) as Resolver<CargaMensualForm>,
    [],
  );
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<CargaMensualForm>({
    resolver: cargaMensualResolver,
    defaultValues: editItem
      ? { ...editItem }
      : { hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 0 },
  });

  const onSubmit = (data: CargaMensualForm) => {
    const payload = { ...data, profesional_id: data.profesional_id ?? null };
    if (editItem) updateCargaMensual(editItem.id, payload);
    else addCargaMensual(payload);
    onSaved();
    if (!editItem) reset({ hrs_directas: 0, hrs_indirectas: 0, hrs_vacaciones: 0, hrs_objetivo: 0 });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Mes (AAAA-MM)" error={errors.mes_iso?.message} required>
          <VInput {...register("mes_iso")} placeholder="Ej: 2026-04" />
        </Field>
        <Field label="Profesional">
          <Select value={watch("profesional_id") || ""} onValueChange={(v) => setValue("profesional_id", v || null, { shouldDirty: true })}>
            <VSelectTrigger><SelectValue placeholder="Equipo (total)" /></VSelectTrigger>
            <SelectContent>
              <SelectItem value="">Equipo completo</SelectItem>
              {profesionales.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre_completo} ({p.cargo})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Horas Directas" error={errors.hrs_directas?.message} required>
          <VInput {...register("hrs_directas")} type="number" step="0.01" placeholder="0.00" />
        </Field>
        <Field label="Horas Indirectas" error={errors.hrs_indirectas?.message} required>
          <VInput {...register("hrs_indirectas")} type="number" step="0.01" placeholder="0.00" />
        </Field>
        <Field label="Horas Vacaciones" error={errors.hrs_vacaciones?.message} required>
          <VInput {...register("hrs_vacaciones")} type="number" step="0.01" placeholder="0.00" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Horas Objetivo" error={errors.hrs_objetivo?.message} required>
          <VInput {...register("hrs_objetivo")} type="number" step="0.01" placeholder="0.00" />
        </Field>
      </div>
      <FormActions onCancel={onCancel} onSubmit={handleSubmit(onSubmit)} submitLabel={editItem ? "Actualizar" : "Guardar"} isDirty={isDirty} />
    </form>
  );
}

/* ═══════════════════════════════════════════
   8b. ASIGNACIONES DE HORAS (Bloque 1)
   ═══════════════════════════════════════════ */

/** Solo texto de UI: «código · nombreProyecto / nombreEntregable» (sin cambiar cálculos). */
export function textoProyectoSlashEntregableParaAlerta(
  proyecto: Proyecto | undefined,
  ent: Entregable | undefined,
): string {
  const codigo = proyecto?.codigo?.trim();
  const nombreProy = proyecto?.nombre?.trim();
  const proyectoPart =
    codigo && nombreProy ? `${codigo} · ${nombreProy}` : codigo || nombreProy || "";
  const entNombre = ent?.nombre?.trim() || ent?.id || "—";
  return proyectoPart ? `${proyectoPart} / ${entNombre}` : entNombre;
}

const ASIG_CATEGORIAS: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];

function AsignacionSemaforoConsumo({ nivel }: { nivel: SemaforoAsignacionConsumo }) {
  if (nivel === "neutral") {
    return (
      <span className="text-[11px] text-t400" title="Sin semáforo aplicable">
        —
      </span>
    );
  }
  const meta: Record<Exclude<SemaforoAsignacionConsumo, "neutral">, { bg: string; title: string }> = {
    verde: { bg: "#16a34a", title: "Gasto real menor al 70% de las horas comprometidas (solo lectura)" },
    amarillo: { bg: "#ca8a04", title: "Gasto entre el 70% y el 100% del comprometido (solo lectura)" },
    rojo: { bg: "#dc2626", title: "Gasto superior al comprometido — alerta, no bloquea" },
  };
  const m = meta[nivel];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: m.bg }}
        title={m.title}
        aria-label={m.title}
      />
      <span className="text-[10px] font-semibold uppercase text-t600">{nivel}</span>
    </span>
  );
}

function AsignacionOperativoEntregableResumen({
  ent,
  asignaciones_horas,
  registro_horas,
  entregables,
  proyectos,
  profesionales,
}: {
  ent: Entregable;
  asignaciones_horas: AsignacionHora[];
  registro_horas: RegistroHora[];
  entregables: Entregable[];
  proyectos: Proyecto[];
  profesionales: Profesional[];
}) {
  const hoy = fechaHoyIsoLocal();
  return (
    <div className="rounded-r8 border border-bdr bg-white px-4 py-3 text-[12px] shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="font-semibold text-t900">Presupuesto del entregable vs. asignaciones y gasto real</div>
        <EntregableRedistribuirHorasTrigger ent={ent} />
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-t500">
        <strong>Presup. (cat.)</strong>: cupo L2/P4/P3/P2 del maestro del entregable.{" "}
        <strong>Cons. hist.</strong>: horas ya imputadas al cierre en asignaciones <em>CERRADAS</em> de esa categoría.{" "}
        <strong>Gasto ACTIVO</strong>: suma de horas DIRECTAS válidas (registro) en ventana vigente de cada asignación{" "}
        <em>ACTIVA</em> de la categoría — es <em>gasto real</em>, no el compromiso escrito.{" "}
        <strong>Pend. ACTIVO</strong>: ∑(comprometido − gasto real) por fila ACTIVA; si alguien se pasó, aquí verá total
        negativo. <strong>Saldo real (cat.)</strong>: presup. − cons. hist. − gasto real ACTIVO (puede ser negativo =
        sobreconsumo vs maestro). <strong>Cupo nuevas asig.</strong>: presup. − hist. − comprometido ACTIVO, truncado a
        mínimo 0 — es el tope para <em>nuevas</em> asignaciones. No confundir con el tope de{" "}
        <span className="font-mono">168</span> h del formulario de Registro de Horas (límite semanal teórico por línea de
        registro).
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-bdr text-left text-t500">
              <th className="py-1.5 pr-2 font-medium">Cat.</th>
              <th className="py-1.5 pr-2 font-medium" title="Cupo categoría en el entregable">
                Presup. entreg.
              </th>
              <th className="py-1.5 pr-2 font-medium" title="Suma horas_gastadas_imputadas_al_cierre en CERRADAS">
                Cons. hist.
              </th>
              <th className="py-1.5 pr-2 font-medium" title="Suma gasto DIRECTO real (registro) en ventanas ACTIVAS">
                Gasto real ACTIVO
              </th>
              <th className="py-1.5 pr-2 font-medium" title="∑ comprometido − gasto real por ACTIVA">
                Pend. ACTIVO
              </th>
              <th
                className="py-1.5 pr-2 font-medium"
                title="Presup. − cons. hist. cerrado − gasto real ACTIVO (sin truncar; negativo = sobreconsumo)"
              >
                Saldo real (cat.)
              </th>
              <th className="py-1.5 font-medium" title="Presup. − cons. hist. − ∑ comprometido ACTIVAS; mínimo 0">
                Cupo nuevas asig.
              </th>
            </tr>
          </thead>
          <tbody>
            {ASIG_CATEGORIAS.map((cat) => {
              const d = desgloseCupoCategoriaEntregable(ent, asignaciones_horas, cat);
              const gastoActivo = sumaGastoActivoActualPorCategoria(
                ent.id,
                cat,
                asignaciones_horas,
                registro_horas,
                entregables,
                proyectos,
                profesionales,
                hoy,
              );
              const pendActivo = sumaPendienteActivoPorCategoria(
                ent.id,
                cat,
                asignaciones_horas,
                registro_horas,
                entregables,
                proyectos,
                profesionales,
                hoy,
              );
              const saldoRealCategoria = d.presupuesto - d.consumidoHistoricoCerrado - gastoActivo;
              return (
                <tr key={cat} className="border-b border-bdr/70">
                  <td className="py-1.5 pr-2 font-mono font-semibold">{cat}</td>
                  <td className="py-1.5 pr-2 font-mono">{d.presupuesto.toFixed(1)}</td>
                  <td className="py-1.5 pr-2 font-mono">{d.consumidoHistoricoCerrado.toFixed(1)}</td>
                  <td className="py-1.5 pr-2 font-mono">{gastoActivo.toFixed(1)}</td>
                  <td
                    className={`py-1.5 pr-2 font-mono ${pendActivo < 0 ? "font-semibold text-[#B91C1C]" : ""}`}
                  >
                    {pendActivo.toFixed(1)}
                  </td>
                  <td
                    className={`py-1.5 pr-2 font-mono font-semibold ${
                      saldoRealCategoria < 0 ? "text-[#B91C1C]" : "text-t800"
                    }`}
                    title={
                      saldoRealCategoria < 0
                        ? "Sobreconsumo real vs presupuesto de categoría (hist. cerrado + gasto activo)"
                        : undefined
                    }
                  >
                    {saldoRealCategoria.toFixed(1)}
                  </td>
                  <td
                    className={`py-1.5 font-mono font-semibold ${
                      d.disponibleReal <= 0 ? "text-[#B45309]" : "text-[#047857]"
                    }`}
                  >
                    {d.disponibleReal.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AsignacionProfesionalesExcedidosBanner({
  entregableId,
  asignaciones_horas,
  registro_horas,
  entregables,
  proyectos,
  profesionales,
}: {
  entregableId: string;
  asignaciones_horas: AsignacionHora[];
  registro_horas: RegistroHora[];
  entregables: Entregable[];
  proyectos: Proyecto[];
  profesionales: Profesional[];
}) {
  const rows = useMemo(
    () =>
      listarProfesionalesExcedidosEnEntregable(
        entregableId,
        asignaciones_horas,
        registro_horas,
        entregables,
        proyectos,
        profesionales,
        fechaHoyIsoLocal(),
      ),
    [entregableId, asignaciones_horas, registro_horas, entregables, proyectos, profesionales],
  );
  const entCtx = entregables.find((e) => e.id === entregableId);
  const proyectoCtx = entCtx ? proyectos.find((p) => p.id === entCtx.proyecto_id) : undefined;
  const ctxAlerta = textoProyectoSlashEntregableParaAlerta(proyectoCtx, entCtx);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-r8 border border-rose-500/45 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-950 shadow-xs">
      <p className="font-semibold text-rose-950">
        Bloque 2 · Profesionales excedidos vs compromiso en este entregable
      </p>
      <p className="mt-1 max-w-full truncate text-[11px] leading-snug text-rose-900/95" title={ctxAlerta}>
        «{ctxAlerta}»
      </p>
      <p className="mt-1 text-[11px] leading-snug text-rose-900/95">
        Hay una o más asignaciones ACTIVAS donde las horas DIRECTAS imputadas (inicio vigencia → hoy) superan las horas
        comprometidas. El sistema permite seguir registrando horas; revise compromisos o cierre de asignaciones.
      </p>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-snug">
        {rows.map((r) => (
          <li key={r.asignacionId}>
            <span className="font-semibold">{r.nombre}</span>{" "}
            <span className="font-mono text-t800">({r.categoria})</span>: asignado{" "}
            <span className="font-mono">{r.comprometidas.toFixed(1)}</span> h · gastado{" "}
            <span className="font-mono">{r.gastado.toFixed(1)}</span> h · exceso{" "}
            <span className="font-mono font-semibold">{r.exceso.toFixed(1)}</span> h
          </li>
        ))}
      </ul>
    </div>
  );
}

function AsignacionCategoriasSobreconsumidasVsPresupuestoBanner({
  ent,
  clientes,
  asignaciones_horas,
  registro_horas,
  entregables,
  proyectos,
  profesionales,
}: {
  ent: Entregable;
  clientes: Cliente[];
  asignaciones_horas: AsignacionHora[];
  registro_horas: RegistroHora[];
  entregables: Entregable[];
  proyectos: Proyecto[];
  profesionales: Profesional[];
}) {
  const [mostrarHistoricosCompletados, setMostrarHistoricosCompletados] = useState(false);
  const rows = useMemo(
    () =>
      listarCategoriasSobreconsumidasVsPresupuestoEntregable(
        ent,
        asignaciones_horas,
        registro_horas,
        entregables,
        proyectos,
        profesionales,
        fechaHoyIsoLocal(),
      ),
    [ent, asignaciones_horas, registro_horas, entregables, proyectos, profesionales],
  );
  const completado = entregableEstadoEsCompletado(ent);
  const proyecto = proyectos.find((p) => p.id === ent.proyecto_id);
  const cliente = proyecto ? clientes.find((c) => c.id === proyecto.cliente_id) : undefined;
  const faseTxt = (ent.fase_codigo ?? "").trim() || "—";
  const compactoProyectoEntregable = textoProyectoSlashEntregableParaAlerta(proyecto, ent);
  const ctxLineDetalle = [
    cliente ? `${cliente.nombre} (${cliente.codigo})` : "Cliente —",
    proyecto ? `${proyecto.codigo} · ${proyecto.nombre}` : "Proyecto —",
    `Fase ${faseTxt}`,
    `«${ent.nombre}»`,
  ].join(" · ");

  if (rows.length === 0) return null;

  if (completado && !mostrarHistoricosCompletados) {
    return (
      <div className="rounded-r8 border border-amber-500/55 bg-amber-500/12 px-4 py-3 text-[12px] text-amber-950 shadow-xs">
        <p className="font-semibold text-amber-950">
          Bloque 3 · Categorías sobreconsumidas vs presupuesto del entregable
        </p>
        <p className="mt-1 text-[11px] leading-snug text-amber-900/95">
          Este entregable está <span className="font-semibold">completado</span>. Hay {rows.length} categoría(s) con
          sobreconsumo respecto del presupuesto; por defecto se ocultan en la vista operativa.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
          <div className="flex items-center gap-2">
            <Switch
              id="asig-bloque3-historicos-ent"
              checked={mostrarHistoricosCompletados}
              onCheckedChange={setMostrarHistoricosCompletados}
            />
            <Label htmlFor="asig-bloque3-historicos-ent" className="cursor-pointer text-[11px] font-medium text-amber-950">
              Mostrar históricos / completados
            </Label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-r8 border border-amber-500/55 bg-amber-500/12 px-4 py-3 text-[12px] text-amber-950 shadow-xs">
      <p className="font-semibold text-amber-950">
        Bloque 3 · Categorías sobreconsumidas vs presupuesto del entregable
      </p>
      <p className="mt-1 text-[11px] leading-snug text-amber-900/95">
        El consumo histórico cerrado más el gasto real en asignaciones ACTIVAS supera el cupo L2/P4/P3/P2 del maestro. Solo
        alerta operativa (no bloquea). En la tabla, el déficit aparece en <span className="font-medium">Saldo real (cat.)</span>;
        <span className="font-medium"> Cupo nuevas asig.</span> sigue truncado a 0 para validación de nuevas filas.
      </p>
      {completado ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-amber-600/20 pt-2 text-[11px]">
          <div className="flex items-center gap-2">
            <Switch
              id="asig-bloque3-historicos-ent-on"
              checked={mostrarHistoricosCompletados}
              onCheckedChange={setMostrarHistoricosCompletados}
            />
            <Label htmlFor="asig-bloque3-historicos-ent-on" className="cursor-pointer text-[11px] font-medium text-amber-950">
              Mostrar históricos / completados
            </Label>
          </div>
        </div>
      ) : null}
      <ul className="mt-2 space-y-2 text-[11px] leading-snug">
        {rows.map((r) => (
          <li key={r.categoria} className="rounded-r6 border border-amber-600/25 bg-white/40 px-2 py-1.5">
            <span
              className="block max-w-full truncate text-[10px] leading-snug text-amber-900/85"
              title={ctxLineDetalle}
            >
              «{compactoProyectoEntregable}»
            </span>
            <span className="mt-0.5 block">
              <span className="font-mono font-semibold">{r.categoria}</span>
              {" · "}presup. <span className="font-mono">{r.presupuesto.toFixed(1)}</span>
              {" · "}cons. hist. <span className="font-mono">{r.consumidoHistoricoCerrado.toFixed(1)}</span>
              {" · "}gasto activo <span className="font-mono">{r.gastoRealActivo.toFixed(1)}</span>
              {" · "}
              <span className="font-semibold">sobreconsumo</span>{" "}
              <span className="font-mono font-semibold">{r.sobreconsumo.toFixed(1)}</span> h
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AsignacionGastoSinCoberturaList({
  rows,
  profesionales,
  contextoProyectoEntregable,
}: {
  rows: { profesional_id: string; horas_sin_cobertura_activa: number }[];
  profesionales: Profesional[];
  /** «código · proyecto / entregable» o solo entregable si no hay proyecto */
  contextoProyectoEntregable?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-r8 border border-rose-500/45 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-950 shadow-xs">
      <div className="font-semibold text-rose-950">
        Bloque 1 · Gasto DIRECTO sin cobertura temporal de asignación
      </div>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-snug">
        {rows.map((r) => {
          const p = profesionales.find((x) => x.id === r.profesional_id);
          const nombre = p?.nombre_completo ?? r.profesional_id;
          return (
            <li key={r.profesional_id} className="leading-snug">
              <span className="font-semibold">{nombre}</span>
              {" · "}
              <span className="font-mono">{r.horas_sin_cobertura_activa.toFixed(1)}</span>
              {" h DIRECTAS en "}
              {contextoProyectoEntregable ? (
                <>
                  «
                  <span className="break-words font-medium text-t900">{contextoProyectoEntregable}</span>
                  »
                </>
              ) : (
                <span className="text-t700">este entregable</span>
              )}
              {" fuera de ventana de asignación — solo alerta."}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AsignacionLiderEntregableResumen({
  ent,
  profesionales,
  asignaciones_horas,
}: {
  ent: Entregable;
  profesionales: Profesional[];
  asignaciones_horas: AsignacionHora[];
}) {
  const lider = profesionales.find((p) => p.id === ent.lider_id);
  const asigLider = asignaciones_horas.find(
    (a) => a.entregable_id === ent.id && a.profesional_id === ent.lider_id && a.estado === "ACTIVA",
  );
  const tieneHorasAsignadas = asigLider != null && asigLider.horas_comprometidas > 0;

  if (!lider) {
    return (
      <div className="rounded-r8 border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-950">
        Este entregable no tiene un líder definido en el formulario de entregables (campo líder).
      </div>
    );
  }

  return (
    <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 text-[12px] text-t700">
      <div className="font-semibold text-t900">Líder del entregable</div>
      <div className="mt-1">
        {lider.nombre_completo} <span className="text-t500">({lider.cargo})</span>
        {asigLider ? (
          <span className="ml-2 text-t500">
            — {asigLider.horas_comprometidas.toFixed(1)} h comprometidas (asignación ACTIVA)
          </span>
        ) : null}
      </div>
      {!tieneHorasAsignadas ? (
        <p className="mt-2 rounded-r6 border border-amber-300/80 bg-amber-100/80 px-3 py-2 font-medium text-amber-950">
          El líder del entregable aún no tiene una asignación ACTIVA con horas comprometidas mayores a 0.
        </p>
      ) : null}
    </div>
  );
}

export type AsignacionHoraCreacionPrefill = {
  clienteId: string;
  proyectoId: string;
  /** Vacío si solo se profundizó hasta proyecto en la URL. */
  entregableId: string;
  /** Desde Registro de Horas → Normalizar. */
  profesionalId?: string;
  /** Horas comprometidas sugeridas al abrir el formulario. */
  horasSugeridas?: number;
};

function AsignacionHoraCreateFormPanel({
  onSaved,
  onCancel,
  onBusinessError,
  prefillClienteProyectoEntregable,
}: {
  onSaved: () => void;
  onCancel: () => void;
  onBusinessError: (msg: string) => void;
  /** Desde query params (p. ej. Dashboard): orden cliente → proyecto → entregable sin tocar addAsignacionHora. */
  prefillClienteProyectoEntregable?: AsignacionHoraCreacionPrefill | null;
}) {
  const {
    clientes,
    entregables,
    proyectos,
    profesionales,
    asignaciones_horas,
    registro_horas,
    addAsignacionHora,
  } = useAppData();
  const { role } = useAuth();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [filtroClienteId, setFiltroClienteId] = useState("");
  const [filtroProyectoId, setFiltroProyectoId] = useState("");
  const [sobrecupoModalOpen, setSobrecupoModalOpen] = useState(false);
  const [pendingSobrecupo, setPendingSobrecupo] = useState<{
    data: AsignacionHoraCreateForm;
    cupoDisponible: number;
    horas: number;
    sobrecupo: number;
  } | null>(null);
  const [sobrecupoComentario, setSobrecupoComentario] = useState("");
  const [sobrecupoCodigo, setSobrecupoCodigo] = useState("");

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<AsignacionHoraCreateForm>({
    resolver: zodResolver(asignacionHoraCreateSchema) as Resolver<AsignacionHoraCreateForm>,
    defaultValues: {
      entregable_id: "",
      profesional_id: "",
      rol_en_entregable: "APOYO",
      horas_comprometidas: 1,
      fecha_inicio_vigencia: today,
    },
  });

  const entregableId = watch("entregable_id");
  const profesionalId = watch("profesional_id");
  const horasIngresadas = watch("horas_comprometidas");

  const selectedEnt = useMemo(() => entregables.find((e) => e.id === entregableId), [entregables, entregableId]);
  const selectedProf = useMemo(() => profesionales.find((p) => p.id === profesionalId), [profesionales, profesionalId]);
  const proyectoParaBloque1 = useMemo(
    () => (selectedEnt ? proyectos.find((p) => p.id === selectedEnt.proyecto_id) : undefined),
    [selectedEnt, proyectos],
  );
  const contextoProyectoEntregableBloque1 = useMemo(
    () => textoProyectoSlashEntregableParaAlerta(proyectoParaBloque1, selectedEnt),
    [proyectoParaBloque1, selectedEnt],
  );

  const proyectosDelCliente = useMemo(() => {
    if (!filtroClienteId) return [];
    return proyectos.filter((p) => p.cliente_id === filtroClienteId);
  }, [proyectos, filtroClienteId]);

  const entregablesDelProyecto = useMemo(() => {
    if (!filtroProyectoId) return [];
    return entregables.filter((e) => e.proyecto_id === filtroProyectoId);
  }, [entregables, filtroProyectoId]);

  /** Entregables con gasto DIRECTO sin cobertura de asignación ACTIVA (misma fuente que alertas del formulario). */
  const entregablesConGastoSinCoberturaIds = useMemo(() => {
    const hoy = fechaHoyIsoLocal();
    return new Set(
      aggregateGastoSinAsignacionActiva(
        registro_horas,
        asignaciones_horas,
        entregables,
        proyectos,
        profesionales,
        hoy,
      ).map((x) => x.entregable_id),
    );
  }, [registro_horas, asignaciones_horas, entregables, proyectos, profesionales]);

  const entregablesCascada = useMemo(() => {
    if (!filtroProyectoId) return [];
    const filtered = entregablesDelProyecto.filter(
      (e) =>
        entregableTienePresupuestoPorCategoriaNumerico(e) || entregablesConGastoSinCoberturaIds.has(e.id),
    );
    const rank = (e: Entregable) => {
      const alerta = entregablesConGastoSinCoberturaIds.has(e.id);
      const op = entregableEstadoPermiteAsignaciones(e);
      if (alerta) return 1;
      if (op) return 0;
      return 2;
    };
    return [...filtered].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.nombre.localeCompare(b.nombre, "es");
    });
  }, [entregablesDelProyecto, entregablesConGastoSinCoberturaIds, filtroProyectoId]);

  const labelEntregableEnSelector = useCallback(
    (e: Entregable) => {
      const presupOk = entregableTienePresupuestoPorCategoriaNumerico(e);
      const sumCat = presupOk ? e.hrs_l2 + e.hrs_p4 + e.hrs_p3 + e.hrs_p2 : null;
      const sumTxt =
        sumCat != null
          ? `${sumCat.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`
          : "cupos L2–P2 inválidos o sin definir";
      const alerta = entregablesConGastoSinCoberturaIds.has(e.id);
      const parts = [e.nombre, String(e.estado), `Σ presup. L2–P2: ${sumTxt}`];
      if (alerta) parts.push("gasto sin cobertura");
      return parts.join(" · ");
    },
    [entregablesConGastoSinCoberturaIds],
  );

  /** Incluye el entregable del deep-link aunque el filtro operativo lo excluya, para que el select muestre el valor. */
  const entregablesOpcionesCreacion = useMemo(() => {
    const forcedId = prefillClienteProyectoEntregable?.entregableId?.trim();
    const forced =
      forcedId && filtroProyectoId
        ? entregables.find((e) => e.id === forcedId && e.proyecto_id === filtroProyectoId)
        : undefined;
    if (!forced || entregablesCascada.some((e) => e.id === forced.id)) return entregablesCascada;
    return [...entregablesCascada, forced];
  }, [entregablesCascada, prefillClienteProyectoEntregable, filtroProyectoId, entregables]);

  const prefillNavKey = prefillClienteProyectoEntregable
    ? [
        prefillClienteProyectoEntregable.clienteId,
        prefillClienteProyectoEntregable.proyectoId,
        prefillClienteProyectoEntregable.entregableId,
        prefillClienteProyectoEntregable.profesionalId ?? "",
        prefillClienteProyectoEntregable.horasSugeridas ?? "",
      ].join("\x00")
    : "";

  useEffect(() => {
    if (!prefillClienteProyectoEntregable) return;
    const pre = prefillClienteProyectoEntregable;
    setFiltroClienteId(pre.clienteId);
    setFiltroProyectoId(pre.proyectoId);
    const profPre = (pre.profesionalId ?? "").trim();
    const hs = pre.horasSugeridas;
    const horas =
      hs != null && Number.isFinite(hs) && hs > 0 ? Math.round(hs * 10) / 10 : 1;
    reset(
      {
        entregable_id: pre.entregableId.trim() ? pre.entregableId : "",
        profesional_id: profPre,
        rol_en_entregable: "APOYO",
        horas_comprometidas: horas,
        fecha_inicio_vigencia: today,
      },
      { keepDefaultValues: false },
    );
  }, [prefillNavKey, prefillClienteProyectoEntregable, reset, today]);

  const handleCancelCreacion = useCallback(() => {
    setFiltroClienteId("");
    setFiltroProyectoId("");
    const todayStr = new Date().toISOString().slice(0, 10);
    reset({
      entregable_id: "",
      profesional_id: "",
      rol_en_entregable: "APOYO",
      horas_comprometidas: 1,
      fecha_inicio_vigencia: todayStr,
    });
    onCancel();
  }, [onCancel, reset]);

  const profesionalIdPrefill = (prefillClienteProyectoEntregable?.profesionalId ?? "").trim();

  const profesionalesDisponibles = useMemo(() => {
    if (!entregableId) return profesionales;
    const ocupados = new Set(
      asignaciones_horas
        .filter((a) => a.entregable_id === entregableId && a.estado === "ACTIVA")
        .map((a) => a.profesional_id),
    );
    const base = profesionales.filter((p) => !ocupados.has(p.id));
    if (!profesionalIdPrefill) return base;
    const forced = profesionales.find((p) => p.id === profesionalIdPrefill);
    if (!forced || base.some((p) => p.id === forced.id)) return base;
    return [...base, forced];
  }, [profesionales, asignaciones_horas, entregableId, profesionalIdPrefill]);

  useEffect(() => {
    if (!entregableId || !profesionalId) return;
    if (profesionalIdPrefill && profesionalId === profesionalIdPrefill) return;
    const yaActiva = asignaciones_horas.some(
      (a) =>
        a.entregable_id === entregableId && a.profesional_id === profesionalId && a.estado === "ACTIVA",
    );
    if (yaActiva) setValue("profesional_id", "", { shouldDirty: true });
  }, [entregableId, profesionalId, profesionalIdPrefill, asignaciones_horas, setValue]);

  useEffect(() => {
    if (!entregableId) return;
    const e = entregables.find((x) => x.id === entregableId);
    if (!e) return;
    const pr = proyectos.find((p) => p.id === e.proyecto_id);
    if (pr) {
      setFiltroClienteId(pr.cliente_id);
      setFiltroProyectoId(pr.id);
    }
  }, [entregableId, entregables, proyectos]);

  const categoria = selectedProf?.cargo;
  const cupoInfo = useMemo(() => {
    if (!selectedEnt || !categoria) return null;
    return desgloseCupoCategoriaEntregable(selectedEnt, asignaciones_horas, categoria);
  }, [selectedEnt, categoria, asignaciones_horas]);

  const gastoActivoCategoriaSeleccionada = useMemo(() => {
    if (!selectedEnt || !categoria) return null;
    return sumaGastoActivoActualPorCategoria(
      selectedEnt.id,
      categoria,
      asignaciones_horas,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
      fechaHoyIsoLocal(),
    );
  }, [selectedEnt, categoria, asignaciones_horas, registro_horas, entregables, proyectos, profesionales]);

  const alertasGastoSinCoberturaEntregable = useMemo(() => {
    if (!selectedEnt) return [];
    const hoy = fechaHoyIsoLocal();
    return aggregateGastoSinAsignacionActiva(
      registro_horas,
      asignaciones_horas,
      entregables,
      proyectos,
      profesionales,
      hoy,
    ).filter((x) => x.entregable_id === selectedEnt.id);
  }, [selectedEnt, registro_horas, asignaciones_horas, entregables, proyectos, profesionales]);

  const horasNumCreacion = Number(horasIngresadas);
  const propuestaSobrecupoCreacion =
    cupoInfo &&
    categoria &&
    Number.isFinite(horasNumCreacion) &&
    horasNumCreacion > cupoInfo.disponibleReal + 1e-9;

  const resetTrasCreacionOk = useCallback(() => {
      onSaved();
      const todayStr = new Date().toISOString().slice(0, 10);
      const pre = prefillClienteProyectoEntregable;
      if (pre?.clienteId && pre.proyectoId) {
        setFiltroClienteId(pre.clienteId);
        setFiltroProyectoId(pre.proyectoId);
        reset({
          entregable_id: pre.entregableId?.trim() ? pre.entregableId : "",
          profesional_id: "",
          rol_en_entregable: "APOYO",
          horas_comprometidas: 1,
          fecha_inicio_vigencia: todayStr,
        });
      } else {
        setFiltroClienteId("");
        setFiltroProyectoId("");
        reset({
          entregable_id: "",
          profesional_id: "",
          rol_en_entregable: "APOYO",
          horas_comprometidas: 1,
          fecha_inicio_vigencia: todayStr,
        });
      }
  }, [onSaved, prefillClienteProyectoEntregable, reset]);

  const ejecutarCreacionAsignacion = useCallback(
    (data: AsignacionHoraCreateForm, confirmacion?: AsignacionHoraSobrecupoConfirmacion | null): boolean => {
      const ent = entregables.find((e) => e.id === data.entregable_id);
      const prof = profesionales.find((p) => p.id === data.profesional_id);
      if (!ent || !prof) {
        onBusinessError("Entregable o profesional inválido.");
        return false;
      }
      const r = addAsignacionHora(
        {
          entregable_id: data.entregable_id,
          proyecto_id: ent.proyecto_id,
          profesional_id: data.profesional_id,
          rol_en_entregable: data.rol_en_entregable,
          categoria: prof.cargo,
          horas_comprometidas: data.horas_comprometidas,
          estado: "ACTIVA",
          fecha_inicio_vigencia: data.fecha_inicio_vigencia,
          fecha_cierre: null,
          motivo_cierre: null,
          horas_gastadas_imputadas_al_cierre: null,
          horas_devueltas_presupuesto: null,
        },
        confirmacion ?? undefined,
      );
      if (!r.ok) {
        onBusinessError(r.error);
        return false;
      }
      resetTrasCreacionOk();
      return true;
    },
    [addAsignacionHora, entregables, profesionales, onBusinessError, resetTrasCreacionOk],
  );

  const onSubmit: SubmitHandler<AsignacionHoraCreateForm> = (data) => {
    const ent = entregables.find((e) => e.id === data.entregable_id);
    const prof = profesionales.find((p) => p.id === data.profesional_id);
    if (!ent || !prof) {
      onBusinessError("Entregable o profesional inválido.");
      return;
    }
    const disp = disponibleCategoriaParaAsignaciones(ent, asignaciones_horas, prof.cargo);
    const h = Number(data.horas_comprometidas);
    if (Number.isFinite(h) && h > disp + 1e-9) {
      if (!canCrearAsignacionSobrecupo(role ?? "LECTOR")) {
        const { presupuesto, consumidoHistoricoCerrado, asignadoActivo } = desgloseCupoCategoriaEntregable(
          ent,
          asignaciones_horas,
          prof.cargo,
        );
        onBusinessError(
          `Supera el cupo disponible en ${prof.cargo}: ${disp.toFixed(1)} h disponibles (presupuesto ${presupuesto.toFixed(1)} h − consumido hist. cerrado ${consumidoHistoricoCerrado.toFixed(1)} h − asignado ACTIVO ${asignadoActivo.toFixed(1)} h). Solo un administrador puede registrar una asignación sobre cupo con confirmación explícita.`,
        );
        return;
      }
      setPendingSobrecupo({ data, cupoDisponible: disp, horas: h, sobrecupo: h - disp });
      setSobrecupoComentario("");
      setSobrecupoCodigo("");
      setSobrecupoModalOpen(true);
      return;
    }
    ejecutarCreacionAsignacion(data, null);
  };

  const confirmarModalSobrecupo = useCallback(() => {
    if (!pendingSobrecupo) return;
    const com = sobrecupoComentario.trim();
    if (!com) {
      onBusinessError("El comentario de autorización es obligatorio.");
      return;
    }
    if (sobrecupoCodigo.trim() !== "SOBRECUPO") {
      onBusinessError("Debe escribir exactamente SOBRECUPO en el campo de confirmación.");
      return;
    }
    const ok = ejecutarCreacionAsignacion(pendingSobrecupo.data, {
      rolAutor: "ADMIN",
      comentario: com,
      codigoConfirmacion: sobrecupoCodigo.trim(),
      fechaAutorizacion: new Date().toISOString(),
    });
    if (!ok) return;
    setSobrecupoModalOpen(false);
    setPendingSobrecupo(null);
    setSobrecupoComentario("");
    setSobrecupoCodigo("");
  }, [
    pendingSobrecupo,
    sobrecupoComentario,
    sobrecupoCodigo,
    ejecutarCreacionAsignacion,
    onBusinessError,
  ]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="min-w-0 max-w-full space-y-4">
      <p className="text-[12px] leading-snug text-t500">
        La categoría de la asignación coincide con el <strong>cargo</strong> del profesional (L2, P4, P3, P2). El cupo se calcula con las horas <strong>reales</strong> del entregable: hrs_l2, hrs_p4, hrs_p3 y hrs_p2 (incluido 0).
      </p>
      {entregableId && profesionalesDisponibles.length === 0 && (
        <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 text-[12px] text-t700">
          Todos los profesionales ya tienen una asignación ACTIVA en este entregable.
        </div>
      )}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-3 md:gap-4">
        <Field label="Cliente" required>
          <Select
            value={filtroClienteId}
            onValueChange={(v) => {
              setFiltroClienteId(v);
              setFiltroProyectoId("");
              setValue("entregable_id", "", { shouldDirty: true });
              setValue("profesional_id", "", { shouldDirty: true });
            }}
          >
            <VSelectTrigger className="w-full">
              <SelectValue placeholder="Seleccione cliente" />
            </VSelectTrigger>
            <SelectContent className="max-h-[280px]">
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Proyecto" required>
          <Select
            value={filtroProyectoId}
            onValueChange={(v) => {
              setFiltroProyectoId(v);
              setValue("entregable_id", "", { shouldDirty: true });
              setValue("profesional_id", "", { shouldDirty: true });
            }}
            disabled={!filtroClienteId}
          >
            <VSelectTrigger>
              <SelectValue placeholder={filtroClienteId ? "Seleccione proyecto" : "Primero el cliente"} />
            </VSelectTrigger>
            <SelectContent className="max-h-[280px]">
              {proyectosDelCliente.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Entregable" error={errors.entregable_id?.message} required>
          <Controller
            control={control}
            name="entregable_id"
            render={({ field }) => (
              <Select
                value={field.value || ""}
                onValueChange={(v) => {
                  field.onChange(v);
                  setValue("profesional_id", "", { shouldDirty: true });
                }}
                disabled={!filtroProyectoId}
              >
                <VSelectTrigger>
                  <SelectValue
                    placeholder={filtroProyectoId ? "Seleccione entregable" : "Primero el proyecto"}
                  />
                </VSelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {entregablesOpcionesCreacion.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {labelEntregableEnSelector(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>
      {filtroProyectoId && entregablesOpcionesCreacion.length === 0 ? (
        entregablesDelProyecto.length === 0 ? (
          <div className="rounded-r8 border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[12px] text-t700">
            <p className="font-medium text-t900">Este proyecto no tiene entregables en los datos cargados.</p>
            <p className="mt-1 text-[11px] text-t600">
              La lista no inventa filas: si acaba de crear entregables, confirme que quedaron guardados con el mismo{" "}
              <span className="font-medium">proyecto</span> que seleccionó aquí (id en datos = id del proyecto en esta
              lista).
            </p>
          </div>
        ) : (
          <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 text-[12px] text-t700">
            <p className="font-medium">
              Hay {entregablesDelProyecto.length} entregable(s) en este proyecto en datos, pero ninguno puede listarse aquí.
            </p>
            <p className="mt-1 text-[11px] text-t500">
              Un entregable aparece si tiene presupuesto por categoría válido (horas L2, P4, P3 y P2 como números finitos ≥
              0) <strong>o</strong> si hay gasto DIRECTO registrado sin cobertura de asignación ACTIVA a la fecha. Si ya
              corrigió cupos o el gasto, actualice la vista o confirme el entregable en Formularios → Entregables.
            </p>
          </div>
        )
      ) : null}
      {selectedEnt ? (
        <div className="space-y-3">
          {!entregableEstadoPermiteAsignaciones(selectedEnt) ? (
            <div className="rounded-r8 border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
              Este entregable está <strong>{String(selectedEnt.estado)}</strong>. Se permite seleccionar para normalizar
              gasto o asignaciones históricas.
            </div>
          ) : null}
          <AsignacionGastoSinCoberturaList
            rows={alertasGastoSinCoberturaEntregable}
            profesionales={profesionales}
            contextoProyectoEntregable={contextoProyectoEntregableBloque1}
          />
          <AsignacionProfesionalesExcedidosBanner
            entregableId={selectedEnt.id}
            asignaciones_horas={asignaciones_horas}
            registro_horas={registro_horas}
            entregables={entregables}
            proyectos={proyectos}
            profesionales={profesionales}
          />
          <AsignacionCategoriasSobreconsumidasVsPresupuestoBanner
            ent={selectedEnt}
            clientes={clientes}
            asignaciones_horas={asignaciones_horas}
            registro_horas={registro_horas}
            entregables={entregables}
            proyectos={proyectos}
            profesionales={profesionales}
          />
          <AsignacionLiderEntregableResumen
            ent={selectedEnt}
            profesionales={profesionales}
            asignaciones_horas={asignaciones_horas}
          />
          <AsignacionOperativoEntregableResumen
            ent={selectedEnt}
            asignaciones_horas={asignaciones_horas}
            registro_horas={registro_horas}
            entregables={entregables}
            proyectos={proyectos}
            profesionales={profesionales}
          />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Profesional" error={errors.profesional_id?.message} required>
          <Controller
            control={control}
            name="profesional_id"
            render={({ field }) => (
              <Select
                value={field.value || ""}
                onValueChange={field.onChange}
                disabled={!entregableId || profesionalesDisponibles.length === 0}
              >
                <VSelectTrigger>
                  <SelectValue placeholder={entregableId ? "Seleccione profesional" : "Primero cliente → proyecto → entregable"} />
                </VSelectTrigger>
                <SelectContent>
                  {profesionalesDisponibles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre_completo} ({p.cargo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>
      {categoria && cupoInfo && (
        <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 text-[12px] text-t700">
          Profesional seleccionado · categoría <span className="font-mono font-semibold">{categoria}</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-t600">
            Presup.: <span className="font-mono text-t800">{cupoInfo.presupuesto.toFixed(1)}</span> h · Consumido hist.
            (cerrado): <span className="font-mono text-t800">{cupoInfo.consumidoHistoricoCerrado.toFixed(1)}</span> h ·
            Asignado ACTIVO: <span className="font-mono text-t800">{cupoInfo.asignadoActivo.toFixed(1)}</span> h ·
            <span className="font-semibold text-t900"> Saldo real (cat.): </span>
            <span
              className={`font-mono font-semibold ${
                cupoInfo.presupuesto - cupoInfo.consumidoHistoricoCerrado - (gastoActivoCategoriaSeleccionada ?? 0) < 0
                  ? "text-[#B91C1C]"
                  : "text-t800"
              }`}
            >
              {(
                cupoInfo.presupuesto -
                cupoInfo.consumidoHistoricoCerrado -
                (gastoActivoCategoriaSeleccionada ?? 0)
              ).toFixed(1)}
            </span>{" "}
            h ·<span className="font-semibold text-t900"> Cupo nuevas asig.: </span>
            <span
              className={`font-mono font-semibold ${cupoInfo.disponibleReal <= 0 ? "text-[#B45309]" : "text-[#047857]"}`}
            >
              {cupoInfo.disponibleReal.toFixed(1)}
            </span>{" "}
            h
          </span>
          <span className="mt-1 block text-[10px] text-t500">
            Desglose por las cuatro categorías en la tabla superior (columnas <span className="font-medium">Saldo real
            (cat.)</span> y <span className="font-medium">Cupo nuevas asig.</span>).
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Rol en entregable" error={errors.rol_en_entregable?.message} required>
          <Select
            value={watch("rol_en_entregable")}
            onValueChange={(v) => setValue("rol_en_entregable", v as AsignacionHora["rol_en_entregable"], { shouldDirty: true })}
          >
            <VSelectTrigger>
              <SelectValue />
            </VSelectTrigger>
            <SelectContent>
              <SelectItem value="LIDER">Líder</SelectItem>
              <SelectItem value="APOYO">Apoyo</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Horas comprometidas" error={errors.horas_comprometidas?.message} required>
          <VInput {...register("horas_comprometidas")} type="number" step="0.1" min="0.01" />
        </Field>
        <Field label="Inicio vigencia" error={errors.fecha_inicio_vigencia?.message} required>
          <VDate {...register("fecha_inicio_vigencia")} />
        </Field>
      </div>
      {propuestaSobrecupoCreacion && cupoInfo && categoria ? (
        <div className="rounded-r8 border border-rose-500/55 bg-rose-500/10 px-4 py-3 text-[12px] leading-snug text-rose-950 shadow-xs">
          <p className="font-semibold text-rose-950">Esta asignación supera el cupo disponible de la categoría.</p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] text-rose-900/95">
            <li>
              Cupo disponible:{" "}
              <span className="font-mono font-semibold">{cupoInfo.disponibleReal.toFixed(1)}</span> h
            </li>
            <li>
              Horas a asignar: <span className="font-mono font-semibold">{horasNumCreacion.toFixed(1)}</span> h
            </li>
            <li>
              Sobrecupo:{" "}
              <span className="font-mono font-semibold">
                {(horasNumCreacion - cupoInfo.disponibleReal).toFixed(1)}
              </span>{" "}
              h
            </li>
          </ul>
          <p className="mt-2 text-[11px] text-rose-900/95">
            La asignación se creará como sobrecupo y quedará reflejada en alertas de déficit/sobreconsumo. No modifica el
            presupuesto del entregable.
          </p>
          {!canCrearAsignacionSobrecupo(role ?? "LECTOR") ? (
            <p className="mt-2 rounded-r6 border border-amber-400/60 bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-950">
              Solo un administrador puede confirmar una creación sobre cupo. Ajuste las horas al cupo disponible o
              solicite a un ADMIN.
            </p>
          ) : null}
        </div>
      ) : null}
      <Dialog
        open={sobrecupoModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSobrecupoModalOpen(false);
            setPendingSobrecupo(null);
            setSobrecupoComentario("");
            setSobrecupoCodigo("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold text-rose-950">Crear asignación sobre cupo</DialogTitle>
            <DialogDescription className="text-[12px] text-t600">
              Revise los datos y deje trazabilidad. No se modificarán las horas presupuestadas del entregable.
            </DialogDescription>
          </DialogHeader>
          {pendingSobrecupo && selectedEnt && selectedProf ? (
            <div className="space-y-3 text-[12px] text-t800">
              <div className="rounded-r8 border border-bdr bg-surface2 px-3 py-2">
                <div>
                  <span className="font-semibold text-t600">Proyecto:</span>{" "}
                  {proyectoParaBloque1
                    ? `${proyectoParaBloque1.codigo} · ${proyectoParaBloque1.nombre}`
                    : selectedEnt.proyecto_id}
                </div>
                <div>
                  <span className="font-semibold text-t600">Entregable:</span> {selectedEnt.nombre}
                </div>
                <div>
                  <span className="font-semibold text-t600">Profesional:</span> {selectedProf.nombre_completo}
                </div>
                <div>
                  <span className="font-semibold text-t600">Categoría:</span>{" "}
                  <span className="font-mono">{selectedProf.cargo}</span>
                </div>
                <div>
                  <span className="font-semibold text-t600">Cupo disponible:</span>{" "}
                  <span className="font-mono">{pendingSobrecupo.cupoDisponible.toFixed(1)}</span> h
                </div>
                <div>
                  <span className="font-semibold text-t600">Horas a asignar:</span>{" "}
                  <span className="font-mono">{pendingSobrecupo.horas.toFixed(1)}</span> h
                </div>
                <div>
                  <span className="font-semibold text-t600">Sobrecupo:</span>{" "}
                  <span className="font-mono font-semibold text-rose-800">{pendingSobrecupo.sobrecupo.toFixed(1)}</span> h
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-t700">
                  Comentario de autorización <span className="text-rose-600">*</span>
                </Label>
                <Textarea
                  value={sobrecupoComentario}
                  onChange={(e) => setSobrecupoComentario(e.target.value)}
                  placeholder="Motivo operativo u operación histórica (obligatorio)"
                  className="min-h-[88px] text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-t700">
                  Escriba SOBRECUPO para confirmar <span className="text-rose-600">*</span>
                </Label>
                <Input
                  value={sobrecupoCodigo}
                  onChange={(e) => setSobrecupoCodigo(e.target.value)}
                  placeholder="SOBRECUPO"
                  className="font-mono text-[13px]"
                  autoComplete="off"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSobrecupoModalOpen(false);
                setPendingSobrecupo(null);
                setSobrecupoComentario("");
                setSobrecupoCodigo("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-rose-700 text-white hover:bg-rose-800"
              onClick={confirmarModalSobrecupo}
              disabled={!pendingSobrecupo}
            >
              Confirmar sobrecupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FormActions
        onCancel={handleCancelCreacion}
        onSubmit={handleSubmit(onSubmit)}
        submitLabel="Crear asignación"
        isDirty={isDirty}
      />
    </form>
  );
}

function AsignacionHoraEditFormPanel({
  editItem,
  onSaved,
  onCancel,
  onBusinessError,
}: {
  editItem: AsignacionHora;
  onSaved: () => void;
  onCancel: () => void;
  onBusinessError: (msg: string) => void;
}) {
  const { clientes, entregables, proyectos, profesionales, asignaciones_horas, registro_horas, updateAsignacionHora } =
    useAppData();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<AsignacionHoraEditForm>({
    resolver: zodResolver(asignacionHoraEditSchema) as Resolver<AsignacionHoraEditForm>,
    defaultValues: {
      rol_en_entregable: editItem.rol_en_entregable,
      horas_comprometidas: editItem.horas_comprometidas,
    },
  });

  const ent = entregables.find((e) => e.id === editItem.entregable_id);
  const prof = profesionales.find((p) => p.id === editItem.profesional_id);
  const proyectoDeEnt = useMemo(
    () => (ent ? proyectos.find((p) => p.id === ent.proyecto_id) : undefined),
    [ent, proyectos],
  );
  const proyectoCodigo = proyectoDeEnt?.codigo ?? "—";
  const contextoProyectoEntregableBloque1Edit = useMemo(
    () => textoProyectoSlashEntregableParaAlerta(proyectoDeEnt, ent),
    [proyectoDeEnt, ent],
  );

  const saldoGlobalCategoria = useMemo(() => {
    if (!ent) return null;
    return desgloseCupoCategoriaEntregable(ent, asignaciones_horas, editItem.categoria);
  }, [ent, editItem.categoria, asignaciones_horas]);

  /** Cupo contextual: misma función que valida updateAsignacionHora (excluye esta fila al sumar ACTIVAS). */
  const cupoMaxEditableEstaFila = useMemo(() => {
    if (!ent) return null;
    return desgloseCupoCategoriaEntregable(ent, asignaciones_horas, editItem.categoria, editItem.id);
  }, [ent, editItem.categoria, editItem.id, asignaciones_horas]);

  const gastadasVigentesEdit = useMemo(() => {
    if (editItem.estado !== "ACTIVA") return 0;
    return sumaHorasGastadasRealesAsignacionBloque2(
      editItem,
      asignaciones_horas,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
      fechaHoyIsoLocal(),
    );
  }, [editItem, asignaciones_horas, registro_horas, entregables, proyectos, profesionales]);

  const pendientesVigentesEdit = horasPendientesAsignacionBloque2(editItem.horas_comprometidas, gastadasVigentesEdit);
  const semaforoEdit = semaforoVsCompromiso(gastadasVigentesEdit, editItem.horas_comprometidas);

  const alertasGastoSinCoberturaEdit = useMemo(() => {
    if (!ent) return [];
    const hoy = fechaHoyIsoLocal();
    return aggregateGastoSinAsignacionActiva(
      registro_horas,
      asignaciones_horas,
      entregables,
      proyectos,
      profesionales,
      hoy,
    ).filter((x) => x.entregable_id === ent.id);
  }, [ent, registro_horas, asignaciones_horas, entregables, proyectos, profesionales]);

  const gastoActivoSumaCategoriaEntregableEdit = useMemo(() => {
    if (!ent) return 0;
    return sumaGastoActivoActualPorCategoria(
      ent.id,
      editItem.categoria,
      asignaciones_horas,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
      fechaHoyIsoLocal(),
    );
  }, [ent, editItem.categoria, asignaciones_horas, registro_horas, entregables, proyectos, profesionales]);

  if (editItem.estado !== "ACTIVA") {
    return (
      <div className="space-y-4">
        {ent ? (
          <div className="space-y-3">
            <AsignacionGastoSinCoberturaList
              rows={alertasGastoSinCoberturaEdit}
              profesionales={profesionales}
              contextoProyectoEntregable={contextoProyectoEntregableBloque1Edit}
            />
            <AsignacionProfesionalesExcedidosBanner
              entregableId={ent.id}
              asignaciones_horas={asignaciones_horas}
              registro_horas={registro_horas}
              entregables={entregables}
              proyectos={proyectos}
              profesionales={profesionales}
            />
            <AsignacionCategoriasSobreconsumidasVsPresupuestoBanner
              ent={ent}
              clientes={clientes}
              asignaciones_horas={asignaciones_horas}
              registro_horas={registro_horas}
              entregables={entregables}
              proyectos={proyectos}
              profesionales={profesionales}
            />
            <AsignacionLiderEntregableResumen ent={ent} profesionales={profesionales} asignaciones_horas={asignaciones_horas} />
            <AsignacionOperativoEntregableResumen
              ent={ent}
              asignaciones_horas={asignaciones_horas}
              registro_horas={registro_horas}
              entregables={entregables}
              proyectos={proyectos}
              profesionales={profesionales}
            />
          </div>
        ) : null}
        <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 text-[12px] text-t700 space-y-2">
          <p className="text-[13px] font-semibold text-t900">Asignación cerrada (solo lectura)</p>
          <div>
            <span className="font-semibold">Entregable:</span> {ent?.nombre ?? "—"} ({proyectoCodigo})
          </div>
          <div>
            <span className="font-semibold">Profesional:</span> {prof?.nombre_completo ?? "—"} ({prof?.cargo ?? "—"})
          </div>
          <div>
            <span className="font-semibold">Horas comprometidas:</span>{" "}
            <span className="font-mono">{editItem.horas_comprometidas.toFixed(1)}</span>
          </div>
          <div>
            <span className="font-semibold">Fecha cierre:</span> {editItem.fecha_cierre ?? "—"}
          </div>
          {editItem.motivo_cierre ? (
            <div>
              <span className="font-semibold">Motivo / observación:</span> {editItem.motivo_cierre}
            </div>
          ) : null}
          <div>
            <span className="font-semibold">Horas gastadas imputadas al cierre:</span>{" "}
            <span className="font-mono">
              {editItem.horas_gastadas_imputadas_al_cierre != null
                ? editItem.horas_gastadas_imputadas_al_cierre.toFixed(1)
                : "—"}
            </span>
          </div>
          <div>
            <span className="font-semibold">Horas devueltas al cupo (snapshot):</span>{" "}
            <span className="font-mono">
              {editItem.horas_devueltas_presupuesto != null
                ? editItem.horas_devueltas_presupuesto.toFixed(1)
                : "—"}
            </span>
          </div>
        </div>
        <Button type="button" variant="outline" className="rounded-r8" onClick={onCancel}>
          Volver
        </Button>
      </div>
    );
  }

  const onSubmit: SubmitHandler<AsignacionHoraEditForm> = (data) => {
    const r = updateAsignacionHora(editItem.id, {
      horas_comprometidas: data.horas_comprometidas,
      rol_en_entregable: data.rol_en_entregable,
    });
    if (!r.ok) {
      onBusinessError(r.error);
      return;
    }
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-r8 border border-bdr bg-surface2 px-4 py-3 text-[12px] text-t700">
        <div>
          <span className="font-semibold">Entregable:</span> {ent?.nombre ?? "—"} ({proyectoCodigo})
        </div>
        <div>
          <span className="font-semibold">Profesional:</span> {prof?.nombre_completo ?? "—"} ({prof?.cargo ?? "—"})
        </div>
        <div>
          <span className="font-semibold">Categoría:</span> {editItem.categoria} (debe coincidir con el cargo; sin conversión en v1)
        </div>
        <div>
          <span className="font-semibold">Inicio vigencia:</span> {editItem.fecha_inicio_vigencia || "—"}
        </div>
        {saldoGlobalCategoria && (
          <p className="mt-2 text-[11px] leading-relaxed text-t600">
            <span className="font-semibold text-t800">Saldo real (cat.)</span> ({editItem.categoria}):{" "}
            <span
              className={`font-mono font-semibold ${
                saldoGlobalCategoria.presupuesto -
                  saldoGlobalCategoria.consumidoHistoricoCerrado -
                  gastoActivoSumaCategoriaEntregableEdit <
                0
                  ? "text-[#B91C1C]"
                  : "text-t800"
              }`}
            >
              {(
                saldoGlobalCategoria.presupuesto -
                saldoGlobalCategoria.consumidoHistoricoCerrado -
                gastoActivoSumaCategoriaEntregableEdit
              ).toFixed(1)}
            </span>{" "}
            h · <span className="font-semibold text-t800">Cupo nuevas asig.</span> ({editItem.categoria}):{" "}
            <span
              className={`font-mono font-semibold ${saldoGlobalCategoria.disponibleReal <= 0 ? "text-[#B45309]" : "text-[#047857]"}`}
            >
              {saldoGlobalCategoria.disponibleReal.toFixed(1)}
            </span>{" "}
            h — coincide con la columna <span className="font-medium">Cupo nuevas asig.</span> del resumen (todas las ACTIVAS
            cuentan en el comprometido). El tope al cambiar <em>este</em> compromiso va debajo del campo de horas.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 border-t border-bdr pt-2 text-[11px]">
          <span>
            Gasto real vigente:{" "}
            <span className="font-mono font-semibold">{gastadasVigentesEdit.toFixed(1)}</span> h
          </span>
          <span>
            Pendiente vs compromiso:{" "}
            <span className={`font-mono font-semibold ${pendientesVigentesEdit < 0 ? "text-[#B91C1C]" : ""}`}>
              {pendientesVigentesEdit.toFixed(1)}
            </span>{" "}
            h
          </span>
          <span className="inline-flex items-center gap-1.5">
            Semáforo (ACTIVA): <AsignacionSemaforoConsumo nivel={semaforoEdit} />
          </span>
        </div>
      </div>
      {ent ? (
        <div className="space-y-3">
          <AsignacionGastoSinCoberturaList
            rows={alertasGastoSinCoberturaEdit}
            profesionales={profesionales}
            contextoProyectoEntregable={contextoProyectoEntregableBloque1Edit}
          />
          <AsignacionProfesionalesExcedidosBanner
            entregableId={ent.id}
            asignaciones_horas={asignaciones_horas}
            registro_horas={registro_horas}
            entregables={entregables}
            proyectos={proyectos}
            profesionales={profesionales}
          />
          <AsignacionCategoriasSobreconsumidasVsPresupuestoBanner
            ent={ent}
            clientes={clientes}
            asignaciones_horas={asignaciones_horas}
            registro_horas={registro_horas}
            entregables={entregables}
            proyectos={proyectos}
            profesionales={profesionales}
          />
          <AsignacionLiderEntregableResumen ent={ent} profesionales={profesionales} asignaciones_horas={asignaciones_horas} />
          <AsignacionOperativoEntregableResumen
            ent={ent}
            asignaciones_horas={asignaciones_horas}
            registro_horas={registro_horas}
            entregables={entregables}
            proyectos={proyectos}
            profesionales={profesionales}
          />
        </div>
      ) : null}
      {!ent || entregableTienePresupuestoPorCategoriaNumerico(ent) ? null : (
        <div className="rounded-r8 border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-950">
          Este entregable no tiene horas L2 / P4 / P3 / P2 válidas en el maestro; revise el entregable antes de confiar en el cupo.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Rol en entregable" error={errors.rol_en_entregable?.message} required>
          <Select
            value={watch("rol_en_entregable")}
            onValueChange={(v) => setValue("rol_en_entregable", v as AsignacionHora["rol_en_entregable"], { shouldDirty: true })}
          >
            <VSelectTrigger>
              <SelectValue />
            </VSelectTrigger>
            <SelectContent>
              <SelectItem value="LIDER">Líder</SelectItem>
              <SelectItem value="APOYO">Apoyo</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Horas comprometidas" error={errors.horas_comprometidas?.message} required>
          <VInput {...register("horas_comprometidas")} type="number" step="0.1" min="0.01" />
          {cupoMaxEditableEstaFila ? (
            <p className="mt-1.5 rounded-r6 border border-bdr bg-surface2 px-2.5 py-2 text-[11px] leading-snug text-t700">
              <span className="font-semibold text-t900">Cupo máximo editable en esta fila:</span> hasta{" "}
              <span
                className={`font-mono font-semibold ${cupoMaxEditableEstaFila.disponibleReal <= 0 ? "text-[#B45309]" : "text-[#047857]"}`}
              >
                {cupoMaxEditableEstaFila.disponibleReal.toFixed(1)}
              </span>{" "}
              h de compromiso total en esta asignación (cupo de categoría sin descontar el compromiso actual de esta fila,
              igual que la validación al guardar). No es el saldo global: si el saldo global es 0, aquí solo podrá
              redistribuir entre filas sin aumentar el total de la categoría.
            </p>
          ) : null}
        </Field>
      </div>
      <FormActions onCancel={onCancel} onSubmit={handleSubmit(onSubmit)} submitLabel="Actualizar" isDirty={isDirty} />
    </form>
  );
}

export function AsignacionHoraFormPanel({
  editItem,
  onSaved,
  onCancel,
  onBusinessError,
  prefillClienteProyectoEntregable,
}: {
  editItem?: AsignacionHora | null;
  onSaved: () => void;
  onCancel: () => void;
  onBusinessError: (msg: string) => void;
  prefillClienteProyectoEntregable?: AsignacionHoraCreacionPrefill | null;
}) {
  if (editItem) {
    return (
      <AsignacionHoraEditFormPanel
        editItem={editItem}
        onSaved={onSaved}
        onCancel={onCancel}
        onBusinessError={onBusinessError}
      />
    );
  }
  return (
    <AsignacionHoraCreateFormPanel
      onSaved={onSaved}
      onCancel={onCancel}
      onBusinessError={onBusinessError}
      prefillClienteProyectoEntregable={prefillClienteProyectoEntregable ?? null}
    />
  );
}

/* ═══════════════════════════════════════════
   Cerrar asignación (Bloque 3)
   ═══════════════════════════════════════════ */

export function CerrarAsignacionDialog({
  open,
  asignacion,
  onConfirmClose,
  onCancel,
  onBusinessError,
}: {
  open: boolean;
  asignacion: AsignacionHora | null;
  onConfirmClose: () => void;
  onCancel: () => void;
  onBusinessError: (msg: string) => void;
}) {
  const {
    cerrarAsignacionHora,
    registro_horas,
    entregables,
    proyectos,
    profesionales,
    asignaciones_horas,
  } = useAppData();
  const [fechaCierre, setFechaCierre] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open && asignacion) {
      setFechaCierre(fechaHoyIsoLocal());
      setMotivo("");
    }
  }, [open, asignacion?.id]);

  const preview = useMemo(() => {
    if (!asignacion || !fechaCierre.trim()) return null;
    const fc = fechaCierre.trim();
    const gastoBruto = sumaHorasGastadasRealesEnVentana(
      asignacion,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
      fc,
    );
    const yaImputado = sumaHorasImputadasCierrePreviasProfEntregableCategoria(
      asignaciones_horas,
      asignacion.profesional_id,
      asignacion.entregable_id,
      asignacion.categoria,
      asignacion.id,
    );
    const imp = resolverImputacionIncrementalAlCierre({
      gastoBrutoEnVentana: gastoBruto,
      yaImputadoPreviamente: yaImputado,
      horasComprometidas: asignacion.horas_comprometidas,
    });
    const devueltas = horasDevueltasPresupuestoAlCierre(asignacion.horas_comprometidas, imp.horasGastadasImputadasAlCierre);
    return { gastoBruto, yaImputado, imp, devueltas };
  }, [
    asignacion,
    fechaCierre,
    registro_horas,
    entregables,
    proyectos,
    profesionales,
    asignaciones_horas,
  ]);

  const handleConfirm = () => {
    if (!asignacion) return;
    const r = cerrarAsignacionHora(asignacion.id, {
      fecha_cierre: fechaCierre.trim(),
      motivo_cierre: motivo.trim() || null,
    });
    if (!r.ok) {
      onBusinessError(r.error);
      return;
    }
    onConfirmClose();
  };

  const entNombre = asignacion ? entregables.find((e) => e.id === asignacion.entregable_id)?.nombre : "";
  const profNombre = asignacion
    ? profesionales.find((p) => p.id === asignacion.profesional_id)?.nombre_completo
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-t900">Cerrar asignación</DialogTitle>
          <DialogDescription className="text-[13px] text-t500">
            Se imputará al presupuesto histórico el gasto incremental en la ventana (respecto a otras asignaciones cerradas del mismo profesional, entregable y categoría), con tope a las horas comprometidas. No se modificarán los registros de horas.
          </DialogDescription>
        </DialogHeader>
        {asignacion ? (
          <div className="space-y-3 text-[12px] text-t700">
            <p>
              <span className="font-semibold">Entregable:</span> {entNombre ?? "—"}
            </p>
            <p>
              <span className="font-semibold">Profesional:</span> {profNombre ?? "—"}
            </p>
            <p>
              <span className="font-semibold">Horas comprometidas:</span>{" "}
              <span className="font-mono">{asignacion.horas_comprometidas.toFixed(1)}</span>
            </p>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
                Fecha de cierre <span className="text-[#B91C1C]">*</span>
              </Label>
              <Input
                type="date"
                value={fechaCierre}
                onChange={(e) => setFechaCierre(e.target.value)}
                className="rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
                Motivo u observación (opcional)
              </Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: cierre por fin de etapa"
                className="min-h-[72px] rounded-r8 border-[#C8CCDB] text-[13px]"
              />
            </div>
            {preview ? (
              <div className="rounded-r8 border border-bdr bg-surface2 px-3 py-2 text-[12px]">
                <span className="font-semibold">Vista previa al cierre</span>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-t600">
                  <li>
                    Gasto bruto en ventana (RegistroHora):{" "}
                    <span className="font-mono font-semibold">{preview.gastoBruto.toFixed(1)}</span>
                  </li>
                  <li>
                    Ya imputado en otras CERRADAS (mismo prof./entreg./cat.):{" "}
                    <span className="font-mono font-semibold">{preview.yaImputado.toFixed(1)}</span>
                  </li>
                  <li>
                    Gasto incremental:{" "}
                    <span className="font-mono font-semibold">{preview.imp.gastoIncremental.toFixed(1)}</span>
                  </li>
                  <li>
                    Horas imputadas al cierre (tope comprometidas):{" "}
                    <span className="font-mono font-semibold">{preview.imp.horasGastadasImputadasAlCierre.toFixed(1)}</span>
                  </li>
                  <li>
                    Horas devueltas al cupo: <span className="font-mono font-semibold">{preview.devueltas.toFixed(1)}</span>
                  </li>
                  {preview.imp.excesoOperativoSobreCompromiso > 1e-6 ? (
                    <li className="text-[11px] text-t500">
                      Exceso operativo vs compromiso (no imputado al histórico):{" "}
                      <span className="font-mono font-semibold">
                        {preview.imp.excesoOperativoSobreCompromiso.toFixed(1)}
                      </span>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="rounded-r8 border-bdr bg-white px-5 py-2 text-[13px] font-semibold text-t700 hover:bg-surface2"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!asignacion || !fechaCierre.trim()}
            className="rounded-r8 bg-[#0D9488] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#0F766E]"
          >
            Confirmar cierre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════
   Delete Confirmation Dialog
   ═══════════════════════════════════════════ */

export function DeleteDialog({ open, entityName, onConfirm, onCancel }: {
  open: boolean;
  entityName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-t900">¿Eliminar registro?</DialogTitle>
          <DialogDescription className="text-[13px] text-t500">
            Estás a punto de eliminar <strong>{entityName}</strong>. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} className="rounded-r8 border-bdr bg-white px-5 py-2 text-[13px] font-semibold text-t700 hover:bg-surface2">
            Cancelar
          </Button>
          <Button onClick={onConfirm} className="rounded-r8 bg-[#B91C1C] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#991B1B]">
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProyectoDialog({
  open,
  proyectoLabel,
  entregablesAEliminar,
  asignacionesCount,
  registrosHorasCount,
  registrosHorasTotalHoras,
  entregablesConGasto,
  confirmText,
  onChangeConfirmText,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  proyectoLabel: string;
  entregablesAEliminar: { id: string; nombre: string }[];
  asignacionesCount: number;
  registrosHorasCount: number;
  registrosHorasTotalHoras: number;
  entregablesConGasto: { id: string; nombre: string; horas: number }[];
  confirmText: string;
  onChangeConfirmText: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const bloqueadoPorGasto = registrosHorasCount > 0;
  const puedeBorrar = !bloqueadoPorGasto && confirmText.trim() === "BORRAR";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-t900">Eliminar proyecto</DialogTitle>
          {bloqueadoPorGasto ? (
            <DialogDescription className="text-[13px] text-t500">
              {MENSAJE_BLOQUEO_PROYECTO_POR_REGISTRO_HORAS}
            </DialogDescription>
          ) : (
            <DialogDescription className="text-[13px] text-t500">
              Si elimina este proyecto, también se eliminarán los entregables asociados. ¿Desea continuar?
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 text-[13px] text-t700">
          <div className="rounded-r8 border border-bdr bg-surface2 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-t500">Proyecto</div>
            <div className="font-medium">{proyectoLabel}</div>
          </div>

          {bloqueadoPorGasto ? (
            <div className="rounded-r8 border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[#7F1D1D]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em]">Bloqueado por gasto real</div>
              <div className="mt-1">
                Registros asociados: <span className="font-mono font-semibold">{registrosHorasCount}</span> ·
                {" "}Horas totales: <span className="font-mono font-semibold">{registrosHorasTotalHoras.toFixed(1)}</span>
              </div>
              {entregablesConGasto.length > 0 ? (
                <div className="mt-2 text-[12px]">
                  <div className="font-semibold">Entregables con gasto (resumen)</div>
                  <ul className="mt-1 list-disc pl-5">
                    {entregablesConGasto.slice(0, 8).map((e) => (
                      <li key={e.id}>
                        {e.nombre} — <span className="font-mono">{e.horas.toFixed(1)}</span> hrs
                      </li>
                    ))}
                    {entregablesConGasto.length > 8 ? (
                      <li className="text-t500">… y {entregablesConGasto.length - 8} más</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="rounded-r8 border border-bdr bg-surface2 px-3 py-2 text-t600">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <div>
                    Entregables asociados: <span className="font-mono font-semibold">{entregablesAEliminar.length}</span>
                  </div>
                  <div>
                    Asignaciones asociadas: <span className="font-mono font-semibold">{asignacionesCount}</span>
                  </div>
                </div>
                {entregablesAEliminar.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-[12px]">
                    {entregablesAEliminar.slice(0, 8).map((e) => (
                      <li key={e.id}>{e.nombre}</li>
                    ))}
                    {entregablesAEliminar.length > 8 ? (
                      <li className="text-t500">… y {entregablesAEliminar.length - 8} más</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>

              <div className="rounded-r8 border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[#92400E]">
                Esta acción no se puede deshacer.
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
                  Confirmación escrita (escriba exactamente <span className="font-mono">BORRAR</span>)
                </Label>
                <Input
                  value={confirmText}
                  onChange={(e) => onChangeConfirmText(e.target.value)}
                  placeholder="BORRAR"
                  className="rounded-r8 border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px] shadow-xs focus:border-[#B91C1C] focus:shadow-[0_0_0_3px_rgba(185,28,28,0.12)] focus-visible:ring-0"
                />
                <p className="text-[11px] text-t400">
                  Solo se permitirá borrar si no existen registros de horas asociados.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="rounded-r8 border-bdr bg-white px-5 py-2 text-[13px] font-semibold text-t700 hover:bg-surface2"
          >
            {bloqueadoPorGasto ? "Entendido" : "Cancelar"}
          </Button>
          {!bloqueadoPorGasto ? (
            <Button
              onClick={onConfirm}
              disabled={!puedeBorrar}
              className="rounded-r8 bg-[#B91C1C] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#991B1B]"
            >
              Eliminar proyecto
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { CurvaObjetivoAnualFormPanel } from "./CurvaObjetivoAnualFormPanel";
