import { useState } from 'react'
import StepBar from './components/StepBar'
import { useChequeoStore } from './chequeoStore'
import { medicionesPresion } from './envio'
import { baseMedicion, enviarPaso } from './enviar'
import { api } from '../../lib/api'
import GuiaAnimada from '../../components/animaciones/GuiaAnimada'
import { PASOS_BRAZALETE } from '../../components/animaciones/Brazalete'
import Brazalete3D from '../../components/animaciones/Brazalete3D'

// Paso 3: presión con el brazalete del kit médico (la cámara NO mide presión).
// Es opcional: sin brazalete se salta y en la demo la presión viene del simulador.
export default function RegistroPresion({ onSiguiente, onAtras }: { onSiguiente: () => void; onAtras: () => void }) {
  const guardado = useChequeoStore((s) => s.presion)
  const guardar = useChequeoStore((s) => s.guardarPresion)
  const envio = useChequeoStore((s) => s.envios.presion)
  const previo = guardado && !('omitida' in guardado) ? guardado : null
  const [sis, setSis] = useState(previo ? String(previo.sis) : '')
  const [dia, setDia] = useState(previo ? String(previo.dia) : '')
  const [pulso, setPulso] = useState(previo?.pulso ? String(previo.pulso) : '')
  const [error, setError] = useState<string | null>(null)

  const s = Number(sis)
  const d = Number(dia)
  const p = pulso ? Number(pulso) : null

  const validar = (): string | null => {
    if (!sis || !dia) return 'Enter the systolic and diastolic values'
    if (!Number.isFinite(s) || s < 60 || s > 260) return 'Systolic must be between 60 and 260 mmHg'
    if (!Number.isFinite(d) || d < 30 || d > 160) return 'Diastolic must be between 30 and 160 mmHg'
    if (d >= s) return 'Diastolic must be lower than systolic (did you enter them backwards?)'
    if (p !== null && (!Number.isFinite(p) || p < 30 || p > 220)) return 'Pulse must be between 30 and 220'
    return null
  }

  const enviar = () => {
    const e = validar()
    setError(e)
    if (e) return
    const r = { sis: s, dia: d, pulso: p, fecha: new Date().toISOString() }
    guardar(r)
    void enviarPaso('presion', medicionesPresion(r, baseMedicion()))
    // El pulso del brazalete sirve de referencia para validar a la cámara (si hubo chequeo hace < 15 min)
    if (p !== null) void api.post('/validacion/referencia', { astronauta_id: baseMedicion().astronauta_id, hr_lpm: p, fuente: 'brazalete' })
    onSiguiente()
  }

  const omitir = () => {
    guardar({ omitida: true, fecha: new Date().toISOString() })
    onSiguiente()
  }

  const campo = 'min-h-[60px] w-full rounded-xl border border-line-strong bg-input px-4 font-mono text-2xl font-bold text-ink outline-none focus:border-accent'
  const aviso = !validar() && (s >= 140 || d >= 90) ? 'High value: repeat the reading in 5 minutes, seated and on the other arm' : null

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div>
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Daily check-up · step 3 of 5</p>
          <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-tight">Blood pressure</h1>
        </div>
        <StepBar actual={2} />
      </header>
      <div className="flex flex-wrap gap-5">
        <div className="min-w-0 flex-[3_1_460px]">
          <GuiaAnimada titulo="How to measure with the cuff" pasos={PASOS_BRAZALETE} escena3D={(o) => <Brazalete3D {...o} />} />
        </div>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
        <section className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-[26px]">
          <p className="m-0 text-[15px] leading-relaxed text-soft">Only if you have the medical kit cuff. The camera does not measure blood pressure.</p>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-soft">Systolic (high)
              <input inputMode="numeric" className={campo} value={sis} onChange={(e) => setSis(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="118" aria-describedby="err-presion" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-soft">Diastolic (low)
              <input inputMode="numeric" className={campo} value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="76" aria-describedby="err-presion" />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-soft">Cuff pulse (optional, validates the camera)
            <input inputMode="numeric" className={campo} value={pulso} onChange={(e) => setPulso(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="64" />
          </label>
          <p id="err-presion" role="alert" className="m-0 min-h-5 text-sm text-warn">{error ?? aviso ?? ''}</p>
          <span className="w-fit rounded-md bg-[#1E1838] px-2 py-1 text-[13px] font-semibold text-[#C9BDFF]">Self-reported · auto layer</span>
          {envio && <p className="m-0 text-sm text-muted">Today’s latest blood pressure: {envio === 'enviado' ? 'saved' : 'pending upload'}</p>}
        </section>
        <div className="flex flex-col gap-2.5">
          <button type="button" data-tour="presion-guardar" onClick={enviar} className="btn pri">Save and continue</button>
          <button type="button" onClick={omitir} className="btn sec">I don’t have a cuff, skip</button>
          <button type="button" onClick={onAtras} className="btn sec">Back</button>
        </div>
        </div>
      </div>
    </div>
  )
}
