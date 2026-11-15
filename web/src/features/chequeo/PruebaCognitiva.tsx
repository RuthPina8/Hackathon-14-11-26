import { useCallback, useEffect, useRef, useState } from 'react'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import CameraView from './components/CameraView'
import StepBar from './components/StepBar'
import type { Roi } from './camara/landmarks'
import { CONFIANZA_MINIMA, useRppg } from './camara/useRppg'
import { usePerclos } from './camara/usePerclos'
import { tuNormal, useChequeoStore } from './chequeoStore'

type Prueba = 'rt' | 'mem' | 'att'

const INTENTOS_RT = 10
const ESTIMULOS_ATT = 20
const SESIONES_PRACTICA = 3

const INFO: Record<Prueba, string> = {
  rt: 'Velocidad de respuesta. Si sube más de 10% sobre tu normal suele indicar fatiga o falta de sueño',
  mem: 'Memoria de trabajo visual. Cada acierto agrega una casilla',
  att: 'Atención sostenida. Las omisiones indican cansancio y las falsas alarmas impulsividad',
}

const mediana = (a: number[]) => {
  if (!a.length) return null
  const o = [...a].sort((x, y) => x - y)
  return Math.round(o[Math.floor(o.length / 2)])
}

type Props = { onSiguiente: () => void; onAtras: () => void }

