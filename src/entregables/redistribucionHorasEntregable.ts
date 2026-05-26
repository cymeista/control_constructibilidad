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
import { desgloseCupoCategoriaEntregable } from "@/entregables/asignacionHoraRules";
import { sumaGastoActivoActualPorCategoria } from "@/entregables/asignacionHoraConsumo";

export const CATEGORIAS_REDIST: AsignacionHoraCategoria[] = ["L2", "P4", "P3", "P2"];

export const UF_REDISTRIBUCION_TOLERANCIA = 0.05;

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
  consumidoHistoricoCerrado: number;
  gastoRealActivo: number;
  comprometidoActivo: number;
  disponibleParaMover: number;
  deficitHoras: number;
  minHorasPermitidas: number;
  saldoRealCategoria: number;
};

export function construirLineasRedistribucion(
  ent: Entregable,
  asignaciones: AsignacionHora[],
  registro_horas: RegistroHora[],
  entregables: Entregable[],
  proyectos: Proyecto[],
  profesionales: Profesional[],
  fechaHoy: string,
): LineaRedistribucionCategoria[] {
  const out: LineaRedistribucionCategoria[] = [];
  for (const c of CATEGORIAS_REDIST) {
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
    const disponibleParaMover = Math.max(0, d.presupuesto - d.consumidoHistoricoCerrado - d.asignadoActivo);
    const deficitHoras = Math.max(0, d.consumidoHistoricoCerrado + gastoRealActivo - d.presupuesto);
    const minHorasPermitidas = d.consumidoHistoricoCerrado + Math.max(d.asignadoActivo, gastoRealActivo);
    const saldoRealCategoria = d.presupuesto - d.consumidoHistoricoCerrado - gastoRealActivo;
    out.push({
      categoria: c,
      presupuesto: d.presupuesto,
      consumidoHistoricoCerrado: d.consumidoHistoricoCerrado,
      gastoRealActivo,
      comprometidoActivo: d.asignadoActivo,
      disponibleParaMover,
      deficitHoras,
      minHorasPermitidas,
      saldoRealCategoria,
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
  } else if (ufNecesaria > 1e-6 && ufRestante > 0.05) {
    incompleta = true;
    mensajeIncompleta =
      "No hay suficientes horas disponibles para mover en otras categorías para compensar económicamente el aumento sugerido. Ajuste manualmente o reduzca el aumento en el destino.";
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

/** Máximas horas que se pueden restar a una categoría (múltiplos de 0,5 h hacia abajo) respetando mínimo y “disp. mover”. */
function maxHorasReduciblesDesdeActual(ln: LineaRedistribucionCategoria, horasActualesCategoria: number): number {
  const porMinimo = Math.max(0, horasActualesCategoria - ln.minHorasPermitidas);
  const cap = Math.min(ln.disponibleParaMover, porMinimo);
  return redondearMediaHoraHaciaAbajo(Math.max(0, cap));
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
  if (Math.abs(du) > UF_REDISTRIBUCION_TOLERANCIA) return false;
  const errs = validarRedistribucionHoras(horasActuales, horasProp, lineas, tarifas, ".");
  return errs.filter((e) => !e.toLowerCase().includes("comentario")).length === 0;
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
  const mins = Object.fromEntries(lineas.map((ln) => [ln.categoria, ln.minHorasPermitidas])) as HorasPorCategoria;
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
    if (Math.abs(deltaUf) > UF_REDISTRIBUCION_TOLERANCIA + 1e-9) return;

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
    descripcion += ` · ΔUF ${deltaUf.toFixed(4)} (tolerancia ±${UF_REDISTRIBUCION_TOLERANCIA})`;

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
    return Math.abs(A.deltaUf) - Math.abs(B.deltaUf);
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

  const generadorOk =
    !p.incompleta &&
    propuestaAgregarManualCumple(
      horasActuales,
      p.horasPropuestas,
      lineas,
      tarifas,
      categoriaDestino,
      addRounded,
    );

  if (generadorOk) {
    return {
      codigo: "ok",
      propuesta: { ...p.horasPropuestas },
      ufAntes,
      ufDespues: p.ufDespues,
      diferenciaUf: p.diferenciaUf,
      addRoundedSolicitud: addRounded,
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

  const exactFromSearch = sugerencias.find((s) => Math.abs(s.destinoAdd - addRounded) < 1e-9);
  if (
    exactFromSearch &&
    propuestaAgregarManualCumple(
      horasActuales,
      exactFromSearch.horasPropuestas,
      lineas,
      tarifas,
      categoriaDestino,
      addRounded,
    )
  ) {
    const ufDespues = calcularUfEntregablePorCategoria(exactFromSearch.horasPropuestas, tarifas);
    return {
      codigo: "ok",
      propuesta: { ...exactFromSearch.horasPropuestas },
      ufAntes,
      ufDespues,
      diferenciaUf: ufDespues - ufAntes,
      addRoundedSolicitud: addRounded,
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
      mensajes.push("No se encontraron alternativas automáticas con ΔUF dentro de tolerancia en la búsqueda acotada.");
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
    `No es posible generar una redistribución válida para +${addRounded.toFixed(1)} h en ${categoriaDestino} con las categorías disponibles, redondeo a 0,5 h y tolerancia ±${UF_REDISTRIBUCION_TOLERANCIA} UF.`,
  );
  mensajes.push(
    `UF requerida (incremento redondeado): ${ufReq.toFixed(4)}. UF máxima compensable en orígenes (en pasos de 0,5 h): ${ufCompensableMax.toFixed(4)}.`,
  );
  mensajes.push(
    "Hay disponibilidad de UF en origen, pero no existe combinación válida con múltiplos de 0,5 h dentro de ±0,05 UF para el incremento solicitado (cuadratura por discretización / tarifas).",
  );
  if (p.incompleta && p.mensajeIncompleta) mensajes.push(p.mensajeIncompleta);
  if (!p.incompleta) {
    if (Math.abs(p.diferenciaUf) > UF_REDISTRIBUCION_TOLERANCIA) {
      mensajes.push(`El intento automático previo dejó ΔUF en ${p.diferenciaUf.toFixed(4)} (límite ±${UF_REDISTRIBUCION_TOLERANCIA}).`);
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

/** Ajuste fino en pasos de 0,5 h para acercar ΔUF a cero respetando mínimos por categoría. */
export function refinarUfRedistribucion(
  horasActuales: HorasPorCategoria,
  horasPropuestas: HorasPorCategoria,
  tarifas: TarifasPorCategoria,
  lineas: LineaRedistribucionCategoria[],
): HorasPorCategoria {
  const h = { ...horasPropuestas };
  const minC = Object.fromEntries(lineas.map((ln) => [ln.categoria, ln.minHorasPermitidas])) as HorasPorCategoria;
  const du = () => calcularUfEntregablePorCategoria(h, tarifas) - calcularUfEntregablePorCategoria(horasActuales, tarifas);
  const cats = [...CATEGORIAS_REDIST];

  for (let iter = 0; iter < 500; iter++) {
    const d = du();
    if (Math.abs(d) <= UF_REDISTRIBUCION_TOLERANCIA) break;
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
    } else {
      for (const c of [...cats].sort((a, b) => tarifas[b] - tarifas[a])) {
        if (h[c] < horasActuales[c] && h[c] + 0.5 <= horasActuales[c] + 1e-9 && h[c] + 0.5 >= minC[c] - 1e-9) {
          h[c] += 0.5;
          moved = true;
          break;
        }
      }
      if (!moved) {
        for (const c of [...cats].sort((a, b) => tarifas[a] - tarifas[b])) {
          if (h[c] > horasActuales[c] && h[c] - 0.5 >= minC[c] - 1e-9) {
            h[c] -= 0.5;
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

export function validarRedistribucionHoras(
  horasActuales: HorasPorCategoria,
  horasNuevas: HorasPorCategoria,
  lineas: LineaRedistribucionCategoria[],
  tarifas: TarifasPorCategoria,
  comentario: string,
): string[] {
  const errs: string[] = [];
  const t = (comentario ?? "").trim();
  if (!t) errs.push("El comentario es obligatorio.");

  for (const c of CATEGORIAS_REDIST) {
    const v = horasNuevas[c];
    if (!Number.isFinite(v)) {
      errs.push(`Horas ${c} no numéricas.`);
      continue;
    }
    if (v < 0) errs.push(`Las horas ${c} no pueden ser negativas.`);
    if (!esMultiploDeMediaHora(v)) errs.push(`Las horas ${c} deben ser múltiplos de 0,5.`);
  }

  const lnBy = Object.fromEntries(lineas.map((x) => [x.categoria, x])) as Record<
    AsignacionHoraCategoria,
    LineaRedistribucionCategoria
  >;

  for (const c of CATEGORIAS_REDIST) {
    const v = horasNuevas[c];
    const ln = lnBy[c];
    if (!Number.isFinite(v)) continue;
    if (v + 1e-6 < ln.minHorasPermitidas) {
      errs.push(
        `${c}: el presupuesto no puede quedar por debajo de consumo histórico cerrado más el máximo entre comprometido activo y gasto real activo (mínimo ${ln.minHorasPermitidas.toFixed(1)} h).`,
      );
    }
  }

  const du = calcularUfEntregablePorCategoria(horasNuevas, tarifas) - calcularUfEntregablePorCategoria(horasActuales, tarifas);
  if (Math.abs(du) > UF_REDISTRIBUCION_TOLERANCIA) {
    errs.push(
      `La diferencia de UF (${du.toFixed(4)}) supera la tolerancia permitida (±${UF_REDISTRIBUCION_TOLERANCIA} UF). Ajuste horas en pasos de 0,5 h.`,
    );
  }

  return errs;
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
