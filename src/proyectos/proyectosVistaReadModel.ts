/**
 * Lectura y agregación para la vista ejecutiva Proyectos (sin mutar datos).
 * Alineado con Gestión de Horas: presupuesto = suma L2+P4+P3+P2; gasto = registros directos válidos.
 */

import type {
  AsignacionHora,
  AsignacionHoraCategoria,
  Cliente,
  Entregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import { buildConsumoMaps } from "@/entregables/asignacionHoraConsumo";
import { esRegistroConsumoRealValido } from "@/entregables/registroHoraConsumo";
import { historialRedistribucionPorEntregable } from "@/entregables/redistribucionHorasEntregable";
import type { HistorialRedistribucionHoras } from "@/entregables/redistribucionHorasEntregable";
import { entregableEstadoEsCompletado } from "@/entregables/asignacionHoraRules";

export const TOLERANCIA_GASTO_VS_AVANCE_PUNTOS = 20;

const CATEGORIAS: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];

export type FiltroEstadoProyectoVista =
  | "TODOS"
  | "ACTIVO"
  | "COMPLETADO"
  | "NO_INICIADO"
  | "SOLO_ALERTAS";

export type EstadoProyecto = Proyecto["estado"];

export const ESTADOS_PROYECTO: EstadoProyecto[] = ["ACTIVO", "COMPLETADO", "NO_INICIADO", "SUSPENDIDO"];

export function estadoProyectoLabel(e: string): string {
  switch (e) {
    case "ACTIVO":
      return "Activo";
    case "COMPLETADO":
      return "Completado";
    case "NO_INICIADO":
      return "No iniciado";
    case "SUSPENDIDO":
      return "Suspendido";
    default:
      return e;
  }
}

const EPS_ACTIVIDAD = 1e-6;

/** Actividad real en entregable: horas RegistroHora, avance real o gasto UF > 0. */
export function entregableTieneActividadReal(row: EntregableVistaAnalisis): boolean {
  if (row.horasGastadas > EPS_ACTIVIDAD) return true;
  if (row.avanceRealPct > EPS_ACTIVIDAD) return true;
  if (row.ufGasto > EPS_ACTIVIDAD) return true;
  return false;
}

export function proyectoTieneActividadRealDesdeFilas(
  proyectoId: string,
  filas: EntregableVistaAnalisis[],
): boolean {
  return filas.some((r) => r.proyecto.id === proyectoId && entregableTieneActividadReal(r));
}

/** Proyectos en estado NO_INICIADO con al menos un entregable con actividad real. */
export function listarProyectosNoIniciadoConActividad(
  proyectos: Proyecto[],
  filas: EntregableVistaAnalisis[],
): Proyecto[] {
  return proyectos.filter(
    (p) => p.estado === "NO_INICIADO" && proyectoTieneActividadRealDesdeFilas(p.id, filas),
  );
}

export function toPct(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 1) return Math.max(0, x * 100);
  return Math.max(0, x);
}

export function horasPresupuestoPorCategorias(ent: Entregable): number {
  return Number(ent.hrs_l2) + Number(ent.hrs_p4) + Number(ent.hrs_p3) + Number(ent.hrs_p2);
}

/** Presupuesto horas P4+P3+P2 (sin L2), misma base que Gestión de Horas / Capacidad presión. */
export function horasPresupuestoSinL2(ent: Entregable): number {
  return Number(ent.hrs_p4) + Number(ent.hrs_p3) + Number(ent.hrs_p2);
}

function tarifaUfPorCategoria(
  proyecto: Pick<Proyecto, "tarifa_l2" | "tarifa_p4" | "tarifa_p3" | "tarifa_p2">,
  cat: AsignacionHoraCategoria,
): number {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0);
  switch (cat) {
    case "L2":
      return n(proyecto.tarifa_l2);
    case "P4":
      return n(proyecto.tarifa_p4);
    case "P3":
      return n(proyecto.tarifa_p3);
    case "P2":
      return n(proyecto.tarifa_p2);
    default:
      return 0;
  }
}

/** UF presupuestadas sin L2: Σ (hrs_categoría × tarifa proyecto), categorías P4+P3+P2. */
export function ufPresupuestoSinL2Entregable(ent: Entregable, proyecto: Proyecto): number {
  return (
    tarifaUfPorCategoria(proyecto, "P4") * Number(ent.hrs_p4) +
    tarifaUfPorCategoria(proyecto, "P3") * Number(ent.hrs_p3) +
    tarifaUfPorCategoria(proyecto, "P2") * Number(ent.hrs_p2)
  );
}

