import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine,
} from 'recharts'
import { indicators, mockSeries } from '../store/mockData'
import { PageHeader, Segmented, SimBanner } from '../components/ui/Page'
import { useAppStore } from '../store/useAppStore'
import { useSession } from '../store/useSession'
import { api } from '../lib/api'
import { astroNumero } from '../lib/adapters'
import type { ServerIndicator } from '../lib/back1'

type Range = 7 | 30 | 60
const FUENTE: Record<string, string> = { camara: 'Cámara', prueba: 'Prueba cognitiva', manual: 'Registro manual', apple_watch: 'Apple Watch', simulador: 'Simulador (demo)', modelo: 'Estimado' }

type Punto = { i: number; label: string; v: number; anom: boolean; fecha?: string; fuente?: string; conf?: number; demo?: boolean }

export default function Detalle() {
  const { tipo = 'hr' } = useParams()
  const key = indicators[tipo] ? tipo : 'hr'
  const d = indicators[key]
  const navigate = useNavigate()
  const statusReal = useAppStore((s) => s.statusReal)
  const nMed = useAppStore((s) => s.status.nMediciones)
  const yo = astroNumero(useSession((s) => s.user?.id)) ?? 1
  const [range, setRange] = useState<Range>(30)
  // Respuesta del motor junto con la consulta que la pidió: si cambia la consulta, se ve "cargando"
  const consulta = `${d.tipo}|${range}|${yo}`
  const [resp, setResp] = useState<{ consulta: string; data: ServerIndicator | null } | null>(null)

  useEffect(() => {
    if (!statusReal) return
    let vivo = true
    void api.get<ServerIndicator>(`/indicators/${d.tipo}?astronauta_id=${yo}&range=${range === 60 ? 'mision' : `${range}d`}`).then((r) => {
      if (vivo) setResp({ consulta, data: r })
    })
    return () => { vivo = false }
  }, [statusReal, d.tipo, range, yo, nMed, consulta])

  const srv = statusReal && resp ? resp.data : null
  const cargando = statusReal && resp?.consulta !== consulta
  const real = statusReal && srv !== null
  const sinDatos = real && srv.serie.length === 0

  const v = useMemo(() => {
    if (real && srv.serie.length > 0) {
      const pts = srv.serie.filter((p) => p.fuente !== 'modelo')
      const data: Punto[] = pts.map((p, i) => ({
        i,
        label: p.dia_mision != null ? `día ${p.dia_mision}` : new Date(p.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }),
        v: Number(p.valor.toFixed(d.dec + 1)), anom: p.anomalo, fecha: p.fecha, fuente: p.fuente, conf: p.confianza, demo: p.fuente === 'simulador',
      }))
      const { media, desviacion, n } = srv.linea_base
      const base = media ?? data.reduce((a, b) => a + b.v, 0) / data.length
      const sd = desviacion ?? 0
      const upper = n >= 3 && sd ? base + 2 * sd : null
      const lower = n >= 3 && sd ? base - 2 * sd : null
      const vals = data.map((x) => x.v)
      const lo = Math.min(...vals, lower ?? Infinity)
      const hi = Math.max(...vals, upper ?? -Infinity)
      const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1
      const desdeIdx = srv.desde ? data.findIndex((x) => x.fecha && new Date(x.fecha) >= new Date(srv.desde!)) : -1
      return { data, base, sd, upper, lower, today: vals[vals.length - 1], out: data[data.length - 1].anom, dom: [lo - pad, hi + pad] as [number, number], desdeIdx, n }
    }
    const vals = mockSeries(key, range)
    const upper = d.base + 2 * d.sd
    const lower = d.base - 2 * d.sd
    const data: Punto[] = vals.map((x, i) => ({ i, label: i === range - 1 ? 'hoy' : `−${range - 1 - i}d`, v: Number(x.toFixed(d.dec + 1)), anom: x > upper || x < lower }))
    const today = vals[vals.length - 1]
    return { data, base: d.base, sd: d.sd, upper, lower, today, out: today > upper || today < lower, dom: [d.lo, d.hi] as [number, number], desdeIdx: d.warn ? Math.max(0, range - 7) : -1, n: range + 4 }
  }, [real, srv, key, range, d])

  const f = (x: number) => x.toFixed(d.dec)
  const z = v.sd ? ((v.today - v.base) / v.sd).toFixed(1) : '—'
  const clin = real && srv.rango_clinico ? `${srv.rango_clinico[0]} a ${srv.rango_clinico[1]}` : real ? 'sin rango clínico' : d.clin
  const fuentes = real ? [...new Set(srv.serie.map((p) => FUENTE[p.fuente] ?? p.fuente))].join(', ') : d.src

  const titulo = !real ? d.head
    : sinDatos ? `Aún no hay mediciones de ${d.label.toLowerCase()}`
      : srv.alerta_id ? `Hay una alerta abierta por tu ${d.label.toLowerCase()}`
        : v.out ? `Tu última medición quedó fuera de tu normal`
          : srv.linea_base.n < 3 ? 'Todavía estamos aprendiendo tu normal'
            : `Tu ${d.label.toLowerCase()} está dentro de tu normal`
  const explicacion = !real ? d.explain
    : sinDatos ? 'Haz tu chequeo diario para empezar a construir tu línea base personal.'
      : srv.anomalias.length ? (srv.anomalias[srv.anomalias.length - 1].motivo ?? 'Valor fuera de tu normal') + `. ${srv.anomalias.length} punto(s) fuera de tu rango en este periodo.`
        : srv.experimental ? 'Señal experimental: se guarda y aprende tu normal, pero todavía no genera alertas.'
          : `Comparado contra tu línea base de ${srv.linea_base.n} mediciones (${Math.round(srv.linea_base.peso_personal * 100)}% tu normal, el resto rango clínico).`

  const ultimas = [...v.data].reverse().slice(0, 6)

  return (
    <>
      {!statusReal && <SimBanner tag="DATOS DE EJEMPLO">Sin conexión con el motor: esta gráfica es de ejemplo</SimBanner>}
      {real && srv.dato_demo && <SimBanner tag="DATO DE DEMO">Esta serie incluye datos del simulador de la misión; se marcan con borde punteado</SimBanner>}
      <PageHeader
        kicker={`Indicadores · ${d.sys}`}
        title={d.name}
        right={<Segmented<Range> label="Rango de tiempo" value={range} onChange={setRange} options={[{ value: 7, label: '7 días' }, { value: 30, label: '30 días' }, { value: 60, label: 'Misión' }]} />}
      />

      <div role="group" aria-label="Indicador" className="flex flex-wrap gap-2">
        {Object.entries(indicators).map(([k, ind]) => (
          <button key={k} type="button" className="chip" aria-pressed={k === key} onClick={() => navigate(`/indicators/${k}`)}>
            {!real && <span className="w-2 h-2 rounded-full" style={{ background: ind.warn ? '#F5B544' : '#3DDC97' }} />}
            {ind.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-col gap-3.5" style={{ flex: '3 1 540px', minWidth: 0 }} aria-labelledby="graf">
          <h2 id="graf" className="h2" style={{ fontSize: 17, lineHeight: 1.4 }}>{cargando && !srv ? 'Cargando…' : titulo}</h2>
          {sinDatos ? (
            <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-[#2F3F60] text-center" style={{ height: 300 }}>
              <div className="flex flex-col items-center gap-3">
                <p className="m-0 text-sm text-[#A3AEC4]">Sin mediciones en este periodo</p>
                <Link to={d.capa === 'real' && d.tipo !== 'reaccion_ms' ? '/camera' : d.tipo === 'reaccion_ms' ? '/camera?paso=1' : d.tipo === 'presion_sis' ? '/camera?paso=2' : '/camera?paso=3'} className="btn pri sm">Hacer la medición</Link>
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', height: 300 }} role="img" aria-label={`${d.name} contra tu línea base`}>
              <ResponsiveContainer>
                <ComposedChart data={v.data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1C2740" vertical={false} />
                  <XAxis dataKey="i" type="number" domain={[0, Math.max(1, v.data.length - 1)]} allowDecimals={false} stroke="#46536F" tick={{ fill: '#93A0B8', fontSize: 11 }} tickFormatter={(i: number) => v.data[i]?.label ?? ''} minTickGap={28} tickLine={false} />
                  <YAxis domain={v.dom} stroke="#46536F" tick={{ fill: '#93A0B8', fontSize: 11, fontFamily: 'JetBrains Mono' }} width={48} tickLine={false} tickFormatter={(x: number) => x.toFixed(d.dec)} />
                  {v.upper !== null && v.lower !== null && (
                    <ReferenceArea y1={v.lower} y2={v.upper} fill="#5CC8F5" fillOpacity={0.09} stroke="none"
                      label={{ value: `Tu rango normal ${f(v.lower)} a ${f(v.upper)}`, position: 'insideTopLeft', fill: '#8AD9F8', fontSize: 11 }} />
                  )}
                  <ReferenceLine y={v.base} stroke="#5CC8F5" strokeOpacity={0.55} strokeDasharray="5 5" />
                  {v.desdeIdx >= 0 && v.data.length > 1 && (
                    <ReferenceArea x1={v.desdeIdx} x2={v.data.length - 1} fill="#F5B544" fillOpacity={0.08} stroke="none"
                      label={{ value: real ? 'Desde aquí (alerta)' : 'CUSUM detecta tendencia', position: 'insideTopRight', fill: '#F5B544', fontSize: 11, fontWeight: 600 }} />
                  )}
                  <Tooltip
                    contentStyle={{ background: '#0E1422', border: '1px solid #2F3F60', borderRadius: 10, fontSize: 12 }}
                    labelStyle={{ color: '#93A0B8' }}
                    labelFormatter={(i) => v.data[Number(i)]?.label ?? ''}
                    formatter={(x) => [`${Number(x).toFixed(d.dec)} ${d.unit}`, d.label]}
                  />
                  <Area type="monotone" dataKey="v" stroke="none" fill="#E8ECF4" fillOpacity={0.04} isAnimationActive />
                  <Line
                    type="monotone" dataKey="v" stroke="#E8ECF4" strokeWidth={2.2} isAnimationActive
                    dot={(p: { cx?: number; cy?: number; index?: number; payload?: Punto }) =>
                      p.payload?.anom
                        ? <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill="#F5B544" stroke="#0E1422" strokeWidth={2} />
                        : real && v.data.length <= 40
                          ? <circle key={p.index} cx={p.cx} cy={p.cy} r={2.5} fill={p.payload?.demo ? 'transparent' : '#E8ECF4'} stroke="#E8ECF4" strokeDasharray={p.payload?.demo ? '2 2' : undefined} />
                          : <g key={p.index} />}
                    activeDot={{ r: 5, fill: '#5CC8F5' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-[#A3AEC4]">
            <span className="inline-flex items-center gap-2"><span className="w-4 h-2 rounded-sm" style={{ background: 'rgba(92,200,245,0.3)' }} />Tu rango normal (±2σ)</span>
            <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#F5B544]" />Fuera de tu normal</span>
            {real && v.upper === null && !sinDatos && <span className="text-[#93A0B8]">La banda aparece con 3 mediciones o más</span>}
          </div>
        </section>

        <div className="flex flex-col gap-4" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <section className="card grid grid-cols-2 gap-x-3.5 gap-y-4" aria-labelledby="resumen">
            <h2 id="resumen" className="h2 col-span-2">Resumen</h2>
            <div><p className="k">Último</p><p className="big" style={{ marginTop: 4, fontSize: 28, color: v.out ? '#F5B544' : '#E8ECF4' }}>{sinDatos ? '--' : f(v.today)}</p></div>
            <div><p className="k">Tu normal</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{sinDatos || v.n < 3 ? 'aprendiendo' : `${f(v.base)} ± ${f(v.sd)}`}</p></div>
            <div><p className="k">z-score</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{sinDatos || v.n < 3 ? '—' : z}</p></div>
            <div><p className="k">Rango clínico</p><p className="big" style={{ marginTop: 4, fontSize: 18 }}>{clin}</p></div>
          </section>
          <section className="card flex flex-col gap-2.5" aria-labelledby="det">
            <h2 id="det" className="h2">Qué detectó el modelo</h2>
            <p className="m-0 text-sm leading-relaxed">{explicacion}</p>
            {real && srv.alerta_id && <Link to={`/alerts?id=${srv.alerta_id}`} className="text-[13px] font-semibold">Ver la alerta</Link>}
            {real && srv.linea_base.congelada && <p className="m-0 text-xs text-[#F5B544]">Tu línea base está congelada mientras la alerta siga abierta, para no aprender lo anormal como normal.</p>}
            <p className="m-0 text-xs text-[#93A0B8] leading-relaxed">Las alertas comparan contra tu propio normal, no solo contra el rango clínico</p>
          </section>
          <section className="card flex flex-col gap-2.5" aria-labelledby="fuente">
            <h2 id="fuente" className="h2">Fuente de este dato</h2>
            <p className="m-0 text-sm flex justify-between gap-2"><span className={`tag ${d.capa}`}>{fuentes || d.src}</span><span className="num text-[#A3AEC4]">{real ? srv.serie.length : v.n} mediciones</span></p>
          </section>
        </div>
      </div>

      {!sinDatos && (
        <section className="card" style={{ padding: 0, overflow: 'hidden' }} aria-labelledby="ult">
          <h2 id="ult" className="h2" style={{ padding: '18px 16px 10px' }}>Últimas mediciones</h2>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="trow" style={{ gridTemplateColumns: '1.2fr 1fr 1.2fr .8fr 1.4fr', minHeight: 38 }}>
                <span className="k">Fecha</span><span className="k">Valor</span><span className="k">Fuente</span><span className="k">Confianza</span><span className="k">Estado</span>
              </div>
              {ultimas.map((p) => {
                const c = p.anom ? '#F5B544' : '#3DDC97'
                return (
                  <div key={p.i} className="trow" style={{ gridTemplateColumns: '1.2fr 1fr 1.2fr .8fr 1.4fr' }}>
                    <span>{p.fecha ? new Date(p.fecha).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : p.label}</span>
                    <span className="num font-bold">{f(p.v)}{d.unit ? ` ${d.unit}` : ''}</span>
                    <span>{p.fuente ? FUENTE[p.fuente] ?? p.fuente : d.src}</span>
                    <span className="num">{p.conf != null ? p.conf.toFixed(2) : d.capa === 'self' ? 'n/a' : '—'}</span>
                    <span className="inline-flex items-center gap-2" style={{ color: c }}><span className="w-2 h-2 rounded-full" style={{ background: c }} />{p.anom ? 'Fuera de tu normal' : 'Normal'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
