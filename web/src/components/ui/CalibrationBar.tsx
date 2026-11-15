import { motion } from 'framer-motion'

// Tira de días de la línea base personal (un cuadrito por día). El día actual
// lleva anillo. Cuando sube la calibración (calibration_changed) los cuadros se llenan.
export default function CalibrationStrip({ day, total }: { day: number; total: number }) {
  return (
    <div role="img" aria-label={`Día ${day} de ${total} de la línea base personal`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i < day
        const current = i === day - 1
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, scaleY: 0.4 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ delay: i * 0.03 }}
            className="h-[22px] rounded"
            style={{
              background: filled ? '#5CC8F5' : '#1C2740',
              boxShadow: current ? '0 0 0 2px #0E1422, 0 0 0 3.5px #5CC8F5' : undefined,
            }}
          />
        )
      })}
    </div>
  )
}
