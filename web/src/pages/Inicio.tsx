import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import ReadinessGauge from '../components/ui/ReadinessRing'
import SystemExplorer from '../components/ui/SystemExplorer'
import CalibrationStrip from '../components/ui/CalibrationBar'
import AlertLink from '../components/ui/AlertCard'
import { PageHeader } from '../components/ui/Page'
import { useSession } from '../store/useSession'

const rutina = [
  { label: 'Chequeo con cámara', capa: 'real', done: true, to: '/camera' },
  { label: 'Prueba cognitiva', capa: 'real', done: true, to: '/cognitive' },
  { label: 'Presión arterial', capa: 'self', done: false, to: '/manual' },
  { label: 'Ánimo y síntomas', capa: 'self', done: false, to: '/manual' },
] as const

export default function Inicio() {
  const status = useAppStore((s) => s.status)
  const user = useSession((s) => s.user)
  const alerts = useAppStore((s) => s.alerts)
  const active = alerts.filter((a) => a.estado === 'activa')
  const hechos = rutina.filter((r) => r.done).length

  return (
    <>
      <PageHeader
        kicker={`Día ${status.diaMision} de misión · Estación espacial`}
        title={`Hola, ${user?.nombre ?? ''}`}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl bg-[#0E1422] border border-[#1C2740] text-[13px] text-[#A3AEC4]">
              Racha <strong className="num text-[15px] text-[#E8ECF4]">{status.racha}</strong> días
            </span>
            <Link className="btn pri" to="/camera">Iniciar chequeo diario <ArrowRight size={18} strokeWidth={2.2} /></Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-wrap items-center gap-7" style={{ flex: '3 1 480px', minWidth: 0, padding: 26 }} aria-labelledby="mr">
          <div style={{ flex: '0 1 240px' }}><ReadinessGauge value={status.readiness} ayer={status.ayer} /></div>
          <div className="flex flex-col gap-3.5 min-w-0" style={{ flex: '1 1 240px' }}>
            <div>
              <h2 id="mr" className="h2" style={{ fontSize: 20 }}>Disposición para la misión</h2>
              <p className="mt-1.5 mb-0 text-sm text-[#A3AEC4] leading-relaxed">Puedes operar con normalidad, hay dos señales que conviene atender hoy</p>
            </div>
            <p className="k">Por qué bajó</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2.5 text-sm">
              {status.factores.map((f, i) => (
                <motion.li key={f.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.15 }} className="flex items-center gap-3">
                  <span className="flex-1 min-w-0">{f.label}</span>
                  <span className="w-[72px] h-1.5 rounded bg-[#1C2740] shrink-0">
                    <motion.span className="block h-full rounded" style={{ background: f.delta <= -10 ? '#FF6B7A' : f.delta <= -2 ? '#F5B544' : '#93A0B8' }} initial={{ width: 0 }} animate={{ width: `${f.peso}%` }} transition={{ delay: 0.4 + i * 0.15 }} />
                  </span>
                  <strong className="num w-[34px] text-right" style={{ color: f.delta <= -10 ? '#FF6B7A' : f.delta <= -2 ? '#F5B544' : '#A3AEC4' }}>{f.delta}</strong>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card flex flex-col gap-3.5" style={{ flex: '2 1 320px', minWidth: 0 }} aria-labelledby="rutina">
          <div className="flex justify-between items-baseline gap-2">
            <h2 id="rutina" className="h2">Rutina de hoy</h2>
            <span className="num text-[13px] text-[#A3AEC4]">{hechos} de {rutina.length}</span>
          </div>
          <div className="h-1.5 rounded bg-[#1C2740]"><motion.div className="h-full rounded bg-[#3DDC97]" initial={{ width: 0 }} animate={{ width: `${(hechos / rutina.length) * 100}%` }} /></div>
          <ul className="m-0 p-0 list-none flex flex-col gap-1 text-sm">
            {rutina.map((r) => (
              <li key={r.label} className="flex items-center gap-3 min-h-[44px]" style={{ color: r.done ? '#A3AEC4' : '#E8ECF4' }}>
                {r.done
                  ? <span className="w-[22px] h-[22px] rounded-[7px] bg-[#3DDC97] text-[#04121C] grid place-items-center shrink-0"><Check size={14} strokeWidth={3.2} /></span>
                  : <span className="w-[22px] h-[22px] rounded-[7px] border-2 border-[#46536F] shrink-0" />}
                {r.done
                  ? <span className="flex-1">{r.label}</span>
                  : <Link to={r.to} className="flex-1 no-underline font-medium text-[#E8ECF4] hover:text-[#5CC8F5]">{r.label}</Link>}
                <span className={`tag ${r.capa}`}>{r.capa === 'real' ? 'Real' : 'Auto'}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <SystemExplorer sistemas={status.sistemas} />

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-col gap-3" style={{ flex: '1.4 1 340px', minWidth: 0 }} aria-labelledby="alertas">
          <div className="flex justify-between items-baseline gap-2">
            <h2 id="alertas" className="h2">Alertas activas</h2>
            <Link to="/alerts" className="text-[13px] font-semibold">Ver todas</Link>
          </div>
          {active.length === 0
            ? <p className="m-0 text-sm text-[#A3AEC4]">Sin alertas activas, todo dentro de tu normal</p>
            : active.map((a) => <AlertLink key={a.id} alert={a} />)}
          <p className="mt-auto mb-0 text-xs text-[#93A0B8]">Datos de ejemplo para el prototipo</p>
        </section>

        <section className="card flex flex-col gap-3" style={{ flex: '1 1 260px', minWidth: 0 }} aria-labelledby="cal">
          <h2 id="cal" className="h2">Calibración del modelo</h2>
          <div className="flex items-baseline gap-2.5"><p className="big" style={{ color: '#5CC8F5' }}>{status.calibracion}%</p><span className="text-[13px] text-[#A3AEC4]">aprendiendo tu normal</span></div>
          <CalibrationStrip day={status.diaBase} total={status.diasBase} />
          <p className="m-0 text-[13px] text-[#A3AEC4] leading-relaxed">Día {status.diaBase} de {status.diasBase} de tu línea base personal, cada chequeo hace que las alertas dependan más de tu propio normal</p>
          <Link to="/profile" className="mt-auto text-[13px] font-semibold">Ver detalle de calibración</Link>
        </section>
      </div>
    </>
  )
}
