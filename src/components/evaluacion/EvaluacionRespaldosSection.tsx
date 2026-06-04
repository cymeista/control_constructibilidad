import { useRef, useState } from "react";
import { CloudUpload, Link2, FileText, StickyNote, Trash2, Plus, HardDrive, ExternalLink, Loader2 } from "lucide-react";
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

export function EvaluacionRespaldosLista({
  respaldos,
  canOpenStorage = false,
}: {
  respaldos: EvaluacionEntregableRespaldo[];
  canOpenStorage?: boolean;
}) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const handleVerArchivo = async (r: EvaluacionEntregableRespaldo) => {
    if (!r.storage_path) return;
    setOpenError(null);
    setOpeningId(r.id);
    const res = await createSignedUrlForEvaluacionRespaldo(r.storage_path);
    setOpeningId(null);
    if (!res.ok) {
      setOpenError(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  };

  if (respaldos.length === 0) {
    return <p className="text-[12px] text-t500">Sin respaldos registrados.</p>;
  }

  return (
    <div className="space-y-2">
      {openError ? (
        <p className="rounded-r6 border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
          {openError}
        </p>
      ) : null}
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
                      {canOpenStorage && r.storage_path ? (
                        <button
                          type="button"
                          disabled={openingId === r.id}
                          className="mt-1 inline-flex items-center gap-1 font-semibold text-indigo-700 disabled:opacity-50"
                          onClick={() => void handleVerArchivo(r)}
                        >
                          {openingId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5" />
                          )}
                          Ver archivo
                        </button>
                      ) : r.storage_path && !isSupabaseConfigured() ? (
                        <p className="text-[10px] text-amber-800">
                          Archivo en Storage (inicie sesión con Supabase para verlo).
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {r.tipo !== "ARCHIVO_SUPABASE" && r.nombre_archivo ? (
                    <p className="mt-1 font-mono text-[11px] text-t600">Archivo: {r.nombre_archivo}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { authSource } = useAuth();
  const eid = (evaluacionId ?? "").trim();
  const storageReady = canUploadStorage && !!eid;
  const canOpenStorageFiles = isSupabaseConfigured() && authSource === "supabase";

  const handleAdd = () => {
    const row = crearRespaldoDesdeDraft(draft);
    if (!row || !onChange) return;
    onChange([...respaldos, row]);
    setDraft(EMPTY_DRAFT);
    setFormOpen(false);
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file || !onChange || !storageReady) return;
    setUploadError(null);
    setUploading(true);
    const res = await uploadEvaluacionRespaldoFile(eid, file, {
      nombre: uploadNombre.trim() || undefined,
      descripcion: uploadDescripcion.trim() || undefined,
    });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!res.ok) {
      setUploadError(res.error);
      return;
    }
    onChange([...respaldos, res.respaldo]);
    setUploadNombre("");
    setUploadDescripcion("");
  };

  const handleRemove = (r: EvaluacionEntregableRespaldo) => {
    if (!onChange) return;
    void quitarRespaldoConStorage(r, respaldos, onChange, canUploadStorage);
  };

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

      <EvaluacionRespaldosLista respaldos={respaldos} canOpenStorage={canOpenStorageFiles} />

      {editable && onChange ? (
        <>
          {storageReady ? (
            <div className="space-y-2 rounded-r8 border border-indigo-200 bg-indigo-50/40 p-3">
              <p className="text-[10px] font-semibold uppercase text-indigo-800">Subir archivo</p>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-t500">Nombre (opcional)</span>
                <input
                  value={uploadNombre}
                  onChange={(e) => setUploadNombre(e.target.value)}
                  className="h-8 rounded-r6 border border-bdr bg-white px-2 text-[12px]"
                  placeholder="Si vacío, se usa el nombre del archivo"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-t500">Descripción (opcional)</span>
                <textarea
                  value={uploadDescripcion}
                  onChange={(e) => setUploadDescripcion(e.target.value)}
                  rows={2}
                  className="rounded-r6 border border-bdr bg-white px-2 py-1 text-[12px]"
                />
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={(e) => void handleFileSelected(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-r6 bg-indigo-700 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CloudUpload className="h-3.5 w-3.5" />
                )}
                {uploading ? "Subiendo…" : "Seleccionar archivo"}
              </button>
              <p className="text-[10px] text-t500">Máx. 10 MB · pdf, doc(x), xls(x), ppt(x), png, jpg, jpeg</p>
              {uploadError ? (
                <p className="text-[11px] text-red-700">{uploadError}</p>
              ) : null}
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

          {respaldos.length > 0 ? (
            <ul className="space-y-1 border-t border-bdr pt-2">
              {respaldos.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-r6 bg-surface2/50 px-2 py-1 text-[11px]"
                >
                  <span className="truncate">
                    {r.nombre} · {TIPO_RESPALDO_LABEL[r.tipo]}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-t400 hover:text-red-700"
                    title="Quitar"
                    onClick={() => handleRemove(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
