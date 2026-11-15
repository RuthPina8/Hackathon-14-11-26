import { useCallback, useEffect, useRef, useState } from 'react'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import CameraView from './components/CameraView'
import PulseWave from './components/PulseWave'
import StepBar from './components/StepBar'
import { PUNTO_NARIZ } from './camara/landmarks'
import type { Roi } from './camara/landmarks'
import { CONFIANZA_BUENA, CONFIANZA_MINIMA, confianzaMotor, useRppg } from './camara/useRppg'
import { useExpresion } from './camara/useExpresion'
import { MENSAJES, bloquea, headPitch, principal, revisarEncuadre, revisarLuz, type Luz, type Problema } from './camara/calidad'
import { useChequeoStore, type ResultadoCamara } from './chequeoStore'
import { medicionesCamara } from './envio'
import { baseMedicion, enviarPaso } from './enviar'
import { api } from '../../lib/api'
import type { Confiabilidad, ServerIndicator } from '../../lib/back1'
import { useAppStore } from '../../store/useAppStore'

const TOTAL = 60 // segundos VÁLIDOS de medición (con cara, pose y sin movimientos bruscos)
const MAXIMO_MS = 150_000 // si en 2.5 min no se juntan, se termina con lo que haya
const MINIMO_VALIDOS = 20 // con menos no hay un tramo de 20 s para el ritmo
const FPS_MINIMO = 15
// Velocidad de la cara en fracciones de la imagen por segundo. Moverse es normal en microgravedad:
// solo se descartan los cuadros con movimientos bruscos, el resto se sigue usando
const MOVIMIENTO_SEGUIMIENTO = 0.12
const MOVIMIENTO_BRUSCO = 0.6

type Fase = 'inicio' | 'midiendo' | 'pausa' | 'analizando' | 'completo'

