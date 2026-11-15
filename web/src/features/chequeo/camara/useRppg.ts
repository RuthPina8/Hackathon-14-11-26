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

// z: color de cada zona por separado (frente, mejilla izquierda, mejilla derecha)
export type MuestraColor = { t: number; r: number; g: number; b: number; n?: number; z?: ([number, number, number] | null)[] }
type MuestraCara = { t: number; v: number }
export type Estimacion = { bpm: number; confianza: number; zona?: string }
// Señales extra del cálculo final, experimentales: se guardan solo si la señal lo permite
export type Final = Estimacion & {
  rmssd: number | null // variabilidad del ritmo (VFC) en ms
  confianzaVfc: number
  respRpm: number | null // respiraciones por minuto
  confianzaResp: number
  fuenteResp: string | null // 'color' o 'movimiento'
}

const promedio = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1)
const desviacion = (a: number[]) => {
  const m = promedio(a)
  return Math.sqrt(promedio(a.map((v) => (v - m) ** 2)))
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

// Deja solo la banda del pulso (su frecuencia ± 0.5 Hz). Conserva las variaciones de latido a
// latido que causa la respiración y quita el ruido que mueve los picos de lugar. Es conservador:
// con poco ruido subestima un poco la VFC alta, pero con ruido no la infla (que es lo peligroso)
function bandaPulso(h: number[], f: number) {
  const n = h.length
  const media = promedio(h)
  const y = new Array<number>(n).fill(0)
  const k0 = Math.max(1, Math.floor(((f - 0.5) * n) / FS))
  const k1 = Math.ceil(((f + 0.5) * n) / FS)
  for (let k = k0; k <= k1; k++) {
    let re = 0
    let im = 0
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * k * i) / n
      re += (h[i] - media) * Math.cos(ang)
      im -= (h[i] - media) * Math.sin(ang)
    }
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * k * i) / n
      y[i] += (2 / n) * (re * Math.cos(ang) - im * Math.sin(ang))
    }
  }
  return y
}

// VFC (RMSSD): se buscan los latidos uno por uno en la onda de la banda del pulso y se mide
// cuánto cambia el tiempo entre latidos seguidos. La cámara va a 30 cuadros por segundo, así
// que cada pico se afina con una parábola para no quedarse con saltos de 33 ms
function vfc(h: number[], bpm: number): { rmssd: number; proporcion: number } | null {
  const periodo = (60 / bpm) * FS
  const x = bandaPulso(h, bpm / 60)
  const distanciaMin = Math.floor(periodo * 0.6)
  const picos: number[] = []
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] <= 0 || x[i] < x[i - 1] || x[i] <= x[i + 1]) continue
    const ultimo = picos[picos.length - 1]
    if (ultimo !== undefined && i - ultimo < distanciaMin) {
      if (x[i] > x[ultimo]) picos[picos.length - 1] = i
      continue
    }
    picos.push(i)
  }
  const tiempos = picos.map((i) => {
    const a = x[i - 1]
    const b = x[i]
    const c = x[i + 1]
    const den = a - 2 * b + c
    const ajuste = den ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0
    return ((i + ajuste) * 1000) / FS
  })
  const ibi = tiempos.slice(1).map((t, k) => t - tiempos[k])
  if (ibi.length < 10) return null
  // Un intervalo que se aleja más de 25% del esperado es un latido perdido o un pico de ruido
  const esperado = 60_000 / bpm
  const valido = ibi.map((v) => Math.abs(v - esperado) <= esperado * 0.25)
  const difs: number[] = []
  for (let k = 1; k < ibi.length; k++) if (valido[k] && valido[k - 1]) difs.push(ibi[k] - ibi[k - 1])
  if (difs.length < 8) return null
  const rmssd = Math.sqrt(promedio(difs.map((d) => d * d)))
  if (rmssd < 5 || rmssd > 200) return null
  return { rmssd: Math.round(rmssd), proporcion: valido.filter(Boolean).length / ibi.length }
}

