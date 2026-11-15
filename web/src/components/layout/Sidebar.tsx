import { NavLink } from 'react-router-dom'
import { Home, ScanFace, LineChart, Bell, Orbit, Users, LogOut, TrendingUp, Radar, PersonStanding, GraduationCap } from 'lucide-react'
import { useSession } from '../../store/useSession'
import { useMyAlerts } from '../../store/selectors'
import { useAppStore } from '../../store/useAppStore'
import ConnectionStatus from './TopBar'
import { C } from '../../lib/paleta'

interface Item { to: string; label: string; icon: typeof Home; badge?: boolean; end?: boolean }

const main: Item[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/mission-intelligence', label: 'Mission intelligence', icon: Radar },
  { to: '/camera', label: 'Daily check-up', icon: ScanFace },
  { to: '/movement', label: 'Movement', icon: PersonStanding },
  { to: '/indicators', label: 'Indicators', icon: LineChart },
  { to: '/alerts', label: 'Alerts', icon: Bell, badge: true },
  { to: '/progress', label: 'My progress', icon: TrendingUp },
  { to: '/training', label: 'Training', icon: GraduationCap },
]
const sim: Item[] = [
  { to: '/simulation', label: 'Mission', icon: Orbit },
  { to: '/crew', label: 'Crew', icon: Users },
]

function Link({ item, count, crit }: { item: Item; count: number; crit?: boolean }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
      <Icon size={26} strokeWidth={2} className="shrink-0" />
      <span>{item.label}</span>
      {item.badge && count > 0 && (
        <span className="num ml-auto min-w-[30px] h-[30px] px-1.5 rounded-full text-sm font-bold grid place-items-center" style={{ background: crit ? C.crit : C.warn, color: crit ? '#1A0508' : '#1D1503' }}>
          {count}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const mine = useMyAlerts()
  const activeAlerts = mine.filter((a) => a.estado === 'activa').length
  const hasCrit = mine.some((a) => a.estado === 'activa' && a.nivel === 'crit')
  const demo = useAppStore((s) => s.demo)
  const setDemo = useAppStore((s) => s.setDemo)
  const user = useSession((s) => s.user)
  const logout = useSession((s) => s.logout)

  return (
    <nav
      aria-label="Main navigation"
      className="shrink-0 w-[300px] h-full overflow-y-auto bg-deep border-r border-line px-3.5 py-5 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2.5 px-2.5 pb-5">
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <rect x="1" y="1" width="28" height="28" rx="9" fill={C.accentBg} stroke={C.accentLine} />
          <path d="M6 16h4l2.5-6 4.5 11 2.5-5h4.5" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">AstroHealth</span>
      </div>

      {main.map((i) => <Link key={i.to} item={i} count={activeAlerts} crit={hasCrit} />)}
      <p className="k" style={{ margin: '18px 12px 8px' }}>Simulation</p>
      {sim.map((i) => <Link key={i.to} item={i} count={0} />)}

      <div className="mt-auto pt-4 px-3 border-t border-line flex flex-col gap-2.5">
        {user && (
          <div className="flex items-center gap-2.5 -mx-1 px-1 pb-2">
            <span className="w-9 h-9 rounded-[10px] grid place-items-center bg-sel border border-line2 font-[family-name:var(--font-display)] text-sm font-bold shrink-0">{user.id}</span>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-sm font-semibold truncate">{user.nombre}</span>
              <span className="text-[13px] text-faint truncate">{user.cargo}</span>
            </span>
            <button type="button" onClick={logout} aria-label="Log out" title="Log out" className="w-14 h-14 grid place-items-center rounded-xl border-2 border-line2 bg-raised text-subtle hover:bg-[#18243B] hover:text-text cursor-pointer shrink-0">
              <LogOut size={24} />
            </button>
          </div>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={demo}
          onClick={() => setDemo(!demo)}
          className="flex items-center gap-3 min-h-[60px] -mx-1 px-1 border-0 bg-transparent cursor-pointer text-left"
        >
          <span className="relative w-14 h-8 rounded-full shrink-0 transition-colors" style={{ background: demo ? C.demo : C.track }}>
            <span className="absolute top-1 w-6 h-6 rounded-full bg-white transition-all" style={{ left: demo ? 28 : 4 }} />
          </span>
          <span className="flex flex-col">
            <span className="text-base font-semibold" style={{ color: demo ? C.demo : C.text }}>Demo mode</span>
            <span className="text-[13px] text-faint">{demo ? 'Presentation controls' : 'Viewing the real app'}</span>
          </span>
        </button>
        <p className="k">Data layers</p>
        <span className="flex items-center gap-2.5 text-sm text-muted"><span className="w-2.5 h-2.5 rounded-[3px] bg-accent" />Real, measured live</span>
        <span className="flex items-center gap-2.5 text-sm text-muted"><span className="w-2.5 h-2.5 rounded-[3px] bg-self" />Self-reported</span>
        <span className="flex items-center gap-2.5 text-sm text-muted"><span className="w-2.5 h-2.5 rounded-[3px] border-[1.5px] border-dashed border-faint" />Simulated</span>
        <div className="pt-2"><ConnectionStatus /></div>
      </div>
    </nav>
  )
}
