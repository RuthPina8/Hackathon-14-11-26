import { useEffect } from 'react'
import ChequeoCamara from './ChequeoCamara'
import PruebaCognitiva from './PruebaCognitiva'
import RegistroPresion from './RegistroPresion'
import RegistroAnimo from './RegistroAnimo'
import Resumen from './Resumen'
import { useChequeoStore } from './chequeoStore'
import { useSession } from '../../store/useSession'

// Flujo completo del chequeo diario. El paso vive en la URL (/camera?paso=N), así el botón
// "atrás" del navegador, los enlaces de Inicio y recargar la página llevan al paso correcto.
export default function ChequeoFlow({ paso, onPaso, onSalir }: { paso: number; onPaso: (p: number) => void; onSalir: () => void }) {
  const usuario = useSession((s) => s.user?.id ?? 'A1')
  const cargar = useChequeoStore((s) => s.cargar)
  useEffect(() => { cargar(usuario) }, [usuario, cargar])

  useEffect(() => { window.scrollTo?.(0, 0); document.querySelector('main')?.scrollTo?.(0, 0) }, [paso])

  if (paso === 1) return <PruebaCognitiva onSiguiente={() => onPaso(2)} onAtras={() => onPaso(0)} />
  if (paso === 2) return <RegistroPresion onSiguiente={() => onPaso(3)} onAtras={() => onPaso(1)} />
  if (paso === 3) return <RegistroAnimo onSiguiente={() => onPaso(4)} onAtras={() => onPaso(2)} />
  if (paso === 4) return <Resumen onIrA={onPaso} onSalir={onSalir} />
  return <ChequeoCamara onSiguiente={() => onPaso(1)} onCancelar={onSalir} />
}
