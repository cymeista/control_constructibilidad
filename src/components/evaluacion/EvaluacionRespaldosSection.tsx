import { useEffect, useRef, useState } from "react";
import {
  CloudUpload,
  Link2,
  FileText,
  StickyNote,
  Trash2,
  Plus,
  HardDrive,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { EvaluacionEntregableRespaldo } from "@/context/AppDataContext";
import {
  AYUDA_ARCHIVO_REFERENCIADO,
  crearRespaldoDesdeDraft,
  TIPO_RESPALDO_LABEL,
  type RespaldoEvaluacionDraft,
  type RespaldoEvaluacionEntregableTipo,
} from "@/evaluacion/evaluacionRespaldos";
import {
  createSignedUrlForEvaluacionRespaldo,
  deleteEvaluacionRespaldoStorageFile,
  fmtRespaldoFileSize,
  MSG_UPLOAD_RESPALDO_ADMIN,
  uploadEvaluacionRespaldoFile,
  validateEvaluacionRespaldoFile,
} from "@/supabase/supabaseEvaluacionStorage";
import { isSupabaseConfigured } from "@/supabase/supabaseClient";
import { useAuth } from "@/security/AuthContext";

const TIPO_ICON = {
  LINK: Link2,
  ARCHIVO_REFERENCIADO: FileText,
  NOTA: StickyNote,
  ARCHIVO_SUPABASE: HardDrive,
} as const;

const EMPTY_DRAFT: RespaldoEvaluacionDraft = {
  tipo: "LINK",
  nombre: "",
  descripcion: "",
  url: "",
  nombre_archivo: "",
};

const FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg";

const UPLOAD_ERROR_GENERIC = "No se pudo subir el archivo. Intenta nuevamente.";

type UploadUiPhase = "idle" | "selected" | "uploading" | "success" | "error";

type UploadUiState = {
  phase: UploadUiPhase;
  fileKey?: string;
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
  errorMessage?: string;
  /** Solo UI: respaldo recién subido en esta sesión de carga */
  lastRespaldoId?: string;
};

function fileSelectionKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function fmtFileTypeLabel(file: File): string {
  if (file.type) return file.type;
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  return ext ? `.${ext}` : "—";
}

async function quitarRespaldoConStorage(
  r: EvaluacionEntregableRespaldo,
  respaldos: EvaluacionEntregableRespaldo[],
  onChange: (next: EvaluacionEntregableRespaldo[]) => void,
  canDeleteStorage: boolean,
): Promise<void> {
  if (r.tipo !== "ARCHIVO_SUPABASE" || !r.storage_path || !canDeleteStorage) {
    onChange(respaldos.filter((x) => x.id !== r.id));
    return;
  }
  if (!window.confirm(`¿Eliminar el respaldo «${r.nombre}» y su archivo en Supabase Storage?`)) {
    return;
  }
  const del = await deleteEvaluacionRespaldoStorageFile(r.storage_path);
  if (!del.ok) {
    const forzar = window.confirm(
      `${del.error}\n\n¿Eliminar solo la referencia en la evaluación (sin borrar el archivo en Storage)?`,
    );
    if (!forzar) return;
  }
  onChange(respaldos.filter((x) => x.id !== r.id));
}

function RespaldoArchivoSupabaseAcciones({
  r,
  canOpenStorage,
  onRemove,
}: {
  r: EvaluacionEntregableRespaldo;
  canOpenStorage: boolean;
  onRemove?: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const handleVer = async () => {
    if (!r.storage_path) return;
    setOpenError(null);
    setOpening(true);
    const res = await createSignedUrlForEvaluacionRespaldo(r.storage_path);
    setOpening(false);
    if (!res.ok) {
      setOpenError(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {canOpenStorage && r.storage_path ? (
        <button
          type="button"
          disabled={opening}
          className="inline-flex items-center gap-1 rounded-r6 border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 disabled:opacity-50"
          onClick={() => void handleVer()}
        >
          {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
          Ver / Descargar
        </button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-r6 border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Quitar
        </button>
      ) : null}
      {openError ? <p className="w-full text-[10px] text-red-700">{openError}</p> : null}
    </div>
  );
}

export function EvaluacionRespaldosLista({
  respaldos,
  canOpenStorage = false,
  onRemove,
}: {
  respaldos: EvaluacionEntregableRespaldo[];
  canOpenStorage?: boolean;
  onRemove?: (r: EvaluacionEntregableRespaldo) => void;
}) {
  if (respaldos.length === 0) {
    return <p className="text-[12px] text-t500">Sin respaldos registrados.</p>;
  }

  return (
    <ul className="space-y-2">
      {respaldos.map((r) => {
        const Icon = TIPO_ICON[r.tipo];
        return (
          <li key={r.id} className="rounded-r8 border border-bdr px-3 py-2 text-[12px]">
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-t900">{r.nombre}</p>
                <p className="text-[10px] text-t500">{TIPO_RESPALDO_LABEL[r.tipo]}</p>
                {r.descripcion ? <p className="mt-1 text-t700">{r.descripcion}</p> : null}
                {r.tipo === "LINK" && r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block break-all text-[11px] font-medium text-indigo-700 underline"
                  >
                    {r.url}
                  </a>
                ) : null}
                {r.tipo === "ARCHIVO_REFERENCIADO" && r.nombre_archivo ? (
                  <p className="mt-1 font-mono text-[11px] text-t600">Archivo: {r.nombre_archivo}</p>
                ) : null}
                {r.tipo === "ARCHIVO_SUPABASE" ? (
                  <div className="mt-1 space-y-0.5 text-[11px] text-t600">
                    {r.nombre_archivo ? <p>Archivo: {r.nombre_archivo}</p> : null}
                    <p>Tamaño: {fmtRespaldoFileSize(r.size_bytes)}</p>
                    {r.mime_type ? <p>Tipo: {r.mime_type}</p> : null}
                    {r.storage_path ? (
                      <p
                        className="truncate font-mono text-[10px] text-t400"
                        title={r.storage_path}
                      >
                        {r.storage_path}
                      </p>
                    ) : null}
                    <RespaldoArchivoSupabaseAcciones
                      r={r}
                      canOpenStorage={canOpenStorage}
                      onRemove={onRemove ? () => onRemove(r) : undefined}
                    />
                  </div>
                ) : null}
                {r.tipo !== "ARCHIVO_SUPABASE" && r.nombre_archivo ? (
                  <p className="mt-1 font-mono text-[11px] text-t600">Archivo: {r.nombre_archivo}</p>
                ) : null}
                {r.tipo !== "ARCHIVO_SUPABASE" && onRemove ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 rounded-r6 border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700"
                    onClick={() => onRemove(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function UploadStatusBadge({ phase }: { phase: UploadUiPhase }) {
  if (phase === "uploading") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
        <Loader2 className="h-3 w-3 animate-spin" />
        Subiendo archivo…
      </span>
    );
  }
  if (phase === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        Archivo subido correctamente
      </span>
    );
  }
  if (phase === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
        <AlertCircle className="h-3 w-3" />
        Error de subida
      </span>
    );
  }
  if (phase === "selected") {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
        Archivo seleccionado
      </span>
    );
  }
  return null;
}

export default function EvaluacionRespaldosSection({
  respaldos,
  onChange,
  editable = true,
  evaluacionId,
  canUploadStorage = false,
}: {
  respaldos: EvaluacionEntregableRespaldo[];
  onChange?: (next: EvaluacionEntregableRespaldo[]) => void;
  editable?: boolean;
  evaluacionId?: string;
  canUploadStorage?: boolean;
}) {
  const [draft, setDraft] = useState<RespaldoEvaluacionDraft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = useState(false);
  const [uploadNombre, setUploadNombre] = useState("");
  const [uploadDescripcion, setUploadDescripcion] = useState("");
  const [uploadUi, setUploadUi] = useState<UploadUiState>({ phase: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const respaldosRef = useRef(respaldos);
  const uploadInFlightRef = useRef(false);
  const lastUploadedFileKeyRef = useRef<string | null>(null);

  const { authSource } = useAuth();
  const eid = (evaluacionId ?? "").trim();
  const storageReady = canUploadStorage && !!eid;
  const canOpenStorageFiles = isSupabaseConfigured() && authSource === "supabase";

  useEffect(() => {
    respaldosRef.current = respaldos;
  }, [respaldos]);

  const resetUploadPanel = () => {
    setUploadUi({ phase: "idle" });
    uploadInFlightRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAdd = () => {
    const row = crearRespaldoDesdeDraft(draft);
    if (!row || !onChange) return;
    onChange([...respaldosRef.current, row]);
    setDraft(EMPTY_DRAFT);
    setFormOpen(false);
  };

  const handleRemove = (r: EvaluacionEntregableRespaldo) => {
    if (!onChange) return;
    void quitarRespaldoConStorage(r, respaldosRef.current, onChange, canUploadStorage).then(() => {
      if (uploadUi.lastRespaldoId === r.id) {
        resetUploadPanel();
      }
    });
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file || !onChange || !storageReady) return;
    if (uploadInFlightRef.current) return;

    const fileKey = fileSelectionKey(file);
    if (lastUploadedFileKeyRef.current === fileKey) {
      setUploadUi({
        phase: "error",
        fileKey,
        fileName: file.name,
        fileSize: file.size,
        fileMime: fmtFileTypeLabel(file),
        errorMessage: "Este archivo ya fue subido en esta sesión.",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const validationErr = validateEvaluacionRespaldoFile(file);
    if (validationErr) {
      setUploadUi({
        phase: "error",
        fileKey,
        fileName: file.name,
        fileSize: file.size,
        fileMime: fmtFileTypeLabel(file),
        errorMessage: validationErr,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadUi({
      phase: "selected",
      fileKey,
      fileName: file.name,
      fileSize: file.size,
      fileMime: fmtFileTypeLabel(file),
    });

    uploadInFlightRef.current = true;
    setUploadUi((prev) => ({ ...prev, phase: "uploading" }));

    const res = await uploadEvaluacionRespaldoFile(eid, file, {
      nombre: uploadNombre.trim() || undefined,
      descripcion: uploadDescripcion.trim() || undefined,
    });

    uploadInFlightRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!res.ok) {
      setUploadUi({
        phase: "error",
        fileKey,
        fileName: file.name,
        fileSize: file.size,
        fileMime: fmtFileTypeLabel(file),
        errorMessage: res.error?.trim() || UPLOAD_ERROR_GENERIC,
      });
      return;
    }

    const next = [...respaldosRef.current, res.respaldo];
    respaldosRef.current = next;
    onChange(next);
    lastUploadedFileKeyRef.current = fileKey;

    setUploadUi({
      phase: "success",
      fileKey,
      fileName: file.name,
      fileSize: file.size,
      fileMime: fmtFileTypeLabel(file),
      lastRespaldoId: res.respaldo.id,
    });
    setUploadNombre("");
    setUploadDescripcion("");
  };

  const lastUploadedRespaldo =
    uploadUi.lastRespaldoId != null
      ? respaldos.find((r) => r.id === uploadUi.lastRespaldoId)
      : undefined;

  const showUploadFeedback =
    uploadUi.phase === "selected" ||
    uploadUi.phase === "uploading" ||
    uploadUi.phase === "success" ||
    uploadUi.phase === "error";

  const canPickNewFile = uploadUi.phase === "idle" || uploadUi.phase === "error";

  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-t500">
          Respaldos / Evidencias
        </h4>
        <p className="mt-0.5 text-[10px] text-t500">
          Enlaces, notas y referencias locales sin binarios. Los archivos subidos se guardan en Supabase
          Storage; la evaluación solo guarda metadata.
        </p>
      </div>

      <EvaluacionRespaldosLista
        respaldos={respaldos}
        canOpenStorage={canOpenStorageFiles}
        onRemove={editable && canUploadStorage && onChange ? handleRemove : undefined}
      />

      {editable && onChange ? (
        <>
          {storageReady ? (
            <div className="space-y-3 rounded-r8 border border-indigo-200 bg-indigo-50/40 p-3">
              <p className="text-[10px] font-semibold uppercase text-indigo-800">Subir archivo</p>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-t500">Nombre (opcional)</span>
                <input
                  value={uploadNombre}
                  onChange={(e) => setUploadNombre(e.target.value)}
                  disabled={uploadUi.phase === "uploading"}
                  className="h-8 rounded-r6 border border-bdr bg-white px-2 text-[12px] disabled:opacity-60"
                  placeholder="Si vacío, se usa el nombre del archivo"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-t500">Descripción (opcional)</span>
                <textarea
                  value={uploadDescripcion}
                  onChange={(e) => setUploadDescripcion(e.target.value)}
                  disabled={uploadUi.phase === "uploading"}
                  rows={2}
                  className="rounded-r6 border border-bdr bg-white px-2 py-1 text-[12px] disabled:opacity-60"
                />
              </label>

              {showUploadFeedback && uploadUi.fileName ? (
                <div
                  className={`space-y-2 rounded-r8 border px-3 py-2.5 ${
                    uploadUi.phase === "error"
                      ? "border-red-200 bg-red-50/80"
                      : uploadUi.phase === "success"
                        ? "border-emerald-200 bg-emerald-50/80"
                        : "border-indigo-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase text-t500">Archivo seleccionado</p>
                    <UploadStatusBadge phase={uploadUi.phase} />
                  </div>
                  <p className="font-mono text-[12px] font-medium text-t900">
                    {uploadUi.fileName}
                    {uploadUi.fileSize != null ? (
                      <span className="font-sans text-t600">
                        {" "}
                        · {fmtRespaldoFileSize(uploadUi.fileSize)}
                      </span>
                    ) : null}
                  </p>
                  {uploadUi.fileMime ? (
                    <p className="text-[11px] text-t600">Tipo: {uploadUi.fileMime}</p>
                  ) : null}

                  {uploadUi.phase === "error" && uploadUi.errorMessage ? (
                    <p className="text-[12px] font-medium text-red-800">
                      {uploadUi.errorMessage.includes("MB") ||
                      uploadUi.errorMessage.includes("permitido") ||
                      uploadUi.errorMessage.includes("ya fue subido")
                        ? uploadUi.errorMessage
                        : UPLOAD_ERROR_GENERIC}
                    </p>
                  ) : null}

                  {uploadUi.phase === "success" && lastUploadedRespaldo ? (
                    <div className="mt-2 space-y-1 border-t border-emerald-200/80 pt-2">
                      <p className="text-[10px] font-semibold uppercase text-emerald-800">Respaldo asociado</p>
                      <p className="text-[12px] font-semibold text-t900">{lastUploadedRespaldo.nombre}</p>
                      {lastUploadedRespaldo.nombre_archivo ? (
                        <p className="text-[11px] text-t600">Archivo: {lastUploadedRespaldo.nombre_archivo}</p>
                      ) : null}
                      <p className="text-[11px] text-t600">
                        Tamaño: {fmtRespaldoFileSize(lastUploadedRespaldo.size_bytes)}
                      </p>
                      {lastUploadedRespaldo.mime_type ? (
                        <p className="text-[11px] text-t600">Tipo: {lastUploadedRespaldo.mime_type}</p>
                      ) : null}
                      {lastUploadedRespaldo.storage_path ? (
                        <p
                          className="truncate font-mono text-[10px] text-t400"
                          title={lastUploadedRespaldo.storage_path}
                        >
                          {lastUploadedRespaldo.storage_path}
                        </p>
                      ) : null}
                      <RespaldoArchivoSupabaseAcciones
                        r={lastUploadedRespaldo}
                        canOpenStorage={canOpenStorageFiles}
                        onRemove={() => handleRemove(lastUploadedRespaldo)}
                      />
                    </div>
                  ) : null}

                  {uploadUi.phase === "success" || uploadUi.phase === "error" ? (
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center gap-1 rounded-r6 border border-bdr bg-white px-3 py-1.5 text-[11px] font-semibold text-indigo-700"
                      onClick={resetUploadPanel}
                    >
                      <CloudUpload className="h-3.5 w-3.5" />
                      Subir otro archivo
                    </button>
                  ) : null}
                </div>
              ) : null}

              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={(e) => void handleFileSelected(e.target.files?.[0])}
              />
              {canPickNewFile ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-r6 bg-indigo-700 px-3 py-1.5 text-[11px] font-semibold text-white"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  Seleccionar archivo
                </button>
              ) : null}
              <p className="text-[10px] text-t500">Máx. 10 MB · pdf, doc(x), xls(x), ppt(x), png, jpg, jpeg</p>
            </div>
          ) : (
            <p className="text-[11px] text-amber-800">{MSG_UPLOAD_RESPALDO_ADMIN}</p>
          )}

          {formOpen ? (
            <div className="space-y-2 rounded-r8 border border-dashed border-bdr bg-surface2/30 p-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-t500">Tipo</span>
                <select
                  value={draft.tipo}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      tipo: e.target.value as RespaldoEvaluacionEntregableTipo,
                    }))
                  }
                  className="h-8 rounded-r6 border border-bdr bg-white px-2 text-[12px]"
                >
                  <option value="LINK">Enlace (URL)</option>
                  <option value="ARCHIVO_REFERENCIADO">Archivo referenciado</option>
                  <option value="NOTA">Nota</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-t500">Nombre *</span>
                <input
                  value={draft.nombre}
                  onChange={(e) => setDraft((d) => ({ ...d, nombre: e.target.value }))}
                  className="h-8 rounded-r6 border border-bdr px-2 text-[12px]"
                  placeholder="Ej. Revisión interna v2"
                />
              </label>
              {draft.tipo === "LINK" ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase text-t500">URL *</span>
                  <input
                    value={draft.url}
                    onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                    className="h-8 rounded-r6 border border-bdr px-2 text-[12px]"
                    placeholder="https://..."
                    type="url"
                  />
                </label>
              ) : null}
              {draft.tipo === "ARCHIVO_REFERENCIADO" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase text-t500">
                      Nombre del archivo
                    </span>
                    <input
                      value={draft.nombre_archivo}
                      onChange={(e) => setDraft((d) => ({ ...d, nombre_archivo: e.target.value }))}
                      className="h-8 rounded-r6 border border-bdr px-2 text-[12px]"
                      placeholder="informe_revision.pdf"
                    />
                  </label>
                  <p className="text-[10px] leading-snug text-amber-800">{AYUDA_ARCHIVO_REFERENCIADO}</p>
                </>
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-t500">Descripción</span>
                <textarea
                  value={draft.descripcion}
                  onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))}
                  rows={2}
                  className="rounded-r6 border border-bdr px-2 py-1 text-[12px]"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-r6 bg-indigo-700 px-3 py-1.5 text-[11px] font-semibold text-white"
                  onClick={handleAdd}
                >
                  Agregar respaldo
                </button>
                <button
                  type="button"
                  className="rounded-r6 border border-bdr px-3 py-1.5 text-[11px] text-t700"
                  onClick={() => {
                    setFormOpen(false);
                    setDraft(EMPTY_DRAFT);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-700"
              onClick={() => setFormOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Agregar respaldo (enlace, nota o referencia)
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}
