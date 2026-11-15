import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { environmentProfiles, environments, type EnvironmentId } from '../store/mockData'
import { PageHeader, Segmented, SimBanner } from '../components/ui/Page'

// TODO Back 2: GET /simulation?env=...&day=... — por ahora se calcula aquí igual que el canvas.
const X0 = 36, X1 = 388, Y0 = 16, Y1 = 160
const xOf = (d: number) => X0 + (d / 180) * (X1 - X0)
const boneY = (pct: number) => Y1 - (pct / 10) * (Y1 - Y0)
const radY = (v: number) => Y1 - (Math.min(600, v) / 600) * (Y1 - Y0)

function Axis({ labels }: { labels: [string, string, string] }) {
  return (
    <>
      <line x1={X0} x2={X1} y1={Y0} y2={Y0} stroke="#1C2740" />
      <line x1={X0} x2={X1} y1={88} y2={88} stroke="#1C2740" />
      <line x1={X0} x2={X1} y1={Y1} y2={Y1} stroke="#2F3F60" />
      {labels.map((l, i) => <text key={l} x={30} y={[20, 92, 164][i]} fill="#93A0B8" fontSize={10} textAnchor="end" fontFamily="JetBrains Mono, monospace">{l}</text>)}
      <text x={X0} y={184} fill="#93A0B8" fontSize={10}>día 0</text>
      <text x={X1} y={184} fill="#93A0B8" fontSize={10} textAnchor="end">día 180</text>
    </>
  )
}

