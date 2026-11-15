import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Pause, Play, RotateCcw, Siren, SkipForward, X } from 'lucide-react'
import { useAppStore, type DemoSpeed } from '../../store/useAppStore'
import { C } from '../../lib/paleta'
import { BotonConfirmar } from '../ui/Deshacer'

// Barra flotante del modo demo. Solo aparece con el modo demo encendido.
export default function DemoBar() {
  const demo = useAppStore((s) => s.demo)
  const speed = useAppStore((s) => s.demoSpeed)
  const t = useAppStore((s) => s.queueT)
  const setSpeed = useAppStore((s) => s.setDemoSpeed)
  const red = useAppStore((s) => s.simulateRedAlert)
  const reset = useAppStore((s) => s.resetDemo)
  const setDemo = useAppStore((s) => s.setDemo)
  const server = useAppStore((s) => s.server)
  const sd = useAppStore((s) => s.serverDemo)
  const demoStart = useAppStore((s) => s.demoStart)
  const demoStop = useAppStore((s) => s.demoStop)
  const demoAdvance = useAppStore((s) => s.demoAdvance)
  const navigate = useNavigate()

  return (
    <AnimatePresence>
      {demo && (
        <motion.div
          role="region"
          aria-label="Demo mode controls"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-3 pl-4 pr-2 py-2 rounded-2xl border-2 border-demo-line bg-panel/95 backdrop-blur"
          style={{ boxShadow: '0 12px 40px rgba(0,0,0,.5)' }}
        >
          <span className="tag" style={{ background: C.demoBg, color: C.demo }}>DEMO MODE</span>
          {server ? (
            <>
              <span className="num text-sm text-muted min-w-[96px]">Mission day {sd?.dia ?? 0}</span>
              <button type="button" className="btn sec sm" onClick={sd?.corriendo ? demoStop : demoStart}>
                {sd?.corriendo ? <><Pause size={15} />Pausar</> : <><Play size={15} />Run</>}
              </button>
              <button type="button" className="btn sec sm" onClick={() => demoAdvance(1)}><SkipForward size={15} />+1 day</button>
            </>
          ) : (
            <>
              <span className="num text-sm text-muted min-w-[96px]">Mission T+{Math.floor(t)} min</span>
              <div role="group" aria-label="Time speed" className="segs" style={{ padding: 3 }}>
                {([1, 10, 60] as DemoSpeed[]).map((v) => (
                  <button key={v} type="button" className="seg" aria-pressed={speed === v} onClick={() => setSpeed(v)} style={{ minHeight: 60, padding: '0 18px' }}>
                    {v}x
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            className="btn sm"
            style={{ background: C.critBg, color: C.critSoft, boxShadow: 'inset 0 0 0 1px #5A2A33' }}
            onClick={() => { red(); navigate('/alerts?id=demo-red-' + (useAppStore.getState().redCount)) }}
          >
            <Siren size={16} />Simular alerta roja
          </button>
          <BotonConfirmar className="btn sec sm" onConfirmar={reset} confirmar="Restart the demo? Tap again"><RotateCcw size={15} />Restart</BotonConfirmar>
          <button type="button" aria-label="Exit demo mode" onClick={() => setDemo(false)} className="w-[60px] h-[60px] grid place-items-center rounded-xl border-2 border-line2 bg-raised text-subtle hover:bg-hover cursor-pointer">
            <X size={24} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
