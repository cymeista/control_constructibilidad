/**
 * Redistribución de horas presupuestadas por categoría en un entregable (L2/P4/P3/P2),
 * preservando UF total dentro de tolerancia. Sin tocar RegistroHora ni asignaciones.
 */

import type {
  AsignacionHora,
  AsignacionHoraCategoria,
  Entregable,
  Profesional,
  Proyecto,
  RegistroHora,
} from "@/context/AppDataContext";
import { buildConsumoMaps, sumaGastoActivoActualPorCategoria } from "@/entregables/asignacionHoraConsumo";
import { desgloseCupoCategoriaEntregable } from "@/entregables/asignacionHoraRules";
import { esRegistroConsumoRealValido } from "@/entregables/registroHoraConsumo";
import {
  buildControlCategoriasEntregable,
  gastoRealPorCategoriaDesdeMapaProf,
  type CategoriaControlEstado,
} from "@/horas/entregableControlCategoria";

export const CATEGORIAS_REDIST: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];

export const UF_REDISTRIBUCION_TOLERANCIA = 0.05;

/** Solo bloquea si la UF total sube más de la tolerancia; UF igual o menor se permite. */
export function deltaUfRedistribucionExcedeToleranciaAlza(deltaUf: number): boolean {
  return deltaUf > UF_REDISTRIBUCION_TOLERANCIA + 1e-9;
}

export function deltaUfRedistribucionPermitido(deltaUf: number): boolean {
  return !deltaUfRedistribucionExcedeToleranciaAlza(deltaUf);
}

export function mensajeAdvertenciaUfMenorAlOriginal(deltaUf: number): string | null {
  if (deltaUf >= -1e-9) return null;
  const x = Math.abs(deltaUf);
  return `Redistribución permitida: el presupuesto UF final queda por debajo del presupuesto original en ${x.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} UF. No se aumenta el monto total del entregable.`;
}

export type HorasPorCategoria = Record<AsignacionHoraCategoria, number>;

export type TarifasPorCategoria = HorasPorCategoria;

/** UF del entregable según horas × tarifas del proyecto. */
export function calcularUfEntregablePorCategoria(horas: HorasPorCategoria, tarifas: TarifasPorCategoria): number {
  let s = 0;
  for (const c of CATEGORIAS_REDIST) {
    s += horas[c] * tarifas[c];
  }
  return s;
}

export function horasEntregableARecord(ent: Entregable): HorasPorCategoria {
  return {
    L2: ent.hrs_l2,
    P4: ent.hrs_p4,
    P3: ent.hrs_p3,
    P2: ent.hrs_p2,
  };
}

export function tarifasDesdeProyecto(p: Proyecto): { ok: true; tarifas: TarifasPorCategoria } | { ok: false; error: string } {
  const tarifas: TarifasPorCategoria = {
    L2: Number(p.tarifa_l2),
    P4: Number(p.tarifa_p4),
    P3: Number(p.tarifa_p3),
    P2: Number(p.tarifa_p2),
  };
  for (const c of CATEGORIAS_REDIST) {
    const v = tarifas[c];
    if (!Number.isFinite(v) || v <= 0) {
      return {
        ok: false,
        error: `El proyecto no tiene tarifa ${c} válida (> 0). Defina tarifas en el proyecto antes de redistribuir.`,
      };
    }
  }
  return { ok: true, tarifas };
}

/** Redondeo hacia arriba al múltiplo de 0,5 h (propuesta automática). */
export function redondearMediaHoraHaciaArriba(h: number): number {
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.ceil(h * 2 - 1e-9) / 2;
}

export function redondearMediaHoraHaciaAbajo(h: number): number {
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.floor(h * 2 + 1e-9) / 2;
}

export function esMultiploDeMediaHora(h: number): boolean {
  if (!Number.isFinite(h)) return false;
  return Math.abs(h * 2 - Math.round(h * 2)) < 1e-6;
}

export function normalizarAMediaHoraMasCercano(h: number): number {
  if (!Number.isFinite(h)) return 0;
  return Math.round(h * 2) / 2;
}

export type LineaRedistribucionCategoria = {
  categoria: AsignacionHoraCategoria;
  presupuesto: number;
  /** Gasto DIRECTA válido total del entregable por categoría (RegistroHora; alineado con Gestión de Horas). */
  gastoRealRegistroHora: number;
  /** presupuesto − gastoRealRegistroHora */
  saldoCategoria: number;
  /** max(0, saldoCategoria); usado por el motor de propuesta UF. */
  disponibleParaMover: number;
  /** max(0, gastoRealRegistroHora − presupuesto); si sin presupuesto con gasto = gasto total. */
  deficitHoras: number;
  estado: CategoriaControlEstado;
  minHorasPermitidas: number;
  /** Legacy asignaciones_horas (solo lectura / detalle colapsado). */
  consumidoHistoricoCerrado: number;
  gastoRealActivo: number;
  comprometidoActivo: number;
  saldoLegacyAsignaciones: number;
};

export function etiquetaEstadoLineaRedistribucion(estado: CategoriaControlEstado): string {
  if (estado === "OK") return "OK";
  if (estado === "SIN_PRESUPUESTO_CON_GASTO") return "Sin presupuesto con gasto";
  return "Déficit";
}

function gastoDirectoPorProfesionalEnEntregable(
  entregableId: string,
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
): Map<string, number> {
  const { entById, projById, profById } = buildConsumoMaps(entregables, proyectos, profesionales);
  const out = new Map<string, number>();
  for (const r of registro_horas) {
    if (!esRegistroConsumoRealValido(r, entById, projById, profById)) continue;
    if ((r.entregable_id ?? "").trim() !== entregableId) continue;
    const pid = (r.profesional_id ?? "").trim();
    if (!pid) continue;
    out.set(pid, (out.get(pid) ?? 0) + Number(r.horas));
  }
  return out;
}

/**
 * Líneas operativas (presupuesto vs gasto RegistroHora) + campos legacy de asignaciones.
 * Fase 1: disponibleParaMover y déficit siguen la misma lógica que Control por categoría en Gestión de Horas.
 */
