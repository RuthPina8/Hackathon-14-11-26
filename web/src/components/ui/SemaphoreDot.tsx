import type { Semaforo } from '../../store/mockData'
import EstadoIcono from './EstadoIcono'

// Antes era solo un punto de color; ahora cada estado tiene su forma (daltonismo).
export default function SemaphoreDot({ estado, size = 10 }: { estado: Semaforo; size?: number }) {
  return <EstadoIcono estado={estado} size={Math.max(size, 14)} />
}
