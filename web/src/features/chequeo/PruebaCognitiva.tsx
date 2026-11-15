import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import StepBar from './components/StepBar'
import { sesionesCognitivas, sumarSesionCognitiva, useChequeoStore, type ResultadoCognitivo } from './chequeoStore'
import { medicionesCognitivo } from './envio'
import { baseMedicion, enviarPaso } from './enviar'
import { useSession } from '../../store/useSession'

// Meteor watch: una PVT (Psychomotor Vigilance Task) con juego de ir / no ir (go / no-go).
// La prueba de vigilancia es la que usa NASA en la ISS (versión de 3 minutos de Basner y Dinges).
// Aquí son 30 segundos, con ritmo rápido. Se responde SIEMPRE con la misma acción, sin apuntar (tocar en cualquier lado o
// la barra espaciadora), así el tiempo de reacción sigue siendo comparable con el de la PVT clásica.
// - Meteorito verde (carga): hay que responder lo más rápido posible. Eso da el tiempo de reacción.
// - Meteorito rojo (escombro): NO se toca. Tocarlo es un error de impulsividad (cuenta como falso).
// - Tiempo de reacción: mediana de las respuestas (menos sensible a un toque distraído que el promedio).
// - Lapso: respuesta de más de 500 ms. Un meteorito verde sin respuesta cuenta como 1800 ms.
// - Falso: tocar antes de que aparezca un meteorito, tocar en menos de 100 ms o tocar un escombro.
const DURACION_MS = 30_000
const ESPERA_MIN = 800
const ESPERA_MAX = 2400
const LAPSO_MS = 500
const ANTICIPACION_MS = 100
const VENTANA_GO_MS = 1800 // sin respuesta en este tiempo el meteorito se va y cuenta como lapso de 1800 ms
const VENTANA_NOGO_MS = 1100
const P_NOGO = 0.35
const SESIONES_PRACTICA = 3

type Fase = 'inicio' | 'espera' | 'meteoro' | 'falso' | 'completo'
type Tipo = 'go' | 'nogo'
type Extra = { escombros: number; evitados: number; toques: number }

const VERDE = '#3DDC97'
const ROJO = '#FF6B7A'

// Estrellas fijas del fondo (la misma posición en cada render)
function useEstrellas() {
  return useMemo(() => {
    let s = 12345
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    return Array.from({ length: 70 }, () => ({ x: r() * 100, y: r() * 100, t: 1 + r() * 1.6, o: 0.25 + r() * 0.6 }))
  }, [])
}

// Roca irregular con cráteres. Verde = carga (ir), rojo = escombro al rojo vivo (no ir).
// Se distinguen por color, por el brillo y por la X blanca del escombro.
const ROCA = 'M44 5 L63 9 L78 21 L83 40 L77 60 L64 76 L45 83 L26 78 L11 64 L6 44 L12 25 L27 11 Z'
function Roca({ go, id, tam }: { go: boolean; id: number; tam: number }) {
  const c = go ? VERDE : ROJO
  const claro = go ? '#9CF5CE' : '#FFB3BB'
  const oscuro = go ? '#0F3B2C' : '#4A1018'
  return (
    <svg viewBox="0 0 90 90" width={tam} height={tam} style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id={`r${id}`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={claro} stopOpacity="0.9" />
          <stop offset="35%" stopColor={c} />
          <stop offset="100%" stopColor={oscuro} />
        </radialGradient>
      </defs>
      <path d={ROCA} fill={`url(#r${id})`} stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="33" cy="34" rx="10" ry="7" fill={oscuro} fillOpacity="0.55" />
      <ellipse cx="56" cy="52" rx="13" ry="9" fill={oscuro} fillOpacity="0.5" transform="rotate(-20 56 52)" />
      <ellipse cx="38" cy="62" rx="6" ry="4" fill={oscuro} fillOpacity="0.5" />
      <ellipse cx="62" cy="28" rx="5" ry="3.5" fill={oscuro} fillOpacity="0.45" />
      <path d="M20 26 Q32 14 48 12" stroke={claro} strokeOpacity="0.6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {!go && <path d="M30 30 L60 60 M60 30 L30 60" stroke="#FFFFFF" strokeOpacity="0.92" strokeWidth="6" strokeLinecap="round" />}
    </svg>
  )
}

// Meteorito: roca que gira, con cola de fuego en tres capas y chispas.
function Meteorito({ tipo, escala, ensayo, duracionMs, quieto }: { tipo: Tipo; escala: number; ensayo: number; duracionMs: number; quieto: boolean }) {
  const go = tipo === 'go'
  const color = go ? VERDE : ROJO
  const tam = Math.round(92 * escala)
  const capas = [{ w: 240, h: 40, o: 0.28, b: 8 }, { w: 190, h: 24, o: 0.5, b: 4 }, { w: 130, h: 10, o: 0.9, b: 1 }]
  const chispas = [[70, 30, 3], [95, 55, 2], [120, 40, 2.5], [60, 70, 2]]
  return (
    <motion.div
      key={ensayo}
      aria-hidden
      className="pointer-events-none absolute"
      style={{ width: 0, height: 0 }}
      initial={{ x: 0, y: 0 }}
      animate={quieto ? { x: 0, y: 0 } : { x: -110, y: 110 }}
      transition={{ duration: duracionMs / 1000, ease: 'linear' }}
    >
      {capas.map((t, i) => (
        <span key={i} className="absolute" style={{ left: 0, top: 0, width: t.w * escala, height: t.h * escala, transform: 'translate(0, -50%) rotate(-45deg)', transformOrigin: '0 50%', background: `linear-gradient(90deg, ${i === 2 ? '#FFFFFF' : color}${Math.round(t.o * 255).toString(16).padStart(2, '0')}, transparent)`, borderRadius: 40, filter: `blur(${t.b}px)` }} />
      ))}
      {chispas.map(([x, y, r], i) => (
        <span key={i} className="absolute rounded-full" style={{ left: x * escala, top: -y * escala, width: r, height: r, background: color, opacity: 0.8, boxShadow: `0 0 6px ${color}` }} />
      ))}
      <motion.span
        className="absolute"
        style={{ width: tam, height: tam, left: -tam / 2, top: -tam / 2, filter: `drop-shadow(0 0 ${Math.round(16 * escala)}px ${color}CC)` }}
        initial={{ scale: 0.3, opacity: 0, rotate: 0 }}
        animate={quieto ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1, rotate: go ? 70 : -90 }}
        transition={{ scale: { duration: 0.1 }, opacity: { duration: 0.1 }, rotate: { duration: duracionMs / 1000, ease: 'linear' } }}
      >
        <Roca go={go} id={ensayo} tam={tam} />
      </motion.span>
    </motion.div>
  )
}