export function construirLineasRedistribucion(
  ent: Entregable,
  asignaciones: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): LineaRedistribucionCategoria[] {
  const profMap = new Map(profesionales.map((p) => [p.id, p]));
  const gastoProf = gastoDirectoPorProfesionalEnEntregable(
    ent.id,
    registro_horas,
    entregables,
    proyectos,
    profesionales,
  );
  const gastoCategoriaMap = gastoRealPorCategoriaDesdeMapaProf(gastoProf, profMap);
  const controlPorCat = new Map(
    buildControlCategoriasEntregable(ent, gastoCategoriaMap).map((r) => [r.categoria, r]),
  );

  const out: LineaRedistribucionCategoria[] = [];
  for (const c of CATEGORIAS_REDIST) {
    const ctrl = controlPorCat.get(c)!;
    const d = desgloseCupoCategoriaEntregable(ent, asignaciones, c);
    const gastoRealActivo = sumaGastoActivoActualPorCategoria(
      ent.id,
      c,
      asignaciones,
      registro_horas,
      entregables,
      proyectos,
      profesionales,
      fechaHoy,
    );

    const gastoRealRegistroHora = ctrl.gastoReal;
    const saldoCategoria = ctrl.saldo;
    const disponibleParaMover = Math.max(0, saldoCategoria);
    const deficitHoras = ctrl.deficitHoras;
    const minHorasPermitidas =
      d.consumidoHistoricoCerrado +
      Math.max(d.asignadoActivo, gastoRealActivo, gastoRealRegistroHora);

    out.push({
      categoria: c,
      presupuesto: ctrl.presupuesto,
      gastoRealRegistroHora,
      saldoCategoria,
      disponibleParaMover,
      deficitHoras,
      estado: ctrl.estado,
      minHorasPermitidas,
      consumidoHistoricoCerrado: d.consumidoHistoricoCerrado,
      gastoRealActivo,
      comprometidoActivo: d.asignadoActivo,
      saldoLegacyAsignaciones: d.presupuesto - d.consumidoHistoricoCerrado - gastoRealActivo,
    });
  }
  return out;
}

export type PropuestaRedistribucion = {
  horasPropuestas: HorasPorCategoria;
  incompleta: boolean;
  mensajeIncompleta: string | null;
  ufAntes: number;
  ufDespues: number;
  diferenciaUf: number;
};

/** Destino explícito y modo para la propuesta automática (UI). Si se omite, se usan todas las categorías con déficit. */
export type ObjetivoPropuestaRedistribucion = {
  categoriaDestino: AsignacionHoraCategoria;
  modo: "deficit" | "manual";
  /** Modo manual: horas deseadas a agregar en destino (antes del redondeo hacia arriba a 0,5 h). */
  horasManualBrutas?: number;
};

/**
 * Genera horas propuestas: sube categoría(s) con déficit (redondeo hacia arriba 0,5 h)
 * y compensa UF sacando desde orígenes con mayor UF disponible (multiorigen).
 * Sin `objetivo`: misma lógica que antes (todas las categorías con déficit).
 * Con `objetivo`: solo aumenta `categoriaDestino` según modo déficit o manual.
 */
export function generarPropuestaRedistribucion(
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
  horasActuales: HorasPorCategoria,
  objetivo?: ObjetivoPropuestaRedistribucion,
): PropuestaRedistribucion {
  const horasPropuestas: HorasPorCategoria = { ...horasActuales };
  const adds: Partial<Record<AsignacionHoraCategoria, number>> = {};
  let ufNecesaria = 0;

  if (objetivo) {
    const ln = lineas.find((l) => l.categoria === objetivo.categoriaDestino);
    let add = 0;
    if (ln) {
      if (objetivo.modo === "deficit") {
        add = redondearMediaHoraHaciaArriba(ln.deficitHoras);
      } else {
        const raw = Number(objetivo.horasManualBrutas);
        add = redondearMediaHoraHaciaArriba(Number.isFinite(raw) && raw > 0 ? raw : 0);
      }
    }
    if (add > 0) {
      adds[objetivo.categoriaDestino] = add;
      horasPropuestas[objetivo.categoriaDestino] = horasActuales[objetivo.categoriaDestino] + add;
      ufNecesaria += add * tarifas[objetivo.categoriaDestino];
    }
  } else {
    for (const ln of lineas) {
      if (ln.deficitHoras <= 0) continue;
      const add = redondearMediaHoraHaciaArriba(ln.deficitHoras);
      if (add <= 0) continue;
      adds[ln.categoria] = add;
      horasPropuestas[ln.categoria] = horasActuales[ln.categoria] + add;
      ufNecesaria += add * tarifas[ln.categoria];
    }
  }

  const destinosConAdd = new Set(Object.keys(adds) as AsignacionHoraCategoria[]);

  const origenes = lineas
    .filter((ln) => ln.disponibleParaMover > 0 && !destinosConAdd.has(ln.categoria))
    .map((ln) => ({
      categoria: ln.categoria,
      disponible: ln.disponibleParaMover,
      ufDisponible: ln.disponibleParaMover * tarifas[ln.categoria],
    }))
    .sort((a, b) => b.ufDisponible - a.ufDisponible);

  let ufRestante = ufNecesaria;
  const rems: Partial<Record<AsignacionHoraCategoria, number>> = {};

  for (const o of origenes) {
    if (ufRestante <= 1e-6) break;
    let disp = o.disponible - (rems[o.categoria] ?? 0);
    while (ufRestante > 1e-6 && disp >= 0.5) {
      const maxH = redondearMediaHoraHaciaAbajo(disp);
      if (maxH < 0.5) break;
      const hIdeal = redondearMediaHoraHaciaAbajo(ufRestante / tarifas[o.categoria] + 1e-9);
      const h = Math.min(maxH, Math.max(0.5, hIdeal));
      const hFloor = redondearMediaHoraHaciaAbajo(h);
      if (hFloor < 0.5) break;
      rems[o.categoria] = (rems[o.categoria] ?? 0) + hFloor;
      ufRestante -= hFloor * tarifas[o.categoria];
      disp -= hFloor;
    }
  }

  for (const c of CATEGORIAS_REDIST) {
    const r = rems[c];
    if (r && r > 0) {
      horasPropuestas[c] = horasActuales[c] - r;
    }
  }

  const horasRefinadas = refinarUfRedistribucion(horasActuales, horasPropuestas, tarifas, lineas);

  const ufAntes = calcularUfEntregablePorCategoria(horasActuales, tarifas);
  const ufDespues = calcularUfEntregablePorCategoria(horasRefinadas, tarifas);
  const diferenciaUf = ufDespues - ufAntes;

  let incompleta = false;
  let mensajeIncompleta: string | null = null;
  if (objetivo && ufNecesaria <= 1e-6) {
    incompleta = true;
    mensajeIncompleta =
      objetivo.modo === "deficit"
        ? `No hay déficit detectado para ${objetivo.categoriaDestino} (o el déficit es 0 h tras redondear a 0,5 h).`
        : "Indique horas a agregar mayores a 0 (se redondean hacia arriba al múltiplo de 0,5 h más cercano).";
  } else if (ufNecesaria > 1e-6 && deltaUfRedistribucionExcedeToleranciaAlza(diferenciaUf)) {
    incompleta = true;
    mensajeIncompleta =
      "La propuesta aumentaría la UF total del entregable por más de la tolerancia permitida. Reduzca el incremento en destino o ajuste manualmente desde categorías con saldo.";
  }

  return {
    horasPropuestas: horasRefinadas,
    incompleta,
    mensajeIncompleta,
    ufAntes,
    ufDespues,
    diferenciaUf,
  };
}

