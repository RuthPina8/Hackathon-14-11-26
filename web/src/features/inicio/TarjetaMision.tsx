import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Radar } from 'lucide-react'
import { useSession } from '../../store/useSession'
import { useWsEvent } from '../../lib/useWsEvent'
import { ambienteApi, NOMBRE_ESCENARIO, type ContextoMision } from '../ambiente/ambienteApi'
import { idNumerico, NOMBRE_EJERCICIO } from '../movimiento/movimientoApi'
import { C } from '../../lib/paleta'

const COLOR = { estable: C.ok, bajo: C.warn, sin_referencia: C.accent, baja_calidad: C.warn }

// Resumen en Inicio de ASTRA-MOVE y del ambiente de la misión, con acceso directo a ambos
export default function TarjetaMision() {
  const astro = idNumerico(useSession((s) => s.user)?.id)
  const [ctx, setCtx] = useState<ContextoMision | null>(null)
  const [cargado, setCargado] = useState(false)

  const cargar = useCallback(() => {
    void ambienteApi.contexto(astro).then((c) => { setCtx(c); setCargado(true) })
  }, [astro])
  useEffect(cargar, [cargar])
  useWsEvent(['movement_recorded', 'telemetry_updated', 'mission_correlation'], cargar)

  const s = ctx?.funcional
  const fuera = ctx?.ambiente?.fuera_de_rango ?? []
  const nombres = fuera.map((v) => ctx?.rangos.find((r) => r.variable === v)?.nombre ?? v).join(', ')
  const obs = ctx?.observaciones.length ?? 0

  return (
    <section className="card flex flex-col gap-4" aria-labelledby="mov-amb">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mov-amb" className="h2">Movement and environment</h2>
        {obs > 0 && <Link to="/mission-intelligence" className="text-[13px] font-semibold">{obs === 1 ? 'There is 1 contextual observation' : `There are ${obs} contextual observations`}</Link>}
      </div>
      {cargado && !ctx && <p className="m-0 text-sm text-warn-soft">No connection to the API: start it to see your movement and the environment</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="k">Functional performance</p>
            {s && (s.dato_demo ? <span className="tag simt">DEMO</span> : <span className="tag real">Real</span>)}
          </div>
          {s ? (
            <>
              <p className="m-0 text-sm text-muted"><strong className="num text-[22px] text-text">{s.repeticiones}</strong> reps · {NOMBRE_EJERCICIO[s.ejercicio]}</p>
              <p className="m-0 text-sm font-semibold" style={{ color: COLOR[s.comparacion.estado] }}>{s.comparacion.texto}</p>
            </>
          ) : (
            <p className="m-0 text-sm text-muted">No assessments yet: do one to see your performance against your normal</p>
          )}
          <Link to="/movement" className="btn sec mt-auto"><Activity size={18} /> {s ? 'New ASTRA-MOVE assessment' : 'Do an ASTRA-MOVE assessment'}</Link>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="k">Mission environment</p>
            {ctx?.ambiente && (ctx.ambiente.capa === 'real' ? <span className="tag real">Sensor</span> : <span className="tag simt">SIMULATED</span>)}
          </div>
          {ctx?.ambiente ? (
            <>
              <p className="m-0 text-sm font-semibold" style={{ color: fuera.length ? C.warn : C.ok }}>
                {fuera.length ? `Out of range: ${nombres}` : 'All variables within range'}
              </p>
              <p className="m-0 text-sm text-muted">Demo scenario: {NOMBRE_ESCENARIO[ctx.escenario]}</p>
            </>
          ) : (
            <p className="m-0 text-sm text-muted">No readings yet</p>
          )}
          <Link to="/mission-intelligence" className="btn sec mt-auto"><Radar size={18} /> View mission intelligence</Link>
        </div>
      </div>
    </section>
  )
}
