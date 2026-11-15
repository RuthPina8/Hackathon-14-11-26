import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

// Reloj de misión: cada segundo real avanza la cola de comunicación.
// App normal: 1 segundo = 1 segundo (tiempo real).
// Modo demo: 1x / 10x / 60x, según la barra de demo.
export function useMissionClock() {
  useEffect(() => {
    const iv = setInterval(() => {
      const { demo, demoSpeed, advanceQueue } = useAppStore.getState()
      const speed = demo ? demoSpeed : 1
      advanceQueue(speed / 60) // minutos de misión por segundo real
    }, 1000)
    return () => clearInterval(iv)
  }, [])
}
