import { useAppDataPersistence } from "@/context/AppDataContext";

const PHASE_LABEL: Record<string, string> = {
  loading_supabase: "Cargando desde Supabase",
  connected: "Supabase conectado",
  local_fallback: "Usando respaldo local",
  pending: "Cambios pendientes",
  saving: "Guardando en Supabase",
  saved: "Guardado en Supabase",
  error: "Error al guardar",
};

const PHASE_CLASS: Record<string, string> = {
  loading_supabase: "bg-indigo-50 text-indigo-800 border-indigo-200",
  connected: "bg-emerald-50 text-emerald-800 border-emerald-200",
  local_fallback: "bg-amber-50 text-amber-900 border-amber-200",
  pending: "bg-slate-50 text-slate-700 border-slate-200",
  saving: "bg-indigo-50 text-indigo-800 border-indigo-200",
  saved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  error: "bg-red-50 text-red-800 border-red-200",
};

export default function AppDataPersistenceBadge({ compact = false }: { compact?: boolean }) {
  const p = useAppDataPersistence();

  if (!p.bootstrapDone) {
    return (
      <span
        className={`inline-flex max-w-[11rem] items-center truncate rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-800 sm:max-w-none ${compact ? "" : "sm:px-2.5 sm:py-1 sm:text-[11px]"}`}
        title="Cargando datos"
      >
        Cargando…
      </span>
    );
  }

  const label = PHASE_LABEL[p.savePhase] ?? "—";
  const cls = PHASE_CLASS[p.savePhase] ?? "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <span
      className={`inline-flex max-w-[10rem] truncate rounded-full border px-2 py-0.5 font-medium sm:max-w-[14rem] ${cls} ${compact ? "text-[10px]" : "text-[10px] sm:px-2.5 sm:py-1 sm:text-[11px]"}`}
      title={
        p.localFallbackMessage ??
        p.writeBlockedHint ??
        p.saveError ??
        (p.dataSource === "supabase" ? "Fuente: Supabase" : "Fuente: respaldo local")
      }
    >
      {label}
    </span>
  );
}
