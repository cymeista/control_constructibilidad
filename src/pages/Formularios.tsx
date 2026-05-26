import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router";
import { ClipboardList, FileUp, LayoutGrid, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SectionHeader from "@/components/SectionHeader";
import {
  useAppData,
  type Cliente,
  type Profesional,
  type PmInterno,
  type Proyecto,
  type Entregable,
  type AsignacionHora,
  type AsignacionHoraCategoria,
  type RegistroHora,
  type Pipeline,
  type CargaMensual,
  type CurvaObjetivoAnual,
} from "@/context/AppDataContext";
import { isClienteReferencedByPipeline, isClienteReferencedByProyectos } from "@/clientes/clienteValidation";
import { isProfesionalReferenced } from "@/profesionales/profesionalValidation";
import {
  isPmInternoReferencedByPipeline,
  isPmInternoReferencedByProyectos,
} from "@/pm_internos/pmInternoValidation";
import { formatoResumenMonedaProyecto } from "@/proyectos/proyectoMoneda";
import { analizarBloqueoEliminacionProyectos } from "@/proyectos/proyectoEliminacionRegla";

import EntitySelector, { type EntityType } from "@/components/formularios/EntitySelector";
import EntityTable from "@/components/formularios/EntityTable";
import { MobileCardRow } from "@/components/formularios/EntityMobileCardRows";
import {
  ClienteFormPanel,
  ProfesionalFormPanel,
  PmInternoFormPanel,
  ProyectoFormPanel,
  EntregableFormPanel,
  RegistroHoraFormPanel,
  PipelineFormPanel,
  CargaMensualFormPanel,
  AsignacionHoraFormPanel,
  type AsignacionHoraCreacionPrefill,
  CurvaObjetivoAnualFormPanel,
  CerrarAsignacionDialog,
  DeleteDialog,
  DeleteProyectoDialog,
  textoProyectoSlashEntregableParaAlerta,
} from "@/components/formularios/forms";
import RegistroHoraImportDialog from "@/components/RegistroHoraImportDialog";
import { EntregableRedistribuirHorasTrigger } from "@/components/EntregableRedistribuirHorasTrigger";
import DataTable from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  fechaHoyIsoLocal,
  horasPendientesAsignacionBloque2,
  listarProfesionalesExcedidosEnEntregable,
  sumaHorasGastadasRealesAsignacionBloque2,
} from "@/entregables/asignacionHoraConsumo";
import {
  detectarBrechasHistoricasAsignacion,
  type BrechaHistoricaParResultado,
  type CategoriaBrechaHistorica,
} from "@/entregables/asignacionBrechasHistoricasDetector";
import { buildMapaAlertaNormalizacionPorRegistroId } from "@/entregables/registroHoraNormalizacionFila";
import NormalizarSinAsignacionDialog from "@/components/NormalizarSinAsignacionDialog";
import {
  aggregateGastoSinAsignacionActiva,
  semaforoVsCompromiso,
  type SemaforoAsignacionConsumo,
} from "@/entregables/asignacionHoraBloque4";
import {
  listarResumenAsignacionTripleFase1,
  listarBloque4VentanasAsignacionSolapadas,
} from "@/entregables/asignacionAlertasBloque4Formularios";
import {
  entregableEstadoEsCompletado,
  listarCategoriasSobreconsumidasVsPresupuestoEntregable,
} from "@/entregables/asignacionHoraRules";
import { useAuth } from "@/security/AuthContext";
import { canMarcarAlertasOperativasRevisadas } from "@/security/permissions";
import {
  claveAlertaBloque1,
  claveAlertaBloque2,
  claveAlertaBloque3,
  claveAlertaBloque4GastoVsAsignado,
  claveAlertaBloque4VentanasSolapadas,
  claveAlertaFase1GastoSinAsignacion,
  mapaAlertasRevisadasPorClave,
  MOTIVO_REVISION_OPCIONES,
  type EstadoAlertaRevisada,
  type MotivoRevisionPreset,
  type TipoAlertaOperativa,
} from "@/alertas/alertasOperativasRevisadas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Listado Registro de Horas: línea compacta fase/tarea · nombre (solo nombre si faltan ambos códigos). */
function registroHoraEntregableDisplayLine(ent: Entregable): string {
  const f = (ent.fase_codigo ?? "").trim();
  const t = (ent.tarea_codigo ?? "").trim();
  const nombre = (ent.nombre ?? "").trim();
  if (!f && !t) return nombre || "—";
  return `${f} / ${t} · ${nombre}`;
}

function registroHoraTablaSearchBlob(
  r: RegistroHora,
  profesionales: Profesional[],
  proyectos: Proyecto[],
  entregables: Entregable[],
): string {
  const prof = profesionales.find((p) => p.id === r.profesional_id);
  const pr = r.proyecto_id ? proyectos.find((p) => p.id === r.proyecto_id) : undefined;
  const ent = r.entregable_id ? entregables.find((e) => e.id === r.entregable_id) : undefined;
  return [
    prof?.nombre_completo,
    prof?.codigo,
    pr?.codigo,
    pr?.nombre,
    ent?.nombre,
    (ent?.fase_codigo ?? "").trim(),
    (ent?.tarea_codigo ?? "").trim(),
    r.proyecto_id,
    r.entregable_id,
  ]
    .filter((x) => x != null && String(x).trim() !== "")
    .join(" ");
}

function TablaAsignacionSemaforoCell({
  estado,
  gastadas,
  comprometidas,
}: {
  estado: AsignacionHora["estado"];
  gastadas: number;
  comprometidas: number;
}) {
  if (estado !== "ACTIVA") {
    return (
      <span className="text-[11px] text-t400" title="Semáforo solo para asignaciones ACTIVAS">
        —
      </span>
    );
  }
  const nivel = semaforoVsCompromiso(gastadas, comprometidas);
  if (nivel === "neutral") {
    return <span className="text-[11px] text-t400">—</span>;
  }
  const meta: Record<Exclude<SemaforoAsignacionConsumo, "neutral">, { bg: string; title: string }> = {
    verde: { bg: "#16a34a", title: "Gasto bajo el 70% del comprometido" },
    amarillo: { bg: "#ca8a04", title: "Gasto entre el 70% y el 100% del comprometido" },
    rojo: { bg: "#dc2626", title: "Gasto por encima del comprometido (alerta)" },
  };
  const m = meta[nivel];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: m.bg }}
        title={m.title}
      />
      <span className="text-[10px] font-semibold uppercase text-t600">{nivel}</span>
    </span>
  );
}

const fmtNumBrecha = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const LABEL_CATEGORIA_BRECHA: Record<CategoriaBrechaHistorica, string> = {
  SIN_ASIGNACION: "Sin asignación",
  EXCESO_SOBRE_ASIGNADO: "Exceso sobre asignado",
  PARCIALMENTE_CUBIERTO: "Parcialmente cubierto",
  CUBIERTO: "Cubierto",
};

const LABEL_TIPO_ALERTA_OPERATIVA: Record<TipoAlertaOperativa, string> = {
  BLOQUE_1_SIN_COBERTURA: "Fuera de ventana de asignación",
  BLOQUE_2_EXCESO_COMPROMISO: "Exceso por ventana en asignaciones",
  BLOQUE_3_SOBRECONSUMO_CATEGORIA: "La categoría supera el presupuesto",
  BLOQUE_4_GASTO_REAL_MAYOR_ASIGNADO: "Falta asignar horas",
  BLOQUE_4_VENTANAS_SOLAPADAS: "Ventanas de asignación solapadas",
  BLOQUE_FASE1_GASTO_SIN_ASIGNACION: "Gasto sin horas asignadas",
};

const CAT_STYLE_BRECHA: Record<CategoriaBrechaHistorica, { bg: string; text: string }> = {
  SIN_ASIGNACION: { bg: "#F1F5F9", text: "#475569" },
  EXCESO_SOBRE_ASIGNADO: { bg: "#FEF2F2", text: "#B91C1C" },
  PARCIALMENTE_CUBIERTO: { bg: "#FFF7ED", text: "#C2410C" },
  CUBIERTO: { bg: "#ECFDF5", text: "#047857" },
};

const entityNames: Record<EntityType, string> = {
  clientes: "Cliente",
  profesionales: "Profesional",
  pm_internos: "PM Interno",
  proyectos: "Proyecto",
  entregables: "Entregable",
  asignaciones_horas: "Asignación de horas",
  registro_horas: "Registro de Horas",
  pipeline: "Pipeline",
  carga_mensual: "Carga Mensual",
  curvas_objetivo_anual: "Curva objetivo anual",
};

const entityColors: Record<EntityType, string> = {
  clientes: "#4F46E5",
  profesionales: "#047857",
  pm_internos: "#0F766E",
  proyectos: "#3730A3",
  entregables: "#6366F1",
  asignaciones_horas: "#0D9488",
  registro_horas: "#B45309",
  pipeline: "#8B5CF6",
  carga_mensual: "#0EA5E9",
  curvas_objetivo_anual: "#0D9488",
};

/** Solo listado Formularios → Asignaciones: corte por estado, sin alterar datos. */
type AsignacionesListadoEstadoFiltro = "todas" | "activas" | "cerradas";

/** Solo CRUD Formularios → Entregables: filtro de visibilidad sin tocar lógica de negocio de estado. */
type FiltroVisibilidadEntregablesCrud =
  | "todos"
  | "ocultar_no_iniciado"
  | "solo_completados"
  | "solo_activos";

function entregableEsNoIniciado(e: Entregable): boolean {
  const s = String(e.estado);
  return s === "NO_INICIADO" || s === "No Iniciado";
}

function entregableEsCompletado(e: Entregable): boolean {
  const s = String(e.estado);
  return s === "COMPLETADO" || s === "Completado";
}

function entregableEsActivoCrud(e: Entregable): boolean {
  return !entregableEsNoIniciado(e) && !entregableEsCompletado(e);
}

function filtrarEntregablesCrud(
  lista: Entregable[],
  modo: FiltroVisibilidadEntregablesCrud,
): Entregable[] {
  switch (modo) {
    case "todos":
      return lista;
    case "ocultar_no_iniciado":
      return lista.filter((e) => !entregableEsNoIniciado(e));
    case "solo_completados":
      return lista.filter((e) => entregableEsCompletado(e));
    case "solo_activos":
      return lista.filter((e) => entregableEsActivoCrud(e));
    default:
      return lista;
  }
}

/** `editItem` es compartido entre entidades; solo bloquear prefill si se edita una asignación real. */
function editItemEsAsignacionHora(item: unknown): item is AsignacionHora {
  if (item == null || typeof item !== "object") return false;
  const o = item as AsignacionHora;
  return (
    typeof o.id === "string" &&
    (o.estado === "ACTIVA" || o.estado === "CERRADA") &&
    typeof o.horas_comprometidas === "number"
  );
}

