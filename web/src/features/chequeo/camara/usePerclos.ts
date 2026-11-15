import { useCallback, useEffect, useRef, useState } from 'react'
import type { Category } from '@mediapipe/tasks-vision'

// Un ojo cuenta como "cerrado" cuando MediaPipe dice que está cerrado al 60% o más
const UMBRAL_CERRADO = 0.6
// Se calcula sobre el último minuto
const VENTANA_MS = 60_000
// Mínimo de cuadros para dar un número confiable (unos 2 segundos de video)
const MIN_MUESTRAS = 60

type Muestra = { t: number; cerrado: boolean }

export function usePerclos() {
  const muestras = useRef<Muestra[]>([])
  const parpadeos = useRef<number[]>([])
  const estabaCerrado = useRef(false)
  const [perclos, setPerclos] = useState<number | null>(null)
  const [parpadeosMin, setParpadeosMin] = useState<number | null>(null)
  const [cierreActual, setCierreActual] = useState(0)

  // Se llama en cada cuadro del video con los blendshapes de MediaPipe
  const registrar = useCallback((categorias: Category[] | undefined, t: number) => {
    if (!categorias) return
    const valor = (nombre: string) => categorias.find((c) => c.categoryName === nombre)?.score ?? 0
    const cierre = (valor('eyeBlinkLeft') + valor('eyeBlinkRight')) / 2
    const cerrado = cierre >= UMBRAL_CERRADO

    muestras.current.push({ t, cerrado })
    // Un parpadeo es cuando el ojo pasa de abierto a cerrado
    if (cerrado && !estabaCerrado.current) parpadeos.current.push(t)
    estabaCerrado.current = cerrado

    // Tira lo que tenga más de un minuto
    const limite = t - VENTANA_MS
    while (muestras.current.length && muestras.current[0].t < limite) muestras.current.shift()
    while (parpadeos.current.length && parpadeos.current[0] < limite) parpadeos.current.shift()

    setCierreActual(cierre)
  }, [])

  // Recalcula los números cada medio segundo, no en cada cuadro, para no trabar la pantalla
  useEffect(() => {
    const id = setInterval(() => {
      const lista = muestras.current
      if (lista.length < MIN_MUESTRAS) return
      const cerrados = lista.filter((m) => m.cerrado).length
      setPerclos(cerrados / lista.length)

      const minutos = Math.max((lista[lista.length - 1].t - lista[0].t) / 60_000, 1 / 60)
      setParpadeosMin(Math.round(parpadeos.current.length / minutos))
    }, 500)
    return () => clearInterval(id)
  }, [])

  const reiniciar = useCallback(() => {
    muestras.current = []
    parpadeos.current = []
    estabaCerrado.current = false
    setPerclos(null)
    setParpadeosMin(null)
  }, [])

  return { perclos, parpadeosMin, cierreActual, registrar, reiniciar }
}
