import { useEffect, useRef, useState } from 'react'
import { movimientoReducido } from '../../lib/efectos'

// Reloj de las animaciones guiadas: fase de 0 a 1 que se repite cada `periodoMs`, a 30 cuadros por segundo.
// Con "reducir movimiento" se queda quieta en `quieta` (la pose clave de la escena) y no anima nada.
export function useFase(periodoMs: number, quieta = 0.5) {
  const reducido = movimientoReducido()
  const [f, setF] = useState(reducido ? quieta : 0)
  useEffect(() => {
    if (reducido) return
    let raf = 0
    let ultimo = 0
    const t0 = performance.now()
    const paso = (t: number) => {
      raf = requestAnimationFrame(paso)
      if (t - ultimo < 33) return
      ultimo = t
      setF(((t - t0) % periodoMs) / periodoMs)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [periodoMs, reducido])
  return f
}

// Cuenta cuántas veces la fase dio la vuelta (para contadores de repeticiones en las demos)
export function useVueltas(f: number) {
  const prev = useRef(f)
  const n = useRef(0)
  if (f < prev.current - 0.5) n.current += 1
  prev.current = f
  return n.current
}

// 0 -> 1 -> 0 suave a lo largo de la fase
export const vaiven = (f: number) => 0.5 - 0.5 * Math.cos(f * Math.PI * 2)
// 0 -> 1 suave entre a y b de la fase
export const tramo = (f: number, a: number, b: number) => {
  const x = Math.min(1, Math.max(0, (f - a) / (b - a)))
  return x * x * (3 - 2 * x)
}
export const rad = (g: number) => (g * Math.PI) / 180
