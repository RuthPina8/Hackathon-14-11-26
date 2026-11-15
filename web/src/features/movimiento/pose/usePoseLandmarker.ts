import { useEffect, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

// Modelo de pose corporal de MediaPipe (33 puntos: hombros, codos, muñecas, caderas, rodillas, tobillos).
// Usa el mismo wasm local que el detector de cara. El modelo se busca primero en web/public/models
// (funciona sin internet); si no está, se baja del repositorio oficial de MediaPipe.
const WASM = '/mediapipe-wasm'
const MODELO_LOCAL = '/models/pose_landmarker_lite.task'
const MODELO_REMOTO = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

let instancia: Promise<{ pose: PoseLandmarker; origen: 'local' | 'remoto' }> | null = null

async function crear(modelo: string, delegate: 'GPU' | 'CPU') {
  const vision = await FilesetResolver.forVisionTasks(WASM)
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelo, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
}

async function crearConRespaldo(modelo: string) {
  try {
    return await crear(modelo, 'GPU')
  } catch {
    return await crear(modelo, 'CPU')
  }
}

export function getPoseLandmarker() {
  if (!instancia) {
    instancia = (async () => {
      try {
        return { pose: await crearConRespaldo(MODELO_LOCAL), origen: 'local' as const }
      } catch {
        return { pose: await crearConRespaldo(MODELO_REMOTO), origen: 'remoto' as const }
      }
    })()
    instancia.catch(() => { instancia = null })
  }
  return instancia
}

export type EstadoPose = 'cargando' | 'listo' | 'error'

export function usePoseLandmarker() {
  const [pose, setPose] = useState<PoseLandmarker | null>(null)
  const [estado, setEstado] = useState<EstadoPose>('cargando')
  const [origen, setOrigen] = useState<'local' | 'remoto' | null>(null)

  useEffect(() => {
    let cancelado = false
    getPoseLandmarker()
      .then((r) => { if (!cancelado) { setPose(r.pose); setOrigen(r.origen); setEstado('listo') } })
      .catch(() => { if (!cancelado) setEstado('error') })
    return () => { cancelado = true }
  }, [])

  return { pose, estado, origen }
}