/** UF gastadas sin L2: gasto real por categoría (registros DIRECTOS) × tarifa, excluye L2. */
export function ufGastoSinL2FilaAnalisis(row: EntregableVistaAnalisis): number {
  let s = 0;
  for (const hc of row.horasPorCategoria) {
    if (hc.categoria === "L2") continue;
    s += hc.horasGastadas * tarifaUfPorCategoria(row.proyecto, hc.categoria);
  }
  return s;
}

export type TotalesKpiSinL2 = {
  ufPresup: number;
  ufGasto: number;
  horasPresup: number;
  horasGasto: number;
};

/** Agrega totales sin L2 sobre filas ya filtradas de la vista ejecutiva. */
export function agregarTotalesKpiSinL2(filas: EntregableVistaAnalisis[]): TotalesKpiSinL2 {
  let ufPresup = 0;
  let ufGasto = 0;
  let horasPresup = 0;
  let horasGasto = 0;
  for (const row of filas) {
    ufPresup += ufPresupuestoSinL2Entregable(row.entregable, row.proyecto);
    ufGasto += ufGastoSinL2FilaAnalisis(row);
    horasPresup += horasPresupuestoSinL2(row.entregable);
    for (const hc of row.horasPorCategoria) {
      if (hc.categoria === "L2") continue;
      horasGasto += hc.horasGastadas;
    }
  }
  return { ufPresup, ufGasto, horasPresup, horasGasto };
}

export function toCategoria(cargo: string): AsignacionHoraCategoria {
  return CATEGORIAS.includes(cargo as AsignacionHoraCategoria) ? (cargo as AsignacionHoraCategoria) : "P4";
}

export function presupuestoCategoriaEntregable(ent: Entregable, cat: AsignacionHoraCategoria): number {
  switch (cat) {
    case "L2":
      return Number(ent.hrs_l2);
    case "P4":
      return Number(ent.hrs_p4);
    case "P3":
      return Number(ent.hrs_p3);
    case "P2":
      return Number(ent.hrs_p2);
    default:
      return 0;
  }
}

export type ParticipanteEntregableVista = {
  profesional: Profesional;
  rol: "LIDER" | "APOYO" | "SIN_ROL";
  categoria: AsignacionHoraCategoria;
  horasTrabajadas: number;
  horasAsignadasActivas: number;
  horasAsignadasCerradas: number;
  observacion: string;
};

/** Una fila por categoría (L2→P4→P3→P2): presupuesto desde entregable; gasto desde registros DIRECTOS válidos. */
export type HorasPresupGastoPorCategoria = {
  categoria: AsignacionHoraCategoria;
  horasPresupuesto: number;
  horasGastadas: number;
};

export type EntregableVistaAnalisis = {
  cliente: Cliente;
  proyecto: Proyecto;
  entregable: Entregable;
  horasPresupuesto: number;
  horasGastadas: number;
  horasPorCategoria: HorasPresupGastoPorCategoria[];
  pctConsumoHoras: number | null;
  avanceRealPct: number;
  avanceTeoricoPct: number;
  saldoHoras: number;
  ufPresup: number;
  ufGasto: number;
  alertaSobreconsumoHoras: boolean;
  alertaGastoVsAvance: boolean;
  alertaSinAsignacion: boolean;
  redistribuido: boolean;
  participantes: ParticipanteEntregableVista[];
};

function entregableTieneAlgunaAlerta(a: EntregableVistaAnalisis): boolean {
  return a.alertaSobreconsumoHoras || a.alertaGastoVsAvance || a.alertaSinAsignacion;
}

export function proyectoPasaFiltroEstado(p: Proyecto, filtro: FiltroEstadoProyectoVista): boolean {
  switch (filtro) {
    case "TODOS":
      return true;
    case "ACTIVO":
      return p.estado === "ACTIVO";
    case "COMPLETADO":
      return p.estado === "COMPLETADO";
    case "NO_INICIADO":
      return p.estado === "NO_INICIADO";
    case "SOLO_ALERTAS":
      return true;
    default:
      return true;
  }
}

