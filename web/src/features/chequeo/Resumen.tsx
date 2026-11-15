import { Link } from 'react-router-dom'
import StepBar from './components/StepBar'
import { useChequeoStore, type EstadoEnvio } from './chequeoStore'
import { useAppStore } from '../../store/useAppStore'
import { useMyAlerts } from '../../store/selectors'
import ReadinessGauge from '../../components/ui/ReadinessRing'

// Paso 5: lo que se midió hoy, si llegó al motor y qué detectó.
const envioTxt: Record<EstadoEnvio, [string, string]> = {
  enviado: ['Analyzed', 'text-ok-soft'],
  pendiente: ['Queued, offline', 'text-warn'],
  sin_back: ['Only on this device', 'text-muted'],
}

export default function Resumen({ onIrA, onSalir }: { onIrA: (paso: number) => void; onSalir: () => void }) {
  const { camara, cognitivo, presion, registro, envios, alertas } = useChequeoStore()
  const status = useAppStore((s) => s.status)
  const statusReal = useAppStore((s) => s.statusReal)
  const pendientes = useAppStore((s) => s.pendientes.length)
  const activas = useMyAlerts().filter((a) => a.estado === 'activa')
  const nuevas = activas.filter((a) => alertas.includes(Number(a.id)))

  const filas: { paso: number; nombre: string; hecho: boolean; valor: string; envio?: EstadoEnvio; capa: 'real' | 'self' }[] = [
    { paso: 0, nombre: 'Camera', hecho: !!camara, capa: 'real', envio: envios.camara,
      valor: camara ? `${camara.bpm ?? '--'} bpm · ${camara.segundosValidos} usable s` : 'Pending' },
    { paso: 1, nombre: 'Attention test', hecho: !!cognitivo, capa: 'real', envio: envios.cognitivo,
      valor: cognitivo ? `${Math.round(cognitivo.medianaMs)} ms · ${cognitivo.lapsos} lapses${cognitivo.practica ? ' · practice' : ''}` : 'Pending' },
    { paso: 2, nombre: 'Blood pressure', hecho: !!presion, capa: 'self', envio: envios.presion,
      valor: presion ? ('omitida' in presion ? 'No cuff today' : `${presion.sis}/${presion.dia} mmHg`) : 'Pending' },
    { paso: 3, nombre: 'Mood, sleep and symptoms', hecho: !!registro, capa: 'self', envio: envios.registro,
      valor: registro ? `Mood ${registro.animo}/5 · stress ${registro.estres}/10 · ${registro.sintomas.length} symptoms` : 'Pending' },
  ]
  const hechos = filas.filter((f) => f.hecho).length

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div>
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Daily check-up · step 5 of 5</p>
          <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-tight">Today’s summary</h1>
        </div>
        <StepBar actual={4} />
      </header>

      <div className="flex flex-wrap gap-5">
        <section className="flex min-w-0 flex-[3_1_480px] flex-col gap-1 rounded-2xl border border-line bg-panel p-[22px]">
          <h2 className="m-0 mb-2 font-display text-base font-semibold">{hechos} of 4 steps done</h2>
          {filas.map((f) => (
            <div key={f.nombre} className="flex min-h-14 items-center gap-3 border-b border-line py-2 last:border-b-0">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-sm font-bold ${f.hecho ? 'bg-ok text-on-accent' : 'border-2 border-line-strong'}`}>{f.hecho ? '✓' : ''}</span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold">{f.nombre} <span className={`tag ${f.capa}`}>{f.capa === 'real' ? 'Real' : 'Auto'}</span></p>
                <p className="m-0 mt-0.5 font-mono text-[13px] text-soft">{f.valor}</p>
              </div>
              {f.envio && <span className={`text-sm font-semibold ${envioTxt[f.envio][1]}`}>{envioTxt[f.envio][0]}</span>}
              <button type="button" onClick={() => onIrA(f.paso)} className="btn sec sm">{f.hecho ? 'Redo' : 'Do'}</button>
            </div>
          ))}
          {pendientes > 0 && <p className="m-0 mt-2 text-sm text-warn">{pendientes} upload(s) waiting for the database connection; they’ll be sent automatically when reconnected.</p>}
        </section>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <section className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel p-[22px]">
            <ReadinessGauge value={statusReal && !status.nMediciones ? null : status.readiness} ayer={status.ayer} />
            <p className="m-0 text-center text-[13px] text-soft">
              {statusReal ? `Computed by the engine from ${status.nMediciones ?? 0} measurements · calibration ${status.calibracion}%` : 'No engine connection: sample value'}
            </p>
          </section>
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-[22px]">
            <h2 className="m-0 font-display text-base font-semibold">What the engine detected</h2>
            {nuevas.length > 0 ? (
              nuevas.map((a) => (
                <Link key={a.id} to={`/alerts?id=${a.id}`} className={`rounded-xl border p-3 text-sm no-underline ${a.nivel === 'crit' ? 'border-crit text-crit-soft' : 'border-warn text-warn-soft'}`}>
                  <strong>{a.titulo}</strong> · {a.resumen}
                </Link>
              ))
            ) : (
              <p className="m-0 text-sm text-soft">{statusReal ? 'Nothing outside your normal in today’s check-up.' : 'The analysis shows up when the engine is connected.'}</p>
            )}
            {activas.length > nuevas.length && <Link to="/alerts" className="text-[13px] font-semibold">See {activas.length} active alerts</Link>}
          </section>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={() => onIrA(3)} className="btn sec">Back</button>
            <button type="button" onClick={onSalir} className="btn pri">Finish and go Home</button>
          </div>
        </div>
      </div>
    </div>
  )
}
