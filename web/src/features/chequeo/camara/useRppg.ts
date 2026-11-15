import { useCallback, useEffect, useRef, useState } from 'react'
import type { Roi } from './landmarks'

// rPPG: el ritmo cardiaco a partir de los cambios de color de la piel
const FS = 30 // la señal se remuestrea a 30 cuadros por segundo
const VENTANA_VIVO_MS = 20_000 // en vivo se analizan los últimos 20 segundos
const MIN_MS = 8_000 // con menos de 8 segundos todavía no hay ritmo confiable
const BUFFER_MS = 50_000 // se guardan 50 segundos para el cálculo final
const BPM_MIN = 45
const BPM_MAX = 180
const PASO_BPM = 0.5
// Calibrado con pruebas reales contra Apple Watch: el ruido puro queda abajo de 0.07
export const CONFIANZA_BUENA = 0.2 // desde aquí el ritmo se muestra normal
export const CONFIANZA_MINIMA = 0.12 // entre esta y la buena se muestra en gris como "baja confianza"; abajo no se muestra

export type MuestraColor = { t: number; r: number; g: number; b: number }
export type Estimacion = { bpm: number; confianza: number }

const promedio = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1)
const desviacion = (a: number[]) => {
  const m = promedio(a)
  return Math.sqrt(promedio(a.map((v) => (v - m) ** 2)))
}

// Filtro de piel en YCbCr: deja fuera cejas, pelo, ojos y fondo
function esPiel(r: number, g: number, b: number) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127
}

// Las cámaras no mandan cuadros a ritmo exacto, así que se interpola a 30 por segundo
function remuestrear(m: MuestraColor[]) {
  const t0 = m[0].t
  const n = Math.floor(((m[m.length - 1].t - t0) / 1000) * FS)
  const r: number[] = []
  const g: number[] = []
  const b: number[] = []
  let j = 0
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / FS
    while (j < m.length - 2 && m[j + 1].t < t) j++
    const a = m[j]
    const c = m[j + 1]
    const k = Math.min(1, Math.max(0, (t - a.t) / (c.t - a.t || 1)))
    r.push(a.r + (c.r - a.r) * k)
    g.push(a.g + (c.g - a.g) * k)
    b.push(a.b + (c.b - a.b) * k)
  }
  return { r, g, b }
}

// Algoritmo POS (Wang et al., 2017): combina los 3 colores para quitar cambios de luz y movimiento
function pos(r: number[], g: number[], b: number[]) {
  const n = r.length
  const l = Math.round(1.6 * FS)
  const h = new Array<number>(n).fill(0)
  for (let i = 0; i + l <= n; i++) {
    const mr = promedio(r.slice(i, i + l))
    const mg = promedio(g.slice(i, i + l))
    const mb = promedio(b.slice(i, i + l))
    const s1: number[] = []
    const s2: number[] = []
    for (let k = i; k < i + l; k++) {
      const rn = r[k] / mr
      const gn = g[k] / mg
      const bn = b[k] / mb
      s1.push(gn - bn)
      s2.push(gn + bn - 2 * rn)
    }
    const alfa = desviacion(s1) / (desviacion(s2) || 1)
    const bloque = s1.map((v, k) => v + alfa * s2[k])
    const mh = promedio(bloque)
    bloque.forEach((v, k) => {
      h[i + k] += v - mh
    })
  }
  return h
}

// Limpieza: quita la tendencia lenta (respiración, cambios de luz) y suaviza el ruido rápido
function filtrar(h: number[]) {
  const medio = Math.round(FS / 2)
  const sinTendencia = h.map((v, i) => v - promedio(h.slice(Math.max(0, i - medio), i + medio + 1)))
  return sinTendencia.map((_, i) => promedio(sinTendencia.slice(Math.max(0, i - 1), i + 2)))
}

