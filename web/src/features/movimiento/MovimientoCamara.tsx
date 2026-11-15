import { useCallback, useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { usePoseLandmarker } from './pose/usePoseLandmarker'
import { anguloHombro, anguloRodilla, cuerpoVisible, HUESOS, NECESARIOS, type Ejercicio } from './pose/calcularAngulos'
import { actualizar, nuevoContador, resumen, type Contador } from './pose/detectarRepeticiones'
import type { SesionIn } from './movimientoApi'

type Fase = 'preparando' | 'midiendo'

const GUIA: Record<Ejercicio, string> = {
  brazos: 'Siéntate o párate de frente. Que se vean tus hombros, brazos y cadera. Sube ambos brazos por los lados hasta arriba y bájalos',
  sentadilla: 'Aléjate unos 2 metros para que se vea todo tu cuerpo, de la cabeza a los tobillos. Baja despacio y sube',
}

interface Props {
  ejercicio: Ejercicio
  astronautaId: number
  onTerminar: (s: SesionIn) => void
  onCancelar: () => void
  onFallo: () => void
}

export default function MovimientoCamara({ ejercicio, astronautaId, onTerminar, onCancelar, onFallo }: Props) {
  const { pose, estado, origen } = usePoseLandmarker()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [camara, setCamara] = useState<'cargando' | 'lista' | 'error'>('cargando')
  const [fase, setFase] = useState<Fase>('preparando')
  const [visible, setVisible] = useState(false)
  const [contador, setContador] = useState<Contador>(nuevoContador())
  const [seg, setSeg] = useState(0)

  const faseRef = useRef(fase)
  useEffect(() => { faseRef.current = fase }, [fase])
  const contadorRef = useRef(contador)
  const cuadros = useRef({ total: 0, validos: 0 })
  const inicio = useRef(0)

  // Cámara
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelado = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 30 } }, audio: false })
      .then(async (s) => {
        if (cancelado) { s.getTracks().forEach((t) => t.stop()); return }
        stream = s
        const v = videoRef.current
        if (!v) return
        v.srcObject = s
        await v.play().catch(() => {})
        setCamara('lista')
      })
      .catch(() => setCamara('error'))
    if (!navigator.mediaDevices) setCamara('error')
    return () => { cancelado = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  const dibujar = useCallback((lm: NormalizedLandmark[] | undefined, ok: boolean) => {
    const c = canvasRef.current, v = videoRef.current
    if (!c || !v) return
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight }
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    if (!lm) return
    const color = ok ? '#3DDC97' : '#F5B544'
    ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.lineCap = 'round'
    for (const [a, b] of HUESOS) {
      ctx.beginPath(); ctx.moveTo(lm[a].x * c.width, lm[a].y * c.height); ctx.lineTo(lm[b].x * c.width, lm[b].y * c.height); ctx.stroke()
    }
    ctx.fillStyle = '#E8ECF4'
    for (const i of NECESARIOS[ejercicio]) {
      ctx.beginPath(); ctx.arc(lm[i].x * c.width, lm[i].y * c.height, 7, 0, Math.PI * 2); ctx.fill()
    }
  }, [ejercicio])

  // Bucle de detección
  useEffect(() => {
    if (!pose || camara !== 'lista') return
    let raf = 0
    let ultimo = -1
    const paso = () => {
      const v = videoRef.current
      if (v && v.readyState >= 2 && v.currentTime !== ultimo) {
        ultimo = v.currentTime
        const t = performance.now()
        const r = pose.detectForVideo(v, t)
        const lm = r.landmarks[0]
        const ok = Boolean(lm) && cuerpoVisible(lm, ejercicio)
        setVisible(ok)
        dibujar(lm, ok)
        if (faseRef.current === 'midiendo') {
          cuadros.current.total++
          if (ok && lm) {
            cuadros.current.validos++
            const asp = v.videoWidth / (v.videoHeight || 1)
            const ang = ejercicio === 'sentadilla' ? anguloRodilla(lm, asp) : anguloHombro(lm, asp)
            const nuevo = actualizar(contadorRef.current, ejercicio, ang, t)
            if (nuevo.repeticiones !== contadorRef.current.repeticiones || nuevo.fase !== contadorRef.current.fase) setContador(nuevo)
            contadorRef.current = nuevo
          }
        }
      }
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [pose, camara, ejercicio, dibujar])

  // Reloj
  useEffect(() => {
    if (fase !== 'midiendo') return
    const id = setInterval(() => setSeg(Math.floor((performance.now() - inicio.current) / 1000)), 250)
    return () => clearInterval(id)
  }, [fase])

  const empezar = () => {
    const c = nuevoContador()
    contadorRef.current = c
    setContador(c)
    cuadros.current = { total: 0, validos: 0 }
    inicio.current = performance.now()
    setSeg(0)
    setFase('midiendo')
  }

  const terminar = () => {
    const c = contadorRef.current
    const { total, validos } = cuadros.current
    onTerminar({
      astronauta_id: astronautaId,
      ejercicio,
      repeticiones: c.repeticiones,
      duracion_s: Math.round((performance.now() - inicio.current) / 100) / 10,
      ...resumen(c, ejercicio),
      calidad: total ? Number((validos / total).toFixed(2)) : 0,
      fuente: 'webcam',
    })
  }

  const calidadVivo = cuadros.current.total ? cuadros.current.validos / cuadros.current.total : null
  const fallo = estado === 'error' || camara === 'error'
  const listo = estado === 'listo' && camara === 'lista'

  let pista = GUIA[ejercicio]
  if (estado === 'cargando') pista = 'Cargando el modelo de pose corporal…'
  else if (fallo) pista = camara === 'error' ? 'No pude usar la cámara. Permite el acceso o usa la sesión de respaldo' : 'No se pudo cargar el modelo de pose. Usa la sesión de respaldo'
  else if (!visible) pista = ejercicio === 'sentadilla' ? 'No veo todo tu cuerpo: aléjate hasta que se vean tus tobillos' : 'No veo tus brazos y cadera: aléjate un poco de la cámara'
  else if (fase === 'midiendo') pista = 'Bien, sigue a tu ritmo. Toca TERMINAR cuando acabes'
  else pista = 'Te veo completo. Toca EMPEZAR'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-5">
        <div className="relative min-w-0 flex-[3_1_480px] overflow-hidden rounded-[20px] border-2 border-[#1C2740] bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover -scale-x-100" />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover -scale-x-100" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <span className={`rounded-xl px-4 py-2 text-base font-bold ${visible ? 'bg-[#0F2E22] text-[#8FF0C4]' : 'bg-[#2A2312] text-[#F5D79A]'}`}>
              {visible ? 'Cuerpo detectado' : 'Cuerpo no visible'}
            </span>
            <span className="tag real" style={{ fontSize: 14, padding: '8px 12px' }}>Webcam · real</span>
          </div>
          <p aria-live="polite" className="absolute inset-x-0 bottom-0 m-0 bg-gradient-to-b from-transparent to-[rgba(4,7,14,0.95)] px-6 pb-5 pt-10 text-lg font-semibold text-[#E8ECF4]">{pista}</p>
        </div>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <section className="card flex flex-col items-center gap-1 text-center">
            <p className="k">Repeticiones</p>
            <p className="num m-0 text-[96px] font-bold leading-none text-[#5CC8F5]">{contador.repeticiones}</p>
            <p className="m-0 text-base text-[#A3AEC4]">{fase === 'midiendo' ? `Fase: ${contador.fase}` : 'Se cuentan solo los ciclos completos'}</p>
          </section>
          <div className="grid grid-cols-2 gap-4">
            <section className="card"><p className="k">Tiempo</p><p className="big">{seg}<span className="text-lg text-[#A3AEC4]"> s</span></p></section>
            <section className="card"><p className="k">Calidad de detección</p><p className="big" style={{ color: calidadVivo !== null && calidadVivo < 0.6 ? '#F5B544' : undefined }}>{calidadVivo === null ? '--' : `${Math.round(calidadVivo * 100)}%`}</p></section>
          </div>
          {origen === 'remoto' && <p className="m-0 text-sm text-[#F5D79A]">Modelo de pose cargado de internet; para usarlo sin conexión hay que copiarlo a web/public/models</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {fase === 'preparando' ? (
          <button type="button" className="btn pri flex-1" style={{ minHeight: 76, fontSize: 22 }} onClick={empezar} disabled={!listo || !visible}>EMPEZAR</button>
        ) : (
          <button type="button" className="btn pri flex-1" style={{ minHeight: 76, fontSize: 22 }} onClick={terminar}>TERMINAR Y GUARDAR</button>
        )}
        <button type="button" className="btn sec" style={{ minHeight: 76 }} onClick={onCancelar}>Cancelar</button>
        {fallo && <button type="button" className="btn sec" style={{ minHeight: 76 }} onClick={onFallo}>Usar sesión de respaldo</button>}
      </div>
    </div>
  )
}
