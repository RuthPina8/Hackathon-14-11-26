import { useState } from 'react'
import StepBar from './components/StepBar'
import { calcularSueno, useChequeoStore, type Sintoma, type Sueno } from './chequeoStore'

// Síntomas agrupados por sistema, con las categorías que la NASA registra en la ISS
const SINTOMAS: { sistema: string; items: { id: string; nombre: string }[] }[] = [
  { sistema: 'Neurológico', items: [{ id: 'cefalea', nombre: 'Dolor de cabeza' }, { id: 'mareo', nombre: 'Mareo' }, { id: 'vision', nombre: 'Visión borrosa' }] },
  { sistema: 'Respiratorio', items: [{ id: 'congestion', nombre: 'Congestión nasal' }, { id: 'tos', nombre: 'Tos' }, { id: 'garganta', nombre: 'Dolor de garganta' }] },
  { sistema: 'Gastrointestinal', items: [{ id: 'nausea', nombre: 'Náusea' }, { id: 'apetito', nombre: 'Falta de apetito' }] },
  { sistema: 'Piel e inmune', items: [{ id: 'ronchas', nombre: 'Ronchas o erupción' }, { id: 'fiebre', nombre: 'Fiebre o escalofríos' }, { id: 'herpes', nombre: 'Fuegos en la boca' }] },
  { sistema: 'Musculoesquelético', items: [{ id: 'espalda', nombre: 'Dolor de espalda' }, { id: 'muscular', nombre: 'Dolor muscular' }] },
]

const ANIMOS = ['Muy mal', 'Mal', 'Regular', 'Bien', 'Muy bien']
const INTENSIDAD = ['', 'Leve', 'Moderado', 'Fuerte']

type Props = { onSiguiente: () => void; onAtras: () => void }

const campo = 'min-h-12 w-full rounded-xl border border-line-strong bg-nav px-4 text-ink box-border focus:outline-2 focus:outline-accent'

