import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { EvaluacionEntregable } from "@/context/AppDataContext";
import { useAppData } from "@/context/AppDataContext";
import EvaluacionRespaldosSection, {
  EvaluacionRespaldosLista,
} from "@/components/evaluacion/EvaluacionRespaldosSection";
import {
  RESPUESTA_EVALUACION_LABEL,
  TIPO_EVALUACION_LABEL,
} from "@/evaluacion/evaluacionEntregablesLogic";
import { useAuth } from "@/security/AuthContext";
import { canUploadEvaluacionRespaldoStorage } from "@/supabase/supabaseEvaluacionStorage";
import { isSupabaseConfigured } from "@/supabase/supabaseClient";

export type EvaluacionEntregableDetalleView = {
  evaluacion: EvaluacionEntregable;
  profesionalNombre: string;
  clienteNombre: string;
  proyectoLabel: string;
  entregableNombre: string;
  rolLabel: string;
  evaluador?: string | null;
};

export default function EvaluacionEntregableDetalleModal({
  open,
  onOpenChange,
  detalle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detalle: EvaluacionEntregableDetalleView | null;
}) {
  const { updateEvaluacionEntregable } = useAppData();
  const { role, authSource } = useAuth();
  const canUploadStorage = canUploadEvaluacionRespaldoStorage(authSource, role);
  const canOpenStorageFiles = isSupabaseConfigured() && authSource === "supabase";

  if (!detalle) return null;
  const { evaluacion: ev } = detalle;
  const respaldos = ev.respaldos ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle de evaluación</DialogTitle>
          <DialogDescription>
            {detalle.profesionalNombre} · {detalle.entregableNombre}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[12px]">
          <dt className="text-t500">Fecha</dt>
          <dd className="text-t800">{ev.fecha_evaluacion}</dd>
          <dt className="text-t500">Cliente</dt>
          <dd className="text-t800">{detalle.clienteNombre}</dd>
          <dt className="text-t500">Proyecto</dt>
          <dd className="text-t800">{detalle.proyectoLabel}</dd>
          <dt className="text-t500">Entregable</dt>
          <dd className="text-t800">{detalle.entregableNombre}</dd>
          <dt className="text-t500">Rol</dt>
          <dd className="text-t800">{detalle.rolLabel}</dd>
          <dt className="text-t500">Tipo</dt>
          <dd className="text-t800">{TIPO_EVALUACION_LABEL[ev.tipo_evaluacion]}</dd>
          <dt className="text-t500">Puntaje</dt>
          <dd className="font-mono text-t800">
            {ev.puntaje_obtenido.toLocaleString("es-CL", { maximumFractionDigits: 1 })} / {ev.puntaje_maximo}{" "}
            puntos
          </dd>
          <dt className="text-t500">Nota final</dt>
          <dd className="font-semibold text-t900">{ev.nota_final.toFixed(1)}</dd>
          {detalle.evaluador ? (
            <>
              <dt className="text-t500">Evaluador</dt>
              <dd className="text-t800">{detalle.evaluador}</dd>
            </>
          ) : null}
        </dl>

        {ev.comentario ? (
          <div className="rounded-r8 border border-bdr bg-surface2/60 px-3 py-2 text-[12px] text-t800">
            <p className="mb-1 text-[10px] font-semibold uppercase text-t500">Comentario</p>
            <p className="whitespace-pre-wrap">{ev.comentario}</p>
          </div>
        ) : null}

        {canUploadStorage ? (
          <EvaluacionRespaldosSection
            respaldos={respaldos}
            evaluacionId={ev.id}
            canUploadStorage
            editable
            onChange={(next) => updateEvaluacionEntregable(ev.id, { respaldos: next })}
          />
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-t500">
              Respaldos / Evidencias
            </p>
            <EvaluacionRespaldosLista respaldos={respaldos} canOpenStorage={canOpenStorageFiles} />
          </div>
        )}

        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-t500">Respuestas</p>
          {ev.respuestas.map((r, i) => (
            <div key={`${r.pregunta_id}-${i}`} className="rounded-r8 border border-bdr px-3 py-2">
              {r.categoria ? (
                <p className="text-[10px] font-medium text-indigo-700">{r.categoria}</p>
              ) : null}
              <p className="mt-0.5 text-[12px] text-t900">{r.texto}</p>
              <p className="mt-1 text-[11px] text-t600">
                {RESPUESTA_EVALUACION_LABEL[r.respuesta]} · {r.puntaje} pt
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