/** Texto normalizado para búsqueda simple. */
export function textoBusquedaNormalizado(s: string): string {
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function construirAnalisisEntregablesVista(input: {
  clientes: Cliente[];
  proyectos: Proyecto[];
  entregables: Entregable[];
  profesionales: Profesional[];
  registro_horas: RegistroHora[];
  asignaciones_horas: AsignacionHora[];
  historial_redistribuciones_horas: HistorialRedistribucionHoras[];
}): EntregableVistaAnalisis[] {
  const { clientes, proyectos, entregables, profesionales, registro_horas, asignaciones_horas, historial_redistribuciones_horas } =
    input;

  const clientMap = new Map(clientes.map((c) => [c.id, c]));
  const projMap = new Map(proyectos.map((p) => [p.id, p]));
  const profMap = new Map(profesionales.map((p) => [p.id, p]));

  const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);
  const registrosDirectosValidos = registro_horas.filter((r) =>
    esRegistroConsumoRealValido(r, entById, projById, profById),
  );

  const gastoPorEntregableYProf = new Map<string, Map<string, number>>();
  for (const r of registrosDirectosValidos) {
    const eid = (r.entregable_id ?? "").trim();
    const pid = (r.profesional_id ?? "").trim();
    if (!eid || !pid) continue;
    if (!gastoPorEntregableYProf.has(eid)) gastoPorEntregableYProf.set(eid, new Map());
    const m = gastoPorEntregableYProf.get(eid)!;
    m.set(pid, (m.get(pid) ?? 0) + Number(r.horas));
  }

  const out: EntregableVistaAnalisis[] = [];

  for (const ent of entregables) {
    const pr = projMap.get(ent.proyecto_id);
    if (!pr) continue;
    const cl = clientMap.get(pr.cliente_id);
    if (!cl) continue;

    const horasPresupuesto = horasPresupuestoPorCategorias(ent);
    const registrosEnt = registrosDirectosValidos.filter((r) => (r.entregable_id ?? "").trim() === ent.id);
    const horasGastadas = registrosEnt.reduce((s, r) => s + Number(r.horas), 0);

    const gastoPorCat = new Map<AsignacionHoraCategoria, number>();
    for (const cat of CATEGORIAS) gastoPorCat.set(cat, 0);
    for (const r of registrosEnt) {
      const pid = (r.profesional_id ?? "").trim();
      const prof = profMap.get(pid);
      if (!prof) continue;
      const cat = toCategoria(prof.cargo);
      gastoPorCat.set(cat, (gastoPorCat.get(cat) ?? 0) + Number(r.horas));
    }
    const horasPorCategoria: HorasPresupGastoPorCategoria[] = CATEGORIAS.map((categoria) => ({
      categoria,
      horasPresupuesto: presupuestoCategoriaEntregable(ent, categoria),
      horasGastadas: gastoPorCat.get(categoria) ?? 0,
    }));

    const pctConsumoHoras = horasPresupuesto > 0 ? (horasGastadas / horasPresupuesto) * 100 : null;
    const avanceRealPct = toPct(Number(ent.avance_real));
    const avanceTeoricoPct = toPct(Number(ent.avance_teorico));
    const alertaSobreconsumoHoras = horasPresupuesto > 0 && horasGastadas > horasPresupuesto;
    const alertaGastoVsAvance =
      pctConsumoHoras != null && pctConsumoHoras > avanceRealPct + TOLERANCIA_GASTO_VS_AVANCE_PUNTOS;

    const gastoProf = gastoPorEntregableYProf.get(ent.id) ?? new Map<string, number>();
    const asigsEnt = asignaciones_horas.filter((a) => a.entregable_id === ent.id);
    const pids = new Set<string>([...gastoProf.keys(), ...asigsEnt.map((a) => a.profesional_id)]);

    const participantes: ParticipanteEntregableVista[] = [...pids]
      .map((pid) => {
        const p = profMap.get(pid);
        if (!p) return null;
        const asigsProfEnt = asigsEnt.filter((a) => a.profesional_id === pid);
        const rol = asigsProfEnt.some((a) => a.rol_en_entregable === "LIDER")
          ? "LIDER"
          : asigsProfEnt.some((a) => a.rol_en_entregable === "APOYO")
            ? "APOYO"
            : "SIN_ROL";
        const horasTrabajadas = gastoProf.get(pid) ?? 0;
        const categoria = toCategoria(p.cargo);
        const activas = asigsProfEnt.filter((a) => a.estado === "ACTIVA");
        const cerradas = asigsProfEnt.filter((a) => a.estado === "CERRADA");
        const horasAsignadasActivas = activas.reduce((s, a) => s + a.horas_comprometidas, 0);
        const horasAsignadasCerradas = cerradas.reduce((s, a) => s + a.horas_comprometidas, 0);
        let observacion = "";
        if (horasTrabajadas > 0 && asigsProfEnt.length === 0) observacion = "Gasto sin asignación";
        else if (activas.length && cerradas.length) observacion = "Activa + cerrada";
        else if (activas.length) observacion = "Asignación activa";
        else if (cerradas.length) observacion = "Solo cerradas";
        return {
          profesional: p,
          rol,
          categoria,
          horasTrabajadas,
          horasAsignadasActivas,
          horasAsignadasCerradas,
          observacion,
        } satisfies ParticipanteEntregableVista;
      })
      .filter((x): x is ParticipanteEntregableVista => x != null)
      .sort((a, b) => a.profesional.nombre_completo.localeCompare(b.profesional.nombre_completo, "es"));

    const alertaSinAsignacion = participantes.some((p) => p.horasTrabajadas > 0 && p.observacion === "Gasto sin asignación");

    const redistribuido = historialRedistribucionPorEntregable(historial_redistribuciones_horas ?? [], ent.id).length > 0;

    out.push({
      cliente: cl,
      proyecto: pr,
      entregable: ent,
      horasPresupuesto,
      horasGastadas,
      horasPorCategoria,
      pctConsumoHoras,
      avanceRealPct,
      avanceTeoricoPct,
      saldoHoras: horasPresupuesto - horasGastadas,
      ufPresup: Number(ent.uf_presupuestadas),
      ufGasto: Number(ent.uf_consumidas),
      alertaSobreconsumoHoras,
      alertaGastoVsAvance,
      alertaSinAsignacion,
      redistribuido,
      participantes,
    });
  }

  return out;
}