/** Máximas horas que se pueden restar (0,5 h ↓) sin bajar del gasto real RegistroHora. */
function maxHorasReduciblesDesdeActual(ln: LineaRedistribucionCategoria, horasActualesCategoria: number): number {
  return redondearMediaHoraHaciaAbajo(maxHorasReduciblesRespetandoGastoReal(ln, horasActualesCategoria));
}

function propuestaAgregarManualCumple(
  horasActuales: HorasPorCategoria,
  horasProp: HorasPorCategoria,
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
  dest: AsignacionHoraCategoria,
  addRounded: number,
): boolean {
  if (addRounded <= 0) return false;
  if (horasProp[dest] + 1e-6 < horasActuales[dest] + addRounded) return false;
  const du =
    calcularUfEntregablePorCategoria(horasProp, tarifas) - calcularUfEntregablePorCategoria(horasActuales, tarifas);
  if (deltaUfRedistribucionExcedeToleranciaAlza(du)) return false;
  const errs = validarRedistribucionHoras(horasActuales, horasProp, lineas, tarifas, ".", {
    exigirMultiploMediaHora: true,
    exigirComentario: false,
  });
  return errs.length === 0;
}

export type CodigoResultadoRedistribAgregar = "ok" | "sin_disponibilidad" | "sin_cuadratura";

export type SugerenciaRedistribAgregar = {
  horasPropuestas: HorasPorCategoria;
  destinoAdd: number;
  deltaUf: number;
  descripcion: string;
  distanciaHorasSolicitadas: number;
};

export type ResultadoRedistribDestinoCompleto = {
  codigo: CodigoResultadoRedistribAgregar;
  propuesta: HorasPorCategoria;
  ufAntes: number;
  ufDespues: number;
  diferenciaUf: number;
  addRoundedSolicitud: number;
  ufRequeridaSolicitud: number;
  ufCompensableMax: number;
  mensajes: string[];
  sugerencias: SugerenciaRedistribAgregar[];
};

/**
 * Búsqueda en múltiplos de 0,5 h: incremento en destino y descuentos en orígenes ≠ destino.
 * Tres orígenes (L2/P4/P3/P2 menos destino): se enumeran dos dimensiones y se deduce la tercera
 * para cuadrar UF (evita tope artificial de 7 h/origen que omitía soluciones válidas).
 * Orden: cercanía al incremento solicitado, luego |ΔUF|.
 */
