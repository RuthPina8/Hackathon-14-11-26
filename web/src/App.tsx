import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import Inicio from './pages/Inicio'
import Detalle from './pages/Detalle'
import Alertas from './pages/Alertas'
import Simulacion from './pages/Simulacion'
import Tripulacion from './pages/Tripulacion'
import Evolucion from './pages/Evolucion'
import MissionIntelligence from './pages/MissionIntelligence'
import MovimientoFlow from './features/movimiento/MovimientoFlow'
import { useWebSocket } from './lib/ws'
import { useMissionClock } from './lib/useMissionClock'
import DemoBar from './components/layout/DemoBar'
import Login from './pages/Login'
import { useSession } from './store/useSession'
import { useAppStore } from './store/useAppStore'
import ChequeoFlow from './features/chequeo/ChequeoFlow'
import { useChequeoStore } from './features/chequeo/chequeoStore'

// Flujo del chequeo diario (features/chequeo). El paso va en la URL: /camera?paso=0..4
function ChequeoRoute() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const paso = Math.min(4, Math.max(0, Number(params.get('paso')) || 0))
  return <ChequeoFlow paso={paso} onPaso={(p) => setParams(p ? { paso: String(p) } : {})} onSalir={() => navigate('/')} />
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
  // Lo hecho hoy en el chequeo es de cada astronauta (Inicio muestra su rutina)
  const cargarChequeo = useChequeoStore((s) => s.cargar)
  useEffect(() => { if (user) cargarChequeo(user.id) }, [user, cargarChequeo])

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
        <Route path="/simulation" element={<Simulacion />} />
        <Route path="/crew" element={<Tripulacion />} />
        <Route path="/progress" element={<Evolucion />} />
        <Route path="/mission-intelligence" element={<MissionIntelligence />} />
        <Route path="/movement" element={<MovimientoFlow />} />

        {/* Chequeo diario (Front 1): los 5 pasos viven en /camera?paso=N; las rutas viejas redirigen */}
        <Route path="/camera" element={<ChequeoRoute />} />
        <Route path="/cognitive" element={<Navigate to="/camera?paso=1" replace />} />
        <Route path="/manual" element={<Navigate to="/camera?paso=2" replace />} />
        <Route path="/summary" element={<Navigate to="/camera?paso=4" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
    {/* fuera del AppShell: la transición de página usa transform y rompería el position: fixed */}
    <DemoBar />
    </>
  )
}
