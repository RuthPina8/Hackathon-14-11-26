import { useState } from 'react'
import StepBar from './components/StepBar'
import { useChequeoStore, type Sintoma, type Sueno } from './chequeoStore'
import { calcularSueno, medicionesRegistro } from './envio'
import { baseMedicion, enviarPaso } from './enviar'

// Paso 4: ánimo, estrés, sueño de anoche (Consensus Sleep Diary) y síntomas por sistema.
// Claves de síntomas = las de api/app/intelligence/immune.py (categorías de la NASA en la ISS).
const GRUPOS: { sistema: string; items: { clave: string; nombre: string }[] }[] = [
  { sistema: 'Inmune e infecciones', items: [
    { clave: 'fiebre', nombre: 'Fiebre o escalofríos' }, { clave: 'congestion', nombre: 'Congestión nasal' },
    { clave: 'garganta', nombre: 'Dolor de garganta' }, { clave: 'oido', nombre: 'Dolor de oído' },
    { clave: 'fuego_labial', nombre: 'Fuego labial' }, { clave: 'erupcion_piel', nombre: 'Ronchas o erupción' },
    { clave: 'infeccion_piel', nombre: 'Herida que no sana' }, { clave: 'urinario', nombre: 'Ardor al orinar' },
  ] },
  { sistema: 'Cabeza y equilibrio', items: [
    { clave: 'dolor_cabeza', nombre: 'Dolor de cabeza' }, { clave: 'mareo', nombre: 'Mareo' }, { clave: 'nausea', nombre: 'Náusea' },
  ] },
  { sistema: 'Ojos', items: [
    { clave: 'vision_borrosa', nombre: 'Visión borrosa' }, { clave: 'ojos_irritados', nombre: 'Ojos secos o irritados' },
  ] },
  { sistema: 'Músculos y huesos', items: [
    { clave: 'dolor_espalda', nombre: 'Dolor de espalda' }, { clave: 'dolor_muscular', nombre: 'Dolor muscular o articular' },
  ] },
  { sistema: 'Digestivo', items: [
    { clave: 'estrenimiento', nombre: 'Estreñimiento' }, { clave: 'malestar_estomacal', nombre: 'Malestar estomacal' },
  ] },
]

const ANIMOS = ['Muy mal', 'Mal', 'Regular', 'Bien', 'Muy bien']
const SUENO_DEFECTO: Sueno = { acostarse: '23:00', intento: '23:00', latenciaMin: 15, despertares: 1, wasoMin: 10, despertar: '06:30', levantarse: '06:40', calidad: 3, medicamento: false }