export function filtrarAnalisisVista(
  filas: EntregableVistaAnalisis[],
  opts: {
    filtroEstadoProyecto: FiltroEstadoProyectoVista;
    clienteId: string;
    pmKey: string;
    liderId: string;
    soloSobreconsumo: boolean;
    soloRedistribuidos: boolean;
    texto: string;
  },
): EntregableVistaAnalisis[] {
  const tNorm = textoBusquedaNormalizado(opts.texto);
  const hayTexto = tNorm.length > 0;

  return filas.filter((row) => {
    const p = row.proyecto;
    if (opts.clienteId !== "todos" && row.cliente.id !== opts.clienteId) return false;

    if (!proyectoPasaFiltroEstado(p, opts.filtroEstadoProyecto)) return false;

    if (opts.filtroEstadoProyecto === "SOLO_ALERTAS" && !entregableTieneAlgunaAlerta(row)) {
      return false;
    }

    if (opts.pmKey !== "todos") {
      if (opts.pmKey === "__sin_pm__") {
        const hasInterno = String(p.pm_interno_id ?? "").trim() !== "";
        const hasNombre = String(p.pm_nombre ?? "").trim() !== "";
        if (hasInterno || hasNombre) return false;
      } else if (opts.pmKey.startsWith("nom:")) {
        const nom = opts.pmKey.slice(4);
        if (String(p.pm_nombre ?? "").trim() !== nom) return false;
      } else if (p.pm_interno_id !== opts.pmKey) return false;
    }

    if (opts.liderId !== "todos" && row.entregable.lider_id !== opts.liderId) return false;

    if (opts.soloSobreconsumo && !row.alertaSobreconsumoHoras) return false;

    if (opts.soloRedistribuidos && !row.redistribuido) return false;

    if (hayTexto) {
      const blob = [
        row.cliente.nombre,
        p.codigo,
        p.nombre,
        row.entregable.nombre,
        row.entregable.fase_codigo ?? "",
        row.entregable.tarea_codigo ?? "",
      ]
        .join(" ")
        .toLowerCase();
      const blobN = textoBusquedaNormalizado(blob);
      if (!blobN.includes(tNorm)) return false;
    }

    return true;
  });
}

export function entregableVisibleEnVistaActiva(row: EntregableVistaAnalisis, filtroEstadoProyecto: FiltroEstadoProyectoVista): boolean {
  if (filtroEstadoProyecto === "ACTIVO") {
    if (entregableEstadoEsCompletado(row.entregable) && !entregableTieneAlgunaAlerta(row) && !row.redistribuido) {
      return false;
    }
  }
  return true;
}

export type AgrupacionProyectosVista = {
  cliente: Cliente;
  ufPresup: number;
  ufGasto: number;
  horasPresup: number;
  horasGasto: number;
  nAlertas: number;
  proyectos: {
    proyecto: Proyecto;
    filas: EntregableVistaAnalisis[];
    fechaInicioMin: string | null;
    fechaTerminoMax: string | null;
    liderPrincipalId: string | null;
    ufPresup: number;
    ufGasto: number;
    horasPresup: number;
    horasGasto: number;
    nEntregables: number;
    nEntregablesAlerta: number;
    flags: {
      sobreconsumo: boolean;
      redistribuido: boolean;
      enRiesgo: boolean;
      completado: boolean;
    };
  }[];
};

