import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import StepBar from './components/StepBar'
import { ultimoSueno, useChequeoStore, type Sintoma, type Sueno } from './chequeoStore'
import { Stepper, StepperHora } from '../../components/ui/Stepper'
import { calcularSueno, medicionesRegistro } from './envio'
import { baseMedicion, enviarPaso } from './enviar'

// Paso 4: ánimo, estrés, sueño de anoche (Consensus Sleep Diary) y síntomas por sistema.
// Claves de síntomas = las de api/app/intelligence/immune.py (categorías de la NASA en la ISS).
// Los datos que se guardan y se envían son los mismos de siempre: solo cambió la presentación.
const GRUPOS: { sistema: string; icono: string; items: { clave: string; nombre: string }[] }[] = [
  { sistema: 'Immune and infections', icono: '🛡️', items: [
    { clave: 'fiebre', nombre: 'Fever or chills' }, { clave: 'congestion', nombre: 'Nasal congestion' },
    { clave: 'garganta', nombre: 'Sore throat' }, { clave: 'oido', nombre: 'Earache' },
    { clave: 'fuego_labial', nombre: 'Cold sore' }, { clave: 'erupcion_piel', nombre: 'Hives or rash' },
    { clave: 'infeccion_piel', nombre: 'Wound that won’t heal' }, { clave: 'urinario', nombre: 'Burning when urinating' },
  ] },
  { sistema: 'Head and balance', icono: '🧠', items: [
    { clave: 'dolor_cabeza', nombre: 'Headache' }, { clave: 'mareo', nombre: 'Dizziness' }, { clave: 'nausea', nombre: 'Nausea' },
  ] },
  { sistema: 'Eyes', icono: '👁️', items: [
    { clave: 'vision_borrosa', nombre: 'Blurred vision' }, { clave: 'ojos_irritados', nombre: 'Dry or irritated eyes' },
  ] },
  { sistema: 'Muscles and bones', icono: '💪', items: [
    { clave: 'dolor_espalda', nombre: 'Back pain' }, { clave: 'dolor_muscular', nombre: 'Muscle or joint pain' },
  ] },
  { sistema: 'Digestive', icono: '🍽️', items: [
    { clave: 'estrenimiento', nombre: 'Constipation' }, { clave: 'malestar_estomacal', nombre: 'Upset stomach' },
  ] },
]

const ANIMOS = [
  { t: 'Very bad', e: '😞', c: '#FF6B7A', frase: 'Sorry to hear it. Mark anything that hurts below.' },
  { t: 'Bad', e: '🙁', c: '#FF9B5E', frase: 'A rough day. The system will keep an eye on it.' },
  { t: 'Okay', e: '😐', c: '#F5C451', frase: 'Steady. That’s a fine baseline.' },
  { t: 'Good', e: '🙂', c: '#7ADBA0', frase: 'Good. Keep your routine going.' },
  { t: 'Very good', e: '😄', c: '#3DDC97', frase: 'Great! Your best days set your normal.' },
]
const SUENO_DEFECTO: Sueno = { acostarse: '23:00', intento: '23:00', latenciaMin: 15, despertares: 1, wasoMin: 10, despertar: '06:30', levantarse: '06:40', calidad: 3, medicamento: false }

// Color del estrés de 0 (verde) a 10 (rojo)
function colorEstres(i: number) {
  const cols = ['#3DDC97', '#58DC8A', '#7ADB7B', '#A3DB6A', '#CCD95C', '#F5C451', '#F7A74D', '#F98A4F', '#FA6F58', '#FB6068', '#FF4D6A']
  return cols[Math.max(0, Math.min(10, i))]
}
const etiquetaEstres = (e: number) => (e <= 2 ? 'Calm' : e <= 4 ? 'Mild' : e <= 6 ? 'Moderate' : e <= 8 ? 'High' : 'Very high')

// Anillo de eficiencia del sueño
function Anillo({ valor, color }: { valor: number; color: string }) {
  const r = 30
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, valor))
  return (
    <svg viewBox="0 0 76 76" width="76" height="76" aria-hidden>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--color-track)" strokeWidth="7" />
      <motion.circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" transform="rotate(-90 38 38)"
        strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - v / 100) }} transition={{ duration: 0.5 }} />
      <text x="38" y="43" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor" fontFamily="var(--font-mono)">{Math.round(v)}%</text>
    </svg>
  )
}

