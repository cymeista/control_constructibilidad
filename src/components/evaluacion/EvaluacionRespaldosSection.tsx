import { useState } from "react";
import { Link2, FileText, StickyNote, Trash2, Plus } from "lucide-react";
import type { EvaluacionEntregableRespaldo } from "@/context/AppDataContext";
import {
  AYUDA_ARCHIVO_REFERENCIADO,
  crearRespaldoDesdeDraft,
  TIPO_RESPALDO_LABEL,
  type RespaldoEvaluacionDraft,
  type RespaldoEvaluacionEntregableTipo,
} from "@/evaluacion/evaluacionRespaldos";

const TIPO_ICON = {
  LINK: Link2,
  ARCHIVO_REFERENCIADO: FileText,
  NOTA: StickyNote,
} as const;

const EMPTY_DRAFT: RespaldoEvaluacionDraft = {
  tipo: "LINK",
  nombre: "",
  descripcion: "",
  url: "",
  nombre_archivo: "",
};

export function EvaluacionRespaldosLista({ respaldos }: { respaldos: EvaluacionEntregableRespaldo[] }) {
  if (respaldos.length === 0) {
    return <p className="text-[12px] text-t500">Sin respaldos registrados.</p>;
  }
  return (
    <ul className="space-y-2">
      {respaldos.map((r) => (
        <li key={r.id} className="rounded-r8 border border-bdr px-3 py-2 text-[12px]">
          <div className="flex items-start gap-2">
            {(() => {
              const Icon = TIPO_ICON[r.tipo];
              return <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />;
            })()}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-t900">{r.nombre}</p>
              <p className="text-[10px] text-t500">{TIPO_RESPALDO_LABEL[r.tipo]}</p>
              {r.descripcion ? <p className="mt-1 text-t700">{r.descripcion}</p> : null}
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all text-[11px] font-medium text-indigo-700 underline"
                >
                  {r.url}
                </a>
              ) : null}
              {r.nombre_archivo ? (
                <p className="mt-1 font-mono text-[11px] text-t600">Archivo: {r.nombre_archivo}</p>
              ) : null}
              {r.storage_path ? (
                <p className="mt-0.5 font-mono text-[10px] text-t400" title="Reservado para Supabase Storage">
                  storage: {r.storage_path}
                </p>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function EvaluacionRespaldosSection({
  respaldos,
  onChange,
  editable = true,
}: {
  respaldos: EvaluacionEntregableRespaldo[];
  onChange?: (next: EvaluacionEntregableRespaldo[]) => void;
  editable?: boolean;
}) {
  const [draft, setDraft] = useState<RespaldoEvaluacionDraft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = useState(false);

  const handleAdd = () => {
    const row = crearRespaldoDesdeDraft(draft);
    if (!row || !onChange) return;
    onChange([...respaldos, row]);
    setDraft(EMPTY_DRAFT);
    setFormOpen(false);
  };

  const handleRemove = (id: string) => {
    onChange?.(respaldos.filter((r) => r.id !== id));
  };

  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-t500">
          Respaldos / Evidencias
        </h4>
        <p className="mt-0.5 text-[10px] text-t500">
          Solo metadata y enlaces (sin archivos en el navegador). Campo storage_path reservado para
          Supabase Storage.
        </p>
      </div>

      <EvaluacionRespaldosLista respaldos={respaldos} />

      {editable && onChange ? (
        <>
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
              <Plus className="h-3.5 w-3.5" /> Agregar respaldo
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
                    onClick={() => handleRemove(r.id)}
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