function buscarSugerenciasAgregarHoras(
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
  horasActuales: HorasPorCategoria,
  dest: AsignacionHoraCategoria,
  addSolicitadoRounded: number,
  ufAntes: number,
): SugerenciaRedistribAgregar[] {
  const mins = Object.fromEntries(lineas.map((ln) => [ln.categoria, ln.gastoRealRegistroHora])) as HorasPorCategoria;
  const lnBy = Object.fromEntries(lineas.map((ln) => [ln.categoria, ln])) as Record<
    AsignacionHoraCategoria,
    LineaRedistribucionCategoria
  >;
  const origins = CATEGORIAS_REDIST.filter((c) => c !== dest);
  const caps = {} as HorasPorCategoria;
  for (const o of origins) {
    caps[o] = maxHorasReduciblesDesdeActual(lnBy[o], horasActuales[o]);
  }
  /** Pasos de 0,5 h permitidos por origen (sin cap artificial; el límite es disponibilidad real). */
  const stepLimits = origins.map((o) => Math.max(0, Math.floor((caps[o] + 1e-9) / 0.5)));
  /** Cubrir déficits grandes: al menos el redondeo pedido + margen; tope duro para no explotar tiempo. */
  const maxAddSteps = Math.min(260, Math.max(100, Math.ceil(addSolicitadoRounded / 0.5) + 24));

  const candidatos: SugerenciaRedistribAgregar[] = [];
  const seen = new Set<string>();

  const tryCombo = (addDest: number, acc: number[]) => {
    const h = { ...horasActuales };
    h[dest] += addDest;
    for (let k = 0; k < origins.length; k++) {
      h[origins[k]] -= acc[k] * 0.5;
    }
    for (const c of CATEGORIAS_REDIST) {
      if (!Number.isFinite(h[c])) return;
      if (!esMultiploDeMediaHora(h[c])) return;
      if (h[c] + 1e-9 < mins[c]) return;
      if (h[c] < -1e-9) return;
    }
    for (let k = 0; k < origins.length; k++) {
      const o = origins[k];
      if (horasActuales[o] - h[o] > caps[o] + 1e-9) return;
    }
    const deltaUf = calcularUfEntregablePorCategoria(h, tarifas) - ufAntes;
    if (deltaUf > UF_REDISTRIBUCION_TOLERANCIA + 1e-9) return;

    const key = CATEGORIAS_REDIST.map((c) => h[c].toFixed(1)).join("|");
    if (seen.has(key)) return;
    seen.add(key);

    const remParts = origins
      .map((o, k) => {
        const hrs = acc[k] * 0.5;
        return hrs > 1e-9 ? `${hrs.toFixed(1)} h de ${o}` : null;
      })
      .filter(Boolean) as string[];
    let descripcion = `Agregar ${addDest.toFixed(1)} h a ${dest}`;
    if (remParts.length) descripcion += " descontando " + remParts.join(" y ");
    descripcion += ` · ΔUF ${deltaUf.toFixed(4)} (máx. alza +${UF_REDISTRIBUCION_TOLERANCIA} UF)`;

    candidatos.push({
      horasPropuestas: { ...h },
      destinoAdd: addDest,
      deltaUf,
      descripcion,
      distanciaHorasSolicitadas: Math.abs(addDest - addSolicitadoRounded),
    });
  };

  /** Con 3 orígenes: enumerar los dos de menor cap de pasos y deducir el tercero (entero 0,5 h) para cuadrar UF. */
  const enumerateTwoSolveThird = (addDest: number) => {
    const order = [0, 1, 2].sort((a, b) => stepLimits[a] - stepLimits[b]);
    const ia = order[0];
    const ib = order[1];
    const ic = order[2];
    const oa = origins[ia];
    const ob = origins[ib];
    const oc = origins[ic];
    const ta = tarifas[oa];
    const tb = tarifas[ob];
    const tc = tarifas[oc];
    const capa = stepLimits[ia];
    const capb = stepLimits[ib];
    const capc = stepLimits[ic];
    if (tc <= 1e-12) return;

    const R = addDest * tarifas[dest];

    for (let sa = 0; sa <= capa; sa++) {
      for (let sb = 0; sb <= capb; sb++) {
        const uf01 = 0.5 * (sa * ta + sb * tb);
        const remaining = R - uf01;
        const scFloat = (2 * remaining) / tc;
        const lo = Math.max(0, Math.floor(scFloat - 6));
        const hi = Math.min(capc, Math.ceil(scFloat + 6));
        for (let sc = lo; sc <= hi; sc++) {
          const acc: number[] = [0, 0, 0];
          acc[ia] = sa;
          acc[ib] = sb;
          acc[ic] = sc;
          tryCombo(addDest, acc);
        }
      }
    }
  };

  for (let sd = 1; sd <= maxAddSteps; sd++) {
    const addDest = sd * 0.5;
    if (origins.length !== 3) {
      const rec = (i: number, acc: number[]) => {
        if (i === origins.length) {
          tryCombo(addDest, acc);
          return;
        }
        const lim = stepLimits[i];
        for (let s = 0; s <= lim; s++) rec(i + 1, [...acc, s]);
      };
      rec(0, []);
      continue;
    }
    enumerateTwoSolveThird(addDest);
  }

  candidatos.sort((A, B) => {
    const u = A.distanciaHorasSolicitadas - B.distanciaHorasSolicitadas;
    if (Math.abs(u) > 1e-9) return u;
    return B.deltaUf - A.deltaUf;
  });
  return candidatos.slice(0, 8);
}

/**
 * Flujo “agregar horas a categoría” con diagnóstico, distinción insuficiencia vs. cuadratura UF/discretización,
 * y sugerencias factibles (combinatoria simple en 0,5 h).
 */
