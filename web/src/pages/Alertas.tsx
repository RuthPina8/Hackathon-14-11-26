import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Lock } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useMyAlerts } from '../store/selectors'
import { PageHeader, SimBanner } from '../components/ui/Page'
import EstadoIcono from '../components/ui/EstadoIcono'
import { BarraDeshacer, useDeshacer } from '../components/ui/Deshacer'
import { C } from '../lib/paleta'

// Barras de factores: el color dice el ORIGEN del dato (real en cian, autorreporte en morado, simulado en gris).
// El ámbar queda solo para "atención".
const capaColor = { real: C.accent, self: C.self, sim: C.faint }

export default function Alertas() {
  const alerts = useMyAlerts()
  const resolveAlert = useAppStore((s) => s.resolveAlert)
  const server = useAppStore((s) => s.server)
  const escalateAlert = useAppStore((s) => s.escalateAlert)
  const [params] = useSearchParams()
  const paramId = params.get('id')
  const [picked, setPicked] = useState<string | null>(null)
  const sel = picked ?? paramId ?? alerts.find((a) => a.estado === 'activa')?.id ?? alerts[0]?.id
  const setSel = setPicked
  const [escalated, setEscalated] = useState<Record<string, boolean>>({})
  const { pendiente, programar, deshacer } = useDeshacer()

  const cur = alerts.find((a) => a.id === sel) ?? alerts[0]
  if (!cur) {
    return (
      <>
        <PageHeader kicker="0 activas" title="Alertas y triage" />
        <section className="card flex flex-col gap-2" style={{ padding: 26 }}>
          <h2 className="h2">Todo en orden</h2>
          <p className="m-0 text-sm text-muted">No hay alertas por ahora. Cuando una señal se salga de tu normal, aparece aquí con qué hacer.</p>
        </section>
      </>
    )
  }
  const open = alerts.filter((a) => a.estado === 'activa').length
  const done = cur.estado === 'resuelta'
  const crit = cur.nivel === 'crit'
  const lvl = (n: string) => (n === 'crit' ? { name: 'Roja', c: C.crit, bg: C.critBg, sub: C.critSoft } : { name: 'Amarilla', c: C.warn, bg: C.warnBg, sub: C.warnSoft })

  return (
    <>
      {!server && <SimBanner tag="DATOS DE EJEMPLO">Estas alertas son de ejemplo, las reales llegan cuando el sistema de triage está conectado</SimBanner>}
      <PageHeader
        kicker={`${open} activas · ${alerts.length - open} resueltas`}
        title="Alertas y triage"
        right={
          <div role="img" aria-label="Escala de niveles" className="flex gap-1.5 p-1.5 rounded-xl bg-deep border border-line">
            {([['ok', 'Todo bien'], ['warn', 'Resolver a bordo'], ['crit', 'Escalar a Tierra']] as const).map(([e, l]) => (
              <span key={l} className="inline-flex items-center gap-2 px-2.5 py-1.5 text-sm text-muted"><EstadoIcono estado={e} size={16} />{l}</span>
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
                  style={{ borderColor: on ? (res ? C.line2 : L.c) : C.line, background: on ? (res ? C.raised : L.bg) : C.panel }}
                >
                  <span className="mt-0.5"><EstadoIcono estado={res ? 'ok' : a.nivel === 'crit' ? 'crit' : 'warn'} size={20} /></span>
                  <span className="flex-1 min-w-0 flex flex-col gap-1">
                    <strong className="text-[15px]">{a.titulo}</strong>
                    <span className="text-[13px]" style={{ color: on && !res ? L.sub : C.faint }}>{res ? `Resuelta ${a.cuando}` : `${L.name} · ${a.cuando}`}</span>
                  </span>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </section>

        <motion.section key={cur.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col gap-[22px]" style={{ flex: '3 1 560px', minWidth: 0, padding: 26 }} aria-labelledby="det">
          <div className="flex flex-wrap justify-between items-center gap-2.5">
            <h2 id="det" className="m-0 font-[family-name:var(--font-display)] text-2xl font-semibold">{cur.titulo}</h2>
            <span className="tag" style={{ background: done ? C.okBg : crit ? C.critBg : C.warnBg, color: done ? C.okSoft : crit ? C.crit : C.warn, fontSize: 14, padding: '6px 10px' }}>
              {done ? 'RESUELTA' : crit ? 'ROJA · ESCALAR A TIERRA' : 'AMARILLA · RESOLVER A BORDO'}
            </span>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))' }}>
            {[['Qué cambió', cur.queCambio], ['Cuánto', cur.cuanto], ['Desde cuándo', cur.desde]].map(([k, v]) => (
              <div key={k} className="p-4 rounded-xl bg-deep border border-line"><p className="k">{k}</p><p className="mt-1.5 mb-0 text-[15px] font-semibold leading-snug">{v}</p></div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="k">Qué la causó</p>
            {cur.factores.map((f, i) => (
              <div key={f.name} className="flex items-center gap-3.5 text-sm">
                <span className="w-[170px] shrink-0">{f.name}</span>
                <span className="flex-1 h-2 rounded bg-line">
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

          <div className="flex flex-wrap justify-between items-center gap-3 pt-[18px] border-t border-line">
            <p className="m-0 inline-flex items-center gap-2 text-[13px] text-muted">
              <Lock size={16} />{done ? 'Tu línea base vuelve a aprender' : 'Tu línea base está congelada mientras siga activa'}
            </p>
            {done ? (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-ok-soft"><Check size={18} strokeWidth={2.6} />Atendida</span>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {escalated[cur.id] || cur.escalada
                  ? <span className="btn sec" aria-disabled="true">Enviada a Tierra</span>
                  : <button type="button" className="btn sec" disabled={!!pendiente}
                      onClick={() => { const id = cur.id; programar('Escalando a Tierra…', () => { escalateAlert(id); setEscalated((e) => ({ ...e, [id]: true })) }) }}>Escalar a Tierra</button>}
                <button type="button" className="btn pri" disabled={!!pendiente}
                  onClick={() => { const id = cur.id; programar('Marcando como atendida…', () => resolveAlert(id)) }}>Marcar como atendida</button>
              </div>
            )}
          </div>
        </motion.section>
      </div>
      <BarraDeshacer pendiente={pendiente} onDeshacer={deshacer} />
      <p className="m-0 text-sm text-faint">AstroHealth es una herramienta de apoyo, no sustituye el criterio del flight surgeon ni de un médico</p>
    </>
  )
}
