import { dateToUtcEpoch } from "@/entregables/entregableSeguimiento";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type LocalDateParts = { year: number; month: number; day: number };

/** Parsea `YYYY-MM-DD` como fecha calendario (sin zona horaria). */
export function parseLocalDateString(value: string | null | undefined): LocalDateParts | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!ISO_DATE_RE.test(t)) return null;
  if (dateToUtcEpoch(t) == null) return null;
  const [ys, ms, ds] = t.split("-");
  return { year: Number(ys), month: Number(ms), day: Number(ds) };
}

/** Crea `Date` en hora local a partir de `YYYY-MM-DD` (solo para UI / Gantt). */
export function localDateToDate(value: string | null | undefined): Date | null {
  const p = parseLocalDateString(value);
  if (!p) return null;
  return new Date(p.year, p.month - 1, p.day);
}

/** Serializa componentes locales de un `Date` a `YYYY-MM-DD`. */
export function localDateFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Muestra `YYYY-MM-DD` como `DD/MM/YYYY` o `DD-MM-YYYY` sin conversión UTC. */
export function formatDateForDisplay(
  value: string | null | undefined,
  separator: "/" | "-" = "/",
): string {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  const p = parseLocalDateString(raw);
  if (!p) return raw;
  const dd = String(p.day).padStart(2, "0");
  const mm = String(p.month).padStart(2, "0");
  return `${dd}${separator}${mm}${separator}${p.year}`;
}

/** Formato corto es-CL (p. ej. Proyectos) usando fecha local, no UTC. */
export function formatDateForDisplayShort(value: string | null | undefined): string {
  const d = localDateToDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "2-digit" });
}

/** Valor para `<input type="date">`: `YYYY-MM-DD` sin transformación. */
export function formatDateForInput(value: string | null | undefined): string {
  const t = (value ?? "").trim();
  if (!t) return "";
  return parseLocalDateString(t) ? t : "";
}

/** Normaliza entrada de date picker a `YYYY-MM-DD` o cadena vacía. */
export function normalizeDateInputValue(value: string): string {
  return formatDateForInput(value);
}

/** Días calendario desde hoy (positivo = futuro). Comparación sin desfase UTC. */
export function diffCalendarDaysFromToday(value: string | null | undefined): number | null {
  const ep = dateToUtcEpoch((value ?? "").trim());
  if (ep == null) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((ep - today) / (1000 * 60 * 60 * 24));
}