export function calcularRedistribucionAgregarHorasDestinoCompleto(
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
  horasActuales: HorasPorCategoria,
  categoriaDestino: AsignacionHoraCategoria,
  horasAAgregarBrutas: number,
): ResultadoRedistribDestinoCompleto {
  const ufAntes = calcularUfEntregablePorCategoria(horasActuales, tarifas);
  const raw = Number(horasAAgregarBrutas);
  const addRounded = redondearMediaHoraHaciaArriba(Number.isFinite(raw) && raw > 0 ? raw : 0);

  const base = (
    codigo: CodigoResultadoRedistribAgregar,
    patch: Partial<Omit<ResultadoRedistribDestinoCompleto, "codigo">> & {
      ufRequeridaSolicitud?: number;
      ufCompensableMax?: number;
    },
  ): ResultadoRedistribDestinoCompleto => ({
    codigo,
    propuesta: { ...horasActuales },
    ufAntes,
    ufDespues: ufAntes,
    diferenciaUf: 0,
    addRoundedSolicitud: addRounded,
    ufRequeridaSolicitud: patch.ufRequeridaSolicitud ?? 0,
    ufCompensableMax: patch.ufCompensableMax ?? 0,
    mensajes: [],
    sugerencias: [],
    ...patch,
  });

  if (addRounded <= 0) {
    return base("sin_cuadratura", {
      mensajes: [
        "Indique horas a agregar mayores a 0 (se redondean hacia arriba al múltiplo de 0,5 h más cercano).",
      ],
    });
  }

  const ufReq = addRounded * tarifas[categoriaDestino];
  const origins = CATEGORIAS_REDIST.filter((c) => c !== categoriaDestino);
  let ufCompensableMax = 0;
  for (const o of origins) {
    const ln = lineas.find((l) => l.categoria === o)!;
    ufCompensableMax += maxHorasReduciblesDesdeActual(ln, horasActuales[o]) * tarifas[o];
  }

  const p = generarPropuestaRedistribucion(lineas, tarifas, horasActuales, {
    categoriaDestino,
    modo: "manual",
    horasManualBrutas: raw,
  });

  const destAddGenerador = redondearMediaHoraHaciaArriba(
    Math.max(0, p.horasPropuestas[categoriaDestino] - horasActuales[categoriaDestino]),
  );
  const generadorOk =
    !p.incompleta &&
    destAddGenerador > 1e-6 &&
    propuestaAgregarManualCumple(
      horasActuales,
      p.horasPropuestas,
      lineas,
      tarifas,
      categoriaDestino,
      destAddGenerador,
    );

  if (generadorOk) {
    return {
      codigo: "ok",
      propuesta: { ...p.horasPropuestas },
      ufAntes,
      ufDespues: p.ufDespues,
      diferenciaUf: p.diferenciaUf,
      addRoundedSolicitud: destAddGenerador,
      ufRequeridaSolicitud: ufReq,
      ufCompensableMax,
      mensajes: [],
      sugerencias: [],
    };
  }

  const sugerencias = buscarSugerenciasAgregarHoras(
    lineas,
    tarifas,
    horasActuales,
    categoriaDestino,
    addRounded,
    ufAntes,
  );

  const viableFromSearch = sugerencias.filter(
    (s) =>
      deltaUfRedistribucionPermitido(s.deltaUf) &&
      propuestaAgregarManualCumple(
        horasActuales,
        s.horasPropuestas,
        lineas,
        tarifas,
        categoriaDestino,
        s.destinoAdd,
      ),
  );
  const exactFromSearch = viableFromSearch.find((s) => Math.abs(s.destinoAdd - addRounded) < 1e-9);
  const conservadoraFromSearch =
    exactFromSearch ??
    viableFromSearch.sort((a, b) => {
      const u = a.distanciaHorasSolicitadas - b.distanciaHorasSolicitadas;
      if (Math.abs(u) > 1e-9) return u;
      return b.deltaUf - a.deltaUf;
    })[0];

  if (conservadoraFromSearch) {
    const ufDespues = calcularUfEntregablePorCategoria(conservadoraFromSearch.horasPropuestas, tarifas);
    return {
      codigo: "ok",
      propuesta: { ...conservadoraFromSearch.horasPropuestas },
      ufAntes,
      ufDespues,
      diferenciaUf: ufDespues - ufAntes,
      addRoundedSolicitud: conservadoraFromSearch.destinoAdd,
      ufRequeridaSolicitud: ufReq,
      ufCompensableMax,
      mensajes: [],
      sugerencias: [],
    };
  }

  const insufUfTeorica = ufCompensableMax + 1e-9 < ufReq - 1e-9;
  const mensajes: string[] = [];

  if (insufUfTeorica) {
    mensajes.push("No hay UF disponible suficiente para compensar esta redistribución con las horas movibles actuales.");
    mensajes.push(
      `UF requerida (incremento en ${categoriaDestino}): ${ufReq.toFixed(4)}. UF máxima compensable en orígenes: ${ufCompensableMax.toFixed(4)} (déficit aprox. ${(ufReq - ufCompensableMax).toFixed(4)} UF).`,
    );
    if (p.incompleta && p.mensajeIncompleta) mensajes.push(p.mensajeIncompleta);
    if (!sugerencias.length) {
      mensajes.push(
        "No se encontraron alternativas automáticas que no superen el aumento máximo de UF en la búsqueda acotada.",
      );
    }
    return {
      codigo: "sin_disponibilidad",
      propuesta: { ...horasActuales },
      ufAntes,
      ufDespues: ufAntes,
      diferenciaUf: 0,
      addRoundedSolicitud: addRounded,
      ufRequeridaSolicitud: ufReq,
      ufCompensableMax,
      mensajes,
      sugerencias,
    };
  }

  mensajes.push(
    `No es posible generar una redistribución válida para +${addRounded.toFixed(1)} h en ${categoriaDestino} sin superar +${UF_REDISTRIBUCION_TOLERANCIA} UF de aumento total (redondeo 0,5 h).`,
  );
  mensajes.push(
    `UF requerida (incremento redondeado): ${ufReq.toFixed(4)}. UF máxima compensable en orígenes (en pasos de 0,5 h): ${ufCompensableMax.toFixed(4)}.`,
  );
  mensajes.push(
    "Hay disponibilidad en origen, pero no existe combinación válida que cubra el incremento sin aumentar la UF total por encima del límite (discretización / tarifas). Pruebe un ajuste manual conservador.",
  );
  if (p.incompleta && p.mensajeIncompleta) mensajes.push(p.mensajeIncompleta);
  if (!p.incompleta) {
    if (deltaUfRedistribucionExcedeToleranciaAlza(p.diferenciaUf)) {
      mensajes.push(
        `El intento automático previo dejó ΔUF en ${p.diferenciaUf.toFixed(4)} (límite de alza +${UF_REDISTRIBUCION_TOLERANCIA} UF).`,
      );
    }
    if (p.horasPropuestas[categoriaDestino] + 1e-6 < horasActuales[categoriaDestino] + addRounded) {
      mensajes.push(
        "El ajuste fino de UF revirtió parte o todo el aumento en la categoría destino: por eso parecía que «no pasaba nada».",
      );
    }
  }
  if (!sugerencias.length) {
    mensajes.push(
      "No se encontró una alternativa cercana en la búsqueda automática (pruebe otro incremento o amplíe disponibilidad).",
    );
  }

  return {
    codigo: "sin_cuadratura",
    propuesta: { ...horasActuales },
    ufAntes,
    ufDespues: ufAntes,
    diferenciaUf: 0,
    addRoundedSolicitud: addRounded,
    ufRequeridaSolicitud: ufReq,
    ufCompensableMax,
    mensajes,
    sugerencias,
  };
}

/**
 * Flujo principal: agregar horas (brutas, redondeo 0,5 h ↑) solo en `categoriaDestino` y compensar UF
 * desde otras categorías con disponibilidad (multiorigen por mayor UF disponible).
 */
export function calcularRedistribucionAgregarHorasDestino(
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
  horasActuales: HorasPorCategoria,
  categoriaDestino: AsignacionHoraCategoria,
  horasAAgregarBrutas: number,
): PropuestaRedistribucion {
  return generarPropuestaRedistribucion(lineas, tarifas, horasActuales, {
    categoriaDestino,
    modo: "manual",
    horasManualBrutas: horasAAgregarBrutas,
  });
}

