import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Siren, X } from 'lucide-react'
import { useAppStore, type DemoSpeed } from '../../store/useAppStore'

// Barra flotante del modo demo. Solo aparece con el modo demo encendido.
export default function DemoBar() {
  const demo = useAppStore((s) => s.demo)
  const speed = useAppStore((s) => s.demoSpeed)
  const t = useAppStore((s) => s.queueT)
  const setSpeed = useAppStore((s) => s.setDemoSpeed)
  const red = useAppStore((s) => s.simulateRedAlert)
  const reset = useAppStore((s) => s.resetDemo)
  const setDemo = useAppStore((s) => s.setDemo)
  const navigate = useNavigate()

  return (
    <AnimatePresence>
      {demo && (
        <motion.div
          role="region"
          aria-label="Controles del modo demo"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-3 pl-4 pr-2 py-2 rounded-2xl border border-[#5C4A1C] bg-[#0E1422]/95 backdrop-blur"
          style={{ boxShadow: '0 12px 40px rgba(0,0,0,.5)' }}
        >
          <span className="tag" style={{ background: '#241D0D', color: '#F5B544' }}>MODO DEMO</span>
          <span className="num text-xs text-[#A3AEC4] min-w-[96px]">Misión T+{Math.floor(t)} min</span>

          <div role="group" aria-label="Velocidad del tiempo" className="segs" style={{ padding: 3 }}>
            {([1, 10, 60] as DemoSpeed[]).map((v) => (
              <button key={v} type="button" className="seg" aria-pressed={speed === v} onClick={() => setSpeed(v)} style={{ minHeight: 34, padding: '0 12px' }}>
                {v}x
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn sm"
            style={{ background: '#2A1218', color: '#FFB8BF', boxShadow: 'inset 0 0 0 1px #5A2A33' }}
            onClick={() => { red(); navigate('/alerts?id=demo-red-' + (useAppStore.getState().redCount)) }}
          >
            <Siren size={16} />Simular alerta roja
          </button>
          <button type="button" className="btn sec sm" onClick={reset}><RotateCcw size={15} />Reiniciar</button>
          <button type="button" aria-label="Salir del modo demo" onClick={() => setDemo(false)} className="w-9 h-9 grid place-items-center rounded-lg border-0 bg-transparent text-[#A3AEC4] hover:bg-[#111A2C] cursor-pointer">
            <X size={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
