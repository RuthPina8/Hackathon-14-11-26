import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import Inicio from './pages/Inicio'
import Detalle from './pages/Detalle'
import Alertas from './pages/Alertas'
import Perfil from './pages/Perfil'
import Simulacion from './pages/Simulacion'
import Tierra from './pages/Tierra'
import Tripulacion from './pages/Tripulacion'
import Front1Placeholder from './pages/Front1Placeholder'
import { useWebSocket } from './lib/ws'
import { useMissionClock } from './lib/useMissionClock'
import DemoBar from './components/layout/DemoBar'
import Login from './pages/Login'
import { useSession } from './store/useSession'

export default function App() {
  // Se conecta una vez; si el back no está, la app sigue con datos de ejemplo.
  useWebSocket()
  useMissionClock()
  const user = useSession((s) => s.user)

  // Sin sesión: solo la pantalla de inicio con la cara
  if (!user) return <><Login /><DemoBar /></>

  return (
    <>
    <AppShell>
      <Routes>
        {/* Front 2 */}
        <Route path="/" element={<Inicio />} />
        <Route path="/indicators" element={<Navigate to="/indicators/hr" replace />} />
        <Route path="/indicators/:tipo" element={<Detalle />} />
        <Route path="/alerts" element={<Alertas />} />
        <Route path="/profile" element={<Perfil />} />
        <Route path="/simulation" element={<Simulacion />} />
        <Route path="/earth" element={<Tierra />} />
        <Route path="/crew" element={<Tripulacion />} />

        {/* Front 1: reemplazar el placeholder por su pantalla */}
        <Route path="/camera" element={<Front1Placeholder titulo="Chequeo con cámara" paso="paso 1 de 5" />} />
        <Route path="/cognitive" element={<Front1Placeholder titulo="Prueba cognitiva" paso="paso 2 de 5" />} />
        <Route path="/manual" element={<Front1Placeholder titulo="Presión, ánimo y síntomas" paso="pasos 3 y 4 de 5" />} />
        <Route path="/summary" element={<Front1Placeholder titulo="Resumen de hoy" paso="paso 5 de 5" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
    {/* fuera del AppShell: la transición de página usa transform y rompería el position: fixed */}
    <DemoBar />
    </>
  )
}