/** Ajuste fino en pasos de 0,5 h para bajar ΔUF si supera +tolerancia; no sube UF si quedó bajo el original. */
export function refinarUfRedistribucion(
  horasActuales: HorasPorCategoria,
  horasPropuestas: HorasPorCategoria,
  tarifas: TarifasPorCategoria,
  lineas: LineaRedistribucionCategoria[],
): HorasPorCategoria {
  const h = { ...horasPropuestas };
  const minC = Object.fromEntries(
    lineas.map((ln) => [ln.categoria, ln.gastoRealRegistroHora]),
  ) as HorasPorCategoria;
  const du = () => calcularUfEntregablePorCategoria(h, tarifas) - calcularUfEntregablePorCategoria(horasActuales, tarifas);
  const cats = [...CATEGORIAS_REDIST];

  for (let iter = 0; iter < 500; iter++) {
    const d = du();
    if (d <= UF_REDISTRIBUCION_TOLERANCIA + 1e-9) break;
    let moved = false;
    if (d > UF_REDISTRIBUCION_TOLERANCIA) {
      for (const c of [...cats].sort((a, b) => tarifas[a] - tarifas[b])) {
        if (h[c] > horasActuales[c] && h[c] - 0.5 >= minC[c] - 1e-9) {
          h[c] -= 0.5;
          moved = true;
          break;
        }
      }
      if (!moved) {
        for (const c of [...cats].sort((a, b) => tarifas[b] - tarifas[a])) {
          if (h[c] < horasActuales[c]) {
            h[c] += 0.5;
            if (h[c] > horasActuales[c] + 1e-9) {
              h[c] -= 0.5;
              continue;
            }
            moved = true;
            break;
          }
        }
      }
    }
    if (!moved) break;
  }
  return h;
}

export type OpcionesValidacionRedistribucion = {
  /** Modo automático (propuesta 0,5 h). El ajuste manual en modal no exige múltiplos de 0,5. */
  exigirMultiploMediaHora?: boolean;
  /** Si false, no exige comentario (solo vista previa en UI). */
  exigirComentario?: boolean;
};

/** Redondeo interno para inputs manuales (0,01 h). */
export function redondearHorasAjusteManual(h: number): number {
  if (!Number.isFinite(h)) return 0;
  return Math.round(h * 100) / 100;
}

export const MENSAJE_AUTO_SIN_COMBINACION_05H =
  "No se encontró combinación automática con redondeo 0,5 h sin superar el aumento máximo de UF. Puedes ajustar manualmente las horas finales (se permite UF final menor al original).";

/** Horas a sumar al presupuesto para cubrir el déficit operativo (gasto real − presupuesto). */
export function horasAgregarSugeridasParaRegularizarDeficit(ln: LineaRedistribucionCategoria): number {
  return Math.max(0, ln.deficitHoras);
}

/** Presupuesto mínimo = gasto real RegistroHora de la categoría. */
export function presupuestoMinimoPorGastoReal(ln: LineaRedistribucionCategoria): number {
  return ln.gastoRealRegistroHora;
}

export function mensajeDeficitCategoriaDestino(ln: LineaRedistribucionCategoria): string {
  const deficit = ln.deficitHoras;
  const hasta = presupuestoMinimoPorGastoReal(ln);
  return `Esta categoría tiene déficit de ${deficit.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h. Para regularizarla, debe subir al menos hasta ${hasta.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h.`;
}

const fmtHRedist = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Horas que se pueden restar sin bajar del gasto real RegistroHora. */
function maxHorasReduciblesRespetandoGastoReal(
  ln: LineaRedistribucionCategoria,
  horasActualesCategoria: number,
): number {
  const porGasto = Math.max(0, horasActualesCategoria - ln.gastoRealRegistroHora);
  return Math.max(0, Math.min(ln.disponibleParaMover, porGasto));
}

export type EvaluacionCompensacionParcialDestino = {
  mostrarOpcionMaximo: boolean;
  deficitHoras: number;
  deficitUf: number;
  ufCompensable: number;
  mensajeInsuficiencia: string | null;
};

/** ¿Hay déficit en destino y UF compensable en orígenes menor que el déficit completo? */
export function evaluarCompensacionParcialDestino(
  categoriaDestino: AsignacionHoraCategoria,
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
): EvaluacionCompensacionParcialDestino {
  const lnDest = lineas.find((l) => l.categoria === categoriaDestino);
  if (!lnDest || lnDest.deficitHoras <= 1e-9) {
    return {
      mostrarOpcionMaximo: false,
      deficitHoras: 0,
      deficitUf: 0,
      ufCompensable: 0,
      mensajeInsuficiencia: null,
    };
  }

  const deficitHoras = lnDest.deficitHoras;
  const deficitUf = deficitHoras * tarifas[categoriaDestino];
  let ufCompensable = 0;
  for (const ln of lineas) {
    if (ln.categoria === categoriaDestino) continue;
    if (ln.disponibleParaMover > 0) {
      ufCompensable += ln.disponibleParaMover * tarifas[ln.categoria];
    }
  }

  const mostrarOpcionMaximo = ufCompensable > 1e-6 && ufCompensable + 1e-6 < deficitUf;
  const mensajeInsuficiencia = mostrarOpcionMaximo
    ? `No hay saldo suficiente para regularizar completamente ${categoriaDestino}. Déficit requerido: ${fmtHRedist(deficitHoras)} h / ${deficitUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF. UF disponible para compensar: ${ufCompensable.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF. Puedes redistribuir el máximo disponible para reducir parcialmente el déficit.`
    : null;

  return { mostrarOpcionMaximo, deficitHoras, deficitUf, ufCompensable, mensajeInsuficiencia };
}

export type ResultadoRedistribucionMaximoDisponible = {
  ok: boolean;
  horasPropuestas: HorasPorCategoria;
  ufAntes: number;
  ufDespues: number;
  diferenciaUf: number;
  horasAgregadasDestino: number;
  deficitResidualHoras: number;
  ufCompensableUsada: number;
  mensajeExito: string;
  errores: string[];
};

/**
 * Mueve todo el saldo compensable (presupuesto − gasto real) desde orígenes hacia destino,
 * cuadrando UF en pasos finos (0,01 h) sin bajar orígenes bajo su gasto real RegistroHora.
 */
