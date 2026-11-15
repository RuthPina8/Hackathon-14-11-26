import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { headYaw } from '../../../lib/faceLandmarker'

// Revisión de cada cuadro antes de usarlo: encuadre, pose y luz.
// Un problema "bloquea" cuando ese cuadro no debe contar para la medición (el reloj se detiene);
// un "aviso" deja contar el cuadro pero le dice al astronauta cómo mejorar la señal.

export type Problema =
  | 'imagen_negra' | 'sin_cara' | 'otra_persona' | 'fuera_cuadro' | 'lejos' | 'cerca' | 'de_lado'
  | 'cabeza_abajo' | 'movimiento' | 'tapado' | 'poca_luz' | 'mucha_luz' | 'contraluz' | 'luz_lateral'
  | 'luz_inestable' | 'camara_lenta'

export const MENSAJES: Record<Problema, { texto: string; bloquea: boolean }> = {
  imagen_negra: { texto: 'The camera is sending a black image: make sure it isn’t covered or pick another camera', bloquea: true },
  sin_cara: { texto: 'I can’t find your face, make sure it’s fully visible in the center', bloquea: true },
  fuera_cuadro: { texto: 'Part of your face is out of frame, center yourself', bloquea: true },
  lejos: { texto: 'You’re too far, move closer until your face fills the oval', bloquea: true },
  cerca: { texto: 'You’re too close, move back a little', bloquea: true },
  de_lado: { texto: 'Look straight at the camera', bloquea: true },
  tapado: { texto: 'Something is covering your forehead or cheeks (hair, hand), clear them', bloquea: true },
  movimiento: { texto: 'Sudden movement, those frames don’t count', bloquea: true },
  otra_persona: { texto: 'Someone else is in frame: I only measure the closest face', bloquea: false },
  cabeza_abajo: { texto: 'Look up a little toward the camera, looking down reads as closed eyes', bloquea: false },
  poca_luz: { texto: 'It’s too dark, move closer to a lamp or window in front of you', bloquea: false },
  mucha_luz: { texto: 'Too much direct light on your face, your skin looks washed out', bloquea: false },
  contraluz: { texto: 'There’s a light behind you, move it in front of you', bloquea: false },
  luz_lateral: { texto: 'Light is coming from one side only, light your face from the front', bloquea: false },
  luz_inestable: { texto: 'The light keeps changing (screen, flickering lamp), find a steady light', bloquea: false },
  camara_lenta: { texto: 'The camera is slow, close other apps using it', bloquea: false },
}

// Orden en que se muestran: primero lo que impide medir
export const PRIORIDAD: Problema[] = [
  'imagen_negra', 'sin_cara', 'fuera_cuadro', 'lejos', 'cerca', 'de_lado', 'tapado', 'movimiento',
  'contraluz', 'poca_luz', 'mucha_luz', 'luz_lateral', 'luz_inestable', 'cabeza_abajo', 'otra_persona', 'camara_lenta',
]

export function principal(problemas: Set<Problema>): Problema | null {
  for (const p of PRIORIDAD) if (problemas.has(p)) return p
  return null
}

export const bloquea = (problemas: Set<Problema>) => [...problemas].some((p) => MENSAJES[p].bloquea)

// ---------- encuadre y pose ----------

// Inclinación vertical: dónde cae la nariz entre los ojos y la barbilla (~0.45 de frente)
export function headPitch(lm: NormalizedLandmark[]): number {
  const ojos = (lm[33].y + lm[263].y) / 2
  const barbilla = lm[152].y
  return (lm[1].y - ojos) / ((barbilla - ojos) || 1)
}