export default function Simulacion() {
  const env = useAppStore((s) => s.environment)
  const setEnv = useAppStore((s) => s.setEnvironment)
  const [day, setDay] = useState(120)
  const p = environmentProfiles[env]

  const months = day / 30
  const bone = p.micro ? `−${months.toFixed(1)} a −${(months * 1.5).toFixed(1)}%` : 'No aplica'
  const radVal = p.micro ? p.rate * day : p.rate
  const radPct = Math.min(100, Math.round((radVal / 600) * 100))
  const radEnd = p.micro ? p.rate * 180 : p.rate
  const radC = radPct > 70 ? '#FF6B7A' : radPct > 40 ? '#F5B544' : '#5CC8F5'
  const mx = xOf(day)
  const json = JSON.stringify({ environment_id: env, gravity_profile: p.g, radiation_mSv_day: p.rate, comm_delay: p.delay, protocolo_activo: p.protocol }, null, 2)

  return (
    <>
      <SimBanner>Lo que el sistema haría en una misión real, estos datos no se miden y nunca entran al motor de anomalías</SimBanner>
      <PageHeader
        kicker="Proyección a 180 días"
        title="Simulación de misión"
        right={<Segmented<EnvironmentId> label="Entorno" value={env} onChange={setEnv} options={environments.map((e) => ({ value: e, label: environmentProfiles[e].nombre }))} />}
      />

      <section className="card sim flex flex-col gap-3" aria-labelledby="dia">
        <div className="flex flex-wrap justify-between items-baseline gap-2">
          <h2 id="dia" className="h2">Día de la misión</h2>
          <p className="m-0 text-sm text-[#A3AEC4]"><strong className="num text-[28px] text-[#E8ECF4]">{day}</strong> de 180</p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-[#93A0B8]">Mueve para proyectar
          <input type="range" min={0} max={180} value={day} onChange={(e) => setDay(Number(e.target.value))} />
        </label>
        <div className="num flex justify-between text-[11px] text-[#93A0B8]">{[0, 30, 60, 90, 120, 150, 180].map((d) => <span key={d}>{d}</span>)}</div>
      </section>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
        <section className="card sim flex flex-col gap-2"><h2 className="k">Densidad ósea</h2>
          <p className="big" style={{ fontSize: 28, color: p.micro && months * 1.5 > 6 ? '#F5B544' : '#E8ECF4' }}>{bone}</p>
          <p className="m-0 text-xs text-[#A3AEC4] leading-relaxed">1 a 1.5% por mes en huesos que cargan peso</p></section>
        <section className="card sim flex flex-col gap-2"><h2 className="k">Radiación acumulada</h2>
          <p className="big" style={{ fontSize: 28 }}>{Math.round(radVal)} <span className="text-sm font-medium text-[#A3AEC4] font-sans">mSv</span></p>
          <span className="h-2 rounded bg-[#1C2740]"><motion.span className="block h-full rounded" animate={{ width: `${radPct}%`, background: radC }} /></span>
          <p className="m-0 text-xs text-[#A3AEC4]"><span className="num">{radPct}%</span> del límite de carrera de 600 mSv</p></section>
        <section className="card sim flex flex-col gap-2"><h2 className="k">Retraso con Tierra</h2>
          <p className="big" style={{ fontSize: 28 }}>{p.delay}</p>
          <p className="m-0 text-xs text-[#A3AEC4] leading-relaxed">{p.note}</p></section>
        <section className="card sim flex flex-col gap-2"><h2 className="k">Riesgo dominante</h2>
          <p className="m-0 font-[family-name:var(--font-display)] text-[19px] font-semibold leading-tight">{p.risk}</p>
          <p className="m-0 text-xs text-[#A3AEC4] leading-relaxed">{p.protocol}</p></section>
      </div>

      <div className="flex flex-wrap gap-5">
        <section className="card sim flex flex-col gap-2.5" style={{ flex: '1 1 380px', minWidth: 0 }}>
          <h2 className="h2">Pérdida ósea proyectada</h2>
          <svg width="100%" viewBox="0 0 400 200" role="img" aria-label="Proyección de pérdida ósea a 180 días">
            <Axis labels={['−10%', '−5%', '0']} />
            {p.micro && <path d={`M${X0},${Y1} L${X1},${boneY(6)} L${X1},${boneY(9)} Z`} fill="#F5B544" fillOpacity={0.22} stroke="#F5B544" strokeWidth={1.5} />}
            <line x1={mx} x2={mx} y1={12} y2={Y1} stroke="#E8ECF4" strokeWidth={1.5} strokeDasharray="3 3" />
            <circle cx={mx} cy={boneY(p.micro ? months * 1.25 : 0)} r={5} fill="#F5B544" stroke="#0E1422" strokeWidth={2} />
          </svg>
        </section>
        <section className="card sim flex flex-col gap-2.5" style={{ flex: '1 1 380px', minWidth: 0 }}>
          <h2 className="h2">Radiación contra el límite</h2>
          <svg width="100%" viewBox="0 0 400 200" role="img" aria-label="Radiación acumulada contra el límite de 600 mSv">
            <Axis labels={['600', '300', '0']} />
            <line x1={X0} x2={X1} y1={Y0} y2={Y0} stroke="#FF6B7A" strokeDasharray="6 4" />
            <text x={384} y={30} fill="#FF8A96" fontSize={10} textAnchor="end">límite 600 mSv</text>
            <path d={`M${X0},${Y1} L${X1},${radY(radEnd)} L${X1},${Y1} Z`} fill="#5CC8F5" fillOpacity={0.14} />
            <line x1={X0} y1={Y1} x2={X1} y2={radY(radEnd)} stroke="#5CC8F5" strokeWidth={2} />
            <line x1={mx} x2={mx} y1={12} y2={Y1} stroke="#E8ECF4" strokeWidth={1.5} strokeDasharray="3 3" />
            <circle cx={mx} cy={radY(radVal)} r={5} fill="#5CC8F5" stroke="#0E1422" strokeWidth={2} />
          </svg>
        </section>
      </div>

      <section className="card sim flex flex-col gap-3">
        <div className="flex flex-wrap justify-between items-baseline gap-2"><h2 className="h2">Perfil del entorno</h2><span className="text-xs text-[#93A0B8]">Valores aproximados, se confirman con fuentes antes del pitch</span></div>
        <pre className="code">{json}</pre>
      </section>
    </>
  )
}