export function calcularRedistribucionMaximoDisponible(
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
  horasActuales: HorasPorCategoria,
  categoriaDestino: AsignacionHoraCategoria,
): ResultadoRedistribucionMaximoDisponible {
  const lnDest = lineas.find((l) => l.categoria === categoriaDestino);
  const baseErr = (errores: string[]): ResultadoRedistribucionMaximoDisponible => ({
    ok: false,
    horasPropuestas: { ...horasActuales },
    ufAntes: calcularUfEntregablePorCategoria(horasActuales, tarifas),
    ufDespues: calcularUfEntregablePorCategoria(horasActuales, tarifas),
    diferenciaUf: 0,
    horasAgregadasDestino: 0,
    deficitResidualHoras: lnDest?.deficitHoras ?? 0,
    ufCompensableUsada: 0,
    mensajeExito: "",
    errores,
  });

  if (!lnDest || lnDest.deficitHoras <= 1e-9) {
    return baseErr(["La categoría destino no tiene déficit operativo."]);
  }

  const evalParcial = evaluarCompensacionParcialDestino(categoriaDestino, lineas, tarifas);
  if (evalParcial.ufCompensable <= 1e-6) {
    return baseErr(["No hay saldo disponible en otras categorías para redistribuir."]);
  }

  const rems: Partial<Record<AsignacionHoraCategoria, number>> = {};
  let ufComp = 0;
  for (const ln of lineas) {
    if (ln.categoria === categoriaDestino) continue;
    const hTake = maxHorasReduciblesRespetandoGastoReal(ln, horasActuales[ln.categoria]);
    if (hTake <= 1e-9) continue;
    const hR = redondearHorasAjusteManual(hTake);
    rems[ln.categoria] = hR;
    ufComp += hR * tarifas[ln.categoria];
  }

  if (ufComp <= 1e-6) {
    return baseErr(["No hay horas movibles en categorías origen sin bajar del gasto real registrado."]);
  }

  let hAdd = redondearHorasAjusteManual(ufComp / tarifas[categoriaDestino]);
  let prop: HorasPorCategoria = { ...horasActuales };
  prop[categoriaDestino] = redondearHorasAjusteManual(horasActuales[categoriaDestino] + hAdd);
  for (const c of CATEGORIAS_REDIST) {
    const r = rems[c];
    if (r && r > 0) {
      prop[c] = redondearHorasAjusteManual(horasActuales[c] - r);
    }
  }

  prop = refinarUfRedistribucionFino(horasActuales, prop, tarifas, lineas);
  hAdd = redondearHorasAjusteManual(prop[categoriaDestino] - horasActuales[categoriaDestino]);

  const ufAntes = calcularUfEntregablePorCategoria(horasActuales, tarifas);
  const ufDespues = calcularUfEntregablePorCategoria(prop, tarifas);
  const diferenciaUf = ufDespues - ufAntes;
  const deficitResidualHoras = Math.max(0, lnDest.gastoRealRegistroHora - prop[categoriaDestino]);

  const errs = validarRedistribucionHoras(horasActuales, prop, lineas, tarifas, ".", {
    exigirMultiploMediaHora: false,
    exigirComentario: false,
  });

  if (errs.length > 0) {
    return { ...baseErr(errs), horasPropuestas: prop, ufAntes, ufDespues, diferenciaUf, horasAgregadasDestino: hAdd, deficitResidualHoras, ufCompensableUsada: ufComp };
  }

  const mensajeExito =
    deficitResidualHoras > 1e-6
      ? `Redistribución parcial: se movió todo el saldo disponible hacia ${categoriaDestino}. El déficit se reduce, pero no se elimina. (${categoriaDestino}: ${fmtHRedist(prop[categoriaDestino])} h; déficit residual ${fmtHRedist(deficitResidualHoras)} h).`
      : `Redistribución aplicada: se transfirió el máximo saldo disponible (${fmtHRedist(hAdd)} h a ${categoriaDestino}).`;

  return {
    ok: true,
    horasPropuestas: prop,
    ufAntes,
    ufDespues,
    diferenciaUf,
    horasAgregadasDestino: hAdd,
    deficitResidualHoras,
    ufCompensableUsada: ufComp,
    mensajeExito,
    errores: [],
  };
}

/** Ajuste fino en pasos de 0,01 h; piso = gasto real RegistroHora por categoría. */
export function refinarUfRedistribucionFino(
  horasActuales: HorasPorCategoria,
  horasPropuestas: HorasPorCategoria,
  tarifas: TarifasPorCategoria,
  lineas: LineaRedistribucionCategoria[],
  pasoHoras = 0.01,
): HorasPorCategoria {
  const h = { ...horasPropuestas };
  const minC = Object.fromEntries(
    lineas.map((ln) => [ln.categoria, ln.gastoRealRegistroHora]),
  ) as HorasPorCategoria;
  const du = () => calcularUfEntregablePorCategoria(h, tarifas) - calcularUfEntregablePorCategoria(horasActuales, tarifas);
  const cats = [...CATEGORIAS_REDIST];

  for (let iter = 0; iter < 2000; iter++) {
    const d = du();
    if (d <= UF_REDISTRIBUCION_TOLERANCIA + 1e-9) break;
    let moved = false;
    if (d > UF_REDISTRIBUCION_TOLERANCIA) {
      for (const c of [...cats].sort((a, b) => tarifas[a] - tarifas[b])) {
        if (h[c] > horasActuales[c] && h[c] - pasoHoras >= minC[c] - 1e-9) {
          h[c] = redondearHorasAjusteManual(h[c] - pasoHoras);
          moved = true;
          break;
        }
      }
      if (!moved) {
        for (const c of [...cats].sort((a, b) => tarifas[b] - tarifas[a])) {
          if (h[c] < horasActuales[c]) {
            h[c] = redondearHorasAjusteManual(h[c] + pasoHoras);
            if (h[c] > horasActuales[c] + 1e-9) {
              h[c] = redondearHorasAjusteManual(h[c] - pasoHoras);
              continue;
            }
            moved = true;
            break;
          }
        }
      }
    }
    if (!moved) break;
  }
  return h;
}

