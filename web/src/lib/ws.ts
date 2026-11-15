import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { wsUrl } from './api'

// Cliente de WebSocket hacia /ws (dueño del backend: Back 2).
// Mientras el back no esté corriendo, el hook intenta conectar, falla en silencio
// y la app se queda en modo "mock" — así nadie se bloquea esperando a que el
// back esté listo (regla de la sección 2 del documento maestro).
export function useWebSocket() {
  const applyServerEvent = useAppStore((s) => s.applyServerEvent)
  const setConnection = useAppStore((s) => s.setConnection)
  const socketRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    function connect() {
      const url = wsUrl()
      if (!url) return

      setConnection('connecting')
      const socket = new WebSocket(url)
      socketRef.current = socket

      socket.onopen = () => {
        if (cancelled) return
        setConnection('connected')
        // Trae el estado actual del back (alertas, cola, entorno, demo)
        void useAppStore.getState().loadFromServer()
      }

      socket.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as { event: string; data: unknown }
          applyServerEvent(parsed.event, parsed.data)
          // Otras pantallas (ASTRA-MOVE, ambiente, Mission Intelligence) escuchan con useWsEvent
          window.dispatchEvent(new CustomEvent('astro-ws', { detail: parsed }))
        } catch (err) {
          console.warn('[ws] mensaje no reconocido', err)
        }
      }

      socket.onclose = () => {
        if (cancelled) return
        setConnection('disconnected')
        // Reintenta cada 5s. Si el back nunca contesta, nos quedamos en mock
        // (la UI sigue funcionando porque todo parte de datos simulados).
        retryRef.current = setTimeout(connect, 5000)
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    connect()

    return () => {
      cancelled = true
      if (retryRef.current) clearTimeout(retryRef.current)
      socketRef.current?.close()
    }
  }, [applyServerEvent, setConnection])
}
