import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAppStore } from '../../store/useAppStore'

// En pantallas anchas el menú queda fijo a la izquierda; en angostas (tablet, laptop chica)
// se esconde detrás de un botón para no aplastar las gráficas y la cámara.
export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const demo = useAppStore((s) => s.demo)
  const [abierto, setAbierto] = useState(false)
  const [ruta, setRuta] = useState(pathname + search)
  // Al navegar, el menú móvil se cierra solo
  if (ruta !== pathname + search) {
    setRuta(pathname + search)
    setAbierto(false)
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="hidden lg:flex h-full"><Sidebar /></div>

      {abierto && (
        <div className="lg:hidden fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="h-full shadow-2xl"><Sidebar /></div>
          <button type="button" aria-label="Cerrar menú" className="flex-1 bg-black/60 border-0 cursor-pointer" onClick={() => setAbierto(false)} />
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-y-auto" style={{ paddingBottom: demo ? 190 : undefined }}>
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-deep/95 backdrop-blur border-b border-line">
          <button type="button" aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setAbierto((x) => !x)}
            className="w-[52px] h-[52px] grid place-items-center rounded-xl border-2 border-line2 bg-transparent text-text cursor-pointer">
            {abierto ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="font-[family-name:var(--font-display)] text-base font-bold tracking-tight">AstroHealth</span>
        </div>
        {/* key = ruta: cada pantalla entra con una transición corta */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="px-4 sm:px-6 lg:px-9 pt-5 lg:pt-7 flex flex-col gap-[22px] max-w-[1400px]"
          style={{ paddingBottom: demo ? 110 : 36 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}
