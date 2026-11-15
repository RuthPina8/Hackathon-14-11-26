import { useCallback, useRef } from 'react'
import type { Category } from '@mediapipe/tasks-vision'

// Expresividad y movimiento de la cara durante el chequeo (blendshapes de MediaPipe).
// NO es lectura de emociones: son números que solo valen comparados contra tu propio normal.
// El modelo personal de ánimo del back aprende cómo cambian cuando TÚ reportas sentirte mal.

const EXPRESIVOS = [
  'mouthSmileLeft', 'mouthSmileRight', 'browDownLeft', 'browDownRight', 'browInnerUp',
  'cheekSquintLeft', 'cheekSquintRight', 'mouthFrownLeft', 'mouthFrownRight', 'jawOpen',
]

type Muestra = { sonrisa: number; ceno: number; v: number[]; mov: number }

export type ResultadoExpresion = {
  expresividad: number // 0 a 1: cuánto se mueve la cara (variación de los gestos)
  sonrisa: number // 0 a 1, promedio
  ceno: number // 0 a 1, promedio
  movimiento: number // 0 a 1: movimiento de la cabeza
  muestras: number
}

export function useExpresion() {
  const muestras = useRef<Muestra[]>([])

  const registrar = useCallback((categorias: Category[] | undefined, movimiento: number) => {
    if (!categorias) return
    const val = (n: string) => categorias.find((c) => c.categoryName === n)?.score ?? 0
    muestras.current.push({
      sonrisa: (val('mouthSmileLeft') + val('mouthSmileRight')) / 2,
      ceno: (val('browDownLeft') + val('browDownRight')) / 2,
      v: EXPRESIVOS.map(val),
      mov: movimiento,
    })
    if (muestras.current.length > 3000) muestras.current.shift()
  }, [])

  const resultado = useCallback((): ResultadoExpresion | null => {
    const m = muestras.current
    if (m.length < 90) return null
    const prom = (f: (x: Muestra) => number) => m.reduce((s, x) => s + f(x), 0) / m.length
    // Variación de cada gesto en el tiempo, promediada: una cara "plana" da cerca de 0
    const sds = EXPRESIVOS.map((_, i) => {
      const media = prom((x) => x.v[i])
      return Math.sqrt(prom((x) => (x.v[i] - media) ** 2))
    })
    const variacion = sds.reduce((a, b) => a + b, 0) / sds.length
    return {
      expresividad: Math.min(1, variacion * 6),
      sonrisa: prom((x) => x.sonrisa),
      ceno: prom((x) => x.ceno),
      movimiento: Math.min(1, prom((x) => x.mov) / 0.3),
      muestras: m.length,
    }
  }, [])

  const reiniciar = useCallback(() => {
    muestras.current = []
  }, [])

  return { registrar, resultado, reiniciar }
}
