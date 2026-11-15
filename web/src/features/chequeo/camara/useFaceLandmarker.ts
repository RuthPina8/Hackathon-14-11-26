import { useEffect, useState } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { getFaceLandmarker } from '../../../lib/faceLandmarker'

export type EstadoModelo = 'cargando' | 'listo' | 'error'

// Usa el detector compartido de lib/faceLandmarker.ts (una sola instancia para toda la app,
// con el modelo y el wasm locales de web/public). No se cierra al salir de la pantalla porque
// también lo usa el inicio de sesión.
// numFaces 2 en el chequeo: así se sabe si hay otra persona en cuadro y se mide la más cercana
export function useFaceLandmarker(numFaces = 1) {
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null)
  const [estado, setEstado] = useState<EstadoModelo>('cargando')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    getFaceLandmarker(numFaces)
      .then((fl) => {
        if (cancelado) return
        setLandmarker(fl)
        setEstado('listo')
      })
      .catch((e) => {
        if (cancelado) return
        setEstado('error')
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelado = true
    }
  }, [numFaces])

  return { landmarker, estado, error }
}
