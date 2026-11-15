import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ScanFace } from 'lucide-react'
import { useMyAlerts } from '../../store/selectors'
import type { AlertItem } from '../../store/mockData'
import EstadoIcono from '../ui/EstadoIcono'
import { movimientoReducido, organoDeAlerta, useEfectos } from '../../lib/efectos'
import { ORGANOS } from '../../features/inicio/useSalud'

const ALERTA_MS = 3000
const ENCENDIDO_MS = 2000

// Alerta roja que cambia toda la interfaz por 3 s: borde rojo pulsante en la ventana, el órgano
// afectado destella en el holograma y la tarjeta entra deslizando. Después todo vuelve a la
// normalidad y solo el órgano queda en rojo (Inicio lo pinta mientras la alerta siga activa).
export function AlertaRoja() {
  const alertas = useMyAlerts()
  const destellar = useEfectos((s) => s.destellar)
  const vistas = useRef<Set<string> | null>(null)
  const montada = useRef(Date.now())
  const [actual, setActual] = useState<AlertItem | null>(null)

  useEffect(() => {
    // Las alertas del servidor llegan unos segundos después de abrir la app: las que aparezcan en ese
    // margen ya existían y no deben disparar el efecto (solo las que llegan en vivo)
    if (Date.now() - montada.current < 5000) {
      vistas.current = new Set([...(vistas.current ?? []), ...alertas.map((a) => `${a.id}:${a.nivel}`)])
      return
    }
    // Se recuerda id + nivel: así dispara tanto una alerta roja nueva como una amarilla que SUBE a roja
    // (el triage no duplica: actualiza la misma alerta y le cambia el nivel)
    const clave = (a: AlertItem) => `${a.id}:${a.nivel}`
    const rojas = alertas.filter((a) => a.nivel === 'crit' && a.estado === 'activa')
    // Las que ya estaban al abrir la app no disparan el efecto
    if (vistas.current === null) { vistas.current = new Set(alertas.map(clave)); return }
    const nueva = rojas.find((a) => !vistas.current!.has(clave(a)))
    alertas.forEach((a) => vistas.current!.add(clave(a)))
    if (!nueva) return
    setActual(nueva)
    destellar(organoDeAlerta(nueva))
    const id = setTimeout(() => setActual(null), ALERTA_MS)
    return () => clearTimeout(id)
  }, [alertas, destellar])

  const reducido = movimientoReducido()
  return (
    <AnimatePresence>
      {actual && (
        <>
          <motion.div key="borde" aria-hidden initial={{ opacity: 0 }} animate={reducido ? { opacity: 1 } : { opacity: [0, 1, 0.35, 1, 0.35, 1] }} exit={{ opacity: 0 }}
            transition={{ duration: reducido ? 0.2 : ALERTA_MS / 1000, ease: 'easeInOut' }}
            className="pointer-events-none fixed inset-0 z-[70]"
            style={{ boxShadow: 'inset 0 0 0 6px var(--color-crit), inset 0 0 80px rgba(255,107,122,.45)' }} />
          <motion.div key="tarjeta" role="alert" initial={{ x: 480, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 480, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="fixed right-6 top-6 z-[71] flex w-[min(440px,calc(100vw-48px))] flex-col gap-3 rounded-2xl border-2 border-crit bg-crit-bg p-5 shadow-[0_18px_50px_rgba(0,0,0,.6)]">
            <div className="flex items-center gap-3">
              <EstadoIcono estado="crit" size={30} />
              <span className="font-display text-[20px] font-bold text-crit-soft">Red alert · {ORGANOS[organoDeAlerta(actual)].nombre}</span>
            </div>
            <p className="m-0 text-[17px] font-semibold text-text">{actual.titulo}</p>
            <p className="m-0 text-[15px] text-subtle">{actual.queCambio}</p>
            <Link to={`/alerts?id=${actual.id}`} className="btn pri" onClick={() => setActual(null)}>See what to do <ArrowRight size={18} /></Link>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Encendido de cabina al reconocer la cara: líneas de escaneo, marcos del HUD que se dibujan y,
// detrás, los paneles de Inicio entran uno por uno con números que cuentan desde cero.
export function Encendido() {
  const activo = useEfectos((s) => s.encendido)
  const terminar = useEfectos((s) => s.terminarEncendido)

  useEffect(() => {
    if (!activo) return
    if (movimientoReducido()) { terminar(); return }
    const id = setTimeout(terminar, ENCENDIDO_MS + 400)
    return () => clearTimeout(id)
  }, [activo, terminar])

  return (
    <AnimatePresence>
      {activo && (
        <motion.div key="encendido" aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden"
          initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} exit={{ opacity: 0 }}
          transition={{ duration: ENCENDIDO_MS / 1000, times: [0, 0.6, 1] }}
          style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(11,34,54,.92), rgba(4,7,14,.97))' }}>
          {/* líneas de escaneo */}
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(92,200,245,.35) 0 1px, transparent 1px 4px)' }} />
          <motion.div className="absolute inset-x-0 h-24" style={{ background: 'linear-gradient(180deg, transparent, rgba(92,200,245,.35), transparent)' }}
            initial={{ top: '-10%' }} animate={{ top: '110%' }} transition={{ duration: 1.1, ease: 'easeInOut' }} />
          {/* rostro reconocido y marcos del HUD */}
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.35 }}
              className="relative grid h-36 w-36 place-items-center">
              {[0, 1, 2, 3].map((i) => (
                <motion.span key={i} className="absolute h-8 w-8 border-accent"
                  style={{ [i < 2 ? 'top' : 'bottom']: 0, [i % 2 ? 'right' : 'left']: 0, borderTopWidth: i < 2 ? 3 : 0, borderBottomWidth: i >= 2 ? 3 : 0, borderLeftWidth: i % 2 ? 0 : 3, borderRightWidth: i % 2 ? 3 : 0 }}
                  initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 + i * 0.08, duration: 0.25 }} />
              ))}
              <ScanFace size={72} className="text-accent" />
            </motion.div>
            <motion.p className="m-0 font-mono text-[18px] font-bold tracking-[0.2em] text-accent-soft" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
              IDENTITY VERIFIED
            </motion.p>
            <motion.p className="m-0 font-mono text-[14px] tracking-[0.15em] text-faint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
              STARTING CABIN · LOADING VITALS
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
