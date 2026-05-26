/**
 * Moneda comercial del maestro Proyecto y conversión a UF (unidad interna).
 * Sin APIs externas: el usuario ingresa valor UF y tipo de cambio USD manualmente.
 */

export type MonedaOriginalProyecto = "UF" | "CLP" | "USD";

export function esMonedaOriginalProyecto(s: unknown): s is MonedaOriginalProyecto {
  return s === "UF" || s === "CLP" || s === "USD";
}

function toNonNeg(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function calcularTarifaUfDesdeContractual(input: {
  moneda: MonedaOriginalProyecto;
  tarifa_original: number;
  valor_uf_conversion: number;
  tipo_cambio_usd: number;
}): number {
  const t = toNonNeg(input.tarifa_original);
  if (input.moneda === "UF") return t;
  const vuf = toNonNeg(input.valor_uf_conversion);
  if (vuf <= 0) return 0;
  if (input.moneda === "CLP") return t / vuf;
  const tc = toNonNeg(input.tipo_cambio_usd);
  if (tc <= 0) return 0;
  return (t * tc) / vuf;
}

export function hydrateTarifasContractualesFromPersisted(p: {
  moneda_original?: unknown;
  valor_uf_conversion?: unknown;
  tipo_cambio_usd?: unknown;
  tarifa_l2?: unknown;
  tarifa_p4?: unknown;
  tarifa_p3?: unknown;
  tarifa_p2?: unknown;
  tarifa_l2_original?: unknown;
  tarifa_p4_original?: unknown;
  tarifa_p3_original?: unknown;
  tarifa_p2_original?: unknown;
}): {
  tarifa_l2_original: number;
  tarifa_p4_original: number;
  tarifa_p3_original: number;
  tarifa_p2_original: number;
} {
  const moneda = esMonedaOriginalProyecto(p.moneda_original) ? p.moneda_original : "UF";
  const hasOrig = (x: unknown) => x !== undefined && x !== null && String(x).trim() !== "";
  const l2 = hasOrig(p.tarifa_l2_original) ? toNonNeg(p.tarifa_l2_original) : toNonNeg(p.tarifa_l2);
  const p4 = hasOrig(p.tarifa_p4_original) ? toNonNeg(p.tarifa_p4_original) : toNonNeg(p.tarifa_p4);
  const p3 = hasOrig(p.tarifa_p3_original) ? toNonNeg(p.tarifa_p3_original) : toNonNeg(p.tarifa_p3);
  const p2 = hasOrig(p.tarifa_p2_original) ? toNonNeg(p.tarifa_p2_original) : toNonNeg(p.tarifa_p2);
  // Para proyectos antiguos asumimos que las tarifas existentes estaban en UF (y por tanto "original" = UF).
  // Si ya existía moneda_original, respetamos pero seguimos defaulteando a la tarifa UF cuando falte el campo *_original.
  if (moneda === "UF") return { tarifa_l2_original: l2, tarifa_p4_original: p4, tarifa_p3_original: p3, tarifa_p2_original: p2 };
  return { tarifa_l2_original: l2, tarifa_p4_original: p4, tarifa_p3_original: p3, tarifa_p2_original: p2 };
}

/**
 * Fórmulas acordadas:
 * - UF: monto_uf = monto_original
 * - CLP: monto_uf = monto_original / valor_uf_conversion (CLP por 1 UF)
 * - USD: monto_clp = monto_original * tipo_cambio_usd; monto_uf = monto_clp / valor_uf_conversion
 */
export function calcularMontoUfProyecto(input: {
  moneda_original: MonedaOriginalProyecto;
  monto_original: number;
  valor_uf_conversion: number;
  tipo_cambio_usd: number;
}): number {
  const m = toNonNeg(input.monto_original);
  switch (input.moneda_original) {
    case "UF":
      return m;
    case "CLP": {
      const v = toNonNeg(input.valor_uf_conversion);
      if (v <= 0) return 0;
      return m / v;
    }
    case "USD": {
      const v = toNonNeg(input.valor_uf_conversion);
      const tc = toNonNeg(input.tipo_cambio_usd);
      if (v <= 0 || tc <= 0) return 0;
      return (m * tc) / v;
    }
  }
}

/** Hidrata campos de moneda desde JSON antiguo sin romper filas existentes. */
export function hydrateMonedaProyectoFromPersisted(p: {
  uf_presupuestadas?: unknown;
  moneda_original?: unknown;
  monto_original?: unknown;
  valor_uf_conversion?: unknown;
  tipo_cambio_usd?: unknown;
}): {
  moneda_original: MonedaOriginalProyecto;
  monto_original: number;
  valor_uf_conversion: number;
  tipo_cambio_usd: number;
  monto_uf_calculado: number;
} {
  const ufPres = toNonNeg(p.uf_presupuestadas);
  const moneda = esMonedaOriginalProyecto(p.moneda_original) ? p.moneda_original : "UF";
  const hasMontoOriginalKey =
    p.monto_original !== undefined && p.monto_original !== null && String(p.monto_original).trim() !== "";
  const monto_original = hasMontoOriginalKey ? toNonNeg(p.monto_original) : moneda === "UF" ? ufPres : 0;
  const valor_uf_conversion = toNonNeg(p.valor_uf_conversion);
  const tipo_cambio_usd = toNonNeg(p.tipo_cambio_usd);
  const monto_uf_calculado = calcularMontoUfProyecto({
    moneda_original: moneda,
    monto_original,
    valor_uf_conversion,
    tipo_cambio_usd,
  });
  return { moneda_original: moneda, monto_original, valor_uf_conversion, tipo_cambio_usd, monto_uf_calculado };
}

export function formatoResumenMonedaProyecto(p: {
  moneda_original?: string;
  monto_original: number;
  monto_uf_calculado: number;
  uf_presupuestadas: number;
}): string {
  const fmtUf = (n: number) =>
    n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const m = p.moneda_original === "CLP" || p.moneda_original === "USD" || p.moneda_original === "UF"
    ? p.moneda_original
    : "UF";
  const mo = p.monto_original;
  const ufc = Number.isFinite(p.monto_uf_calculado) ? p.monto_uf_calculado : p.uf_presupuestadas;
  if (m === "CLP") {
    const clp = mo.toLocaleString("es-CL", { maximumFractionDigits: 0 });
    return `CLP $${clp} → ${fmtUf(ufc)} UF`;
  }
  if (m === "USD") {
    const usd = mo.toLocaleString("es-CL", { maximumFractionDigits: 0 });
    return `USD ${usd} → ${fmtUf(ufc)} UF`;
  }
  const uf = mo.toLocaleString("es-CL", { maximumFractionDigits: 1 });
  return `UF ${uf} → ${fmtUf(ufc)} UF`;
}
