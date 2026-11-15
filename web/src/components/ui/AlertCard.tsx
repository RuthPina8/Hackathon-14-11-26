import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, Activity, Moon, HeartPulse } from 'lucide-react'
import type { AlertItem } from '../../store/mockData'

const icons = { eye: Eye, pulse: Activity, moon: Moon, heart: HeartPulse }

// Alerta compacta (Inicio). Entra deslizando cuando llega por alert_raised.
export default function AlertLink({ alert }: { alert: AlertItem }) {
  const Icon = icons[alert.icono]
  const crit = alert.nivel === 'crit'
  const c = crit ? { bg: '#2A1218', bd: '#5A2A33', ic: '#FF6B7A', sub: '#FFC2C8' } : { bg: '#241D0D', bd: '#5C4A1C', ic: '#F5B544', sub: '#DCCB9F' }
  return (
    <motion.div layout initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}>
      <Link
        to={`/alerts?id=${alert.id}`}
        className="flex gap-3.5 items-center px-4 py-3.5 rounded-[14px] no-underline text-[#E8ECF4] hover:text-[#E8ECF4]"
        style={{ background: c.bg, border: `1px solid ${c.bd}` }}
      >
        <Icon size={22} color={c.ic} strokeWidth={2} className="shrink-0" />
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <strong className="text-[15px]">{alert.titulo}</strong>
          <span className="text-[13px]" style={{ color: c.sub }}>{alert.resumen}</span>
        </span>
        <span className="num text-xs whitespace-nowrap" style={{ color: c.sub }}>{alert.cuando}</span>
      </Link>
    </motion.div>
  )
}
