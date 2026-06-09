import type { ReporteEjecutivoSnapshot } from "@/reporte/reporteEjecutivoReadModel";
import { fmtFechaReporte } from "@/reporte/reporteEjecutivoReadModel";
import "@/reporte/reporteEjecutivoPrint.css";

const fmtH = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtUF = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
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
  const { kpis, kpiSubtitulos, capacidad, pipeline } = snap;

  return (
    <div className="reporte-print reporte-ejecutivo-sheet reporte-semanal-sheet">
      <header className="reporte-semanal-header">
        <div>
          <h1>Reporte semanal</h1>
          <p className="re-sub">1 hoja carta horizontal · Constructibilidad · Control de Proyectos</p>
        </div>
        <div className="re-meta">
          <div>
            <strong>Emisión:</strong> {fmtFechaReporte(snap.fechaEmision)}
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
      </header>

      <div className="reporte-semanal-body">
        {/* Zona izquierda — Pulso del equipo */}
        <section className="reporte-semanal-zone reporte-semanal-zone-left">
          <h2 className="reporte-semanal-zone-title">Pulso del equipo</h2>

          <div className="reporte-semanal-kpi-grid">
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

          <div className="reporte-ejecutivo-resumen reporte-semanal-resumen">
            <strong>Resumen — </strong>
            {snap.resumenEjecutivo}
          </div>

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
              {capacidad.filas.length === 0 ? (
                <tr>
                  <td colSpan={5}>Sin profesionales cargables en el periodo.</td>
                </tr>
              ) : (
                capacidad.filas.map((f, i) => (
                  <tr key={i}>
                    <td>{f.nombre}</td>
                    <td>{fmtH(f.directas)}</td>
                    <td>{fmtH(f.indirectas)}</td>
                    <td>{fmtPct(f.cargabilidad)}</td>
                    <td>{badgeCap(f.estado)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Zona central — Estado de la cartera */}
        <section className="reporte-semanal-zone reporte-semanal-zone-center">
          <h2 className="reporte-semanal-zone-title">Estado de la cartera</h2>

          <table className="reporte-ejecutivo-table">
            <thead>
              <tr>
                <th>Cliente / Proyecto</th>
                <th>Act.</th>
                <th>Crit.</th>
                <th>Hitos</th>
                <th>Dir.</th>
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

          <h3 className="reporte-semanal-subtitle">Alertas prioritarias</h3>
          <table className="reporte-ejecutivo-table">
            <thead>
              <tr>
                <th>Prio.</th>
                <th>Proyecto / Entregable</th>
                <th>Situación</th>
              </tr>
            </thead>
            <tbody>
              {snap.topAlertas.length === 0 ? (
                <tr>
                  <td colSpan={3}>Sin alertas prioritarias en el alcance.</td>
                </tr>
              ) : (
                snap.topAlertas.map((a, i) => (
                  <tr key={i}>
                    <td>{a.prioridad}</td>
                    <td>{a.proyectoEntregable}</td>
                    <td>{a.situacion}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Zona derecha — Proyección y pipeline */}
        <section className="reporte-semanal-zone reporte-semanal-zone-right">
          <h2 className="reporte-semanal-zone-title">Proyección y pipeline</h2>

          <h3 className="reporte-semanal-subtitle">{snap.tituloProximosHitos}</h3>
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
            <p className="reporte-semanal-nota">
              + {snap.proximosHitosAdicionales} hito{snap.proximosHitosAdicionales === 1 ? "" : "s"} adicional
              {snap.proximosHitosAdicionales === 1 ? "" : "es"}
            </p>
          ) : null}

          <h3 className="reporte-semanal-subtitle">Pipeline comercial</h3>
          <div className="reporte-semanal-pipeline-kpis">
            <span>
              <strong>{pipeline.totalPropuestas}</strong> propuestas activas
            </span>
            <span>
              <strong>{fmtUF(pipeline.totalUf)} UF</strong> en cartera comercial
            </span>
          </div>
          <table className="reporte-ejecutivo-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Proyecto</th>
                <th>Etapa</th>
                <th>UF</th>
                <th>Hrs</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.filas.length === 0 ? (
                <tr>
                  <td colSpan={5}>Sin propuestas activas en pipeline.</td>
                </tr>
              ) : (
                pipeline.filas.map((p, i) => (
                  <tr key={i}>
                    <td>{p.cliente}</td>
                    <td>{p.proyecto}</td>
                    <td>{p.etapa}</td>
                    <td>{fmtUF(p.montoUf)}</td>
                    <td>{fmtH(p.horasTotales)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {pipeline.adicionales > 0 ? (
            <p className="reporte-semanal-nota">
              + {pipeline.adicionales} propuesta{pipeline.adicionales === 1 ? "" : "s"} adicional
              {pipeline.adicionales === 1 ? "" : "es"}
            </p>
          ) : null}
        </section>
      </div>

      <footer className="reporte-ejecutivo-footer reporte-semanal-footer">
        <span>
          Fuente: RegistroHora, Entregables, Proyectos, Asignaciones y Pipeline vigentes en sistema. La carga real se
          respalda en RegistroHora; la capacidad objetivo es referencia operativa.
        </span>
        <span>Reporte semanal · generado por Constructibilidad · Control de Proyectos</span>
      </footer>
    </div>
  );
}