// Navegadores sin requestVideoFrameCallback toman el color al ritmo de MediaPipe
const SIN_CUADRO_A_CUADRO = typeof (HTMLVideoElement.prototype as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback !== 'function'

type Props = { onSiguiente: () => void; onCancelar: () => void }

const reloj = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

type RppgBack = { hr_lpm: number | null; confianza: number; snr_db: number | null; hrv_rmssd: number | null; resp_rpm: number | null }

export default function ChequeoCamara({ onSiguiente, onCancelar }: Props) {
  const { bpm: bpmVivo, confianza, onda, registrar: registrarColor, reiniciar: reiniciarRppg, estimarFinal, ventana } = useRppg()
  const expresion = useExpresion()
  const guardado = useChequeoStore((s) => s.camara)
  const envio = useChequeoStore((s) => s.envios.camara)
  const guardarCamara = useChequeoStore((s) => s.guardarCamara)
  const server = useAppStore((s) => s.server)

  const [fase, setFase] = useState<Fase>(guardado ? 'completo' : 'inicio')
  const [seg, setSeg] = useState(guardado ? TOTAL : 0)
  const [camaraLista, setCamaraLista] = useState(false)
  const [problemas, setProblemas] = useState<Set<Problema>>(new Set())
  const [final, setFinal] = useState<ResultadoCamara | null>(guardado)
  const [pausaAuto, setPausaAuto] = useState(false)
  // La tarjeta del resultado se puede cerrar con la X para ver la cámara y los paneles
  const [tarjetaCerrada, setTarjetaCerrada] = useState(false)
  const [movNivel, setMovNivel] = useState<'estable' | 'siguiendo'>('estable')
  const [normalExpr, setNormalExpr] = useState<ServerIndicator | null>(null)
  const [verif, setVerif] = useState<Confiabilidad | null>(null)
  // Confiabilidad verificada de la cámara (pares contra aparato de referencia)
  useEffect(() => { void api.get<Confiabilidad>('/validacion').then(setVerif) }, [])

  const faseRef = useRef(fase)
  useEffect(() => { faseRef.current = fase }, [fase])

  // Problemas detectados por cada fuente; se juntan 4 veces por segundo
  const probCara = useRef<Set<Problema>>(new Set(['sin_cara']))
  const probLuz = useRef<Problema[]>([])
  const tapadoHasta = useRef(0)
  const historialLuz = useRef<number[]>([])
  const conteoLuz = useRef<Record<string, number>>({})
  const pitches = useRef<number[]>([])
  const pitchNormal = useRef<number | null>(null)

  // Cuadros que entrega la cámara (todos, se usen o no): de aquí sale si la cámara va lenta
  const cuadros = useRef<number[]>([])
  const contarCuadro = () => {
    const t = performance.now()
    cuadros.current.push(t)
    while (cuadros.current.length && cuadros.current[0] < t - 2000) cuadros.current.shift()
  }
  const fps = useCallback(() => (cuadros.current.length >= 10 ? cuadros.current.length / 2 : null), [])
  const narizAnterior = useRef<{ x: number; y: number; t: number } | null>(null)
  const movimientoProm = useRef(0)
  const ultimoMovimiento = useRef(0)
  const validosMs = useRef(0)
  // El reloj llama a terminar() por medio de esta referencia (siempre la versión más nueva)
  const terminarRef = useRef<() => Promise<void>>(async () => {})
  const inicioMs = useRef(0)

  // ---------- cada análisis de MediaPipe: encuadre, pose, movimiento, ojos y gestos ----------
  const onResultado = useCallback(
    (r: FaceLandmarkerResult, t: number, video: HTMLVideoElement, rois: Roi[] | null, caras: number) => {
      if (SIN_CUADRO_A_CUADRO) contarCuadro()
      const cara = r.faceLandmarks[0]
      const p = new Set<Problema>()
      if (!cara) {
        p.add('sin_cara')
        narizAnterior.current = null
        probCara.current = p
        return
      }
      if (caras > 1) p.add('otra_persona')
      // Inclinación "normal" de esta persona: mediana de sus primeros cuadros
      const pitch = headPitch(cara)
      if (pitchNormal.current === null) {
        pitches.current.push(pitch)
        if (pitches.current.length >= 45) {
          const o = [...pitches.current].sort((a, b) => a - b)
          pitchNormal.current = o[Math.floor(o.length / 2)]
        }
      }
      for (const x of revisarEncuadre(cara, pitchNormal.current)) p.add(x)

      // Velocidad por segundo: MediaPipe no analiza todos los cuadros, así que se divide entre el tiempo real
      const nariz = cara[PUNTO_NARIZ]
      let d = 0
      const previa = narizAnterior.current
      if (previa && t > previa.t) {
        d = Math.hypot(nariz.x - previa.x, nariz.y - previa.y) / ((t - previa.t) / 1000)
        movimientoProm.current = movimientoProm.current * 0.85 + d * 0.15
      }
      narizAnterior.current = { x: nariz.x, y: nariz.y, t }
      ultimoMovimiento.current = d
      if (movimientoProm.current > MOVIMIENTO_BRUSCO * 0.6) p.add('movimiento')
      if (performance.now() < tapadoHasta.current) p.add('tapado')
      probCara.current = p

      if (faseRef.current !== 'midiendo') return
      const caraUtil = !bloquea(p)
      // Respaldo para navegadores sin requestVideoFrameCallback: color al ritmo de MediaPipe
      if (SIN_CUADRO_A_CUADRO && rois && caraUtil && d < MOVIMIENTO_BRUSCO) {
        if (registrarColor(video, rois, video.currentTime * 1000) === 'tapado') tapadoHasta.current = performance.now() + 500
      }
      if (caraUtil) expresion.registrar(r.faceBlendshapes[0]?.categories, movimientoProm.current)
    },
    [registrarColor, expresion],
  )

  // ---------- cada cuadro de la cámara: color de la piel ----------
  const onCuadro = useCallback(
    (video: HTMLVideoElement, rois: Roi[], tiempoMs: number) => {
      contarCuadro()
      if (faseRef.current !== 'midiendo' || rois.length === 0) return
      // Cuadro con movimiento brusco o sin cara útil: se descarta solo ese, la medición sigue
      if (ultimoMovimiento.current >= MOVIMIENTO_BRUSCO || bloquea(probCara.current)) return
      if (registrarColor(video, rois, tiempoMs) === 'tapado') tapadoHasta.current = performance.now() + 500
    },
    [registrarColor],
  )

  // ---------- luz de la escena ----------
  const onLuz = useCallback((l: Luz) => {
    if (l.cara > 0) {
      historialLuz.current.push(l.cara)
      if (historialLuz.current.length > 8) historialLuz.current.shift()
    }
    probLuz.current = revisarLuz(l, historialLuz.current)
  }, [])

  // ---------- reloj: solo avanza con cuadros útiles ----------
  useEffect(() => {
    const id = setInterval(() => {
      const p = new Set<Problema>([...probCara.current, ...probLuz.current])
      const f = fps()
      if (f !== null && f < FPS_MINIMO && faseRef.current === 'midiendo') p.add('camara_lenta')
      setProblemas(p)
      if (faseRef.current !== 'midiendo') return
      for (const x of probLuz.current) conteoLuz.current[x] = (conteoLuz.current[x] ?? 0) + 1
      if (!bloquea(p)) validosMs.current += 250
      setSeg(Math.min(TOTAL, validosMs.current / 1000))
      setMovNivel(movimientoProm.current > MOVIMIENTO_SEGUIMIENTO ? 'siguiendo' : 'estable')
      if (validosMs.current >= TOTAL * 1000 || performance.now() - inicioMs.current > MAXIMO_MS) {
        faseRef.current = 'analizando'
        void terminarRef.current()
      }
    }, 250)
    return () => clearInterval(id)
  }, [fps])

  // Cambiar de pestaña detiene la cámara del navegador: se pausa sola para no dejar huecos
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && faseRef.current === 'midiendo') {
        setFase('pausa')
        setPausaAuto(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ---------- fin de la medición ----------
  const terminar = useCallback(async () => {
    setFase('analizando')
    const est = estimarFinal()
    const validos = Math.round(validosMs.current / 1000)
    const bpm = est && est.confianza >= CONFIANZA_MINIMA ? est.bpm : null
    const conf = est?.confianza ?? 0
    // VFC y respiración (experimentales): las calcula el back con la señal cruda (POS + filtfilt)
    let hrv: number | null = null
    let resp: number | null = null
    const muestras = ventana()
    if (bpm !== null && muestras.length > 300) {
      const r = await api.post<RppgBack>('/rppg/estimate', {
        t_ms: muestras.map((m) => Math.round(m.t * 10) / 10),
        rgb: muestras.map((m) => [Number(m.r.toFixed(3)), Number(m.g.toFixed(3)), Number(m.b.toFixed(3))]),
      }, 15000)
      if (r && r.confianza >= 0.3) {
        hrv = r.hrv_rmssd !== null ? Math.round(r.hrv_rmssd) : null
        resp = r.resp_rpm !== null ? Math.round(r.resp_rpm * 10) / 10 : null
      }
    }
    const luzFrecuente = Object.entries(conteoLuz.current).sort((a, b) => b[1] - a[1])[0]
    const resultado: ResultadoCamara = {
      bpm,
      confianza: conf,
      confianzaMotor: Number(confianzaMotor(conf).toFixed(3)),
      // Detector de fatiga por parpadeo quitado en este equipo: no se mide ni se envía
      perclos: null,
      parpadeosMin: null,
      parpadeoDurMs: null,
      cierresLargos: 0,
      expresion: expresion.resultado(),
      hrv,
      resp,
      segundosValidos: validos,
      fps: fps(),
      // Solo se reporta si estuvo presente al menos un cuarto del tiempo
      luz: luzFrecuente && luzFrecuente[1] > (validosMs.current / 250) * 0.25 ? MENSAJES[luzFrecuente[0] as Problema].texto : null,
      fecha: new Date().toISOString(),
    }
    setFinal(resultado)
    setFase('completo')
    guardarCamara(resultado)
    void enviarPaso('camara', medicionesCamara(resultado, baseMedicion())).then(async () => {
      const ind = await api.get<ServerIndicator>(`/indicators/expresividad?astronauta_id=${baseMedicion().astronauta_id}&range=mision`)
      if (ind) setNormalExpr(ind)
    })
  }, [estimarFinal, ventana, expresion, fps, guardarCamara])

  useEffect(() => { terminarRef.current = terminar }, [terminar])

  const reiniciarTodo = () => {
    reiniciarRppg()
    expresion.reiniciar()
    setFinal(null)
    setNormalExpr(null)
    narizAnterior.current = null
    movimientoProm.current = 0
    validosMs.current = 0
    conteoLuz.current = {}
    pitches.current = []
    pitchNormal.current = null
    inicioMs.current = performance.now()
    setSeg(0)
    setPausaAuto(false)
    setTarjetaCerrada(false)
    setFase('midiendo')
  }

  const iniciar = () => {
    if (fase === 'pausa') {
      // Al continuar se limpia la señal de color para que la pausa no deje un hueco en la onda
      // (los gestos sí siguen sumando)
      reiniciarRppg()
      inicioMs.current = performance.now() - validosMs.current
      setPausaAuto(false)
      setFase('midiendo')
    } else {
      reiniciarTodo()
    }
  }

  // ---------- lo que se muestra ----------
  const midiendo = fase === 'midiendo'
  const terminado = fase === 'completo' && final
  const bpm = terminado ? final.bpm : bpmVivo
  const confianzaMostrada = terminado ? final.confianza : confianza
  const hayRitmo = bpm !== null && confianzaMostrada >= CONFIANZA_MINIMA
  const bajaConfianza = hayRitmo && confianzaMostrada < CONFIANZA_BUENA
  const senalDebil = !hayRitmo && onda.length > 0
  const barrasCalidad = onda.length > 0 || terminado ? Math.max(1, Math.round(Math.min(1, confianzaMostrada / 0.4) * 5)) : 0
  const problema = principal(problemas)

  let pista = 'Siéntate frente a la cámara con una luz de frente'
  if (fase === 'pausa') pista = pausaAuto ? 'Pausé la medición porque cambiaste de pestaña' : 'Medición en pausa'
  if (fase === 'analizando') pista = 'Analizando la señal…'
  if (fase === 'completo') pista = hayRitmo ? 'Listo, ya puedes pasar a la prueba cognitiva' : 'No hubo señal clara de ritmo, puedes repetir la medición'
  if (midiendo) {
    if (problema) pista = MENSAJES[problema].texto
    else if (senalDebil || bajaConfianza) pista = 'Señal débil: pon una luz de frente y evita lámparas detrás o arriba de ti'
    else if (!hayRitmo) pista = 'Estabilizando la señal…'
    else pista = 'Muy bien, mantén la cara en el óvalo y respira normal'
  }
  const pistaMala = midiendo && problema !== null && MENSAJES[problema].bloquea

  const tarjeta: Record<Exclude<Fase, 'midiendo'>, [string, string, string]> = {
    inicio: ['Medición de 60 segundos', 'Mide tu ritmo cardiaco solo con la cámara, sin sensores. El reloj avanza solo con tu cara bien visible', 'Iniciar medición'],
    pausa: ['Medición en pausa', `Llevas ${Math.floor(seg)} de ${TOTAL} segundos útiles, vuelve a acomodarte en el óvalo`, 'Continuar'],
    analizando: ['Analizando', 'Buscando el tramo más limpio de la señal y calculando la variabilidad', ''],
    completo: [
      'Medición completa',
      hayRitmo
        ? `Ritmo ${bpm} lpm${bajaConfianza ? ' (baja confianza)' : ''} con ${final?.segundosValidos ?? 0} s útiles`
        : (final?.segundosValidos ?? 0) < MINIMO_VALIDOS
          ? 'No se juntaron suficientes segundos con tu cara bien visible. Revisa la luz y el encuadre'
          : 'No hubo un tramo con señal clara, centra tu cara y evita lámparas detrás o arriba de ti',
      'Repetir medición',
    ],
  }

  const estadoChip = {
    inicio: { texto: 'Cámara lista', borde: 'border-line-strong', color: 'text-soft', punto: 'bg-muted' },
    midiendo: pistaMala
      ? { texto: 'Esperando', borde: 'border-[#5C4A1C]', color: 'text-[#F5D79A]', punto: 'bg-warn' }
      : { texto: 'Midiendo', borde: 'border-[#5A2A33]', color: 'text-[#FFB8BF]', punto: 'bg-crit animate-blink' },
    pausa: { texto: 'En pausa', borde: 'border-[#5C4A1C]', color: 'text-[#F5D79A]', punto: 'bg-warn' },
    analizando: { texto: 'Analizando', borde: 'border-[#1F5A78]', color: 'text-[#8AD9F8]', punto: 'bg-accent animate-blink' },
    completo: { texto: 'Completo', borde: 'border-[#1E5A43]', color: 'text-[#8FF0C4]', punto: 'bg-ok' },
  }[fase]

  // Lista de verificación visible: el astronauta ve exactamente qué falla
  const checks: { k: string; ok: boolean; txt: string }[] = [
    { k: 'Cara', ok: !['sin_cara', 'fuera_cuadro', 'lejos', 'cerca', 'de_lado', 'tapado'].some((x) => problemas.has(x as Problema)), txt: problemas.has('sin_cara') ? 'No se ve' : problemas.has('lejos') ? 'Lejos' : problemas.has('cerca') ? 'Muy cerca' : problemas.has('de_lado') ? 'De lado' : problemas.has('tapado') ? 'Tapada' : problemas.has('fuera_cuadro') ? 'Fuera' : 'Bien' },
    { k: 'Luz', ok: !['poca_luz', 'mucha_luz', 'contraluz', 'luz_lateral', 'luz_inestable', 'imagen_negra'].some((x) => problemas.has(x as Problema)), txt: problemas.has('imagen_negra') ? 'Negra' : problemas.has('contraluz') ? 'Contraluz' : problemas.has('poca_luz') ? 'Poca' : problemas.has('mucha_luz') ? 'Excesiva' : problemas.has('luz_lateral') ? 'De lado' : problemas.has('luz_inestable') ? 'Inestable' : 'Buena' },
    { k: 'Quieto', ok: !problemas.has('movimiento'), txt: problemas.has('movimiento') ? 'Brusco' : movNivel === 'siguiendo' ? 'Siguiendo' : 'Estable' },
    { k: 'Cámara', ok: !problemas.has('camara_lenta'), txt: problemas.has('camara_lenta') ? 'Lenta' : 'Fluida' },
  ]

  const exprNormal = normalExpr?.linea_base.media ?? null
  const exprHoy = final?.expresion?.expresividad ?? null

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Chequeo diario · paso 1 de 5</p>
            <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-tight">Chequeo con cámara</h1>
          </div>
          <p className="m-0 text-sm text-soft">Unos <strong className="text-ink">4 minutos</strong> en total</p>
        </div>
        <StepBar actual={0} />
      </header>

      <div className="flex flex-wrap gap-5">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-3">
          <CameraView
            onResultado={onResultado}
            onCuadro={onCuadro}
            onLuz={onLuz}
            onListo={setCamaraLista}
            bloquearAjustes={midiendo}
            ovalo={fase === 'completo' ? 'ok' : fase === 'inicio' ? 'tenue' : pistaMala ? 'alerta' : 'normal'}
          >
            {midiendo && !pistaMala && (
              <div className="pointer-events-none absolute left-[22%] right-[22%] h-0.5 animate-scan bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_18px_var(--color-accent)]" />
            )}

            <div className="absolute left-[18px] right-[18px] top-[18px] flex flex-wrap justify-between gap-2">
              <span className={`inline-flex items-center gap-2 rounded-[10px] border bg-[rgba(4,7,14,0.85)] px-3 py-2 text-[13px] font-semibold ${estadoChip.borde} ${estadoChip.color}`}>
                <span className={`h-2 w-2 rounded-full ${estadoChip.punto}`} />
                {estadoChip.texto} <span className="font-mono">{reloj(seg)} / {reloj(TOTAL)}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {checks.map((c) => (
                  <span key={c.k} className={`rounded-[10px] border bg-[rgba(4,7,14,0.85)] px-2.5 py-1.5 text-xs font-semibold ${c.ok ? 'border-[#1E5A43] text-[#8FF0C4]' : 'border-[#5C4A1C] text-[#F5D79A]'}`}>
                    {c.k}: {c.txt}
                  </span>
                ))}
              </span>
            </div>

            {fase !== 'midiendo' && !(fase === 'completo' && tarjetaCerrada) && (
              <div className="absolute left-1/2 top-1/2 flex w-[min(320px,88%)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3.5 rounded-[20px] border border-line-strong bg-[rgba(10,15,27,0.92)] px-[26px] py-[24px] text-center">
                {fase === 'completo' && (
                  <button type="button" onClick={() => setTarjetaCerrada(true)} aria-label="Cerrar" title="Cerrar"
                    className="absolute right-2 top-2 inline-flex h-12 w-12 items-center justify-center rounded-xl text-soft hover:bg-panel hover:text-ink">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                )}
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={fase === 'analizando' ? 'animate-spin' : ''}>
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                  <circle cx="12" cy="12" r="3.5" />
                </svg>
                <p className="m-0 font-display text-lg font-semibold">{tarjeta[fase][0]}</p>
                <p className="m-0 text-[13px] leading-normal text-soft">{tarjeta[fase][1]}</p>
                {fase !== 'analizando' && (
                  <button type="button" onClick={iniciar} disabled={!camaraLista}
                    className="inline-flex min-h-14 items-center justify-center rounded-xl bg-accent px-5 text-base font-semibold text-[#04121C] hover:bg-[#8AD9F8] disabled:opacity-50">
                    {tarjeta[fase][2]}
                  </button>
                )}
                {fase === 'pausa' && (
                  <button type="button" onClick={reiniciarTodo} disabled={!camaraLista}
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel disabled:opacity-50">
                    Reiniciar desde cero
                  </button>
                )}
                {fase === 'completo' && final?.luz && <p className="m-0 text-xs text-warn">Durante la medición: {final.luz.toLowerCase()}</p>}
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-b from-transparent to-[rgba(4,7,14,0.92)] px-[22px] pb-5 pt-[18px]">
              <div className="flex items-center gap-3.5">
                <p aria-live="polite" className={`m-0 flex-1 text-[15px] ${pistaMala ? 'text-[#F5D79A]' : 'text-[#C5CEDF]'}`}>{pista}</p>
                {fase === 'completo' && tarjetaCerrada && (
                  <button type="button" onClick={iniciar} disabled={!camaraLista}
                    className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-[rgba(10,15,27,0.8)] px-4 text-base font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel disabled:opacity-50">
                    Repetir medición
                  </button>
                )}
                {midiendo && (
                  <>
                    <button type="button" onClick={reiniciarTodo} title="Empezar la medición otra vez desde 00:00"
                      className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-[rgba(10,15,27,0.8)] px-4 text-base font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel">
                      Reiniciar
                    </button>
                    <button type="button" onClick={() => setFase('pausa')}
                      className="min-h-14 rounded-xl bg-[rgba(10,15,27,0.8)] px-5 text-base font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel">
                      Pausar
                    </button>
                  </>
                )}
              </div>
              <div className="h-1 rounded-sm bg-line">
                <div className={`h-full rounded-sm transition-all duration-300 ease-linear ${fase === 'completo' ? 'bg-ok' : pistaMala ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${Math.round((seg / TOTAL) * 100)}%` }} />
              </div>
            </div>
          </CameraView>
          <p className="m-0 text-xs leading-relaxed text-muted">
            La cámara no lee emociones ni mide presión. Mide el cambio de color de tu piel con cada latido (rPPG) y cuánto tiempo pasan cerrados tus ojos.
            Nada del video sale de este equipo: solo se guardan los números.
          </p>
        </div>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <section aria-labelledby="hr" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-[22px]">
            <div className="flex items-center justify-between">
              <h2 id="hr" className="m-0 font-display text-base font-semibold">Ritmo cardiaco</h2>
              <span className="rounded-md bg-[#0B2636] px-2 py-1 text-[11px] font-semibold tracking-wide text-[#8AD9F8]">rPPG · Real</span>
            </div>
            <div className="flex items-center gap-3.5">
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" className={hayRitmo && midiendo ? 'animate-beat' : ''}
                style={hayRitmo ? { animationDuration: `${(60 / (bpm ?? 72)).toFixed(2)}s` } : undefined}>
                <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill={hayRitmo && !bajaConfianza ? 'var(--color-crit)' : '#46536F'} />
              </svg>
              <p className={`m-0 font-mono text-[44px] font-bold tracking-tight transition-colors ${bajaConfianza ? 'text-muted' : 'text-ink'}`}>{hayRitmo ? bpm : '--'}</p>
              <span className="text-sm text-soft">lpm</span>
              {bajaConfianza && <span className="ml-auto rounded-md bg-[#2A2312] px-2 py-1 text-[11px] font-semibold text-warn">Baja confianza</span>}
            </div>
            <PulseWave valores={onda} />
            {terminado && hayRitmo && (
              <p className="m-0 text-xs">
                {verif?.estado === 'verificado' && verif.umbral !== null
                  ? final.confianzaMotor >= verif.umbral
                    ? <span className="text-[#8FF0C4]">✓ Lectura verificada: con esta confianza la cámara acierta ±{verif.tolerancia_lpm} lpm el {Math.round((verif.sobre_umbral?.exito_5 ?? 0) * 100)}% de las veces</span>
                    : <span className="text-warn">Confianza {final.confianzaMotor.toFixed(2)}, debajo del umbral verificado ({verif.umbral.toFixed(1)}): tómala con cautela</span>
                  : <span className="text-muted">Cámara aún sin validar con aparato de referencia.</span>}
              </p>
            )}
            <p className="m-0 text-[13px] text-soft">
              {hayRitmo
                ? terminado ? 'Calculado con el tramo más limpio de 20 s de la medición' : 'Calculado con el color de frente y mejillas en los últimos 20 segundos'
                : senalDebil ? 'Señal débil, no se muestra un ritmo poco confiable' : 'Se necesitan unos segundos de señal estable'}
            </p>
          </section>

          <section aria-labelledby="calidad" className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-[22px]">
            <div className="flex items-baseline justify-between">
              <h2 id="calidad" className="m-0 font-display text-base font-semibold">Calidad de la señal</h2>
              <span className="font-mono text-[13px] text-soft">{onda.length > 0 || terminado ? `confianza ${confianzaMostrada.toFixed(2)}` : 'sin señal'}</span>
            </div>
            <div role="img" aria-label={`Calidad ${barrasCalidad} de 5`} className="grid grid-cols-5 gap-[5px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`h-2 rounded-[3px] transition-colors duration-500 ${i < barrasCalidad ? (barrasCalidad <= 2 ? 'bg-warn' : 'bg-ok') : 'bg-line'}`} />
              ))}
            </div>
            <p className="m-0 text-[13px] leading-normal text-soft">
              Con menos de <span className="font-mono">{CONFIANZA_MINIMA}</span> no se muestra el ritmo y hasta <span className="font-mono">{CONFIANZA_BUENA}</span> sale en gris.
              Solo las lecturas buenas entran a tu normal.
            </p>
          </section>


          {terminado && (
            <section aria-labelledby="exp" className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong bg-panel p-[22px]">
              <div className="flex items-center justify-between">
                <h2 id="exp" className="m-0 font-display text-base font-semibold">Señales experimentales</h2>
                <span className="rounded-md bg-[#2A2312] px-2 py-1 text-[11px] font-semibold text-warn">No alertan</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Estrés (VFC)</p>
                  <p className="mt-1 font-mono text-[22px] font-bold">{final.hrv ?? '--'}<span className="text-sm text-soft"> ms</span></p>
                </div>
                <div>
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Respiración</p>
                  <p className="mt-1 font-mono text-[22px] font-bold">{final.resp ?? '--'}<span className="text-sm text-soft"> /min</span></p>
                </div>
                <div>
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Expresividad</p>
                  <p className="mt-1 font-mono text-[22px] font-bold">{exprHoy !== null ? exprHoy.toFixed(2) : '--'}</p>
                </div>
              </div>
              <p className="m-0 text-xs leading-relaxed text-muted">
                VFC (RMSSD) más baja suele ir con más estrés. {exprHoy !== null && exprNormal !== null && (normalExpr?.linea_base.n ?? 0) >= 3
                  ? `Tu expresividad de hoy es ${exprHoy > exprNormal * 1.15 ? 'más alta' : exprHoy < exprNormal * 0.85 ? 'más baja' : 'parecida a'} ${exprHoy > exprNormal * 1.15 || exprHoy < exprNormal * 0.85 ? 'que' : ''} tu normal (${exprNormal.toFixed(2)}).`
                  : 'La expresividad se compara contra tu normal cuando haya al menos 3 chequeos.'}
                {final.hrv === null && ' La VFC no salió: la señal no fue lo bastante limpia.'}
              </p>
            </section>
          )}

          {terminado && (
            <p className={`m-0 text-xs ${envio === 'enviado' ? 'text-[#8FF0C4]' : envio === 'pendiente' ? 'text-warn' : 'text-muted'}`} role="status">
              {envio === 'enviado' ? '✓ Guardado en tu historial y analizado por el motor'
                : envio === 'pendiente' ? 'Sin conexión con la base: se guardó en este equipo y se enviará al reconectar'
                  : !server ? 'Sin back: el resultado queda solo en este equipo' : 'Enviando…'}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onCancelar} className="min-h-14 rounded-xl px-5 text-base font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel">
              Salir
            </button>
            <button type="button" onClick={onSiguiente} disabled={midiendo || fase === 'analizando'}
              className={`min-h-14 rounded-xl px-5 text-base font-semibold disabled:opacity-50 ${fase === 'completo' ? 'bg-accent text-[#04121C] hover:bg-[#8AD9F8]' : 'shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel'}`}>
              {fase === 'completo' ? 'Siguiente: prueba cognitiva' : 'Saltar este paso'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