export default function RegistroAnimo({ onSiguiente, onAtras }: { onSiguiente: () => void; onAtras: () => void }) {
  const quieto = useReducedMotion() ?? false
  const guardado = useChequeoStore((s) => s.registro)
  const guardar = useChequeoStore((s) => s.guardarRegistro)
  const [animo, setAnimo] = useState<number | null>(guardado?.animo ?? null)
  const [estres, setEstres] = useState(guardado?.estres ?? 3)
  const [conSueno, setConSueno] = useState(guardado ? guardado.sueno !== null : true)
  // Se precarga con el último sueño registrado: solo se ajusta lo que cambió con + y −
  const [anterior] = useState(() => (guardado?.sueno ? null : ultimoSueno()))
  const [sueno, setSueno] = useState<Sueno>(guardado?.sueno ?? anterior ?? SUENO_DEFECTO)
  const [sintomas, setSintomas] = useState<Sintoma[]>(guardado?.sintomas ?? [])
  const [nota, setNota] = useState(guardado?.nota ?? '')
  const [error, setError] = useState<string | null>(null)
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})

  const calc = calcularSueno(sueno)
  const errorSueno = conSueno && (calc.tstH <= 0 || calc.tibH > 16) ? 'Check the times: the calculated sleep doesn’t make sense' : null
  const set = <K extends keyof Sueno>(k: K, v: Sueno[K]) => setSueno((s) => ({ ...s, [k]: v }))
  const marcado = (clave: string) => sintomas.some((s) => s.clave === clave && s.intensidad > 0)
  const alternar = (clave: string) =>
    setSintomas((l) => (l.some((s) => s.clave === clave) ? l.filter((s) => s.clave !== clave) : [...l, { clave, intensidad: 1 }]))
  const total = sintomas.filter((s) => s.intensidad > 0).length

  // Barra de la noche: de acostarse a levantarse. Latencia (ámbar), despierto (rojo) y dormido (azul).
  const barra = useMemo(() => {
    const tib = Math.max(1, calc.tibH * 60)
    const lat = Math.min(sueno.latenciaMin, tib)
    const waso = Math.min(sueno.wasoMin, Math.max(0, tib - lat))
    const resto = Math.max(0, tib - lat - waso)
    return { lat: (lat / tib) * 100, waso: (waso / tib) * 100, dorm: (resto / tib) * 100 }
  }, [calc.tibH, sueno.latenciaMin, sueno.wasoMin])
  const colorEf = calc.eficiencia >= 85 ? 'var(--color-ok)' : calc.eficiencia >= 75 ? 'var(--color-warn)' : 'var(--color-crit)'

  const enviar = () => {
    if (animo === null) { setError('Choose how you feel today'); return }
    if (errorSueno) { setError(errorSueno); return }
    const r = { animo, estres, sueno: conSueno ? sueno : null, sintomas, nota: nota.trim(), fecha: new Date().toISOString() }
    guardar(r)
    void enviarPaso('registro', medicionesRegistro(r, baseMedicion()))
    onSiguiente()
  }

  const progreso = [
    { n: 'Mood', hecho: animo !== null },
    { n: 'Sleep', hecho: !conSueno || !errorSueno },
    { n: total ? `${total} symptom${total > 1 ? 's' : ''}` : 'No symptoms', hecho: true },
  ]
  const a = animo !== null ? ANIMOS[animo - 1] : null

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div>
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Daily check-up · step 4 of 5</p>
          <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-tight">Mood, sleep and symptoms</h1>
        </div>
        <StepBar actual={3} />
        <div className="flex flex-wrap gap-2" aria-label="Progress of this step">
          {progreso.map((p) => (
            <span key={p.n} className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${p.hecho ? 'border-ok-line bg-ok-bg text-ok-soft' : 'border-line-strong text-muted'}`}>
              {p.hecho ? '✓ ' : '○ '}{p.n}
            </span>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap gap-5">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-5">
          {/* ÁNIMO */}
          <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-[22px]" aria-labelledby="animo">
            <h2 id="animo" className="m-0 font-display text-base font-semibold">How do you feel today?</h2>
            <div role="radiogroup" aria-label="Mood" className="grid grid-cols-5 gap-2">
              {ANIMOS.map((m, i) => {
                const sel = animo === i + 1
                return (
                  <motion.button key={m.t} type="button" role="radio" aria-checked={sel}
                    whileHover={quieto ? undefined : { y: -3 }} whileTap={quieto ? undefined : { scale: 0.94 }}
                    onClick={() => { setAnimo(i + 1); setError(null) }}
                    style={sel ? { borderColor: m.c, background: `${m.c}22`, boxShadow: `0 0 22px ${m.c}44` } : undefined}
                    className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-semibold transition-colors ${sel ? 'text-ink' : 'border-line-strong text-soft hover:bg-nav'}`}>
                    <motion.span className="text-[34px] leading-none" animate={sel && !quieto ? { scale: [1, 1.3, 1.12], rotate: [0, -8, 0] } : { scale: sel ? 1.12 : 1, rotate: 0 }} transition={{ duration: 0.35 }}>{m.e}</motion.span>
                    <span className="mt-1">{m.t}</span>
                  </motion.button>
                )
              })}
            </div>
            <div className="min-h-5 text-sm" aria-live="polite">
              <AnimatePresence mode="wait">
                {a && <motion.p key={animo} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="m-0" style={{ color: a.c }}>{a.frase}</motion.p>}
              </AnimatePresence>
            </div>

            {/* ESTRÉS: barra de 11 pasos */}
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between text-[13px] text-soft">
                <span>Stress</span>
                <strong className="font-mono text-ink"><span style={{ color: colorEstres(estres) }}>{etiquetaEstres(estres)}</span> · {estres} of 10</strong>
              </div>
              <div role="radiogroup" aria-label="Stress from 0 to 10" className="flex gap-1">
                {Array.from({ length: 11 }, (_, i) => (
                  <motion.button key={i} type="button" role="radio" aria-checked={estres === i} aria-label={`${i}`}
                    whileTap={quieto ? undefined : { scale: 0.9 }} onClick={() => setEstres(i)}
                    style={{ background: i <= estres ? colorEstres(i) : 'var(--color-track)', height: 14 + i * 3, opacity: i <= estres ? 1 : 0.7, outline: estres === i ? `2px solid ${colorEstres(i)}` : 'none', outlineOffset: 2 }}
                    className="flex-1 self-end rounded-md transition-all" />
                ))}
              </div>
              <span className="flex justify-between text-[13px] text-muted"><span>None</span><span>Maximum</span></span>
            </div>

            <label className="flex flex-col gap-1.5 text-[13px] text-soft">Anything you want to note (optional)
              <input value={nota} onChange={(e) => setNota(e.target.value.slice(0, 200))} className="min-h-14 rounded-xl border border-line-strong bg-input px-3 text-ink outline-none focus:border-accent" />
            </label>
            <p className="m-0 text-sm leading-relaxed text-muted">The camera learns from your logs; what counts is what you report.</p>
          </section>

          {/* SUEÑO */}
          <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-[22px]" aria-labelledby="sueno">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="sueno" className="m-0 font-display text-base font-semibold">Last night’s sleep</h2>
              <label className="flex items-center gap-2 text-[13px] text-soft">
                <input type="checkbox" checked={!conSueno} onChange={(e) => setConSueno(!e.target.checked)} />
                Logged by the Apple Watch
              </label>
            </div>
            {conSueno && (
              <>
                {anterior && <p className="m-0 text-[14px] text-soft">Prefilled with your last log: adjust only what changed.</p>}

                {/* resumen visual de la noche */}
                <div className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-void p-4">
                  <div className="flex items-center gap-3" style={{ color: colorEf }}>
                    <Anillo valor={errorSueno ? 0 : calc.eficiencia} color={colorEf} />
                    <div className="text-ink">
                      <p className="m-0 font-mono text-[26px] font-bold leading-none">{errorSueno ? '--' : calc.tstH.toFixed(1)}<span className="text-sm text-soft"> h</span></p>
                      <p className="m-0 mt-1 text-[13px] text-soft">asleep · efficiency</p>
                    </div>
                  </div>
                  <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                    <div className="flex justify-between text-[13px] text-soft"><span>🌙 {sueno.acostarse}</span><span>☀️ {sueno.levantarse}</span></div>
                    <div className="flex h-5 w-full overflow-hidden rounded-full bg-track" role="img" aria-label="Night timeline">
                      <motion.span initial={false} animate={{ width: `${barra.lat}%` }} style={{ background: '#F5C451' }} />
                      <motion.span initial={false} animate={{ width: `${barra.dorm}%` }} style={{ background: 'var(--color-accent)' }} />
                      <motion.span initial={false} animate={{ width: `${barra.waso}%` }} style={{ background: '#FF6B7A' }} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                      <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: '#F5C451' }} />falling asleep</span>
                      <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" />asleep</span>
                      <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: '#FF6B7A' }} />awake</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-x-5 gap-y-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
                  <StepperHora etiqueta="Went to bed" valor={sueno.acostarse} onCambiar={(v) => { set('acostarse', v); set('intento', v) }} />
                  <Stepper etiqueta="Time to fall asleep" unidad="min" paso={5} max={300} valor={sueno.latenciaMin} onCambiar={(v) => set('latenciaMin', v)} />
                  <Stepper etiqueta="Times I woke up" max={30} valor={sueno.despertares} onCambiar={(v) => set('despertares', v)} />
                  <Stepper etiqueta="Total minutes awake" unidad="min" paso={5} max={600} valor={sueno.wasoMin} onCambiar={(v) => set('wasoMin', v)} />
                  <StepperHora etiqueta="Woke up" valor={sueno.despertar} onCambiar={(v) => set('despertar', v)} />
                  <StepperHora etiqueta="Got up" valor={sueno.levantarse} onCambiar={(v) => set('levantarse', v)} />
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-[13px] text-soft">Quality</span>
                  <div role="radiogroup" aria-label="Sleep quality" className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((c) => (
                      <motion.button key={c} type="button" role="radio" aria-checked={sueno.calidad === c} aria-label={`${c} of 5`}
                        whileTap={quieto ? undefined : { scale: 0.85 }} onClick={() => set('calidad', c)}
                        className="grid h-[52px] w-[52px] place-items-center rounded-xl text-[32px] leading-none transition-all"
                        style={{ color: c <= sueno.calidad ? '#F5C451' : 'var(--color-track)', filter: c <= sueno.calidad ? 'drop-shadow(0 0 8px #F5C45188)' : 'none' }}>★</motion.button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-[13px] text-soft">
                    <input type="checkbox" checked={sueno.medicamento} onChange={(e) => set('medicamento', e.target.checked)} />I took sleep medication
                  </label>
                </div>
                <p className={`m-0 text-sm ${errorSueno ? 'text-warn' : 'text-soft'}`}>
                  {errorSueno ?? <>You slept <strong className="font-mono text-ink">{calc.tstH.toFixed(1)} h</strong> with an efficiency of <strong className="font-mono text-ink">{calc.eficiencia.toFixed(0)}%</strong> ({calc.tibH.toFixed(1)} h in bed)</>}
                </p>
              </>
            )}
          </section>
        </div>

        {/* SÍNTOMAS */}
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-[22px]" aria-labelledby="sint">
            <div className="flex items-center justify-between gap-2">
              <h2 id="sint" className="m-0 font-display text-base font-semibold">Today’s symptoms</h2>
              <motion.span key={total} initial={quieto ? false : { scale: 1.3 }} animate={{ scale: 1 }}
                className={`rounded-full px-2.5 py-1 font-mono text-[13px] font-bold ${total ? 'bg-warn-bg text-warn' : 'bg-ok-bg text-ok-soft'}`}>
                {total ? `${total} marked` : 'All clear'}
              </motion.span>
            </div>
            <p className="m-0 text-sm text-muted">Tap what you have today. Leave the rest alone.</p>
            {total > 0 && (
              <button type="button" onClick={() => setSintomas([])} className="btn sec self-start">Clear all: I feel fine</button>
            )}
            {GRUPOS.map((g) => {
              const n = g.items.filter((it) => marcado(it.clave)).length
              const abierto = abiertos[g.sistema] ?? (g === GRUPOS[0] || n > 0)
              return (
                <div key={g.sistema} className="overflow-hidden rounded-xl border border-line bg-void">
                  <button type="button" aria-expanded={abierto} onClick={() => setAbiertos((o) => ({ ...o, [g.sistema]: !abierto }))}
                    className="flex min-h-14 w-full items-center gap-3 px-3.5 text-left hover:bg-nav">
                    <span className="text-xl" aria-hidden>{g.icono}</span>
                    <span className="flex-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-soft">{g.sistema}</span>
                    {n > 0 && <span className="rounded-full bg-warn-bg px-2 py-0.5 font-mono text-[12px] font-bold text-warn">{n}</span>}
                    <motion.span animate={{ rotate: abierto ? 180 : 0 }} className="text-muted" aria-hidden>▾</motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {abierto && (
                      <motion.div initial={quieto ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="flex flex-wrap gap-2 px-3.5 pb-3.5 pt-1">
                          {g.items.map((it) => {
                            const on = marcado(it.clave)
                            return (
                              <motion.button key={it.clave} type="button" aria-pressed={on} whileTap={quieto ? undefined : { scale: 0.93 }}
                                onClick={() => alternar(it.clave)}
                                className={`min-h-12 rounded-full border-2 px-4 text-[15px] font-semibold transition-colors ${on ? 'border-warn bg-warn-bg text-warn' : 'border-line-strong text-soft hover:bg-nav'}`}>
                                {on ? '✓ ' : ''}{it.nombre}
                              </motion.button>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </section>
          <p role="alert" className="m-0 min-h-5 text-sm text-warn">{error ?? ''}</p>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onAtras} className="btn sec">Back</button>
            <button type="button" data-tour="registro-guardar" onClick={enviar} className="btn pri">Save and see summary</button>
          </div>
        </div>
      </div>
    </div>
  )
}
