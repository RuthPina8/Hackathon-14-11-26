import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine,
} from 'recharts'
import { indicators, mockSeries } from '../store/mockData'
import { PageHeader, Segmented } from '../components/ui/Page'

type Range = 7 | 30 | 60
const whens = ['Hoy 09:12', 'Ayer 21:40', 'Ayer 09:05', 'Hace 2 días']
const confs = ['0.82', '0.64', '0.88', '0.79']

export default function Detalle() {
  const { tipo = 'hr' } = useParams()
  const key = indicators[tipo] ? tipo : 'hr'
  const d = indicators[key]
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>(30)

  const { data, upper, lower, today, out } = useMemo(() => {
    const vals = mockSeries(key, range)
    const upper = d.base + 2 * d.sd
    const lower = d.base - 2 * d.sd
    const data = vals.map((v, i) => ({
      i,
      label: i === range - 1 ? 'hoy' : `−${range - 1 - i}d`,
      v: Number(v.toFixed(d.dec + 1)),
      anom: v > upper || v < lower,
    }))
    const today = vals[vals.length - 1]
    return { data, upper, lower, today, out: today > upper || today < lower }
  }, [key, range, d])

  const f = (v: number) => v.toFixed(d.dec)
  const z = ((today - d.base) / d.sd).toFixed(1)
  const cusumStart = Math.max(0, range - 7)

  return (
    <>
      <PageHeader
        kicker={`Indicadores · ${d.sys}`}
        title={d.name}
        right={
          <Segmented<Range>
            label="Rango de tiempo"
            value={range}
            onChange={setRange}
            options={[{ value: 7, label: '7 días' }, { value: 30, label: '30 días' }, { value: 60, label: 'Misión' }]}
          />
        }
      />

      <div role="group" aria-label="Indicador" className="flex flex-wrap gap-2">
        {Object.entries(indicators).map(([k, ind]) => (
          <button key={k} type="button" className="chip" aria-pressed={k === key} onClick={() => navigate(`/indicators/${k}`)}>
            <span className="w-2 h-2 rounded-full" style={{ background: ind.warn ? '#F5B544' : '#3DDC97' }} />
            {ind.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-col gap-3.5" style={{ flex: '3 1 540px', minWidth: 0 }} aria-labelledby="graf">
          <h2 id="graf" className="h2" style={{ fontSize: 17, lineHeight: 1.4 }}>{d.head}</h2>
          <div style={{ width: '100%', height: 300 }} role="img" aria-label={`${d.name} de los últimos ${range} días contra tu línea base`}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1C2740" vertical={false} />
                <XAxis dataKey="label" stroke="#46536F" tick={{ fill: '#93A0B8', fontSize: 11 }} interval={Math.max(0, Math.floor(range / 6) - 1)} tickLine={false} />
                <YAxis domain={[d.lo, d.hi]} stroke="#46536F" tick={{ fill: '#93A0B8', fontSize: 11, fontFamily: 'JetBrains Mono' }} width={44} tickLine={false} tickFormatter={(v: number) => v.toFixed(d.dec)} />
                <ReferenceArea y1={lower} y2={upper} fill="#5CC8F5" fillOpacity={0.09} stroke="none"
                  label={{ value: `Tu rango normal ${f(lower)} a ${f(upper)}`, position: 'insideTopLeft', fill: '#8AD9F8', fontSize: 11 }} />
                <ReferenceLine y={d.base} stroke="#5CC8F5" strokeOpacity={0.55} strokeDasharray="5 5" />
                {d.warn && (
                  <ReferenceArea x1={data[cusumStart].label} x2="hoy" fill="#F5B544" fillOpacity={0.08} stroke="none"
                    label={{ value: 'CUSUM detecta tendencia', position: 'insideTopRight', fill: '#F5B544', fontSize: 11, fontWeight: 600 }} />
                )}
                <Tooltip
                  contentStyle={{ background: '#0E1422', border: '1px solid #2F3F60', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: '#93A0B8' }}
                  formatter={(v: number) => [`${v.toFixed(d.dec)} ${d.unit}`, d.label]}
                />
                <Area type="monotone" dataKey="v" stroke="none" fill="#E8ECF4" fillOpacity={0.04} isAnimationActive />
                <Line
                  type="monotone" dataKey="v" stroke="#E8ECF4" strokeWidth={2.2} isAnimationActive
                  dot={(p: { cx?: number; cy?: number; index?: number; payload?: { anom: boolean } }) =>
                    p.payload?.anom
                      ? <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill="#F5B544" stroke="#0E1422" strokeWidth={2} />
                      : <g key={p.index} />}
                  activeDot={{ r: 5, fill: '#5CC8F5' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-[#A3AEC4]">
            <span className="inline-flex items-center gap-2"><span className="w-4 h-2 rounded-sm" style={{ background: 'rgba(92,200,245,0.3)' }} />Tu rango normal</span>
            <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#F5B544]" />Fuera de tu rango</span>
            <span className="ml-auto text-[#93A0B8]">Datos de ejemplo · TODO Back 1: GET /indicators/{key}</span>
          </div>
        </section>

        <div className="flex flex-col gap-4" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <section className="card grid grid-cols-2 gap-x-3.5 gap-y-4" aria-labelledby="resumen">
            <h2 id="resumen" className="h2 col-span-2">Resumen</h2>
            <div><p className="k">Hoy</p><p className="big" style={{ marginTop: 4, fontSize: 28, color: out ? '#F5B544' : '#E8ECF4' }}>{f(today)}</p></div>
            <div><p className="k">Tu normal</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{f(d.base)} ± {f(d.sd)}</p></div>
            <div><p className="k">z-score</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{z}</p></div>
            <div><p className="k">Rango clínico</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{d.clin}</p></div>
          </section>
          <section className="card flex flex-col gap-2.5" aria-labelledby="det">
            <h2 id="det" className="h2">Qué detectó el modelo</h2>
            <p className="m-0 text-sm leading-relaxed">{d.explain}</p>
            <p className="m-0 text-xs text-[#93A0B8] leading-relaxed">Las alertas comparan contra tu propio normal, no solo contra el rango clínico</p>
          </section>
          <section className="card flex flex-col gap-2.5" aria-labelledby="fuente">
            <h2 id="fuente" className="h2">Fuente de este dato</h2>
            <p className="m-0 text-sm flex justify-between gap-2"><span className={`tag ${d.capa}`}>{d.src}</span><span className="num text-[#A3AEC4]">{range + 4} mediciones</span></p>
          </section>
        </div>
      </div>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }} aria-labelledby="ult">
        <h2 id="ult" className="h2" style={{ padding: '18px 16px 10px' }}>Últimas mediciones</h2>
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            {[null, ...whens].map((w, j) => {
              const cols = { gridTemplateColumns: '1.2fr 1fr 1fr .8fr 1.4fr' }
              if (w === null) return (
                <div key="h" className="trow" style={{ ...cols, minHeight: 38 }}>
                  <span className="k">Fecha</span><span className="k">Valor</span><span className="k">Fuente</span><span className="k">Confianza</span><span className="k">Estado</span>
                </div>
              )
              const v = data[data.length - j]?.v ?? d.base
              const o = v > upper || v < lower
              const c = o ? '#F5B544' : '#3DDC97'
              return (
                <div key={w} className="trow" style={cols}>
                  <span>{w}</span>
                  <span className="num font-bold">{f(v)}{d.unit ? ` ${d.unit}` : ''}</span>
                  <span>{d.src}</span>
                  <span className="num">{d.capa === 'self' ? 'n/a' : confs[j - 1]}</span>
                  <span className="inline-flex items-center gap-2" style={{ color: c }}><span className="w-2 h-2 rounded-full" style={{ background: c }} />{o ? 'Fuera de tu normal' : 'Normal'}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