export default function Formularios() {
  const [activeEntity, setActiveEntity] = useState<EntityType>("clientes");
  /** Subvista solo para entidad Registro de Horas: operativo (form + tabla) vs auditoría histórica de brechas. */
  const [vistaRegistroHoras, setVistaRegistroHoras] = useState<"operativo" | "auditoria">("operativo");
  const [filtroCategoriaBrecha, setFiltroCategoriaBrecha] = useState<"todas" | CategoriaBrechaHistorica>("SIN_ASIGNACION");
  const [editItem, setEditItem] = useState<unknown>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null);
  const [cerrarAsignacion, setCerrarAsignacion] = useState<AsignacionHora | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [registroHorasImportOpen, setRegistroHorasImportOpen] = useState(false);
  const [normalizarBrecha, setNormalizarBrecha] = useState<BrechaHistoricaParResultado | null>(null);
  const [filtroVisibilidadEntregables, setFiltroVisibilidadEntregables] =
    useState<FiltroVisibilidadEntregablesCrud>("todos");
  /** Listado asignaciones: filtros solo UI (por defecto Activas = foco operativo). */
  const [asignacionesListadoProfesionalId, setAsignacionesListadoProfesionalId] = useState<string>("");
  const [asignacionesListadoEstado, setAsignacionesListadoEstado] =
    useState<AsignacionesListadoEstadoFiltro>("activas");
  /** Filtros contextuales (solo lectura) para navegación desde `Dashboard/Proyectos`. */
  const [asignacionesListadoProyectoId, setAsignacionesListadoProyectoId] = useState<string>("");
  const [asignacionesListadoEntregableId, setAsignacionesListadoEntregableId] = useState<string>("");
  const [asignacionesListadoClienteId, setAsignacionesListadoClienteId] = useState<string>("");
  /** Bloque 3 listado global: por defecto oculta filas de entregables completados (solo vista). */
  const mostrarBloque3HistoricosCompletados = false;
  /** Vista principal: ocultar alertas ya marcadas como revisadas/archivadas. */
  const [mostrarAlertasRevisadas, setMostrarAlertasRevisadas] = useState(false);
  const [marcarAlertaDraft, setMarcarAlertaDraft] = useState<null | {
    tipo: TipoAlertaOperativa;
    clave_alerta: string;
    proyecto_id: string;
    entregable_id: string;
    profesional_id: string | null;
    categoria: AsignacionHora["categoria"] | null;
    descripcion: string;
    proyecto_label: string;
    entregable_label: string;
    profesional_label: string | null;
    categoria_label: string | null;
  }>(null);
  const [marcarMotivo, setMarcarMotivo] = useState<MotivoRevisionPreset>("PROYECTO_CERRADO_HISTORICO");
  const [marcarEstado, setMarcarEstado] = useState<EstadoAlertaRevisada>("REVISADA");
  const [marcarComentario, setMarcarComentario] = useState("");

  const [searchParams] = useSearchParams();
  const { key: locationKey } = useLocation();
  const navigate = useNavigate();
  const data = useAppData();
  const { role, user } = useAuth();
  const puedeMarcarRevisionAlerta = canMarcarAlertasOperativasRevisadas(role ?? "LECTOR");

  const entityParam = searchParams.get("entity");
  const focusParam = searchParams.get("focus");
  const proyectoIdParam = searchParams.get("proyecto_id") ?? "";
  const entregableIdParam = searchParams.get("entregable_id") ?? "";
  const clienteIdParam = searchParams.get("cliente_id") ?? "";
  const profesionalIdParam = searchParams.get("profesional_id") ?? "";
  const horasSugeridasParam = searchParams.get("horas_sugeridas") ?? "";

  const asignacionCreacionPrefill = useMemo((): AsignacionHoraCreacionPrefill | null => {
    if (entityParam !== "asignaciones_horas") return null;
    const eid = entregableIdParam.trim();
    const pidParam = proyectoIdParam.trim();
    const cidParam = clienteIdParam.trim();
    const profPre = profesionalIdParam.trim();
    const hsRaw = horasSugeridasParam.trim().replace(",", ".");
    const horasSugeridas =
      hsRaw && Number.isFinite(Number(hsRaw)) && Number(hsRaw) > 0
        ? Math.round(Number(hsRaw) * 10) / 10
        : undefined;
    const profOk = profPre && data.profesionales.some((p) => p.id === profPre) ? profPre : undefined;

    const extras = { profesionalId: profOk, horasSugeridas };

    if (eid) {
      const ent = data.entregables.find((e) => e.id === eid);
      if (!ent) return null;
      const pr = data.proyectos.find((p) => p.id === ent.proyecto_id);
      if (!pr) return null;
      if (pidParam && pidParam !== ent.proyecto_id) return null;
      if (cidParam && cidParam !== pr.cliente_id) return null;
      return { clienteId: pr.cliente_id, proyectoId: pr.id, entregableId: ent.id, ...extras };
    }
    if (pidParam) {
      const pr = data.proyectos.find((p) => p.id === pidParam);
      if (!pr) return null;
      if (cidParam && cidParam !== pr.cliente_id) return null;
      return { clienteId: pr.cliente_id, proyectoId: pr.id, entregableId: "", ...extras };
    }
    return null;
  }, [
    entityParam,
    entregableIdParam,
    proyectoIdParam,
    clienteIdParam,
    profesionalIdParam,
    horasSugeridasParam,
    data.entregables,
    data.proyectos,
    data.profesionales,
  ]);

  /** Tras Cancelar creación/edición: no volver a aplicar prefill hasta nueva entrada (p. ej. otra navegación desde Dashboard). */
  const [asignacionFormPrefillDismissed, setAsignacionFormPrefillDismissed] = useState(false);
  const prevAsignacionPrefillNavRef = useRef<{ key: string; entity: string | null } | null>(null);
  useEffect(() => {
    const prev = prevAsignacionPrefillNavRef.current;
    if (entityParam === "asignaciones_horas") {
      const sameAsigSession =
        prev?.entity === "asignaciones_horas" && prev.key === locationKey;
      if (!sameAsigSession) {
        setAsignacionFormPrefillDismissed(false);
      }
    }
    prevAsignacionPrefillNavRef.current = { key: locationKey, entity: entityParam };
  }, [entityParam, locationKey]);

  const asignacionCreacionPrefillEfectivo = useMemo(() => {
    if (asignacionFormPrefillDismissed) return null;
    return asignacionCreacionPrefill;
  }, [asignacionFormPrefillDismissed, asignacionCreacionPrefill]);

  useEffect(() => {
    if (entityParam === "asignaciones_horas") {
      setActiveEntity("asignaciones_horas");
    }
  }, [entityParam]);

  useEffect(() => {
    if (entityParam !== "asignaciones_horas") return;
    setAsignacionesListadoProyectoId(proyectoIdParam);
    setAsignacionesListadoEntregableId(entregableIdParam);
    setAsignacionesListadoClienteId(clienteIdParam);
    // Entrada contextual: por defecto mostrar Activas + Cerradas para no perder contexto operativo/histórico.
    if (proyectoIdParam || entregableIdParam) {
      setAsignacionesListadoEstado("todas");
    }
  }, [entityParam, proyectoIdParam, entregableIdParam, clienteIdParam]);

  useEffect(() => {
    if (entityParam !== "entregables" || !focusParam) return;
    const row = data.entregables.find((e) => e.id === focusParam);
    if (row) {
      setActiveEntity("entregables");
      setEditItem(row);
    }
  }, [entityParam, focusParam, data.entregables]);

  const profesionalesOrdenadosNombre = useMemo(
    () => [...data.profesionales].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, "es")),
    [data.profesionales],
  );

  const proyectoById = useMemo(() => new Map(data.proyectos.map((p) => [p.id, p])), [data.proyectos]);

  const asignacionesProyectoOptions = useMemo(() => {
    const base = [{ value: "", label: "Todos los proyectos" }];
    const arr =
      asignacionesListadoClienteId && asignacionesListadoClienteId.trim()
        ? data.proyectos.filter((p) => p.cliente_id === asignacionesListadoClienteId)
        : data.proyectos;
    const opts = arr
      .map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nombre}` }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
    return [...base, ...opts];
  }, [data.proyectos, asignacionesListadoClienteId]);

  const asignacionesEntregableOptions = useMemo(() => {
    const base = [{ value: "", label: "Todos los entregables" }];
    const arr = asignacionesListadoProyectoId
      ? data.entregables.filter((e) => e.proyecto_id === asignacionesListadoProyectoId)
      : data.entregables;
    const opts = arr
      .map((e) => ({ value: e.id, label: e.nombre }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
    return [...base, ...opts];
  }, [data.entregables, asignacionesListadoProyectoId]);

  useEffect(() => {
    if (!asignacionesListadoEntregableId) return;
    if (asignacionesListadoProyectoId) {
      const ent = data.entregables.find((e) => e.id === asignacionesListadoEntregableId);
      if (ent && ent.proyecto_id !== asignacionesListadoProyectoId) {
        setAsignacionesListadoEntregableId("");
      }
    }
  }, [asignacionesListadoEntregableId, asignacionesListadoProyectoId, data.entregables]);

  const asignacionesHorasListadoTabla = useMemo(() => {
    let rows = data.asignaciones_horas;
    if (asignacionesListadoProfesionalId) {
      rows = rows.filter((a) => a.profesional_id === asignacionesListadoProfesionalId);
    }
    if (asignacionesListadoEstado === "activas") {
      rows = rows.filter((a) => a.estado === "ACTIVA");
    } else if (asignacionesListadoEstado === "cerradas") {
      rows = rows.filter((a) => a.estado === "CERRADA");
    }
    if (asignacionesListadoProyectoId) {
      rows = rows.filter((a) => a.proyecto_id === asignacionesListadoProyectoId);
    }
    if (asignacionesListadoEntregableId) {
      rows = rows.filter((a) => a.entregable_id === asignacionesListadoEntregableId);
    }
    if (asignacionesListadoClienteId) {
      rows = rows.filter((a) => proyectoById.get(a.proyecto_id)?.cliente_id === asignacionesListadoClienteId);
    }
    return rows;
  }, [
    data.asignaciones_horas,
    asignacionesListadoProfesionalId,
    asignacionesListadoEstado,
    asignacionesListadoProyectoId,
    asignacionesListadoEntregableId,
    asignacionesListadoClienteId,
    proyectoById,
  ]);

  const entregablesListadoCrud = useMemo(
    () => filtrarEntregablesCrud(data.entregables, filtroVisibilidadEntregables),
    [data.entregables, filtroVisibilidadEntregables],
  );

  /** Bloque 2: gasto real por asignación ACTIVA desde RegistroHora (solo lectura). */
  const gastoPorAsignacionBloque2 = useMemo(() => {
    const hoy = fechaHoyIsoLocal();
    const m = new Map<string, { gastadas: number; pendientes: number }>();
    for (const a of data.asignaciones_horas) {
      const gastadas = sumaHorasGastadasRealesAsignacionBloque2(
        a,
        data.asignaciones_horas,
        data.registro_horas,
        data.entregables,
        data.proyectos,
        data.profesionales,
        hoy,
      );
      m.set(a.id, {
        gastadas,
        pendientes: horasPendientesAsignacionBloque2(a.horas_comprometidas, gastadas),
      });
    }
    return m;
  }, [
    data.asignaciones_horas,
    data.registro_horas,
    data.entregables,
    data.proyectos,
    data.profesionales,
  ]);

  /** Bloque 1 (banner): gasto DIRECTO válido sin fecha cubierta por ninguna asignación del par (lista para banner). */
  const alertasGastoSinAsignacionActiva = useMemo(() => {
    const hoy = fechaHoyIsoLocal();
    return aggregateGastoSinAsignacionActiva(
      data.registro_horas,
      data.asignaciones_horas,
      data.entregables,
      data.proyectos,
      data.profesionales,
      hoy,
    );
  }, [
    data.registro_horas,
    data.asignaciones_horas,
    data.entregables,
    data.proyectos,
    data.profesionales,
  ]);

  /** Excedidos operativos para banner global de Asignaciones (solo lectura). */
  const alertasProfesionalesExcedidosAsignaciones = useMemo(() => {
    const hoy = fechaHoyIsoLocal();
    const entregableIds = new Set(
      data.asignaciones_horas
        .filter((a) => a.estado === "ACTIVA")
        .map((a) => a.entregable_id),
    );
    const rows: Array<{
      asignacionId: string;
      profesional_id: string;
      nombre: string;
      categoria: "L2" | "P4" | "P3" | "P2";
      comprometidas: number;
      gastado: number;
      exceso: number;
      entregable_id: string;
      entregable_nombre: string;
    }> = [];
    for (const eid of entregableIds) {
      const ex = listarProfesionalesExcedidosEnEntregable(
        eid,
        data.asignaciones_horas,
        data.registro_horas,
        data.entregables,
        data.proyectos,
        data.profesionales,
        hoy,
      );
      const ent = data.entregables.find((e) => e.id === eid);
      for (const r of ex) {
        rows.push({
          ...r,
          entregable_id: eid,
          entregable_nombre: ent?.nombre ?? eid,
        });
      }
    }
    return rows;
  }, [
    data.asignaciones_horas,
    data.registro_horas,
    data.entregables,
    data.proyectos,
    data.profesionales,
  ]);

  /** Bloque 3: categoría con (hist. cerrado + gasto activo) por encima del presupuesto maestro del entregable. */
  const alertasCategoriasSobreconsumidasPresupuesto = useMemo(() => {
    const hoy = fechaHoyIsoLocal();
    const rows: Array<{
      entregable_id: string;
      entregable_nombre: string;
      entregable_completado: boolean;
      cliente_linea: string;
      proyecto_linea: string;
      fase_codigo: string;
      categoria: "L2" | "P4" | "P3" | "P2";
      presupuesto: number;
      consumidoHistoricoCerrado: number;
      gastoRealActivo: number;
      sobreconsumo: number;
    }> = [];
    for (const ent of data.entregables) {
      const list = listarCategoriasSobreconsumidasVsPresupuestoEntregable(
        ent,
        data.asignaciones_horas,
        data.registro_horas,
        data.entregables,
        data.proyectos,
        data.profesionales,
        hoy,
      );
      const pr = data.proyectos.find((p) => p.id === ent.proyecto_id);
      const cli = pr ? data.clientes.find((c) => c.id === pr.cliente_id) : undefined;
      const fase = (ent.fase_codigo ?? "").trim() || "—";
      const cliente_linea = cli ? `${cli.nombre} (${cli.codigo})` : "Cliente —";
      const proyecto_linea = pr ? `${pr.codigo} · ${pr.nombre}` : "Proyecto —";
      for (const r of list) {
        rows.push({
          entregable_id: ent.id,
          entregable_nombre: ent.nombre,
          entregable_completado: entregableEstadoEsCompletado(ent),
          cliente_linea,
          proyecto_linea,
          fase_codigo: fase,
          categoria: r.categoria,
          presupuesto: r.presupuesto,
          consumidoHistoricoCerrado: r.consumidoHistoricoCerrado,
          gastoRealActivo: r.gastoRealActivo,
          sobreconsumo: r.sobreconsumo,
        });
      }
    }
    return rows;
  }, [
    data.entregables,
    data.clientes,
    data.asignaciones_horas,
    data.registro_horas,
    data.proyectos,
    data.profesionales,
  ]);

  const alertasBloque3Visibles = useMemo(() => {
    if (mostrarBloque3HistoricosCompletados) return alertasCategoriasSobreconsumidasPresupuesto;
    return alertasCategoriasSobreconsumidasPresupuesto.filter((r) => !r.entregable_completado);
  }, [alertasCategoriasSobreconsumidasPresupuesto, mostrarBloque3HistoricosCompletados]);

  const revisadasPorClave = useMemo(
    () => mapaAlertasRevisadasPorClave(data.alertas_revisadas ?? []),
    [data.alertas_revisadas],
  );

  const alertasBloque1Vista = useMemo(() => {
    return alertasGastoSinAsignacionActiva
      .map((row) => {
        const ent = data.entregables.find((e) => e.id === row.entregable_id);
        const proyecto_id = ent?.proyecto_id ?? "";
        const clave = claveAlertaBloque1(proyecto_id, row.entregable_id, row.profesional_id);
        return { row, clave, revisada: revisadasPorClave.has(clave) };
      })
      .filter((x) => mostrarAlertasRevisadas || !x.revisada);
  }, [
    alertasGastoSinAsignacionActiva,
    data.entregables,
    revisadasPorClave,
    mostrarAlertasRevisadas,
  ]);

  const alertasBloque2Vista = useMemo(() => {
    return alertasProfesionalesExcedidosAsignaciones
      .map((row) => {
        const ent = data.entregables.find((e) => e.id === row.entregable_id);
        const proyecto_id = ent?.proyecto_id ?? "";
        const clave = claveAlertaBloque2(proyecto_id, row.entregable_id, row.profesional_id, row.categoria);
        return { row, clave, revisada: revisadasPorClave.has(clave) };
      })
      .filter((x) => mostrarAlertasRevisadas || !x.revisada);
  }, [
    alertasProfesionalesExcedidosAsignaciones,
    data.entregables,
    revisadasPorClave,
    mostrarAlertasRevisadas,
  ]);

  const alertasBloque3Vista = useMemo(() => {
    return alertasBloque3Visibles
      .map((row) => {
        const ent = data.entregables.find((e) => e.id === row.entregable_id);
        const proyecto_id = ent?.proyecto_id ?? "";
        const clave = claveAlertaBloque3(proyecto_id, row.entregable_id, row.categoria);
        return { row, clave, revisada: revisadasPorClave.has(clave) };
      })
      .filter((x) => mostrarAlertasRevisadas || !x.revisada);
  }, [alertasBloque3Visibles, data.entregables, revisadasPorClave, mostrarAlertasRevisadas]);

  const resumenAsignacionFase1Completo = useMemo(
    () =>
      listarResumenAsignacionTripleFase1(
        data.registro_horas,
        data.asignaciones_horas,
        data.entregables,
        data.proyectos,
        data.profesionales,
      ),
    [data.registro_horas, data.asignaciones_horas, data.entregables, data.proyectos, data.profesionales],
  );

  const resumenFase1PorTriple = useMemo(() => {
    const m = new Map<string, (typeof resumenAsignacionFase1Completo)[number]>();
    for (const r of resumenAsignacionFase1Completo) {
      m.set(`${r.profesional_id}\x00${r.entregable_id}\x00${r.categoria}`, r);
    }
    return m;
  }, [resumenAsignacionFase1Completo]);

  const alertasFase1SinAsignacionVista = useMemo(() => {
    return resumenAsignacionFase1Completo
      .filter((r) => r.estado === "sin_asignacion")
      .map((row) => {
        const clave = claveAlertaFase1GastoSinAsignacion(
          row.proyecto_id,
          row.entregable_id,
          row.profesional_id,
          row.categoria,
        );
        return { row, clave, revisada: revisadasPorClave.has(clave) };
      })
      .filter((x) => mostrarAlertasRevisadas || !x.revisada);
  }, [resumenAsignacionFase1Completo, revisadasPorClave, mostrarAlertasRevisadas]);

  const alertasFase1ExcesoVsAsignadoVista = useMemo(() => {
    return resumenAsignacionFase1Completo
      .filter((r) => r.estado === "deficit")
      .map((row) => {
        const clave = claveAlertaBloque4GastoVsAsignado(
          row.proyecto_id,
          row.entregable_id,
          row.profesional_id,
          row.categoria,
        );
        return { row, clave, revisada: revisadasPorClave.has(clave) };
      })
      .filter((x) => mostrarAlertasRevisadas || !x.revisada);
  }, [resumenAsignacionFase1Completo, revisadasPorClave, mostrarAlertasRevisadas]);

  const alertasBloque4Solapadas = useMemo(
    () =>
      listarBloque4VentanasAsignacionSolapadas(
        data.asignaciones_horas,
        data.entregables,
        fechaHoyIsoLocal(),
      ),
    [data.asignaciones_horas, data.entregables],
  );

  const alertasBloque4SolapadasVista = useMemo(() => {
    return alertasBloque4Solapadas
      .map((row) => {
        const clave = claveAlertaBloque4VentanasSolapadas(
          row.proyecto_id,
          row.entregable_id,
          row.profesional_id,
          row.categoria,
        );
        return { row, clave, revisada: revisadasPorClave.has(clave) };
      })
      .filter((x) => mostrarAlertasRevisadas || !x.revisada);
  }, [alertasBloque4Solapadas, revisadasPorClave, mostrarAlertasRevisadas]);

  const categoriasAsignacionUI: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];
  const esCategoriaAsignacionUI = (c: string): c is AsignacionHoraCategoria =>
    categoriasAsignacionUI.includes(c as AsignacionHoraCategoria);

  const keyTripleAsignacion = (
    profesionalId: string,
    proyectoId: string,
    entregableId: string,
    categoria: AsignacionHoraCategoria,
  ) => `${profesionalId}\x00${proyectoId}\x00${entregableId}\x00${categoria}`;

  const keyCatEntAsignacion = (proyectoId: string, entregableId: string, categoria: AsignacionHoraCategoria) =>
    `${proyectoId}\x00${entregableId}\x00${categoria}`;

  const clavesFase1PorTriple = useMemo(() => {
    const s = new Set<string>();
    for (const x of alertasFase1ExcesoVsAsignadoVista) {
      s.add(keyTripleAsignacion(x.row.profesional_id, x.row.proyecto_id, x.row.entregable_id, x.row.categoria));
    }
    for (const x of alertasFase1SinAsignacionVista) {
      s.add(keyTripleAsignacion(x.row.profesional_id, x.row.proyecto_id, x.row.entregable_id, x.row.categoria));
    }
    return s;
  }, [alertasFase1ExcesoVsAsignadoVista, alertasFase1SinAsignacionVista]);

  const bloque1ByTripleKey = useMemo(() => {
    const m = new Map<
      string,
      {
        row: (typeof alertasBloque1Vista)[number]["row"];
        clave: string;
        revisada: boolean;
        proyecto_id: string;
        categoria: AsignacionHoraCategoria;
      }
    >();
    for (const item of alertasBloque1Vista) {
      const row = item.row;
      const ent = data.entregables.find((e) => e.id === row.entregable_id);
      const proyecto_id = ent?.proyecto_id ?? "";
      if (!proyecto_id) continue;
      const prof = data.profesionales.find((p) => p.id === row.profesional_id);
      if (!prof) continue;
      if (!esCategoriaAsignacionUI(prof.cargo)) continue;
      const categoria = prof.cargo;
      const k = keyTripleAsignacion(row.profesional_id, proyecto_id, row.entregable_id, categoria);
      m.set(k, { row, clave: item.clave, revisada: item.revisada, proyecto_id, categoria });
    }
    return m;
  }, [alertasBloque1Vista, data.entregables, data.profesionales]);

  const clavesBloque1Primarias = useMemo(() => {
    const s = new Set<string>();
    for (const k of bloque1ByTripleKey.keys()) {
      if (!clavesFase1PorTriple.has(k)) s.add(k);
    }
    return s;
  }, [bloque1ByTripleKey, clavesFase1PorTriple]);

  const solapadasByTripleKey = useMemo(() => {
    const m = new Map<
      string,
      {
        row: (typeof alertasBloque4SolapadasVista)[number]["row"];
        clave: string;
        revisada: boolean;
      }
    >();
    for (const item of alertasBloque4SolapadasVista) {
      const row = item.row;
      const k = keyTripleAsignacion(row.profesional_id, row.proyecto_id, row.entregable_id, row.categoria);
      m.set(k, item as any);
    }
    return m;
  }, [alertasBloque4SolapadasVista]);

  const clavesSolapadasPrimarias = useMemo(() => {
    const s = new Set<string>();
    for (const k of solapadasByTripleKey.keys()) {
      if (clavesFase1PorTriple.has(k)) continue;
      if (clavesBloque1Primarias.has(k)) continue;
      s.add(k);
    }
    return s;
  }, [solapadasByTripleKey, clavesFase1PorTriple, clavesBloque1Primarias]);

  const sobreByCatEntKey = useMemo(() => {
    const m = new Map<
      string,
      {
        row: (typeof alertasBloque3Vista)[number]["row"];
        clave: string;
        revisada: boolean;
        proyecto_id: string;
      }
    >();
    for (const item of alertasBloque3Vista) {
      const row = item.row;
      const ent = data.entregables.find((e) => e.id === row.entregable_id);
      const proyecto_id = ent?.proyecto_id ?? "";
      if (!proyecto_id) continue;
      const k = keyCatEntAsignacion(proyecto_id, row.entregable_id, row.categoria);
      m.set(k, { row, clave: item.clave, revisada: item.revisada, proyecto_id });
    }
    return m;
  }, [alertasBloque3Vista, data.entregables]);

  const catEntHigherKeys = useMemo(() => {
    const s = new Set<string>();
    for (const x of alertasFase1ExcesoVsAsignadoVista) {
      s.add(keyCatEntAsignacion(x.row.proyecto_id, x.row.entregable_id, x.row.categoria));
    }
    for (const x of alertasFase1SinAsignacionVista) {
      s.add(keyCatEntAsignacion(x.row.proyecto_id, x.row.entregable_id, x.row.categoria));
    }
    for (const [k, v] of bloque1ByTripleKey.entries()) {
      if (!clavesBloque1Primarias.has(k)) continue;
      s.add(keyCatEntAsignacion(v.proyecto_id, v.row.entregable_id, v.categoria));
    }
    for (const [k, v] of solapadasByTripleKey.entries()) {
      if (!clavesSolapadasPrimarias.has(k)) continue;
      s.add(keyCatEntAsignacion(v.row.proyecto_id, v.row.entregable_id, v.row.categoria));
    }
    return s;
  }, [
    alertasFase1ExcesoVsAsignadoVista,
    alertasFase1SinAsignacionVista,
    bloque1ByTripleKey,
    clavesBloque1Primarias,
    solapadasByTripleKey,
    clavesSolapadasPrimarias,
  ]);

  const asignacionesHayFase1Principal = useMemo(
    () =>
      alertasFase1SinAsignacionVista.length > 0 || alertasFase1ExcesoVsAsignadoVista.length > 0,
    [alertasFase1SinAsignacionVista, alertasFase1ExcesoVsAsignadoVista],
  );

  const asignacionesHayAdvertenciasSecundarias = useMemo(
    () =>
      alertasBloque1Vista.length > 0 ||
      alertasBloque4SolapadasVista.length > 0 ||
      alertasCategoriasSobreconsumidasPresupuesto.length > 0 ||
      alertasBloque2Vista.length > 0,
    [alertasBloque1Vista, alertasBloque4SolapadasVista, alertasCategoriasSobreconsumidasPresupuesto, alertasBloque2Vista],
  );

  /** Auditoría histórica: mismos datos que el detector; sin alterar su lógica. */
  const filasBrechasHistoricas = useMemo(() => {
    const hoy = fechaHoyIsoLocal();
    return detectarBrechasHistoricasAsignacion({
      registro_horas: data.registro_horas,
      entregables: data.entregables,
      proyectos: data.proyectos,
      profesionales: data.profesionales,
      asignaciones_horas: data.asignaciones_horas,
      fechaHoy: hoy,
    });
  }, [
    data.registro_horas,
    data.entregables,
    data.proyectos,
    data.profesionales,
    data.asignaciones_horas,
  ]);

  const filasBrechasFiltradas = useMemo(() => {
    if (filtroCategoriaBrecha === "todas") return filasBrechasHistoricas;
    return filasBrechasHistoricas.filter((r) => r.categoria_detector === filtroCategoriaBrecha);
  }, [filasBrechasHistoricas, filtroCategoriaBrecha]);

  const alertaNormalizacionPorRegistroId = useMemo(
    () =>
      buildMapaAlertaNormalizacionPorRegistroId(
        data.registro_horas,
        data.asignaciones_horas,
        data.entregables,
        data.proyectos,
        data.profesionales,
      ),
    [data.registro_horas, data.asignaciones_horas, data.entregables, data.proyectos, data.profesionales],
  );

  const irANormalizarAsignacion = useCallback(
    (params: {
      clienteId: string;
      proyectoId: string;
      entregableId: string;
      profesionalId: string;
      horasSugeridas: number;
    }) => {
      setEditItem(null);
      setAsignacionFormPrefillDismissed(false);
      setActiveEntity("asignaciones_horas");
      const q = new URLSearchParams({
        entity: "asignaciones_horas",
        cliente_id: params.clienteId,
        proyecto_id: params.proyectoId,
        entregable_id: params.entregableId,
        profesional_id: params.profesionalId,
        horas_sugeridas: String(params.horasSugeridas),
      });
      navigate(`/formularios?${q.toString()}`);
    },
    [navigate],
  );

  /** Solo agregación sobre filas ya devueltas por el detector (sin alterar el detector). */
  const totalesAuditoriaBrechas = useMemo(() => {
    const sumHoras = (rows: typeof filasBrechasHistoricas) =>
      rows.reduce((acc, r) => acc + (Number.isFinite(r.horas_totales_gasto) ? r.horas_totales_gasto : 0), 0);
    const filasSinAsignacion = filasBrechasHistoricas.filter((r) => r.categoria_detector === "SIN_ASIGNACION");
    return {
      horasTodasDetector: sumHoras(filasBrechasHistoricas),
      horasVistaFiltrada: sumHoras(filasBrechasFiltradas),
      horasSinAsignacion: sumHoras(filasSinAsignacion),
      nFilasDetector: filasBrechasHistoricas.length,
      nFilasVista: filasBrechasFiltradas.length,
      nFilasSinAsignacion: filasSinAsignacion.length,
    };
  }, [filasBrechasHistoricas, filasBrechasFiltradas]);

  /** Consolidado visible: suma simple de `registro_horas` por tipo (no consumo real ni asignaciones). */
  const totalesRegistroHorasPorTipo = useMemo(() => {
    let directa = 0;
    let indirecta = 0;
    let vacaciones = 0;
    for (const r of data.registro_horas) {
      const h = Number(r.horas);
      if (!Number.isFinite(h) || h <= 0) continue;
      if (r.tipo_hora === "DIRECTA") directa += h;
      else if (r.tipo_hora === "INDIRECTA") indirecta += h;
      else if (r.tipo_hora === "VACACIONES") vacaciones += h;
    }
    return {
      directa,
      indirecta,
      vacaciones,
      total: directa + indirecta + vacaciones,
    };
  }, [data.registro_horas]);

  const counts: Record<EntityType, number> = {
    clientes: data.clientes.length,
    profesionales: data.profesionales.length,
    pm_internos: data.pm_internos.length,
    proyectos: data.proyectos.length,
    entregables: data.entregables.length,
    asignaciones_horas: data.asignaciones_horas.length,
    registro_horas: data.registro_horas.length,
    pipeline: data.pipeline.length,
    carga_mensual: data.carga_mensual.length,
    curvas_objetivo_anual: data.curvas_objetivo_anual.length,
  };

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSaved = useCallback(() => {
    setEditItem(null);
    showToast("Guardado correctamente", "success");
  }, [showToast]);

  const handleCancel = useCallback(() => {
    setEditItem(null);
    if (activeEntity === "asignaciones_horas") {
      setAsignacionFormPrefillDismissed(true);
    }
  }, [activeEntity]);

  const scrollToFormSection = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, []);

  /** Misma carga que setEditItem; además sube al formulario (listado/cards en móvil). */
  const handleEditFromList = useCallback(
    (item: unknown) => {
      setEditItem(item);
      scrollToFormSection();
    },
    [scrollToFormSection],
  );

  const [deleteProyectoConfirmText, setDeleteProyectoConfirmText] = useState<string>("");

  useEffect(() => {
    if (!deleteItem || activeEntity !== "proyectos") {
      setDeleteProyectoConfirmText("");
    }
  }, [deleteItem, activeEntity]);

  // Advertencia no destructiva: entregables huérfanos (proyecto_id inexistente).
  useEffect(() => {
    const proyectoSet = new Set(data.proyectos.map((p) => p.id));
    const orf = data.entregables.filter((e) => !proyectoSet.has(e.proyecto_id));
    if (orf.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] Hay ${orf.length} entregable(s) huérfanos (proyecto_id inexistente). No se eliminan automáticamente.`);
    }
  }, [data.proyectos, data.entregables]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteItem) return;
    switch (activeEntity) {
      case "clientes":
        if (
          isClienteReferencedByProyectos(data.proyectos, deleteItem.id) ||
          isClienteReferencedByPipeline(data.pipeline, deleteItem.id)
        ) {
          setDeleteItem(null);
          showToast(
            "No se puede eliminar el cliente: hay proyectos o registros de pipeline vinculados. Cambia el cliente en esos registros primero.",
            "error",
          );
          return;
        }
        data.deleteCliente(deleteItem.id);
        break;
      case "profesionales":
        if (isProfesionalReferenced(deleteItem.id, data)) {
          setDeleteItem(null);
          showToast(
            "No se puede eliminar el profesional: tiene referencias en proyectos, entregables, asignaciones de horas, registros de horas, pipeline o carga mensual.",
            "error",
          );
          return;
        }
        data.deleteProfesional(deleteItem.id);
        break;
      case "proyectos":
        // Se maneja por un dialog dedicado con validaciones (entregables + gasto real).
        setDeleteItem(null);
        showToast("Use la eliminación asistida del proyecto.", "error");
        return;
      case "pm_internos":
        if (
          isPmInternoReferencedByProyectos(data.proyectos, deleteItem.id) ||
          isPmInternoReferencedByPipeline(data.pipeline, deleteItem.id)
        ) {
          setDeleteItem(null);
          showToast(
            "No se puede eliminar el PM interno: hay proyectos o registros de pipeline vinculados.",
            "error",
          );
          return;
        }
        data.deletePmInterno(deleteItem.id);
        break;
      case "entregables":
        data.deleteEntregable(deleteItem.id);
        break;
      case "asignaciones_horas":
        data.deleteAsignacionHora(deleteItem.id);
        break;
      case "registro_horas":
        data.deleteRegistroHora(deleteItem.id);
        break;
      case "pipeline":
        data.deletePipeline(deleteItem.id);
        break;
      case "carga_mensual":
        data.deleteCargaMensual(deleteItem.id);
        break;
      case "curvas_objetivo_anual":
        data.deleteCurvaObjetivoAnual(deleteItem.id);
        break;
    }
    setDeleteItem(null);
    showToast("Eliminado correctamente", "success");
  }, [deleteItem, activeEntity, data, showToast]);

  const proyectoDeleteState = useMemo(() => {
    if (!deleteItem || activeEntity !== "proyectos") return null;
    const pr = data.proyectos.find((p) => p.id === deleteItem.id);
    if (!pr) return null;
    const entregablesDelProyecto = data.entregables.filter((e) => e.proyecto_id === pr.id);
    const entSet = new Set(entregablesDelProyecto.map((e) => e.id));
    const gasto = analizarBloqueoEliminacionProyectos([pr.id], data.entregables, data.registro_horas, data.proyectos);
    const asignacionesCount = data.asignaciones_horas.filter((a) => a.proyecto_id === pr.id || entSet.has(a.entregable_id)).length;
    return {
      proyecto: pr,
      entregablesDelProyecto,
      asignacionesCount,
      bloqueadoPorGasto: gasto.bloqueado,
      registrosHorasCount: gasto.nRegistros,
      registrosHorasTotalHoras: gasto.totalHoras,
      entregablesConGasto: gasto.entregablesConGasto,
    };
  }, [deleteItem, activeEntity, data.proyectos, data.entregables, data.registro_horas, data.asignaciones_horas]);

  const handleDeleteProyectoCascade = useCallback(() => {
    const st = proyectoDeleteState;
    if (!st) return;
    if (st.bloqueadoPorGasto) return;
    if (deleteProyectoConfirmText.trim() !== "BORRAR") return;
    data.deleteProyectosCascade([st.proyecto.id]);
    setDeleteItem(null);
    setDeleteProyectoConfirmText("");
    showToast("Proyecto y dependencias eliminados.", "success");
  }, [proyectoDeleteState, deleteProyectoConfirmText, data, showToast]);

  /* ─── Render form panel for active entity ─── */
  const renderForm = () => {
    const key = activeEntity;
    switch (key) {
      case "clientes":
        return (
          <ClienteFormPanel
            key={(editItem as Cliente | null | undefined)?.id ?? "cliente-new"}
            editItem={editItem as Cliente | null | undefined}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        );
      case "profesionales":
        return (
          <ProfesionalFormPanel
            key={(editItem as Profesional | null | undefined)?.id ?? "profesional-new"}
            editItem={editItem as Profesional | null | undefined}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        );
      case "proyectos":
        return (
          <ProyectoFormPanel
            editItem={editItem as Proyecto | null | undefined}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        );
      case "pm_internos":
        return (
          <PmInternoFormPanel
            key={(editItem as PmInterno | null | undefined)?.id ?? "pm-interno-new"}
            editItem={editItem as PmInterno | null | undefined}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        );
      case "entregables":
        return (
          <EntregableFormPanel
            key={(editItem as Entregable | null | undefined)?.id ?? "entregable-new"}
            editItem={editItem as Entregable | null | undefined}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        );
      case "asignaciones_horas": {
        const asignacionEnEdicion = editItemEsAsignacionHora(editItem) ? editItem : null;
        return (
          <AsignacionHoraFormPanel
            key={
              asignacionEnEdicion?.id ??
              `asignacion-new-${entregableIdParam || "-"}-${proyectoIdParam || "-"}-${clienteIdParam || "-"}-${profesionalIdParam || "-"}-${horasSugeridasParam || "-"}`
            }
            editItem={asignacionEnEdicion}
            prefillClienteProyectoEntregable={
              asignacionEnEdicion ? null : asignacionCreacionPrefillEfectivo
            }
            onSaved={handleSaved}
            onCancel={handleCancel}
            onBusinessError={(msg) => showToast(msg, "error")}
          />
        );
      }
      case "registro_horas":
        return (
          <RegistroHoraFormPanel
            editItem={editItem as RegistroHora | null | undefined}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        );
      case "pipeline":
        return (
          <PipelineFormPanel
            key={String((editItem as Pipeline | null | undefined)?.id ?? "nuevo-pipeline")}
            editItem={editItem as Pipeline | null | undefined}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        );
      case "carga_mensual":
        return (
          <CargaMensualFormPanel
            editItem={editItem as CargaMensual | null | undefined}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        );
      case "curvas_objetivo_anual":
        return (
          <CurvaObjetivoAnualFormPanel
            key={(editItem as CurvaObjetivoAnual | null | undefined)?.id ?? "curva-objetivo-new"}
            editItem={editItem as CurvaObjetivoAnual | null | undefined}
            onSaved={handleSaved}
            onCancel={handleCancel}
            onBusinessError={(msg) => showToast(msg, "error")}
          />
        );
      default:
        return null;
    }
  };

  /* ─── Render table for active entity ─── */
  const renderTable = () => {
    const key = activeEntity;
    switch (key) {
      case "clientes":
        return (
          <EntityTable<Cliente>
            data={data.clientes}
            entityLabel="clientes"
            searchFields={["codigo", "nombre"]}
            columns={[
              { key: "codigo", header: "Código" },
              { key: "nombre", header: "Nombre" },
              {
                key: "color",
                header: "Color",
                render: (c) => (
                  <span className="inline-block h-4 w-4 rounded-full border border-bdr" style={{ background: c.color }} />
                ),
              },
              {
                key: "activo",
                header: "Activo",
                render: (c) => (
                  <span className={`text-[10px] font-semibold uppercase ${c.activo ? "text-green" : "text-t300"}`}>
                    {c.activo ? "Sí" : "No"}
                  </span>
                ),
              },
            ]}
            onEdit={handleEditFromList}
            onDelete={(item) => setDeleteItem({ id: item.id, name: item.nombre })}
            renderMobileCard={(c) => (
              <>
                <MobileCardRow label="Código">{c.codigo}</MobileCardRow>
                <MobileCardRow label="Nombre">{c.nombre}</MobileCardRow>
                <MobileCardRow label="Activo">
                  <span className={c.activo ? "font-semibold text-green" : "text-t400"}>{c.activo ? "Sí" : "No"}</span>
                </MobileCardRow>
              </>
            )}
          />
        );
      case "profesionales":
        return (
          <EntityTable<Profesional>
            data={data.profesionales}
            entityLabel="profesionales"
            searchFields={["codigo", "nombre_completo", "email", "cargo"]}
            columns={[
              { key: "codigo", header: "Código" },
              { key: "nombre_completo", header: "Nombre" },
              {
                key: "cargo",
                header: "Cargo",
                render: (p) => {
                  const styles: Record<string, { bg: string; text: string; border: string }> = {
                    L2: { bg: "#FDF2F8", text: "#9D174D", border: "#FBCFE8" },
                    P4: { bg: "#E0E7FF", text: "#3730A3", border: "#C7D2FE" },
                    P3: { bg: "#F0FDF4", text: "#14532D", border: "#BBF7D0" },
                    P2: { bg: "#FEFCE8", text: "#713F12", border: "#FEF08A" },
                  };
                  const s = styles[p.cargo];
                  return (
                    <span className="rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                      {p.cargo}
                    </span>
                  );
                },
              },
              { key: "email", header: "Email" },
              { key: "fecha_ingreso", header: "Ingreso" },
            ]}
            onEdit={handleEditFromList}
            onDelete={(item) => setDeleteItem({ id: item.id, name: `${item.codigo} — ${item.nombre_completo}` })}
            renderMobileCard={(p) => (
              <>
                <MobileCardRow label="Código">{p.codigo}</MobileCardRow>
                <MobileCardRow label="Nombre">{p.nombre_completo}</MobileCardRow>
                <MobileCardRow label="Cargo">
                  <span className="font-semibold uppercase">{p.cargo}</span>
                </MobileCardRow>
                <MobileCardRow label="Email">{p.email || "—"}</MobileCardRow>
              </>
            )}
          />
        );
      case "proyectos":
        return (
          <EntityTable<Proyecto>
            data={data.proyectos}
            entityLabel="proyectos"
            searchFields={["codigo", "nombre", "estado"]}
            searchExtraText={(p) => {
              const c = data.clientes.find((cl) => cl.id === p.cliente_id);
              const pm = data.pm_internos.find((m) => m.id === p.pm_interno_id);
              return [c?.codigo, c?.nombre, pm?.nombre, p.pm_nombre].filter(Boolean).join(" ");
            }}
            columns={[
              { key: "codigo", header: "Código" },
              { key: "nombre", header: "Nombre" },
              {
                key: "cliente_id",
                header: "Cliente",
                render: (p) => data.clientes.find((c) => c.id === p.cliente_id)?.codigo || "—",
              },
              {
                key: "pm_nombre",
                header: "PM",
                render: (p) => data.pm_internos.find((pm) => pm.id === p.pm_interno_id)?.nombre || p.pm_nombre || "—",
              },
              {
                key: "tarifas",
                header: "Tarifas (UF)",
                render: (p) =>
                  `L2 ${p.tarifa_l2 ?? 0} · P4 ${p.tarifa_p4 ?? 0} · P3 ${p.tarifa_p3 ?? 0} · P2 ${p.tarifa_p2 ?? 0}`,
              },
              {
                key: "estado",
                header: "Estado",
                render: (p) => (
                  <span className="rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={
                    p.estado === "ACTIVO" ? { background: "#ECFDF5", color: "#047857" } :
                    p.estado === "COMPLETADO" ? { background: "#E0E7FF", color: "#4F46E5" } :
                    p.estado === "NO_INICIADO" ? { background: "#F1F5F9", color: "#475569" } :
                    { background: "#FFF7ED", color: "#B45309" }
                  }>
                    {p.estado.replace("_", " ")}
                  </span>
                ),
              },
              {
                key: "presupuesto_moneda",
                header: "Presupuesto",
                render: (p) => (
                  <span className="whitespace-nowrap text-[11px] text-t600" title={formatoResumenMonedaProyecto(p)}>
                    {formatoResumenMonedaProyecto(p)}
                  </span>
                ),
              },
              { key: "hrs_presupuestadas", header: "Hrs" },
            ]}
            onEdit={handleEditFromList}
            onDelete={(item) => setDeleteItem({ id: item.id, name: item.nombre })}
            renderMobileCard={(p) => {
              const cli = data.clientes.find((c) => c.id === p.cliente_id);
              const pm = data.pm_internos.find((m) => m.id === p.pm_interno_id);
              return (
                <>
                  <MobileCardRow label="Código">{p.codigo}</MobileCardRow>
                  <MobileCardRow label="Nombre">{p.nombre}</MobileCardRow>
                  <MobileCardRow label="Cliente">{cli ? `${cli.codigo} · ${cli.nombre}` : "—"}</MobileCardRow>
                  <MobileCardRow label="PM">{pm?.nombre || p.pm_nombre || "—"}</MobileCardRow>
                  <MobileCardRow label="Estado">
                    <span className="uppercase">{p.estado.replace("_", " ")}</span>
                  </MobileCardRow>
                  <MobileCardRow label="Horas">{p.hrs_presupuestadas ?? "—"}</MobileCardRow>
                </>
              );
            }}
          />
        );
      case "pm_internos":
        return (
          <EntityTable<PmInterno>
            data={data.pm_internos}
            entityLabel="pm internos"
            searchFields={["codigo", "nombre"]}
            columns={[
              { key: "codigo", header: "Código" },
              { key: "nombre", header: "Nombre" },
              {
                key: "activo",
                header: "Activo",
                render: (pm) => (
                  <span className={`text-[10px] font-semibold uppercase ${pm.activo ? "text-green" : "text-t300"}`}>
                    {pm.activo ? "Sí" : "No"}
                  </span>
                ),
              },
            ]}
            onEdit={handleEditFromList}
            onDelete={(item) => setDeleteItem({ id: item.id, name: `${item.codigo} — ${item.nombre}` })}
          />
        );
      case "entregables":
        return (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-r10 border border-bdr bg-surface2/70 px-4 py-3">
              <label htmlFor="filtro-vis-ent" className="text-[12px] font-medium text-t600">
                Visibilidad del listado
              </label>
              <select
                id="filtro-vis-ent"
                value={filtroVisibilidadEntregables}
                onChange={(ev) =>
                  setFiltroVisibilidadEntregables(ev.target.value as FiltroVisibilidadEntregablesCrud)
                }
                className="rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px] text-t800 shadow-sm outline-none focus:ring-2 focus:ring-[#6366F1]/30"
              >
                <option value="todos">Todos (predeterminado)</option>
                <option value="ocultar_no_iniciado">Ocultar No Iniciado</option>
                <option value="solo_completados">Solo completados</option>
                <option value="solo_activos">Solo activos (en curso)</option>
              </select>
              <span className="text-[11px] text-t500">
                Mostrando <strong className="text-t700">{entregablesListadoCrud.length}</strong> de{" "}
                <strong className="text-t700">{data.entregables.length}</strong> entregables en datos
              </span>
            </div>
            <EntityTable<Entregable>
              data={entregablesListadoCrud}
              entityLabel="entregables"
              searchFields={["nombre", "estado"]}
              searchExtraText={(e) => {
                const p = data.proyectos.find((pr) => pr.id === e.proyecto_id);
                const lid = data.profesionales.find((pr) => pr.id === e.lider_id);
                return [p?.codigo, p?.nombre, lid?.nombre_completo, lid?.codigo].filter(Boolean).join(" ");
              }}
              extraRowActions={(e) => <EntregableRedistribuirHorasTrigger ent={e} dense />}
              columns={[
                { key: "nombre", header: "Nombre" },
                {
                  key: "proyecto_id",
                  header: "Proyecto",
                  render: (e) => data.proyectos.find((p) => p.id === e.proyecto_id)?.codigo || "—",
                },
                {
                  key: "estado",
                  header: "Estado",
                  render: (e) => {
                    const cfg: Record<string, { bg: string; text: string }> = {
                      NO_INICIADO: { bg: "#F1F5F9", text: "#475569" },
                      "No Iniciado": { bg: "#F1F5F9", text: "#475569" },
                      EN_PLAZO: { bg: "#ECFDF5", text: "#047857" },
                      "En Plazo": { bg: "#ECFDF5", text: "#047857" },
                      ADELANTADO: { bg: "#ECFDF5", text: "#047857" },
                      Adelantado: { bg: "#ECFDF5", text: "#047857" },
                      RIESGO: { bg: "#FFF7ED", text: "#B45309" },
                      CRITICO: { bg: "#FEF2F2", text: "#B91C1C" },
                      COMPLETADO: { bg: "#E0E7FF", text: "#4F46E5" },
                      Completado: { bg: "#E0E7FF", text: "#4F46E5" },
                    };
                    const k = String(e.estado);
                    const s = cfg[k] ?? { bg: "#F3F4F6", text: "#374151" };
                    const label = k.includes(" ") || k.includes(":") ? k : k.replace(/_/g, " ");
                    return (
                      <span
                        className="rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ background: s.bg, color: s.text }}
                      >
                        {label}
                      </span>
                    );
                  },
                },
                {
                  key: "avance_real",
                  header: "Avance",
                  render: (e) => `${(e.avance_real * 100).toFixed(0)}%`,
                },
                { key: "uf_presupuestadas", header: "UF" },
                { key: "hrs_presupuestadas", header: "Hrs" },
              ]}
              onEdit={handleEditFromList}
              onDelete={(item) => setDeleteItem({ id: item.id, name: item.nombre })}
              renderMobileCard={(e) => {
                const pr = data.proyectos.find((p) => p.id === e.proyecto_id);
                return (
                  <>
                    <MobileCardRow label="Nombre">{e.nombre}</MobileCardRow>
                    <MobileCardRow label="Proyecto">{pr ? `${pr.codigo} · ${pr.nombre}` : "—"}</MobileCardRow>
                    <MobileCardRow label="Estado">
                      <span className="uppercase">{String(e.estado).replace(/_/g, " ")}</span>
                    </MobileCardRow>
                    <MobileCardRow label="Avance">{(e.avance_real * 100).toFixed(0)}%</MobileCardRow>
                    <MobileCardRow label="Horas">{e.hrs_presupuestadas ?? "—"}</MobileCardRow>
                  </>
                );
              }}
            />
          </>
        );
      case "asignaciones_horas":
        return (
          <>
            {alertasGastoSinAsignacionActiva.length > 0 ||
            alertasProfesionalesExcedidosAsignaciones.length > 0 ||
            alertasCategoriasSobreconsumidasPresupuesto.length > 0 ||
            resumenAsignacionFase1Completo.some((r) => r.estado !== "en_rango") ||
            alertasBloque4Solapadas.length > 0 ||
            (data.alertas_revisadas?.length ?? 0) > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-r8 border border-bdr bg-surface2 px-3 py-2">
                <Switch
                  id="asig-mostrar-revisadas"
                  checked={mostrarAlertasRevisadas}
                  onCheckedChange={(v) => setMostrarAlertasRevisadas(Boolean(v))}
                />
                <Label htmlFor="asig-mostrar-revisadas" className="cursor-pointer text-[11px] font-medium text-t700">
                  Mostrar alertas revisadas
                </Label>
              </div>
            ) : null}
            {(asignacionesHayFase1Principal || asignacionesHayAdvertenciasSecundarias) && (
              <div className="mb-3 rounded-r8 border border-bdr bg-surface2 px-3 py-2 text-[11px] leading-snug text-t700">
                <p className="text-[12px] font-semibold text-t800">Alertas de asignación</p>
                Estas alertas comparan el gasto real registrado contra las horas asignadas y ayudan a detectar
                diferencias operativas.
              </div>
            )}

            {(asignacionesHayFase1Principal || asignacionesHayAdvertenciasSecundarias) ? (
              <div className="mb-4">
                {asignacionesHayFase1Principal ? (
                  <div className="border-0 bg-transparent p-0 shadow-none">
                    <div className="hidden">Alertas principales</div>
                    <ul className="space-y-1 text-[11px] leading-snug text-t800">
                      {alertasFase1SinAsignacionVista.map(({ row, revisada, clave }) => {
                        const prof = data.profesionales.find((p) => p.id === row.profesional_id);
                        const ent = data.entregables.find((e) => e.id === row.entregable_id);
                        const pr = ent ? data.proyectos.find((p) => p.id === ent.proyecto_id) : undefined;
                        const ctx = textoProyectoSlashEntregableParaAlerta(pr, ent);
                        const nombre = prof?.nombre_completo ?? row.profesional_id;
                        const descripcion = `${nombre} (${row.categoria}) en «${ctx}»: gasto real ${row.gasto_real_total.toFixed(1)} h · sin horas asignadas.`;
                        const kTriple = keyTripleAsignacion(row.profesional_id, row.proyecto_id, row.entregable_id, row.categoria);
                        const detalleFueraVentana = bloque1ByTripleKey.get(kTriple);
                        const detalleSolapes = solapadasByTripleKey.get(kTriple);
                        const detalleSobreconsumo = sobreByCatEntKey.get(keyCatEntAsignacion(row.proyecto_id, row.entregable_id, row.categoria));
                        return (
                          <li key={clave} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="mr-2 font-semibold text-amber-950">ALERTA</span>
                              {revisada ? <span className="mr-2 text-[10px] font-semibold text-t500">Revisada</span> : null}
                              <span className="font-semibold">{nombre}</span> · <span className="break-words">{ctx}</span> · El profesional tiene gasto registrado, pero no tiene asignación.
                              {(detalleFueraVentana || detalleSolapes || detalleSobreconsumo) && (
                                <div className="mt-1 space-y-0.5">
                                  {detalleFueraVentana ? (
                                    <div className="text-[11px] text-t600">
                                      Detalle: {detalleFueraVentana.row.horas_sin_cobertura_activa.toFixed(1)} h fuera de ventana de asignación.
                                    </div>
                                  ) : null}
                                  {detalleSolapes ? (
                                    <div className="text-[11px] text-t600">Detalle: existen ventanas de asignación solapadas.</div>
                                  ) : null}
                                  {detalleSobreconsumo ? (
                                    <div className="text-[11px] text-t600">
                                      Detalle: la categoría supera el presupuesto del entregable (sobreconsumo{" "}
                                      {detalleSobreconsumo.row.sobreconsumo.toFixed(1)} h).
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </span>
                            {puedeMarcarRevisionAlerta && !revisada ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-r6 px-2 text-[10px] font-semibold"
                                onClick={() => {
                                  setMarcarMotivo("AJUSTE_MENOR");
                                  setMarcarEstado("REVISADA");
                                  setMarcarComentario("");
                                  setMarcarAlertaDraft({
                                    tipo: "BLOQUE_FASE1_GASTO_SIN_ASIGNACION",
                                    clave_alerta: clave,
                                    proyecto_id: row.proyecto_id,
                                    entregable_id: row.entregable_id,
                                    profesional_id: row.profesional_id,
                                    categoria: row.categoria,
                                    descripcion,
                                    proyecto_label: pr ? `${pr.codigo} · ${pr.nombre}` : row.proyecto_id,
                                    entregable_label: ent?.nombre ?? row.entregable_id,
                                    profesional_label: nombre,
                                    categoria_label: row.categoria,
                                  });
                                }}
                              >
                                Marcar revisada
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}
                      {alertasFase1ExcesoVsAsignadoVista.map(({ row, revisada, clave }) => {
                        const prof = data.profesionales.find((p) => p.id === row.profesional_id);
                        const ent = data.entregables.find((e) => e.id === row.entregable_id);
                        const pr = ent ? data.proyectos.find((p) => p.id === ent.proyecto_id) : undefined;
                        const ctx = textoProyectoSlashEntregableParaAlerta(pr, ent);
                        const nombre = prof?.nombre_completo ?? row.profesional_id;
                        const descripcion = `${nombre} (${row.categoria}) en «${ctx}»: gasto real ${row.gasto_real_total.toFixed(1)} h · asignado ${row.horas_asignadas_totales.toFixed(1)} h · déficit ${row.deficit.toFixed(1)} h.`;
                        const kTriple = keyTripleAsignacion(row.profesional_id, row.proyecto_id, row.entregable_id, row.categoria);
                        const detalleFueraVentana = bloque1ByTripleKey.get(kTriple);
                        const detalleSolapes = solapadasByTripleKey.get(kTriple);
                        const detalleSobreconsumo = sobreByCatEntKey.get(
                          keyCatEntAsignacion(row.proyecto_id, row.entregable_id, row.categoria),
                        );
                        return (
                          <li key={clave} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="mr-2 font-semibold text-rose-900">ALERTA</span>
                              {revisada ? <span className="mr-2 text-[10px] font-semibold text-t500">Revisada</span> : null}
                              <span className="font-semibold">{nombre}</span> · <span className="break-words">{ctx}</span> · Falta asignar{" "}
                              {row.deficit.toFixed(1)} h.
                              {(detalleFueraVentana || detalleSolapes || detalleSobreconsumo) && (
                                <div className="mt-1 space-y-0.5">
                                  {detalleFueraVentana ? (
                                    <div className="text-[11px] text-t600">
                                      Detalle: {detalleFueraVentana.row.horas_sin_cobertura_activa.toFixed(1)} h fuera de ventana de asignación.
                                    </div>
                                  ) : null}
                                  {detalleSolapes ? (
                                    <div className="text-[11px] text-t600">Detalle: existen ventanas de asignación solapadas.</div>
                                  ) : null}
                                  {detalleSobreconsumo ? (
                                    <div className="text-[11px] text-t600">
                                      Detalle: la categoría supera el presupuesto del entregable (sobreconsumo{" "}
                                      {detalleSobreconsumo.row.sobreconsumo.toFixed(1)} h).
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </span>
                            {puedeMarcarRevisionAlerta && !revisada ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-r6 px-2 text-[10px] font-semibold"
                                onClick={() => {
                                  setMarcarMotivo("AJUSTE_MENOR");
                                  setMarcarEstado("REVISADA");
                                  setMarcarComentario("");
                                  setMarcarAlertaDraft({
                                    tipo: "BLOQUE_4_GASTO_REAL_MAYOR_ASIGNADO",
                                    clave_alerta: clave,
                                    proyecto_id: row.proyecto_id,
                                    entregable_id: row.entregable_id,
                                    profesional_id: row.profesional_id,
                                    categoria: row.categoria,
                                    descripcion,
                                    proyecto_label: pr ? `${pr.codigo} · ${pr.nombre}` : row.proyecto_id,
                                    entregable_label: ent?.nombre ?? row.entregable_id,
                                    profesional_label: nombre,
                                    categoria_label: row.categoria,
                                  });
                                }}
                              >
                                Marcar revisada
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {asignacionesHayAdvertenciasSecundarias ? (
                  <div className="border-0 bg-transparent p-0 shadow-none">
                    <div className="hidden">Advertencias secundarias</div>
                    <ul className="space-y-1 text-[11px] leading-snug text-t700">
                      {alertasBloque1Vista.map(({ row, revisada }) => {
                        const prof = data.profesionales.find((p) => p.id === row.profesional_id);
                        const ent = data.entregables.find((e) => e.id === row.entregable_id);
                        const pr = ent ? data.proyectos.find((p) => p.id === ent.proyecto_id) : undefined;
                        const ctx = textoProyectoSlashEntregableParaAlerta(pr, ent);
                        const proyecto_id = ent?.proyecto_id ?? "";
                        const categoria = prof?.cargo;
                        if (!proyecto_id || !categoria || !esCategoriaAsignacionUI(categoria)) return null;
                        const kTriple = keyTripleAsignacion(row.profesional_id, proyecto_id, row.entregable_id, categoria);
                        if (clavesFase1PorTriple.has(kTriple)) return null;
                        const detalleSolapes = solapadasByTripleKey.get(kTriple);
                        const detalleSobreconsumo = sobreByCatEntKey.get(
                          keyCatEntAsignacion(proyecto_id, row.entregable_id, categoria),
                        );
                        const clave = claveAlertaBloque1(proyecto_id, row.entregable_id, row.profesional_id);
                        const descripcion = `${prof?.nombre_completo ?? row.profesional_id} · ${row.horas_sin_cobertura_activa.toFixed(1)} h DIRECTAS en «${ctx}» fuera de ventana de asignación`;
                        return (
                          <li key={clave} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="mr-2 font-semibold text-t500">ADVERTENCIA</span>
                              {revisada ? <span className="mr-2 text-[10px] font-semibold text-t400">Revisada</span> : null}
                              <span className="font-semibold">{prof?.nombre_completo ?? row.profesional_id}</span> ·{" "}
                              <span className="break-words">{ctx}</span> · Hay horas fuera de ventana de asignación.
                              <div className="mt-1 space-y-0.5">
                                <div className="text-[11px] text-t600">
                                  Detalle: {row.horas_sin_cobertura_activa.toFixed(1)} h fuera de ventana de asignación.
                                </div>
                                {detalleSolapes ? (
                                  <div className="text-[11px] text-t600">Detalle: existen ventanas de asignación solapadas.</div>
                                ) : null}
                                {detalleSobreconsumo ? (
                                  <div className="text-[11px] text-t600">
                                    Detalle: la categoría supera el presupuesto del entregable (sobreconsumo{" "}
                                    {detalleSobreconsumo.row.sobreconsumo.toFixed(1)} h).
                                  </div>
                                ) : null}
                              </div>
                            </span>
                            {puedeMarcarRevisionAlerta && !revisada ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-r6 px-2 text-[10px] font-semibold"
                                onClick={() => {
                                  setMarcarMotivo("PROYECTO_CERRADO_HISTORICO");
                                  setMarcarEstado("REVISADA");
                                  setMarcarComentario("");
                                  setMarcarAlertaDraft({
                                    tipo: "BLOQUE_1_SIN_COBERTURA",
                                    clave_alerta: clave,
                                    proyecto_id,
                                    entregable_id: row.entregable_id,
                                    profesional_id: row.profesional_id,
                                    categoria: null,
                                    descripcion,
                                    proyecto_label: pr ? `${pr.codigo} · ${pr.nombre}` : proyecto_id,
                                    entregable_label: ent?.nombre ?? row.entregable_id,
                                    profesional_label: prof?.nombre_completo ?? row.profesional_id,
                                    categoria_label: null,
                                  });
                                }}
                              >
                                Marcar revisada
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}

                      {alertasBloque4SolapadasVista.map(({ row, revisada, clave }) => {
                        const prof = data.profesionales.find((p) => p.id === row.profesional_id);
                        const ent = data.entregables.find((e) => e.id === row.entregable_id);
                        const pr = ent ? data.proyectos.find((p) => p.id === ent.proyecto_id) : undefined;
                        const ctx = textoProyectoSlashEntregableParaAlerta(pr, ent);
                        const nombre = prof?.nombre_completo ?? row.profesional_id;
                        const kTriple = keyTripleAsignacion(row.profesional_id, row.proyecto_id, row.entregable_id, row.categoria);
                        if (!clavesSolapadasPrimarias.has(kTriple)) return null;
                        const detalleSobreconsumo = sobreByCatEntKey.get(
                          keyCatEntAsignacion(row.proyecto_id, row.entregable_id, row.categoria),
                        );
                        const descripcion = `${nombre} (${row.categoria}) en «${ctx}»: ventanas solapadas.`;
                        return (
                          <li key={clave} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="mr-2 font-semibold text-t500">ADVERTENCIA</span>
                              {revisada ? <span className="mr-2 text-[10px] font-semibold text-t400">Revisada</span> : null}
                              <span className="font-semibold">{nombre}</span> · <span className="break-words">{ctx}</span> · Existen ventanas de asignación solapadas.
                              {detalleSobreconsumo ? (
                                <div className="mt-1 text-[11px] text-t600">
                                  Detalle: la categoría supera el presupuesto del entregable (sobreconsumo{" "}
                                  {detalleSobreconsumo.row.sobreconsumo.toFixed(1)} h).
                                </div>
                              ) : null}
                            </span>
                            {puedeMarcarRevisionAlerta && !revisada ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-r6 px-2 text-[10px] font-semibold"
                                onClick={() => {
                                  setMarcarMotivo("AJUSTE_MENOR");
                                  setMarcarEstado("REVISADA");
                                  setMarcarComentario("");
                                  setMarcarAlertaDraft({
                                    tipo: "BLOQUE_4_VENTANAS_SOLAPADAS",
                                    clave_alerta: clave,
                                    proyecto_id: row.proyecto_id,
                                    entregable_id: row.entregable_id,
                                    profesional_id: row.profesional_id,
                                    categoria: row.categoria,
                                    descripcion,
                                    proyecto_label: pr ? `${pr.codigo} · ${pr.nombre}` : row.proyecto_id,
                                    entregable_label: ent?.nombre ?? row.entregable_id,
                                    profesional_label: nombre,
                                    categoria_label: row.categoria,
                                  });
                                }}
                              >
                                Marcar revisada
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}

                      {alertasCategoriasSobreconsumidasPresupuesto.length > 0 ? (
                        alertasBloque3Vista.map(({ row, revisada }) => {
                          const ent = data.entregables.find((e) => e.id === row.entregable_id);
                          const proyecto_id = ent?.proyecto_id ?? "";
                          const clave = claveAlertaBloque3(proyecto_id, row.entregable_id, row.categoria);
                          const kCatEnt = keyCatEntAsignacion(proyecto_id, row.entregable_id, row.categoria);
                          if (catEntHigherKeys.has(kCatEnt)) return null;
                          const descripcion = `Sobreconsumo ${row.categoria}: ${row.sobreconsumo.toFixed(1)} h en «${row.proyecto_linea} / ${row.entregable_nombre}»`;
                          return (
                            <li key={clave} className="flex flex-wrap items-center justify-between gap-2">
                              <span className="min-w-0 flex-1">
                                <span className="mr-2 font-semibold text-t500">ADVERTENCIA</span>
                                {revisada ? <span className="mr-2 text-[10px] font-semibold text-t400">Revisada</span> : null}
                                <span className="font-semibold">—</span> ·{" "}
                                <span className="break-words">{row.proyecto_linea} / {row.entregable_nombre}</span> · La categoría supera el presupuesto del entregable.
                                <div className="mt-1 text-[11px] text-t600">
                                  Detalle: sobreconsumo {row.sobreconsumo.toFixed(1)} h.
                                </div>
                              </span>
                              {puedeMarcarRevisionAlerta && !revisada ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 rounded-r6 px-2 text-[10px] font-semibold"
                                  onClick={() => {
                                    setMarcarMotivo("PROYECTO_CERRADO_HISTORICO");
                                    setMarcarEstado("REVISADA");
                                    setMarcarComentario("");
                                    setMarcarAlertaDraft({
                                      tipo: "BLOQUE_3_SOBRECONSUMO_CATEGORIA",
                                      clave_alerta: clave,
                                      proyecto_id,
                                      entregable_id: row.entregable_id,
                                      profesional_id: null,
                                      categoria: row.categoria,
                                      descripcion,
                                      proyecto_label: row.proyecto_linea,
                                      entregable_label: row.entregable_nombre,
                                      profesional_label: null,
                                      categoria_label: row.categoria,
                                    });
                                  }}
                                >
                                  Marcar revisada
                                </Button>
                              ) : null}
                            </li>
                          );
                        })
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Dialog
              open={marcarAlertaDraft != null}
              onOpenChange={(open) => {
                if (!open) setMarcarAlertaDraft(null);
              }}
            >
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Marcar alerta como revisada</DialogTitle>
                  <DialogDescription className="text-[13px] text-t700">
                    La alerta técnica sigue calculándose igual; solo se archiva en la vista principal.
                  </DialogDescription>
                </DialogHeader>
                {marcarAlertaDraft ? (
                  <div className="space-y-3 text-[12px] text-t800">
                    <div>
                      <span className="font-semibold text-t600">Tipo:</span>{" "}
                      {LABEL_TIPO_ALERTA_OPERATIVA[marcarAlertaDraft.tipo]}
                    </div>
                    <div>
                      <span className="font-semibold text-t600">Proyecto:</span> {marcarAlertaDraft.proyecto_label}
                    </div>
                    <div>
                      <span className="font-semibold text-t600">Entregable:</span> {marcarAlertaDraft.entregable_label}
                    </div>
                    {marcarAlertaDraft.profesional_label ? (
                      <div>
                        <span className="font-semibold text-t600">Profesional:</span>{" "}
                        {marcarAlertaDraft.profesional_label}
                      </div>
                    ) : null}
                    {marcarAlertaDraft.categoria_label ? (
                      <div>
                        <span className="font-semibold text-t600">Categoría:</span> {marcarAlertaDraft.categoria_label}
                      </div>
                    ) : null}
                    <div className="rounded-r8 border border-bdr bg-surface2 px-3 py-2 text-[11px] text-t700">
                      <span className="font-semibold text-t600">Descripción:</span> {marcarAlertaDraft.descripcion}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-t600">Estado</Label>
                      <select
                        value={marcarEstado}
                        onChange={(e) => setMarcarEstado(e.target.value as EstadoAlertaRevisada)}
                        className="w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px]"
                      >
                        <option value="REVISADA">Revisada</option>
                        <option value="ACEPTADA">Aceptada</option>
                        <option value="NO_ACCIONABLE">No accionable</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-t600">Motivo</Label>
                      <select
                        value={marcarMotivo}
                        onChange={(e) => setMarcarMotivo(e.target.value as MotivoRevisionPreset)}
                        className="w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px]"
                      >
                        {MOTIVO_REVISION_OPCIONES.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-t600">
                        Comentario <span className="text-rose-700">*</span>
                      </Label>
                      <Textarea
                        value={marcarComentario}
                        onChange={(e) => setMarcarComentario(e.target.value)}
                        placeholder="Obligatorio: contexto de la decisión"
                        className="min-h-[88px] text-[13px]"
                      />
                    </div>
                  </div>
                ) : null}
                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => setMarcarAlertaDraft(null)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#0D9488] hover:bg-[#0F766E]"
                    disabled={
                      !marcarAlertaDraft ||
                      marcarComentario.trim().length === 0 ||
                      !puedeMarcarRevisionAlerta
                    }
                    onClick={() => {
                      if (!marcarAlertaDraft || marcarComentario.trim().length === 0) return;
                      const motivoLabel =
                        MOTIVO_REVISION_OPCIONES.find((x) => x.id === marcarMotivo)?.label ?? marcarMotivo;
                      data.marcarAlertaRevisada({
                        tipo_alerta: marcarAlertaDraft.tipo,
                        clave_alerta: marcarAlertaDraft.clave_alerta,
                        proyecto_id: marcarAlertaDraft.proyecto_id,
                        entregable_id: marcarAlertaDraft.entregable_id,
                        profesional_id: marcarAlertaDraft.profesional_id,
                        categoria: marcarAlertaDraft.categoria,
                        motivo_revision: motivoLabel,
                        comentario: marcarComentario.trim(),
                        estado: marcarEstado,
                        revisado_por: user ?? "—",
                      });
                      setMarcarAlertaDraft(null);
                      setMarcarComentario("");
                    }}
                  >
                    Guardar revisión
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <div className="mb-3 flex flex-wrap items-end gap-4 rounded-r10 border border-bdr bg-surface2/70 px-4 py-3">
              <label className="flex min-w-[220px] max-w-[min(100%,28rem)] flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-t500">Profesional</span>
                <select
                  value={asignacionesListadoProfesionalId}
                  onChange={(ev) => setAsignacionesListadoProfesionalId(ev.target.value)}
                  className="w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px] text-t800 shadow-sm outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                >
                  <option value="">Todos los profesionales</option>
                  {profesionalesOrdenadosNombre.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre_completo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[260px] max-w-[min(100%,32rem)] flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-t500">Proyecto</span>
                <select
                  value={asignacionesListadoProyectoId}
                  onChange={(ev) => {
                    setAsignacionesListadoProyectoId(ev.target.value);
                    setAsignacionesListadoEntregableId("");
                  }}
                  className="w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px] text-t800 shadow-sm outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                >
                  {asignacionesProyectoOptions.map((o) => (
                    <option key={o.value || "__all__"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[260px] max-w-[min(100%,32rem)] flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-t500">Entregable</span>
                <select
                  value={asignacionesListadoEntregableId}
                  onChange={(ev) => setAsignacionesListadoEntregableId(ev.target.value)}
                  className="w-full rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px] text-t800 shadow-sm outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                >
                  {asignacionesEntregableOptions.map((o) => (
                    <option key={o.value || "__all_ent__"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[168px] flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-t500">Estado listado</span>
                <select
                  value={asignacionesListadoEstado}
                  onChange={(ev) =>
                    setAsignacionesListadoEstado(ev.target.value as AsignacionesListadoEstadoFiltro)
                  }
                  className="rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px] text-t800 shadow-sm outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                >
                  <option value="todas">Todas</option>
                  <option value="activas">Activas</option>
                  <option value="cerradas">Cerradas</option>
                </select>
              </label>
              <span className="pb-2 text-[11px] text-t500">
                Listado: <strong className="text-t700">{asignacionesHorasListadoTabla.length}</strong> de{" "}
                <strong className="text-t700">{data.asignaciones_horas.length}</strong> en datos
              </span>
            </div>
            <p className="mb-2 text-[11px] leading-snug text-t600">
              Gasto real total se obtiene desde RegistroHora. Asignado total corresponde a la suma de asignaciones activas
              y cerradas del mismo profesional, entregable y categoría.
            </p>
            <EntityTable<AsignacionHora>
              data={asignacionesHorasListadoTabla}
              entityLabel="asignaciones"
              emptyWhenNoRows={
                data.asignaciones_horas.length > 0 && asignacionesHorasListadoTabla.length === 0
                  ? {
                      title: "Ninguna asignación coincide con los filtros del listado",
                      subtitle: "Cambiá profesional o estado, o combiná con el buscador.",
                    }
                  : undefined
              }
              searchFields={[
                "categoria",
                "estado",
                "fecha_inicio_vigencia",
                "fecha_cierre",
                "horas_comprometidas",
              ]}
              searchExtraText={(a) => {
                const ent = data.entregables.find((en) => en.id === a.entregable_id);
                const pr = data.proyectos.find((p) => p.id === a.proyecto_id);
                const prof = data.profesionales.find((p) => p.id === a.profesional_id);
                return [
                  ent?.nombre,
                  ent?.fase_codigo,
                  pr?.codigo,
                  pr?.nombre,
                  prof?.nombre_completo,
                  prof?.codigo,
                  prof?.email,
                  a.rol_en_entregable,
                  a.es_sobrecupo ? "Sobrecupo" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
              }}
              columns={[
                {
                  key: "profesional_id",
                  header: "Prof.",
                  render: (a) => {
                    const t = data.profesionales.find((p) => p.id === a.profesional_id)?.nombre_completo || "—";
                    return (
                      <span className="block max-w-[10rem] truncate" title={t}>
                        {t}
                      </span>
                    );
                  },
                },
                {
                  key: "proyecto_codigo_lista",
                  header: "Proj.",
                  render: (a) => {
                    const t = data.proyectos.find((p) => p.id === a.proyecto_id)?.codigo || "—";
                    return (
                      <span className="block max-w-[5.5rem] truncate font-mono text-[11.5px]" title={t}>
                        {t}
                      </span>
                    );
                  },
                },
                {
                  key: "fase_ent_lista",
                  header: "Fase",
                  render: (a) => {
                    const ent = data.entregables.find((e) => e.id === a.entregable_id);
                    const raw = (ent?.fase_codigo ?? "").trim();
                    const t = raw || "—";
                    return (
                      <span className="block max-w-[4.5rem] truncate font-mono text-[11px]" title={raw || undefined}>
                        {t}
                      </span>
                    );
                  },
                },
                {
                  key: "entregable_id",
                  header: "Entreg.",
                  render: (a) => {
                    const t = data.entregables.find((e) => e.id === a.entregable_id)?.nombre || "—";
                    return (
                      <span className="block max-w-[11rem] truncate" title={t}>
                        {t}
                      </span>
                    );
                  },
                },
                {
                  key: "rol_en_entregable",
                  header: "Rol",
                  render: (a) => (
                    <span className="text-[11px] font-semibold uppercase text-t700">{a.rol_en_entregable}</span>
                  ),
                },
                {
                  key: "categoria",
                  header: "Cat.",
                  render: (a) => <span className="font-mono text-[11px] font-semibold">{a.categoria}</span>,
                },
                {
                  key: "horas_comprometidas",
                  header: "Comp.",
                  render: (a) => <span className="font-mono">{Number(a.horas_comprometidas).toFixed(1)}</span>,
                },
                {
                  key: "gasto_real_total_f1",
                  header: "Gasto real",
                  render: (a) => {
                    const r = resumenFase1PorTriple.get(`${a.profesional_id}\x00${a.entregable_id}\x00${a.categoria}`);
                    if (!r) return <span className="text-t400">—</span>;
                    return <span className="font-mono">{r.gasto_real_total.toFixed(1)}</span>;
                  },
                },
                {
                  key: "asignado_total_f1",
                  header: "Asig. tot.",
                  render: (a) => {
                    const r = resumenFase1PorTriple.get(`${a.profesional_id}\x00${a.entregable_id}\x00${a.categoria}`);
                    if (!r) return <span className="text-t400">—</span>;
                    return <span className="font-mono">{r.horas_asignadas_totales.toFixed(1)}</span>;
                  },
                },
                {
                  key: "saldo_deficit_f1",
                  header: "Saldo/Def.",
                  render: (a) => {
                    const r = resumenFase1PorTriple.get(`${a.profesional_id}\x00${a.entregable_id}\x00${a.categoria}`);
                    if (!r) return <span className="text-t400">—</span>;
                    const saldo = r.saldo;
                    const isDef = r.deficit > 1e-6;
                    return (
                      <span className={`font-mono font-semibold ${isDef ? "text-[#B91C1C]" : "text-t800"}`}>
                        {saldo.toFixed(1)}
                      </span>
                    );
                  },
                },
                {
                  key: "horas_gastadas_b2",
                  header: "Gast. vent. / cierre",
                  render: (a) => {
                    if (a.estado === "CERRADA") {
                      const g = a.horas_gastadas_imputadas_al_cierre;
                      return g != null ? <span className="font-mono">{g.toFixed(1)}</span> : "—";
                    }
                    if (a.estado !== "ACTIVA") {
                      return <span className="text-t400">—</span>;
                    }
                    const g = gastoPorAsignacionBloque2.get(a.id)?.gastadas ?? 0;
                    return <span className="font-mono">{g.toFixed(1)}</span>;
                  },
                },
                {
                  key: "horas_pendientes_b2",
                  header: "Pend.",
                  render: (a) => {
                    if (a.estado === "CERRADA") {
                      return <span className="text-t400">—</span>;
                    }
                    if (a.estado !== "ACTIVA") {
                      return <span className="text-t400">—</span>;
                    }
                    const p = gastoPorAsignacionBloque2.get(a.id)?.pendientes ?? a.horas_comprometidas;
                    return (
                      <span className={`font-mono ${p < 0 ? "text-[#B91C1C]" : ""}`}>{p.toFixed(1)}</span>
                    );
                  },
                },
                {
                  key: "semaforo_b4",
                  header: "Sem.",
                  render: (a) => {
                    const g =
                      a.estado === "ACTIVA" ? (gastoPorAsignacionBloque2.get(a.id)?.gastadas ?? 0) : 0;
                    return (
                      <TablaAsignacionSemaforoCell
                        estado={a.estado}
                        gastadas={g}
                        comprometidas={a.horas_comprometidas}
                      />
                    );
                  },
                },
                {
                  key: "estado",
                  header: "Estado",
                  render: (a) => (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <span
                        className={`inline-block max-w-[4.5rem] truncate text-[10px] font-semibold uppercase ${a.estado === "ACTIVA" ? "text-[#047857]" : "text-t500"}`}
                        title={a.estado}
                      >
                        {a.estado}
                      </span>
                      {a.es_sobrecupo ? (
                        <span
                          className="inline-block rounded-r4 bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-900"
                          title={
                            a.comentario_sobrecupo
                              ? `Sobrecupo · ${a.comentario_sobrecupo}${a.fecha_autorizacion_sobrecupo ? ` · ${a.fecha_autorizacion_sobrecupo}` : ""}`
                              : "Asignación creada sobre cupo de categoría"
                          }
                        >
                          Sobrecupo
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: "fecha_inicio_vigencia",
                  header: "Inicio",
                  render: (a) => (
                    <span className="block max-w-[6.25rem] truncate font-mono text-[11px]" title={a.fecha_inicio_vigencia}>
                      {a.fecha_inicio_vigencia}
                    </span>
                  ),
                },
                {
                  key: "fecha_cierre",
                  header: "Cierre",
                  render: (a) => {
                    const v = a.fecha_cierre ?? "—";
                    return (
                      <span className="block max-w-[6.25rem] truncate font-mono text-[11px]" title={v === "—" ? undefined : v}>
                        {v}
                      </span>
                    );
                  },
                },
                {
                  key: "horas_devueltas",
                  header: "Dev.",
                  render: (a) =>
                    a.horas_devueltas_presupuesto != null ? (
                      <span className="font-mono">{a.horas_devueltas_presupuesto.toFixed(1)}</span>
                    ) : (
                      "—"
                    ),
                },
              ]}
              onEdit={handleEditFromList}
              extraRowActions={(a) =>
                a.estado === "ACTIVA" ? (
                  <button
                    type="button"
                    onClick={() => setCerrarAsignacion(a)}
                    className="inline-flex items-center rounded-r4 p-1.5 text-t500 transition-colors hover:bg-[#ECFDF5] hover:text-[#047857]"
                    title="Cerrar asignación"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </button>
                ) : null
              }
              onDelete={(item) => {
                const ent = data.entregables.find((e) => e.id === item.entregable_id);
                const prof = data.profesionales.find((p) => p.id === item.profesional_id);
                setDeleteItem({
                  id: item.id,
                  name: `${ent?.nombre ?? "Entregable"} — ${prof?.nombre_completo ?? "Prof."} (${item.horas_comprometidas} h)`,
                });
              }}
              renderMobileCard={(a) => {
                const prof = data.profesionales.find((p) => p.id === a.profesional_id);
                const pr = data.proyectos.find((p) => p.id === a.proyecto_id);
                const ent = data.entregables.find((e) => e.id === a.entregable_id);
                const r = resumenFase1PorTriple.get(`${a.profesional_id}\x00${a.entregable_id}\x00${a.categoria}`);
                const gastoAct =
                  a.estado === "ACTIVA" ? (gastoPorAsignacionBloque2.get(a.id)?.gastadas ?? 0) : null;
                const pendAct =
                  a.estado === "ACTIVA"
                    ? (gastoPorAsignacionBloque2.get(a.id)?.pendientes ?? a.horas_comprometidas)
                    : null;
                return (
                  <>
                    <MobileCardRow label="Profesional">{prof?.nombre_completo ?? "—"}</MobileCardRow>
                    <MobileCardRow label="Proyecto">{pr ? `${pr.codigo} · ${pr.nombre}` : "—"}</MobileCardRow>
                    <MobileCardRow label="Entregable">{ent?.nombre ?? "—"}</MobileCardRow>
                    <MobileCardRow label="Rol">
                      <span className="uppercase">{a.rol_en_entregable}</span>
                    </MobileCardRow>
                    <MobileCardRow label="Categoría">
                      <span className="font-mono font-semibold">{a.categoria}</span>
                    </MobileCardRow>
                    <MobileCardRow label="Comprometidas">
                      <span className="font-mono">{Number(a.horas_comprometidas).toFixed(1)} h</span>
                    </MobileCardRow>
                    {r ? (
                      <MobileCardRow label="Gasto / saldo">
                        <span className="font-mono">
                          Gasto {r.gasto_real_total.toFixed(1)} ·{" "}
                          <span className={r.deficit > 1e-6 ? "font-semibold text-[#B91C1C]" : ""}>
                            Saldo {r.saldo.toFixed(1)}
                          </span>
                        </span>
                      </MobileCardRow>
                    ) : null}
                    {a.estado === "ACTIVA" && gastoAct != null ? (
                      <MobileCardRow label="Ventana activa">
                        <span className="font-mono">
                          Gastadas {gastoAct.toFixed(1)} · Pend. {pendAct!.toFixed(1)}
                        </span>
                      </MobileCardRow>
                    ) : null}
                    <MobileCardRow label="Estado">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <span className={`text-[11px] font-semibold uppercase ${a.estado === "ACTIVA" ? "text-[#047857]" : "text-t500"}`}>
                          {a.estado}
                        </span>
                        {a.es_sobrecupo ? (
                          <span className="rounded-r4 bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-900">
                            Sobrecupo
                          </span>
                        ) : null}
                      </span>
                    </MobileCardRow>
                    <MobileCardRow label="Vigencia">
                      <span className="font-mono text-[12px]">
                        {a.fecha_inicio_vigencia} → {a.fecha_cierre ?? "—"}
                      </span>
                    </MobileCardRow>
                  </>
                );
              }}
            />
          </>
        );
      case "registro_horas":
        return (
          <EntityTable<RegistroHora>
            data={data.registro_horas}
            entityLabel="registros de horas"
            searchFields={["fecha", "descripcion", "tipo_hora", "proyecto_id", "entregable_id"]}
            searchExtraText={(r) =>
              registroHoraTablaSearchBlob(r, data.profesionales, data.proyectos, data.entregables)
            }
            columns={[
              {
                key: "profesional_id",
                header: "Profesional",
                render: (r) => data.profesionales.find((p) => p.id === r.profesional_id)?.nombre_completo || "—",
              },
              { key: "fecha", header: "Fecha" },
              {
                key: "tipo_hora",
                header: "Tipo",
                render: (r) => {
                  const cfg: Record<string, { bg: string; text: string }> = {
                    DIRECTA: { bg: "#ECFDF5", text: "#047857" },
                    INDIRECTA: { bg: "#FFF7ED", text: "#B45309" },
                    VACACIONES: { bg: "#F1F5F9", text: "#475569" },
                  };
                  const s = cfg[r.tipo_hora];
                  return <span className="rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: s.bg, color: s.text }}>{r.tipo_hora}</span>;
                },
              },
              {
                key: "proyecto_id",
                header: "Proyecto",
                tdClassName: "whitespace-normal align-top max-w-[240px]",
                render: (r) => {
                  const pid = (r.proyecto_id ?? "").trim();
                  if (!pid) return <span className="text-t400">—</span>;
                  const pr = data.proyectos.find((p) => p.id === pid);
                  if (!pr) {
                    return (
                      <div className="space-y-0.5">
                        <span className="text-[12.5px] text-amber-800">{pid}</span>
                        <span className="block text-[10px] leading-snug text-amber-700/95">Proyecto no encontrado</span>
                      </div>
                    );
                  }
                  const line = `${pr.codigo} · ${pr.nombre}`;
                  return <div className="text-[12.5px] text-t900">{line}</div>;
                },
              },
              {
                key: "entregable_id",
                header: "Entregable",
                tdClassName: "whitespace-normal align-top max-w-[280px]",
                render: (r) => {
                  if (r.tipo_hora !== "DIRECTA") return <span className="text-t400">—</span>;
                  const eid = (r.entregable_id ?? "").trim();
                  if (!eid) return <span className="text-t400">—</span>;
                  const ent = data.entregables.find((e) => e.id === eid);
                  if (!ent) {
                    return (
                      <div className="space-y-0.5">
                        <span className="text-[12.5px] text-amber-800">Entregable no encontrado</span>
                        <span className="block text-[10px] leading-snug text-amber-700/95">id: {eid}</span>
                      </div>
                    );
                  }
                  const line = registroHoraEntregableDisplayLine(ent);
                  return <div className="text-[12.5px] text-t900">{line}</div>;
                },
              },
              { key: "horas", header: "Horas" },
              { key: "descripcion", header: "Descripción" },
              {
                key: "normalizacion",
                header: "Normalización",
                tdClassName: "whitespace-normal align-top min-w-[140px]",
                render: (r) => {
                  if (r.tipo_hora !== "DIRECTA") return <span className="text-t400">—</span>;
                  const alerta = alertaNormalizacionPorRegistroId.get(r.id);
                  if (!alerta) return null;
                  const eid = (r.entregable_id ?? "").trim();
                  const pid = (r.profesional_id ?? "").trim();
                  if (!eid || !pid) return null;
                  const fmtH = (n: number) =>
                    n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
                  const badge =
                    alerta.kind === "sin_asignacion" ? (
                      <span className="rounded-r6 border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                        Sin asignación
                      </span>
                    ) : (
                      <span className="rounded-r6 border border-orange-200/80 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-900">
                        Déficit {fmtH(alerta.deficit)} h
                      </span>
                    );
                  return (
                    <div className="flex flex-col items-start gap-1.5">
                      {badge}
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          irANormalizarAsignacion({
                            clienteId: alerta.clienteId,
                            proyectoId: alerta.proyectoId,
                            entregableId: eid,
                            profesionalId: pid,
                            horasSugeridas: alerta.horasSugeridas,
                          });
                        }}
                        className="rounded-r6 border border-bdr bg-white px-2 py-0.5 text-[10px] font-semibold text-t700 shadow-sm hover:bg-surface2"
                      >
                        Normalizar
                      </button>
                    </div>
                  );
                },
              },
            ]}
            onEdit={handleEditFromList}
            onDelete={(item) => setDeleteItem({ id: item.id, name: `${item.fecha} — ${item.horas} hrs` })}
            renderMobileCard={(r) => {
              const prof = data.profesionales.find((p) => p.id === r.profesional_id);
              const pid = (r.proyecto_id ?? "").trim();
              const pr = pid ? data.proyectos.find((p) => p.id === pid) : null;
              const eid = (r.entregable_id ?? "").trim();
              const ent = eid ? data.entregables.find((e) => e.id === eid) : null;
              const alerta = alertaNormalizacionPorRegistroId.get(r.id);
              return (
                <>
                  <MobileCardRow label="Profesional">{prof?.nombre_completo ?? "—"}</MobileCardRow>
                  <MobileCardRow label="Fecha">
                    <span className="font-mono">{r.fecha}</span>
                  </MobileCardRow>
                  <MobileCardRow label="Tipo">{registroTipoBadge(r.tipo_hora)}</MobileCardRow>
                  <MobileCardRow label="Proyecto">
                    {pr ? `${pr.codigo} · ${pr.nombre}` : pid ? pid : "—"}
                  </MobileCardRow>
                  <MobileCardRow label="Entregable">
                    {r.tipo_hora === "DIRECTA"
                      ? ent
                        ? registroHoraEntregableDisplayLine(ent)
                        : eid || "—"
                      : "—"}
                  </MobileCardRow>
                  <MobileCardRow label="Horas">
                    <span className="font-mono font-semibold">{r.horas}</span>
                  </MobileCardRow>
                  {r.descripcion?.trim() ? (
                    <MobileCardRow label="Descripción">
                      <span className="line-clamp-3">{r.descripcion}</span>
                    </MobileCardRow>
                  ) : null}
                  {alerta ? (
                    <MobileCardRow label="Alerta">
                      {alerta.kind === "sin_asignacion" ? (
                        <span className="rounded-r6 border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          Sin asignación
                        </span>
                      ) : (
                        <span className="rounded-r6 border border-orange-200/80 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-900">
                          Déficit {alerta.deficit.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h
                        </span>
                      )}
                    </MobileCardRow>
                  ) : null}
                </>
              );
            }}
            renderMobileCardExtra={(r) => {
              if (r.tipo_hora !== "DIRECTA") return null;
              const alerta = alertaNormalizacionPorRegistroId.get(r.id);
              if (!alerta) return null;
              const eid = (r.entregable_id ?? "").trim();
              const pid = (r.profesional_id ?? "").trim();
              if (!eid || !pid) return null;
              return (
                <button
                  type="button"
                  onClick={() =>
                    irANormalizarAsignacion({
                      clienteId: alerta.clienteId,
                      proyectoId: alerta.proyectoId,
                      entregableId: eid,
                      profesionalId: pid,
                      horasSugeridas: alerta.horasSugeridas,
                    })
                  }
                  className="flex min-h-[44px] w-full items-center justify-center rounded-r8 border border-copper/40 bg-copper-bg px-4 py-2.5 text-[13px] font-semibold text-copper shadow-sm transition-colors hover:bg-copper/10"
                >
                  Normalizar → Asignación
                </button>
              );
            }}
          />
        );
      case "pipeline":
        return (
          <EntityTable<Pipeline>
            data={data.pipeline}
            entityLabel="pipeline"
            searchFields={["cliente", "nombre_proyecto", "etapa", "estado"]}
            searchExtraText={(pl) => {
              const pm = data.pm_internos.find((m) => m.id === pl.pm_responsable_id);
              const cli = data.clientes.find((c) => c.id === pl.cliente_id);
              const pmTxt = pm ? `${pm.codigo} ${pm.nombre}` : "";
              const cliTxt = cli ? `${cli.codigo} ${cli.nombre}` : pl.cliente || "";
              return [cliTxt, pmTxt].filter(Boolean).join(" ");
            }}
            columns={[
              {
                key: "cliente",
                header: "Cliente",
                render: (pl) => {
                  const c = data.clientes.find((x) => x.id === pl.cliente_id);
                  return c ? `${c.codigo} · ${c.nombre}` : pl.cliente || "—";
                },
              },
              {
                key: "pm_responsable_id",
                header: "PM",
                render: (pl) => data.pm_internos.find((m) => m.id === pl.pm_responsable_id)?.codigo ?? "—",
              },
              { key: "nombre_proyecto", header: "Proyecto" },
              {
                key: "etapa",
                header: "Etapa",
                render: (pl) => {
                  const cfg: Record<string, { bg: string; text: string }> = {
                    CONCEPTUAL: { bg: "#ECFDF5", text: "#047857" },
                    FACTIBILIDAD: { bg: "#E0E7FF", text: "#4F46E5" },
                    DETALLE: { bg: "#F5F3FF", text: "#8B5CF6" },
                  };
                  const s = cfg[pl.etapa];
                  return <span className="rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: s.bg, color: s.text }}>{pl.etapa}</span>;
                },
              },
              {
                key: "estado",
                header: "Estado",
                render: (pl) => {
                  const cfg: Record<string, { bg: string; text: string }> = {
                    EN_ESPERA: { bg: "#FFF7ED", text: "#B45309" },
                    EN_COTIZACION: { bg: "#ECFDF5", text: "#047857" },
                    APROBADO: { bg: "#E0E7FF", text: "#4F46E5" },
                    RECHAZADO: { bg: "#F1F5F9", text: "#475569" },
                  };
                  const s = cfg[pl.estado];
                  return <span className="rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: s.bg, color: s.text }}>{pl.estado.replace("_", " ")}</span>;
                },
              },
              {
                key: "monto_uf",
                header: "UF",
                render: (pl) =>
                  pl.monto_uf != null && Number.isFinite(pl.monto_uf)
                    ? Number(pl.monto_uf).toLocaleString("es-CL", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })
                    : "—",
              },
              {
                key: "hrs",
                header: "Σ hrs",
                render: (pl) => (pl.hrs_L2 + pl.hrs_P4 + pl.hrs_P3 + pl.hrs_P2).toFixed(1),
              },
            ]}
            onEdit={handleEditFromList}
            onDelete={(item) => setDeleteItem({ id: item.id, name: item.nombre_proyecto })}
          />
        );
      case "carga_mensual":
        return (
          <EntityTable<CargaMensual>
            data={data.carga_mensual}
            entityLabel="carga mensual"
            searchFields={["mes_iso"]}
            searchExtraText={(cm) => {
              if (!cm.profesional_id) return "Equipo";
              return data.profesionales.find((p) => p.id === cm.profesional_id)?.nombre_completo ?? "";
            }}
            columns={[
              { key: "mes_iso", header: "Mes" },
              {
                key: "profesional_id",
                header: "Profesional",
                render: (cm) => cm.profesional_id ? data.profesionales.find((p) => p.id === cm.profesional_id)?.nombre_completo || "—" : "Equipo",
              },
              { key: "hrs_directas", header: "Directas" },
              { key: "hrs_indirectas", header: "Indirectas" },
              { key: "hrs_vacaciones", header: "Vacaciones" },
              { key: "hrs_objetivo", header: "Objetivo" },
            ]}
            onEdit={handleEditFromList}
            onDelete={(item) => setDeleteItem({ id: item.id, name: item.mes_iso })}
          />
        );
      case "curvas_objetivo_anual":
        return (
          <EntityTable<CurvaObjetivoAnual>
            data={data.curvas_objetivo_anual}
            entityLabel="curvas objetivo anual"
            searchFields={["anio", "nombre", "descripcion"]}
            columns={[
              { key: "anio", header: "Año" },
              { key: "nombre", header: "Nombre" },
              {
                key: "horas_maximas_mensuales_por_profesional",
                header: "H. máx./prof./mes",
                render: (c) => <span className="font-mono">{Number(c.horas_maximas_mensuales_por_profesional).toFixed(1)}</span>,
              },
              {
                key: "objetivo_acumulado_dic",
                header: "Obj. acum. (dic.)",
                render: (c) => {
                  const ordenados = [...c.meses].sort((a, b) => a.mes - b.mes);
                  const dic = ordenados[11];
                  const v = dic?.objetivo_acumulado;
                  return <span className="font-mono font-semibold text-[#047857]">{Number.isFinite(v) ? v!.toFixed(1) : "—"}</span>;
                },
              },
            ]}
            onEdit={handleEditFromList}
            onDelete={(item) => setDeleteItem({ id: item.id, name: `${item.anio} — ${item.nombre}` })}
          />
        );
      default:
        return null;
    }
  };

  const color = entityColors[activeEntity];

  const registroTipoBadge = (tipo: RegistroHora["tipo_hora"]) => {
    const cfg: Record<string, { bg: string; text: string }> = {
      DIRECTA: { bg: "#ECFDF5", text: "#047857" },
      INDIRECTA: { bg: "#FFF7ED", text: "#B45309" },
      VACACIONES: { bg: "#F1F5F9", text: "#475569" },
    };
    const s = cfg[tipo];
    return (
      <span className="rounded-r4 px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: s.bg, color: s.text }}>
        {tipo}
      </span>
    );
  };

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
      <SectionHeader number="CRUD" title="Centro de Datos · Formularios de Ingreso" hint="Gestiona toda la información que alimenta el dashboard" />

      {/* Entity selector cards */}
      <EntitySelector
        active={activeEntity}
        counts={counts}
        onSelect={(e) => {
          setActiveEntity(e);
          setEditItem(null);
          if (e !== "registro_horas") setVistaRegistroHoras("operativo");
        }}
      />

      {activeEntity === "registro_horas" && (
        <div className="mb-4 flex flex-wrap gap-2 rounded-r12 border border-bdr bg-white p-1.5 shadow-sh1">
          <button
            type="button"
            onClick={() => setVistaRegistroHoras("operativo")}
            className={`inline-flex items-center gap-2 rounded-r8 px-4 py-2.5 text-[13px] font-medium transition-colors ${
              vistaRegistroHoras === "operativo"
                ? "bg-[#B45309] text-white shadow-sm"
                : "text-t600 hover:bg-surface2"
            }`}
          >
            <LayoutGrid size={16} strokeWidth={2} />
            Operativo
          </button>
          <button
            type="button"
            onClick={() => setVistaRegistroHoras("auditoria")}
            className={`inline-flex items-center gap-2 rounded-r8 px-4 py-2.5 text-[13px] font-medium transition-colors ${
              vistaRegistroHoras === "auditoria"
                ? "bg-[#B45309] text-white shadow-sm"
                : "text-t600 hover:bg-surface2"
            }`}
          >
            <ClipboardList size={16} strokeWidth={2} />
            Auditoría histórica · brechas
          </button>
        </div>
      )}

      {activeEntity === "registro_horas" && vistaRegistroHoras === "operativo" && (
        <div className="mb-4 overflow-hidden rounded-r12 border border-bdr bg-white shadow-sh1">
          <div className="border-b border-bdr bg-surface2 px-4 py-3 sm:px-6">
            <h3 className="text-[13px] font-semibold text-t900">Horas cargadas por tipo</h3>
            <p className="mt-0.5 text-[11px] text-t500">
              Suma de todos los registros en datos (<span className="font-mono">tipo_hora</span> +{" "}
              <span className="font-mono">horas</span>); sin filtrar por entregable ni asignación. No altera consumo
              real del entregable.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
            <div className="rounded-r10 border border-bdr bg-surface2/80 px-3 py-3 sm:px-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-t400">Directas</p>
              <p className="mt-1 font-mono text-[1.1rem] font-semibold tabular-nums text-t900">
                {fmtNumBrecha(totalesRegistroHorasPorTipo.directa)} h
              </p>
            </div>
            <div className="rounded-r10 border border-bdr bg-surface2/80 px-3 py-3 sm:px-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-t400">Indirectas</p>
              <p className="mt-1 font-mono text-[1.1rem] font-semibold tabular-nums text-t900">
                {fmtNumBrecha(totalesRegistroHorasPorTipo.indirecta)} h
              </p>
            </div>
            <div className="rounded-r10 border border-bdr bg-surface2/80 px-3 py-3 sm:px-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-t400">Vacaciones</p>
              <p className="mt-1 font-mono text-[1.1rem] font-semibold tabular-nums text-t900">
                {fmtNumBrecha(totalesRegistroHorasPorTipo.vacaciones)} h
              </p>
            </div>
            <div className="rounded-r10 border border-[#B45309]/35 bg-[#B45309]/08 px-3 py-3 sm:px-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9A3412]">Total general</p>
              <p className="mt-1 font-mono text-[1.1rem] font-semibold tabular-nums text-t900">
                {fmtNumBrecha(totalesRegistroHorasPorTipo.total)} h
              </p>
            </div>
          </div>
        </div>
      )}

      {activeEntity === "registro_horas" && vistaRegistroHoras === "auditoria" ? (
        <div className="mb-8 space-y-5">
          <div className="overflow-hidden rounded-r12 border border-bdr bg-white shadow-sh1">
            <div className="border-b border-bdr bg-surface2 px-6 py-4">
              <h3 className="font-playfair text-[1.05rem] font-semibold text-t900">
                Auditoría histórica · brechas de asignación
              </h3>
              <p className="mt-0.5 text-[12px] text-t300">
                Solo lectura. Compara gasto real (RegistroHora DIRECTO válido) frente a ventanas de asignación ACTIVA / CERRADA.
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-[12px] leading-relaxed text-t500">
                Una fila por par proyecto–entregable–profesional con consumo detectado. Vista rápida para normalización;
                el desplegable mantiene el resto de categorías.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-t600">Vista rápida</span>
                <button
                  type="button"
                  onClick={() => setFiltroCategoriaBrecha("todas")}
                  className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                    filtroCategoriaBrecha === "todas"
                      ? "border-[#B45309] bg-[#B45309] text-white shadow-sm"
                      : "border-bdr bg-white text-t700 hover:bg-surface2"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroCategoriaBrecha("SIN_ASIGNACION")}
                  className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                    filtroCategoriaBrecha === "SIN_ASIGNACION"
                      ? "border-[#B45309] bg-[#B45309] text-white shadow-sm"
                      : "border-bdr bg-white text-t700 hover:bg-surface2"
                  }`}
                >
                  Sin asignación
                </button>
                {filtroCategoriaBrecha !== "todas" && filtroCategoriaBrecha !== "SIN_ASIGNACION" ? (
                  <span className="text-[11px] text-t500">
                    Filtro: {LABEL_CATEGORIA_BRECHA[filtroCategoriaBrecha]} (usar desplegable)
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-r10 border border-bdr bg-surface2/80 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-t400">
                    Horas gasto · detector (todas las filas)
                  </p>
                  <p className="mt-1 font-mono text-[1.15rem] font-semibold tabular-nums text-t900">
                    {fmtNumBrecha(totalesAuditoriaBrechas.horasTodasDetector)} h
                  </p>
                  <p className="mt-0.5 text-[11px] text-t500">{totalesAuditoriaBrechas.nFilasDetector} filas</p>
                </div>
                <div className="rounded-r10 border border-bdr bg-surface2/80 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-t400">
                    Horas gasto · vista actual (filtrada)
                  </p>
                  <p className="mt-1 font-mono text-[1.15rem] font-semibold tabular-nums text-t900">
                    {fmtNumBrecha(totalesAuditoriaBrechas.horasVistaFiltrada)} h
                  </p>
                  <p className="mt-0.5 text-[11px] text-t500">{totalesAuditoriaBrechas.nFilasVista} filas visibles</p>
                </div>
                <div className="rounded-r10 border border-bdr bg-amber-500/12 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-950/80">
                    Horas gasto · solo «Sin asignación»
                  </p>
                  <p className="mt-1 font-mono text-[1.15rem] font-semibold tabular-nums text-t900">
                    {fmtNumBrecha(totalesAuditoriaBrechas.horasSinAsignacion)} h
                  </p>
                  <p className="mt-0.5 text-[11px] text-t600">
                    {totalesAuditoriaBrechas.nFilasSinAsignacion} filas · KPI fijo (cuadrar import / Excel)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="filtro-cat-brecha" className="text-[12px] font-medium text-t600">
                  Categoría (detalle)
                </label>
                <select
                  id="filtro-cat-brecha"
                  value={filtroCategoriaBrecha}
                  onChange={(ev) =>
                    setFiltroCategoriaBrecha(ev.target.value as "todas" | CategoriaBrechaHistorica)
                  }
                  className="rounded-r8 border border-bdr bg-white px-3 py-2 text-[13px] text-t800 shadow-sm outline-none focus:ring-2 focus:ring-[#B45309]/30"
                >
                  <option value="todas">Todas</option>
                  {(Object.keys(LABEL_CATEGORIA_BRECHA) as CategoriaBrechaHistorica[]).map((k) => (
                    <option key={k} value={k}>
                      {LABEL_CATEGORIA_BRECHA[k]}
                    </option>
                  ))}
                </select>
              </div>

              <DataTable
                headers={[
                  "Proyecto",
                  "Entregable",
                  "Profesional",
                  "1ª fecha gasto",
                  "Última fecha gasto",
                  "Hrs gasto",
                  "# regs",
                  "Hrs cubiertas",
                  "Hrs no cubiertas",
                  "Regs cubiertos",
                  "Regs no cubiertos",
                  "Categoría",
                  "Acción",
                ]}
                footerLeft={`${filasBrechasFiltradas.length} fila(s)`}
                footerRight="Solo lectura · detector sin cambios"
              >
                {filasBrechasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-6 py-14 text-center align-middle">
                      <p className="text-[13px] font-medium text-t700">
                        No se detectaron brechas históricas con los filtros actuales.
                      </p>
                      {filasBrechasHistoricas.length === 0 ? (
                        <p className="mt-2 text-[12px] text-t500">
                          No hay pares con gasto DIRECTO válido en el período analizado, o el conjunto no produce filas de auditoría.
                        </p>
                      ) : filtroCategoriaBrecha === "SIN_ASIGNACION" ? (
                        <p className="mt-2 text-[12px] text-t500">
                          No hay filas en «Sin asignación» con el conjunto actual. Use «Todos» u otra categoría para revisar el resto.
                        </p>
                      ) : (
                        <p className="mt-2 text-[12px] text-t500">Pruebe otra categoría o «Todas».</p>
                      )}
                    </td>
                  </tr>
                ) : (
                  filasBrechasFiltradas.map((row, idx) => {
                    const cs = CAT_STYLE_BRECHA[row.categoria_detector];
                    return (
                      <tr
                        key={`${row.proyecto_id}-${row.entregable_id}-${row.profesional_id}-${idx}`}
                        className="border-b border-bdr bg-white last:border-b-0"
                      >
                        <td className="whitespace-nowrap px-[14px] py-2.5 text-[12px] text-t800">
                          {row.proyecto_codigo ?? "—"}
                        </td>
                        <td className="max-w-[180px] truncate px-[14px] py-2.5 text-[12px] text-t800" title={row.entregable_nombre}>
                          {row.entregable_nombre ?? "—"}
                        </td>
                        <td className="max-w-[160px] truncate px-[14px] py-2.5 text-[12px] text-t800" title={row.profesional_nombre}>
                          {row.profesional_nombre ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-[14px] py-2.5 text-[12px] text-t700">{row.primera_fecha_gasto}</td>
                        <td className="whitespace-nowrap px-[14px] py-2.5 text-[12px] text-t700">{row.ultima_fecha_gasto}</td>
                        <td className="whitespace-nowrap px-[14px] py-2.5 text-[12px] tabular-nums text-t800">
                          {fmtNumBrecha(row.horas_totales_gasto)}
                        </td>
                        <td className="whitespace-nowrap px-[14px] py-2.5 text-[12px] tabular-nums text-t700">
                          {row.cantidad_registros}
                        </td>
                        <td className="whitespace-nowrap px-[14px] py-2.5 text-[12px] tabular-nums text-t700">
                          {fmtNumBrecha(row.horas_cubiertas)}
                        </td>
                        <td className="whitespace-nowrap px-[14px] py-2.5 text-[12px] tabular-nums text-t700">
                          {fmtNumBrecha(row.horas_no_cubiertas)}
                        </td>
                        <td className="whitespace-nowrap px-[14px] py-2.5 text-[12px] tabular-nums text-t700">
                          {row.registros_cubiertos}
                        </td>
                        <td className="whitespace-nowrap px-[14px] py-2.5 text-[12px] tabular-nums text-t700">
                          {row.registros_no_cubiertos}
                        </td>
                        <td className="whitespace-nowrap px-[14px] py-2.5">
                          <span
                            className="inline-block rounded-r4 px-2 py-0.5 text-[10px] font-semibold uppercase"
                            style={{ background: cs.bg, color: cs.text }}
                          >
                            {LABEL_CATEGORIA_BRECHA[row.categoria_detector]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-[14px] py-2.5">
                          {row.categoria_detector === "SIN_ASIGNACION" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 border-[#B45309]/40 text-[11px] text-[#9A3412] hover:bg-[#B45309]/10"
                              onClick={() => setNormalizarBrecha(row)}
                            >
                              Normalizar
                            </Button>
                          ) : (
                            <span className="text-[11px] text-t400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </DataTable>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Form Container */}
          <div
            ref={formSectionRef}
            id="formulario-crud"
            className="mb-[26px] min-w-0 max-w-full scroll-mt-24 overflow-hidden rounded-r12 border border-bdr bg-white shadow-sh1 md:scroll-mt-8"
          >
            {/* Form Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bdr bg-surface2 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h3 className="font-playfair text-[1.05rem] font-semibold text-t900">
                  Formulario: {entityNames[activeEntity]}
                </h3>
                <p className="mt-0.5 text-[12px] text-t300">Completa todos los campos obligatorios</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeEntity === "registro_horas" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-bdr text-[12px]"
                    onClick={() => setRegistroHorasImportOpen(true)}
                  >
                    <FileUp size={14} />
                    Importar planilla CSV
                  </Button>
                )}
                <span
                  className="rounded-r4 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.07em]"
                  style={{ background: `${color}18`, color: color }}
                >
                  {entityNames[activeEntity]}
                </span>
              </div>
            </div>

            {/* Form Body */}
            <div className="min-w-0 max-w-full px-4 py-4 pb-2 sm:px-6 sm:py-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={
                    activeEntity +
                    (activeEntity === "registro_horas" ? vistaRegistroHoras : "") +
                    (editItem ? "-edit" : "-new")
                  }
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderForm()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Data Table */}
          <div className="mb-8">
            <h3 className="mb-3 font-playfair text-[1.05rem] font-semibold text-t900">
              Registros de {entityNames[activeEntity]}
            </h3>
            {renderTable()}
          </div>
        </>
      )}

      <NormalizarSinAsignacionDialog
        open={normalizarBrecha != null}
        onOpenChange={(o) => {
          if (!o) setNormalizarBrecha(null);
        }}
        brecha={normalizarBrecha}
        onApplied={(modo) => {
          setNormalizarBrecha(null);
          showToast(
            modo === "activa"
              ? "Asignación ACTIVA creada (normalización histórica). Revise cupo y auditoría."
              : "Asignación CERRADA creada (normalización histórica). Revise la auditoría.",
            "success",
          );
        }}
        onError={(msg) => showToast(msg, "error")}
      />

      <RegistroHoraImportDialog
        open={registroHorasImportOpen}
        onOpenChange={setRegistroHorasImportOpen}
        onSuccess={(n) =>
          showToast(`Importación completada: ${n} registro(s) de horas añadidos.`, "success")
        }
      />

      {/* Delete Dialog */}
      {activeEntity === "proyectos" ? (
        <DeleteProyectoDialog
          open={!!deleteItem}
          proyectoLabel={proyectoDeleteState?.proyecto ? `${proyectoDeleteState.proyecto.codigo} — ${proyectoDeleteState.proyecto.nombre}` : (deleteItem?.name || "")}
          entregablesAEliminar={(proyectoDeleteState?.entregablesDelProyecto ?? []).map((e) => ({ id: e.id, nombre: e.nombre }))}
          asignacionesCount={proyectoDeleteState?.asignacionesCount ?? 0}
          registrosHorasCount={proyectoDeleteState?.registrosHorasCount ?? 0}
          registrosHorasTotalHoras={proyectoDeleteState?.registrosHorasTotalHoras ?? 0}
          entregablesConGasto={proyectoDeleteState?.entregablesConGasto ?? []}
          confirmText={deleteProyectoConfirmText}
          onChangeConfirmText={setDeleteProyectoConfirmText}
          onConfirm={handleDeleteProyectoCascade}
          onCancel={() => setDeleteItem(null)}
        />
      ) : (
        <DeleteDialog
          open={!!deleteItem}
          entityName={deleteItem?.name || ""}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteItem(null)}
        />
      )}

      <CerrarAsignacionDialog
        open={!!cerrarAsignacion}
        asignacion={cerrarAsignacion}
        onConfirmClose={() => {
          setCerrarAsignacion(null);
          showToast("Asignación cerrada correctamente.", "success");
        }}
        onCancel={() => setCerrarAsignacion(null)}
        onBusinessError={(msg) => showToast(msg, "error")}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ x: 120, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 120, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed top-4 right-4 z-[1000] rounded-r8 border bg-white p-[14px_18px] shadow-sh3"
            style={{ borderLeft: `4px solid ${toast.type === "success" ? "#047857" : "#B91C1C"}` }}
          >
            <p className="text-[13px] font-medium text-t900">{toast.msg}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
