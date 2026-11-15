import { useEffect, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

// Archivos locales en web/public, así funciona sin internet
const WASM_PATH = '/mediapipe-wasm'
const MODEL_PATH = '/models/face_landmarker.task'

export type EstadoModelo = 'cargando' | 'listo' | 'error'

async function crearLandmarker(delegate: 'GPU' | 'CPU') {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
  })
}

export function useFaceLandmarker() {
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null)
  const [estado, setEstado] = useState<EstadoModelo>('cargando')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    let instancia: FaceLandmarker | null = null

    async function cargar() {
      try {
        // Primero intenta con la tarjeta de video, que es más rápida
        instancia = await crearLandmarker('GPU')
      } catch {
        try {
          // Si la compu no lo soporta, usa el procesador
          instancia = await crearLandmarker('CPU')
        } catch (e) {
          if (!cancelado) {
            setEstado('error')
            setError(e instanceof Error ? e.message : String(e))
          }
          return
        }
      }
      if (cancelado) {
        instancia.close()
        return
      }
      setLandmarker(instancia)
      setEstado('listo')
    }

    cargar()

    return () => {
      cancelado = true
      instancia?.close()
    }
  }, [])

  return { landmarker, estado, error }
}
