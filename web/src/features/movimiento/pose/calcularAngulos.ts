import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

// Índices de MediaPipe Pose (33 puntos)
export const P = {
  hombroIzq: 11, hombroDer: 12, codoIzq: 13, codoDer: 14, munecaIzq: 15, munecaDer: 16,
  caderaIzq: 23, caderaDer: 24, rodillaIzq: 25, rodillaDer: 26, tobilloIzq: 27, tobilloDer: 28,
} as const

export type Ejercicio = 'sentadilla' | 'brazos'

// Puntos que deben verse para que la medición cuente
export const NECESARIOS: Record<Ejercicio, number[]> = {
  sentadilla: [P.hombroIzq, P.hombroDer, P.caderaIzq, P.caderaDer, P.rodillaIzq, P.rodillaDer, P.tobilloIzq, P.tobilloDer],
  brazos: [P.hombroIzq, P.hombroDer, P.codoIzq, P.codoDer, P.munecaIzq, P.munecaDer, P.caderaIzq, P.caderaDer],
}

const VISIBILIDAD_MINIMA = 0.6

export function cuerpoVisible(lm: NormalizedLandmark[], ejercicio: Ejercicio): boolean {
  return NECESARIOS[ejercicio].every((i) => {
    const p = lm[i]
    return p && (p.visibility ?? 0) >= VISIBILIDAD_MINIMA && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1
  })
}

// Ángulo en el punto b (grados) entre los segmentos b→a y b→c. aspecto = ancho/alto del video.
export function angulo(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark, aspecto = 1): number {
  const v1 = { x: (a.x - b.x) * aspecto, y: a.y - b.y }
  const v2 = { x: (c.x - b.x) * aspecto, y: c.y - b.y }
  const cos = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

// Sentadilla: ángulo de rodilla (cadera → rodilla → tobillo); ~175° de pie, ~90° abajo
export function anguloRodilla(lm: NormalizedLandmark[], aspecto: number) {
  const izq = angulo(lm[P.caderaIzq], lm[P.rodillaIzq], lm[P.tobilloIzq], aspecto)
  const der = angulo(lm[P.caderaDer], lm[P.rodillaDer], lm[P.tobilloDer], aspecto)
  return { izq, der, prom: (izq + der) / 2 }
}

// Elevación de brazos: ángulo del hombro (cadera → hombro → muñeca); ~15° abajo, ~170° arriba
export function anguloHombro(lm: NormalizedLandmark[], aspecto: number) {
  const izq = angulo(lm[P.caderaIzq], lm[P.hombroIzq], lm[P.munecaIzq], aspecto)
  const der = angulo(lm[P.caderaDer], lm[P.hombroDer], lm[P.munecaDer], aspecto)
  return { izq, der, prom: (izq + der) / 2 }
}

// Líneas del esqueleto para dibujar sobre el video
export const HUESOS: [number, number][] = [
  [P.hombroIzq, P.hombroDer], [P.hombroIzq, P.codoIzq], [P.codoIzq, P.munecaIzq], [P.hombroDer, P.codoDer], [P.codoDer, P.munecaDer],
  [P.hombroIzq, P.caderaIzq], [P.hombroDer, P.caderaDer], [P.caderaIzq, P.caderaDer],
  [P.caderaIzq, P.rodillaIzq], [P.rodillaIzq, P.tobilloIzq], [P.caderaDer, P.rodillaDer], [P.rodillaDer, P.tobilloDer],
]
