import { useAppStore } from '../../store/useAppStore'
import { C } from '../../lib/paleta'

// Indicador pequeño del estado de conexión con el back (va abajo del menú lateral).
const label: Record<string, { text: string; color: string }> = {
  mock: { text: 'Datos de ejemplo', color: C.faint },
  connecting: { text: 'Conectando al back…', color: C.warn },
  connected: { text: 'Conectado en vivo', color: C.ok },
  disconnected: { text: 'Sin back, usando ejemplos', color: C.faint },
}

export default function ConnectionStatus() {
  const connection = useAppStore((s) => s.connection)
  const info = label[connection] ?? label.mock
  return (
    <span className="flex items-center gap-2 text-sm text-muted">
      <span className="w-2 h-2 rounded-full" style={{ background: info.color }} />
      {info.text}
    </span>
  )
}
