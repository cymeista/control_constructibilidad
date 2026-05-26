type StatusVariant = "CRITICO" | "RIESGO" | "OK" | "ADELANTADO" | "COMPLETADO" | "NO_INICIADO";

interface StatusPillProps {
  variant: StatusVariant;
  showDot?: boolean;
  className?: string;
  /** Reemplaza la etiqueta fija del variant (p. ej. estado completo en español). */
  labelOverride?: string;
}

/** Mapea el `estado` extendido de entregables al variant visual de la pastilla. */
export function entregableEstadoToStatusVariant(estado: string): StatusVariant {
  if (estado === "CRITICO" || estado.startsWith("Atraso Crítico")) return "CRITICO";
  if (estado === "RIESGO" || estado.startsWith("Riesgo:")) return "RIESGO";
  if (estado === "NO_INICIADO" || estado === "No Iniciado") return "NO_INICIADO";
  if (estado === "COMPLETADO" || estado === "Completado") return "COMPLETADO";
  if (estado === "ADELANTADO" || estado === "Adelantado") return "ADELANTADO";
  if (estado === "EN_PLAZO" || estado === "En Plazo") return "OK";
  if (estado === "Leve Retraso" || estado === "Retrasado") return "RIESGO";
  return "OK";
}

const config: Record<StatusVariant, { bg: string; text: string; dot: string; label: string }> = {
  CRITICO: { bg: "#FEF2F2", text: "#B91C1C", dot: "#B91C1C", label: "CRÍTICO" },
  RIESGO: { bg: "#FFF7ED", text: "#B45309", dot: "#B45309", label: "RIESGO" },
  OK: { bg: "#ECFDF5", text: "#047857", dot: "#047857", label: "OK" },
  ADELANTADO: { bg: "#ECFDF5", text: "#047857", dot: "#047857", label: "ADELANTADO" },
  COMPLETADO: { bg: "#E0E7FF", text: "#4F46E5", dot: "#4F46E5", label: "COMPLETADO" },
  NO_INICIADO: { bg: "#F1F5F9", text: "#475569", dot: "#475569", label: "NO INICIADO" },
};

export default function StatusPill({
  variant,
  showDot = true,
  className = "",
  labelOverride,
}: StatusPillProps) {
  const c = config[variant];
  const text = labelOverride ?? c.label;
  const textCls = labelOverride
    ? "max-w-[min(240px,100%)] whitespace-normal text-left text-[9px] font-semibold normal-case leading-snug"
    : "text-[9.5px] font-semibold uppercase";
  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-r4 px-2 py-[3px] ${textCls} ${className}`}
      style={{ background: c.bg, color: c.text }}
      title={labelOverride}
    >
      {showDot && <span className="inline-block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: c.dot }} />}
      {text}
    </span>
  );
}
