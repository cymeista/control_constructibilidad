import type { ReporteEjecutivoSnapshot } from "@/reporte/reporteEjecutivoReadModel";
import { fmtFechaReporte } from "@/reporte/reporteEjecutivoReadModel";
import "@/reporte/reporteEjecutivoPrint.css";

const fmtH = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPct = (n: number | null) =>
  n == null ? "—" : `${Math.round(n * 100)}%`;

function badgeEstadoCartera(e: "normal" | "atencion" | "critico") {
  const labels = { normal: "Normal", atencion: "Atención", critico: "Crítico" };
  return <span className={`reporte-ejecutivo-badge ${e}`}>{labels[e]}</span>;
}

function badgeCap(e: "baja" | "normal" | "alta_directa") {
  const m = { baja: "Baja", normal: "Normal", alta_directa: "Alta directa" };
  const cls = e === "baja" ? "baja" : e === "alta_directa" ? "alta" : "normal";
  return <span className={`reporte-ejecutivo-badge ${cls}`}>{m[e]}</span>;
}

export default function ReporteEjecutivoPrint({
  snap,
  hitosLista = snap.proximosHitos,
}: {
  snap: ReporteEjecutivoSnapshot;
  /** En vista previa se puede pasar la lista completa; el PDF usa máx. 8 filas. */
  hitosLista?: ReporteEjecutivoSnapshot["proximosHitos"];
}) {
  const { kpis, kpiSubtitulos, capacidad } = snap;

  return (
    <div className="reporte-print reporte-ejecutivo-sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Reporte Ejecutivo de Control de Proyectos</h1>
          <p className="re-sub">Constructibilidad · Control de Proyectos</p>
        </div>
        <div className="re-meta">
          <div>
            <strong>Fecha de emisión:</strong> {fmtFechaReporte(snap.fechaEmision)}
          </div>
          <div>
            <strong>Periodo:</strong> {snap.periodoLabel} ({fmtFechaReporte(snap.periodoInicio)} –{" "}
            {fmtFechaReporte(snap.periodoFinTeorico)})
          </div>
          <div>
            <strong>Corte RegistroHora:</strong> {fmtFechaReporte(snap.fechaCorteRegistroHora)}
          </div>
          <div>
            <strong>Responsable:</strong> {snap.responsable}
          </div>
        </div>
      </div>

      <div className="reporte-ejecutivo-grid-6">
        <div className="reporte-ejecutivo-kpi">
          <div className="re-kpi-label">Entregables activos</div>
          <div className="re-kpi-val">{kpis.entregablesActivos}</div>
          <div className="re-kpi-sub">{kpiSubtitulos.entregablesActivos}</div>
        </div>
        <div className="reporte-ejecutivo-kpi">
          <div className="re-kpi-label">Críticos / retrasados</div>
          <div className="re-kpi-val">{kpis.entregablesCriticosRetrasados}</div>
          <div className="re-kpi-sub">{kpiSubtitulos.entregablesCriticosRetrasados}</div>
        </div>
        <div className="reporte-ejecutivo-kpi">
          <div className="re-kpi-label">Horas directas</div>
          <div className="re-kpi-val">{fmtH(kpis.horasDirectasReales)} h</div>
          <div className="re-kpi-sub">{kpiSubtitulos.horasDirectasReales}</div>
        </div>
        <div className="reporte-ejecutivo-kpi">
          <div className="re-kpi-label">Horas indirectas</div>
          <div className="re-kpi-val">{fmtH(kpis.horasIndirectas)} h</div>
          <div className="re-kpi-sub">{kpiSubtitulos.horasIndirectas}</div>
        </div>
        <div className="reporte-ejecutivo-kpi">
          <div className="re-kpi-label">Cargabilidad real</div>
          <div className="re-kpi-val">{fmtPct(kpis.cargabilidadRealEquipo)}</div>
          <div className="re-kpi-sub">{kpiSubtitulos.cargabilidadRealEquipo}</div>
        </div>
        <div className="reporte-ejecutivo-kpi">
          <div className="re-kpi-label">Alertas abiertas</div>
          <div className="re-kpi-val">{kpis.alertasAbiertas}</div>
          <div className="re-kpi-sub">{kpiSubtitulos.alertasAbiertas}</div>
        </div>
      </div>

      <div className="reporte-ejecutivo-resumen">
        <strong>Resumen ejecutivo — </strong>
        {snap.resumenEjecutivo}
      </div>

      <div className="reporte-ejecutivo-cols">
        <div className="reporte-ejecutivo-block">
          <h2>Estado de cartera</h2>
          <div className="re-body">
            <table className="reporte-ejecutivo-table">
              <thead>
                <tr>
                  <th>Cliente / Proyecto</th>
                  <th>Act.</th>
                  <th>Crit.</th>
                  <th>Hitos</th>
                  <th>Directas</th>
                  <th>Alert.</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {snap.cartera.length === 0 ? (
                  <tr>
                    <td colSpan={7}>Sin datos en el alcance seleccionado.</td>
                  </tr>
                ) : (
                  snap.cartera.map((r, i) => (
                    <tr key={i}>
                      <td>{r.clienteProyecto}</td>
                      <td>{r.entregablesActivos}</td>
                      <td>{r.criticosRetrasados}</td>
                      <td>{r.proximosHitos}</td>
                      <td>{fmtH(r.horasDirectas)}</td>
                      <td>{r.alertasAbiertas}</td>
                      <td>{badgeEstadoCartera(r.estado)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="reporte-ejecutivo-block">
          <h2>Top alertas ejecutivas</h2>
          <div className="re-body">
            <table className="reporte-ejecutivo-table">
              <thead>
                <tr>
                  <th>Prio.</th>
                  <th>Proyecto / Entregable</th>
                  <th>Situación</th>
                  <th>Acción sugerida</th>
                </tr>
              </thead>
              <tbody>
                {snap.topAlertas.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Sin alertas prioritarias en el alcance.</td>
                  </tr>
                ) : (
                  snap.topAlertas.map((a, i) => (
                    <tr key={i}>
                      <td>{a.prioridad}</td>
                      <td>{a.proyectoEntregable}</td>
                      <td>{a.situacion}</td>
                      <td>{a.accion}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="reporte-ejecutivo-cols-3">
        <div className="reporte-ejecutivo-block">
          <h2>Capacidad del equipo</h2>
          <div className="re-body">
            <div className="reporte-ejecutivo-mini-kpis">
              <div className="reporte-ejecutivo-mini-kpi">
                Prof. cargables
                <strong>{capacidad.profesionalesCargables}</strong>
              </div>
              <div className="reporte-ejecutivo-mini-kpi">
                Directas
                <strong>{fmtH(capacidad.horasDirectas)} h</strong>
              </div>
              <div className="reporte-ejecutivo-mini-kpi">
                Indirectas
                <strong>{fmtH(capacidad.horasIndirectas)} h</strong>
              </div>
              <div className="reporte-ejecutivo-mini-kpi">
                Cargabilidad
                <strong>{fmtPct(capacidad.cargabilidadReal)}</strong>
              </div>
              <div className="reporte-ejecutivo-mini-kpi">
                Baja carga
                <strong>{capacidad.profesionalesBajaCargabilidad}</strong>
              </div>
              <div className="reporte-ejecutivo-mini-kpi">
                Con déficit
                <strong>{capacidad.profesionalesConDeficit}</strong>
              </div>
            </div>
            <table className="reporte-ejecutivo-table">
              <thead>
                <tr>
                  <th>Profesional</th>
                  <th>Dir.</th>
                  <th>Ind.</th>
                  <th>Carg.</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {capacidad.filas.map((f, i) => (
                  <tr key={i}>
                    <td>{f.nombre}</td>
                    <td>{fmtH(f.directas)}</td>
                    <td>{fmtH(f.indirectas)}</td>
                    <td>{fmtPct(f.cargabilidad)}</td>
                    <td>{badgeCap(f.estado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="reporte-ejecutivo-block" style={{ gridColumn: "span 2" }}>
          <h2>{snap.tituloProximosHitos}</h2>
          <div className="re-body">
            <table className="reporte-ejecutivo-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proyecto</th>
                  <th>Entregable</th>
                  <th>Hito</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {hitosLista.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Sin hitos relevantes en el horizonte seleccionado.</td>
                  </tr>
                ) : (
                  hitosLista.map((h, i) => (
                    <tr key={i}>
                      <td>{fmtFechaReporte(h.fecha)}</td>
                      <td>{h.proyecto}</td>
                      <td>{h.entregable}</td>
                      <td>{h.hito}</td>
                      <td>{h.estado}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {snap.proximosHitosAdicionales > 0 && hitosLista === snap.proximosHitos ? (
              <p className="mt-1 text-[7px] text-slate-500">
                + {snap.proximosHitosAdicionales} hito{snap.proximosHitosAdicionales === 1 ? "" : "s"} relevante
                {snap.proximosHitosAdicionales === 1 ? "" : "s"} adicional
                {snap.proximosHitosAdicionales === 1 ? "" : "es"}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="reporte-ejecutivo-footer">
        <span>
          Fuente: RegistroHora, Entregables, Proyectos y Asignaciones vigentes en sistema. La carga real se
          respalda en RegistroHora; la capacidad objetivo es referencia operativa.
        </span>
        <span>Reporte generado automáticamente por Constructibilidad · Control de Proyectos</span>
      </div>
    </div>
  );
}
