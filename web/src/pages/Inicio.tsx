import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check, RotateCw } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useMyAlerts } from '../store/selectors'
import { environmentProfiles } from '../store/mockData'
import ReadinessGauge from '../components/ui/ReadinessRing'
import CalibrationStrip from '../components/ui/CalibrationBar'
import AlertLink from '../components/ui/AlertCard'
import { PageHeader, SimBanner } from '../components/ui/Page'
import { useSession } from '../store/useSession'
import { useChequeoStore } from '../features/chequeo/chequeoStore'
import Holograma from '../features/inicio/Holograma'
import TarjetaMision from '../features/inicio/TarjetaMision'
import EstadoIcono from '../components/ui/EstadoIcono'
import { movimientoReducido, organoDeAlerta, useEfectos } from '../lib/efectos'
import { useWsEvent } from '../lib/useWsEvent'
import { ORGANOS, useSalud, useSexo, type Estado, type Metrica, type Organo } from '../features/inicio/useSalud'
import { C } from '../lib/paleta'

const COLOR: Record<Estado, string> = { ok: C.ok, warn: C.warn, crit: C.crit, none: C.none }
const TEXTO: Record<Estado, string> = { ok: 'Normal', warn: 'Atención', crit: 'Crítico', none: 'Sin datos' }

// Número que cuenta desde cero hasta su valor real durante el encendido de cabina
function Cuenta({ texto, activo }: { texto: string; activo: boolean }) {
  const valor = Number(texto)
  const animable = activo && Number.isFinite(valor) && texto.trim() !== '' && !movimientoReducido()
  const [v, setV] = useState(animable ? 0 : valor)
  useEffect(() => {
    if (!animable) return
    const dec = (texto.split('.')[1] ?? '').length
    const t0 = performance.now()
    let raf = 0
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100)
      setV(Number((valor * (1 - (1 - k) ** 3)).toFixed(dec)))
      if (k < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [animable, texto, valor])
  return <>{animable ? v : texto}</>
}

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

// Panel tipo HUD de una señal: valor, tendencia, tu normal y estado.
// Tocarlo RESALTA el órgano en el holograma (antes te sacaba de Inicio y solo funcionaba con el mouse encima).
function Panel({ m, activo, onTocar, onHover, i, encendido }: {
  m: Metrica; activo: boolean; onTocar: (o: Organo) => void; onHover: (o: Organo | null) => void; i: number; encendido: boolean
}) {
  const c = COLOR[m.estado]
  return (
    <motion.button
      type="button"
      aria-pressed={activo}
      onClick={() => onTocar(m.organo)}
      onMouseEnter={() => onHover(m.organo)}
      onMouseLeave={() => onHover(null)}
      initial={encendido && !movimientoReducido() ? { opacity: 0, x: i % 2 ? 24 : -24, filter: 'blur(4px)' } : false}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      transition={{ delay: encendido ? 0.5 + i * 0.09 : 0, duration: 0.35 }}
      className="group relative flex min-h-[60px] cursor-pointer flex-col gap-1 rounded-xl border-2 bg-[#0A111F]/80 px-3.5 py-3 text-left text-text transition-colors hover:bg-[#0E1830] active:translate-y-[2px]"
      style={{ borderColor: activo ? `${c}CC` : C.holoLine, boxShadow: activo ? `0 0 22px ${c}44` : undefined }}
    >
      <span className="pointer-events-none absolute left-1 top-1 h-2.5 w-2.5 border-l border-t" style={{ borderColor: `${c}99` }} />
      <span className="pointer-events-none absolute bottom-1 right-1 h-2.5 w-2.5 border-b border-r" style={{ borderColor: `${c}99` }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{m.label}</span>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: c }}>
          <EstadoIcono estado={m.estado} size={15} />
          {TEXTO[m.estado]}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[28px] font-bold leading-tight text-text"><Cuenta texto={m.texto} activo={encendido} /></span>
        <span className="text-sm text-faint">{m.unit}</span>
        {m.experimental
          ? <span className="ml-auto rounded bg-exp-bg px-1.5 py-0.5 text-[13px] font-semibold text-exp" title="Experimental">EXP</span>
          : <span className={`tag ${m.capa} ml-auto`}>{m.capa === 'real' ? 'Real' : 'Auto'}</span>}
      </div>
      <Linea serie={m.serie} color={c} />
      <span className="text-[13px] leading-snug text-faint">
        {m.valor == null ? 'Haz tu chequeo para medirlo' : m.media != null ? `Tu normal ${m.media.toFixed(m.dec)} · ${m.motivo.toLowerCase()}` : m.motivo}
      </span>
    </motion.button>
  )
}

