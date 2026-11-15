import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { environmentProfiles, environments, type EnvironmentId } from '../store/mockData'
import { PageHeader, Segmented, SimBanner } from '../components/ui/Page'
import { useSimulation } from '../lib/useSimulation'
import { C } from '../lib/paleta'

// Con el back conectado los números salen de GET /simulation (Back 2).
// Sin él se calculan aquí con la misma fórmula, así la pantalla funciona sola.
const X0 = 36, X1 = 388, Y0 = 16, Y1 = 160
const xOf = (d: number) => X0 + (d / 180) * (X1 - X0)
const boneY = (pct: number) => Y1 - (pct / 10) * (Y1 - Y0)
const radY = (v: number) => Y1 - (Math.min(600, v) / 600) * (Y1 - Y0)
const lossPct = (bonePctMes: number, d: number) => 100 * (1 - Math.pow(1 - bonePctMes / 100, d / 30))
const DIAS_LOCAL = Array.from({ length: 13 }, (_, i) => i * 15)
const linea = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

function Axis({ labels }: { labels: [string, string, string] }) {
  return (
    <>
      <line x1={X0} x2={X1} y1={Y0} y2={Y0} stroke={C.line} />
      <line x1={X0} x2={X1} y1={88} y2={88} stroke={C.line} />
      <line x1={X0} x2={X1} y1={Y1} y2={Y1} stroke={C.line2} />
      {labels.map((l, i) => <text key={l} x={30} y={[20, 92, 164][i]} fill={C.faint} fontSize={10} textAnchor="end" fontFamily="JetBrains Mono, monospace">{l}</text>)}
      <text x={X0} y={184} fill={C.faint} fontSize={10}>día 0</text>
      <text x={X1} y={184} fill={C.faint} fontSize={10} textAnchor="end">día 180</text>
    </>
  )
}

