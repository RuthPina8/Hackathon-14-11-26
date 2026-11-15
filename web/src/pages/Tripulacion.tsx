import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Clock, Lock } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PageHeader, Segmented, SimBanner } from '../components/ui/Page'
import SemaphoreDot from '../components/ui/SemaphoreDot'
import { useSession } from '../store/useSession'

const estadoTxt = { ok: 'Todo bien', warn: 'Atención a bordo', crit: 'Escalar a Tierra', none: 'Sin chequeo hoy' }
const estadoBg = { ok: ['#0E2A20', '#8FF0C4'], warn: ['#241D0D', '#F5D79A'], crit: ['#2A1218', '#FFB8BF'], none: ['#15233B', '#C5CEDF'] }
const earthTxt = { ok: 'Verde', warn: 'Amarilla', crit: 'Roja', none: 'Sin datos hoy' }

export default function Tripulacion() {
  const crew = useAppStore((s) => s.crew)
  const demo = useAppStore((s) => s.demo)
  const me = useSession((s) => s.user?.id)
  const [vista, setVista] = useState<'cmd' | 'earth'>('cmd')
  const [pinged, setPinged] = useState<Record<string, boolean>>({})

  return (
    <>
      {demo && <SimBanner>Tripulación de ejemplo para mostrar la privacidad por rol</SimBanner>}
      <PageHeader
        kicker={vista === 'cmd' ? 'Vista del comandante a bordo' : 'Vista de los flight surgeons en Tierra'}
        title="Panel de tripulación"
        right={<Segmented label="Vista" value={vista} onChange={(v) => setVista(v as 'cmd' | 'earth')} options={[{ value: 'cmd', label: 'Vista comandante' }, { value: 'earth', label: 'Vista Tierra' }]} />}
      />

      {vista === 'cmd' ? (
        <motion.div key="cmd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-[22px]">
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
            {crew.map((c, i) => {
              const [bg, fg] = estadoBg[c.estado]
              return (
                <motion.section key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className={`flex flex-col gap-3.5 p-[22px] rounded-2xl bg-[#0E1422] border ${demo ? 'border-dashed' : 'border-solid'}`}
                  style={{ borderColor: c.estado === 'warn' ? '#5C4A1C' : demo ? '#3A4866' : '#1C2740' }} aria-label={c.nombre}>
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-[14px] grid place-items-center font-[family-name:var(--font-display)] font-bold" style={{ background: c.estado === 'warn' ? '#241D0D' : '#15233B', color: c.estado === 'warn' ? '#F5D79A' : '#E8ECF4' }}>{c.id}</span>
                    <div><h2 className="h2">{c.nombre}</h2><p className="mt-0.5 mb-0 text-xs text-[#93A0B8]">{c.id === me ? 'Tú' : c.rol === 'Tú' ? 'Especialista de misión' : c.rol}</p></div>
                  </div>
                  <span className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-semibold" style={{ background: bg, color: fg }}>
                    <SemaphoreDot estado={c.estado} size={12} />{estadoTxt[c.estado]}
                  </span>
                  <p className="m-0 text-[13px] text-[#A3AEC4]">Último chequeo {c.ultimo}</p>
                  {c.estado === 'none' && (pinged[c.id]
                    ? <span className="flex items-center justify-center gap-2 min-h-[40px] rounded-xl bg-[#0B2636] text-[13px] font-semibold text-[#8AD9F8]"><Check size={16} strokeWidth={2.4} />Recordatorio enviado</span>
                    : <button type="button" className="btn sec sm w-full" onClick={() => setPinged((p) => ({ ...p, [c.id]: true }))}>Recordarle su chequeo</button>)}
                </motion.section>
              )
            })}
          </div>
          <div className="card flex gap-3.5 items-start">
            <Lock size={22} color="#5CC8F5" className="shrink-0 mt-px" />
            <p className="m-0 text-sm text-[#C5CEDF] leading-relaxed">El comandante solo ve el semáforo de cada compañero, nunca su detalle clínico. Así se protege la privacidad médica sin perder la seguridad del equipo</p>
          </div>
        </motion.div>
      ) : (
        <motion.div key="earth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-[22px]">
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#0B2636] border border-[#1F5A78] text-sm text-[#C9EDFB]">
            <Clock size={20} className="shrink-0" />
            <span>Lo que ven los flight surgeons ya pasó hace <strong className="num">13 min</strong>, el retraso siempre está visible</span>
          </div>
          <section className={demo ? 'card sim' : 'card'} style={{ padding: 0, overflow: 'hidden' }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr>{['Astronauta', 'Estado', 'Ritmo en reposo', 'PERCLOS', 'Presión', 'Ánimo', 'Dato recibido'].map((h) => <th key={h} className="k text-left px-3.5 py-3.5 border-b border-[#1C2740]">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {crew.map((c) => {
                    const warn = c.estado === 'warn'
                    return (
                      <tr key={c.id} style={{ color: c.estado === 'none' ? '#A3AEC4' : undefined }}>
                        <td className="px-3.5 py-3.5 border-b border-[#1C2740] font-semibold">{c.id}</td>
                        <td className="px-3.5 py-3.5 border-b border-[#1C2740]"><span className="inline-flex items-center gap-2"><SemaphoreDot estado={c.estado} size={8} />{earthTxt[c.estado]}</span></td>
                        <td className="num px-3.5 py-3.5 border-b border-[#1C2740]" style={{ color: warn ? '#F5B544' : undefined }}>{c.ritmo}</td>
                        <td className="num px-3.5 py-3.5 border-b border-[#1C2740]" style={{ color: warn ? '#F5B544' : undefined }}>{c.perclos}</td>
                        <td className="num px-3.5 py-3.5 border-b border-[#1C2740]">{c.presion}</td>
                        <td className="num px-3.5 py-3.5 border-b border-[#1C2740]">{c.animo}</td>
                        <td className="num px-3.5 py-3.5 border-b border-[#1C2740] text-[#A3AEC4]">{c.estado === 'none' ? c.ultimo : 'hace 13 min'}</td>
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
