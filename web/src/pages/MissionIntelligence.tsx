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

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

function Funcional({ ctx }: { ctx: ContextoMision | null }) {
  const s = ctx?.funcional
  const est = s?.comparacion.estado
  const color = est === 'bajo' || est === 'baja_calidad' ? '#F5B544' : est === 'estable' ? '#3DDC97' : '#5CC8F5'
  const pct = s?.comparacion.cambio_pct
  return (
    <section className="card flex flex-col gap-4" aria-labelledby="fun" style={{ borderWidth: 2, borderColor: s ? color : undefined }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="fun" className="h2">Desempeño funcional</h2>
        {s && (s.dato_demo ? <span className="tag simt">DATO DE DEMO</span> : <span className="tag real">WEBCAM · REAL</span>)}
      </div>
      {s ? (
        <>
          <div className="flex flex-wrap items-baseline gap-4">
            <p className="num m-0 text-[64px] font-bold leading-none" style={{ color }}>{s.repeticiones}</p>
            <p className="m-0 text-lg text-[#A3AEC4]">repeticiones · {NOMBRE_EJERCICIO[s.ejercicio]}</p>
          </div>
          <p className="m-0 text-xl font-semibold" style={{ color }}>{s.comparacion.texto}</p>
          <div className="grid grid-cols-3 gap-3">
            <div><p className="k">Contra tu normal</p><p className="big" style={{ fontSize: 24, color }}>{pct === null || pct === undefined ? '--' : `${pct > 0 ? '+' : ''}${pct}%`}</p></div>
            <div><p className="k">Calidad de detección</p><p className="big" style={{ fontSize: 24 }}>{Math.round(s.calidad * 100)}%</p></div>
            <div><p className="k">Registrada</p><p className="big" style={{ fontSize: 24 }}>{hora(s.fecha)}</p></div>
          </div>
        </>
      ) : (
        <p className="m-0 text-lg text-[#A3AEC4]">Todavía no hay evaluaciones de movimiento.</p>
      )}
      <Link to="/movement" className="btn pri">{s ? 'Nueva evaluación ASTRA-MOVE' : 'Hacer evaluación ASTRA-MOVE'}</Link>
    </section>
  )
}

function Hallazgo({ o }: { o: Observacion }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="card flex flex-col gap-5" style={{ borderWidth: 2, borderColor: '#5CC8F5' }} aria-labelledby={`obs-${o.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Info size={30} color="#5CC8F5" />
        <h2 id={`obs-${o.id}`} className="m-0 font-[family-name:var(--font-display)] text-[24px] font-bold">Observación contextual</h2>
        <span className="tag real">INFORMATIVA · NO ES DIAGNÓSTICO</span>
        <span className="ml-auto text-base text-[#A3AEC4]">{hora(o.desde)}–{hora(o.hasta)}</span>
      </div>
      <p className="m-0 text-xl leading-relaxed">{o.texto}</p>
      <p className="m-0 rounded-xl border-2 border-dashed border-[#3A4C72] px-5 py-4 text-lg font-semibold text-[#C5CEDF]">{o.causalidad}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="k">Qué cambió</p>
          <p className="m-0 text-lg">{o.que_cambio_funcional}</p>
          {o.que_cambio_ambiente.map((v) => (
            <p key={v.variable} className="m-0 text-lg">
              <strong>{v.nombre}</strong>: hasta <span className="num">{v.maximo_registrado}</span> {v.unidad}
              {' '}({v.rango[0] !== null && v.rango[1] !== null ? `rango ${v.rango[0]}–${v.rango[1]}` : v.rango[1] !== null ? `límite ${v.rango[1]}` : `mínimo ${v.rango[0]}`} {v.unidad}) · {v.lecturas_fuera} lecturas fuera <span className="tag simt">SIM</span>
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="k">Qué datos se usaron</p>
          {o.datos_usados.map((d) => <p key={d} className="m-0 text-base text-[#C5CEDF]">• {d}</p>)}
          <p className="k mt-3">Qué tan confiables son</p>
          {o.confiabilidad.map((d) => <p key={d} className="m-0 text-base text-[#C5CEDF]">• {d}</p>)}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="k">Acción preventiva recomendada</p>
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
        kicker={`Día ${ctx?.dia_mision ?? 1} de misión · ${ctx?.entorno ?? ''} · ${user?.nombre ?? ''}`}
        title="Inteligencia de misión" />
      {cargado && !ctx && <p role="alert" className="m-0 rounded-xl border border-[#5C4A1C] bg-[#2A2312] px-5 py-4 text-base text-[#F5D79A]">No hay conexión con la API: arráncala para ver el contexto de la misión</p>}

      <section className="card flex flex-wrap items-center gap-4" style={{ borderWidth: 2, borderColor: obs.length ? '#5CC8F5' : fueraAhora ? '#F5B544' : '#1E5A43' }}>
        {obs.length ? <Info size={40} color="#5CC8F5" /> : fueraAhora ? <AlertTriangle size={40} color="#F5B544" /> : <CheckCircle2 size={40} color="#3DDC97" />}
        <p className="m-0 flex-1 font-[family-name:var(--font-display)] text-[26px] font-semibold leading-snug">
          {obs.length
            ? 'Hay cambios que coinciden en el tiempo y merecen una revisión preventiva'
            : fueraAhora
              ? 'El ambiente cambió; todavía no coincide con un cambio en tu desempeño'
              : 'Sin cambios concurrentes: desempeño y ambiente dentro de lo esperado'}
        </p>
      </section>

      {obs[0] && <Hallazgo o={obs[0]} />}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Funcional ctx={ctx} />
        <AmbientePanel />
      </div>

      {obs.length > 1 && (
        <section className="card flex flex-col gap-2">
          <h2 className="h2">Observaciones anteriores</h2>
          {obs.slice(1).map((o) => <p key={o.id} className="m-0 text-base text-[#C5CEDF]">{hora(o.creada)} · {o.que_cambio_funcional}</p>)}
        </section>
      )}
    </div>
  )
}
