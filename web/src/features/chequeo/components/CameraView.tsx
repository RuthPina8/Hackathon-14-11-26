import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import { useFaceLandmarker } from '../camara/useFaceLandmarker'
import { cajaCara, calcularRois, suavizarRois } from '../camara/landmarks'
import type { Roi } from '../camara/landmarks'
import { medirLuz, type Luz } from '../camara/calidad'

// Cámaras virtuales que suelen mandar imagen negra si su app no está abierta
const VIRTUALES = /droidcam|obs|virtual|manycam|snap camera|xsplit|iriun|epoccam|camo/i

type Camara = { id: string; nombre: string }

type Props = {
  // Se llama con cada análisis de MediaPipe. La cara principal (la más grande, la más cercana)
  // siempre va primero en el resultado; `caras` dice cuántas hay en cuadro.
  onResultado?: (resultado: FaceLandmarkerResult, tiempoMs: number, video: HTMLVideoElement, rois: Roi[] | null, caras: number) => void
  // Se llama en CADA cuadro de la cámara (30 por segundo), aunque MediaPipe vaya más lento,
  // con las últimas zonas de piel conocidas y el tiempo real del cuadro en ms
  onCuadro?: (video: HTMLVideoElement, rois: Roi[], tiempoMs: number) => void
  // Luz de la escena 4 veces por segundo (cara, fondo, lados, pixeles quemados)
  onLuz?: (luz: Luz) => void
  onListo?: (listo: boolean) => void
  // Mientras mide: fija exposición y balance de blancos (si la cámara lo permite) para que
  // los ajustes automáticos no cambien el color de la piel a mitad de la medición
  bloquearAjustes?: boolean
  mostrarRois?: boolean
  ovalo?: 'normal' | 'ok' | 'tenue' | 'alerta'
  children?: ReactNode
}

// Dibuja texto al derecho aunque el canvas esté volteado como espejo
function textoDerecho(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(-1, 1)
  ctx.fillText(texto, 0, 0)
  ctx.restore()
}

function mensajeError(e: unknown): string {
  const nombre = (e as { name?: string })?.name
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') return 'El navegador no tiene permiso para usar la cámara. Actívalo en el candado de la barra de direcciones y vuelve a intentar'
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No se encontró esa cámara. Conecta una o elige otra'
  if (nombre === 'NotReadableError' || nombre === 'AbortError') return 'La cámara está ocupada por otra aplicación (Zoom, Teams, OBS). Ciérrala y vuelve a intentar'
  return 'No se pudo abrir la cámara'
}

type Ajustes = MediaTrackCapabilities & { exposureMode?: string[]; whiteBalanceMode?: string[] }
type Valores = MediaTrackSettings & { exposureMode?: string; whiteBalanceMode?: string; exposureTime?: number; colorTemperature?: number }

