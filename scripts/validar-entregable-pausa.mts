/**
 * Smoke / validaciones Etapa A — pausa de entregables (sin Gantt).
 */
import {
  buildPatchCancelarEntregable,
  entregableEstaCancelado,
} from "../src/entregables/entregableCancelacion.ts";
import {
  buildPatchLimpiarPausa,
  buildPatchPausarEntregable,
  buildPatchReactivarPausaEntregable,
  entregableEstaPausado,
} from "../src/entregables/entregablePausa.ts";

type Caso = { nombre: string; ok: boolean; detalle?: string };

function run(): Caso[] {
  const casos: Caso[] = [];

  // Backup viejo: sin campos
  {
    const e = { cancelado: undefined, pausado: undefined } as {
      cancelado?: boolean;
      pausado?: boolean;
    };
    casos.push({
      nombre: "1. Sin campos → no pausado / no cancelado",
      ok: !entregableEstaPausado(e) && !entregableEstaCancelado(e),
    });
  }

  // Pausar sin tentativas
  {
    const p = buildPatchPausarEntregable({
      fechaPausa: "2026-08-11",
      motivo: "Stand by cliente",
    });
    casos.push({
      nombre: "2. Pausar sin tentativas",
      ok:
        !("error" in p) &&
        p.pausado === true &&
        p.fecha_reinicio_tentativa === null &&
        p.fecha_termino_tentativa === null,
      detalle: "error" in p ? p.error : JSON.stringify(p),
    });
  }

  // Pausar con ambas tentativas
  {
    const p = buildPatchPausarEntregable({
      fechaPausa: "2026-08-11",
      motivo: "Espera insumos",
      fechaReinicioTentativa: "2026-09-01",
      fechaTerminoTentativa: "2026-10-15",
    });
    casos.push({
      nombre: "3. Pausar con reinicio+término válidos",
      ok: !("error" in p) && p.fecha_reinicio_tentativa === "2026-09-01",
      detalle: "error" in p ? p.error : undefined,
    });
  }

  // Solo término
  {
    const p = buildPatchPausarEntregable({
      fechaPausa: "2026-08-11",
      motivo: "Espera",
      fechaTerminoTentativa: "2026-10-15",
    });
    casos.push({
      nombre: "4. Bloquea término sin reinicio",
      ok: "error" in p,
      detalle: "error" in p ? p.error : "sin error",
    });
  }

  // Reinicio > término
  {
    const p = buildPatchPausarEntregable({
      fechaPausa: "2026-08-11",
      motivo: "Espera",
      fechaReinicioTentativa: "2026-11-01",
      fechaTerminoTentativa: "2026-10-15",
    });
    casos.push({
      nombre: "5. Bloquea reinicio > término",
      ok: "error" in p,
      detalle: "error" in p ? p.error : "sin error",
    });
  }

  // Cancelado no se considera pausado
  {
    const e = { cancelado: true, pausado: true };
    casos.push({
      nombre: "6. Cancelado gana sobre pausado (helper)",
      ok: entregableEstaCancelado(e) && !entregableEstaPausado(e),
    });
  }

  // Cancelar limpia pausa
  {
    const c = buildPatchCancelarEntregable({
      fechaCancelacion: "2026-08-11",
      motivo: "Proyecto caído",
    });
    casos.push({
      nombre: "7. Cancelar limpia campos de pausa",
      ok:
        !("error" in c) &&
        c.cancelado === true &&
        c.pausado === false &&
        c.fecha_pausa === null &&
        c.fecha_reinicio_tentativa === null,
      detalle: "error" in c ? c.error : JSON.stringify(c),
    });
  }

  // Reactivar pausa solo cambia pausado
  {
    const r = buildPatchReactivarPausaEntregable();
    const keys = Object.keys(r);
    casos.push({
      nombre: "8. Reactivar pausa solo setea pausado=false",
      ok: r.pausado === false && keys.length === 1 && keys[0] === "pausado",
      detalle: JSON.stringify(r),
    });
  }

  // Limpiar pausa
  {
    const l = buildPatchLimpiarPausa();
    casos.push({
      nombre: "9. Limpiar pausa anula metadatos",
      ok: l.pausado === false && l.motivo_pausa === null && l.fecha_termino_tentativa === null,
    });
  }

  return casos;
}

const casos = run();
for (const c of casos) {
  console.log(`${c.ok ? "PASS" : "FAIL"} ${c.nombre}${c.detalle ? ` · ${c.detalle}` : ""}`);
}
const fail = casos.filter((c) => !c.ok).length;
console.log(`\n${casos.length - fail}/${casos.length} ok`);
process.exit(fail > 0 ? 1 : 0);
