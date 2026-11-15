import { useEffect, useRef, useState } from 'react'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import { useFaceLandmarker } from '../camara/useFaceLandmarker'

// Cámaras virtuales que suelen mandar imagen negra si su app no está abierta
const VIRTUALES = /droidcam|obs|virtual|manycam|snap camera|xsplit|iriun|epoccam|camo/i

type Camara = { id: string; nombre: string }

type Props = {
  // Se llama en cada cuadro con lo que detectó MediaPipe, así otros hooks pueden usarlo
  onResultado?: (resultado: FaceLandmarkerResult, tiempoMs: number) => void
}

export default function CameraView({ onResultado }: Props) {
  const onResultadoRef = useRef(onResultado)
  useEffect(() => {
    onResultadoRef.current = onResultado
  }, [onResultado])

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { landmarker, estado, error } = useFaceLandmarker()
  const [camaras, setCamaras] = useState<Camara[]>([])
  const [camaraId, setCamaraId] = useState<string | null>(null)
  const [camaraLista, setCamaraLista] = useState(false)
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const [hayCara, setHayCara] = useState(false)

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
      .getUserMedia({
        video: { deviceId: { exact: camaraId }, width: 640, height: 480 },
        audio: false,
      })
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
        // Hay que darle play a mano: si no, se queda congelado en el primer cuadro
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

  // 3. Detectar la cara en cada cuadro del video y dibujar los puntos
  useEffect(() => {
    if (!landmarker || !camaraLista) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!video || !canvas || !ctx) return

    let frameId = 0
    let ultimoTiempo = -1

    const loop = () => {
      if (video.currentTime !== ultimoTiempo) {
        ultimoTiempo = video.currentTime
        const ahora = performance.now()
        const resultado = landmarker.detectForVideo(video, ahora)
        onResultadoRef.current?.(resultado, ahora)

        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const cara = resultado.faceLandmarks[0]
        setHayCara(Boolean(cara))

        if (cara) {
          ctx.fillStyle = '#8AD9F8'
          for (const punto of cara) {
            ctx.beginPath()
            ctx.arc(punto.x * canvas.width, punto.y * canvas.height, 1.2, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
      frameId = requestAnimationFrame(loop)
    }

    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [landmarker, camaraLista])

  // Texto de estado arriba a la izquierda
  let mensaje = 'Cargando modelo…'
  if (errorCamara) mensaje = errorCamara
  else if (estado === 'error') mensaje = 'Error al cargar el modelo: ' + error
  else if (estado === 'listo' && !camaraLista) mensaje = 'Abriendo cámara…'
  else if (estado === 'listo' && camaraLista) mensaje = hayCara ? 'Cara detectada' : 'Buscando tu cara…'

  return (
    <div className="flex flex-col gap-3">
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

      <section className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100" />
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed ${
            hayCara ? 'border-ok' : 'border-accent'
          }`}
        />
        <span className="absolute left-4 top-4 rounded-lg border border-line-strong bg-bg/85 px-3 py-2 text-sm font-semibold">
          {mensaje}
        </span>
      </section>
    </div>
  )
}