// Frecuencia dominante entre 6 y 30 respiraciones por minuto de una serie lenta (5 por segundo)
function frecuenciaRespiracion(y0: number[]): { rpm: number; confianza: number } | null {
  const fs = 5
  if (y0.length < 25 * fs) return null
  const tendencia = 10 * fs // quita cambios más lentos que 10 s (luz, acomodarse, flotar)
  const y = y0.map((v, i) => v - promedio(y0.slice(Math.max(0, i - tendencia / 2), i + tendencia / 2 + 1)))
  const n = y.length
  const x = y.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))))
  const rpms: number[] = []
  const pot: number[] = []
  for (let rpm = 6; rpm <= 30; rpm += 0.5) {
    const f = rpm / 60
    let re = 0
    let im = 0
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * f * i) / fs
      re += x[i] * Math.cos(ang)
      im += x[i] * Math.sin(ang)
    }
    rpms.push(rpm)
    pot.push(re * re + im * im)
  }
  let mejor = 0
  pot.forEach((p, i) => {
    if (p > pot[mejor]) mejor = i
  })
  let senal = 0
  let ruido = 0
  pot.forEach((p, i) => {
    if (Math.abs(rpms[i] - rpms[mejor]) <= 2) senal += p
    else ruido += p
  })
  const snrDb = 10 * Math.log10(senal / (ruido || 1e-9))
  return { rpm: Math.round(rpms[mejor]), confianza: Math.min(1, Math.max(0, (snrDb + 3) / 9)) }
}

// Pasa una serie con tiempos irregulares a 5 muestras por segundo
function a5hz(t: number[], v: number[]) {
  const salida: number[] = []
  let j = 0
  for (let ti = t[0]; ti <= t[t.length - 1]; ti += 200) {
    while (j < t.length - 2 && t[j + 1] < ti) j++
    const k = Math.min(1, Math.max(0, (ti - t[j]) / (t[j + 1] - t[j] || 1)))
    salida.push(v[j] + (v[j + 1] - v[j]) * k)
  }
  return salida
}

// Respiración, dos fuentes y se queda la más clara:
// 1. Color: al respirar cambia poco a poco el volumen de sangre en la piel (onda lenta del verde)
// 2. Movimiento: la cara sube y baja un poco con cada respiración. No depende de la luz
const UMBRAL_RESP = 0.25
function respiracion(lista: MuestraColor[], cara: MuestraCara[]): { rpm: number; confianza: number; fuente: string } | null {
  const candidatos: { rpm: number; confianza: number; fuente: string }[] = []
  if (lista.length > 2 && lista[lista.length - 1].t - lista[0].t >= 25_000) {
    const mg = promedio(lista.map((m) => m.g)) || 1
    const r = frecuenciaRespiracion(a5hz(lista.map((m) => m.t), lista.map((m) => m.g / mg - 1)))
    if (r) candidatos.push({ ...r, fuente: 'color' })
  }
  if (cara.length > 2 && cara[cara.length - 1].t - cara[0].t >= 25_000) {
    const r = frecuenciaRespiracion(a5hz(cara.map((m) => m.t), cara.map((m) => m.v)))
    if (r) candidatos.push({ ...r, fuente: 'movimiento' })
  }
  const mejor = candidatos.sort((a, b) => b.confianza - a.confianza)[0]
  return mejor && mejor.confianza >= UMBRAL_RESP ? mejor : null
}

type Analisis = Estimacion & { onda: number[]; h: number[] }

