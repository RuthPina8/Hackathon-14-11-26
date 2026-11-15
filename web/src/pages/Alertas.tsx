import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Lock } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PageHeader } from '../components/ui/Page'

const capaColor = { real: '#F5B544', self: '#B7A4FF', sim: '#93A0B8' }

export default function Alertas() {
  const alerts = useAppStore((s) => s.alerts)
  const resolveAlert = useAppStore((s) => s.resolveAlert)
  const escalateAlert = useAppStore((s) => s.escalateAlert)
  const [params] = useSearchParams()
  const paramId = params.get('id')
  const [picked, setPicked] = useState<string | null>(null)
  const sel = picked ?? paramId ?? alerts.find((a) => a.estado === 'activa')?.id ?? alerts[0]?.id
  const setSel = setPicked
  const [escalated, setEscalated] = useState<Record<string, boolean>>({})

  const cur = alerts.find((a) => a.id === sel) ?? alerts[0]
  const open = alerts.filter((a) => a.estado === 'activa').length
  const done = cur.estado === 'resuelta'
  const crit = cur.nivel === 'crit'
  const lvl = (n: string) => (n === 'crit' ? { name: 'Roja', c: '#FF6B7A', bg: '#2A1218', sub: '#FFC2C8' } : { name: 'Amarilla', c: '#F5B544', bg: '#241D0D', sub: '#DCCB9F' })

  return (
    <>
      <PageHeader
        kicker={`${open} activas · ${alerts.length - open} resueltas`}
        title="Alertas y triage"
        right={
          <div role="img" aria-label="Escala de niveles" className="flex gap-1.5 p-1.5 rounded-xl bg-[#0A0F1B] border border-[#1C2740]">
            {[['#3DDC97', 'Todo bien'], ['#F5B544', 'Resolver a bordo'], ['#FF6B7A', 'Escalar a Tierra']].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#A3AEC4]"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}</span>
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap gap-5 items-start">
        <section aria-label="Lista de alertas" className="flex flex-col gap-2.5" style={{ flex: '1 1 300px', minWidth: 0 }}>
          <AnimatePresence initial={false}>
            {alerts.map((a) => {
              const on = a.id === cur.id
              const res = a.estado === 'resuelta'
              const L = lvl(a.nivel)
              return (
                <motion.button
                  layout
                  key={a.id}
                  type="button"
                  className="al"
                  aria-pressed={on}
                  onClick={() => setSel(a.id)}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: res && !on ? 0.7 : 1, x: 0 }}
                  style={{ borderColor: on ? (res ? '#2F3F60' : L.c) : '#1C2740', background: on ? (res ? '#121B2E' : L.bg) : '#0E1422' }}
                >
                  <span className="w-2.5 h-2.5 mt-1.5 rounded-full shrink-0" style={{ background: res ? '#3DDC97' : L.c }} />
                  <span className="flex-1 min-w-0 flex flex-col gap-1">
                    <strong className="text-[15px]">{a.titulo}</strong>
                    <span className="text-[13px]" style={{ color: on && !res ? L.sub : '#93A0B8' }}>{res ? `Resuelta ${a.cuando}` : `${L.name} · ${a.cuando}`}</span>
                  </span>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </section>

        <motion.section key={cur.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col gap-[22px]" style={{ flex: '3 1 560px', minWidth: 0, padding: 26 }} aria-labelledby="det">
          <div className="flex flex-wrap justify-between items-center gap-2.5">
            <h2 id="det" className="m-0 font-[family-name:var(--font-display)] text-2xl font-semibold">{cur.titulo}</h2>
            <span className="tag" style={{ background: done ? '#0E2A20' : crit ? '#2A1218' : '#241D0D', color: done ? '#8FF0C4' : crit ? '#FF6B7A' : '#F5B544', fontSize: 12, padding: '6px 10px' }}>
              {done ? 'RESUELTA' : crit ? 'ROJA · ESCALAR A TIERRA' : 'AMARILLA · RESOLVER A BORDO'}
            </span>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))' }}>
            {[['Qué cambió', cur.queCambio], ['Cuánto', cur.cuanto], ['Desde cuándo', cur.desde]].map(([k, v]) => (
              <div key={k} className="p-4 rounded-xl bg-[#0A0F1B] border border-[#1C2740]"><p className="k">{k}</p><p className="mt-1.5 mb-0 text-[15px] font-semibold leading-snug">{v}</p></div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="k">Qué la causó</p>
            {cur.factores.map((f, i) => (
              <div key={f.name} className="flex items-center gap-3.5 text-sm">
                <span className="w-[170px] shrink-0">{f.name}</span>
                <span className="flex-1 h-2 rounded bg-[#1C2740]">
                  <motion.span className="block h-full rounded" style={{ background: capaColor[f.capa] }} initial={{ width: 0 }} animate={{ width: `${f.w}%` }} transition={{ delay: 0.1 + i * 0.1 }} />
                </span>
                <span className="num w-10 text-right font-bold">{f.w}%</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            <p className="k">Qué hacer ahora</p>
            {cur.tareas.map((t) => (
              <label key={cur.id + t} className="task"><input type="checkbox" />{t}</label>
            ))}
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 pt-[18px] border-t border-[#1C2740]">
            <p className="m-0 inline-flex items-center gap-2 text-[13px] text-[#A3AEC4]">
              <Lock size={16} />{done ? 'Tu línea base vuelve a aprender' : 'Tu línea base está congelada mientras siga activa'}
            </p>
            {done ? (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#8FF0C4]"><Check size={18} strokeWidth={2.6} />Atendida</span>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {escalated[cur.id]
                  ? <Link className="btn sec" to="/earth">Ver en la cola a Tierra</Link>
                  : <button type="button" className="btn sec" onClick={() => { escalateAlert(cur.id); setEscalated((e) => ({ ...e, [cur.id]: true })) }}>Escalar a Tierra</button>}
                <button type="button" className="btn pri" onClick={() => resolveAlert(cur.id)}>Marcar como atendida</button>
              </div>
            )}
          </div>
        </motion.section>
      </div>
      <p className="m-0 text-xs text-[#93A0B8]">AstroHealth es una herramienta de apoyo, no sustituye el criterio del flight surgeon ni de un médico</p>
    </>
  )
}