export default function RegistroAnimo({ onSiguiente, onAtras }: { onSiguiente: () => void; onAtras: () => void }) {
  const guardado = useChequeoStore((s) => s.registro)
  const guardar = useChequeoStore((s) => s.guardarRegistro)
  const [animo, setAnimo] = useState<number | null>(guardado?.animo ?? null)
  const [estres, setEstres] = useState(guardado?.estres ?? 3)
  const [conSueno, setConSueno] = useState(guardado ? guardado.sueno !== null : true)
  const [sueno, setSueno] = useState<Sueno>(guardado?.sueno ?? SUENO_DEFECTO)
  const [sintomas, setSintomas] = useState<Sintoma[]>(guardado?.sintomas ?? [])
  const [nota, setNota] = useState(guardado?.nota ?? '')
  const [error, setError] = useState<string | null>(null)

  const calc = calcularSueno(sueno)
  const errorSueno = conSueno && (calc.tstH <= 0 || calc.tibH > 16) ? 'Revisa los horarios: el sueño calculado no tiene sentido' : null
  const set = <K extends keyof Sueno>(k: K, v: Sueno[K]) => setSueno((s) => ({ ...s, [k]: v }))
  const intensidad = (clave: string) => sintomas.find((s) => s.clave === clave)?.intensidad ?? 0
  const cambiar = (clave: string, i: number) =>
    setSintomas((l) => (i === 0 ? l.filter((s) => s.clave !== clave) : [...l.filter((s) => s.clave !== clave), { clave, intensidad: i }]))

  const enviar = () => {
    if (animo === null) { setError('Elige cómo te sientes hoy'); return }
    if (errorSueno) { setError(errorSueno); return }
    const r = { animo, estres, sueno: conSueno ? sueno : null, sintomas, nota: nota.trim(), fecha: new Date().toISOString() }
    guardar(r)
    void enviarPaso('registro', medicionesRegistro(r, baseMedicion()))
    onSiguiente()
  }

  const hora = 'min-h-11 rounded-xl border border-line-strong bg-[#080C16] px-3 font-mono text-ink outline-none focus:border-accent'
  const num = `${hora} w-24`

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Chequeo diario · paso 4 de 5</p>
          <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-tight">Ánimo, sueño y síntomas</h1>
        </div>
        <StepBar actual={3} />
      </header>

      <div className="flex flex-wrap gap-5">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-5">
          <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-[22px]" aria-labelledby="animo">
            <h2 id="animo" className="m-0 font-display text-base font-semibold">¿Cómo te sientes hoy?</h2>
            <div role="radiogroup" aria-label="Ánimo" className="grid grid-cols-5 gap-2">
              {ANIMOS.map((t, i) => (
                <button key={t} type="button" role="radio" aria-checked={animo === i + 1} onClick={() => { setAnimo(i + 1); setError(null) }}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold ${animo === i + 1 ? 'border-accent bg-[#0B2636] text-ink' : 'border-line-strong text-soft hover:bg-nav'}`}>
                  <span className="font-mono text-lg">{i + 1}</span>{t}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-2 text-[13px] text-soft">
              <span className="flex justify-between"><span>Estrés</span><strong className="font-mono text-ink">{estres} de 10</strong></span>
              <input type="range" min={0} max={10} value={estres} onChange={(e) => setEstres(Number(e.target.value))} aria-label="Estrés de 0 a 10" />
              <span className="flex justify-between text-[11px] text-muted"><span>Nada</span><span>Máximo</span></span>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] text-soft">Algo que quieras anotar (opcional)
              <input value={nota} onChange={(e) => setNota(e.target.value.slice(0, 200))} className="min-h-14 rounded-xl border border-line-strong bg-[#080C16] px-3 text-ink outline-none focus:border-accent" />
            </label>
            <p className="m-0 text-xs leading-relaxed text-muted">La cámara aprende de tus registros; lo que cuenta es lo que tú reportas.</p>
          </section>

          <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-[22px]" aria-labelledby="sueno">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="sueno" className="m-0 font-display text-base font-semibold">Sueño de anoche</h2>
              <label className="flex items-center gap-2 text-[13px] text-soft">
                <input type="checkbox" checked={!conSueno} onChange={(e) => setConSueno(!e.target.checked)} />
                Lo registra el Apple Watch
              </label>
            </div>
            {conSueno && (
              <>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <label className="flex flex-col gap-1.5 text-[13px] text-soft">Me acosté<input type="time" className={hora} value={sueno.acostarse} onChange={(e) => { set('acostarse', e.target.value); set('intento', e.target.value) }} /></label>
                  <label className="flex flex-col gap-1.5 text-[13px] text-soft">Tardé en dormirme (min)<input type="number" min={0} max={300} className={num} value={sueno.latenciaMin} onChange={(e) => set('latenciaMin', Math.max(0, Number(e.target.value)))} /></label>
                  <label className="flex flex-col gap-1.5 text-[13px] text-soft">Veces que desperté<input type="number" min={0} max={30} className={num} value={sueno.despertares} onChange={(e) => set('despertares', Math.max(0, Number(e.target.value)))} /></label>
                  <label className="flex flex-col gap-1.5 text-[13px] text-soft">Minutos despierto en total<input type="number" min={0} max={600} className={num} value={sueno.wasoMin} onChange={(e) => set('wasoMin', Math.max(0, Number(e.target.value)))} /></label>
                  <label className="flex flex-col gap-1.5 text-[13px] text-soft">Desperté<input type="time" className={hora} value={sueno.despertar} onChange={(e) => set('despertar', e.target.value)} /></label>
                  <label className="flex flex-col gap-1.5 text-[13px] text-soft">Me levanté<input type="time" className={hora} value={sueno.levantarse} onChange={(e) => set('levantarse', e.target.value)} /></label>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-[13px] text-soft">Calidad</span>
                  <div role="radiogroup" aria-label="Calidad del sueño" className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={sueno.calidad === c} onClick={() => set('calidad', c)}
                        className={`h-10 w-10 rounded-lg border font-mono text-sm font-bold ${sueno.calidad === c ? 'border-accent bg-[#0B2636]' : 'border-line-strong text-soft'}`}>{c}</button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-[13px] text-soft">
                    <input type="checkbox" checked={sueno.medicamento} onChange={(e) => set('medicamento', e.target.checked)} />Tomé medicamento para dormir
                  </label>
                </div>
                <p className={`m-0 text-sm ${errorSueno ? 'text-warn' : 'text-soft'}`}>
                  {errorSueno ?? <>Dormiste <strong className="font-mono text-ink">{calc.tstH.toFixed(1)} h</strong> con eficiencia de <strong className="font-mono text-ink">{calc.eficiencia.toFixed(0)}%</strong> ({calc.tibH.toFixed(1)} h en cama)</>}
                </p>
              </>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-[22px]" aria-labelledby="sint">
            <h2 id="sint" className="m-0 font-display text-base font-semibold">Síntomas de hoy</h2>
            <p className="m-0 text-xs text-muted">Toca la intensidad: 1 leve, 2 moderado, 3 fuerte. Sin marcar = no lo tienes.</p>
            {GRUPOS.map((g) => (
              <div key={g.sistema} className="flex flex-col gap-1">
                <p className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{g.sistema}</p>
                {g.items.map((it) => {
                  const v = intensidad(it.clave)
                  return (
                    <div key={it.clave} className="flex min-h-14 items-center gap-2 text-base">
                      <span className={`flex-1 ${v ? 'text-ink' : 'text-soft'}`}>{it.nombre}</span>
                      {[1, 2, 3].map((i) => (
                        <button key={i} type="button" aria-label={`${it.nombre}, intensidad ${i}`} aria-pressed={v === i} onClick={() => cambiar(it.clave, v === i ? 0 : i)}
                          className={`h-8 w-8 rounded-lg border font-mono text-xs font-bold ${v === i ? (i === 3 ? 'border-crit bg-[#2A1218] text-[#FFB8BF]' : 'border-warn bg-[#241D0D] text-warn') : 'border-line-strong text-muted'}`}>{i}</button>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </section>
          <p role="alert" className="m-0 min-h-5 text-sm text-warn">{error ?? ''}</p>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onAtras} className="min-h-14 rounded-xl px-5 text-base font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel">Atrás</button>
            <button type="button" onClick={enviar} className="min-h-14 rounded-xl bg-accent px-5 text-base font-semibold text-[#04121C] hover:bg-[#8AD9F8]">Guardar y ver resumen</button>
          </div>
        </div>
      </div>
    </div>
  )
}
