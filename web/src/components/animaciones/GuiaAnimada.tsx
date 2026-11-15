import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { movimientoReducido } from '../../lib/efectos'

// Guía paso a paso con animaciones: poco texto, mucha imagen.
// Avanza sola (se puede pausar) y cada paso se puede tocar con botones grandes de 60 px.

export interface PasoGuia {
  titulo: string // 2 a 5 palabras
  detalle?: string // una línea, opcional
  escena: ReactNode // SVG animado
  ms?: number // cuánto dura el paso (por defecto 5 s)
}

// Escena 3D que se queda montada en todos los pasos (la cámara viaja de un paso a otro).
// `fallback` es la animación 2D del paso, por si el equipo no tiene WebGL.
export type Escena3D = (o: { paso: number; ms: number; play: boolean; fallback: ReactNode }) => ReactNode

export default function GuiaAnimada({ titulo, pasos, alTerminar, escena3D }: { titulo: string; pasos: PasoGuia[]; alTerminar?: ReactNode; escena3D?: Escena3D }) {
  const [i, setI] = useState(0)
  const [play, setPlay] = useState(!movimientoReducido())
  const [inicio, setInicio] = useState(() => performance.now())
  const [, setTick] = useState(0)
  const dur = pasos[i].ms ?? 5000

  useEffect(() => { setInicio(performance.now()) }, [i])
  useEffect(() => {
    if (!play) return
    const id = setInterval(() => {
      setTick((t) => t + 1)
      if (performance.now() - inicio >= dur) setI((x) => (x + 1) % pasos.length)
    }, 100)
    return () => clearInterval(id)
  }, [play, inicio, dur, pasos.length])

  const progreso = play ? Math.min(1, (performance.now() - inicio) / dur) : 1
  const ir = (n: number) => setI((n + pasos.length) % pasos.length)

  return (
    <section className="flex flex-col gap-4 rounded-2xl border-2 border-line bg-panel p-5" aria-label={titulo}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 font-display text-[20px] font-semibold">{titulo}</h2>
        <span className="num text-[15px] text-faint">Paso {i + 1} de {pasos.length}</span>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-holo-line bg-holo-bg" style={{ aspectRatio: '16 / 10' }}>
        {escena3D ? (
          <div className="absolute inset-0">{escena3D({ paso: i, ms: dur, play, fallback: pasos[i].escena })}</div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={i} className="absolute inset-0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
              {pasos[i].escena}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <div aria-live="polite" className="flex items-start gap-3">
        <span className="num grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-xl font-bold text-on-accent">{i + 1}</span>
        <div>
        <p className="m-0 font-display text-[24px] font-bold leading-tight">{pasos[i].titulo}</p>
        {pasos[i].detalle && <p className="m-0 mt-1 text-[16px] text-muted">{pasos[i].detalle}</p>}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded bg-track"><div className="h-full rounded bg-accent" style={{ width: `${progreso * 100}%` }} /></div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn sec" style={{ width: 60, padding: 0 }} aria-label="Previous step" onClick={() => ir(i - 1)}><ChevronLeft size={24} /></button>
        <div role="tablist" aria-label="Steps" className="flex flex-1 flex-wrap gap-2">
          {pasos.map((p, n) => (
            <button key={p.titulo} type="button" role="tab" aria-selected={n === i} aria-label={`Step ${n + 1}: ${p.titulo}`} onClick={() => ir(n)}
              className="num h-[60px] min-w-[60px] flex-1 rounded-xl border-2 text-lg font-bold active:translate-y-[2px]"
              style={{ borderColor: n === i ? 'var(--color-accent)' : 'var(--color-line2)', background: n === i ? 'var(--color-accent-bg)' : 'transparent', color: n < i ? 'var(--color-ok)' : 'var(--color-text)' }}>
              {n + 1}
            </button>
          ))}
        </div>
        <button type="button" className="btn sec" style={{ width: 60, padding: 0 }} aria-label="Next step" onClick={() => ir(i + 1)}><ChevronRight size={24} /></button>
        <button type="button" className="btn sec" style={{ width: 60, padding: 0 }} aria-label={play ? 'Pausar' : 'Play'} onClick={() => { setPlay((x) => !x); setInicio(performance.now()) }}>
          {play ? <Pause size={22} /> : <Play size={22} />}
        </button>
      </div>
      {alTerminar}
    </section>
  )
}
