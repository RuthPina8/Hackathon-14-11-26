import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PageHeader, SimBanner } from '../components/ui/Page'
import { useSession } from '../store/useSession'

const filas = [
  { ind: 'Ritmo cardiaco', capa: 'real', n: '34', w: 0.83 },
  { ind: 'PERCLOS', capa: 'real', n: '34', w: 0.83 },
  { ind: 'Tiempo de reacción', capa: 'real', n: '6 (3 práctica)', w: 0.3 },
  { ind: 'Presión arterial', capa: 'self', n: '8', w: 0.53 },
  { ind: 'Ánimo', capa: 'self', n: '9', w: 0.56 },
] as const

const fases = [
  { estado: 'done', t: 'Línea base en Tierra', d: '2 a 4 semanas antes del lanzamiento, aprende tu normal con gravedad' },
  { estado: 'done', t: 'Adaptación', d: 'Primeros 7 a 14 días, solo alerta por rangos clínicos porque el cuerpo cambia solo' },
  { estado: 'now', t: 'Línea base personal', d: 'Tu normal en este entorno, contra el que se detectan las anomalías' },
] as const

export default function Perfil() {
  const status = useAppStore((s) => s.status)
  const statusReal = useAppStore((s) => s.statusReal)
  const user = useSession((s) => s.user)
  const watch = useAppStore((s) => s.watch)
  const connectWatch = useAppStore((s) => s.connectWatch)
  const disconnectWatch = useAppStore((s) => s.disconnectWatch)
  const [n, setN] = useState(9)
  const pers = Math.round((n / (n + 7)) * 100)
  const cols = { gridTemplateColumns: '1.3fr 1fr .9fr .7fr 1.6fr' }

  return (
    <>
      {statusReal
        ? <SimBanner tag="EN PARTE DE EJEMPLO">La calibración general sale de tus mediciones guardadas; la tabla por señal todavía es de ejemplo</SimBanner>
        : <SimBanner tag="DATOS DE EJEMPLO">Tu estado, tu línea base y las gráficas son de ejemplo hasta que el motor de datos los calcule con tus mediciones</SimBanner>}
      <PageHeader
        kicker={`${user?.nombre ?? ''} · ${user?.cargo ?? ''}`}
        title="Perfil y calibración"
        right={<div className="flex items-baseline gap-2.5"><p className="big" style={{ fontSize: 40, color: '#5CC8F5' }}>{status.calibracion}%</p><span className="text-[13px] text-[#A3AEC4]">calibración general</span></div>}
      />

      <section className="card flex flex-col gap-[18px]" aria-labelledby="fases">
        <h2 id="fases" className="h2">Fases de tu línea base</h2>
        <ol className="m-0 p-0 list-none grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
          {fases.map((f, i) => (
            <li key={f.t} className="flex flex-col gap-2.5">
              <span className="flex items-center gap-2.5">
                {f.estado === 'done'
                  ? <span className="w-7 h-7 rounded-full bg-[#3DDC97] text-[#04121C] grid place-items-center shrink-0"><Check size={15} strokeWidth={3} /></span>
                  : <span className="w-7 h-7 rounded-full bg-[#0B2636] border-2 border-[#5CC8F5] grid place-items-center shrink-0"><span className="w-2 h-2 rounded-full bg-[#5CC8F5]" /></span>}
                <span className="flex-1 h-[3px] rounded bg-[#1C2740]">
                  <motion.span className="block h-full rounded" style={{ background: f.estado === 'done' ? '#3DDC97' : '#5CC8F5' }}
                    initial={{ width: 0 }} animate={{ width: f.estado === 'done' ? '100%' : `${(status.diaBase / status.diasBase) * 100}%` }} transition={{ delay: i * 0.2 }} />
                </span>
              </span>
              <span className="k" style={{ color: f.estado === 'done' ? '#8FF0C4' : '#8AD9F8' }}>{f.estado === 'done' ? 'Completa' : `En curso · día ${status.diaBase} de ${status.diasBase}`}</span>
              <strong className="text-[15px]">{f.t}</strong>
              <span className="text-[13px] text-[#A3AEC4] leading-relaxed">{f.d}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap gap-5">
        <section className="card" style={{ flex: '3 1 540px', minWidth: 0, padding: 0, overflow: 'hidden' }} aria-labelledby="ind">
          <h2 id="ind" className="h2" style={{ padding: '20px 18px 12px' }}>Calibración por indicador</h2>
          <div className="overflow-x-auto"><div className="min-w-[560px]">
            <div className="trow" style={{ ...cols, minHeight: 38 }}><span className="k">Indicador</span><span className="k">Capa</span><span className="k">Datos</span><span className="k">Peso</span><span className="k">Progreso</span></div>
            {filas.map((r, i) => (
              <div key={r.ind} className="trow" style={cols}>
                <span>{r.ind}</span>
                <span><span className={`tag ${r.capa}`}>{r.capa === 'real' ? 'Real' : 'Auto'}</span></span>
                <span className="num">{r.n}</span>
                <span className="num">{r.w.toFixed(2)}</span>
                <span className="h-2 rounded bg-[#1C2740]"><motion.span className="block h-full rounded" style={{ background: r.capa === 'real' ? '#5CC8F5' : '#B7A4FF' }} initial={{ width: 0 }} animate={{ width: `${r.w * 100}%` }} transition={{ delay: 0.1 + i * 0.08 }} /></span>
              </div>
            ))}
          </div></div>
        </section>

        <div className="flex flex-col gap-4" style={{ flex: '2 1 320px', minWidth: 0 }}>
          <section className="card flex flex-col gap-3.5" aria-labelledby="formula">
            <h2 id="formula" className="h2">Cómo se calcula</h2>
            <p className="num m-0 p-3.5 rounded-xl bg-[#080C16] border border-[#1C2740] text-[17px] font-bold text-center">peso = n / (n + 7)</p>
            <label className="flex flex-col gap-1.5 text-[13px] text-[#A3AEC4]">
              <span>Prueba con <strong className="num text-[#E8ECF4]">{n}</strong> datos</span>
              <input type="range" min={0} max={60} value={n} onChange={(e) => setN(Number(e.target.value))} />
            </label>
            <div role="img" aria-label={`Con ${n} datos, ${pers}% tu normal y ${100 - pers}% rango clínico`} className="flex h-[30px] rounded-lg overflow-hidden text-[11px] font-bold">
              <motion.span animate={{ width: `${100 - pers}%` }} className="bg-[#22314F] text-[#C5CEDF] flex items-center pl-2 whitespace-nowrap overflow-hidden">Clínico {100 - pers}%</motion.span>
              <motion.span animate={{ width: `${pers}%` }} className="bg-[#5CC8F5] text-[#04121C] flex items-center justify-end pr-2 whitespace-nowrap overflow-hidden">Tú {pers}%</motion.span>
            </div>
            <p className="m-0 text-[13px] text-[#A3AEC4] leading-relaxed">Con pocos datos manda el rango clínico, con muchos manda tu propio normal</p>
          </section>

          <section className="card flex flex-col gap-1" aria-labelledby="fuentes">
            <h2 id="fuentes" className="h2 mb-2">Fuentes conectadas</h2>
            {['Cámara web', 'Registro manual'].map((x) => (
              <div key={x} className="flex justify-between items-center min-h-[44px] text-sm">
                <span>{x}</span><span className="inline-flex items-center gap-2 text-[#8FF0C4]"><span className="w-2 h-2 rounded-full bg-[#3DDC97]" />{x === 'Cámara web' ? 'Conectada' : 'Activo'}</span>
              </div>
            ))}
            <div className="flex justify-between items-center min-h-[44px] text-sm">
              <span>Apple Watch <span className="text-[#93A0B8]">(extra)</span></span>
              {watch === 'idle' && <button type="button" className="btn sec sm" onClick={connectWatch}>Conectar</button>}
              {watch === 'busy' && <span className="text-[13px] text-[#8AD9F8]">Buscando reloj…</span>}
              {watch === 'on' && (
                <span className="inline-flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-2 text-[#8FF0C4]"><span className="w-2 h-2 rounded-full bg-[#3DDC97]" />Conectado</span>
                  <button type="button" onClick={disconnectWatch} className="min-h-[36px] px-2.5 border-0 bg-transparent text-[#A3AEC4] text-xs font-semibold underline cursor-pointer">Quitar</button>
                </span>
              )}
            </div>
            {watch === 'on' && <p className="mt-1.5 mb-0 text-xs text-[#A3AEC4] leading-relaxed">Ahora el ritmo cardiaco se toma también del reloj, con confianza 0.95, y la cámara queda como respaldo</p>}
          </section>
        </div>
      </div>
    </>
  )
}