// Texto bajo la disposición: sale del número y de los factores reales, nunca fijo
function lectura(readiness: number, factores: number, sinDatos: boolean) {
  if (sinDatos) return 'Aún no hay mediciones tuyas. Haz tu primer chequeo para que el motor calcule tu estado'
  if (readiness >= 85) return factores ? 'Puedes operar con normalidad, hay una señal menor que conviene vigilar' : 'Puedes operar con normalidad, todo está dentro de tu normal'
  if (readiness >= 65) return `Puedes operar, ${factores === 1 ? 'hay una señal' : `hay ${factores} señales`} que conviene atender hoy`
  if (readiness >= 45) return 'Evita tareas críticas o de precisión hasta atender las señales de abajo'
  return 'Estado bajo: sigue las alertas y avisa al comandante'
}

export default function Inicio() {
  const status = useAppStore((s) => s.status)
  const user = useSession((s) => s.user)
  const { camara, cognitivo, presion, registro } = useChequeoStore()
  const rutina = [
    { label: 'Chequeo con cámara', capa: 'real', done: !!camara, to: '/camera' },
    { label: 'Prueba de atención', capa: 'real', done: !!cognitivo, to: '/camera?paso=1' },
    { label: 'Presión arterial', capa: 'self', done: !!presion, to: '/camera?paso=2' },
    { label: 'Ánimo, sueño y síntomas', capa: 'self', done: !!registro, to: '/camera?paso=3' },
  ]
  const alerts = useMyAlerts()
  const env = useAppStore((s) => s.environment)
  const statusReal = useAppStore((s) => s.statusReal)
  const active = alerts.filter((a) => a.estado === 'activa')
  const hechos = rutina.filter((r) => r.done).length
  const server = useAppStore((s) => s.server)
  const sinDatos = statusReal && (status.nMediciones ?? 0) === 0
  const siguiente = rutina.find((r) => !r.done)

  // Escaneo corporal 360°
  const salud = useSalud()
  const metricas = salud.metricas
  // Una alerta roja activa deja su órgano en rojo en el holograma hasta que se atiende
  const organosCrit = useMemo(() => new Set(active.filter((a) => a.nivel === 'crit').map(organoDeAlerta)), [active])
  const organos = useMemo(() => {
    const o = { ...salud.organos }
    organosCrit.forEach((x) => { o[x] = 'crit' })
    return o
  }, [salud.organos, organosCrit])
  const encendido = useEfectos((s) => s.encendido)
  const destello = useEfectos((s) => s.destello)
  // El anillo de escaneo recorre el cuerpo cuando llega una medición nueva (o al encender la cabina)
  const [escaneo, setEscaneo] = useState(0)
  useWsEvent(['measurement_added'], () => setEscaneo((n) => n + 1))
  const encendidoPrevio = useRef(false)
  useEffect(() => {
    if (encendido && !encendidoPrevio.current) setEscaneo((n) => n + 1)
    encendidoPrevio.current = encendido
  }, [encendido])
  const sexo = useSexo()
  const [seleccionado, setSeleccionado] = useState<Organo | null>(null)
  const [hover, setHover] = useState<Organo | null>(null)
  const [vista, setVista] = useState(0)
  const enfoque = hover ?? seleccionado
  const tocar = (o: Organo) => setSeleccionado((s) => (s === o ? null : o))
  const por = (id: string) => metricas.find((m) => m.id === id)!
  const izquierda = ['hr', 'hrv', 'resp', 'bp', 'sintomas'].map(por)
  const derecha = ['sleep', 'rt', 'mood', 'stress', 'expr'].map(por)
  const conValor = (id: string, sufijo: string, o: Organo) => (por(id).valor != null ? `${por(id).texto}${sufijo}` : TEXTO[organos[o]])
  const etiquetas: Record<Organo, string> = {
    cerebro: `Cerebro · ${conValor('rt', ' ms', 'cerebro')}`,
    ojos: `Sueño · ${conValor('sleep', ' h', 'ojos')}`,
    corazon: `Corazón · ${conValor('hr', ' lpm', 'corazon')}`,
    pulmones: `Pulmones · ${conValor('resp', '/min', 'pulmones')}`,
    inmune: `Inmune · ${por('sintomas').valor != null ? `${por('sintomas').texto} síntomas` : TEXTO[organos.inmune]}`,
  }
  const enAlerta = metricas.filter((m) => m.estado === 'warn' || m.estado === 'crit').length
  const conDatos = metricas.filter((m) => m.valor != null).length
  const detalle = enfoque ? ORGANOS[enfoque] : null
  const metricasDetalle = enfoque ? metricas.filter((m) => m.organo === enfoque) : []

  return (
    <>
      {!statusReal && <SimBanner tag="DATOS DE EJEMPLO">Sin conexión con el motor: tu estado, tu línea base y las gráficas son de ejemplo. Arranca la API para ver tus datos reales</SimBanner>}
      {statusReal && status.datoDemo && <SimBanner tag="DATO DE DEMO">Tu estado incluye datos del simulador de la misión (modo demo)</SimBanner>}
      <PageHeader
        kicker={`Día ${status.diaMision} de misión · ${environmentProfiles[env].nombre}`}
        title={`Hola, ${user?.nombre ?? ''}`}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl bg-panel border border-line text-[13px] text-muted">
              Racha <strong className="num text-[15px] text-text">{status.racha}</strong> días
            </span>
            <Link className="btn pri" to={siguiente?.to ?? '/camera?paso=4'}>{hechos === 0 ? 'Iniciar chequeo diario' : siguiente ? 'Continuar chequeo' : 'Ver resumen de hoy'} <ArrowRight size={18} strokeWidth={2.2} /></Link>
          </div>
        }
      />

      {/* Punto focal: la respuesta a "¿puedo operar hoy?" junto al cuerpo, en la primera vista */}
      <section aria-labelledby="operar" className="card flex flex-wrap items-center gap-x-6 gap-y-3" style={{ borderWidth: 2, borderColor: sinDatos ? C.line2 : status.readiness >= 85 ? C.okLine : status.readiness >= 65 ? C.warnLine : C.critLine, padding: '18px 24px' }}>
        <EstadoIcono estado={sinDatos ? 'none' : status.readiness >= 85 ? 'ok' : status.readiness >= 45 ? 'warn' : 'crit'} size={40} />
        <div className="flex items-baseline gap-2">
          <span className="num text-[56px] font-bold leading-none" style={{ color: sinDatos ? C.none : status.readiness >= 85 ? C.ok : status.readiness >= 45 ? C.warn : C.crit }}>
            {sinDatos ? '--' : <Cuenta texto={String(status.readiness)} activo={encendido} />}
          </span>
          <span className="text-base text-muted">de 100</span>
        </div>
        <div className="min-w-[260px] flex-1">
          <h2 id="operar" className="m-0 font-display text-[22px] font-semibold leading-snug">¿Puedo operar hoy?</h2>
          <p className="m-0 mt-1 text-[17px] leading-snug text-subtle">{lectura(status.readiness, status.factores.length, sinDatos)}</p>
        </div>
        {status.factores.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[15px]">
            {status.factores.slice(0, 2).map((f) => (
              <li key={f.label} className="flex items-center gap-2"><EstadoIcono estado={f.delta <= -10 ? 'crit' : 'warn'} size={16} />{f.label}<strong className="num ml-1">{f.delta}</strong></li>
            ))}
          </ul>
        )}
      </section>

      {/* Escaneo corporal: señales a los lados y el cuerpo 3D al centro */}
      <section aria-labelledby="escaneo" className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(360px,1.5fr)_minmax(220px,1fr)]">
        <div className="order-2 flex flex-col gap-3 lg:order-1">
          {izquierda.map((m, i) => <Panel key={m.id} m={m} i={i * 2} encendido={encendido} activo={enfoque === m.organo} onTocar={tocar} onHover={setHover} />)}
        </div>

        <div
          className="relative order-1 flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-holo-line lg:order-2"
          style={{ background: 'radial-gradient(ellipse at 50% 45%, #0B2236 0%, #070D19 55%, #050912 100%)' }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#5CC8F5 1px, transparent 1px), linear-gradient(90deg, #5CC8F5 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
            <div>
              <h2 id="escaneo" className="m-0 font-display text-[15px] font-semibold tracking-wide text-accent-soft">ESCANEO CORPORAL 360°</h2>
              <p className="m-0 text-[13px] text-faint">
                {conDatos ? (enAlerta ? `${enAlerta} ${enAlerta === 1 ? 'señal' : 'señales'} para atender` : 'Todo dentro de tu normal') : 'Sin mediciones todavía'}
              </p>
            </div>
            <div role="group" aria-label="Vista del cuerpo" className="flex gap-1 rounded-lg border border-holo-line bg-holo-bg/80 p-1">
              {(['Frente', 'Espalda'] as const).map((t, i) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={vista % 2 === i}
                  onClick={() => setVista((v) => (v % 2 === i ? v + 2 : v + 1))}
                  className="min-h-[60px] min-w-[96px] rounded-lg px-4 text-base font-semibold text-muted active:translate-y-[2px] aria-pressed:bg-sel aria-pressed:text-text aria-pressed:shadow-[inset_0_0_0_2px_var(--color-accent-line)]"
                >
                  {t}
                </button>
              ))}
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
              sexo={sexo}
              destello={destello}
              escaneo={escaneo}
            />
          </div>

          <div className="relative z-10 m-3 rounded-xl border border-holo-line bg-holo-bg/85 px-4 py-3 backdrop-blur">
            {detalle && enfoque ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm" style={{ color: COLOR[organos[enfoque]] }}>{detalle.nombre} · {detalle.sistema}</strong>
                  <span className="text-sm font-semibold" style={{ color: COLOR[organos[enfoque]] }}>{TEXTO[organos[enfoque]]}</span>
                </div>
                <p className="m-0 text-sm leading-relaxed text-muted">{detalle.que}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {metricasDetalle.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1.5 font-mono" style={{ color: COLOR[m.estado] }}><EstadoIcono estado={m.estado} size={13} />{m.label} {m.texto}{m.valor != null ? ` ${m.unit}` : ''}</span>
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {metricasDetalle.filter((m) => m.link).slice(0, 3).map((m) => (
                    <Link key={m.id} to={m.link!} className="btn sec sm">Ver {m.label.toLowerCase()} <ArrowRight size={16} /></Link>
                  ))}
                </div>
              </div>
            ) : (
              <p className="m-0 flex items-center gap-2 text-sm text-faint">
                <RotateCw size={14} className="shrink-0" /> Arrastra para girar el cuerpo. Toca un órgano o un panel para ver su detalle. El corazón late a tu ritmo medido y los pulmones respiran a tu frecuencia
              </p>
            )}
          </div>
        </div>

        <div className="order-3 flex flex-col gap-3">
          {derecha.map((m, i) => <Panel key={m.id} m={m} i={i * 2 + 1} encendido={encendido} activo={enfoque === m.organo} onTocar={tocar} onHover={setHover} />)}
        </div>
      </section>

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-wrap items-center gap-7" style={{ flex: '3 1 480px', minWidth: 0, padding: 26 }} aria-labelledby="mr">
          <div style={{ flex: '0 1 200px', opacity: sinDatos ? 0.35 : 1 }}><ReadinessGauge value={sinDatos ? null : status.readiness} ayer={status.ayer} /></div>
          <div className="flex flex-col gap-3.5 min-w-0" style={{ flex: '1 1 240px' }}>
            <div>
              <h2 id="mr" className="h2" style={{ fontSize: 20 }}>Disposición para la misión</h2>
              <p className="mt-1.5 mb-0 text-sm text-muted leading-relaxed">{lectura(status.readiness, status.factores.length, sinDatos)}</p>
            </div>
            <p className="k">{status.factores.length ? 'Por qué bajó' : sinDatos ? 'Qué falta' : 'Sin factores en contra'}</p>
            {status.factores.length === 0 && <p className="m-0 text-sm text-muted">{sinDatos ? 'Completa la rutina de hoy' : 'Ninguna señal fuera de tu normal'}</p>}
            <ul className="m-0 p-0 list-none flex flex-col gap-2.5 text-sm">
              {status.factores.map((f, i) => (
                <motion.li key={f.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.15 }} className="flex items-center gap-3">
                  <span className="flex-1 min-w-0">{f.label}</span>
                  <span className="w-[72px] h-1.5 rounded bg-line shrink-0">
                    <motion.span className="block h-full rounded" style={{ background: f.delta <= -10 ? C.crit : f.delta <= -2 ? C.warn : C.faint }} initial={{ width: 0 }} animate={{ width: `${f.peso}%` }} transition={{ delay: 0.4 + i * 0.15 }} />
                  </span>
                  <strong className="num w-[34px] text-right" style={{ color: f.delta <= -10 ? C.crit : f.delta <= -2 ? C.warn : C.muted }}>{f.delta}</strong>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card flex flex-col gap-3.5" style={{ flex: '2 1 320px', minWidth: 0 }} aria-labelledby="rutina">
          <div className="flex justify-between items-baseline gap-2">
            <h2 id="rutina" className="h2">Rutina de hoy</h2>
            <span className="num text-[13px] text-muted">{hechos} de {rutina.length}</span>
          </div>
          <div className="h-1.5 rounded bg-line"><motion.div className="h-full rounded bg-ok" initial={{ width: 0 }} animate={{ width: `${(hechos / rutina.length) * 100}%` }} /></div>
          <ul className="m-0 p-0 list-none flex flex-col gap-1 text-sm">
            {rutina.map((r) => (
              <li key={r.label} className="flex items-center gap-3 min-h-[44px]" style={{ color: r.done ? C.muted : C.text }}>
                {r.done
                  ? <span className="w-[22px] h-[22px] rounded-[7px] bg-ok text-on-accent grid place-items-center shrink-0"><Check size={14} strokeWidth={3.2} /></span>
                  : <span className="w-[22px] h-[22px] rounded-[7px] border-2 border-line3 shrink-0" />}
                {r.done
                  ? <span className="flex-1">{r.label}</span>
                  : <Link to={r.to} className="flex-1 no-underline font-medium text-text hover:text-accent">{r.label}</Link>}
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
            ? <p className="m-0 text-sm text-muted">Sin alertas activas, todo dentro de tu normal</p>
            : active.map((a) => <AlertLink key={a.id} alert={a} />)}
          {!server && <p className="mt-auto mb-0 text-sm text-faint">Alertas de ejemplo: el back no está conectado</p>}
        </section>

        <section className="card flex flex-col gap-3" style={{ flex: '1 1 260px', minWidth: 0 }} aria-labelledby="cal">
          <h2 id="cal" className="h2">Calibración del modelo</h2>
          <div className="flex items-baseline gap-2.5"><p className="big" style={{ color: C.accent }}>{status.calibracion}%</p><span className="text-[13px] text-muted">{status.calibracion >= 80 ? 'tu normal ya está calibrado' : 'aprendiendo tu normal'}</span></div>
          <CalibrationStrip day={status.diaBase} total={status.diasBase} />
          <p className="m-0 text-[13px] text-muted leading-relaxed">{status.fase === 'tierra' ? 'Línea base en Tierra, antes del lanzamiento' : status.fase === 'personal' ? 'Fase personal: las alertas comparan contra tu propio normal' : `Día ${status.diaBase} de ${status.diasBase} de adaptación`}. Cada chequeo hace que las alertas dependan más de tu propio normal</p>
        </section>
      </div>

      <TarjetaMision />
    </>
  )
}