export default function CameraView({ onResultado, onCuadro, onLuz, onListo, bloquearAjustes = false, mostrarRois = true, ovalo = 'normal', children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ovaloRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const { landmarker, estado, error } = useFaceLandmarker(2)
  const [camaras, setCamaras] = useState<Camara[]>([])
  const [camaraId, setCamaraId] = useState<string | null>(null)
  const [camaraLista, setCamaraLista] = useState(false)
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  const onResultadoRef = useRef(onResultado)
  const onCuadroRef = useRef(onCuadro)
  const onLuzRef = useRef(onLuz)
  const mostrarRoisRef = useRef(mostrarRois)
  const roisActuales = useRef<Roi[] | null>(null)
  const cajaActual = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  useEffect(() => {
    onResultadoRef.current = onResultado
    onCuadroRef.current = onCuadro
    onLuzRef.current = onLuz
    mostrarRoisRef.current = mostrarRois
  }, [onResultado, onCuadro, onLuz, mostrarRois])

  const listo = estado === 'listo' && camaraLista && !errorCamara
  useEffect(() => {
    onListo?.(listo)
  }, [listo, onListo])

  const reintentar = useCallback(() => {
    setCamaraLista(false)
    setErrorCamara(null)
    setCamaraId(null)
    setIntento((i) => i + 1)
  }, [])

  // 1. Pedir permiso y elegir la cámara real
  useEffect(() => {
    let cancelado = false
    async function buscarCamaras() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorCamara('Este navegador no da acceso a la cámara. Usa Chrome o Edge, y abre la app desde localhost o https')
        return
      }
      try {
        // Hay que pedir permiso primero para que el navegador diga los nombres de las cámaras
        const permiso = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        permiso.getTracks().forEach((t) => t.stop())
        const dispositivos = await navigator.mediaDevices.enumerateDevices()
        const lista = dispositivos
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({ id: d.deviceId, nombre: d.label || `Cámara ${i + 1}` }))
        if (cancelado) return
        setCamaras(lista)
        const guardada = (() => { try { return localStorage.getItem('astro_camara') } catch { return null } })()
        const real = lista.find((c) => c.id === guardada) ?? lista.find((c) => !VIRTUALES.test(c.nombre)) ?? lista[0]
        if (real) setCamaraId(real.id)
        else setErrorCamara('No se encontró ninguna cámara')
      } catch (e) {
        if (!cancelado) setErrorCamara(mensajeError(e))
      }
    }
    buscarCamaras()
    return () => {
      cancelado = true
    }
  }, [intento])

  // 2. Prender la cámara elegida
  useEffect(() => {
    if (!camaraId) return
    let cancelado = false
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({
        video: { deviceId: { exact: camaraId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      })
      .then((s) => {
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const track = s.getVideoTracks()[0]
        trackRef.current = track ?? null
        // Si la cámara se desconecta o el sistema la quita, se avisa en vez de quedarse congelado
        if (track) track.onended = () => { if (!cancelado) setErrorCamara('Se perdió la cámara (¿se desconectó?). Vuelve a conectarla e intenta de nuevo') }
        try { localStorage.setItem('astro_camara', camaraId) } catch { /* sin storage */ }
        const video = videoRef.current
        if (!video) return
        video.muted = true
        video.srcObject = s
        // Play a mano: si no, se queda congelado en el primer cuadro
        video.onloadedmetadata = () => {
          video
            .play()
            .then(() => {
              if (!cancelado) setCamaraLista(true)
            })
            .catch(() => setErrorCamara('El navegador no dejó reproducir el video de la cámara'))
        }
      })
      .catch((e) => { if (!cancelado) setErrorCamara(mensajeError(e)) })
    return () => {
      cancelado = true
      trackRef.current = null
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [camaraId])

  // 2b. Fijar exposición y balance de blancos mientras se mide (si la cámara lo soporta).
  // Con los valores actuales: la imagen no cambia, solo deja de reajustarse sola.
  useEffect(() => {
    const track = trackRef.current
    if (!track || !camaraLista || typeof track.getCapabilities !== 'function') return
    const caps = track.getCapabilities() as Ajustes
    const actual = track.getSettings() as Valores
    const fijar: Record<string, unknown> = {}
    if (bloquearAjustes) {
      if (caps.exposureMode?.includes('manual') && actual.exposureTime) Object.assign(fijar, { exposureMode: 'manual', exposureTime: actual.exposureTime })
      if (caps.whiteBalanceMode?.includes('manual') && actual.colorTemperature) Object.assign(fijar, { whiteBalanceMode: 'manual', colorTemperature: actual.colorTemperature })
    } else {
      if (caps.exposureMode?.includes('continuous') && actual.exposureMode === 'manual') fijar.exposureMode = 'continuous'
      if (caps.whiteBalanceMode?.includes('continuous') && actual.whiteBalanceMode === 'manual') fijar.whiteBalanceMode = 'continuous'
    }
    if (Object.keys(fijar).length) track.applyConstraints({ advanced: [fijar as MediaTrackConstraintSet] }).catch(() => { /* la cámara no lo permite */ })
  }, [bloquearAjustes, camaraLista])

  // 3. Detectar la cara en cada cuadro, dibujar puntos y zonas
  useEffect(() => {
    if (!landmarker || !camaraLista) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!video || !canvas || !ctx) return
    let frameId = 0
    let ultimoTiempo = -1
    let roisPrevias: Roi[] | null = null

    // El óvalo sigue la cara: se mueve con el astronauta en vez de pedirle que se quede fijo
    const moverOvalo = (caja: { x: number; y: number; w: number; h: number } | null) => {
      const el = ovaloRef.current
      if (!el) return
      if (!caja) {
        el.style.left = '29%'
        el.style.top = '15%'
        el.style.width = '42%'
        el.style.height = '70%'
        return
      }
      const margen = 0.12
      const w = caja.w * (1 + margen * 2)
      const h = caja.h * (1 + margen * 2)
      // El video está en espejo, por eso se voltea la x
      const x = 1 - (caja.x + caja.w) - caja.w * margen
      const y = caja.y - caja.h * margen
      el.style.left = `${(x * 100).toFixed(1)}%`
      el.style.top = `${(y * 100).toFixed(1)}%`
      el.style.width = `${(w * 100).toFixed(1)}%`
      el.style.height = `${(h * 100).toFixed(1)}%`
    }

    const loop = () => {
      if (video.readyState >= 2 && video.currentTime !== ultimoTiempo) {
        ultimoTiempo = video.currentTime
        const ahora = performance.now()
        let resultado: FaceLandmarkerResult
        try {
          resultado = landmarker.detectForVideo(video, ahora)
        } catch {
          frameId = requestAnimationFrame(loop)
          return
        }
        // La cara principal es la más grande (la más cercana); se pone primero
        const caras = resultado.faceLandmarks.length
        if (caras > 1) {
          const tam = resultado.faceLandmarks.map((c) => cajaCara(c).w)
          const i = tam.indexOf(Math.max(...tam))
          if (i > 0) {
            const mover = <T,>(a: T[]) => (a.length > i ? [a[i], ...a.filter((_, k) => k !== i)] : a)
            resultado = {
              ...resultado,
              faceLandmarks: mover(resultado.faceLandmarks),
              faceBlendshapes: mover(resultado.faceBlendshapes),
              facialTransformationMatrixes: mover(resultado.facialTransformationMatrixes ?? []),
            } as FaceLandmarkerResult
          }
        }
        const primera = resultado.faceLandmarks[0]
        roisPrevias = primera ? suavizarRois(roisPrevias, calcularRois(primera, video.videoWidth / video.videoHeight)) : null
        roisActuales.current = roisPrevias
        const caja = primera ? cajaCara(primera) : null
        cajaActual.current = caja
        moverOvalo(caja)
        onResultadoRef.current?.(resultado, ahora, video, roisPrevias, caras)

        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        const W = canvas.width
        const H = canvas.height
        ctx.clearRect(0, 0, W, H)
        if (primera) {
          // Malla ligera: uno de cada 5 puntos para que no tape la cara
          ctx.fillStyle = 'rgba(138, 217, 248, 0.7)'
          for (let i = 0; i < primera.length; i += 5) {
            ctx.beginPath()
            ctx.arc(primera[i].x * W, primera[i].y * H, 1.4, 0, Math.PI * 2)
            ctx.fill()
          }
          if (mostrarRoisRef.current) {
            ctx.font = '600 11px Inter, sans-serif'
            ctx.textAlign = 'center'
            for (const roi of roisPrevias ?? []) {
              const x = roi.x * W
              const y = roi.y * H
              const w = roi.w * W
              const h = roi.h * H
              ctx.fillStyle = 'rgba(61, 220, 151, 0.10)'
              ctx.fillRect(x, y, w, h)
              ctx.strokeStyle = '#3DDC97'
              ctx.lineWidth = 1.5
              ctx.strokeRect(x, y, w, h)
              ctx.fillStyle = '#8FF0C4'
              textoDerecho(ctx, roi.nombre, x + w / 2, roi.nombre === 'FRENTE' ? y - 6 : y + h + 14)
            }
          }
        }
      }
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [landmarker, camaraLista])

  // 4. Muestreo de color en cada cuadro que entrega la cámara (requestVideoFrameCallback)
  useEffect(() => {
    if (!camaraLista) return
    const video = videoRef.current
    if (!video || !('requestVideoFrameCallback' in video)) return
    let id = 0
    const cuadro = (_ahora: number, meta: VideoFrameCallbackMetadata) => {
      // Se avisa de TODOS los cuadros (sin cara, rois vacías): así se mide el ritmo real de la cámara
      onCuadroRef.current?.(video, roisActuales.current ?? [], meta.mediaTime * 1000)
      id = video.requestVideoFrameCallback(cuadro)
    }
    id = video.requestVideoFrameCallback(cuadro)
    return () => video.cancelVideoFrameCallback(id)
  }, [camaraLista])

  // 5. Luz de la escena con una copia chica del cuadro (96 x 72), 4 veces por segundo
  useEffect(() => {
    if (!camaraLista) return
    const video = videoRef.current
    if (!video) return
    const c = document.createElement('canvas')
    c.width = 96
    c.height = 72
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const id = setInterval(() => {
      const luz = medirLuz(ctx, video, cajaActual.current)
      if (luz) onLuzRef.current?.(luz)
    }, 250)
    return () => clearInterval(id)
  }, [camaraLista])

  let aviso: string | null = null
  if (errorCamara) aviso = errorCamara
  else if (estado === 'error') aviso = 'Error al cargar el modelo de visión: ' + error
  else if (estado === 'cargando') aviso = 'Cargando modelo de visión…'
  else if (!camaraLista) aviso = 'Abriendo cámara…'

  const colorOvalo = ovalo === 'ok' ? 'border-ok' : ovalo === 'alerta' ? 'border-warn' : 'border-accent'

  return (
    <div className="flex flex-col gap-3">
      <section
        aria-label="Vista de la cámara"
        className="relative aspect-[4/3] w-full overflow-hidden rounded-[20px] border border-line bg-[#04070E]"
      >
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100" />
        <div
          ref={ovaloRef}
          style={{ left: '29%', top: '15%', width: '42%', height: '70%' }}
          className={`pointer-events-none absolute rounded-[50%] border-2 border-dashed transition-[left,top,width,height,opacity,border-color] duration-200 ease-out ${colorOvalo} ${
            ovalo === 'tenue' ? 'opacity-40' : 'opacity-100'
          }`}
        />
        {aviso ? (
          <div role="alert" className="absolute left-1/2 top-1/2 flex w-[min(360px,86%)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-xl border border-line-strong bg-nav/95 px-4 py-4 text-center text-sm font-semibold">
            <span>{aviso}</span>
            {(errorCamara || estado === 'error') && (
              <button type="button" onClick={errorCamara ? reintentar : () => window.location.reload()} className="min-h-14 rounded-xl bg-accent px-4 text-base font-semibold text-[#04121C] hover:bg-[#8AD9F8]">
                Reintentar
              </button>
            )}
          </div>
        ) : (
          children
        )}
      </section>
      {camaras.length > 1 && (
        <label className="flex items-center gap-3 text-sm text-soft">
          Cámara
          <select
            value={camaraId ?? ''}
            onChange={(e) => {
              setCamaraLista(false)
              setErrorCamara(null)
              setCamaraId(e.target.value)
            }}
            className="min-h-14 flex-1 rounded-xl border border-line-strong bg-panel px-3 text-ink"
          >
            {camaras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
