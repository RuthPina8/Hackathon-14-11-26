import { create } from 'zustand'

// Resultados del chequeo diario, compartidos entre las pantallas del flujo
export type ResultadoCamara = {
  bpm: number | null
  confianza: number
  perclos: number | null
  parpadeosMin: number | null
  fecha: string
}

type EstadoChequeo = {
  camara: ResultadoCamara | null
  guardarCamara: (r: ResultadoCamara) => void
  reiniciar: () => void
}

export const useChequeoStore = create<EstadoChequeo>()((set) => ({
  camara: null,
  guardarCamara: (camara) => set({ camara }),
  reiniciar: () => set({ camara: null }),
}))