// Potencia de la señal en una frecuencia (en lpm), con transformada de Fourier directa
function potencia(x: number[], bpm: number) {
  const f = bpm / 60
  let re = 0
  let im = 0
  for (let i = 0; i < x.length; i++) {
    const ang = (2 * Math.PI * f * i) / FS
    re += x[i] * Math.cos(ang)
    im += x[i] * Math.sin(ang)
  }
  return re * re + im * im
}

// Busca la frecuencia dominante entre 45 y 180 lpm con una ventana de Hann
// y calcula la SNR como en de Haan y Jeanne (2013): energía alrededor del pulso y de su
// armónico (el doble de frecuencia) contra el resto. El latido real deja energía en ambos, el ruido no.
function estimar(h: number[]): { bpm: number; snrDb: number } {
  const n = h.length
  const x = h.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))))
  const bpms: number[] = []
  const potencias: number[] = []
  for (let bpm = BPM_MIN; bpm <= BPM_MAX; bpm += PASO_BPM) {
    bpms.push(bpm)
    potencias.push(potencia(x, bpm))
  }
  let mejor = 0
  potencias.forEach((p, i) => {
    if (p > potencias[mejor]) mejor = i
  })
  const bpm = bpms[mejor]
  let senal = 0
  let ruido = 0
  potencias.forEach((p, i) => {
    const cercaPulso = Math.abs(bpms[i] - bpm) <= 6
    const cercaArmonico = Math.abs(bpms[i] - 2 * bpm) <= 6
    if (cercaPulso || cercaArmonico) senal += p
    else ruido += p
  })
  // Si el armónico cae arriba de 180 lpm, se calcula aparte
  for (let f = 2 * bpm - 6; f <= 2 * bpm + 6; f += PASO_BPM) {
    if (f > BPM_MAX) senal += potencia(x, f)
  }
  return { bpm: Math.round(bpm), snrDb: 10 * Math.log10(senal / (ruido || 1e-9)) }
}

type Analisis = Estimacion & { onda: number[] }

function analizar(lista: MuestraColor[], ventanaMs: number): Analisis | null {
  if (lista.length < 2) return null
  const fin = lista[lista.length - 1].t
  const ventana = lista.filter((m) => m.t >= fin - ventanaMs)
  if (fin - ventana[0].t < MIN_MS) return null
  const { r, g, b } = remuestrear(ventana)
  const h = filtrar(pos(r, g, b))
  const principal = estimar(h)

  // Consistencia: se repite el cálculo en pedazos de 12 s cada 4 s.
  // Un pulso real da casi el mismo ritmo en todos, el ruido brinca.
  const largo = 12 * FS
  const paso = 4 * FS
  const parciales: number[] = []
  for (let i = 0; i + largo <= h.length; i += paso) parciales.push(estimar(h.slice(i, i + largo)).bpm)
  const consistencia = parciales.length
    ? parciales.filter((v) => Math.abs(v - principal.bpm) <= 6).length / parciales.length
    : 0.5

  // SNR: -6 dB o menos es ruido, +6 dB o más es un pulso muy limpio
  const porSnr = Math.min(1, Math.max(0, (principal.snrDb + 6) / 12))
  const confianza = porSnr * consistencia

  const ultimos = h.slice(-4 * FS)
  const max = Math.max(...ultimos.map(Math.abs)) || 1
  return { bpm: principal.bpm, confianza, onda: ultimos.map((v) => v / max) }
}

