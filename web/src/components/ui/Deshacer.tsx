import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Undo2 } from 'lucide-react'

// Acción con "deshacer" de 5 segundos (auditoría UX: escalar a Tierra y marcar como atendida
// no deben ejecutarse con un solo toque sin vuelta atrás). La acción real corre al terminar el tiempo.
const SEGUNDOS = 5

interface Pendiente { texto: string; accion: () => void; hasta: number }

export function useDeshacer() {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const limpiar = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }

  const programar = useCallback((texto: string, accion: () => void) => {
    limpiar()
    const p = { texto, accion, hasta: Date.now() + SEGUNDOS * 1000 }
    setPendiente(p)
    timer.current = setTimeout(() => { p.accion(); setPendiente(null); timer.current = null }, SEGUNDOS * 1000)
  }, [])

  const deshacer = useCallback(() => { limpiar(); setPendiente(null) }, [])

  // Si se sale de la pantalla con una acción pendiente, se ejecuta (el astronauta ya la eligió)
  const pendienteRef = useRef<Pendiente | null>(null)
  useEffect(() => { pendienteRef.current = pendiente }, [pendiente])
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); pendienteRef.current?.accion() } }, [])

  return { pendiente, programar, deshacer }
}

export function BarraDeshacer({ pendiente, onDeshacer }: { pendiente: Pendiente | null; onDeshacer: () => void }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!pendiente) return
    const id = setInterval(() => setTick((t) => t + 1), 200)
    return () => clearInterval(id)
  }, [pendiente])
  const restan = pendiente ? Math.max(0, Math.ceil((pendiente.hasta - Date.now()) / 1000)) : 0
  return (
    <AnimatePresence>
      {pendiente && (
        <motion.div role="status" aria-live="polite" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
          className="fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-4 rounded-2xl border-2 border-line2 bg-raised px-5 py-3 shadow-[0_12px_40px_rgba(0,0,0,.55)]">
          <span className="num grid h-11 w-11 place-items-center rounded-full border-2 border-accent text-lg font-bold text-accent">{restan}</span>
          <span className="text-base font-semibold">{pendiente.texto}</span>
          <button type="button" className="btn pri" onClick={onDeshacer}><Undo2 size={20} />Undo</button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Botón que pide un segundo toque para confirmar (para "Reiniciar").
export function BotonConfirmar({ onConfirmar, children, confirmar = 'Sure? Tap again', className = 'btn sec', disabled, title }: {
  onConfirmar: () => void; children: ReactNode; confirmar?: string; className?: string; disabled?: boolean; title?: string
}) {
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    if (!armado) return
    const id = setTimeout(() => setArmado(false), 3000)
    return () => clearTimeout(id)
  }, [armado])
  return (
    <button type="button" className={className} disabled={disabled} title={title} aria-live="polite"
      style={armado ? { boxShadow: 'inset 0 0 0 2px var(--color-crit), inset 0 -5px 0 var(--color-void)', color: 'var(--color-crit-soft)' } : undefined}
      onClick={() => { if (armado) { setArmado(false); onConfirmar() } else setArmado(true) }}>
      {armado ? confirmar : children}
    </button>
  )
}
