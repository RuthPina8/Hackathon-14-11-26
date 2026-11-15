import { useNavigate } from 'react-router-dom'
import ChequeoCamara from './ChequeoCamara'
import PruebaCognitiva from './PruebaCognitiva'
import RegistroManual from './RegistroManual'
import Resumen from './Resumen'
import { useChequeoStore } from './chequeoStore'

// Las 4 pantallas del chequeo diario (Front 1) conectadas a las rutas de App.tsx

export function PaginaCamara() {
  const ir = useNavigate()
  return <ChequeoCamara onSiguiente={() => ir('/cognitive')} onCancelar={() => ir('/')} />
}

export function PaginaCognitiva() {
  const ir = useNavigate()
  return <PruebaCognitiva onSiguiente={() => ir('/manual')} onAtras={() => ir('/camera')} />
}

export function PaginaRegistro() {
  const ir = useNavigate()
  return <RegistroManual onSiguiente={() => ir('/summary')} onAtras={() => ir('/cognitive')} />
}

export function PaginaResumen() {
  const ir = useNavigate()
  const hayChequeo = useChequeoStore((s) => Boolean(s.camara || s.cognitivo || s.registro))
  const reiniciar = useChequeoStore((s) => s.reiniciar)
  if (!hayChequeo) {
    return (
      <div className="card flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="k">Chequeo diario · paso 5 de 5</p>
        <p className="m-0 font-display text-xl font-semibold">Todavía no hay un chequeo de hoy</p>
        <p className="m-0 text-sm text-soft">El resumen aparece al terminar los pasos de cámara, prueba cognitiva y registro</p>
        <button type="button" className="btn pri mt-2" onClick={() => ir('/camera')}>Empezar chequeo</button>
      </div>
    )
  }
  return (
    <Resumen
      onAtras={() => ir('/manual')}
      onIndicadores={() => ir('/indicators/hr')}
      onInicio={() => {
        reiniciar()
        ir('/')
      }}
    />
  )
}
