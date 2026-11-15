import { useEffect, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'

// Medidor semicircular de "Disposición para la misión" (rediseño v2).
// El arco y el número se animan cuando cambia el valor (status_changed).
const R = 90
const ARC = Math.PI * R // largo del semicírculo

function colorFor(v: number) {
  if (v >= 85) return '#3DDC97'
  if (v >= 60) return '#F5B544'
  return '#FF6B7A'
}

export default function ReadinessGauge({ value, ayer }: { value: number; ayer: number }) {
  const mv = useMotionValue(0)
  const dash = useTransform(mv, (v) => `${(v / 100) * ARC} ${ARC + 20}`)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) })
    return () => c.stop()
  }, [value, mv])

  // marca de ayer sobre el arco
  const a = Math.PI * (1 - ayer / 100)
  const mx1 = 110 + (R - 12) * Math.cos(a), my1 = 112 - (R - 12) * Math.sin(a)
  const mx2 = 110 + (R + 12) * Math.cos(a), my2 = 112 - (R + 12) * Math.sin(a)
  const delta = value - ayer

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="240" height="140" viewBox="0 0 220 128" role="img" aria-label={`Disposición para la misión ${value} de 100, ayer ${ayer}`}>
        <path d="M20 112 A90 90 0 0 1 200 112" fill="none" stroke="#1C2740" strokeWidth="14" strokeLinecap="round" />
        <motion.path
          d="M20 112 A90 90 0 0 1 200 112"
          fill="none"
          stroke={colorFor(value)}
          strokeWidth="14"
          strokeLinecap="round"
          style={{ strokeDasharray: dash }}
        />
        <line x1={mx1} y1={my1} x2={mx2} y2={my2} stroke="#E8ECF4" strokeWidth="2.5" strokeLinecap="round" />
        <text x="110" y="100" textAnchor="middle" fill="#E8ECF4" fontFamily="JetBrains Mono, monospace" fontSize="48" fontWeight="700">{shown}</text>
        <text x="110" y="122" textAnchor="middle" fill="#93A0B8" fontFamily="Inter, sans-serif" fontSize="11">de 100</text>
      </svg>
      <p className="m-0 text-[13px] text-[#A3AEC4]">
        <strong className="num" style={{ color: delta < 0 ? '#F5B544' : '#3DDC97' }}>{delta > 0 ? '+' : ''}{delta}</strong> vs ayer, la marca blanca es {ayer}
      </p>
    </div>
  )
}
