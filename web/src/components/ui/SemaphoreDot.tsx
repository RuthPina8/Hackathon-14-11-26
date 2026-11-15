import type { Semaforo } from '../../store/mockData'

export const semColor: Record<Semaforo, string> = {
  ok: '#3DDC97',
  warn: '#F5B544',
  crit: '#FF6B7A',
  none: 'transparent',
}

export default function SemaphoreDot({ estado, size = 10 }: { estado: Semaforo; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: semColor[estado],
        border: estado === 'none' ? '1.5px dashed #A3AEC4' : undefined,
        boxSizing: 'border-box',
      }}
    />
  )
}
