import { useCallback, useEffect, useRef, useState } from 'react'
import type { Category } from '@mediapipe/tasks-vision'

// Expresividad: cuánto se mueve la cara (cejas, boca, mejillas) durante la medición.
// No se etiquetan emociones: solo se mide la cantidad de movimiento y se compara con tu normal.
// Una cara mucho más quieta o mucho más activa que de costumbre es lo que vale la pena notar.
const EXPRESIONES = [
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPressLeft', 'mouthPressRight',
  'mouthPucker', 'jawOpen', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'eyeSquintLeft', 'eyeSquintRight',
]
const VENTANA_MS = 60_000
const MIN_MUESTRAS = 60
// La variación típica de un blendshape con la cara en reposo es de 0.01 a 0.05;
// al hablar o gesticular sube a 0.15 o más. Se escala para que eso quede entre 0 y 1
const ESCALA = 6
const MOVIMIENTO_MAX = 0.6 // velocidad de la cara (fracción de la imagen por segundo) que cuenta como 1

type Muestra = { t: number; valores: number[]; sonrisa: number; ceno: number; mov: number }

export type Expresion = { expresividad: number; sonrisa: number; ceno: number; movimiento: number }

const promedio = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1)

export function useExpresividad() {
  const muestras = useRef<Muestra[]>([])
  const [expresion, setExpresion] = useState<Expresion | null>(null)

  // Se llama en cada cuadro de MediaPipe con los blendshapes y la velocidad de la cara
  const registrar = useCallback((categorias: Category[] | undefined, t: number, movimiento: number) => {
    if (!categorias) return
    const mapa = new Map(categorias.map((c) => [c.categoryName, c.score]))
    const v = (n: string) => mapa.get(n) ?? 0
    muestras.current.push({
      t,
      valores: EXPRESIONES.map(v),
      sonrisa: (v('mouthSmileLeft') + v('mouthSmileRight')) / 2,
      ceno: (v('browDownLeft') + v('browDownRight')) / 2,
      mov: movimiento,
    })
    const limite = t - VENTANA_MS
    while (muestras.current.length && muestras.current[0].t < limite) muestras.current.shift()
  }, [])

  const calcular = useCallback((): Expresion | null => {
    const lista = muestras.current
    if (lista.length < MIN_MUESTRAS) return null
    // Variación de cada blendshape durante la ventana, promediada entre todos
    const variaciones = EXPRESIONES.map((_, k) => {
      const serie = lista.map((m) => m.valores[k])
      const media = promedio(serie)
      return Math.sqrt(promedio(serie.map((x) => (x - media) ** 2)))
    })
    const r = (x: number) => Number(Math.min(1, Math.max(0, x)).toFixed(3))
    return {
      expresividad: r(promedio(variaciones) * ESCALA),
      sonrisa: r(promedio(lista.map((m) => m.sonrisa))),
      ceno: r(promedio(lista.map((m) => m.ceno))),
      movimiento: r(promedio(lista.map((m) => m.mov)) / MOVIMIENTO_MAX),
    }
  }, [])

  // Se actualiza una vez por segundo para no trabar la pantalla
  useEffect(() => {
    const id = setInterval(() => {
      const e = calcular()
      if (e) setExpresion(e)
    }, 1000)
    return () => clearInterval(id)
  }, [calcular])

  const reiniciar = useCallback(() => {
    muestras.current = []
    setExpresion(null)
  }, [])

  return { expresion, registrar, calcular, reiniciar }
}