/** Advertencias no bloqueantes: mínimo técnico legacy por asignaciones (solo si gasto real ya está cubierto). */
export function advertenciasMinimoTecnicoLegacy(
  horasNuevas: HorasPorCategoria,
  lineas: LineaRedistribucionCategoria[],
): string[] {
  const out: string[] = [];
  for (const c of CATEGORIAS_REDIST) {
    const ln = lineas.find((l) => l.categoria === c);
    if (!ln) continue;
    const v = horasNuevas[c];
    if (
      v + 1e-6 >= ln.gastoRealRegistroHora &&
      v + 1e-6 < ln.minHorasPermitidas &&
      ln.minHorasPermitidas > ln.gastoRealRegistroHora + 1e-6
    ) {
      out.push(
        `${c}: el presupuesto (${v.toFixed(1)} h) queda bajo el mínimo técnico legacy de asignaciones (${ln.minHorasPermitidas.toFixed(1)} h), pero cubre el gasto real RegistroHora (${ln.gastoRealRegistroHora.toFixed(1)} h).`,
      );
    }
  }
  return out;
}

export function mensajePresupuestoBajoGastoReal(
  categoria: AsignacionHoraCategoria,
  presupuestoPropuesto: number,
  ln: LineaRedistribucionCategoria,
): string {
  const fmt = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (ln.deficitHoras > 0) {
    return `${categoria}: ${mensajeDeficitCategoriaDestino(ln)} Con el ajuste actual quedaría en ${fmt(presupuestoPropuesto)} h.`;
  }
  return `${categoria}: el presupuesto no puede quedar por debajo del gasto real registrado (${fmt(ln.gastoRealRegistroHora)} h). Valor propuesto: ${fmt(presupuestoPropuesto)} h.`;
}

export function validarRedistribucionHoras(
  horasActuales: HorasPorCategoria,
  horasNuevas: HorasPorCategoria,
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
  comentario: string,
  opciones?: OpcionesValidacionRedistribucion,
): string[] {
  const exigir05 = opciones?.exigirMultiploMediaHora ?? false;
  const exigirComentario = opciones?.exigirComentario ?? true;
  const errs: string[] = [];
  const t = (comentario ?? "").trim();
  if (exigirComentario && !t) errs.push("El comentario es obligatorio.");

  const lnBy = Object.fromEntries(lineas.map((x) => [x.categoria, x])) as Record<
    AsignacionHoraCategoria,
    LineaRedistribucionCategoria
  >;

  for (const c of CATEGORIAS_REDIST) {
    const v = horasNuevas[c];
    if (!Number.isFinite(v)) {
      errs.push(`Horas ${c} no numéricas.`);
      continue;
    }
    if (v < -1e-9) errs.push(`Las horas ${c} no pueden ser negativas.`);
    if (exigir05 && !esMultiploDeMediaHora(v)) {
      errs.push(`Las horas ${c} deben ser múltiplos de 0,5 (modo automático).`);
    }
    const ln = lnBy[c];
    if (v + 1e-6 < ln.gastoRealRegistroHora) {
      const mejoraDeficitParcial =
        ln.deficitHoras > 1e-9 && v + 1e-6 >= horasActuales[c];
      if (!mejoraDeficitParcial) {
        errs.push(mensajePresupuestoBajoGastoReal(c, v, ln));
      }
    }
  }

  const du =
    calcularUfEntregablePorCategoria(horasNuevas, tarifas) - calcularUfEntregablePorCategoria(horasActuales, tarifas);
  if (deltaUfRedistribucionExcedeToleranciaAlza(du)) {
    errs.push(
      `La UF total aumentaría en ${du.toFixed(4)} UF (máximo permitido +${UF_REDISTRIBUCION_TOLERANCIA} UF). Ajuste las horas finales por categoría.`,
    );
  }

  return errs;
}

export function puedeGuardarRedistribucionHoras(
  horasActuales: HorasPorCategoria,
  horasNuevas: HorasPorCategoria,
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
  comentario: string,
): boolean {
  return (
    validarRedistribucionHoras(horasActuales, horasNuevas, lineas, tarifas, comentario, {
      exigirMultiploMediaHora: false,
      exigirComentario: true,
    }).length === 0
  );
}

export type MovimientoHistorialRedistribucion = {
  categoria: AsignacionHoraCategoria;
  horas_antes: number;
  horas_despues: number;
  delta_horas: number;
  uf_antes: number;
  uf_despues: number;
  delta_uf: number;
};

export type HistorialRedistribucionHoras = {
  id: string;
  entregable_id: string;
  proyecto_id: string;
  fecha: string;
  comentario: string;
  horas_antes: HorasPorCategoria;
  horas_despues: HorasPorCategoria;
  tarifas: TarifasPorCategoria;
  uf_total_antes: number;
  uf_total_despues: number;
  diferencia_uf: number;
  movimientos: MovimientoHistorialRedistribucion[];
  created_at: string;
};

export function historialRedistribucionPorEntregable(
  lista: HistorialRedistribucionHoras[],
  entregableId: string,
): HistorialRedistribucionHoras[] {
  return lista
    .filter((x) => x.entregable_id === entregableId)
    .sort((a, b) => (b.created_at + b.id).localeCompare(a.created_at + a.id));
}

export function construirHistorialRedistribucion(
  id: string,
  ent: Entregable,
  horasAntes: HorasPorCategoria,
  horasDespues: HorasPorCategoria,
  tarifas: TarifasPorCategoria,
  comentario: string,
  fechaIso: string,
  createdAt: string,
): HistorialRedistribucionHoras {
  const ufAntes = calcularUfEntregablePorCategoria(horasAntes, tarifas);
  const ufDesp = calcularUfEntregablePorCategoria(horasDespues, tarifas);
  return {
    id,
    entregable_id: ent.id,
    proyecto_id: ent.proyecto_id,
    fecha: fechaIso,
    comentario: comentario.trim(),
    horas_antes: { ...horasAntes },
    horas_despues: { ...horasDespues },
    tarifas: { ...tarifas },
    uf_total_antes: ufAntes,
    uf_total_despues: ufDesp,
    diferencia_uf: ufDesp - ufAntes,
    movimientos: CATEGORIAS_REDIST.map((c) => {
      const ha = horasAntes[c];
      const hd = horasDespues[c];
      const ua = ha * tarifas[c];
      const ud = hd * tarifas[c];
      return {
        categoria: c,
        horas_antes: ha,
        horas_despues: hd,
        delta_horas: hd - ha,
        uf_antes: ua,
        uf_despues: ud,
        delta_uf: ud - ua,
      };
    }),
    created_at: createdAt,
  };
}