export default function PruebaCognitiva({ onSiguiente, onAtras }: Props) {
  const historial = useChequeoStore((s) => s.historial)
  const guardarCognitivo = useChequeoStore((s) => s.guardarCognitivo)
  const sesion = historial.length + 1
  const practica = historial.length < SESIONES_PRACTICA
  const normalRt = tuNormal(historial.filter((s) => s.cognitivoContado), 'reaccionMs')
  const normalMem = tuNormal(historial.filter((s) => s.cognitivoContado), 'memoria')

  const [prueba, setPrueba] = useState<Prueba>('rt')

  // ---------- cámara midiendo bajo carga mental ----------
  const { bpm, confianza, registrar: registrarColor } = useRppg()
  const { perclos, registrar: registrarOjos } = usePerclos()
  const onResultado = useCallback(
    (r: FaceLandmarkerResult, t: number) => registrarOjos(r.faceBlendshapes[0]?.categories, t),
    [registrarOjos],
  )
  const onCuadro = useCallback((video: HTMLVideoElement, rois: Roi[], t: number) => registrarColor(video, rois, t), [registrarColor])
  const bpmValido = bpm !== null && confianza >= CONFIANZA_MINIMA ? bpm : null

  // ---------- tiempo de reacción ----------
  const [fase, setFase] = useState<'idle' | 'wait' | 'go' | 'early' | 'done'>('idle')
  const [intentos, setIntentos] = useState<number[]>([])
  const [anticipaciones, setAnticipaciones] = useState(0)
  const t0 = useRef(0)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tocarRt = () => {
    if (fase === 'wait') {
      if (espera.current) clearTimeout(espera.current)
      setAnticipaciones((n) => n + 1)
      setFase('early')
      return
    }
    if (fase === 'go') {
      const ms = performance.now() - t0.current
      setIntentos((l) => [...l, ms].slice(-INTENTOS_RT))
      setFase('done')
      return
    }
    if (intentos.length >= INTENTOS_RT && fase === 'done') setIntentos([])
    setFase('wait')
    espera.current = setTimeout(() => {
      t0.current = performance.now()
      setFase('go')
    }, 900 + Math.random() * 1600)
  }

  const RT = {
    idle: { bg: '#22314F', fg: '#E8ECF4', ring: '#0A0F1B', glow: 'transparent', label: 'Empezar', msg: 'Toca para iniciar un intento' },
    wait: { bg: '#5C4A1C', fg: '#F5D79A', ring: '#241D0D', glow: 'transparent', label: 'Espera', msg: 'Aún no, espera la señal verde' },
    go: { bg: '#3DDC97', fg: '#04121C', ring: '#0E3325', glow: 'rgba(61,220,151,0.45)', label: 'Ahora', msg: 'Toca ya' },
    early: { bg: '#5A2A33', fg: '#FFB8BF', ring: '#2A1218', glow: 'transparent', label: 'Muy pronto', msg: 'Tocaste antes de tiempo, toca para repetir' },
    done: {
      bg: '#22314F', fg: '#E8ECF4', ring: '#0A0F1B', glow: 'transparent',
      label: intentos.length >= INTENTOS_RT ? 'Repetir' : 'Otra vez',
      msg: intentos.length >= INTENTOS_RT ? `Listo, ${INTENTOS_RT} intentos` : `Último intento: ${Math.round(intentos[intentos.length - 1] ?? 0)} ms`,
    },
  }[fase]
  const rtMediana = mediana(intentos)

  // ---------- memoria corta ----------
  const [mFase, setMFase] = useState<'idle' | 'show' | 'input' | 'ok' | 'fail'>('idle')
  const [mLen, setMLen] = useState(3)
  const [mSeq, setMSeq] = useState<number[]>([])
  const [mIn, setMIn] = useState<number[]>([])
  const [mLit, setMLit] = useState(-1)
  const [mFlash, setMFlash] = useState(-1)
  const [mBest, setMBest] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const limpiarTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const mostrarSecuencia = () => {
    limpiarTimers()
    const seq: number[] = []
    while (seq.length < mLen) {
      const c = Math.floor(Math.random() * 9)
      if (seq[seq.length - 1] !== c) seq.push(c)
    }
    setMSeq(seq)
    setMIn([])
    setMFlash(-1)
    setMFase('show')
    seq.forEach((c, i) => {
      timers.current.push(setTimeout(() => setMLit(c), 500 + i * 700))
      timers.current.push(setTimeout(() => setMLit(-1), 500 + i * 700 + 450))
    })
    timers.current.push(setTimeout(() => setMFase('input'), 500 + seq.length * 700))
  }

  const tocarCasilla = (i: number) => {
    if (mFase !== 'input') return
    const entrada = [...mIn, i]
    setMIn(entrada)
    setMFlash(i)
    if (mSeq[entrada.length - 1] !== i) {
      setMFase('fail')
      return
    }
    timers.current.push(setTimeout(() => setMFlash(-1), 220))
    if (entrada.length === mSeq.length) {
      setMBest((b) => Math.max(b, mLen))
      setMLen((l) => l + 1)
      setMFase('ok')
    }
  }

  const MEM = {
    idle: ['Memoriza el orden en que se iluminan las casillas', '#A3AEC4', 'Mostrar secuencia'],
    show: ['Observa con atención…', '#8AD9F8', ''],
    input: [`Tu turno: ${mIn.length} de ${mSeq.length}`, '#E8ECF4', ''],
    ok: [`Correcto, subes a ${mLen} casillas`, '#8FF0C4', 'Siguiente nivel'],
    fail: [`Fallaste en el paso ${mIn.length}, se queda en ${mLen} casillas`, '#FFB8BF', 'Reintentar'],
  }[mFase]

  // ---------- atención sostenida (go / no-go) ----------
  const [aFase, setAFase] = useState<'idle' | 'run' | 'done'>('idle')
  const [estimulo, setEstimulo] = useState<'target' | 'square' | 'tri' | null>(null)
  const [conteo, setConteo] = useState({ n: 0, aciertos: 0, omisiones: 0, falsas: 0 })
  const att = useRef({ n: 0, aciertos: 0, omisiones: 0, falsas: 0, actual: null as 'target' | 'square' | 'tri' | null, tocado: false })
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null)

  const detenerAtencion = () => {
    if (intervalo.current) clearInterval(intervalo.current)
    intervalo.current = null
  }

  const iniciarAtencion = () => {
    detenerAtencion()
    att.current = { n: 0, aciertos: 0, omisiones: 0, falsas: 0, actual: null, tocado: false }
    setConteo({ n: 0, aciertos: 0, omisiones: 0, falsas: 0 })
    setAFase('run')
    const paso = () => {
      const a = att.current
      if (a.actual === 'target' && !a.tocado) a.omisiones++
      if (a.n >= ESTIMULOS_ATT) {
        detenerAtencion()
        setEstimulo(null)
        setAFase('done')
        setConteo({ n: a.n, aciertos: a.aciertos, omisiones: a.omisiones, falsas: a.falsas })
        return
      }
      const r = Math.random()
      a.actual = r < 0.3 ? 'target' : r < 0.65 ? 'square' : 'tri'
      a.tocado = false
      a.n++
      setEstimulo(a.actual)
      setConteo({ n: a.n, aciertos: a.aciertos, omisiones: a.omisiones, falsas: a.falsas })
      timers.current.push(setTimeout(() => setEstimulo(null), 700))
    }
    intervalo.current = setInterval(paso, 1000)
    paso()
  }

  const tocarAtencion = () => {
    if (aFase !== 'run') {
      iniciarAtencion()
      return
    }
    const a = att.current
    if (a.tocado || !a.actual) return
    a.tocado = true
    if (a.actual === 'target') a.aciertos++
    else a.falsas++
    setConteo({ n: a.n, aciertos: a.aciertos, omisiones: a.omisiones, falsas: a.falsas })
  }

  useEffect(
    () => () => {
      limpiarTimers()
      detenerAtencion()
      if (espera.current) clearTimeout(espera.current)
    },
    [],
  )

  const cambiarPrueba = (p: Prueba) => {
    limpiarTimers()
    detenerAtencion()
    if (espera.current) clearTimeout(espera.current)
    if (fase === 'wait' || fase === 'go') setFase('idle')
    if (mFase === 'show' || mFase === 'input') setMFase('idle')
    if (aFase === 'run') setAFase('idle')
    setMLit(-1)
    setEstimulo(null)
    setPrueba(p)
  }

  const hechoRt = intentos.length >= INTENTOS_RT
  const hechoMem = mBest > 0
  const hechoAtt = aFase === 'done'
  const pestanas: [Prueba, string, boolean][] = [
    ['rt', 'Tiempo de reacción', hechoRt],
    ['mem', 'Memoria corta', hechoMem],
    ['att', 'Atención sostenida', hechoAtt],
  ]

  const siguiente = () => {
    guardarCognitivo({
      reaccionMs: rtMediana,
      intentos: intentos.length,
      anticipaciones,
      memoria: mBest || null,
      atencion: hechoAtt ? { aciertos: conteo.aciertos, omisiones: conteo.omisiones, falsas: conteo.falsas } : null,
      bpmCarga: bpmValido,
      perclosCarga: perclos,
      practica,
    })
    onSiguiente()
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="k">Chequeo diario · paso 2 de 5</p>
            <h1 className="h1">Prueba cognitiva</h1>
          </div>
          <p className="m-0 text-sm text-soft">Unos <strong className="text-ink">2 minutos</strong></p>
        </div>
        <StepBar actual={1} />
      </header>

      <div className="flex flex-wrap gap-5">
        <section className="card flex min-h-[600px] min-w-0 flex-[3_1_480px] flex-col overflow-hidden p-0" aria-label="Pruebas cognitivas">
          <div role="tablist" aria-label="Mini pruebas" className="grid grid-cols-3 border-b border-line">
            {pestanas.map(([id, nombre, hecho]) => {
              const abierta = id === prueba
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={abierta}
                  onClick={() => cambiarPrueba(id)}
                  className={`flex min-h-16 cursor-pointer flex-col items-start justify-center gap-1 border-0 px-5 text-left ${abierta ? 'bg-[#111A2C] shadow-[inset_0_-2px_0_var(--color-accent)]' : 'bg-transparent'}`}
                >
                  <span className="k" style={{ color: abierta ? '#8AD9F8' : hecho ? '#8FF0C4' : '#93A0B8' }}>
                    {abierta ? 'Abierta' : hecho ? 'Completada' : 'Pendiente'}
                  </span>
                  <span className={`text-[15px] font-semibold ${abierta ? 'text-white' : 'text-soft'}`}>{nombre}</span>
                </button>
              )
            })}
          </div>

          {prueba === 'rt' && (
            <div role="tabpanel" className="flex flex-1 flex-col items-center justify-center gap-[22px] px-6 pb-7 pt-6 text-center">
              <h2 className="m-0 font-display text-xl font-semibold">Toca el círculo en cuanto se ponga verde</h2>
              <button
                type="button"
                onClick={tocarRt}
                aria-label="Círculo de reacción"
                className="grid h-[200px] w-[200px] cursor-pointer place-items-center rounded-full border-0 font-display text-xl font-semibold transition-colors duration-100"
                style={{ background: RT.bg, color: RT.fg, boxShadow: `0 0 0 12px ${RT.ring}, 0 0 60px ${RT.glow}` }}
              >
                {RT.label}
              </button>
              <p aria-live="polite" className="m-0 min-h-[22px] text-[15px] text-soft">{RT.msg}</p>
              <div role="img" aria-label="Intentos de esta sesión" className="flex h-14 items-end gap-1.5">
                {intentos.map((ms, i) => (
                  <span key={i} className="flex flex-col items-center gap-1">
                    <span
                      className="w-[22px] rounded transition-all"
                      style={{ height: Math.max(8, Math.min(44, Math.round((ms - 150) / 5))), background: normalRt.media && ms > normalRt.media * 1.1 ? '#F5B544' : '#5CC8F5' }}
                    />
                    <span className="num text-[10px] text-muted">{Math.round(ms)}</span>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-9">
                <div><p className="k">Mediana</p><p className="big mt-1 text-[26px]">{rtMediana ? `${rtMediana} ms` : '--'}</p></div>
                <div><p className="k">Tu normal</p><p className="big mt-1 text-[26px] text-soft">{normalRt.media ? `${Math.round(normalRt.media)} ms` : 'aprendiendo'}</p></div>
                <div><p className="k">Intento</p><p className="big mt-1 text-[26px]">{intentos.length} de {INTENTOS_RT}</p></div>
              </div>
            </div>
          )}

          {prueba === 'mem' && (
            <div role="tabpanel" className="flex flex-1 flex-col items-center justify-center gap-[22px] px-6 pb-7 pt-6 text-center">
              <h2 className="m-0 font-display text-xl font-semibold">Repite la secuencia en el mismo orden</h2>
              <div role="group" aria-label="Cuadrícula de memoria" className="grid grid-cols-[repeat(3,84px)] gap-3 rounded-[22px] border border-line bg-nav p-[18px]">
                {Array.from({ length: 9 }, (_, i) => {
                  let bg = '#121B2E'
                  let glow = 'none'
                  if (mLit === i) { bg = '#5CC8F5'; glow = '0 0 30px rgba(92,200,245,0.55)' }
                  else if (mFlash === i && mFase === 'fail') { bg = '#FF6B7A'; glow = '0 0 24px rgba(255,107,122,0.5)' }
                  else if (mFlash === i) { bg = '#B7A4FF'; glow = '0 0 24px rgba(183,164,255,0.5)' }
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Casilla ${i + 1}`}
                      onClick={() => tocarCasilla(i)}
                      className="h-[84px] w-[84px] cursor-pointer rounded-2xl border border-line transition-all duration-150"
                      style={{ background: bg, boxShadow: glow }}
                    />
                  )
                })}
              </div>
              <p aria-live="polite" className="m-0 min-h-[22px] text-[15px]" style={{ color: MEM[1] }}>{MEM[0]}</p>
              {(mFase === 'idle' || mFase === 'ok' || mFase === 'fail') && (
                <button type="button" className="btn pri" onClick={mostrarSecuencia}>{MEM[2]}</button>
              )}
              <div className="flex flex-wrap justify-center gap-9">
                <div><p className="k">Nivel</p><p className="big mt-1 text-[26px]">{mLen}</p></div>
                <div><p className="k">Mejor hoy</p><p className="big mt-1 text-[26px]">{mBest || '—'}</p></div>
                <div><p className="k">Tu normal</p><p className="big mt-1 text-[26px] text-soft">{normalMem.media ? Math.round(normalMem.media) : 'aprendiendo'}</p></div>
              </div>
            </div>
          )}

          {prueba === 'att' && (
            <div role="tabpanel" className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-7 pt-6 text-center">
              <h2 className="m-0 font-display text-xl font-semibold">Toca solo cuando aparezca el círculo verde</h2>
              <p className="-mt-2.5 mb-0 text-sm text-soft">Ignora los cuadros y triángulos</p>
              <div aria-live="polite" className="grid h-[220px] w-[220px] place-items-center rounded-3xl border border-line bg-nav">
                {estimulo === 'target' && <span className="h-[120px] w-[120px] rounded-full bg-ok shadow-[0_0_50px_rgba(61,220,151,0.45)]" aria-label="Círculo verde" />}
                {estimulo === 'square' && <span className="h-[104px] w-[104px] rounded-[14px] bg-warn" aria-label="Cuadro" />}
                {estimulo === 'tri' && (
                  <svg width="126" height="112" viewBox="0 0 126 112" role="img" aria-label="Triángulo"><path d="M63 4 L122 108 L4 108 Z" fill="#B7A4FF" /></svg>
                )}
                {!estimulo && (
                  <span className="text-[15px] font-semibold text-muted">
                    {aFase === 'run' ? '' : aFase === 'done' ? `Listo, ${conteo.aciertos} aciertos` : 'Toca Empezar'}
                  </span>
                )}
              </div>
              <div className="h-1.5 w-[220px] rounded-sm bg-line">
                <div className="h-full rounded-sm bg-accent transition-all" style={{ width: `${Math.round((conteo.n / ESTIMULOS_ATT) * 100)}%` }} />
              </div>
              <button
                type="button"
                onClick={tocarAtencion}
                className="min-h-14 min-w-[220px] cursor-pointer rounded-2xl border-0 text-lg font-bold text-[#04121C]"
                style={{ background: aFase === 'run' ? '#3DDC97' : '#5CC8F5' }}
              >
                {aFase === 'run' ? 'Tocar' : aFase === 'done' ? 'Repetir' : 'Empezar'}
              </button>
              <div className="flex flex-wrap justify-center gap-8">
                <div><p className="k">Aciertos</p><p className="big mt-1 text-[26px] text-ok">{conteo.aciertos}</p></div>
                <div><p className="k">Omisiones</p><p className="big mt-1 text-[26px]">{conteo.omisiones}</p></div>
                <div><p className="k">Falsas alarmas</p><p className={`big mt-1 text-[26px] ${conteo.falsas > 2 ? 'text-warn' : ''}`}>{conteo.falsas}</p></div>
                <div><p className="k">Estímulo</p><p className="big mt-1 text-[26px]">{conteo.n} de {ESTIMULOS_ATT}</p></div>
              </div>
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <section className="card flex flex-col gap-3.5" aria-labelledby="cam">
            <div className="flex items-center justify-between"><h2 id="cam" className="h2">La cámara sigue midiendo</h2><span className="tag real">Real</span></div>
            <CameraView onResultado={onResultado} onCuadro={onCuadro} mostrarRois={false} maxFps={15} />
            <div className="grid grid-cols-2 gap-3">
              <div><p className="k">Ritmo bajo carga</p><p className="big mt-1 text-2xl">{bpmValido ?? '--'} <span className="text-[13px] font-medium text-soft">lpm</span></p></div>
              <div><p className="k">PERCLOS</p><p className="big mt-1 text-2xl">{perclos === null ? '--' : perclos.toFixed(2)}</p></div>
            </div>
            <p className="m-0 text-[13px] leading-normal text-soft">Medir mientras piensas muestra cómo responde tu cuerpo a la carga mental</p>
          </section>
          <section className="card flex flex-col gap-2" aria-labelledby="qmide">
            <h2 id="qmide" className="h2 text-[15px]">Qué mide</h2>
            <p className="m-0 text-[13px] leading-normal text-soft">{INFO[prueba]}</p>
          </section>
          <section className="card flex items-start gap-3.5" aria-labelledby="practica">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5CC8F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6M12 7.5v.5" />
            </svg>
            <div className="flex flex-col gap-1.5">
              <h2 id="practica" className="h2 text-[15px]">
                Sesión {sesion}, {practica ? `de práctica (${SESIONES_PRACTICA - historial.length} por hacer)` : 'ya cuenta para tu línea base'}
              </h2>
              <p className="m-0 text-[13px] leading-normal text-soft">Las primeras 3 sesiones son práctica, así el modelo no confunde aprender el juego con estar mejor</p>
            </div>
          </section>
          <div className="mt-auto flex flex-wrap justify-end gap-2.5">
            <button type="button" className="btn sec" onClick={onAtras}>Atrás</button>
            <button type="button" className="btn pri" onClick={siguiente}>Siguiente: presión</button>
          </div>
        </div>
      </div>
    </div>
  )
}
