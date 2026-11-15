import { useState } from 'react'
import StepBar from './components/StepBar'
import { ultimoSueno, useChequeoStore, type Sintoma, type Sueno } from './chequeoStore'
import { Stepper, StepperHora } from '../../components/ui/Stepper'
import { calcularSueno, medicionesRegistro } from './envio'
import { baseMedicion, enviarPaso } from './enviar'

// Paso 4: ánimo, estrés, sueño de anoche (Consensus Sleep Diary) y síntomas por sistema.
// Claves de síntomas = las de api/app/intelligence/immune.py (categorías de la NASA en la ISS).
const GRUPOS: { sistema: string; items: { clave: string; nombre: string }[] }[] = [
  { sistema: 'Immune and infections', items: [
    { clave: 'fiebre', nombre: 'Fever or chills' }, { clave: 'congestion', nombre: 'Nasal congestion' },
    { clave: 'garganta', nombre: 'Sore throat' }, { clave: 'oido', nombre: 'Earache' },
    { clave: 'fuego_labial', nombre: 'Cold sore' }, { clave: 'erupcion_piel', nombre: 'Hives or rash' },
    { clave: 'infeccion_piel', nombre: 'Wound that won’t heal' }, { clave: 'urinario', nombre: 'Burning when urinating' },
  ] },
  { sistema: 'Head and balance', items: [
    { clave: 'dolor_cabeza', nombre: 'Headache' }, { clave: 'mareo', nombre: 'Dizziness' }, { clave: 'nausea', nombre: 'Nausea' },
  ] },
  { sistema: 'Eyes', items: [
    { clave: 'vision_borrosa', nombre: 'Blurred vision' }, { clave: 'ojos_irritados', nombre: 'Dry or irritated eyes' },
  ] },
  { sistema: 'Muscles and bones', items: [
    { clave: 'dolor_espalda', nombre: 'Back pain' }, { clave: 'dolor_muscular', nombre: 'Muscle or joint pain' },
  ] },
  { sistema: 'Digestive', items: [
    { clave: 'estrenimiento', nombre: 'Constipation' }, { clave: 'malestar_estomacal', nombre: 'Upset stomach' },
  ] },
]

const ANIMOS = ['Very bad', 'Bad', 'Okay', 'Good', 'Very good']
const SUENO_DEFECTO: Sueno = { acostarse: '23:00', intento: '23:00', latenciaMin: 15, despertares: 1, wasoMin: 10, despertar: '06:30', levantarse: '06:40', calidad: 3, medicamento: false }

export default function RegistroAnimo({ onSiguiente, onAtras }: { onSiguiente: () => void; onAtras: () => void }) {
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

  const calc = calcularSueno(sueno)
  const errorSueno = conSueno && (calc.tstH <= 0 || calc.tibH > 16) ? 'Check the times: the calculated sleep doesn’t make sense' : null
  const set = <K extends keyof Sueno>(k: K, v: Sueno[K]) => setSueno((s) => ({ ...s, [k]: v }))
  const intensidad = (clave: string) => sintomas.find((s) => s.clave === clave)?.intensidad ?? 0
  const cambiar = (clave: string, i: number) =>
    setSintomas((l) => (i === 0 ? l.filter((s) => s.clave !== clave) : [...l.filter((s) => s.clave !== clave), { clave, intensidad: i }]))

  const enviar = () => {
    if (animo === null) { setError('Choose how you feel today'); return }
    if (errorSueno) { setError(errorSueno); return }
    const r = { animo, estres, sueno: conSueno ? sueno : null, sintomas, nota: nota.trim(), fecha: new Date().toISOString() }
    guardar(r)
    void enviarPaso('registro', medicionesRegistro(r, baseMedicion()))
    onSiguiente()
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div>
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Daily check-up · step 4 of 5</p>
          <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-tight">Mood, sleep and symptoms</h1>
        </div>
        <StepBar actual={3} />
      </header>

      <div className="flex flex-wrap gap-5">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-5">
          <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-[22px]" aria-labelledby="animo">
            <h2 id="animo" className="m-0 font-display text-base font-semibold">How do you feel today?</h2>
            <div role="radiogroup" aria-label="Mood" className="grid grid-cols-5 gap-2">
              {ANIMOS.map((t, i) => (
                <button key={t} type="button" role="radio" aria-checked={animo === i + 1} onClick={() => { setAnimo(i + 1); setError(null) }}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold ${animo === i + 1 ? 'border-accent bg-accent-bg text-ink' : 'border-line-strong text-soft hover:bg-nav'}`}>
                  <span className="font-mono text-lg">{i + 1}</span>{t}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-2 text-[13px] text-soft">
              <span className="flex justify-between"><span>Stress</span><strong className="font-mono text-ink">{estres} of 10</strong></span>
              <input type="range" min={0} max={10} value={estres} onChange={(e) => setEstres(Number(e.target.value))} aria-label="Stress from 0 to 10" />
              <span className="flex justify-between text-[13px] text-muted"><span>None</span><span>Maximum</span></span>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] text-soft">Anything you want to note (optional)
              <input value={nota} onChange={(e) => setNota(e.target.value.slice(0, 200))} className="min-h-14 rounded-xl border border-line-strong bg-input px-3 text-ink outline-none focus:border-accent" />
            </label>
            <p className="m-0 text-sm leading-relaxed text-muted">The camera learns from your logs; what counts is what you report.</p>
          </section>

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
                  <div role="radiogroup" aria-label="Sleep quality" className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={sueno.calidad === c} onClick={() => set('calidad', c)}
                        className={`h-[60px] w-[60px] rounded-xl border-2 font-mono text-lg font-bold active:translate-y-[2px] ${sueno.calidad === c ? 'border-accent bg-accent-bg' : 'border-line-strong text-soft'}`}>{c}</button>
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

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-[22px]" aria-labelledby="sint">
            <h2 id="sint" className="m-0 font-display text-base font-semibold">Today’s symptoms</h2>
            <p className="m-0 text-sm text-muted">Mark Yes if you have it today. If not, leave it on No.</p>
            {GRUPOS.map((g) => (
              <div key={g.sistema} className="flex flex-col gap-1">
                <p className="m-0 mt-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{g.sistema}</p>
                {g.items.map((it) => {
                  const v = intensidad(it.clave)
                  return (
                    <div key={it.clave} className="flex min-h-14 items-center gap-2 text-base">
                      <span className={`flex-1 ${v ? 'text-ink' : 'text-soft'}`}>{it.nombre}</span>
                      {([['No', 0], ['Yes', 1]] as const).map(([texto, valor]) => {
                        const activo = valor === 0 ? v === 0 : v > 0
                        return (
                          <button key={texto} type="button" aria-label={`${it.nombre}: ${texto}`} aria-pressed={activo} onClick={() => cambiar(it.clave, valor)}
                            className={`h-[60px] w-20 rounded-xl border-2 text-base font-bold active:translate-y-[2px] ${activo ? (valor === 1 ? 'border-warn bg-warn-bg text-warn' : 'border-line-strong bg-panel text-ink') : 'border-line-strong text-muted'}`}>{texto}</button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
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
