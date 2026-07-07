import { useCallback, useMemo, useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { Profesional, RegistroHora } from "@/context/AppDataContext";
import {
  MIGRACION_FESTIVOS_HISTORICOS_CONFIRMACION,
  MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD,
} from "@/horas/migracionFestivosHistoricosManifest";
import {
  ejecutarPreflightMigracionFestivosHistoricos,
  type MigracionFestivosAplicacionResult,
  type MigracionFestivosPreflightResult,
} from "@/horas/migracionFestivosHistoricosPreflight";
import { Button } from "@/components/ui/button";

function fmtH(n: number) {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function EstadoGlobalBadge({ estado }: { estado: MigracionFestivosPreflightResult["estado_global"] }) {
  if (estado === "LISTO_PARA_MIGRAR") {
    return (
      <span className="inline-flex items-center gap-1 rounded-r8 border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" /> LISTO PARA MIGRAR
      </span>
    );
  }
  if (estado === "YA_MIGRADO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-r8 border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-800">
        <CheckCircle2 className="h-3.5 w-3.5" /> YA MIGRADO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-r8 border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800">
      <ShieldAlert className="h-3.5 w-3.5" /> BLOQUEADO
    </span>
  );
}

function FilaEstadoBadge({ estado }: { estado: string }) {
  const styles =
    estado === "OK_INDIRECTA"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : estado === "OK_FESTIVO"
        ? "border-violet-300 bg-violet-50 text-violet-900"
        : "border-red-300 bg-red-50 text-red-800";
  return (
    <span className={`inline-flex rounded-r4 border px-1.5 py-0.5 text-[10px] font-semibold ${styles}`}>
      {estado}
    </span>
  );
}

export interface MigracionFestivosHistoricosPanelProps {
  registro_horas: RegistroHora[];
  profesionales: Profesional[];
  onAplicarMigracion: () => MigracionFestivosAplicacionResult;
}

export default function MigracionFestivosHistoricosPanel({
  registro_horas,
  profesionales,
  onAplicarMigracion,
}: MigracionFestivosHistoricosPanelProps) {
  const [preflight, setPreflight] = useState<MigracionFestivosPreflightResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<Extract<MigracionFestivosAplicacionResult, { ok: true }> | null>(
    null,
  );
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleVerificar = useCallback(() => {
    setApplyResult(null);
    setApplyError(null);
    setConfirmText("");
    setPreflight(ejecutarPreflightMigracionFestivosHistoricos(registro_horas, profesionales));
  }, [registro_horas, profesionales]);

  const canApply = useMemo(
    () =>
      preflight?.estado_global === "LISTO_PARA_MIGRAR" &&
      preflight.registros_validos === MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD &&
      confirmText === MIGRACION_FESTIVOS_HISTORICOS_CONFIRMACION &&
      !applying,
    [preflight, confirmText, applying],
  );

  const handleAplicar = useCallback(() => {
    if (!canApply || applying) return;
    setApplying(true);
    setApplyError(null);
    try {
      const result = onAplicarMigracion();
      if (result.ok) {
        setApplyResult(result);
        setConfirmText("");
      } else {
        setApplyError(result.error);
      }
    } finally {
      setApplying(false);
    }
  }, [canApply, applying, onAplicarMigracion]);

  useEffect(() => {
    if (applyResult) {
      setPreflight(ejecutarPreflightMigracionFestivosHistoricos(registro_horas, profesionales));
    }
  }, [applyResult, registro_horas, profesionales]);

  return (
    <div className="space-y-4 text-[12px] text-t700">
      <p className="leading-relaxed text-t600">
        Herramienta temporal para reclasificar exactamente{" "}
        <strong className="font-semibold text-t800">{MIGRACION_FESTIVOS_HISTORICOS_CANTIDAD}</strong> registros
        históricos de <span className="font-mono">INDIRECTA</span> a <span className="font-mono">FESTIVO</span>{" "}
        según manifiesto cerrado. La previsualización no modifica datos.
      </p>

      <Button type="button" variant="outline" onClick={handleVerificar} disabled={applying}>
        Verificar migración
      </Button>

      {preflight ? (
        <div className="space-y-4 rounded-r8 border border-bdr bg-[#F7F8FA] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <EstadoGlobalBadge estado={preflight.estado_global} />
            <span>
              Encontrados: <strong className="font-mono">{preflight.registros_encontrados}</strong> / 24
            </span>
            <span>
              Válidos: <strong className="font-mono">{preflight.registros_validos}</strong>
            </span>
            <span>
              Bloqueados: <strong className="font-mono">{preflight.registros_bloqueados}</strong>
            </span>
          </div>

          {preflight.mensajes_bloqueo.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-red-800">
              {preflight.mensajes_bloqueo.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-r8 border border-bdr bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-t500">Horas a reclasificar</p>
              <p className="font-mono text-[16px] font-bold">{fmtH(preflight.horas_a_reclasificar)}</p>
            </div>
            <div className="rounded-r8 border border-bdr bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-t500">INDIRECTA actual</p>
              <p className="font-mono text-[16px] font-bold">{fmtH(preflight.horas_indirecta_actual)}</p>
            </div>
            <div className="rounded-r8 border border-bdr bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-t500">FESTIVO actual</p>
              <p className="font-mono text-[16px] font-bold">{fmtH(preflight.horas_festivo_actual)}</p>
            </div>
            <div className="rounded-r8 border border-bdr bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-t500">Suma INDIRECTA+FESTIVO</p>
              <p className="font-mono text-[16px] font-bold">{fmtH(preflight.suma_combinada_actual)}</p>
            </div>
          </div>

          {preflight.estado_global === "LISTO_PARA_MIGRAR" ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-r8 border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-emerald-800">INDIRECTA después (sim.)</p>
                <p className="font-mono text-[16px] font-bold text-emerald-900">
                  {fmtH(preflight.horas_indirecta_despues)}
                </p>
              </div>
              <div className="rounded-r8 border border-violet-200 bg-violet-50/50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-violet-800">FESTIVO después (sim.)</p>
                <p className="font-mono text-[16px] font-bold text-violet-900">
                  {fmtH(preflight.horas_festivo_despues)}
                </p>
              </div>
              <div className="rounded-r8 border border-bdr bg-white px-3 py-2 sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase text-t500">Suma después (sim.)</p>
                <p className="font-mono text-[16px] font-bold">
                  {fmtH(preflight.suma_combinada_despues)}
                  {preflight.suma_combinada_actual === preflight.suma_combinada_despues ? (
                    <span className="ml-2 text-[11px] font-normal text-emerald-700">— total conservado</span>
                  ) : (
                    <span className="ml-2 text-[11px] font-normal text-red-700">— total no conservado</span>
                  )}
                </p>
              </div>
            </div>
          ) : null}

          <div className="max-h-[360px] overflow-auto rounded-r8 border border-bdr bg-white">
            <table className="w-full min-w-[900px] text-left text-[11px]">
              <thead className="sticky top-0 border-b border-bdr bg-[#F4F6FB] text-[9px] font-semibold uppercase tracking-wide text-t300">
                <tr>
                  <th className="px-2 py-2">Estado</th>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">Profesional</th>
                  <th className="px-2 py-2">Código</th>
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Hrs</th>
                  <th className="px-2 py-2">Tipo actual</th>
                  <th className="px-2 py-2">Tipo propuesto</th>
                  <th className="px-2 py-2">Validación</th>
                </tr>
              </thead>
              <tbody>
                {preflight.filas.map((f) => (
                  <tr key={f.registro_hora_id} className="border-t border-bdr">
                    <td className="px-2 py-1.5">
                      <FilaEstadoBadge estado={f.estado_fila} />
                    </td>
                    <td className="max-w-[120px] truncate px-2 py-1.5 font-mono text-[10px]" title={f.registro_hora_id}>
                      {f.registro_hora_id}
                    </td>
                    <td className="px-2 py-1.5">{f.profesional_nombre || "—"}</td>
                    <td className="px-2 py-1.5 font-mono">{f.profesional_codigo}</td>
                    <td className="px-2 py-1.5 font-mono">{f.fecha}</td>
                    <td className="px-2 py-1.5 font-mono">{f.horas}</td>
                    <td className="px-2 py-1.5 font-mono">{f.tipo_actual}</td>
                    <td className="px-2 py-1.5 font-mono">{f.tipo_propuesto}</td>
                    <td className="px-2 py-1.5 text-t600">{f.validacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {preflight?.estado_global === "LISTO_PARA_MIGRAR" ? (
        <div className="space-y-3 rounded-r8 border border-amber-300 bg-amber-50/60 p-4">
          <div className="flex items-start gap-2 text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="leading-relaxed">
              Esta acción reclasificará 24 registros y 174 horas desde INDIRECTA a FESTIVO. No creará ni eliminará
              registros. Espere hasta que el estado de guardado indique que Supabase quedó guardado correctamente.
            </p>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-t700">
              Escriba exactamente: <span className="font-mono">{MIGRACION_FESTIVOS_HISTORICOS_CONFIRMACION}</span>
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={applying}
              className="w-full rounded-r8 border border-bdr bg-white px-3 py-2 font-mono text-[12px] focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[rgba(99,102,241,.12)]"
              placeholder={MIGRACION_FESTIVOS_HISTORICOS_CONFIRMACION}
            />
          </label>
          <Button type="button" disabled={!canApply} onClick={handleAplicar}>
            {applying ? "Aplicando…" : "Aplicar migración definitiva"}
          </Button>
        </div>
      ) : null}

      {preflight?.estado_global === "YA_MIGRADO" ? (
        <p className="rounded-r8 border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-900">
          Los 24 registros del manifiesto ya están como FESTIVO. No se ofrece una segunda ejecución.
        </p>
      ) : null}

      {applyError ? (
        <p className="rounded-r8 border border-red-200 bg-red-50 px-3 py-2 text-red-800">{applyError}</p>
      ) : null}

      {applyResult ? (
        <div className="space-y-2 rounded-r8 border border-emerald-300 bg-emerald-50/70 p-4 text-emerald-950">
          <p className="font-semibold">Migración aplicada en AppData local (pendiente confirmar guardado en Supabase)</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Registros reclasificados: {applyResult.registros_reclasificados}</li>
            <li>Horas reclasificadas: {fmtH(applyResult.horas_reclasificadas)}</li>
            <li>
              INDIRECTA: {fmtH(applyResult.horas_indirecta_antes)} → {fmtH(applyResult.horas_indirecta_despues)}
            </li>
            <li>
              FESTIVO: {fmtH(applyResult.horas_festivo_antes)} → {fmtH(applyResult.horas_festivo_despues)}
            </li>
            <li>
              Suma INDIRECTA+FESTIVO: {fmtH(applyResult.suma_combinada_antes)} →{" "}
              {fmtH(applyResult.suma_combinada_despues)}
            </li>
            <li>
              Total registro_horas: {applyResult.total_registro_horas_antes} →{" "}
              {applyResult.total_registro_horas_despues} (sin crear ni eliminar)
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
