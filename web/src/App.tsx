import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import Inicio from './pages/Inicio'
import Detalle from './pages/Detalle'
import Alertas from './pages/Alertas'
import Perfil from './pages/Perfil'
import Simulacion from './pages/Simulacion'
import Tierra from './pages/Tierra'
import Tripulacion from './pages/Tripulacion'
import { useWebSocket } from './lib/ws'
import { useMissionClock } from './lib/useMissionClock'
import DemoBar from './components/layout/DemoBar'
import Login from './pages/Login'
import { useSession } from './store/useSession'
import { useAppStore } from './store/useAppStore'
import { PaginaCamara, PaginaCognitiva, PaginaRegistro, PaginaResumen } from './features/chequeo/rutas'
import { useChequeoStore } from './features/chequeo/chequeoStore'

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

        {/* Chequeo diario de Front 1 (features/chequeo): cámara, prueba cognitiva, registro y resumen */}
        <Route path="/camera" element={<PaginaCamara />} />
        <Route path="/cognitive" element={<PaginaCognitiva />} />
        <Route path="/manual" element={<PaginaRegistro />} />
        <Route path="/summary" element={<PaginaResumen />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
    {/* fuera del AppShell: la transición de página usa transform y rompería el position: fixed */}
    <DemoBar />
    </>
  )
}
