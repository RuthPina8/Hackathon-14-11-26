import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import { useFaceLandmarker } from '../camara/useFaceLandmarker'
import { cajaCara, calcularRois, suavizarRois } from '../camara/landmarks'
import type { Roi } from '../camara/landmarks'

// Cámaras virtuales que suelen mandar imagen negra si su app no está abierta
const VIRTUALES = /droidcam|obs|virtual|manycam|snap camera|xsplit|iriun|epoccam|camo/i

type Camara = { id: string; nombre: string }

type Props = {
  // Se llama en cada cuadro con lo que detectó MediaPipe y las zonas de piel ya suavizadas
  onResultado?: (resultado: FaceLandmarkerResult, tiempoMs: number, video: HTMLVideoElement, rois: Roi[] | null) => void
  // Se llama en CADA cuadro de la cámara (30 por segundo), aunque MediaPipe vaya más lento,
  // con las últimas zonas de piel conocidas y el tiempo real del cuadro en ms
  onCuadro?: (video: HTMLVideoElement, rois: Roi[], tiempoMs: number) => void
  // Avisa cuando el modelo y la cámara ya están listos
  onListo?: (listo: boolean) => void
  mostrarRois?: boolean
  // Tope de cuadros por segundo para la detección y el muestreo de color. Sin tope, todo corre a la
  // velocidad de la cámara (30). Se baja en pantallas con botones para que los clics no esperen.
  maxFps?: number
  ovalo?: 'normal' | 'ok' | 'tenue'
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

export default function CameraView({ onResultado, onCuadro, onListo, mostrarRois = true, ovalo = 'normal', maxFps, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ovaloRef = useRef<HTMLDivElement>(null)
  const { landmarker, estado, error } = useFaceLandmarker()
  const [camaras, setCamaras] = useState<Camara[]>([])
  const [camaraId, setCamaraId] = useState<string | null>(null)
  const [camaraLista, setCamaraLista] = useState(false)
  const [errorCamara, setErrorCamara] = useState<string | null>(null)

  const onResultadoRef = useRef(onResultado)
  const onCuadroRef = useRef(onCuadro)
  const mostrarRoisRef = useRef(mostrarRois)
  const intervaloMs = maxFps ? 1000 / maxFps - 4 : 0
  const roisActuales = useRef<Roi[] | null>(null)
  useEffect(() => {
    onResultadoRef.current = onResultado
    onCuadroRef.current = onCuadro
    mostrarRoisRef.current = mostrarRois
  }, [onResultado, onCuadro, mostrarRois])

  const listo = estado === 'listo' && camaraLista && !errorCamara
  useEffect(() => {
    onListo?.(listo)
  }, [listo, onListo])

  // 1. Pedir permiso y elegir la cámara real
  useEffect(() => {
    let cancelado = false
    async function buscarCamaras() {
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
        const real = lista.find((c) => !VIRTUALES.test(c.nombre)) ?? lista[0]
        if (real) setCamaraId(real.id)
        else setErrorCamara('No se encontró ninguna cámara')
      } catch {
        if (!cancelado) setErrorCamara('No se pudo abrir la cámara, revisa los permisos del navegador')
      }
    }
    buscarCamaras()
    return () => {
      cancelado = true
    }
  }, [])

  // 2. Prender la cámara elegida
  useEffect(() => {
    if (!camaraId) return
    let cancelado = false
    let stream: MediaStream | null = null
    setCamaraLista(false)
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: camaraId }, width: 640, height: 480 }, audio: false })
      .then((s) => {
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
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
      .catch(() => setErrorCamara('No se pudo abrir esa cámara, prueba con otra'))
    return () => {
      cancelado = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [camaraId])

  // 3. Detectar la cara en cada cuadro, dibujar puntos y zonas
  useEffect(() => {
    if (!landmarker || !camaraLista) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!video || !canvas || !ctx) return
    let frameId = 0
    let ultimoTiempo = -1
    let ultimaDeteccion = 0
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
      const ahora = performance.now()
      if (video.currentTime !== ultimoTiempo && ahora - ultimaDeteccion >= intervaloMs) {
        ultimoTiempo = video.currentTime
        ultimaDeteccion = ahora
        const resultado = landmarker.detectForVideo(video, ahora)
        const primera = resultado.faceLandmarks[0]
        roisPrevias = primera ? suavizarRois(roisPrevias, calcularRois(primera, video.videoWidth / video.videoHeight)) : null
        roisActuales.current = roisPrevias
        moverOvalo(primera ? cajaCara(primera) : null)
        onResultadoRef.current?.(resultado, ahora, video, roisPrevias)

        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        const W = canvas.width
        const H = canvas.height
        ctx.clearRect(0, 0, W, H)
        const cara = resultado.faceLandmarks[0]
        if (cara) {
          // Malla ligera: uno de cada 5 puntos para que no tape la cara
          ctx.fillStyle = 'rgba(138, 217, 248, 0.7)'
          for (let i = 0; i < cara.length; i += 5) {
            ctx.beginPath()
            ctx.arc(cara[i].x * W, cara[i].y * H, 1.4, 0, Math.PI * 2)
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
  }, [landmarker, camaraLista, intervaloMs])

  // 4. Muestreo de color en cada cuadro que entrega la cámara (requestVideoFrameCallback)
  useEffect(() => {
    if (!camaraLista) return
    const video = videoRef.current
    if (!video || !('requestVideoFrameCallback' in video)) return
    let id = 0
    let ultimoMuestreo = 0
    const cuadro = (ahora: number, meta: VideoFrameCallbackMetadata) => {
      const rois = roisActuales.current
      if (rois && ahora - ultimoMuestreo >= intervaloMs) {
        ultimoMuestreo = ahora
        onCuadroRef.current?.(video, rois, meta.mediaTime * 1000)
      }
      id = video.requestVideoFrameCallback(cuadro)
    }
    id = video.requestVideoFrameCallback(cuadro)
    return () => video.cancelVideoFrameCallback(id)
  }, [camaraLista, intervaloMs])

  let aviso: string | null = null
  if (errorCamara) aviso = errorCamara
  else if (estado === 'error') aviso = 'Error al cargar el modelo: ' + error
  else if (estado === 'cargando') aviso = 'Cargando modelo de visión…'
  else if (!camaraLista) aviso = 'Abriendo cámara…'

  const colorOvalo = ovalo === 'ok' ? 'border-ok' : 'border-accent'

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
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line-strong bg-nav/90 px-4 py-3 text-sm font-semibold">
            {aviso}
          </span>
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
              setErrorCamara(null)
              setCamaraId(e.target.value)
            }}
            className="min-h-11 flex-1 rounded-xl border border-line-strong bg-panel px-3 text-ink"
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
