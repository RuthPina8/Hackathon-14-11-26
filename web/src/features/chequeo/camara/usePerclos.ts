import { useCallback, useEffect, useRef, useState } from 'react'
import type { Category } from '@mediapipe/tasks-vision'

// PERCLOS: fracción del tiempo con los ojos cerrados (P80: párpado cubre >= 80% del ojo).
//
// Umbral adaptable: el puntaje "eyeBlink" de MediaPipe no vale 0 con el ojo abierto. Con ojos
// rasgados, lentes o la vista hacia abajo (la cámara de la laptop) se queda en 0.3 o 0.4 y un
// umbral fijo de 0.6 contaría ojos abiertos como cerrados. Por eso el "abierto" de cada persona
// se toma de sus propios cuadros (percentil 20) y "cerrado" es recorrer el 60% de lo que le falta
// para llegar a 1, nunca menos de 0.5.
const UMBRAL_MINIMO = 0.5
const FRACCION_CIERRE = 0.6
const VENTANA_MS = 60_000
const MIN_MUESTRAS = 60 // unos 2 s de video
const PARPADEO_MAX_MS = 500 // más largo ya no es parpadeo: es un cierre largo (microsueño)

type Muestra = { t: number; cierre: number }

export function usePerclos() {
  const muestras = useRef<Muestra[]>([])
  const cierres = useRef<{ inicio: number; fin: number }[]>([])
  const cerradoDesde = useRef<number | null>(null)
  const umbralRef = useRef(0.6)
  const [perclos, setPerclos] = useState<number | null>(null)
  const [parpadeosMin, setParpadeosMin] = useState<number | null>(null)
  const [parpadeoDurMs, setParpadeoDurMs] = useState<number | null>(null)
  const [cierresLargos, setCierresLargos] = useState(0)
  const cierreActual = useRef(0) // último puntaje de cierre (ref: no re-renderiza 30 veces por segundo)

  // Se llama en cada cuadro con los blendshapes. `valido` = false cuando la pose no sirve
  // (de lado, cara tapada): ese cuadro no cuenta para PERCLOS.
  const registrar = useCallback((categorias: Category[] | undefined, t: number, valido = true) => {
    if (!categorias) return
    const valor = (nombre: string) => categorias.find((c) => c.categoryName === nombre)?.score ?? 0
    const cierre = (valor('eyeBlinkLeft') + valor('eyeBlinkRight')) / 2
    cierreActual.current = cierre
    if (!valido) {
      cerradoDesde.current = null
      return
    }
    muestras.current.push({ t, cierre })
    const cerrado = cierre >= umbralRef.current
    if (cerrado && cerradoDesde.current === null) cerradoDesde.current = t
    if (!cerrado && cerradoDesde.current !== null) {
      cierres.current.push({ inicio: cerradoDesde.current, fin: t })
      cerradoDesde.current = null
    }
    const limite = t - VENTANA_MS
    while (muestras.current.length && muestras.current[0].t < limite) muestras.current.shift()
    while (cierres.current.length && cierres.current[0].fin < limite) cierres.current.shift()
  }, [])

  // Recalcula cada medio segundo, no en cada cuadro, para no trabar la pantalla
  useEffect(() => {
    const id = setInterval(() => {
      const lista = muestras.current
      if (lista.length < MIN_MUESTRAS) return
      const orden = lista.map((m) => m.cierre).sort((a, b) => a - b)
      // Tope de 0.45: si el "abierto" sale más alto es que los ojos pasaron cerrados casi todo
      // el minuto, y subir el umbral escondería justo la fatiga que se quiere medir
      const abierto = Math.min(0.45, orden[Math.floor(orden.length * 0.2)])
      const umbral = Math.max(UMBRAL_MINIMO, abierto + FRACCION_CIERRE * (1 - abierto))
      umbralRef.current = umbral
      setPerclos(lista.filter((m) => m.cierre >= umbral).length / lista.length)

      const minutos = Math.max((lista[lista.length - 1].t - lista[0].t) / 60_000, 1 / 60)
      const parpadeos = cierres.current.filter((c) => c.fin - c.inicio <= PARPADEO_MAX_MS)
      setParpadeosMin(Math.round(parpadeos.length / minutos))
      setParpadeoDurMs(parpadeos.length ? Math.round(parpadeos.reduce((s, c) => s + c.fin - c.inicio, 0) / parpadeos.length) : null)
      setCierresLargos(cierres.current.length - parpadeos.length)
    }, 500)
    return () => clearInterval(id)
  }, [])

  // Cuadros válidos con que se calculó (para la confianza de la medición)
  const muestrasValidas = useCallback(() => muestras.current.length, [])

  const reiniciar = useCallback(() => {
    muestras.current = []
    cierres.current = []
    cerradoDesde.current = null
    umbralRef.current = 0.6
    setPerclos(null)
    setParpadeosMin(null)
    setParpadeoDurMs(null)
    setCierresLargos(0)
  }, [])

  return { perclos, parpadeosMin, parpadeoDurMs, cierresLargos, cierreActual, registrar, reiniciar, muestrasValidas }
}
