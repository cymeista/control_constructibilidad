import { useCallback, useMemo, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import {
  REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS,
  buildRegistroHoraImportPreview,
  downloadRegistroHoraImportErroresExcel,
  payloadsFromOkRows,
} from "@/entregables/registroHoraImport";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Llamado tras persistir el lote (la vista puede mostrar un aviso). */
  onSuccess?: (importedCount: number) => void;
};

export default function RegistroHoraImportDialog({ open, onOpenChange, onSuccess }: Props) {
  const { proyectos, entregables, profesionales, addRegistroHorasBatch } = useAppData();
  const [csvText, setCsvText] = useState("");
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      buildRegistroHoraImportPreview(csvText, {
        proyectos,
        entregables,
        profesionales,
      }),
    [csvText, proyectos, entregables, profesionales],
  );

  const reset = useCallback(() => {
    setCsvText("");
    setFileLabel(null);
  }, []);

  const onFile = (file: File | null) => {
    if (!file) {
      setCsvText("");
      setFileLabel(null);
      return;
    }
    setFileLabel(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const t = typeof reader.result === "string" ? reader.result : "";
      setCsvText(t);
    };
    reader.readAsText(file, "UTF-8");
  };

  const onConfirm = () => {
    const payloads = payloadsFromOkRows(preview);
    if (payloads.length === 0) return;
    addRegistroHorasBatch(payloads);
    onSuccess?.(payloads.length);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="grid max-h-[90vh] w-full max-w-[920px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[12px] border border-bdr bg-white p-0 shadow-sh3">
        <DialogHeader className="shrink-0 space-y-1 border-b border-bdr px-5 py-4 pr-12">
          <DialogTitle className="font-playfair text-[16px] font-semibold text-t900">
            Importar horas (CSV)
          </DialogTitle>
          <DialogDescription className="text-[12px] text-t500">
            Cabecera CSV con columnas:{" "}
            <span className="font-mono text-[11px]">{REGISTRO_HORA_IMPORT_REQUIRED_COLUMNS.join(", ")}</span>. La
            validación depende de <strong className="font-medium">tipo_hora</strong>: DIRECTA exige proyecto y
            entregable (fase/tarea); INDIRECTA y VACACIONES solo profesional, fecha y horas (proyecto/fase/tarea se
            ignoran). Revise la vista previa antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col overflow-hidden px-5 py-3">
          <div className="shrink-0 space-y-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-r8 border border-dashed border-bdr bg-surface2 px-4 py-3 text-[12px] text-t700 hover:bg-[#EEF1F8]">
              <Upload size={16} className="text-t500" />
              <span>{fileLabel ?? "Elegir archivo .csv (UTF-8)"}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {preview.headersError && (
              <div className="rounded-r8 border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                {preview.headersError}
              </div>
            )}

            {csvText && !preview.headersError && (
              <div className="flex flex-wrap gap-3 text-[12px] text-t700">
                <span>
                  Total filas: <strong className="font-mono">{preview.totals.all}</strong>
                </span>
                <span className="text-emerald-700">
                  Válidas: <strong className="font-mono">{preview.totals.ok}</strong>
                </span>
                <span className="text-red-700">
                  Error: <strong className="font-mono">{preview.totals.error}</strong>
                </span>
              </div>
            )}
          </div>

          {csvText && !preview.headersError && (
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-r8 border border-bdr">
              <table className="w-full min-w-[800px] text-left text-[11px]">
                <thead className="sticky top-0 z-[1] border-b border-bdr bg-[#F4F6FB] text-[9px] font-semibold uppercase tracking-wide text-t300">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Estado</th>
                    <th className="px-2 py-2">proyecto_codigo</th>
                    <th className="px-2 py-2">fase/tarea</th>
                    <th className="px-2 py-2">prof.</th>
                    <th className="px-2 py-2">fecha</th>
                    <th className="px-2 py-2">hrs</th>
                    <th className="px-2 py-2">tipo</th>
                    <th className="px-2 py-2">proyecto_id</th>
                    <th className="px-2 py-2">entregable_id</th>
                    <th className="px-2 py-2">profesional_id</th>
                    <th className="px-2 py-2">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr
                      key={row.lineIndex}
                      className={`border-t border-bdr ${row.status === "OK" ? "bg-white" : "bg-red-50/50"}`}
                    >
                      <td className="px-2 py-1.5 font-mono text-t500">{row.lineIndex}</td>
                      <td className="px-2 py-1.5 font-semibold">{row.status}</td>
                      <td className="px-2 py-1.5 font-mono">{row.cells.proyecto_codigo}</td>
                      <td className="px-2 py-1.5 font-mono">
                        {row.cells.cod_fase} / {row.cells.cod_tarea}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{row.cells.profesional_codigo}</td>
                      <td className="px-2 py-1.5 font-mono">{row.cells.fecha}</td>
                      <td className="px-2 py-1.5 font-mono">{row.cells.horas}</td>
                      <td className="px-2 py-1.5">{row.cells.tipo_hora}</td>
                      <td className="max-w-[90px] truncate px-2 py-1.5 font-mono text-[10px] text-t500">
                        {row.proyecto_id ?? "—"}
                      </td>
                      <td className="max-w-[90px] truncate px-2 py-1.5 font-mono text-[10px] text-t500">
                        {row.entregable_id ?? "—"}
                      </td>
                      <td className="max-w-[90px] truncate px-2 py-1.5 font-mono text-[10px] text-t500">
                        {row.profesional_id ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-red-800">{row.errors.join("; ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-bdr bg-white px-5 py-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={
              preview.totals.error === 0 || Boolean(preview.headersError) || !csvText
            }
            onClick={() => downloadRegistroHoraImportErroresExcel(preview, fileLabel)}
          >
            <Download size={14} />
            Exportar errores ({preview.totals.error})
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button
              type="button"
              disabled={preview.totals.ok === 0 || Boolean(preview.headersError)}
              onClick={onConfirm}
            >
              Confirmar importación ({preview.totals.ok} filas)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
