import { useMemo, useState, type ReactNode } from "react";
import { UsersRound, RefreshCw } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Button } from "@/components/ui/button";

export default function SyncLideresEquipoPanel() {
  const { auditarLideresEntregablesConEquipo, sincronizarLideresEntregablesConEquipo } =
    useAppData();
  const [busy, setBusy] = useState(false);
  const [lastCorregidos, setLastCorregidos] = useState<number | null>(null);

  const pendientes = useMemo(
    () => auditarLideresEntregablesConEquipo(),
    [auditarLideresEntregablesConEquipo],
  );

  const handleSync = async () => {
    const n = pendientes.length;
    if (n === 0) {
      window.alert("No hay entregables pendientes de sincronización líder ↔ equipo.");
      return;
    }
    const ok = window.confirm(
      `Se sincronizarán hasta ${n} entregable(s): equipo_entregable se alineará con lider_id.\n\nNo modifica RegistroHora ni horas. ¿Continuar?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = sincronizarLideresEntregablesConEquipo();
      setLastCorregidos(res.corregidos);
      const restantes = res.pendientes.length;
      window.alert(
        `Sincronización completada.\nCorregidos: ${res.corregidos}\nPendientes tras reparación: ${restantes}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-snug text-t600">
        Alinea <span className="font-mono">equipo_entregable</span> con{" "}
        <span className="font-mono">entregable.lider_id</span> en entregables existentes. Útil si
        Formularios asignó líder pero el equipo quedó vacío. Prioridad:{" "}
        <span className="font-semibold">lider_id</span> manda; otros LIDER pasan a APOYO.
      </p>
      <p className="text-[12px] font-semibold text-t800">
        Pendientes detectados: {pendientes.length}
      </p>
      {pendientes.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-r8 border border-bdr bg-[#F7F8FA] p-2 text-[10px] text-t700">
          {pendientes.slice(0, 20).map((p) => (
            <li key={`${p.entregable_id}-${p.motivo}`}>
              <span className="font-medium">{p.entregable_nombre}</span> — {p.motivo}
            </li>
          ))}
          {pendientes.length > 20 ? (
            <li className="text-t500">… y {pendientes.length - 20} más</li>
          ) : null}
        </ul>
      ) : (
        <p className="text-[11px] text-emerald-800">Todos los líderes están sincronizados con el equipo.</p>
      )}
      {lastCorregidos != null ? (
        <p className="text-[10px] text-t500">Última ejecución: {lastCorregidos} entregable(s) corregido(s).</p>
      ) : null}
      <Button
        type="button"
        disabled={busy || pendientes.length === 0}
        className="inline-flex items-center gap-2 bg-[#4F46E5] text-white hover:bg-[#3730A3] disabled:opacity-50"
        onClick={() => void handleSync()}
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        Sincronizar líderes con equipo
      </Button>
    </div>
  );
}

export function SyncLideresEquipoSettingsCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-bdr bg-white shadow-sh1">
      <div className="flex items-center gap-2 border-b border-bdr px-[20px] py-[14px]">
        <UsersRound className="h-[18px] w-[18px] text-[#4F46E5]" />
        <h3 className="text-[13px] font-semibold text-t900">Sincronizar líderes con equipo</h3>
      </div>
      <div className="p-[20px]">{children}</div>
    </div>
  );
}