export default function Simulacion() {
  const env = useAppStore((s) => s.environment)
  const setEnv = useAppStore((s) => s.setEnvironment)
  const demo = useAppStore((s) => s.demo)
  const conectado = useAppStore((s) => s.connection === 'connected' && s.server)
  const [day, setDay] = useState(120)
  const p = environmentProfiles[env]
  const { now, full } = useSimulation(env, day, conectado)

  const bonePct = now ? now.oseo.perdida_pct : lossPct(p.bone, day)
  const bone = `−${bonePct.toFixed(1)}%`
  const radVal = now ? now.radiacion.dosis_msv : p.rate * day
  const radPct = Math.min(100, Math.round(now ? now.radiacion.pct_limite : (radVal / 600) * 100))
  const boneSerie: [number, number][] = full
    ? full.oseo.serie.map((q) => [xOf(q.dia), boneY(100 - q.valor)])
    : DIAS_LOCAL.map((d) => [xOf(d), boneY(lossPct(p.bone, d))])
  const radSerie: [number, number][] = full
    ? full.radiacion.serie.map((q) => [xOf(q.dia), radY(q.valor)])
    : DIAS_LOCAL.map((d) => [xOf(d), radY(p.rate * d)])
  const riesgoTitulo = now ? `Riesgo ${now.riesgo.nivel}` : p.risk
  const riesgoTexto = now ? now.riesgo.motivos.join('. ') : p.protocol
  const radC = radPct > 70 ? C.crit : radPct > 40 ? C.warn : C.accent
  const mx = xOf(day)
  const base = `L${X1},${Y1} L${X0},${Y1} Z`
  const json = JSON.stringify({ environment_id: env, gravity_profile: p.g, radiation_mSv_day: p.rate, comm_delay: p.delay, protocolo_activo: p.protocol }, null, 2)

  return (
    <>
      <SimBanner>Lo que el sistema haría en una misión real, estos datos no se miden y nunca entran al motor de anomalías</SimBanner>
      <PageHeader
        kicker="Proyección a 180 días"
        title="Simulación de misión"
        right={<Segmented<EnvironmentId> label="Entorno" value={env} onChange={setEnv} options={environments.map((e) => ({ value: e, label: environmentProfiles[e].corto }))} />}
      />

      <section className="card sim flex flex-col gap-3" aria-labelledby="dia">
        <div className="flex flex-wrap justify-between items-baseline gap-2">
          <h2 id="dia" className="h2">Día de la misión</h2>
          <p className="m-0 text-sm text-muted"><strong className="num text-[28px] text-text">{day}</strong> de 180</p>
        </div>
        <label className="flex flex-col gap-1 text-sm text-faint">Mueve para proyectar
          <input type="range" min={0} max={180} value={day} onChange={(e) => setDay(Number(e.target.value))} />
        </label>
        <div className="num flex justify-between text-[13px] text-faint">{[0, 30, 60, 90, 120, 150, 180].map((d) => <span key={d}>{d}</span>)}</div>
      </section>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
        <section className="card sim flex flex-col gap-2"><h2 className="k">Densidad ósea</h2>
          <p className="big" style={{ fontSize: 28, color: bonePct > 5 ? C.warn : C.text }}>{bone}</p>
          <p className="m-0 text-sm text-muted leading-relaxed">{p.bone}% por mes en huesos que cargan peso, con {p.g}</p></section>
        <section className="card sim flex flex-col gap-2"><h2 className="k">Radiación acumulada</h2>
          <p className="big" style={{ fontSize: 28 }}>{Math.round(radVal)} <span className="text-sm font-medium text-muted font-sans">mSv</span></p>
          <span className="h-2 rounded bg-line"><motion.span className="block h-full rounded" animate={{ width: `${radPct}%`, background: radC }} /></span>
          <p className="m-0 text-sm text-muted"><span className="num">{radPct}%</span> del límite de carrera de 600 mSv</p></section>
        <section className="card sim flex flex-col gap-2"><h2 className="k">Retraso con Tierra</h2>
          <p className="big" style={{ fontSize: 28 }}>{p.delay}</p>
          <p className="m-0 text-sm text-muted leading-relaxed">{now ? now.retraso.texto : p.note}</p></section>
        <section className="card sim flex flex-col gap-2"><h2 className="k">Riesgo dominante</h2>
          <p className="m-0 font-[family-name:var(--font-display)] text-[19px] font-semibold leading-tight">{riesgoTitulo}</p>
          <p className="m-0 text-sm text-muted leading-relaxed">{riesgoTexto}</p></section>
      </div>

      <div className="flex flex-wrap gap-5">
        <section className="card sim flex flex-col gap-2.5" style={{ flex: '1 1 380px', minWidth: 0 }}>
          <h2 className="h2">Pérdida ósea proyectada</h2>
          <svg width="100%" viewBox="0 0 400 200" role="img" aria-label="Proyección de pérdida ósea a 180 días">
            <Axis labels={['−10%', '−5%', '0']} />
            <path d={`${linea(boneSerie)} ${base}`} fill={C.warn} fillOpacity={0.18} stroke="none" />
            <path d={linea(boneSerie)} fill="none" stroke={C.warn} strokeWidth={2} />
            <line x1={mx} x2={mx} y1={12} y2={Y1} stroke={C.text} strokeWidth={1.5} strokeDasharray="3 3" />
            <circle cx={mx} cy={boneY(bonePct)} r={5} fill={C.warn} stroke={C.panel} strokeWidth={2} />
          </svg>
        </section>
        <section className="card sim flex flex-col gap-2.5" style={{ flex: '1 1 380px', minWidth: 0 }}>
          <h2 className="h2">Radiación contra el límite</h2>
          <svg width="100%" viewBox="0 0 400 200" role="img" aria-label="Radiación acumulada contra el límite de 600 mSv">
            <Axis labels={['600', '300', '0']} />
            <line x1={X0} x2={X1} y1={Y0} y2={Y0} stroke={C.crit} strokeDasharray="6 4" />
            <text x={384} y={30} fill="#FF8A96" fontSize={10} textAnchor="end">límite 600 mSv</text>
            <path d={`${linea(radSerie)} ${base}`} fill={C.accent} fillOpacity={0.14} />
            <path d={linea(radSerie)} fill="none" stroke={C.accent} strokeWidth={2} />
            <line x1={mx} x2={mx} y1={12} y2={Y1} stroke={C.text} strokeWidth={1.5} strokeDasharray="3 3" />
            <circle cx={mx} cy={radY(radVal)} r={5} fill={C.accent} stroke={C.panel} strokeWidth={2} />
          </svg>
        </section>
      </div>

      {demo && <section className="card sim flex flex-col gap-3">
        <div className="flex flex-wrap justify-between items-baseline gap-2"><h2 className="h2">Perfil del entorno</h2><span className="text-sm text-faint">{now ? 'Calculado por la API de Back 2' : 'Valores aproximados, se confirman con fuentes antes del pitch'}</span></div>
        <pre className="code">{json}</pre>
      </section>}
    </>
  )
}