export default function PruebaCognitiva({ onSiguiente, onAtras }: { onSiguiente: () => void; onAtras: () => void }) {
  const usuario = useSession((s) => s.user?.id ?? 'A1')
  const guardado = useChequeoStore((s) => s.cognitivo)
  const envio = useChequeoStore((s) => s.envios.cognitivo)
  const guardar = useChequeoStore((s) => s.guardarCognitivo)
  const quieto = useReducedMotion() ?? false
  const estrellas = useEstrellas()
  const [fase, setFase] = useState<Fase>(guardado ? 'completo' : 'inicio')
  const [tipo, setTipo] = useState<Tipo>('go')
  const [pos, setPos] = useState({ x: 50, y: 40 })
  const [ensayo, setEnsayo] = useState(0)
  const [escala, setEscala] = useState(1)
  const [aviso, setAviso] = useState('')
  const [ultimo, setUltimo] = useState<number | null>(null)
  const [restante, setRestante] = useState(DURACION_MS)
  const [resultado, setResultado] = useState<ResultadoCognitivo | null>(guardado)
  const [extra, setExtra] = useState<Extra | null>(null)

  const tiempos = useRef<number[]>([])
  const falsos = useRef(0)
  const toques = useRef(0) // toques a escombros
  const evitados = useRef(0) // escombros que se dejaron pasar
  const escombros = useRef(0) // escombros que aparecieron
  const inicio = useRef(0)
  const aparecio = useRef(0)
  const ensayoId = useRef(0)
  const racha = useRef(0)
  const tipoActual = useRef<Tipo>('go')
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
    setExtra({ escombros: escombros.current, evitados: evitados.current, toques: toques.current })
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
      // Un escombro no sale de primero ni más de dos veces seguidas
      const nogo = ensayoId.current > 0 && racha.current < 2 && Math.random() < P_NOGO
      const t: Tipo = nogo ? 'nogo' : 'go'
      const id = ++ensayoId.current
      tipoActual.current = t
      racha.current = nogo ? racha.current + 1 : 0
      if (nogo) escombros.current++
      setTipo(t)
      setEnsayo(id)
      setPos({ x: 16 + Math.random() * 68, y: 24 + Math.random() * 52 })
      setEscala(0.7 + Math.random() * 0.6)
      aparecio.current = performance.now()
      setFase('meteoro')
      // El reloj se ajusta cuando el meteorito ya se pintó, para medir desde lo que se ve en pantalla
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (ensayoId.current === id && faseRef.current === 'meteoro') aparecio.current = performance.now()
      }))
      timer.current = setTimeout(() => {
        if (faseRef.current !== 'meteoro' || ensayoId.current !== id) return
        if (t === 'go') {
          // Sin respuesta cuenta como lapso largo y sigue
          tiempos.current.push(VENTANA_GO_MS)
          setUltimo(VENTANA_GO_MS)
        } else {
          evitados.current++ // dejó pasar el escombro: bien hecho
        }
        programarRef.current()
      }, t === 'go' ? VENTANA_GO_MS : VENTANA_NOGO_MS)
    }, espera)
  }, [terminar])
  useEffect(() => { programarRef.current = programar }, [programar])

  const empezar = () => {
    tiempos.current = []
    falsos.current = 0
    toques.current = 0
    evitados.current = 0
    escombros.current = 0
    ensayoId.current = 0
    racha.current = 0
    tipoActual.current = 'go'
    setUltimo(null)
    setResultado(null)
    setExtra(null)
    setRestante(DURACION_MS)
    inicio.current = Date.now()
    programar()
  }

  const marcarFalso = useCallback((mensaje: string) => {
    falsos.current++
    if (timer.current) clearTimeout(timer.current)
    setAviso(mensaje)
    setFase('falso')
    timer.current = setTimeout(programar, 900)
  }, [programar])

  const responder = useCallback(() => {
    const f = faseRef.current
    if (f === 'meteoro') {
      if (tipoActual.current === 'nogo') {
        toques.current++
        marcarFalso('That was debris. Don’t tap red meteors')
        return
      }
      if (timer.current) clearTimeout(timer.current)
      const rt = Math.round(performance.now() - aparecio.current)
      // Menos de 100 ms es anticipación, no reacción (criterio estándar de la PVT)
      if (rt < ANTICIPACION_MS) falsos.current++
      else tiempos.current.push(rt)
      setUltimo(rt)
      programar()
    } else if (f === 'espera') {
      marcarFalso('Too early, wait for a meteor')
    }
  }, [programar, marcarFalso])

  // Barra espaciadora también responde (más precisa que el mouse)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (faseRef.current === 'espera' || faseRef.current === 'meteoro')) {
        e.preventDefault()
        responder()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [responder])

  useEffect(() => {
    if (fase !== 'espera' && fase !== 'meteoro' && fase !== 'falso') return
    const id = setInterval(() => setRestante(Math.max(0, DURACION_MS - (Date.now() - inicio.current))), 250)
    return () => clearInterval(id)
  }, [fase])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const enCurso = fase === 'espera' || fase === 'meteoro' || fase === 'falso'
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
            aria-label={fase === 'meteoro' ? (tipo === 'go' ? 'Green cargo pod: tap now' : 'Red debris: do not tap') : 'Response area'}
            className={`relative aspect-[4/3] w-full select-none overflow-hidden rounded-[20px] border text-center transition-colors duration-75 ${
              fase === 'falso' ? 'border-warn bg-warn-bg' : 'border-line bg-void'
            } ${enCurso ? 'cursor-pointer' : 'cursor-default'}`}
          >
            {/* estrellas */}
            <span aria-hidden className="pointer-events-none absolute inset-0">
              {estrellas.map((e, i) => (
                <span key={i} className="absolute rounded-full bg-white" style={{ left: `${e.x}%`, top: `${e.y}%`, width: e.t, height: e.t, opacity: e.o }} />
              ))}
            </span>

            {fase === 'inicio' && (
              <span className="absolute inset-0 grid place-items-center">
                <span className="flex max-w-[420px] flex-col items-center gap-3 px-6">
                  <span className="font-display text-xl font-semibold">Meteor watch · 30 seconds</span>
                  <span className="flex items-center justify-center gap-5" aria-hidden><Roca go id={9001} tam={52} /><Roca go={false} id={9002} tam={52} /></span>
                  <span className="text-sm leading-relaxed text-soft">
                    <strong className="text-ok-soft">Green cargo pod:</strong> tap here or press the space bar as fast as you can.{' '}
                    <strong className="text-crit-soft">Red debris:</strong> don’t tap. Don’t tap early either.
                  </span>
                </span>
              </span>
            )}
            {fase === 'espera' && <span className="absolute inset-0 grid place-items-center text-sm text-muted">Watch the sky…</span>}
            {fase === 'meteoro' && (
              <span className="absolute" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                <Meteorito tipo={tipo} escala={escala} ensayo={ensayo} duracionMs={tipo === 'go' ? VENTANA_GO_MS : VENTANA_NOGO_MS} quieto={quieto} />
              </span>
            )}
            {fase === 'falso' && <span className="absolute inset-0 grid place-items-center px-6 font-semibold text-warn">{aviso}</span>}
            {fase === 'completo' && resultado && (
              <span className="absolute inset-0 grid place-items-center">
                <span className="flex flex-col items-center gap-2">
                  <span className="font-mono text-5xl font-bold">{Math.round(resultado.medianaMs)}<span className="text-xl text-soft"> ms</span></span>
                  <span className="text-sm text-soft">median of {resultado.estimulos} responses</span>
                </span>
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
            {extra && extra.escombros > 0 && (
              <p className="m-0 text-sm text-soft">Debris avoided: <strong className="font-mono text-ink">{extra.evitados}</strong> of {extra.escombros}{extra.toques > 0 ? ` (${extra.toques} tapped)` : ''}</p>
            )}
            <p className="m-0 text-[13px] leading-relaxed text-soft">
              A lapse is a response slower than 500 ms. A false start is tapping too early or tapping debris. {resultado?.practica || (!resultado && sesion < SESIONES_PRACTICA)
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
              <button type="button" onClick={() => { setFase('inicio'); setResultado(null); setExtra(null) }} className="btn sec">Repeat</button>
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
