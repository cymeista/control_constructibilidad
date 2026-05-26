/**
 * Grid estándar para bloques de KpiCard: 2 columnas en móvil, 1 solo en viewports muy estrechos.
 * Ajustar `lg:grid-cols-*` según cantidad de tarjetas del bloque (p. ej. 4 u 6).
 */
export const kpiCardsGridClassName =
  "grid grid-cols-2 items-stretch gap-2 max-[320px]:grid-cols-1 sm:gap-3 lg:grid-cols-4 lg:gap-[14px]";

/** Bloque de 6 KPI (p. ej. Proyectos): 2 cols móvil, 3 en sm, 6 en lg+. */
export const kpiCardsGridClassName6 =
  "grid grid-cols-2 items-stretch gap-2 max-[320px]:grid-cols-1 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6 lg:gap-3";

/** Bloque de 8 KPI (p. ej. Capacidad del Equipo): 2 cols móvil, 4 en xl+. */
export const kpiCardsGridClassName8 =
  "grid grid-cols-2 items-stretch gap-3 max-[320px]:grid-cols-1 sm:grid-cols-2 xl:grid-cols-4";

/** Bloque de 5 KPI (p. ej. Profesionales): 2 cols móvil, 5 en lg+. */
export const kpiCardsGridClassName5 =
  "grid grid-cols-2 items-stretch gap-[14px] max-[320px]:grid-cols-1 sm:grid-cols-2 lg:grid-cols-5";

interface KpiCardProps {
  label: string;
  value: string;
  subtitle: string;
  /** Segunda línea de contexto (p. ej. referencia sin L2). */
  secondaryLine?: string;
  topColor?: string;
  /** Solo si aporta contexto extra; omitir para reducir ruido. */
  tag?: string;
  tagColor?: string;
}

/**
 * Tarjeta KPI compacta: altura uniforme, subtítulo una línea (ellipsis si hace falta).
 */
export default function KpiCard({
  label,
  value,
  subtitle,
  secondaryLine,
  topColor = "#1e4a6e",
  tag,
  tagColor,
}: KpiCardProps) {
  return (
    <div
      className="flex h-full min-h-[88px] min-w-0 flex-col rounded-r12 border border-bdr bg-white p-3 shadow-sh1 transition-all duration-200 hover:shadow-sh2 sm:min-h-[100px] md:min-h-[120px] sm:p-4"
      style={{ borderTop: `3px solid ${topColor}` }}
    >
      <span className="line-clamp-2 text-[9px] font-semibold uppercase leading-tight tracking-[0.12em] text-t500">
        {label}
      </span>
      <span className="mt-1.5 min-w-0 break-words font-sans text-[clamp(1.2rem,1.1rem+0.5vw,1.55rem)] font-semibold tabular-nums leading-none tracking-tight text-t900">
        {value}
      </span>
      <p
        className="mt-1.5 line-clamp-2 min-h-[1.125rem] text-[11px] leading-snug text-t600"
        title={subtitle}
      >
        {subtitle}
      </p>
      {secondaryLine ? (
        <p
          className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-t400"
          title={secondaryLine}
        >
          {secondaryLine}
        </p>
      ) : null}
      <div className="mt-auto flex min-h-[18px] items-end pt-0.5">
        {tag ? (
          <span
            className="inline-block max-w-full truncate rounded-r4 px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide"
            style={{ background: tagColor ? `${tagColor}14` : "rgba(196,93,44,0.1)", color: tagColor || "#c45d2c" }}
          >
            {tag}
          </span>
        ) : null}
      </div>
    </div>
  );
}
