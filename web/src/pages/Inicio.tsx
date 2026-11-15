import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check, RotateCw } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import ReadinessGauge from '../components/ui/ReadinessRing'
import CalibrationStrip from '../components/ui/CalibrationBar'
import AlertLink from '../components/ui/AlertCard'
import { PageHeader } from '../components/ui/Page'
import { useSession } from '../store/useSession'
import { useChequeoStore } from '../features/chequeo/chequeoStore'
import Holograma from '../features/inicio/Holograma'
import { ORGANOS, useSalud, type Estado, type Metrica, type Organo } from '../features/inicio/useSalud'

const COLOR: Record<Estado, string> = { ok: '#3DDC97', warn: '#F5B544', crit: '#FF6B7A', none: '#5C7896' }
const TEXTO: Record<Estado, string> = { ok: 'Normal', warn: 'Atención', crit: 'Crítico', none: 'Sin datos' }

// Gráfica mini de las últimas mediciones
function Linea({ serie, color }: { serie: number[]; color: string }) {
  if (serie.length < 2) return <div className="h-7" />
  const min = Math.min(...serie)
  const max = Math.max(...serie)
  const rango = max - min || 1
  const pts = serie.map((v, i) => `${(i / (serie.length - 1)) * 100},${26 - ((v - min) / rango) * 22}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

function Panel({ m, activo, onHover }: { m: Metrica; activo: boolean; onHover: (o: Organo | null) => void }) {
  const c = COLOR[m.estado]
  return (
    <Link
      to={m.link}
      onMouseEnter={() => onHover(m.organo)}
      onMouseLeave={() => onHover(null)}
      className="group relative flex flex-col gap-1 rounded-xl border bg-[#0A111F]/80 px-3.5 py-3 no-underline transition-all hover:bg-[#0E1830]"
      style={{ borderColor: activo ? `${c}AA` : '#1C2E4A', boxShadow: activo ? `0 0 18px ${c}33` : undefined }}
    >
      {/* esquinas tipo HUD */}
      <span className="pointer-events-none absolute left-1 top-1 h-2.5 w-2.5 border-l border-t" style={{ borderColor: `${c}99` }} />
      <span className="pointer-events-none absolute bottom-1 right-1 h-2.5 w-2.5 border-b border-r" style={{ borderColor: `${c}99` }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#A3AEC4]">{m.label}</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: c }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
          {TEXTO[m.estado]}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[26px] font-bold leading-tight text-[#E8ECF4]">{m.texto}</span>
        <span className="text-xs text-[#93A0B8]">{m.unit}</span>
        {m.experimental && <span className="ml-auto rounded bg-[#2A2312] px-1.5 py-0.5 text-[10px] font-semibold text-[#F5B544]">EXP</span>}
        {!m.experimental && <span className={`tag ${m.capa} ml-auto`} style={{ fontSize: 10, padding: '2px 6px' }}>{m.capa === 'real' ? 'Real' : 'Auto'}</span>}
      </div>
      <Linea serie={m.serie} color={c} />
      <span className="text-[11px] leading-snug text-[#93A0B8]">
        {m.valor == null ? 'Haz tu chequeo para medirlo' : m.media != null ? `Tu normal ${m.media.toFixed(m.dec)} · ${m.motivo.toLowerCase()}` : `${m.motivo} (${m.n} de 3)`}
      </span>
    </Link>
  )
}

const esHoy = (iso?: string) => (iso ? new Date(iso).toDateString() === new Date().toDateString() : false)

export default function Inicio() {
  const status = useAppStore((s) => s.status)
  const conectado = useAppStore((s) => s.connection) === 'connected'
  const user = useSession((s) => s.user)
  const alerts = useAppStore((s) => s.alerts)
  const active = alerts.filter((a) => a.estado === 'activa')
  const historial = useChequeoStore((s) => s.historial)
  const { metricas, organos, sesiones } = useSalud()
  const [seleccionado, setSeleccionado] = useState<Organo | null>(null)
  const [hover, setHover] = useState<Organo | null>(null)
  const [vista, setVista] = useState(0)
  const enfoque = hover ?? seleccionado

  const por = (id: string) => metricas.find((m) => m.id === id)!
  const izquierda = ['hr', 'hrv', 'resp', 'bp', 'sintomas'].map(por)
  const derecha = ['perclos', 'sleep', 'rt', 'mood', 'expr'].map(por)

  const etiquetas: Record<Organo, string> = {
    cerebro: `Cerebro · ${por('rt').valor != null ? `${por('rt').texto} ms` : TEXTO[organos.cerebro]}`,
    ojos: `Ojos · ${por('perclos').valor != null ? `PERCLOS ${por('perclos').texto}` : TEXTO[organos.ojos]}`,
    corazon: `Corazón · ${por('hr').valor != null ? `${por('hr').texto} lpm` : TEXTO[organos.corazon]}`,
    pulmones: `Pulmones · ${por('resp').valor != null ? `${por('resp').texto}/min` : TEXTO[organos.pulmones]}`,
    inmune: `Inmune · ${por('sintomas').valor != null ? `${por('sintomas').texto} síntomas` : TEXTO[organos.inmune]}`,
  }

  // Rutina de hoy con lo que de verdad se hizo hoy
  const hoy = historial.filter((s) => esHoy(s.fecha))
  const camaraHoy = useChequeoStore((s) => s.camara)
  const rutina = [
    { label: 'Chequeo con cámara', capa: 'real', done: hoy.some((s) => s.bpm != null || s.perclos != null) || esHoy(camaraHoy?.fecha), to: '/camera' },
    { label: 'Prueba cognitiva', capa: 'real', done: hoy.some((s) => s.reaccionMs != null), to: '/cognitive' },
    { label: 'Presión arterial', capa: 'self', done: hoy.some((s) => s.presionSis != null), to: '/manual' },
    { label: 'Ánimo y síntomas', capa: 'self', done: hoy.some((s) => s.animo != null), to: '/manual' },
  ] as const
  const hechos = rutina.filter((r) => r.done).length

  // Disposición: la del servidor si hay conexión, si no se calcula aquí con las mismas reglas del back
  const local = useMemo(() => {
    const conDato = metricas.filter((m) => m.estado !== 'none' && !m.experimental)
    const penal = conDato.reduce((s, m) => s + (m.estado === 'crit' ? 20 : m.estado === 'warn' ? 8 : 0), 0)
    return {
      readiness: Math.max(20, 100 - penal),
      factores: conDato
        .filter((m) => m.estado === 'warn' || m.estado === 'crit')
        .map((m) => ({ label: `${m.label}: ${m.motivo.toLowerCase()}`, delta: m.estado === 'crit' ? -20 : -8, peso: m.estado === 'crit' ? 100 : 40 })),
    }
  }, [metricas])
  const readiness = conectado ? status.readiness : local.readiness
  const factores = conectado ? status.factores : local.factores
  const enAlerta = metricas.filter((m) => m.estado === 'warn' || m.estado === 'crit').length

  const detalle = enfoque ? ORGANOS[enfoque] : null
  const metricasDetalle = enfoque ? metricas.filter((m) => m.organo === enfoque) : []

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

      {/* Escaneo corporal: métricas a los lados y el cuerpo 3D al centro */}
      <section aria-labelledby="escaneo" className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(360px,1.5fr)_minmax(220px,1fr)]">
        <div className="order-2 flex flex-col gap-3 lg:order-1">
          {izquierda.map((m) => <Panel key={m.id} m={m} activo={enfoque === m.organo} onHover={setHover} />)}
        </div>

        <div
          className="relative order-1 flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-[#1C2E4A] lg:order-2"
          style={{ background: 'radial-gradient(ellipse at 50% 45%, #0B2236 0%, #070D19 55%, #050912 100%)' }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#5CC8F5 1px, transparent 1px), linear-gradient(90deg, #5CC8F5 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
            <div>
              <h2 id="escaneo" className="m-0 font-display text-[15px] font-semibold tracking-wide text-[#8AD9F8]">ESCANEO CORPORAL 360°</h2>
              <p className="m-0 text-[11px] text-[#93A0B8]">
                {sesiones ? `${sesiones} chequeos · ${enAlerta ? `${enAlerta} señales para atender` : 'todo dentro de tu normal'}` : 'Sin chequeos todavía'}
              </p>
            </div>
            <div className="segs" role="group" aria-label="Vista del cuerpo">
              <button type="button" className="seg" aria-pressed={vista % 2 === 0} onClick={() => setVista((v) => (v % 2 === 0 ? v + 2 : v + 1))}>Frente</button>
              <button type="button" className="seg" aria-pressed={vista % 2 === 1} onClick={() => setVista((v) => (v % 2 === 1 ? v + 2 : v + 1))}>Espalda</button>
            </div>
          </div>

          <div className="relative flex-1">
            <Holograma
              organos={organos}
              etiquetas={etiquetas}
              bpm={por('hr').valor}
              rpm={por('resp').valor}
              seleccionado={enfoque}
              onSelect={setSeleccionado}
              vista={vista}
            />
          </div>

          <div className="relative z-10 m-3 rounded-xl border border-[#1C2E4A] bg-[#060B16]/85 px-4 py-3 backdrop-blur">
            {detalle && enfoque ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm" style={{ color: COLOR[organos[enfoque]] }}>{detalle.nombre} · {detalle.sistema}</strong>
                  <span className="text-xs font-semibold" style={{ color: COLOR[organos[enfoque]] }}>{TEXTO[organos[enfoque]]}</span>
                </div>
                <p className="m-0 text-xs leading-relaxed text-[#A3AEC4]">{detalle.que}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {metricasDetalle.map((m) => (
                    <span key={m.id} className="font-mono" style={{ color: COLOR[m.estado] }}>{m.label} {m.texto}{m.valor != null ? ` ${m.unit}` : ''}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="m-0 flex items-center gap-2 text-xs text-[#93A0B8]">
                <RotateCw size={14} /> Arrastra para girar el cuerpo, toca un órgano para ver su detalle. El corazón late a tu ritmo medido y los pulmones respiran a tu frecuencia
              </p>
            )}
          </div>
        </div>

        <div className="order-3 flex flex-col gap-3">
          {derecha.map((m) => <Panel key={m.id} m={m} activo={enfoque === m.organo} onHover={setHover} />)}
        </div>
      </section>

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-wrap items-center gap-6" style={{ flex: '2 1 440px', minWidth: 0, padding: 24 }} aria-labelledby="mr">
          <div style={{ flex: '0 1 200px' }}><ReadinessGauge value={readiness} ayer={conectado ? status.ayer : readiness} /></div>
          <div className="flex flex-col gap-3 min-w-0" style={{ flex: '1 1 220px' }}>
            <div>
              <h2 id="mr" className="h2" style={{ fontSize: 19 }}>Disposición para la misión</h2>
              <p className="mt-1.5 mb-0 text-sm text-[#A3AEC4] leading-relaxed">
                {factores.length === 0 ? 'Sin señales fuera de lo normal, puedes operar con normalidad' : `Puedes operar, hay ${factores.length} ${factores.length === 1 ? 'señal' : 'señales'} que conviene atender hoy`}
              </p>
            </div>
            {factores.length > 0 && <p className="k">Por qué bajó</p>}
            <ul className="m-0 p-0 list-none flex flex-col gap-2.5 text-sm">
              {factores.map((f, i) => (
                <motion.li key={f.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex items-center gap-3">
                  <span className="flex-1 min-w-0">{f.label}</span>
                  <strong className="num w-[34px] text-right" style={{ color: f.delta <= -10 ? '#FF6B7A' : '#F5B544' }}>{f.delta}</strong>
                </motion.li>
              ))}
            </ul>
            {!conectado && <p className="m-0 text-xs text-[#93A0B8]">Calculado en este dispositivo, sin conexión al servidor</p>}
          </div>
        </section>

        <section className="card flex flex-col gap-3.5" style={{ flex: '1 1 300px', minWidth: 0 }} aria-labelledby="rutina">
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

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-col gap-3" style={{ flex: '1.4 1 340px', minWidth: 0 }} aria-labelledby="alertas">
          <div className="flex justify-between items-baseline gap-2">
            <h2 id="alertas" className="h2">Alertas activas</h2>
            <Link to="/alerts" className="text-[13px] font-semibold">Ver todas</Link>
          </div>
          {active.length === 0
            ? <p className="m-0 text-sm text-[#A3AEC4]">Sin alertas activas, todo dentro de tu normal</p>
            : active.map((a) => <AlertLink key={a.id} alert={a} />)}
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
