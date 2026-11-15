import { NavLink } from 'react-router-dom'
import { Home, ScanFace, LineChart, Bell, User, Orbit, RadioTower, Users, LogOut } from 'lucide-react'
import { useSession } from '../../store/useSession'
import { useAppStore } from '../../store/useAppStore'
import ConnectionStatus from './TopBar'

interface Item { to: string; label: string; icon: typeof Home; badge?: boolean; end?: boolean }

const main: Item[] = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/camera', label: 'Chequeo diario', icon: ScanFace },
  { to: '/indicators/hr', label: 'Indicadores', icon: LineChart },
  { to: '/alerts', label: 'Alertas', icon: Bell, badge: true },
  { to: '/profile', label: 'Perfil y calibración', icon: User },
]
const sim: Item[] = [
  { to: '/simulation', label: 'Misión', icon: Orbit },
  { to: '/earth', label: 'Comunicación con Tierra', icon: RadioTower },
  { to: '/crew', label: 'Tripulación', icon: Users },
]

function Link({ item, count, crit }: { item: Item; count: number; crit?: boolean }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
      <Icon size={20} strokeWidth={1.8} className="shrink-0" />
      <span>{item.label}</span>
      {item.badge && count > 0 && (
        <span className="num ml-auto min-w-[22px] h-[22px] rounded-full text-xs font-bold grid place-items-center" style={{ background: crit ? '#FF6B7A' : '#F5B544', color: crit ? '#1A0508' : '#1D1503' }}>
          {count}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const activeAlerts = useAppStore((s) => s.alerts.filter((a) => a.estado === 'activa').length)
  const hasCrit = useAppStore((s) => s.alerts.some((a) => a.estado === 'activa' && a.nivel === 'crit'))
  const demo = useAppStore((s) => s.demo)
  const setDemo = useAppStore((s) => s.setDemo)
  const user = useSession((s) => s.user)
  const logout = useSession((s) => s.logout)

  return (
    <nav
      aria-label="Navegación principal"
      className="shrink-0 w-[252px] h-full overflow-y-auto bg-[#0A0F1B] border-r border-[#1C2740] px-3.5 py-5 flex flex-col gap-1"
    >
      <div className="flex items-center gap-2.5 px-2.5 pb-5">
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <rect x="1" y="1" width="28" height="28" rx="9" fill="#0B2636" stroke="#1F5A78" />
          <path d="M6 16h4l2.5-6 4.5 11 2.5-5h4.5" fill="none" stroke="#5CC8F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">AstroHealth</span>
      </div>

      {main.map((i) => <Link key={i.to} item={i} count={activeAlerts} crit={hasCrit} />)}
      <p className="k" style={{ margin: '18px 12px 8px' }}>Simulación</p>
      {sim.map((i) => <Link key={i.to} item={i} count={0} />)}

      <div className="mt-auto pt-4 px-3 border-t border-[#1C2740] flex flex-col gap-2.5">
        {user && (
          <div className="flex items-center gap-2.5 -mx-1 px-1 pb-2">
            <span className="w-9 h-9 rounded-[10px] grid place-items-center bg-[#15233B] border border-[#2F3F60] font-[family-name:var(--font-display)] text-sm font-bold shrink-0">{user.id}</span>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-sm font-semibold truncate">{user.nombre}</span>
              <span className="text-[11px] text-[#93A0B8] truncate">{user.cargo}</span>
            </span>
            <button type="button" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="w-9 h-9 grid place-items-center rounded-lg border-0 bg-transparent text-[#A3AEC4] hover:bg-[#111A2C] hover:text-[#E8ECF4] cursor-pointer shrink-0">
              <LogOut size={17} />
            </button>
          </div>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={demo}
          onClick={() => setDemo(!demo)}
          className="flex items-center gap-3 min-h-[44px] -mx-1 px-1 border-0 bg-transparent cursor-pointer text-left"
        >
          <span className="relative w-10 h-6 rounded-full shrink-0 transition-colors" style={{ background: demo ? '#F5B544' : '#22314F' }}>
            <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all" style={{ left: demo ? 20 : 4 }} />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold" style={{ color: demo ? '#F5D79A' : '#E8ECF4' }}>Modo demo</span>
            <span className="text-[11px] text-[#93A0B8]">{demo ? 'Controles para presentar' : 'Viendo la app real'}</span>
          </span>
        </button>
        <p className="k">Capas de datos</p>
        <span className="flex items-center gap-2.5 text-xs text-[#A3AEC4]"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#5CC8F5]" />Real, medido por cámara</span>
        <span className="flex items-center gap-2.5 text-xs text-[#A3AEC4]"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#B7A4FF]" />Autorreportado</span>
        <span className="flex items-center gap-2.5 text-xs text-[#A3AEC4]"><span className="w-2.5 h-2.5 rounded-[3px] border-[1.5px] border-dashed border-[#93A0B8]" />Simulado</span>
        <div className="pt-2"><ConnectionStatus /></div>
      </div>
    </nav>
  )
}
