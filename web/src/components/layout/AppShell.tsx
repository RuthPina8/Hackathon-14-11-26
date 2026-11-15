import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from './Sidebar'
import { useAppStore } from '../../store/useAppStore'

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const demo = useAppStore((s) => s.demo)
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* key = ruta: cada pantalla entra con una transición corta */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="px-9 pt-7 flex flex-col gap-[22px] max-w-[1400px]"
          style={{ paddingBottom: demo ? 110 : 36 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}