export function revisarEncuadre(lm: NormalizedLandmark[], pitchNormal: number | null): Problema[] {
  const out: Problema[] = []
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  for (const p of lm) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  const ancho = Math.abs(lm[454].x - lm[234].x)
  if (x0 < -0.02 || y0 < -0.02 || x1 > 1.02 || y1 > 1.02) out.push('fuera_cuadro')
  if (ancho < 0.2) out.push('lejos')
  if (ancho > 0.72) out.push('cerca')
  if (Math.abs(headYaw(lm)) > 0.2) out.push('de_lado')
  // La inclinación se compara con la tuya de los primeros segundos (cada quien pone la cámara distinto)
  const pitch = headPitch(lm)
  if (pitchNormal !== null && pitch - pitchNormal < -0.12) out.push('cabeza_abajo')
  return out
}

// ---------- luz ----------

export type Luz = {
  cara: number // brillo medio de la piel (0 a 255)
  fondo: number // brillo del resto del cuadro
  izquierda: number
  derecha: number
  saturada: number // fracción de pixeles de la cara quemados (> 245)
  cuadro: number // brillo de todo el cuadro
}

const LUMA = (r: number, g: number, b: number) => (r * 77 + g * 150 + b * 29) >> 8

// Mide la luz con una copia pequeña del cuadro (barato: 96 x 72 pixeles)
export function medirLuz(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, caja: { x: number; y: number; w: number; h: number } | null): Luz | null {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  if (!video.videoWidth) return null
  ctx.drawImage(video, 0, 0, W, H)
  const d = ctx.getImageData(0, 0, W, H).data
  let total = 0
  let sc = 0, nc = 0, sf = 0, nf = 0, si = 0, ni = 0, sd = 0, nd = 0, sat = 0
  const cx0 = caja ? Math.floor(caja.x * W) : -1
  const cx1 = caja ? Math.ceil((caja.x + caja.w) * W) : -1
  const cy0 = caja ? Math.floor(caja.y * H) : -1
  const cy1 = caja ? Math.ceil((caja.y + caja.h) * H) : -1
  const mitad = (cx0 + cx1) / 2
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const l = LUMA(d[i], d[i + 1], d[i + 2])
      total += l
      const enCara = caja && x >= cx0 && x < cx1 && y >= cy0 && y < cy1
      if (enCara) {
        sc += l; nc++
        if (l > 245) sat++
        // Solo la franja media de la cara para comparar lados (sin pelo ni barbilla)
        if (y > cy0 + (cy1 - cy0) * 0.3 && y < cy0 + (cy1 - cy0) * 0.75) {
          if (x < mitad) { si += l; ni++ } else { sd += l; nd++ }
        }
      } else {
        sf += l; nf++
      }
    }
  }
  return {
    cara: nc ? sc / nc : 0,
    fondo: nf ? sf / nf : 0,
    izquierda: ni ? si / ni : 0,
    derecha: nd ? sd / nd : 0,
    saturada: nc ? sat / nc : 0,
    cuadro: total / (W * H),
  }
}

// historial: brillo de la cara de los últimos ~3 s (una muestra cada 250 ms)
export function revisarLuz(l: Luz, historial: number[]): Problema[] {
  const out: Problema[] = []
  if (l.cuadro < 6) return ['imagen_negra']
  if (l.cara > 0) {
    if (l.cara < 70) out.push('poca_luz')
    if (l.saturada > 0.12 || l.cara > 215) out.push('mucha_luz')
    if (l.fondo > l.cara * 1.45 && l.fondo > 110) out.push('contraluz')
    const lados = Math.max(l.izquierda, l.derecha) / (Math.min(l.izquierda, l.derecha) || 1)
    if (lados > 1.7) out.push('luz_lateral')
  }
  if (historial.length >= 8) {
    const media = historial.reduce((a, b) => a + b, 0) / historial.length
    const sd = Math.sqrt(historial.reduce((a, b) => a + (b - media) ** 2, 0) / historial.length)
    // Más de 4% de variación en 2 s es más que el pulso (el pulso cambia el color < 1%)
    if (media > 0 && sd / media > 0.04) out.push('luz_inestable')
  }
  return out
}
