/**
 * Validaciones — segmentos Gantt + horas reales (corrección pausa).
 */
import { resolverSegmentosGanttEntregable } from "../src/gantt/ganttEntregableSegmentos.ts";
import { buildHorasRealesPorEntregable } from "../src/entregables/horasRealesEntregable.ts";
import { buildPatchPausarEntregable } from "../src/entregables/entregablePausa.ts";
import type { Entregable, Profesional, Proyecto, RegistroHora } from "../src/context/AppDataContext.ts";

type Caso = { nombre: string; ok: boolean; detalle?: string };

function run(): Caso[] {
  const casos: Caso[] = [];

  // Edit patch keeps pausado true
  {
    const p = buildPatchPausarEntregable({
      fechaPausa: "2026-08-11",
      motivo: "Actualización stand by",
      fechaReinicioTentativa: "2026-10-01",
      fechaTerminoTentativa: "2026-11-30",
    });
    casos.push({
      nombre: "A1. Patch editar/pausar mantiene pausado=true",
      ok: !("error" in p) && p.pausado === true && p.fecha_reinicio_tentativa === "2026-10-01",
      detalle: "error" in p ? p.error : undefined,
    });
  }

  // Normal unchanged
  {
    const r = resolverSegmentosGanttEntregable({
      fecha_inicio: "2026-08-01",
      fecha_termino: "2026-10-31",
      pausado: false,
      cancelado: false,
      fecha_pausa: null,
      fecha_reinicio_tentativa: "2026-11-01",
      fecha_termino_tentativa: "2026-12-01",
    });
    casos.push({
      nombre: "1. Normal: un segmento CONFIRMADO",
      ok: r.segmentos.length === 1 && r.segmentos[0]!.tipo === "CONFIRMADO",
    });
  }

  // Pausado sin horas → planificado previo
  {
    const r = resolverSegmentosGanttEntregable({
      fecha_inicio: "2026-08-01",
      fecha_termino: "2026-12-31",
      pausado: true,
      cancelado: false,
      fecha_pausa: "2026-08-10",
      fecha_reinicio_tentativa: null,
      fecha_termino_tentativa: null,
    });
    casos.push({
      nombre: "2. Pausado sin DIRECTA: PLANIFICADO_PREVIO hasta pausa",
      ok:
        r.segmentos.length === 1 &&
        r.segmentos[0]!.tipo === "PLANIFICADO_PREVIO" &&
        r.segmentos[0]!.hasta === "2026-08-10" &&
        !r.tieneTramoReal,
      detalle: JSON.stringify(r.segmentos),
    });
  }

  // Pausado con horas reales
  {
    const hr = {
      horas_reales_total: 40,
      horas_reales_hasta_pausa: 40,
      primera_fecha_hora_real: "2026-07-05",
      ultima_fecha_hora_real: "2026-08-08",
      horas_reales_por_mes: { "2026-07": 20, "2026-08": 20 },
      horas_reales_por_mes_todas: { "2026-07": 20, "2026-08": 20 },
      horas_posteriores_a_pausa: 0,
      primera_fecha_posterior_pausa: null,
      ultima_fecha_posterior_pausa: null,
    };
    const r = resolverSegmentosGanttEntregable(
      {
        fecha_inicio: "2026-06-01",
        fecha_termino: "2026-12-31",
        pausado: true,
        cancelado: false,
        fecha_pausa: "2026-08-10",
        fecha_reinicio_tentativa: "2026-10-01",
        fecha_termino_tentativa: "2026-11-30",
      },
      { horasReales: hr },
    );
    casos.push({
      nombre: "4–7. Con DIRECTA: REAL + TENTATIVO; hueco vacío",
      ok:
        r.segmentos.length === 2 &&
        r.segmentos[0]!.tipo === "REAL" &&
        r.segmentos[0]!.desde === "2026-07-05" &&
        r.segmentos[0]!.hasta === "2026-08-08" &&
        r.segmentos[0]!.horas_reales === 40 &&
        r.segmentos[1]!.tipo === "TENTATIVO" &&
        r.segmentos[0]!.hasta < r.segmentos[1]!.desde &&
        r.tieneTramoReal,
      detalle: JSON.stringify(r.segmentos),
    });
  }

  // Horas posteriores a pausa
  {
    const ent = {
      id: "e1",
      proyecto_id: "pr1",
      pausado: true,
      cancelado: false,
      fecha_pausa: "2026-08-10",
    } as Entregable;
    const proyectos = [
      { id: "pr1", tarifa_l2: 1, tarifa_p4: 1, tarifa_p3: 1, tarifa_p2: 1 },
    ] as Proyecto[];
    const profesionales = [{ id: "p1", cargo: "P4" }] as Profesional[];
    const registros = [
      {
        id: "r1",
        profesional_id: "p1",
        proyecto_id: "pr1",
        entregable_id: "e1",
        tipo_hora: "DIRECTA",
        fecha: "2026-08-01",
        horas: 10,
      },
      {
        id: "r2",
        profesional_id: "p1",
        proyecto_id: "pr1",
        entregable_id: "e1",
        tipo_hora: "DIRECTA",
        fecha: "2026-08-20",
        horas: 5,
      },
    ] as RegistroHora[];
    const map = buildHorasRealesPorEntregable(registros, [ent], proyectos, profesionales);
    const hr = map.get("e1")!;
    casos.push({
      nombre: "15. DIRECTA posterior a pausa: separada + total incluye ambas",
      ok:
        hr.horas_reales_hasta_pausa === 10 &&
        hr.horas_posteriores_a_pausa === 5 &&
        hr.horas_reales_total === 15 &&
        hr.ultima_fecha_hora_real === "2026-08-01",
      detalle: JSON.stringify(hr),
    });
  }

  // Cancelado
  {
    const r = resolverSegmentosGanttEntregable({
      fecha_inicio: "2026-08-01",
      fecha_termino: "2026-09-30",
      pausado: true,
      cancelado: true,
      fecha_pausa: "2026-08-10",
      fecha_reinicio_tentativa: "2026-10-01",
      fecha_termino_tentativa: "2026-11-30",
    });
    casos.push({
      nombre: "12. Cancelado ignora pausa/real",
      ok: !r.pausado && r.segmentos[0]?.tipo === "CONFIRMADO" && r.segmentos[0]?.hasta === "2026-09-30",
    });
  }

  // Reactivado
  {
    const r = resolverSegmentosGanttEntregable({
      fecha_inicio: "2026-08-01",
      fecha_termino: "2026-12-31",
      pausado: false,
      cancelado: false,
      fecha_pausa: "2026-08-10",
      fecha_reinicio_tentativa: "2026-10-01",
      fecha_termino_tentativa: "2026-11-30",
    });
    casos.push({
      nombre: "14. Reactivado: barra normal",
      ok: !r.pausado && r.segmentos.length === 1 && r.segmentos[0]!.hasta === "2026-12-31",
    });
  }

  return casos;
}

const casos = run();
for (const c of casos) {
  console.log(`${c.ok ? "PASS" : "FAIL"} ${c.nombre}${c.detalle ? ` · ${c.detalle}` : ""}`);
}
const fail = casos.filter((c) => !c.ok);
if (fail.length) {
  throw new Error(`${fail.length} validación(es) fallaron`);
}
console.log(`\n${casos.length}/${casos.length} ok`);
