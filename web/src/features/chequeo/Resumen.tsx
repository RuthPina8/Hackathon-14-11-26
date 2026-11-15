import { Link } from 'react-router-dom'
import StepBar from './components/StepBar'
import { useChequeoStore, type EstadoEnvio } from './chequeoStore'
import { useAppStore } from '../../store/useAppStore'
import { useMyAlerts } from '../../store/selectors'
import ReadinessGauge from '../../components/ui/ReadinessRing'

// Paso 5: lo que se midió hoy, si llegó al motor y qué detectó.
const envioTxt: Record<EstadoEnvio, [string, string]> = {
  enviado: ['Analizado', 'text-[#8FF0C4]'],
  pendiente: ['En cola, sin conexión', 'text-warn'],
  sin_back: ['Solo en este equipo', 'text-muted'],
}

export default function Resumen({ onIrA, onSalir }: { onIrA: (paso: number) => void; onSalir: () => void }) {
  const { camara, cognitivo, presion, registro, envios, alertas } = useChequeoStore()
  const status = useAppStore((s) => s.status)
  const statusReal = useAppStore((s) => s.statusReal)
  const pendientes = useAppStore((s) => s.pendientes.length)
  const activas = useMyAlerts().filter((a) => a.estado === 'activa')
  const nuevas = activas.filter((a) => alertas.includes(Number(a.id)))

  const filas: { paso: number; nombre: string; hecho: boolean; valor: string; envio?: EstadoEnvio; capa: 'real' | 'self' }[] = [
    { paso: 0, nombre: 'Cámara', hecho: !!camara, capa: 'real', envio: envios.camara,
      valor: camara ? `${camara.bpm ?? '--'} lpm · ${camara.segundosValidos} s útiles` : 'Pendiente' },
    { paso: 1, nombre: 'Prueba de atención', hecho: !!cognitivo, capa: 'real', envio: envios.cognitivo,
      valor: cognitivo ? `${Math.round(cognitivo.medianaMs)} ms · ${cognitivo.lapsos} lapsos${cognitivo.practica ? ' · práctica' : ''}` : 'Pendiente' },
    { paso: 2, nombre: 'Presión', hecho: !!presion, capa: 'self', envio: envios.presion,
      valor: presion ? ('omitida' in presion ? 'Sin brazalete hoy' : `${presion.sis}/${presion.dia} mmHg`) : 'Pendiente' },
    { paso: 3, nombre: 'Ánimo, sueño y síntomas', hecho: !!registro, capa: 'self', envio: envios.registro,
      valor: registro ? `Ánimo ${registro.animo}/5 · estrés ${registro.estres}/10 · ${registro.sintomas.length} síntomas` : 'Pendiente' },
  ]
  const hechos = filas.filter((f) => f.hecho).length

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Chequeo diario · paso 5 de 5</p>
          <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-tight">Resumen de hoy</h1>
        </div>
        <StepBar actual={4} />
      </header>

      <div className="flex flex-wrap gap-5">
        <section className="flex min-w-0 flex-[3_1_480px] flex-col gap-1 rounded-2xl border border-line bg-panel p-[22px]">
          <h2 className="m-0 mb-2 font-display text-base font-semibold">{hechos} de 4 pasos hechos</h2>
          {filas.map((f) => (
            <div key={f.nombre} className="flex min-h-14 items-center gap-3 border-b border-line py-2 last:border-b-0">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-xs font-bold ${f.hecho ? 'bg-ok text-[#04121C]' : 'border-2 border-line-strong'}`}>{f.hecho ? '✓' : ''}</span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold">{f.nombre} <span className={`tag ${f.capa}`}>{f.capa === 'real' ? 'Real' : 'Auto'}</span></p>
                <p className="m-0 mt-0.5 font-mono text-[13px] text-soft">{f.valor}</p>
              </div>
              {f.envio && <span className={`text-xs font-semibold ${envioTxt[f.envio][1]}`}>{envioTxt[f.envio][0]}</span>}
              <button type="button" onClick={() => onIrA(f.paso)} className="min-h-14 rounded-lg px-3 text-sm font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-nav">{f.hecho ? 'Rehacer' : 'Hacer'}</button>
            </div>
          ))}
          {pendientes > 0 && <p className="m-0 mt-2 text-xs text-warn">{pendientes} envío(s) esperan conexión con la base; se mandan solos al reconectar.</p>}
        </section>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <section className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel p-[22px]">
            <ReadinessGauge value={statusReal && !status.nMediciones ? null : status.readiness} ayer={status.ayer} />
            <p className="m-0 text-center text-[13px] text-soft">
              {statusReal ? `Calculado por el motor con ${status.nMediciones ?? 0} mediciones · calibración ${status.calibracion}%` : 'Sin conexión con el motor: valor de ejemplo'}
            </p>
          </section>
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-[22px]">
            <h2 className="m-0 font-display text-base font-semibold">Qué detectó el motor</h2>
            {nuevas.length > 0 ? (
              nuevas.map((a) => (
                <Link key={a.id} to={`/alerts?id=${a.id}`} className={`rounded-xl border p-3 text-sm no-underline ${a.nivel === 'crit' ? 'border-crit text-[#FFB8BF]' : 'border-warn text-[#F5D79A]'}`}>
                  <strong>{a.titulo}</strong> · {a.resumen}
                </Link>
              ))
            ) : (
              <p className="m-0 text-sm text-soft">{statusReal ? 'Nada fuera de tu normal con el chequeo de hoy.' : 'El análisis aparece cuando el motor está conectado.'}</p>
            )}
            {activas.length > nuevas.length && <Link to="/alerts" className="text-[13px] font-semibold">Ver {activas.length} alertas activas</Link>}
          </section>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={() => onIrA(3)} className="min-h-14 rounded-xl px-5 text-base font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel">Atrás</button>
            <button type="button" onClick={onSalir} className="min-h-14 rounded-xl bg-accent px-5 text-base font-semibold text-[#04121C] hover:bg-[#8AD9F8]">Terminar e ir a Inicio</button>
          </div>
        </div>
      </div>
    </div>
  )
}
