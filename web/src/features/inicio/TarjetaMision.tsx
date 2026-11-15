import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Radar } from 'lucide-react'
import { useSession } from '../../store/useSession'
import { useWsEvent } from '../../lib/useWsEvent'
import { ambienteApi, NOMBRE_ESCENARIO, type ContextoMision } from '../ambiente/ambienteApi'
import { idNumerico, NOMBRE_EJERCICIO } from '../movimiento/movimientoApi'

const COLOR = { estable: '#3DDC97', bajo: '#F5B544', sin_referencia: '#5CC8F5', baja_calidad: '#F5B544' }

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
        <h2 id="mov-amb" className="h2">Movimiento y ambiente</h2>
        {obs > 0 && <Link to="/mission-intelligence" className="text-[13px] font-semibold">{obs === 1 ? 'Hay 1 observación contextual' : `Hay ${obs} observaciones contextuales`}</Link>}
      </div>
      {cargado && !ctx && <p className="m-0 text-sm text-[#F5D79A]">Sin conexión con la API: arráncala para ver tu movimiento y el ambiente</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-[#1C2740] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="k">Desempeño funcional</p>
            {s && (s.dato_demo ? <span className="tag simt">DEMO</span> : <span className="tag real">Real</span>)}
          </div>
          {s ? (
            <>
              <p className="m-0 text-sm text-[#A3AEC4]"><strong className="num text-[22px] text-[#E8ECF4]">{s.repeticiones}</strong> repeticiones · {NOMBRE_EJERCICIO[s.ejercicio]}</p>
              <p className="m-0 text-sm font-semibold" style={{ color: COLOR[s.comparacion.estado] }}>{s.comparacion.texto}</p>
            </>
          ) : (
            <p className="m-0 text-sm text-[#A3AEC4]">Sin evaluaciones todavía: haz una para ver tu desempeño contra tu normal</p>
          )}
          <Link to="/movement" className="btn sec mt-auto"><Activity size={18} /> {s ? 'Nueva evaluación ASTRA-MOVE' : 'Hacer evaluación ASTRA-MOVE'}</Link>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-[#1C2740] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="k">Ambiente de la misión</p>
            {ctx?.ambiente && (ctx.ambiente.capa === 'real' ? <span className="tag real">Sensor</span> : <span className="tag simt">SIMULADO</span>)}
          </div>
          {ctx?.ambiente ? (
            <>
              <p className="m-0 text-sm font-semibold" style={{ color: fuera.length ? '#F5B544' : '#3DDC97' }}>
                {fuera.length ? `Fuera de rango: ${nombres}` : 'Todas las variables dentro de rango'}
              </p>
              <p className="m-0 text-sm text-[#A3AEC4]">Escenario de demostración: {NOMBRE_ESCENARIO[ctx.escenario]}</p>
            </>
          ) : (
            <p className="m-0 text-sm text-[#A3AEC4]">Sin lecturas todavía</p>
          )}
          <Link to="/mission-intelligence" className="btn sec mt-auto"><Radar size={18} /> Ver inteligencia de misión</Link>
        </div>
      </div>
    </section>
  )
}
