import { Minus, Plus } from 'lucide-react'

// Control táctil de + y − (auditoría UX: en pantalla táctil no se teclea).
// Botones de 60 px; el valor se ve grande en medio.

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function Stepper({ etiqueta, valor, onCambiar, paso = 1, min = 0, max = 999, unidad }: {
  etiqueta: string; valor: number; onCambiar: (v: number) => void; paso?: number; min?: number; max?: number; unidad?: string
}) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={etiqueta}>
      <span className="text-[14px] text-soft">{etiqueta}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn sec" style={{ padding: 0, width: 60 }} aria-label={`Menos ${etiqueta}`} disabled={valor <= min} onClick={() => onCambiar(clamp(valor - paso, min, max))}><Minus size={22} /></button>
        <output className="num min-w-[84px] text-center text-2xl font-bold text-ink" aria-live="polite">{valor}{unidad && <span className="ml-1 text-sm font-normal text-soft">{unidad}</span>}</output>
        <button type="button" className="btn sec" style={{ padding: 0, width: 60 }} aria-label={`Más ${etiqueta}`} disabled={valor >= max} onClick={() => onCambiar(clamp(valor + paso, min, max))}><Plus size={22} /></button>
      </div>
    </div>
  )
}

// Hora "HH:MM" con saltos de 15 minutos, dando la vuelta a medianoche
const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return (a || 0) * 60 + (b || 0) }
const aHora = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }

export function StepperHora({ etiqueta, valor, onCambiar, paso = 15 }: { etiqueta: string; valor: string; onCambiar: (v: string) => void; paso?: number }) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={etiqueta}>
      <span className="text-[14px] text-soft">{etiqueta}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn sec" style={{ padding: 0, width: 60 }} aria-label={`${etiqueta} ${paso} minutos antes`} onClick={() => onCambiar(aHora(aMin(valor) - paso))}><Minus size={22} /></button>
        <output className="num min-w-[96px] text-center text-2xl font-bold text-ink" aria-live="polite">{valor}</output>
        <button type="button" className="btn sec" style={{ padding: 0, width: 60 }} aria-label={`${etiqueta} ${paso} minutos después`} onClick={() => onCambiar(aHora(aMin(valor) + paso))}><Plus size={22} /></button>
      </div>
    </div>
  )
}
