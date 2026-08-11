/**
 * Validaciones de clasificación Dashboard (Activos / Próximos a iniciar).
 * Ejecutable con: npx tsx src/entregables/entregableDashboardFiltrosValidaciones.ts
 *
 * No modifica AppData ni estado persistido.
 */

import type { Entregable } from "@/context/AppDataContext";
import { localDateFromDate } from "@/lib/localDate";
import {
  compararEntregablesPorFechaInicioAsc,
  entregableEsActivoDashboard,
  entregableEsProximoInicioDashboard,
  entregableMuestraSenalSinAvanceDashboard,
} from "@/entregables/entregableDashboardFiltros";

type Caso = { nombre: string; ok: boolean; detalle?: string };

function addDaysLocal(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return localDateFromDate(d);
}

function stubEntregable(partial: Partial<Entregable> & Pick<Entregable, "estado" | "fecha_inicio">): Entregable {
  return {
    id: partial.id ?? "e-test",
    proyecto_id: "pr1",
    nombre: partial.nombre ?? "Entregable test",
    lider_id: "p1",
    estado: partial.estado,
    avance_real: partial.avance_real ?? 0,
    avance_teorico: partial.avance_teorico ?? 0,
    fecha_inicio: partial.fecha_inicio,
    fecha_termino: partial.fecha_termino ?? "2030-12-31",
    fecha_revA: null,
    fecha_revB: null,
    fecha_revP: null,
    uf_presupuestadas: 0,
    uf_consumidas: 0,
    hrs_presupuestadas: 0,
    hrs_l2: 0,
    hrs_p4: 0,
    hrs_p3: 0,
    hrs_p2: 0,
    presupuesto_categoria_definido: false,
    hrs_gastadas: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cancelado: partial.cancelado,
    pausado: partial.pausado,
  } as Entregable;
}

