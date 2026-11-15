import { useEffect, useState } from 'react'
import { useWsEvent } from '../../lib/useWsEvent'
import { ambienteApi, NOMBRE_ESCENARIO, type Escenario, type Lectura, type Rango, type Variable } from './ambienteApi'

const DECIMALES: Record<Variable, number> = { co2_ppm: 0, o2_pct: 1, temp_c: 1, humedad_pct: 0, radiacion_msv_dia: 2 }

function textoRango(r: Rango) {
  if (r.minimo !== null && r.maximo !== null) return `${r.minimo}–${r.maximo} ${r.unidad}`
  if (r.maximo !== null) return `hasta ${r.maximo} ${r.unidad}`
  if (r.minimo !== null) return `desde ${r.minimo} ${r.unidad}`
  return r.unidad
}

// Telemetría ambiental en vivo. Todo SIMULADO en la demo, y así se dice en pantalla.
export default function AmbientePanel({ controles = true }: { controles?: boolean }) {
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [rangos, setRangos] = useState<Rango[]>([])
  const [escenario, setEscenario] = useState<Escenario>('estable')
  const [nota, setNota] = useState('')
  const [sinBack, setSinBack] = useState(false)

  useEffect(() => {
    void ambienteApi.estado().then((e) => {
      if (!e) { setSinBack(true); return }
      setLectura(e.ultima); setRangos(e.rangos); setEscenario(e.escenario); setNota(e.nota)
    })
  }, [])

  useWsEvent(['telemetry_updated'], (_, data) => {
    const l = data as Lectura
    setLectura(l)
    if (l.escenario) setEscenario(l.escenario)
  })

  const simular = async (e: Escenario) => {
    setEscenario(e)
    const r = await ambienteApi.simular(e)
    if (r) { setLectura(r.ultima); setRangos(r.rangos) }
  }

  const real = lectura?.capa === 'real'

  return (
    <section className="card sim flex flex-col gap-5" aria-labelledby="amb">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="amb" className="h2">Ambiente de la misión</h2>
        {real ? <span className="tag real">SENSOR REAL</span> : <span className="tag simt" style={{ fontSize: 13, padding: '6px 12px' }}>SIMULADO</span>}
      </div>
      {sinBack && <p className="m-0 text-base text-[#F5D79A]">Sin conexión con la API: arráncala para ver la telemetría</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {rangos.map((r) => {
          const v = lectura?.[r.variable]
          const fuera = lectura?.fuera_de_rango.includes(r.variable) ?? false
          return (
            <div key={r.variable} className="rounded-2xl border-2 p-4" style={{ borderColor: fuera ? '#F5B544' : '#1C2740', background: fuera ? '#211A0B' : '#0A0F1B' }}>
              <p className="k">{r.nombre}</p>
              <p className="num m-0 mt-1 text-[30px] font-bold" style={{ color: fuera ? '#F5B544' : '#E8ECF4' }}>
                {v === undefined ? '--' : v.toFixed(DECIMALES[r.variable])}
              </p>
              <p className="m-0 text-sm text-[#A3AEC4]">{r.unidad}</p>
              <p className="m-0 mt-2 text-sm" style={{ color: fuera ? '#F5D79A' : '#93A0B8' }}>{fuera ? 'Fuera de rango · ' : 'Rango · '}{textoRango(r)}</p>
            </div>
          )
        })}
      </div>

      {controles && (
        <div className="flex flex-col gap-3">
          <p className="k">Escenario de demostración</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['estable', 'cambio', 'revision'] as Escenario[]).map((e) => (
              <button key={e} type="button" className={escenario === e ? 'btn pri' : 'btn sec'} aria-pressed={escenario === e} onClick={() => void simular(e)}>
                {NOMBRE_ESCENARIO[e]}
              </button>
            ))}
          </div>
        </div>
      )}
      {nota && <p className="m-0 text-sm text-[#93A0B8]">{nota}</p>}
    </section>
  )
}
