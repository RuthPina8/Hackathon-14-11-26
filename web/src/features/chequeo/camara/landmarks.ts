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
  const m = ancho * 0.15
  return [
    caja('FRENTE', cara[FRENTE].x, cara[FRENTE].y, ancho * 0.36, ancho * 0.11 * aspecto),
    caja('MEJILLA', cara[MEJILLA_A].x, cara[MEJILLA_A].y, m, m * aspecto),
    caja('MEJILLA', cara[MEJILLA_B].x, cara[MEJILLA_B].y, m, m * aspecto),
  ]
}