export default function RegistroManual({ onSiguiente, onAtras }: Props) {
  const guardarRegistro = useChequeoStore((s) => s.guardarRegistro)
  const previo = useChequeoStore((s) => s.registro)

  const [sis, setSis] = useState(previo?.presionSis?.toString() ?? '')
  const [dia, setDia] = useState(previo?.presionDia?.toString() ?? '')
  const [animo, setAnimo] = useState<number | null>(previo?.animo ?? null)
  const [palabra, setPalabra] = useState(previo?.palabra ?? '')
  const [estres, setEstres] = useState<number | null>(previo?.estres ?? null)
  const [sueno, setSueno] = useState<Sueno>(
    previo?.sueno ?? { acostarse: '23:00', latenciaMin: 15, despertares: 1, wasoMin: 10, despertar: '07:00', calidad: 3, medicamento: false },
  )
  const [registrarSueno, setRegistrarSueno] = useState(previo ? previo.sueno !== null : true)
  const [sintomas, setSintomas] = useState<Record<string, 1 | 2 | 3>>(
    Object.fromEntries((previo?.sintomas ?? []).map((s) => [s.id, s.intensidad])),
  )

  const sisN = Number(sis)
  const diaN = Number(dia)
  const presionCompleta = sis !== '' && dia !== '' && sisN > 0 && diaN > 0
  const presionInvalida = (sis !== '' || dia !== '') && (!presionCompleta || sisN <= diaN || sisN > 260 || diaN < 30)
  const presionFuera = presionCompleta && !presionInvalida && (sisN >= 140 || diaN >= 90 || sisN < 90 || diaN < 60)
  const resumenSueno = calcularSueno(sueno)

  // Cada toque sube la intensidad: sin síntoma, leve, moderado, fuerte y de regreso a sin síntoma
  const tocarSintoma = (id: string) =>
    setSintomas((s) => {
      const actual = s[id] ?? 0
      const siguiente = ((actual + 1) % 4) as 0 | 1 | 2 | 3
      const copia = { ...s }
      if (siguiente === 0) delete copia[id]
      else copia[id] = siguiente
      return copia
    })

  const siguiente = () => {
    const lista: Sintoma[] = SINTOMAS.flatMap((g) =>
      g.items.filter((i) => sintomas[i.id]).map((i) => ({ id: i.id, nombre: i.nombre, sistema: g.sistema, intensidad: sintomas[i.id] })),
    )
    guardarRegistro({
      presionSis: presionCompleta && !presionInvalida ? sisN : null,
      presionDia: presionCompleta && !presionInvalida ? diaN : null,
      animo,
      palabra: palabra.trim(),
      estres,
      sueno: registrarSueno ? sueno : null,
      sintomas: lista,
    })
    onSiguiente()
  }

  const cambiarSueno = <K extends keyof Sueno>(k: K, v: Sueno[K]) => setSueno((s) => ({ ...s, [k]: v }))

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="k">Chequeo diario · pasos 3 y 4 de 5</p>
            <h1 className="h1">Registro manual</h1>
          </div>
          <p className="m-0 text-sm text-soft">Lo que reportas tú pesa igual de importante que lo que mide la cámara</p>
        </div>
        <StepBar actual={2} />
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card flex flex-col gap-4" aria-labelledby="pa">
          <div className="flex items-center justify-between"><h2 id="pa" className="h2 text-lg">Presión arterial</h2><span className="tag self">Autorreportado</span></div>
          <p className="m-0 text-[13px] leading-normal text-soft">Si tienes brazalete (kit médico), mídela sentado y en reposo. Si no, déjala vacía</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">
              Sistólica (mmHg)
              <input className={`${campo} num text-2xl font-bold`} type="number" inputMode="numeric" value={sis} onChange={(e) => setSis(e.target.value)} placeholder="118" />
            </label>
            <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">
              Diastólica (mmHg)
              <input className={`${campo} num text-2xl font-bold`} type="number" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="76" />
            </label>
          </div>
          {presionInvalida && <p className="m-0 rounded-xl bg-[#2A1218] px-3.5 py-3 text-sm text-[#FFB8BF]">Revisa los números: la sistólica debe ser mayor que la diastólica</p>}
          {presionCompleta && !presionInvalida && (
            <p className={`m-0 flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm ${presionFuera ? 'bg-[#241D0D] text-[#F5D79A]' : 'bg-[#0E2A20] text-[#8FF0C4]'}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${presionFuera ? 'bg-warn' : 'bg-ok'}`} />
              {presionFuera ? 'Fuera del rango clínico de referencia, se revisará en tu resumen' : 'Dentro del rango clínico de referencia'}
            </p>
          )}
        </section>

        <section className="card flex flex-col gap-4" aria-labelledby="animo">
          <div className="flex items-center justify-between"><h2 id="animo" className="h2 text-lg">¿Cómo te sientes hoy?</h2><span className="tag self">Autorreportado</span></div>
          <div role="group" aria-label="Ánimo del 1 al 5" className="grid grid-cols-5 gap-2">
            {ANIMOS.map((nombre, i) => {
              const on = animo === i + 1
              return (
                <button
                  key={nombre}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAnimo(i + 1)}
                  className={`flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl ${on ? 'border-2 border-self bg-[#211A3D] text-ink' : 'border border-line-strong bg-nav text-soft'}`}
                >
                  <span className="num text-[22px] font-bold">{i + 1}</span>
                  <span className="text-xs">{nombre}</span>
                </button>
              )
            })}
          </div>
          <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">
            Descríbelo en una palabra
            <input className={campo} type="text" value={palabra} onChange={(e) => setPalabra(e.target.value)} placeholder="cansada, tranquilo, enfocada…" />
          </label>
          <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">
            <span className="flex justify-between">Estrés de hoy <span className="num text-ink">{estres === null ? 'sin responder' : `${estres} de 10`}</span></span>
            <input type="range" min={0} max={10} step={1} value={estres ?? 5} onChange={(e) => setEstres(Number(e.target.value))} aria-label="Estrés de 0 a 10" />
            <span className="flex justify-between text-xs text-muted"><span>0 nada</span><span>10 máximo</span></span>
          </label>
          <p className="m-0 text-xs text-muted">La cámara aprende de tus registros; lo que cuenta es lo que tú reportas</p>
        </section>
      </div>

      <section className="card flex flex-col gap-4" aria-labelledby="sueno">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sueno" className="h2 text-lg">Sueño de anoche</h2>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-soft">
              <input type="checkbox" checked={registrarSueno} onChange={(e) => setRegistrarSueno(e.target.checked)} className="h-[18px] w-[18px] accent-[#B7A4FF]" />
              Registrar
            </label>
            <span className="tag self">Autorreportado</span>
          </div>
        </div>
        {registrarSueno && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">Me acosté a las<input className={campo} type="time" value={sueno.acostarse} onChange={(e) => cambiarSueno('acostarse', e.target.value)} /></label>
              <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">Minutos para dormirme<input className={`${campo} num`} type="number" min={0} value={sueno.latenciaMin} onChange={(e) => cambiarSueno('latenciaMin', Number(e.target.value))} /></label>
              <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">Veces que desperté<input className={`${campo} num`} type="number" min={0} value={sueno.despertares} onChange={(e) => cambiarSueno('despertares', Number(e.target.value))} /></label>
              <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">Minutos despierta en total<input className={`${campo} num`} type="number" min={0} value={sueno.wasoMin} onChange={(e) => cambiarSueno('wasoMin', Number(e.target.value))} /></label>
              <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">Desperté a las<input className={campo} type="time" value={sueno.despertar} onChange={(e) => cambiarSueno('despertar', e.target.value)} /></label>
              <div className="flex flex-col gap-2 text-[13px] font-medium text-soft">
                Calidad (1 a 5)
                <div role="group" aria-label="Calidad del sueño" className="segs">
                  {[1, 2, 3, 4, 5].map((c) => (
                    <button key={c} type="button" className="seg flex-1" aria-pressed={sueno.calidad === c} onClick={() => cambiarSueno('calidad', c)}>{c}</button>
                  ))}
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 self-end pb-3 text-sm text-soft md:col-span-2">
                <input type="checkbox" checked={sueno.medicamento} onChange={(e) => cambiarSueno('medicamento', e.target.checked)} className="h-[18px] w-[18px] accent-[#B7A4FF]" />
                Tomé medicamento para dormir
              </label>
            </div>
            <p className="m-0 text-sm text-soft">
              Dormiste <strong className="num text-ink">{resumenSueno.horas.toFixed(1)} h</strong> con eficiencia de{' '}
              <strong className={`num ${resumenSueno.eficiencia < 85 ? 'text-warn' : 'text-ink'}`}>{Math.round(resumenSueno.eficiencia)}%</strong>
              {resumenSueno.horas < 6 && <span className="text-warn">, menos de 6 h cuenta como deuda de sueño</span>}
            </p>
          </>
        )}
      </section>

      <section className="card flex flex-col gap-4" aria-labelledby="sint">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sint" className="h2 text-lg">Síntomas de hoy</h2>
          <span className="text-[13px] text-soft">Toca para marcar y otra vez para subir la intensidad</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SINTOMAS.map((g) => (
            <div key={g.sistema} className="flex flex-col gap-2">
              <p className="k">{g.sistema}</p>
              {g.items.map((s) => {
                const n = sintomas[s.id] ?? 0
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={n > 0}
                    onClick={() => tocarSintoma(s.id)}
                    className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 text-left text-sm ${n ? 'border border-self bg-[#1B1633] text-ink' : 'border border-line-strong bg-nav text-soft'}`}
                  >
                    {s.nombre}
                    <span className="flex items-center gap-1" aria-label={n ? INTENSIDAD[n] : 'Sin síntoma'}>
                      {[1, 2, 3].map((k) => (
                        <span key={k} className={`h-2 w-2 rounded-full ${k <= n ? 'bg-self' : 'bg-line'}`} />
                      ))}
                      {n > 0 && <span className="ml-1.5 text-xs text-[#C9BCFF]">{INTENSIDAD[n]}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className="btn sec" onClick={onAtras}>Atrás</button>
        <button type="button" className="btn pri" onClick={siguiente} disabled={presionInvalida} style={presionInvalida ? { opacity: 0.5 } : undefined}>
          Guardar y ver resumen
        </button>
      </div>
    </div>
  )
}
