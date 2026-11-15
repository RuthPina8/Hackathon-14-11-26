import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
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
import { useAppStore } from './store/useAppStore'
import ChequeoFlow from './features/chequeo/ChequeoFlow'
import { useChequeoStore } from './features/chequeo/chequeoStore'

// Front 1: flujo del chequeo diario (features/chequeo). Al salir vuelve a Inicio.
function ChequeoRoute() {
  const navigate = useNavigate()
  return <ChequeoFlow onSalir={() => navigate('/')} />
}

// Cuando Front 1 guarda un resultado real de la cámara, se refleja en el dashboard de Front 2.
function useCameraToDashboard() {
  const camara = useChequeoStore((s) => s.camara)
  useEffect(() => {
    if (camara) useAppStore.getState().applyCameraResult(camara)
  }, [camara])
}

export default function App() {
  // Se conecta una vez; si el back no está, la app sigue con datos de ejemplo.
  useWebSocket()
  useMissionClock()
  useCameraToDashboard()
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

        {/* Front 1: /camera ya conectado (features/chequeo); los demás pasos siguen en construcción */}
        <Route path="/camera" element={<ChequeoRoute />} />
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
