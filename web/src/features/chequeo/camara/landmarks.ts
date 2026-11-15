import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

// Zona de la cara de donde se saca el color de la piel, en coordenadas de 0 a 1
export type Roi = { nombre: 'FRENTE' | 'MEJILLA'; x: number; y: number; w: number; h: number }

// Índices de MediaPipe Face Mesh
const LADO_IZQ = 234
const LADO_DER = 454
const FRENTE = 151
const MEJILLA_A = 50
const MEJILLA_B = 280
const NARIZ = 1

export const PUNTO_NARIZ = NARIZ

// aspecto = ancho / alto del video, para que las cajas salgan cuadradas en pixeles
export function calcularRois(cara: NormalizedLandmark[], aspecto: number): Roi[] {
  const ancho = Math.abs(cara[LADO_DER].x - cara[LADO_IZQ].x)
  const caja = (nombre: Roi['nombre'], cx: number, cy: number, w: number, h: number): Roi => ({
    nombre,
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
  })
  // Zonas amplias: más pixeles de piel = menos ruido (el filtro de piel quita lo que no es piel)
  const m = ancho * 0.21
  return [
    caja('FRENTE', cara[FRENTE].x, cara[FRENTE].y - ancho * 0.02, ancho * 0.5, ancho * 0.15 * aspecto),
    caja('MEJILLA', cara[MEJILLA_A].x, cara[MEJILLA_A].y, m, m * aspecto),
    caja('MEJILLA', cara[MEJILLA_B].x, cara[MEJILLA_B].y, m, m * aspecto),
  ]
}

// Caja que rodea toda la cara, de 0 a 1
export function cajaCara(cara: NormalizedLandmark[]) {
  let x0 = 1
  let y0 = 1
  let x1 = 0
  let y1 = 0
  for (const p of cara) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// Suaviza las zonas entre cuadros para que no tiemblen (alfa más alto = sigue más rápido)
export function suavizarRois(anteriores: Roi[] | null, nuevas: Roi[], alfa = 0.35): Roi[] {
  if (!anteriores || anteriores.length !== nuevas.length) return nuevas
  return nuevas.map((n, i) => {
    const a = anteriores[i]
    return {
      nombre: n.nombre,
      x: a.x + (n.x - a.x) * alfa,
      y: a.y + (n.y - a.y) * alfa,
      w: a.w + (n.w - a.w) * alfa,
      h: a.h + (n.h - a.h) * alfa,
    }
  })
}
