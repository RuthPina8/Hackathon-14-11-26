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
import { C } from '../lib/paleta'

type Range = 7 | 30 | 60
const FUENTE: Record<string, string> = { camara: 'Camera', prueba: 'Cognitive test', manual: 'Manual entry', apple_watch: 'Apple Watch', simulador: 'Simulator (demo)', modelo: 'Estimated' }

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
        label: p.dia_mision != null ? `day ${p.dia_mision}` : new Date(p.fecha).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
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
    const data: Punto[] = vals.map((x, i) => ({ i, label: i === range - 1 ? 'today' : `−${range - 1 - i}d`, v: Number(x.toFixed(d.dec + 1)), anom: x > upper || x < lower }))
    const today = vals[vals.length - 1]
    return { data, base: d.base, sd: d.sd, upper, lower, today, out: today > upper || today < lower, dom: [d.lo, d.hi] as [number, number], desdeIdx: d.warn ? Math.max(0, range - 7) : -1, n: range + 4 }
  }, [real, srv, key, range, d])

  const f = (x: number) => x.toFixed(d.dec)
  const z = v.sd ? ((v.today - v.base) / v.sd).toFixed(1) : '—'
  const clin = real && srv.rango_clinico ? `${srv.rango_clinico[0]} a ${srv.rango_clinico[1]}` : real ? 'no clinical range' : d.clin
  const fuentes = real ? [...new Set(srv.serie.map((p) => FUENTE[p.fuente] ?? p.fuente))].join(', ') : d.src

  const titulo = !real ? d.head
    : sinDatos ? `No ${d.label.toLowerCase()} measurements yet`
      : srv.alerta_id ? `There’s an open alert for your ${d.label.toLowerCase()}`
        : v.out ? `Your last measurement was outside your normal`
          : srv.linea_base.n < 3 ? 'We’re still learning your normal'
            : `Your ${d.label.toLowerCase()} is within your normal`
  const explicacion = !real ? d.explain
    : sinDatos ? 'Do your daily check-up to start building your personal baseline.'
      : srv.anomalias.length ? (srv.anomalias[srv.anomalias.length - 1].motivo ?? 'Value outside your normal') + `. ${srv.anomalias.length} point(s) outside your range in this period.`
        : srv.experimental ? 'Experimental signal: it’s saved and learns your normal, but it doesn’t raise alerts yet.'
          : `Compared against your baseline of ${srv.linea_base.n} measurements (${Math.round(srv.linea_base.peso_personal * 100)}% your normal, the rest clinical range).`

  const ultimas = [...v.data].reverse().slice(0, 6)

  return (
    <>
      {!statusReal && <SimBanner tag="SAMPLE DATA">No engine connection: this chart is sample data</SimBanner>}
      {real && srv.dato_demo && <SimBanner tag="DEMO DATA">This series includes mission simulator data; it’s marked with a dotted outline</SimBanner>}
      <PageHeader
        kicker={`Indicators · ${d.sys}`}
        title={d.name}
        right={<Segmented<Range> label="Time range" value={range} onChange={setRange} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 60, label: 'Mission' }]} />}
      />

      <div role="group" aria-label="Indicator" className="flex flex-wrap gap-2">
        {Object.entries(indicators).map(([k, ind]) => (
          <button key={k} type="button" className="chip" aria-pressed={k === key} onClick={() => navigate(`/indicators/${k}`)}>
            {!real && <span className="w-2 h-2 rounded-full" style={{ background: ind.warn ? C.warn : C.ok }} />}
            {ind.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-col gap-3.5" style={{ flex: '3 1 540px', minWidth: 0 }} aria-labelledby="graf">
          <h2 id="graf" className="h2" style={{ fontSize: 17, lineHeight: 1.4 }}>{cargando && !srv ? 'Loading…' : titulo}</h2>
          {sinDatos ? (
            <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-line2 text-center" style={{ height: 300 }}>
              <div className="flex flex-col items-center gap-3">
                <p className="m-0 text-sm text-muted">No measurements in this period</p>
                <Link to={d.capa === 'real' && d.tipo !== 'reaccion_ms' ? '/camera' : d.tipo === 'reaccion_ms' ? '/camera?paso=1' : d.tipo === 'presion_sis' ? '/camera?paso=2' : '/camera?paso=3'} className="btn pri sm">Take the measurement</Link>
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', height: 300 }} role="img" aria-label={`${d.name} vs your baseline`}>
              <ResponsiveContainer>
                <ComposedChart data={v.data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="i" type="number" domain={[0, Math.max(1, v.data.length - 1)]} allowDecimals={false} stroke={C.line3} tick={{ fill: C.faint, fontSize: 13 }} tickFormatter={(i: number) => v.data[i]?.label ?? ''} minTickGap={28} tickLine={false} />
                  <YAxis domain={v.dom} stroke={C.line3} tick={{ fill: C.faint, fontSize: 13, fontFamily: 'JetBrains Mono' }} width={48} tickLine={false} tickFormatter={(x: number) => x.toFixed(d.dec)} />
                  {v.upper !== null && v.lower !== null && (
                    <ReferenceArea y1={v.lower} y2={v.upper} fill={C.accent} fillOpacity={0.09} stroke="none"
                      label={{ value: `Your normal range ${f(v.lower)} to ${f(v.upper)}`, position: 'insideTopLeft', fill: C.accentSoft, fontSize: 13 }} />
                  )}
                  <ReferenceLine y={v.base} stroke={C.accent} strokeOpacity={0.55} strokeDasharray="5 5" />
                  {v.desdeIdx >= 0 && v.data.length > 1 && (
                    <ReferenceArea x1={v.desdeIdx} x2={v.data.length - 1} fill={C.warn} fillOpacity={0.08} stroke="none"
                      label={{ value: real ? 'From here (alert)' : 'CUSUM detects trend', position: 'insideTopRight', fill: C.warn, fontSize: 13, fontWeight: 600 }} />
                  )}
                  <Tooltip
                    contentStyle={{ background: C.panel, border: '1px solid #2F3F60', borderRadius: 10, fontSize: 14 }}
                    labelStyle={{ color: C.faint }}
                    labelFormatter={(i) => v.data[Number(i)]?.label ?? ''}
                    formatter={(x) => [`${Number(x).toFixed(d.dec)} ${d.unit}`, d.label]}
                  />
                  <Area type="monotone" dataKey="v" stroke="none" fill={C.text} fillOpacity={0.04} isAnimationActive />
                  <Line
                    type="monotone" dataKey="v" stroke={C.text} strokeWidth={2.2} isAnimationActive
                    dot={(p: { cx?: number; cy?: number; index?: number; payload?: Punto }) =>
                      p.payload?.anom
                        ? <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill={C.warn} stroke={C.panel} strokeWidth={2} />
                        : real && v.data.length <= 40
                          ? <circle key={p.index} cx={p.cx} cy={p.cy} r={2.5} fill={p.payload?.demo ? 'transparent' : C.text} stroke={C.text} strokeDasharray={p.payload?.demo ? '2 2' : undefined} />
                          : <g key={p.index} />}
                    activeDot={{ r: 5, fill: C.accent }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2"><span className="w-4 h-2 rounded-sm" style={{ background: 'rgba(92,200,245,0.3)' }} />Your normal range (±2σ)</span>
            <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-warn" />Outside your normal</span>
            {real && v.upper === null && !sinDatos && <span className="text-faint">The band appears with 3 or more measurements</span>}
          </div>
        </section>

        <div className="flex flex-col gap-4" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <section className="card grid grid-cols-2 gap-x-3.5 gap-y-4" aria-labelledby="resumen">
            <h2 id="resumen" className="h2 col-span-2">Summary</h2>
            <div><p className="k">Latest</p><p className="big" style={{ marginTop: 4, fontSize: 28, color: v.out ? C.warn : C.text }}>{sinDatos ? '--' : f(v.today)}</p></div>
            <div><p className="k">Your normal</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{sinDatos || v.n < 3 ? 'aprendiendo' : `${f(v.base)} ± ${f(v.sd)}`}</p></div>
            <div><p className="k">z-score</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{sinDatos || v.n < 3 ? '—' : z}</p></div>
            <div><p className="k">Clinical range</p><p className="big" style={{ marginTop: 4, fontSize: 18 }}>{clin}</p></div>
          </section>
          <section className="card flex flex-col gap-2.5" aria-labelledby="det">
            <h2 id="det" className="h2">What the model detected</h2>
            <p className="m-0 text-sm leading-relaxed">{explicacion}</p>
            {real && srv.alerta_id && <Link to={`/alerts?id=${srv.alerta_id}`} className="text-[13px] font-semibold">View the alert</Link>}
            {real && srv.linea_base.congelada && <p className="m-0 text-sm text-warn">Your baseline is frozen while the alert stays open, so it doesn’t learn the abnormal as normal.</p>}
            <p className="m-0 text-sm text-faint leading-relaxed">Alerts compare against your own normal, not just the clinical range</p>
          </section>
          <section className="card flex flex-col gap-2.5" aria-labelledby="fuente">
            <h2 id="fuente" className="h2">Source of this data</h2>
            <p className="m-0 text-sm flex justify-between gap-2"><span className={`tag ${d.capa}`}>{fuentes || d.src}</span><span className="num text-muted">{real ? srv.serie.length : v.n} measurements</span></p>
          </section>
        </div>
      </div>

      {!sinDatos && (
        <section className="card" style={{ padding: 0, overflow: 'hidden' }} aria-labelledby="ult">
          <h2 id="ult" className="h2" style={{ padding: '18px 16px 10px' }}>Latest measurements</h2>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="trow" style={{ gridTemplateColumns: '1.2fr 1fr 1.2fr .8fr 1.4fr', minHeight: 38 }}>
                <span className="k">Date</span><span className="k">Value</span><span className="k">Source</span><span className="k">Confidence</span><span className="k">Status</span>
              </div>
              {ultimas.map((p) => {
                const c = p.anom ? C.warn : C.ok
                return (
                  <div key={p.i} className="trow" style={{ gridTemplateColumns: '1.2fr 1fr 1.2fr .8fr 1.4fr' }}>
                    <span>{p.fecha ? new Date(p.fecha).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : p.label}</span>
                    <span className="num font-bold">{f(p.v)}{d.unit ? ` ${d.unit}` : ''}</span>
                    <span>{p.fuente ? FUENTE[p.fuente] ?? p.fuente : d.src}</span>
                    <span className="num">{p.conf != null ? p.conf.toFixed(2) : d.capa === 'self' ? 'n/a' : '—'}</span>
                    <span className="inline-flex items-center gap-2" style={{ color: c }}><span className="w-2 h-2 rounded-full" style={{ background: c }} />{p.anom ? 'Outside your normal' : 'Normal'}</span>
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