export function useRppg() {
  const muestras = useRef<MuestraColor[]>([])
  const historial = useRef<number[]>([])
  const lienzo = useRef<CanvasRenderingContext2D | null>(null)
  const brilloActual = useRef<number | null>(null)
  const [bpm, setBpm] = useState<number | null>(null)
  const [confianza, setConfianza] = useState(0)
  const [onda, setOnda] = useState<number[]>([])
  const [brillo, setBrillo] = useState<number | null>(null)

  // Se llama en cada cuadro con el tiempo real del cuadro (ms): saca el color de la piel
  const registrar = useCallback((video: HTMLVideoElement, rois: Roi[], t: number) => {
    const W = video.videoWidth
    const H = video.videoHeight
    if (!W || !H) return
    if (!lienzo.current || lienzo.current.canvas.width !== W) {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      lienzo.current = c.getContext('2d', { willReadFrequently: true })
    }
    const ctx = lienzo.current
    if (!ctx) return
    // Resolución completa: más pixeles de piel = menos ruido
    ctx.drawImage(video, 0, 0, W, H)

    let sr = 0
    let sg = 0
    let sb = 0
    let n = 0
    for (const roi of rois) {
      const x0 = Math.max(0, Math.floor(roi.x * W))
      const y0 = Math.max(0, Math.floor(roi.y * H))
      const x1 = Math.min(W, Math.ceil((roi.x + roi.w) * W))
      const y1 = Math.min(H, Math.ceil((roi.y + roi.h) * H))
      if (x1 - x0 < 2 || y1 - y0 < 2) continue
      const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data
      for (let i = 0; i < d.length; i += 4) {
        if (!esPiel(d[i], d[i + 1], d[i + 2])) continue
        sr += d[i]
        sg += d[i + 1]
        sb += d[i + 2]
        n++
      }
    }
    if (n < 50) return

    const ultima = muestras.current[muestras.current.length - 1]
    if (ultima && t <= ultima.t) return
    muestras.current.push({ t, r: sr / n, g: sg / n, b: sb / n })
    brilloActual.current = (sr + sg + sb) / (3 * n)
    const limite = t - BUFFER_MS
    while (muestras.current.length && muestras.current[0].t < limite) muestras.current.shift()
  }, [])

  // Cada segundo recalcula el ritmo en vivo con los últimos 20 segundos
  useEffect(() => {
    const id = setInterval(() => {
      setBrillo(brilloActual.current)
      const res = analizar(muestras.current, VENTANA_VIVO_MS)
      if (!res) return
      setConfianza(res.confianza)
      setOnda(res.onda)
      if (res.confianza < CONFIANZA_MINIMA) return
      // Mediana de las últimas 5 estimaciones buenas para que el número no brinque
      historial.current = [...historial.current.slice(-4), res.bpm]
      const orden = [...historial.current].sort((a, c) => a - c)
      setBpm(orden[Math.floor(orden.length / 2)])
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Cálculo final: se revisan tramos de 20 s cada 5 s dentro de la medición
  // y se queda el de mejor calidad, así los ratos con mala señal no arruinan el resultado
  const estimarFinal = useCallback((): Estimacion | null => {
    const lista = muestras.current
    if (lista.length < 2) return null
    const fin = lista[lista.length - 1].t
    const inicio = lista[0].t
    let mejor: Estimacion | null = null
    for (let corte = fin; corte - VENTANA_VIVO_MS >= inicio - 1; corte -= 5000) {
      const tramo = lista.filter((m) => m.t <= corte)
      const res = analizar(tramo, VENTANA_VIVO_MS)
      if (res && (!mejor || res.confianza > mejor.confianza)) mejor = { bpm: res.bpm, confianza: res.confianza }
    }
    // Medición corta (menos de 20 s útiles): se usa lo que haya
    if (!mejor) {
      const res = analizar(lista, BUFFER_MS)
      if (res) mejor = { bpm: res.bpm, confianza: res.confianza }
    }
    return mejor
  }, [])

  const reiniciar = useCallback(() => {
    muestras.current = []
    historial.current = []
    setBpm(null)
    setConfianza(0)
    setOnda([])
  }, [])

  // Copia de la señal cruda, para mandarla al back cuando esté su endpoint
  const ventana = useCallback(() => [...muestras.current], [])

  return { bpm, confianza, onda, brillo, registrar, reiniciar, estimarFinal, ventana }
}
