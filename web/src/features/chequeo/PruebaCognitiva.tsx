import { useCallback, useEffect, useRef, useState } from 'react'
import StepBar from './components/StepBar'
import { sesionesCognitivas, sumarSesionCognitiva, useChequeoStore, type ResultadoCognitivo } from './chequeoStore'
import { medicionesCognitivo } from './envio'
import { baseMedicion, enviarPaso } from './enviar'
import { useSession } from '../../store/useSession'

// PVT corta (Psychomotor Vigilance Task): la prueba de atención sostenida que usa NASA en la ISS
// (versión de 3 minutos de Basner y Dinges). Aquí: 60 segundos, estímulos cada 2 a 6 s al azar.
// - Tiempo de reacción: mediana (menos sensible a un toque distraído que el promedio).
// - Lapso: respuesta de más de 500 ms (indicador clásico de fatiga).
// - Falso: tocar antes de que aparezca el estímulo.
const DURACION_MS = 60_000
const ESPERA_MIN = 2000
const ESPERA_MAX = 6000
const LAPSO_MS = 500
const SIN_RESPUESTA_MS = 3000
const SESIONES_PRACTICA = 3

type Fase = 'inicio' | 'espera' | 'estimulo' | 'falso' | 'completo'

export default function PruebaCognitiva({ onSiguiente, onAtras }: { onSiguiente: () => void; onAtras: () => void }) {
  const usuario = useSession((s) => s.user?.id ?? 'A1')
  const guardado = useChequeoStore((s) => s.cognitivo)
  const envio = useChequeoStore((s) => s.envios.cognitivo)
  const guardar = useChequeoStore((s) => s.guardarCognitivo)
  const [fase, setFase] = useState<Fase>(guardado ? 'completo' : 'inicio')
  const [ultimo, setUltimo] = useState<number | null>(null)
  const [restante, setRestante] = useState(DURACION_MS)
  const [resultado, setResultado] = useState<ResultadoCognitivo | null>(guardado)

  const tiempos = useRef<number[]>([])
  const falsos = useRef(0)
  const inicio = useRef(0)
  const aparecio = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const faseRef = useRef(fase)
  useEffect(() => { faseRef.current = fase }, [fase])

  const terminar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    const t = [...tiempos.current].sort((a, b) => a - b)
    const sesion = sesionesCognitivas(usuario)
    const r: ResultadoCognitivo = {
      medianaMs: t.length ? t[Math.floor(t.length / 2)] : 0,
      mediaMs: t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0,
      lapsos: t.filter((x) => x > LAPSO_MS).length,
      falsos: falsos.current,
      estimulos: t.length,
      practica: sesion < SESIONES_PRACTICA,
      fecha: new Date().toISOString(),
    }
    sumarSesionCognitiva(usuario)
    setResultado(r)
    setFase('completo')
    guardar(r)
    if (r.estimulos >= 5) void enviarPaso('cognitivo', medicionesCognitivo(r, baseMedicion()))
  }, [usuario, guardar])

  // programar() se vuelve a llamar a sí misma desde sus temporizadores: se usa por referencia
  const programarRef = useRef<() => void>(() => {})
  const programar = useCallback(() => {
    if (Date.now() - inicio.current >= DURACION_MS) { terminar(); return }
    setFase('espera')
    const espera = ESPERA_MIN + Math.random() * (ESPERA_MAX - ESPERA_MIN)
    timer.current = setTimeout(() => {
      aparecio.current = performance.now()
      setFase('estimulo')
      // Sin respuesta en 3 s cuenta como lapso largo y sigue
      timer.current = setTimeout(() => {
        if (faseRef.current !== 'estimulo') return
        tiempos.current.push(SIN_RESPUESTA_MS)
        setUltimo(SIN_RESPUESTA_MS)
        programarRef.current()
      }, SIN_RESPUESTA_MS)
    }, espera)
  }, [terminar])
  useEffect(() => { programarRef.current = programar }, [programar])

  const empezar = () => {
    tiempos.current = []
    falsos.current = 0
    setUltimo(null)
    setResultado(null)
    inicio.current = Date.now()
    programar()
  }

  const responder = useCallback(() => {
    const f = faseRef.current
    if (f === 'estimulo') {
      if (timer.current) clearTimeout(timer.current)
      const rt = Math.round(performance.now() - aparecio.current)
      // Menos de 100 ms es anticipación, no reacción (criterio estándar de la PVT)
      if (rt < 100) falsos.current++
      else tiempos.current.push(rt)
      setUltimo(rt)
      programar()
    } else if (f === 'espera') {
      falsos.current++
      if (timer.current) clearTimeout(timer.current)
      setFase('falso')
      timer.current = setTimeout(programar, 900)
    }
  }, [programar])

  // Barra espaciadora también responde (más precisa que el mouse)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (faseRef.current === 'espera' || faseRef.current === 'estimulo')) {
        e.preventDefault()
        responder()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [responder])

  useEffect(() => {
    if (fase !== 'espera' && fase !== 'estimulo' && fase !== 'falso') return
    const id = setInterval(() => setRestante(Math.max(0, DURACION_MS - (Date.now() - inicio.current))), 250)
    return () => clearInterval(id)
  }, [fase])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const enCurso = fase === 'espera' || fase === 'estimulo' || fase === 'falso'
  const sesion = sesionesCognitivas(usuario)

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div>
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Daily check-up · step 2 of 5</p>
          <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-tight">Attention test</h1>
        </div>
        <StepBar actual={1} />
      </header>

      <div className="flex flex-wrap gap-5">
        <section className="flex min-w-0 flex-[3_1_480px] flex-col gap-3">
          <button
            type="button"
            onPointerDown={(e) => { if (enCurso) { e.preventDefault(); responder() } }}
            disabled={!enCurso}
            aria-label={fase === 'estimulo' ? 'Tap now' : 'Response area'}
            className={`relative grid aspect-[4/3] w-full select-none place-items-center rounded-[20px] border text-center transition-colors duration-75 ${
              fase === 'estimulo' ? 'border-crit bg-crit-bg' : fase === 'falso' ? 'border-warn bg-warn-bg' : 'border-line bg-void'
            } ${enCurso ? 'cursor-pointer' : 'cursor-default'}`}
          >
            {fase === 'inicio' && (
              <span className="flex max-w-[380px] flex-col items-center gap-3 px-6">
                <span className="font-display text-xl font-semibold">60 seconds of attention</span>
                <span className="text-sm leading-relaxed text-soft">When the red circle appears, tap here or press the space bar as fast as you can. Don’t tap early.</span>
              </span>
            )}
            {fase === 'espera' && <span className="text-sm text-muted">Wait for the circle…</span>}
            {fase === 'estimulo' && <span className="h-28 w-28 rounded-full bg-crit shadow-[0_0_40px_var(--color-crit)]" />}
            {fase === 'falso' && <span className="font-semibold text-warn">Too early, wait for the circle</span>}
            {fase === 'completo' && resultado && (
              <span className="flex flex-col items-center gap-2">
                <span className="font-mono text-5xl font-bold">{Math.round(resultado.medianaMs)}<span className="text-xl text-soft"> ms</span></span>
                <span className="text-sm text-soft">median of {resultado.estimulos} responses</span>
              </span>
            )}
            {enCurso && (
              <span className="absolute left-4 top-4 rounded-[10px] border border-line-strong bg-[rgba(4,7,14,0.85)] px-3 py-1.5 font-mono text-[13px]">
                {Math.ceil(restante / 1000)} s
              </span>
            )}
            {enCurso && ultimo !== null && (
              <span className={`absolute right-4 top-4 rounded-[10px] px-3 py-1.5 font-mono text-[13px] ${ultimo > LAPSO_MS ? 'bg-warn-bg text-warn' : 'bg-ok-bg text-ok-soft'}`}>
                {ultimo} ms
              </span>
            )}
          </button>
          {fase === 'inicio' && (
            <button type="button" data-tour="atencion-empezar" onClick={empezar} className="btn pri">
              Start test
            </button>
          )}
        </section>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-[22px]">
            <div className="flex items-center justify-between">
              <h2 className="m-0 font-display text-base font-semibold">Result</h2>
              <span className="rounded-md bg-accent-bg px-2 py-1 text-[13px] font-semibold text-accent-soft">Test · Real</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Reaction</p><p className="mt-1 font-mono text-[24px] font-bold">{resultado ? Math.round(resultado.medianaMs) : '--'}</p></div>
              <div><p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Lapses</p><p className={`mt-1 font-mono text-[24px] font-bold ${resultado && resultado.lapsos > 2 ? 'text-warn' : ''}`}>{resultado?.lapsos ?? '--'}</p></div>
              <div><p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">False starts</p><p className="mt-1 font-mono text-[24px] font-bold">{resultado?.falsos ?? '--'}</p></div>
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-soft">
              Un lapso es una respuesta de más de 500 ms. {resultado?.practica || (!resultado && sesion < SESIONES_PRACTICA)
                ? `The first ${SESIONES_PRACTICA} sessions are practice and don’t count toward your normal (everyone improves while learning the test).`
                : 'This session counts toward your normal.'}
            </p>
            {resultado && resultado.estimulos < 5 && <p className="m-0 text-sm text-warn">Too few responses to save the result, repeat the test.</p>}
            {resultado && envio && (
              <p className={`m-0 text-sm ${envio === 'enviado' ? 'text-ok-soft' : 'text-warn'}`}>
                {envio === 'enviado' ? '✓ Saved and analyzed by the engine' : envio === 'pendiente' ? 'Saved on this device, it will be sent when reconnected' : 'No server: it stays on this device only'}
              </p>
            )}
          </section>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onAtras} disabled={enCurso} className="btn sec">Back</button>
            {fase === 'completo' && (
              <button type="button" onClick={() => { setFase('inicio'); setResultado(null) }} className="btn sec">Repeat</button>
            )}
            <button type="button" onClick={onSiguiente} disabled={enCurso}
              className={`btn ${fase === 'completo' ? 'pri' : 'sec'}`}>
              {fase === 'completo' ? 'Next: blood pressure' : 'Skip this step'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
