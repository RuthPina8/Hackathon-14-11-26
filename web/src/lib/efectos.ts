import { create } from 'zustand'
import type { AlertItem } from '../store/mockData'
import type { Organo } from '../features/inicio/useSalud'

// Estado compartido de los efectos visuales que cruzan pantallas:
// - encendido: secuencia de 2 s al entrar con la cara (paneles que se dibujan y números que cuentan)
// - destello: un órgano destella en el holograma (alerta roja nueva)
// Cada efecto explica un cambio real: entrar, o una alerta roja que acaba de llegar.

interface Efectos {
  encendido: boolean
  destello: { organo: Organo; n: number } | null
  iniciarEncendido: () => void
  terminarEncendido: () => void
  destellar: (organo: Organo) => void
}

export const useEfectos = create<Efectos>()((set, get) => ({
  encendido: false,
  destello: null,
  iniciarEncendido: () => set({ encendido: true }),
  terminarEncendido: () => set({ encendido: false }),
  destellar: (organo) => set({ destello: { organo, n: (get().destello?.n ?? 0) + 1 } }),
}))

export const movimientoReducido = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// A qué órgano del holograma corresponde una alerta
export function organoDeAlerta(a: Pick<AlertItem, 'titulo' | 'icono'>): Organo {
  const t = a.titulo.toLowerCase()
  if (/respir/.test(t)) return 'pulmones'
  if (/inmun|síntoma|sintoma|fiebre|congesti|labial/.test(t)) return 'inmune'
  if (/reacci|ánimo|animo|estrés|estres|expresiv|atenci/.test(t)) return 'cerebro'
  if (/sueño|sueno|fatiga|perclos|ojo/.test(t) || a.icono === 'moon' || a.icono === 'eye') return 'ojos'
  return 'corazon'
}
