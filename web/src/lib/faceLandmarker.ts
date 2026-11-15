import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'

// Detector de cara compartido (MediaPipe Face Landmarker, 478 puntos + blendshapes).
// Lo usa el inicio de sesión y lo puede reutilizar Front 1 en el chequeo con cámara:
//   const fl = await getFaceLandmarker()
//   const r = fl.detectForVideo(video, performance.now())
// Se carga una sola vez y se comparte entre el inicio de sesión y el chequeo con cámara
// (los dos usan performance.now() como tiempo, así que nunca se atrasa el reloj del detector).

// Archivos locales en web/public (los mismos que usa Front 1), así funciona sin internet
const WASM = '/mediapipe-wasm'
const MODEL = '/models/face_landmarker.task'

let instance: Promise<FaceLandmarker> | null = null
let carasActuales = 1

// numFaces: el inicio de sesión pide 2 para avisar cuando hay más de una persona; el chequeo pide 1.
// Nadie debe llamar close() sobre esta instancia, es de todos.
export async function getFaceLandmarker(numFaces = 1): Promise<FaceLandmarker> {
  if (!instance) {
    instance = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM)
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO' as const,
        numFaces: 1,
        outputFaceBlendshapes: true,
      })
      carasActuales = 1
      try {
        return await FaceLandmarker.createFromOptions(vision, opts('GPU'))
      } catch {
        return await FaceLandmarker.createFromOptions(vision, opts('CPU'))
      }
    })()
    instance.catch(() => { instance = null })
  }
  const fl = await instance
  if (numFaces !== carasActuales) {
    await fl.setOptions({ numFaces })
    carasActuales = numFaces
  }
  return fl
}

// ---------- firma facial ----------
// Proporciones entre puntos fijos de la cara (ojos, nariz, boca, mentón, pómulos, cejas),
// normalizadas por la distancia entre ojos. No es reconocimiento facial de grado médico:
// es un prototipo para distinguir a una tripulación pequeña con la cara de frente.
const PAIRS: [number, number][] = [
  [33, 133], [362, 263], [133, 362], [33, 1], [263, 1], [168, 1], [1, 13], [13, 14],
  [61, 291], [1, 61], [1, 291], [14, 152], [1, 152], [10, 168], [10, 152], [234, 454],
  [234, 1], [454, 1], [105, 334], [105, 33], [334, 263], [172, 397], [152, 172], [152, 397],
  [61, 152], [291, 152], [10, 234], [10, 454],
]

export function faceSignature(lm: NormalizedLandmark[], aspect: number): number[] {
  const p = (i: number) => ({ x: lm[i].x * aspect, y: lm[i].y, z: lm[i].z * aspect })
  const d = (a: number, b: number) => {
    const A = p(a), B = p(b)
    return Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z)
  }
  const ref = d(33, 263) || 1
  return PAIRS.map(([a, b]) => d(a, b) / ref)
}

export function averageSignature(sigs: number[][]): number[] {
  return sigs[0].map((_, i) => sigs.reduce((s, v) => s + v[i], 0) / sigs.length)
}

export function signatureDistance(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s / a.length)
}

// ---------- pose y parpadeo ----------
// Cara de frente y centrada: la nariz cae entre los dos ojos y la cara ocupa buena parte del cuadro.
export function poseCheck(lm: NormalizedLandmark[]) {
  const l = lm[33], r = lm[263], n = lm[1]
  const eyeW = Math.abs(r.x - l.x)
  const yaw = (n.x - (l.x + r.x) / 2) / (eyeW || 1) // ~0 de frente
  const cx = (lm[234].x + lm[454].x) / 2
  const cy = (lm[10].y + lm[152].y) / 2
  const size = Math.abs(lm[454].x - lm[234].x)
  return {
    frontal: Math.abs(yaw) < 0.12,
    centered: Math.abs(cx - 0.5) < 0.15 && Math.abs(cy - 0.5) < 0.18,
    nearEnough: size > 0.22,
    tooClose: size > 0.7,
  }
}

export function blinkScore(blendshapes: { categories: { categoryName: string; score: number }[] } | undefined): number {
  if (!blendshapes) return 0
  const get = (n: string) => blendshapes.categories.find((c) => c.categoryName === n)?.score ?? 0
  return (get('eyeBlinkLeft') + get('eyeBlinkRight')) / 2
}

// ---------- reconocimiento facial (quién eres) ----------
// face-api: red neuronal entrenada que convierte una cara en una huella de 128 números.
// Dos fotos de la misma persona quedan a distancia < ~0.45; personas distintas, por encima.
// Los modelos están en web/public/models/face-api, así el login funciona sin internet.
const FACEAPI_MODELS = '/models/face-api'
type FaceApi = typeof import('@vladmandic/face-api')
let faceapiPromise: Promise<FaceApi> | null = null

export function getFaceApi(): Promise<FaceApi> {
  if (!faceapiPromise) {
    faceapiPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api')
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODELS),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACEAPI_MODELS),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACEAPI_MODELS),
      ])
      return faceapi
    })()
    faceapiPromise.catch(() => { faceapiPromise = null })
  }
  return faceapiPromise
}

export async function faceDescriptor(video: HTMLVideoElement): Promise<number[] | null> {
  const faceapi = await getFaceApi()
  const r = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor()
  return r ? Array.from(r.descriptor) : null
}

export function descriptorDistance(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s)
}

// ---------- reto de vida aleatorio ----------
// Después de reconocerte se pide 1 gesto al azar; un video grabado no puede saber cuáles ni en qué orden.
type Blend = { categories: { categoryName: string; score: number }[] } | undefined
const bs = (b: Blend, n: string) => b?.categories.find((c) => c.categoryName === n)?.score ?? 0

export type ChallengeId = 'blink' | 'smile' | 'brows' | 'left' | 'right'

export const CHALLENGES: Record<ChallengeId, { label: string; check: (lm: NormalizedLandmark[], b: Blend) => boolean }> = {
  blink: { label: 'Blink', check: (_l, b) => (bs(b, 'eyeBlinkLeft') + bs(b, 'eyeBlinkRight')) / 2 > 0.55 },
  smile: { label: 'Smile', check: (_l, b) => (bs(b, 'mouthSmileLeft') + bs(b, 'mouthSmileRight')) / 2 > 0.55 },
  brows: { label: 'Raise your eyebrows', check: (_l, b) => Math.max(bs(b, 'browInnerUp'), (bs(b, 'browOuterUpLeft') + bs(b, 'browOuterUpRight')) / 2) > 0.5 },
  // la imagen de la cámara no está en espejo: girar a TU izquierda mueve la nariz hacia la derecha del cuadro
  left: { label: 'Turn your head to your left', check: (lm) => headYaw(lm) > 0.22 },
  right: { label: 'Turn your head to your right', check: (lm) => headYaw(lm) < -0.22 },
}

export function headYaw(lm: NormalizedLandmark[]): number {
  const l = lm[33], r = lm[263], n = lm[1]
  return (n.x - (l.x + r.x) / 2) / (Math.abs(r.x - l.x) || 1)
}

export function randomChallenges(n = 2): ChallengeId[] {
  const pool = Object.keys(CHALLENGES) as ChallengeId[]
  const out: ChallengeId[] = []
  while (out.length < n) {
    const c = pool[Math.floor(Math.random() * pool.length)]
    if (!out.includes(c) && !(out.includes('left') && c === 'right') && !(out.includes('right') && c === 'left')) out.push(c)
  }
  return out
}
