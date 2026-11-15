import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, GraduationCap, Trophy, X } from 'lucide-react'
import { movimientoReducido } from '../../lib/efectos'
import { useEntrenamiento } from './entrenamientoStore'
import { moduloPorId } from './modulos'

// Coach del entrenamiento: acompaña al astronauta SOBRE las pantallas reales.
// Un foco oscurece todo menos el elemento que hay que tocar (hecho a mano con Framer Motion,
// sin librerías nuevas) y un panel fijo explica la pista actual.

type Rect = { x: number; y: number; w: number; h: number }

function useRectDe(selector: string | null) {
  const [rect, setRect] = useState<Rect | null>(null)
  useEffect(() => {
    if (!selector) { setRect(null); return }
    let ultimo = ''
    let desplazado = false
    const medir = () => {
      const el = document.querySelector(selector)
      if (!el) { if (ultimo) { ultimo = ''; setRect(null) } return }
      if (!desplazado) { el.scrollIntoView({ block: 'center', behavior: movimientoReducido() ? 'auto' : 'smooth' }); desplazado = true }
      const r = el.getBoundingClientRect()
      const k = `${Math.round(r.x)}|${Math.round(r.y)}|${Math.round(r.width)}|${Math.round(r.height)}`
      if (k !== ultimo) { ultimo = k; setRect({ x: r.x, y: r.y, w: r.width, h: r.height }) }
    }
    medir()
    const id = setInterval(medir, 250)
    return () => clearInterval(id)
  }, [selector])
  return rect
}

export default function Coach() {
  const { activo, fase, pista, siguientePista, salir } = useEntrenamiento()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const mod = activo ? moduloPorId(activo) : null
  const enAccion = !!mod && fase === 'accion'
  const enResultadoFuera = !!mod && fase === 'resultado' && pathname !== '/training'
  const pistaActual = enAccion ? mod!.pistas[Math.min(pista, mod!.pistas.length - 1)] : null
  // ¿Está en la pantalla del módulo? (en el chequeo también cuenta el paso: /camera?paso=N)
  const [rutaMod, qMod = ''] = mod ? mod.ruta.split('?') : ['', '']
  const pasoMod = new URLSearchParams(qMod).get('paso') ?? '0'
  const pasoAhora = new URLSearchParams(search).get('paso') ?? '0'
  const enSuPantalla = !!mod && pathname === rutaMod && (rutaMod !== '/camera' || pasoMod === pasoAhora)
  const rect = useRectDe(enAccion && enSuPantalla ? pistaActual!.selector : null)
  const pad = 10

  return (
    <>
      {/* Foco: oscurece la pantalla y deja visible solo el elemento de la pista */}
      <AnimatePresence>
        {enAccion && rect && (
          <motion.div key="foco" aria-hidden className="pointer-events-none fixed z-[64] rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }}
            exit={{ opacity: 0 }} transition={{ duration: movimientoReducido() ? 0 : 0.3 }}
            style={{ boxShadow: '0 0 0 9999px rgba(4,7,14,.62), 0 0 0 3px var(--color-accent), 0 0 28px rgba(92,200,245,.55)' }} />
        )}
      </AnimatePresence>

      {/* Panel del coach */}
      <AnimatePresence>
        {(enAccion || enResultadoFuera) && mod && (
          <motion.aside key="coach" role="dialog" aria-label={`Entrenamiento: ${mod.titulo}`}
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 left-1/2 z-[66] flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-3 rounded-2xl border-2 border-accent-line bg-raised p-5 shadow-[0_18px_50px_rgba(0,0,0,.6)]">
            <div className="flex items-center gap-3">
              {enResultadoFuera ? <Trophy size={28} className="text-ok" /> : <GraduationCap size={28} className="text-accent" />}
              <p className="m-0 flex-1 font-display text-[19px] font-bold">
                {enResultadoFuera ? `¡Módulo completado! ${mod.titulo}` : `Entrenamiento · ${mod.titulo}`}
              </p>
              <span className="tag simt">PRÁCTICA</span>
              <button type="button" onClick={salir} aria-label="Salir del entrenamiento" title="Salir del entrenamiento"
                className="grid h-[52px] w-[52px] place-items-center rounded-xl border-2 border-line2 text-subtle hover:bg-hover"><X size={22} /></button>
            </div>

            {enResultadoFuera ? (
              <button type="button" className="btn pri" onClick={() => navigate('/training')}>Ver tu resultado <ArrowRight size={18} /></button>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <span className="num grid h-9 min-w-9 place-items-center rounded-full bg-accent-bg px-2 text-base font-bold text-accent">{Math.min(pista, mod.pistas.length - 1) + 1}/{mod.pistas.length}</span>
                  <p className="m-0 text-[17px] leading-snug text-text">{pistaActual!.texto}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {!enSuPantalla && <button type="button" className="btn pri" onClick={() => navigate(mod.ruta)}>Ir a la pantalla <ArrowRight size={18} /></button>}
                  {enSuPantalla && pista < mod.pistas.length - 1 && <button type="button" className="btn sec" onClick={siguientePista}>Siguiente pista <ArrowRight size={18} /></button>}
                  <span className="self-center text-[14px] text-faint">Los datos de práctica no cuentan para tu normal ni generan alertas.</span>
                </div>
              </>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