export function agruparClienteProyecto(filasFiltradas: EntregableVistaAnalisis[]): AgrupacionProyectosVista[] {
  const byClient = new Map<
    string,
    {
      cliente: Cliente;
      proyectos: Map<string, EntregableVistaAnalisis[]>;
    }
  >();

  for (const row of filasFiltradas) {
    if (!byClient.has(row.cliente.id)) {
      byClient.set(row.cliente.id, { cliente: row.cliente, proyectos: new Map() });
    }
    const c = byClient.get(row.cliente.id)!;
    if (!c.proyectos.has(row.proyecto.id)) c.proyectos.set(row.proyecto.id, []);
    c.proyectos.get(row.proyecto.id)!.push(row);
  }

  const result: AgrupacionProyectosVista[] = [];

  for (const { cliente, proyectos: pm } of byClient.values()) {
    const proyectosArr: AgrupacionProyectosVista["proyectos"] = [];

    for (const [, filas] of pm) {
      const proyecto = filas[0]!.proyecto;
      let fechaInicioMin: string | null = null;
      let fechaTerminoMax: string | null = null;
      const liderCount = new Map<string, number>();
      let ufPresup = 0;
      let ufGasto = 0;
      let horasPresup = 0;
      let horasGasto = 0;
      let nEntregablesAlerta = 0;
      let sobreconsumo = false;
      let redistribuido = false;
      let enRiesgo = false;

      for (const r of filas) {
        const e = r.entregable;
        const fi = e.fecha_inicio?.trim();
        const ft = e.fecha_termino?.trim();
        if (fi) {
          if (!fechaInicioMin || fi < fechaInicioMin) fechaInicioMin = fi;
        }
        if (ft) {
          if (!fechaTerminoMax || ft > fechaTerminoMax) fechaTerminoMax = ft;
        }
        const lid = (e.lider_id ?? "").trim();
        if (lid) liderCount.set(lid, (liderCount.get(lid) ?? 0) + 1);
        ufPresup += r.ufPresup;
        ufGasto += r.ufGasto;
        horasPresup += r.horasPresupuesto;
        horasGasto += r.horasGastadas;
        if (r.alertaSobreconsumoHoras || r.alertaGastoVsAvance || r.alertaSinAsignacion) nEntregablesAlerta += 1;
        if (r.alertaSobreconsumoHoras) sobreconsumo = true;
        if (r.redistribuido) redistribuido = true;
        if (r.alertaGastoVsAvance) enRiesgo = true;
      }

      let liderPrincipalId: string | null = null;
      let best = 0;
      for (const [lid, n] of liderCount) {
        if (n > best) {
          best = n;
          liderPrincipalId = lid;
        }
      }

      proyectosArr.push({
        proyecto,
        filas: [...filas].sort((a, b) => a.entregable.nombre.localeCompare(b.entregable.nombre, "es")),
        fechaInicioMin,
        fechaTerminoMax,
        liderPrincipalId,
        ufPresup,
        ufGasto,
        horasPresup,
        horasGasto,
        nEntregables: filas.length,
        nEntregablesAlerta,
        flags: {
          sobreconsumo,
          redistribuido,
          enRiesgo,
          completado: proyecto.estado === "COMPLETADO",
        },
      });
    }

    proyectosArr.sort((a, b) => a.proyecto.nombre.localeCompare(b.proyecto.nombre, "es"));

    let ufPresupC = 0;
    let ufGastoC = 0;
    let horasPresupC = 0;
    let horasGastoC = 0;
    let nAlertasC = 0;
    for (const pr of proyectosArr) {
      ufPresupC += pr.ufPresup;
      ufGastoC += pr.ufGasto;
      horasPresupC += pr.horasPresup;
      horasGastoC += pr.horasGasto;
      nAlertasC += pr.nEntregablesAlerta;
    }

    result.push({
      cliente,
      ufPresup: ufPresupC,
      ufGasto: ufGastoC,
      horasPresup: horasPresupC,
      horasGasto: horasGastoC,
      nAlertas: nAlertasC,
      proyectos: proyectosArr,
    });
  }

  return result.sort((a, b) => a.cliente.nombre.localeCompare(b.cliente.nombre, "es"));
}