function analizar(lista: MuestraColor[], ventanaMs: number): Analisis | null {
  if (lista.length < 2) return null
  const fin = lista[lista.length - 1].t
  const ventana = lista.filter((m) => m.t >= fin - ventanaMs)
  if (fin - ventana[0].t < MIN_MS) return null
  // Huecos: si faltan datos por más de medio segundo, la interpolación ensucia la señal
  let huecoMax = 0
  for (let i = 1; i < ventana.length; i++) huecoMax = Math.max(huecoMax, ventana[i].t - ventana[i - 1].t)
  const penalizacionHuecos = huecoMax > 1000 ? 0.4 : huecoMax > 500 ? 0.7 : 1
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
  const confianza = porSnr * consistencia * penalizacionHuecos

  const ultimos = h.slice(-4 * FS)
  const max = Math.max(...ultimos.map(Math.abs)) || 1
  return { bpm: principal.bpm, confianza, onda: ultimos.map((v) => v / max), h }
}

// Cada zona de la cara por separado y todas juntas. Con luz de lado o de arriba una zona puede
// quedar en sombra y ensuciar el promedio, así que se usa la que dé la señal más limpia
const ZONAS: { nombre: string; indices: number[] }[] = [
  { nombre: 'frente', indices: [0] },
  { nombre: 'mejillas', indices: [1, 2] },
  { nombre: 'mejilla izquierda', indices: [1] },
  { nombre: 'mejilla derecha', indices: [2] },
]
function porZona(lista: MuestraColor[], indices: number[]): MuestraColor[] {
  const salida: MuestraColor[] = []
  for (const m of lista) {
    const zs = indices.map((i) => m.z?.[i]).filter((z): z is [number, number, number] => Boolean(z))
    if (zs.length !== indices.length) continue
    salida.push({ t: m.t, r: promedio(zs.map((z) => z[0])), g: promedio(zs.map((z) => z[1])), b: promedio(zs.map((z) => z[2])) })
  }
  return salida
}
function analizarMejor(lista: MuestraColor[], ventanaMs: number): Analisis | null {
  let mejor = analizar(lista, ventanaMs)
  if (mejor) mejor.zona = 'toda la cara'
  for (const zona of ZONAS) {
    const res = analizar(porZona(lista, zona.indices), ventanaMs)
    // Una zona sola tiene que ganar con claridad para preferirla sobre el promedio
    if (res && (!mejor || res.confianza > mejor.confianza * 1.1)) mejor = { ...res, zona: zona.nombre }
  }
  return mejor
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
  const [zona, setZona] = useState<string | null>(null)
  const [respVivo, setRespVivo] = useState<{ rpm: number; confianza: number; fuente: string } | null>(null)
  const cara = useRef<MuestraCara[]>([])
  const segundos = useRef(0)

  // Posición vertical de la cara (relativa a su tamaño) en cada cuadro de MediaPipe, para la respiración
  const registrarCara = useCallback((t: number, v: number) => {
    const ultima = cara.current[cara.current.length - 1]
    if (ultima && t <= ultima.t) return
    cara.current.push({ t, v })
    while (cara.current.length && cara.current[0].t < t - BUFFER_MS) cara.current.shift()
  }, [])

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

    // Filtro de piel adaptativo: en cada zona se calcula el brillo típico (mediana) y solo se
    // usan los pixeles parecidos. Deja fuera cejas, pelo, sombras y brillos sin parpadear,
    // aunque cambie la luz (un corte fijo de color hacía brincar el conteo de pixeles)
    let sr = 0
    let sg = 0
    let sb = 0
    let n = 0
    const zonas: ([number, number, number] | null)[] = []
    for (const roi of rois) {
      let zr = 0
      let zg = 0
      let zb = 0
      let zn = 0
      const x0 = Math.max(0, Math.floor(roi.x * W))
      const y0 = Math.max(0, Math.floor(roi.y * H))
      const x1 = Math.min(W, Math.ceil((roi.x + roi.w) * W))
      const y1 = Math.min(H, Math.ceil((roi.y + roi.h) * H))
      if (x1 - x0 < 2 || y1 - y0 < 2) {
        zonas.push(null)
        continue
      }
      const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data
      const histograma = new Uint32Array(256)
      const total = d.length / 4
      for (let i = 0; i < d.length; i += 4) histograma[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++
      let acumulado = 0
      let mediana = 0
      while (mediana < 255 && acumulado + histograma[mediana] < total / 2) acumulado += histograma[mediana++]
      const margen = Math.max(12, mediana * 0.18)
      for (let i = 0; i < d.length; i += 4) {
        const y = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8
        if (Math.abs(y - mediana) > margen || y > 245) continue
        zr += d[i]
        zg += d[i + 1]
        zb += d[i + 2]
        zn++
      }
      sr += zr
      sg += zg
      sb += zb
      n += zn
      zonas.push(zn >= 20 ? [zr / zn, zg / zn, zb / zn] : null)
    }
    if (n < 50) return

    const ultima = muestras.current[muestras.current.length - 1]
    if (ultima && t <= ultima.t) return
    muestras.current.push({ t, r: sr / n, g: sg / n, b: sb / n, n, z: zonas })
    brilloActual.current = (sr + sg + sb) / (3 * n)
    const limite = t - BUFFER_MS
    while (muestras.current.length && muestras.current[0].t < limite) muestras.current.shift()
  }, [])

  // Cada segundo recalcula el ritmo en vivo con los últimos 20 segundos
  useEffect(() => {
    const id = setInterval(() => {
      setBrillo(brilloActual.current)
      // La respiración es lenta: se recalcula cada 5 s
      if (++segundos.current % 5 === 0) setRespVivo(respiracion(muestras.current, cara.current))
      const res = analizarMejor(muestras.current, VENTANA_VIVO_MS)
      if (!res) return
      setZona(res.zona ?? null)
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
  // y se queda el de mejor calidad, así los ratos con mala señal no arruinan el resultado.
  // Con ese mismo tramo se calcula la VFC, y la respiración con toda la grabación
  const estimarFinal = useCallback((): Final | null => {
    const lista = muestras.current
    if (lista.length < 2) return null
    const fin = lista[lista.length - 1].t
    const inicio = lista[0].t
    let mejor: Analisis | null = null
    for (let corte = fin; corte - VENTANA_VIVO_MS >= inicio - 1; corte -= 5000) {
      const tramo = lista.filter((m) => m.t <= corte)
      const res = analizarMejor(tramo, VENTANA_VIVO_MS)
      if (res && (!mejor || res.confianza > mejor.confianza)) mejor = res
    }
    // Medición corta (menos de 20 s útiles): se usa lo que haya
    if (!mejor) mejor = analizarMejor(lista, BUFFER_MS)
    if (!mejor) return null

    // La VFC solo tiene sentido si el ritmo salió claro
    const v = mejor.confianza >= CONFIANZA_BUENA ? vfc(mejor.h, mejor.bpm) : null
    const respOk = respiracion(lista, cara.current)
    return {
      bpm: mejor.bpm,
      confianza: mejor.confianza,
      zona: mejor.zona,
      fuenteResp: respOk?.fuente ?? null,
      rmssd: v?.rmssd ?? null,
      confianzaVfc: v ? Number((mejor.confianza * v.proporcion).toFixed(2)) : 0,
      respRpm: respOk?.rpm ?? null,
      confianzaResp: respOk ? Number(respOk.confianza.toFixed(2)) : 0,
    }
  }, [])

  const reiniciar = useCallback(() => {
    muestras.current = []
    historial.current = []
    cara.current = []
    segundos.current = 0
    setZona(null)
    setRespVivo(null)
    setBpm(null)
    setConfianza(0)
    setOnda([])
  }, [])

  // Copia de la señal cruda, para mandarla al back cuando esté su endpoint
  const ventana = useCallback(() => [...muestras.current], [])

  return { bpm, confianza, onda, brillo, zona, respVivo, registrar, registrarCara, reiniciar, estimarFinal, ventana }
}
