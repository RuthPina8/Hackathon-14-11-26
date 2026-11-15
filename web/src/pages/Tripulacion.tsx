import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Clock, Lock } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PageHeader, Segmented, SimBanner } from '../components/ui/Page'
import SemaphoreDot from '../components/ui/SemaphoreDot'
import { useSession } from '../store/useSession'
import { C } from '../lib/paleta'

const estadoTxt = { ok: 'All good', warn: 'Attention on board', crit: 'Escalate to Earth', none: 'No check-up today' }
const estadoBg = { ok: [C.okBg, C.okSoft], warn: [C.warnBg, C.warnSoft], crit: [C.critBg, C.critSoft], none: [C.sel, C.subtle] }
const earthTxt = { ok: 'Green', warn: 'Yellow', crit: 'Red', none: 'No data today' }

export default function Tripulacion() {
  const crew = useAppStore((s) => s.crew)
  const demo = useAppStore((s) => s.demo)
  const statusReal = useAppStore((s) => s.statusReal)
  const link = useAppStore((s) => s.link)
  const env = useAppStore((s) => s.environment)
  const me = useSession((s) => s.user?.id)
  const conDemo = crew.some((c) => c.demo)
  // Retraso real del entorno activo (Back 2); sin back, el del perfil de ejemplo
  const retrasoMin = link ? Math.max(0, Math.round(link.retraso_s / 60)) : env === 'nave' || env === 'marte' ? 13 : 0
  const retrasoTxt = link && link.retraso_s < 60 ? `${link.retraso_s.toFixed(1)} s` : `${retrasoMin} min`
  const [vista, setVista] = useState<'cmd' | 'earth'>('cmd')
  const [pinged, setPinged] = useState<Record<string, boolean>>({})

  return (
    <>
      {!statusReal && <SimBanner tag="SAMPLE DATA">No engine connection: sample crew to show role-based privacy</SimBanner>}
      {statusReal && conDemo && <SimBanner tag="DEMO DATA">Part of the crew data comes from the mission simulator</SimBanner>}
      <PageHeader
        kicker={vista === 'cmd' ? 'On-board commander view' : 'Flight surgeons view on Earth'}
        title="Crew panel"
        right={<Segmented label="View" value={vista} onChange={setVista} options={[{ value: 'cmd', label: 'Commander view' }, { value: 'earth', label: 'Earth view' }]} />}
      />

      {vista === 'cmd' ? (
        <motion.div key="cmd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-[22px]">
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
            {crew.map((c, i) => {
              const [bg, fg] = estadoBg[c.estado]
              return (
                <motion.section key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className={`flex flex-col gap-3.5 p-[22px] rounded-2xl bg-panel border ${c.demo || (!statusReal && demo) ? 'border-dashed' : 'border-solid'}`}
                  style={{ borderColor: c.estado === 'crit' ? C.critLine : c.estado === 'warn' ? C.warnLine : c.demo ? C.line3 : C.line }} aria-label={c.nombre}>
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-[14px] grid place-items-center font-[family-name:var(--font-display)] font-bold" style={{ background: c.estado === 'warn' ? C.warnBg : C.sel, color: c.estado === 'warn' ? C.warnSoft : C.text }}>{c.id}</span>
                    <div><h2 className="h2">{c.nombre}</h2><p className="mt-0.5 mb-0 text-sm text-faint">{c.id === me ? 'You' : c.rol === 'You' ? 'Mission specialist' : c.rol}</p></div>
                  </div>
                  <span className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-semibold" style={{ background: bg, color: fg }}>
                    <SemaphoreDot estado={c.estado} size={12} />{estadoTxt[c.estado]}
                  </span>
                  <p className="m-0 text-[13px] text-muted">Latest data {c.ultimo}{c.alertas ? ` · ${c.alertas} open alert${c.alertas > 1 ? 's' : ''}` : ''}</p>
                  {c.estado === 'none' && (pinged[c.id]
                    ? <span className="flex items-center justify-center gap-2 min-h-[40px] rounded-xl bg-accent-bg text-[13px] font-semibold text-accent-soft"><Check size={16} strokeWidth={2.4} />Marked: you reminded them</span>
                    : <button type="button" className="btn sec sm w-full" onClick={() => setPinged((p) => ({ ...p, [c.id]: true }))}>Mark that I reminded them</button>)}
                </motion.section>
              )
            })}
          </div>
          <div className="card flex gap-3.5 items-start">
            <Lock size={22} color={C.accent} className="shrink-0 mt-px" />
            <p className="m-0 text-sm text-subtle leading-relaxed">The commander only sees each crewmate’s traffic light, never their clinical details. This protects medical privacy without compromising crew safety</p>
          </div>
        </motion.div>
      ) : (
        <motion.div key="earth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-[22px]">
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-accent-bg border border-accent-line text-sm text-[#C9EDFB]">
            <Clock size={20} className="shrink-0" />
            <span>{retrasoMin > 0 || (link && link.retraso_s >= 1) ? <>What the flight surgeons see already happened <strong className="num">{retrasoTxt}</strong> ago (one-way delay of the active environment), always visible</> : <>In this environment Earth sees the data almost in real time</>}</span>
          </div>
          <section className={conDemo || !statusReal ? 'card sim' : 'card'} style={{ padding: 0, overflow: 'hidden' }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr>{['Astronaut', 'Status', 'Resting heart rate', 'Blood pressure', 'Mood', 'Data received'].map((h) => <th key={h} className="k text-left px-3.5 py-3.5 border-b border-line">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {crew.map((c) => {
                    const warn = c.estado === 'warn' || c.estado === 'crit'
                    return (
                      <tr key={c.id} style={{ color: c.estado === 'none' ? C.muted : undefined }}>
                        <td className="px-3.5 py-3.5 border-b border-line font-semibold">{c.id}</td>
                        <td className="px-3.5 py-3.5 border-b border-line"><span className="inline-flex items-center gap-2"><SemaphoreDot estado={c.estado} size={8} />{earthTxt[c.estado]}</span></td>
                        <td className="num px-3.5 py-3.5 border-b border-line" style={{ color: warn ? C.warn : undefined }}>{c.ritmo}</td>
                        <td className="num px-3.5 py-3.5 border-b border-line">{c.presion}</td>
                        <td className="num px-3.5 py-3.5 border-b border-line">{c.animo}</td>
                        <td className="num px-3.5 py-3.5 border-b border-line text-muted">{c.estado === 'none' ? c.ultimo : `${c.ultimo} + ${retrasoTxt} in transit`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </motion.div>
      )}
    </>
  )
}
