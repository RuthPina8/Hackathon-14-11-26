import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react'
import { PageHeader, SimBanner } from '../components/ui/Page'
import { useSession } from '../store/useSession'
import { useAppStore } from '../store/useAppStore'
import { api } from '../lib/api'
import { astroNumero } from '../lib/adapters'
import type { Evolucion as EvolucionT, ItemEvolucion } from '../lib/back1'

const COLOR = { mejora: '#3DDC97', estable: '#5CC8F5', empeora: '#F5B544', sin_datos: '#93A0B8' } as const
const TXT = { mejora: 'Mejora', estable: 'Estable', empeora: 'Se aleja', sin_datos: 'Sin datos' } as const
const RUTA: Record<string, string> = { hr_reposo: '/indicators/hr', presion_sis: '/indicators/bp', reaccion_ms: '/indicators/rt', perclos: '/indicators/perclos', sueno_horas: '/indicators/sleep', animo: '/indicators/mood', estres: '/indicators/stress' }

const fmt = (v: number | null, unidad: string) => (v === null ? '—' : `${Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)}${unidad ? ` ${unidad}` : ''}`)

function Mini({ item }: { item: ItemEvolucion }) {
  const s = item.serie
  if (s.length < 2) return <div className="h-[46px] grid place-items-center text-[11px] text-[#93A0B8]">{s.length ? '1 día' : 'sin datos'}</div>
  const vals = s.map((p) => p.valor)
  const ref = item.referencia === 'ficha' ? item.ficha : item.inicio
  const lo = Math.min(...vals, ref ?? Infinity)
  const hi = Math.max(...vals, ref ?? -Infinity)
  const span = hi - lo || 1
  const x = (i: number) => (i / (s.length - 1)) * 236 + 2
  const y = (v: number) => 42 - ((v - lo) / span) * 38
  return (
    <svg viewBox="0 0 240 46" className="w-full h-[46px]" aria-hidden="true">
      {ref !== null && <line x1="0" x2="240" y1={y(ref)} y2={y(ref)} stroke="#5CC8F5" strokeOpacity="0.5" strokeDasharray="4 4" />}
      <polyline points={vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={COLOR[item.estado]} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="3" fill={COLOR[item.estado]} />
    </svg>
  )
}

export default function Evolucion() {
  const user = useSession((s) => s.user)
  const yo = astroNumero(user?.id) ?? 1
  const nMed = useAppStore((s) => s.status.nMediciones)
  const datoDemo = useAppStore((s) => s.status.datoDemo)
  const [ev, setEv] = useState<EvolucionT | null>(null)
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    let vivo = true
    void api.get<EvolucionT>(`/evolucion/${yo}`).then((r) => { if (vivo) { setEv(r); setCargado(true) } })
    return () => { vivo = false }
  }, [yo, nMed])

  const conDatos = ev?.items.filter((i) => i.estado !== 'sin_datos') ?? []
  const sinDatos = ev?.items.filter((i) => i.estado === 'sin_datos') ?? []

  return (
    <>
      {cargado && !ev && <SimBanner tag="SIN BACK">La evolución la calcula el motor; arranca la API para verla</SimBanner>}
      {ev && datoDemo && <SimBanner tag="DATO DE DEMO">Incluye datos del simulador de la misión</SimBanner>}
      <PageHeader kicker={`${user?.nombre ?? ''} · cómo vas en la misión`} title="Mi evolución"
        right={<Link to="/record" className="btn sec sm">{ev?.tiene_ficha ? 'Ver ficha médica' : 'Cargar ficha médica'}<ArrowRight size={15} /></Link>} />

      {ev && (
        <section className="card flex flex-wrap items-center gap-5" aria-label="Resumen de tu evolución">
          <div className="flex-1 min-w-[260px]">
            <p className="k">{ev.dias_con_datos} días con datos · referencia: {ev.tiene_ficha ? 'tu ficha médica pre-vuelo' : 'tu primera semana'}</p>
            <p className="m-0 mt-1.5 font-[family-name:var(--font-display)] text-xl font-semibold leading-snug">{ev.resumen}</p>
          </div>
          <div className="flex gap-4">
            {(['mejora', 'estable', 'empeora'] as const).map((k) => (
              <div key={k} className="text-center min-w-[70px]">
                <p className="big" style={{ fontSize: 30, color: COLOR[k] }}>{ev.items.filter((i) => i.estado === k).length}</p>
                <p className="k">{TXT[k]}</p>
              </div>
            ))}
          </div>
          {!ev.tiene_ficha && (
            <p className="m-0 w-full text-[13px] text-[#A3AEC4]">
              Sin ficha médica se compara contra tu primera semana y solo desde los 10 días con datos. <Link to="/record">Carga tu ficha</Link> para comparar contra tu evaluación en Tierra desde el primer día.
            </p>
          )}
        </section>
      )}

      {ev && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
          {conDatos.map((it, i) => {
            const Icono = it.estado === 'estable' || it.cambio === null ? Minus : it.cambio > 0 ? ArrowUpRight : ArrowDownRight
            const ref = it.referencia === 'ficha' ? it.ficha : it.inicio
            return (
              <motion.section key={it.tipo} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="card flex flex-col gap-3" aria-label={it.nombre} style={{ borderColor: it.estado === 'empeora' ? '#5C4A1C' : undefined }}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="h2" style={{ fontSize: 16 }}>{it.nombre}</h2>
                  <span className="tag inline-flex items-center gap-1" style={{ background: '#0A0F1B', color: COLOR[it.estado], boxShadow: `inset 0 0 0 1px ${COLOR[it.estado]}55` }}>
                    <Icono size={13} />{TXT[it.estado]}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><p className="k">{it.referencia === 'ficha' ? 'Ficha' : 'Inicio'}</p><p className="num m-0 mt-1 text-[15px] font-bold">{fmt(ref, '')}</p></div>
                  <div><p className="k">Últimos 7 días</p><p className="num m-0 mt-1 text-[15px] font-bold" style={{ color: COLOR[it.estado] }}>{fmt(it.reciente, '')}</p></div>
                  <div><p className="k">Cambio</p><p className="num m-0 mt-1 text-[15px] font-bold">{it.cambio === null ? '—' : `${it.cambio > 0 ? '+' : ''}${fmt(it.cambio, '')}`}{it.cambio_pct !== null && <span className="text-[11px] text-[#93A0B8]"> {it.cambio_pct > 0 ? '+' : ''}{it.cambio_pct}%</span>}</p></div>
                </div>
                <Mini item={it} />
                <p className="m-0 text-[13px] text-[#A3AEC4] leading-snug">
                  {it.explicacion}{it.unidad && it.cambio !== null ? '' : ''}
                  {it.tendencia_semana !== null && Math.abs(it.tendencia_semana) > 0 && ` · tendencia ${it.tendencia_semana > 0 ? '+' : ''}${fmt(it.tendencia_semana, it.unidad)} por semana`}
                </p>
                {RUTA[it.tipo] && <Link to={RUTA[it.tipo]} className="text-[13px] font-semibold mt-auto">Ver detalle</Link>}
              </motion.section>
            )
          })}
        </div>
      )}

      {ev && sinDatos.length > 0 && (
        <p className="m-0 text-[13px] text-[#93A0B8]">
          Sin datos todavía: {sinDatos.map((i) => i.nombre.toLowerCase()).join(', ')}. <Link to="/camera">Haz tu chequeo diario</Link>.
        </p>
      )}
      <p className="m-0 text-xs text-[#93A0B8] leading-relaxed">
        "Se aleja" significa que tu promedio de la última semana se movió en la dirección desfavorable más de medio desvío de tu propia variación. No es un diagnóstico: es una señal para revisar con el equipo médico.
      </p>
    </>
  )
}
