import { useEffect, useRef } from 'react'

// Escucha eventos del WebSocket /ws que reenvía lib/ws.ts, sin tocar el store global.
//   useWsEvent(['telemetry_updated'], (evento, data) => ...)
export function useWsEvent(eventos: string[], handler: (evento: string, data: unknown) => void) {
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler }, [handler])
  const clave = eventos.join('|')
  useEffect(() => {
    const lista = clave.split('|')
    const fn = (e: Event) => {
      const { event, data } = (e as CustomEvent<{ event: string; data: unknown }>).detail
      if (lista.includes(event)) ref.current(event, data)
    }
    window.addEventListener('astro-ws', fn)
    return () => window.removeEventListener('astro-ws', fn)
  }, [clave])
}
