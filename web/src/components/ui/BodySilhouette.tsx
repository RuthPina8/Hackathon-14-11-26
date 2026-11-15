import type { SystemStatus } from '../../store/mockData'
import { semColor } from './semColor'
import { C } from '../../lib/paleta'

// Figura del cuerpo del rediseño v2. Cada sistema tiene un punto con halo
// del color de su semáforo; el óseo va punteado porque es simulado.
const pos: Record<string, { cx: number; cy: number }> = {
  mental: { cx: 70, cy: 20 },
  sueno: { cx: 84, cy: 32 },
  cardio: { cx: 86, cy: 90 },
  inmune: { cx: 64, cy: 122 },
  oseo: { cx: 64, cy: 212 },
}

export default function BodyFigure({ sistemas, hovered }: { sistemas: SystemStatus[]; hovered?: string | null }) {
  return (
    <svg width="120" height="224" viewBox="0 0 150 280" role="img" aria-label="Body figure with the status of each system" className="shrink-0">
      <g fill={C.raised} stroke={C.line2} strokeWidth="1.5">
        <circle cx="75" cy="30" r="21" />
        <path d="M48 62h54a14 14 0 0 1 14 14v62a8 8 0 0 1-16 0V92h-4v60H54V92h-4v46a8 8 0 0 1-16 0V76a14 14 0 0 1 14-14z" />
        <path d="M54 158h20v102a10 10 0 0 1-20 0zM76 158h20v102a10 10 0 0 1-20 0z" />
      </g>
      {sistemas.map((s) => {
        const p = pos[s.id]
        if (!p) return null
        const big = hovered === s.id
        if (s.sim) {
          return <circle key={s.id} cx={p.cx} cy={p.cy} r={big ? 8 : 6} fill="none" stroke={C.muted} strokeWidth="1.8" strokeDasharray="3 2.5" />
        }
        const c = semColor[s.estado]
        return (
          <g key={s.id}>
            <circle className="halo" cx={p.cx} cy={p.cy} r={big ? 15 : 11} fill={c} fillOpacity={0.3} />
            <circle cx={p.cx} cy={p.cy} r={big ? 7 : 5} fill={c} />
          </g>
        )
      })}
    </svg>
  )
}