function run(): Caso[] {
  const hoy = new Date();
  const casos: Caso[] = [];

  const push = (nombre: string, ok: boolean, detalle?: string) => {
    casos.push({ nombre, ok, detalle });
  };

  // Caso 1: +14 · NO_INICIADO → Próximo
  {
    const e = stubEntregable({ estado: "NO_INICIADO", fecha_inicio: addDaysLocal(hoy, 14) });
    const prox = entregableEsProximoInicioDashboard(e);
    const act = entregableEsActivoDashboard(e);
    push("1 +14d NO_INICIADO → Próximo", prox && !act, `prox=${prox} act=${act}`);
  }

  // Caso 2: mañana · NO_INICIADO → Próximo
  {
    const e = stubEntregable({ estado: "NO_INICIADO", fecha_inicio: addDaysLocal(hoy, 1) });
    const prox = entregableEsProximoInicioDashboard(e);
    const act = entregableEsActivoDashboard(e);
    push("2 mañana NO_INICIADO → Próximo", prox && !act, `prox=${prox} act=${act}`);
  }

  // Caso 3: hoy · NO_INICIADO · 0% · 0h → ACTIVO
  {
    const e = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, 0),
      avance_real: 0,
    });
    const prox = entregableEsProximoInicioDashboard(e);
    const act = entregableEsActivoDashboard(e);
    push("3 hoy NO_INICIADO 0% → ACTIVO", act && !prox, `prox=${prox} act=${act}`);
  }

  // Caso 4: ayer · NO_INICIADO · 0% → ACTIVO
  {
    const e = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, -1),
      avance_real: 0,
    });
    const prox = entregableEsProximoInicioDashboard(e);
    const act = entregableEsActivoDashboard(e);
    const senal = entregableMuestraSenalSinAvanceDashboard(e);
    push(
      "4 ayer NO_INICIADO 0% → ACTIVO + señal",
      act && !prox && senal,
      `prox=${prox} act=${act} senal=${senal}`,
    );
  }

  // Caso 5: -30d · NO_INICIADO · 0% → ACTIVO
  {
    const e = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, -30),
      avance_real: 0,
    });
    const act = entregableEsActivoDashboard(e);
    const prox = entregableEsProximoInicioDashboard(e);
    push("5 -30d NO_INICIADO → ACTIVO", act && !prox, `prox=${prox} act=${act}`);
  }

  // Caso 6: ayer · avance >0 · EN_PLAZO → Activo
  {
    const e = stubEntregable({
      estado: "EN_PLAZO",
      fecha_inicio: addDaysLocal(hoy, -1),
      avance_real: 0.2,
    });
    const act = entregableEsActivoDashboard(e);
    const prox = entregableEsProximoInicioDashboard(e);
    const senal = entregableMuestraSenalSinAvanceDashboard(e);
    push("6 ayer avance>0 → ACTIVO sin señal", act && !prox && !senal, `act=${act} senal=${senal}`);
  }

  // Caso 7: ayer · DIRECTA implícita (hrs) · avance=0 · NO_INICIADO → Activo por fecha
  {
    const e = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, -1),
      avance_real: 0,
      hrs_gastadas: 5,
    });
    const act = entregableEsActivoDashboard(e);
    push("7 ayer hrs>0 avance=0 → ACTIVO por fecha", act, `act=${act}`);
  }

  // Caso 8: futuro · cancelado → no Próximo
  {
    const e = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, 7),
      cancelado: true,
    });
    const prox = entregableEsProximoInicioDashboard(e);
    const act = entregableEsActivoDashboard(e);
    push("8 futuro cancelado → fuera", !prox && !act, `prox=${prox} act=${act}`);
  }

  // Caso 9: pasado · cancelado → no Activo por nueva regla
  {
    const e = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, -5),
      cancelado: true,
    });
    const act = entregableEsActivoDashboard(e);
    const prox = entregableEsProximoInicioDashboard(e);
    push("9 pasado cancelado → fuera", !act && !prox, `prox=${prox} act=${act}`);
  }

  // Caso 10: pasado · pausado · NO_INICIADO → no Activo por fecha (preservar pausa)
  {
    const e = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, -5),
      pausado: true,
    });
    const act = entregableEsActivoDashboard(e);
    const prox = entregableEsProximoInicioDashboard(e);
    push("10 pasado pausado NO_INICIADO → no Activo/Próximo", !act && !prox, `prox=${prox} act=${act}`);
  }

  // Caso 10b: pasado · pausado · EN_PLAZO → sigue Activo (otras reglas) con badge en UI
  {
    const e = stubEntregable({
      estado: "EN_PLAZO",
      fecha_inicio: addDaysLocal(hoy, -5),
      pausado: true,
      avance_real: 0.3,
    });
    const act = entregableEsActivoDashboard(e);
    push("10b pasado pausado EN_PLAZO → Activo (preservar)", act, `act=${act}`);
  }

  // Caso 11: ayer NO_INICIADO → reprogramar a mañana
  {
    const antes = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, -1),
    });
    const despues = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, 1),
    });
    const ok =
      entregableEsActivoDashboard(antes) &&
      !entregableEsProximoInicioDashboard(antes) &&
      !entregableEsActivoDashboard(despues) &&
      entregableEsProximoInicioDashboard(despues);
    push("11 reprogramar ayer→mañana mueve bloques", ok);
  }

  // Caso 12: hoy · EN_PLAZO → solo Activo (sin duplicar en Próximos)
  {
    const e = stubEntregable({
      estado: "EN_PLAZO",
      fecha_inicio: addDaysLocal(hoy, 0),
      avance_real: 0.1,
    });
    const act = entregableEsActivoDashboard(e);
    const prox = entregableEsProximoInicioDashboard(e);
    push("12 hoy ya activo → solo Activo", act && !prox, `prox=${prox} act=${act}`);
  }

  // Sin zona muerta: ayer NO_INICIADO aparece en exactamente un bloque operativo
  {
    const e = stubEntregable({
      estado: "NO_INICIADO",
      fecha_inicio: addDaysLocal(hoy, -1),
    });
    const n = Number(entregableEsActivoDashboard(e)) + Number(entregableEsProximoInicioDashboard(e));
    push("sin zona muerta ni duplicado (ayer NO_INICIADO)", n === 1, `bloques=${n}`);
  }

  // Orden por fecha_inicio asc
  {
    const a = stubEntregable({ id: "a", estado: "NO_INICIADO", fecha_inicio: addDaysLocal(hoy, 10) });
    const b = stubEntregable({ id: "b", estado: "NO_INICIADO", fecha_inicio: addDaysLocal(hoy, 3) });
    const c = stubEntregable({ id: "c", estado: "NO_INICIADO", fecha_inicio: addDaysLocal(hoy, 20) });
    const sorted = [a, c, b].sort(compararEntregablesPorFechaInicioAsc).map((x) => x.id);
    push("orden fecha_inicio asc", sorted.join(",") === "b,a,c", sorted.join(","));
  }

  // Fecha inválida NO_INICIADO: no reclasificar a Activos
  {
    const e = stubEntregable({ estado: "NO_INICIADO", fecha_inicio: "" });
    push("fecha inválida NO_INICIADO → fuera Activos/Próximos", !entregableEsActivoDashboard(e) && !entregableEsProximoInicioDashboard(e));
  }

  return casos;
}

const resultados = run();
let failed = 0;
for (const c of resultados) {
  const mark = c.ok ? "OK" : "FAIL";
  if (!c.ok) failed += 1;
  console.log(`[${mark}] ${c.nombre}${c.detalle ? ` · ${c.detalle}` : ""}`);
}
console.log(`\n${resultados.length - failed}/${resultados.length} ok`);
if (failed > 0) {
  throw new Error(`${failed} caso(s) de clasificación Dashboard fallaron`);
}
