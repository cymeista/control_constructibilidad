import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Home from './pages/Home'
import Formularios from './pages/Formularios'
import Horas from './pages/Horas'
import Pipeline from './pages/Pipeline'
import Proyectos from './pages/Proyectos'
import AuditoriaProyectos from './pages/AuditoriaProyectos'
import Profesionales from './pages/Profesionales'
import Gantt from './pages/Gantt'
import CapacidadEquipo from './pages/CapacidadEquipo'
import ReporteEjecutivo from './pages/ReporteEjecutivo'
import Alertas from './pages/Alertas'
import Configuracion from './pages/Configuracion'
import Login from './pages/Login'
import { RequireRole } from './security/RequireAuth'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<RequireRole route="/"><Home /></RequireRole>} />
        <Route path="proyectos" element={<RequireRole route="/proyectos"><Proyectos /></RequireRole>} />
        <Route path="profesionales" element={<RequireRole route="/profesionales"><Profesionales /></RequireRole>} />
        <Route path="gantt" element={<RequireRole route="/gantt"><Gantt /></RequireRole>} />
        <Route path="horas" element={<RequireRole route="/horas"><Horas /></RequireRole>} />
        <Route
          path="capacidad-equipo"
          element={
            <RequireRole route="/capacidad-equipo">
              <CapacidadEquipo />
            </RequireRole>
          }
        />
        <Route
          path="reportes"
          element={
            <RequireRole route="/reportes">
              <ReporteEjecutivo />
            </RequireRole>
          }
        />
        <Route path="pipeline" element={<RequireRole route="/pipeline"><Pipeline /></RequireRole>} />
        <Route path="formularios" element={<RequireRole route="/formularios"><Formularios /></RequireRole>} />
        <Route path="configuracion" element={<RequireRole route="/configuracion"><Configuracion /></RequireRole>} />
        <Route path="auditoria-proyectos" element={<RequireRole route="/auditoria-proyectos"><AuditoriaProyectos /></RequireRole>} />
        <Route path="alertas" element={<RequireRole route="/alertas"><Alertas /></RequireRole>} />
      </Route>
    </Routes>
  )
}
