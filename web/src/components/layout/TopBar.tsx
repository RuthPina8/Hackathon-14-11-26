import { useAppStore } from '../../store/useAppStore'

// Indicador pequeño del estado de conexión con el back (va abajo del menú lateral).
const label: Record<string, { text: string; color: string }> = {
  mock: { text: 'Datos de ejemplo', color: '#93A0B8' },
  connecting: { text: 'Conectando al back…', color: '#F5B544' },
  connected: { text: 'Conectado en vivo', color: '#3DDC97' },
  disconnected: { text: 'Sin back, usando ejemplos', color: '#93A0B8' },
}

export default function ConnectionStatus() {
  const connection = useAppStore((s) => s.connection)
  const info = label[connection] ?? label.mock
  return (
    <span className="flex items-center gap-2 text-xs text-[#A3AEC4]">
      <span className="w-2 h-2 rounded-full" style={{ background: info.color }} />
      {info.text}
    </span>
  )
}
