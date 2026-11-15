import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { PageHeader } from '../components/ui/Page'
import { useSession } from '../store/useSession'
import { useWsEvent } from '../lib/useWsEvent'
import AmbientePanel from '../features/ambiente/AmbientePanel'
import { ambienteApi, type ContextoMision, type Observacion } from '../features/ambiente/ambienteApi'
import { idNumerico, NOMBRE_EJERCICIO } from '../features/movimiento/movimientoApi'
import { C } from '../lib/paleta'

const hora = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

function Funcional({ ctx }: { ctx: ContextoMision | null }) {
  const s = ctx?.funcional
  const est = s?.comparacion.estado
  const color = est === 'bajo' || est === 'baja_calidad' ? C.warn : est === 'estable' ? C.ok : C.accent
  const pct = s?.comparacion.cambio_pct
  return (
    <section className="card flex flex-col gap-4" aria-labelledby="fun" style={{ borderWidth: 2, borderColor: s ? color : undefined }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="fun" className="h2">Functional performance</h2>
        {s && (s.dato_demo ? <span className="tag simt">DEMO DATA</span> : <span className="tag real">WEBCAM · REAL</span>)}
      </div>
      {s ? (
        <>
          <div className="flex flex-wrap items-baseline gap-4">
            <p className="num m-0 text-[64px] font-bold leading-none" style={{ color }}>{s.repeticiones}</p>
            <p className="m-0 text-lg text-muted">reps · {NOMBRE_EJERCICIO[s.ejercicio]}</p>
          </div>
          <p className="m-0 text-xl font-semibold" style={{ color }}>{s.comparacion.texto}</p>
          <div className="grid grid-cols-3 gap-3">
            <div><p className="k">Against your normal</p><p className="big" style={{ fontSize: 24, color }}>{pct === null || pct === undefined ? '--' : `${pct > 0 ? '+' : ''}${pct}%`}</p></div>
            <div><p className="k">Detection quality</p><p className="big" style={{ fontSize: 24 }}>{Math.round(s.calidad * 100)}%</p></div>
            <div><p className="k">Registered</p><p className="big" style={{ fontSize: 24 }}>{hora(s.fecha)}</p></div>
          </div>
        </>
      ) : (
        <p className="m-0 text-lg text-muted">No movement assessments yet.</p>
      )}
      <Link to="/movement" className="btn pri">{s ? 'New ASTRA-MOVE assessment' : 'Do an ASTRA-MOVE assessment'}</Link>
    </section>
  )
}

function Hallazgo({ o }: { o: Observacion }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="card flex flex-col gap-5" style={{ borderWidth: 2, borderColor: C.accent }} aria-labelledby={`obs-${o.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Info size={30} color={C.accent} />
        <h2 id={`obs-${o.id}`} className="m-0 font-[family-name:var(--font-display)] text-[24px] font-bold">Contextual observation</h2>
        <span className="tag real">INFORMATIONAL · NOT A DIAGNOSIS</span>
        <span className="ml-auto text-base text-muted">{hora(o.desde)}–{hora(o.hasta)}</span>
      </div>
      <p className="m-0 text-xl leading-relaxed">{o.texto}</p>
      <p className="m-0 rounded-xl border-2 border-dashed border-[#3A4C72] px-5 py-4 text-lg font-semibold text-subtle">{o.causalidad}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="k">What changed</p>
          <p className="m-0 text-lg">{o.que_cambio_funcional}</p>
          {o.que_cambio_ambiente.map((v) => (
            <p key={v.variable} className="m-0 text-lg">
              <strong>{v.nombre}</strong>: up to <span className="num">{v.maximo_registrado}</span> {v.unidad}
              {' '}({v.rango[0] !== null && v.rango[1] !== null ? `range ${v.rango[0]}–${v.rango[1]}` : v.rango[1] !== null ? `limit ${v.rango[1]}` : `minimum ${v.rango[0]}`} {v.unidad}) · {v.lecturas_fuera} readings outside <span className="tag simt">SIM</span>
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="k">What data was used</p>
          {o.datos_usados.map((d) => <p key={d} className="m-0 text-base text-subtle">• {d}</p>)}
          <p className="k mt-3">How reliable it is</p>
          {o.confiabilidad.map((d) => <p key={d} className="m-0 text-base text-subtle">• {d}</p>)}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="k">Recommended preventive action</p>
        {o.acciones.map((a) => (
          <label key={a} className="task"><input type="checkbox" /><span>{a}</span></label>
        ))}
      </div>
    </motion.section>
  )
}

// Mission Intelligence: estado funcional + ambiente + observaciones contextuales en una pantalla
export default function MissionIntelligence() {
  const user = useSession((s) => s.user)
  const astro = idNumerico(user?.id)
  const [ctx, setCtx] = useState<ContextoMision | null>(null)
  const [cargado, setCargado] = useState(false)

  const cargar = useCallback(() => {
    void ambienteApi.contexto(astro).then((c) => { setCtx(c); setCargado(true) })
  }, [astro])
  useEffect(cargar, [cargar])
  useWsEvent(['movement_recorded', 'mission_correlation', 'demo_tick'], cargar)

  const obs = ctx?.observaciones ?? []
  const fueraAhora = ctx?.ambiente?.fuera_de_rango.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker={`Mission day ${ctx?.dia_mision ?? 1} · ${ctx?.entorno ?? ''} · ${user?.nombre ?? ''}`}
        title="Mission intelligence" />
      {cargado && !ctx && <p role="alert" className="m-0 rounded-xl border border-warn-line bg-warn-bg px-5 py-4 text-base text-warn-soft">No connection to the API: start it to see the mission context</p>}

      <section className="card flex flex-wrap items-center gap-4" style={{ borderWidth: 2, borderColor: obs.length ? C.accent : fueraAhora ? C.warn : C.okLine }}>
        {obs.length ? <Info size={40} color={C.accent} /> : fueraAhora ? <AlertTriangle size={40} color={C.warn} /> : <CheckCircle2 size={40} color={C.ok} />}
        <p className="m-0 flex-1 font-[family-name:var(--font-display)] text-[26px] font-semibold leading-snug">
          {obs.length
            ? 'There are changes that coincide in time and deserve a preventive review'
            : fueraAhora
              ? 'The environment changed; it doesn’t yet coincide with a change in your performance'
              : 'No concurrent changes: performance and environment as expected'}
        </p>
      </section>

      {obs[0] && <Hallazgo o={obs[0]} />}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Funcional ctx={ctx} />
        <AmbientePanel />
      </div>

      {obs.length > 1 && (
        <section className="card flex flex-col gap-2">
          <h2 className="h2">Previous observations</h2>
          {obs.slice(1).map((o) => <p key={o.id} className="m-0 text-base text-subtle">{hora(o.creada)} · {o.que_cambio_funcional}</p>)}
        </section>
      )}
    </div>
  )
}
