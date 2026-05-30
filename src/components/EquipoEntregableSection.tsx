import { useMemo, useState } from "react";
import { UserPlus, UserMinus, Users } from "lucide-react";
import { useAppData, type Entregable } from "@/context/AppDataContext";
import { Button } from "@/components/ui/button";
import {
  listarIntegrantesEquipoConGasto,
  listarProfesionalesGastoSinEquipoDeclarado,
  type IntegranteGastoEquipo,
} from "@/equipo/entregableEquipoGasto";

const fmtH = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function GastoDetalleIntegrante({ item }: { item: IntegranteGastoEquipo }) {
  return (
    <div className="mt-1 space-y-0.5 text-[10px] text-t600">
      {item.sinGastoReal ? (
        <p className="font-mono">Sin gasto real</p>
      ) : (
        <>
          <p className="font-mono">
            Gasto real profesional: {fmtH(item.horasProf)} h
          </p>
          <p className="font-mono">
            Gasto real total entregable (P4+P3+P2): {fmtH(item.horasTotalesEnt)} h
          </p>
          <p className="font-mono">Colaboración en entregable: {item.pctColaboracion}%</p>
        </>
      )}
    </div>
  );
}

function FilaIntegrante({
  item,
  puedeEditar,
  onCambiarRol,
  onQuitar,
}: {
  item: IntegranteGastoEquipo;
  puedeEditar: boolean;
  onCambiarRol: (nuevoRol: "LIDER" | "APOYO") => void;
  onQuitar: () => void;
}) {
  return (
    <li className="rounded-r8 border border-bdr bg-white px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-t800">{item.nombre}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-indigo-800">{item.rolLabel}</p>
          <GastoDetalleIntegrante item={item} />
        </div>
        {puedeEditar ? (
          <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
            {item.rol === "APOYO" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-full min-h-[36px] text-[11px] sm:w-auto"
                onClick={() => onCambiarRol("LIDER")}
              >
                Hacer líder
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-full min-h-[36px] text-[11px] sm:w-auto"
                onClick={() => onCambiarRol("APOYO")}
              >
                Pasar a apoyo
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-full min-h-[36px] text-[11px] text-rose-700 hover:text-rose-800 sm:w-auto"
              onClick={onQuitar}
            >
              <UserMinus className="mr-1 inline h-3.5 w-3.5" />
              Quitar
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

type Props = {
  entregable: Entregable;
  puedeEditar: boolean;
};

export default function EquipoEntregableSection({ entregable, puedeEditar }: Props) {
  const {
    profesionales,
    equipo_entregable,
    registro_horas,
    entregables,
    proyectos,
    agregarIntegranteEquipoEntregable,
    cambiarRolIntegranteEquipoEntregable,
    quitarIntegranteEquipoEntregable,
  } = useAppData();

  const [profSeleccionado, setProfSeleccionado] = useState("");
  const [rolNuevo, setRolNuevo] = useState<"LIDER" | "APOYO">("APOYO");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { lider, apoyos } = useMemo(
    () =>
      listarIntegrantesEquipoConGasto(
        entregable.id,
        equipo_entregable,
        profesionales,
        registro_horas,
        entregables,
        proyectos,
      ),
    [entregable.id, equipo_entregable, profesionales, registro_horas, entregables, proyectos],
  );

  const gastoSinEquipo = useMemo(
    () =>
      listarProfesionalesGastoSinEquipoDeclarado(
        entregable.id,
        equipo_entregable,
        profesionales,
        registro_horas,
        entregables,
        proyectos,
      ),
    [entregable.id, equipo_entregable, profesionales, registro_horas, entregables, proyectos],
  );

  const profesionalesDisponibles = useMemo(() => {
    const enEquipo = new Set(
      equipo_entregable
        .filter((e) => (e.entregable_id ?? "").trim() === entregable.id)
        .map((e) => e.profesional_id),
    );
    return profesionales
      .filter((p) => p.activo !== false && !enEquipo.has(p.id))
      .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, "es"));
  }, [profesionales, equipo_entregable, entregable.id]);

  const sinEquipo = !lider && apoyos.length === 0;

  const mostrarAvisoLider = (pasadoApoyo: boolean) => {
    if (pasadoApoyo) {
      setMensaje("El líder anterior pasó a apoyo automáticamente (solo puede haber un líder por entregable).");
    }
  };

  const handleAgregar = () => {
    setError(null);
    setMensaje(null);
    const res = agregarIntegranteEquipoEntregable({
      entregable_id: entregable.id,
      profesional_id: profSeleccionado,
      rol_en_entregable: rolNuevo,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    mostrarAvisoLider(res.liderAnteriorPasadoApoyo);
    setProfSeleccionado("");
    setRolNuevo("APOYO");
  };

  const handleCambiarRol = (equipoId: string, nuevoRol: "LIDER" | "APOYO") => {
    setError(null);
    setMensaje(null);
    const res = cambiarRolIntegranteEquipoEntregable(equipoId, nuevoRol);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    mostrarAvisoLider(res.liderAnteriorPasadoApoyo);
  };

  const handleAgregarComoApoyo = (profesionalId: string) => {
    setError(null);
    setMensaje(null);
    const res = agregarIntegranteEquipoEntregable({
      entregable_id: entregable.id,
      profesional_id: profesionalId,
      rol_en_entregable: "APOYO",
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMensaje("Profesional agregado como apoyo.");
  };

  return (
    <div className="mt-4 rounded-r10 border border-bdr bg-white/80 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-t400">
        <Users size={14} /> Equipo del entregable
      </p>

      {mensaje ? (
        <p className="mt-2 rounded-r6 border border-emerald-300/50 bg-emerald-50/80 px-2 py-1.5 text-[11px] text-emerald-900">
          {mensaje}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-r6 border border-rose-300/50 bg-rose-50/80 px-2 py-1.5 text-[11px] text-rose-900">
          {error}
        </p>
      ) : null}

      {sinEquipo ? (
        <p className="mt-2 text-[11px] italic text-t500">No hay equipo declarado para este entregable.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {lider ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800">Líder</p>
              <ul className="mt-1.5">
                <FilaIntegrante
                  item={lider}
                  puedeEditar={puedeEditar}
                  onCambiarRol={(r) => handleCambiarRol(lider.equipoId, r)}
                  onQuitar={() => quitarIntegranteEquipoEntregable(lider.equipoId)}
                />
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-t500">Sin líder declarado en el equipo.</p>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-t500">
              Apoyos ({apoyos.length})
            </p>
            {apoyos.length === 0 ? (
              <p className="mt-1 text-[11px] italic text-t500">Sin apoyos declarados.</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-2">
                {apoyos.map((a) => (
                  <FilaIntegrante
                    key={a.equipoId}
                    item={a}
                    puedeEditar={puedeEditar}
                    onCambiarRol={(r) => handleCambiarRol(a.equipoId, r)}
                    onQuitar={() => quitarIntegranteEquipoEntregable(a.equipoId)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {puedeEditar ? (
        <div className="mt-4 rounded-r8 border border-dashed border-bdr bg-[#F7F8FA] p-3">
          <p className="text-[10px] font-semibold uppercase text-t500">Agregar integrante</p>
          <div className="mt-2 flex flex-col gap-2">
            <label className="text-[10px] text-t500">
              Profesional
              <select
                className="mt-1 flex h-10 w-full min-h-[40px] rounded-r6 border border-bdr bg-white px-2 text-[12px] text-t800"
                value={profSeleccionado}
                onChange={(e) => setProfSeleccionado(e.target.value)}
              >
                <option value="">Seleccione…</option>
                {profesionalesDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre_completo} ({p.cargo})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-t500">
              Rol
              <select
                className="mt-1 flex h-10 w-full min-h-[40px] rounded-r6 border border-bdr bg-white px-2 text-[12px] text-t800"
                value={rolNuevo}
                onChange={(e) => setRolNuevo(e.target.value as "LIDER" | "APOYO")}
              >
                <option value="APOYO">Apoyo</option>
                <option value="LIDER">Líder</option>
              </select>
            </label>
            <Button
              type="button"
              className="h-10 w-full min-h-[40px] bg-[#4F46E5] text-white hover:bg-[#3730A3]"
              disabled={!profSeleccionado}
              onClick={handleAgregar}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Agregar al equipo
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[10px] text-t500">Solo ADMIN puede modificar el equipo.</p>
      )}

      {gastoSinEquipo.length > 0 ? (
        <div className="mt-4 rounded-r8 border border-indigo-200 bg-indigo-50/60 p-3">
          <p className="text-[10px] font-semibold uppercase text-indigo-900">
            Profesionales con gasto real no declarados en equipo
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {gastoSinEquipo.map((g) => (
              <li
                key={g.profesional_id}
                className="flex flex-col gap-2 rounded-r6 border border-indigo-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-[11px] text-indigo-950">
                  <p className="font-medium">{g.nombre}</p>
                  <p className="font-mono text-indigo-800">
                    {fmtH(g.horas_reales)} h · {g.pct_colaboracion}% del gasto del entregable
                  </p>
                </div>
                {puedeEditar ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-full min-h-[36px] shrink-0 border-indigo-300 text-[11px] text-indigo-900 sm:w-auto"
                    onClick={() => handleAgregarComoApoyo(g.profesional_id)}
                  >
                    Agregar como apoyo
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
