import { useEffect, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { C } from '../../lib/paleta'

// Medidor semicircular de "Disposición para la misión" (rediseño v2).
// El arco y el número se animan cuando cambia el valor (status_changed).
const R = 90
const ARC = Math.PI * R // largo del semicírculo

function colorFor(v: number) {
  if (v >= 85) return C.ok
  if (v >= 60) return C.warn
  return C.crit
}

// value null = sin mediciones todavía (no se inventa un 100); ayer null = no hay lectura anterior
export default function ReadinessGauge({ value: valor, ayer }: { value: number | null; ayer: number | null }) {
  const value = valor ?? 0
  const mv = useMotionValue(0)
  const dash = useTransform(mv, (v) => `${(v / 100) * ARC} ${ARC + 20}`)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) })
    return () => c.stop()
  }, [value, mv])

  // marca de la lectura anterior sobre el arco
  const a = Math.PI * (1 - (ayer ?? 0) / 100)
  const mx1 = 110 + (R - 12) * Math.cos(a), my1 = 112 - (R - 12) * Math.sin(a)
  const mx2 = 110 + (R + 12) * Math.cos(a), my2 = 112 - (R + 12) * Math.sin(a)
  const delta = ayer === null ? 0 : value - ayer

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="240" height="140" viewBox="0 0 220 128" role="img" aria-label={valor === null ? 'Mission readiness, no data' : `Mission readiness ${value} out of 100${ayer !== null ? `, lectura anterior ${ayer}` : ''}`}>
        <path d="M20 112 A90 90 0 0 1 200 112" fill="none" stroke={C.line} strokeWidth="14" strokeLinecap="round" />
        <motion.path
          d="M20 112 A90 90 0 0 1 200 112"
          fill="none"
          stroke={colorFor(value)}
          strokeWidth="14"
          strokeLinecap="round"
          style={{ strokeDasharray: dash }}
        />
        {ayer !== null && valor !== null && <line x1={mx1} y1={my1} x2={mx2} y2={my2} stroke={C.text} strokeWidth="2.5" strokeLinecap="round" />}
        <text x="110" y="100" textAnchor="middle" fill={C.text} fontFamily="JetBrains Mono, monospace" fontSize="48" fontWeight="700">{valor === null ? '--' : shown}</text>
        <text x="110" y="122" textAnchor="middle" fill={C.faint} fontFamily="Inter, sans-serif" fontSize="11">out of 100</text>
      </svg>
      <p className="m-0 text-[13px] text-muted">
        {valor === null ? 'No measurements yet'
          : ayer === null ? 'First engine reading' : delta === 0 ? 'Same as your previous reading'
            : <><strong className="num" style={{ color: delta < 0 ? C.warn : C.ok }}>{delta > 0 ? '+' : ''}{delta}</strong> vs your previous reading, the white mark is {ayer}</>}
      </p>
    </div>
  )
}
