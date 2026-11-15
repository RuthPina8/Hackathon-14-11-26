import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Resultados del chequeo diario, compartidos entre las 4 pantallas del flujo.
// El chequeo de hoy vive en memoria; el historial se guarda en este dispositivo
// para calcular "tu normal" aunque el back no esté conectado.

export type ResultadoCamara = {
  bpm: number | null
  confianza: number
  perclos: number | null
  parpadeosMin: number | null
  fecha: string
}

export type ResultadoCognitivo = {
  reaccionMs: number | null // mediana de los intentos válidos
  intentos: number
  anticipaciones: number // tocó antes de tiempo
  memoria: number | null // casillas recordadas
  atencion: { aciertos: number; omisiones: number; falsas: number } | null
  bpmCarga: number | null // ritmo medido por la cámara mientras hacía la prueba
  perclosCarga: number | null
  practica: boolean // las primeras 3 sesiones no cuentan para la línea base
}

export type Sueno = {
  acostarse: string // "23:00"
  latenciaMin: number
  despertares: number
  wasoMin: number
  despertar: string // "06:30"
  calidad: number // 1 a 5
  medicamento: boolean
}

export type Sintoma = { id: string; nombre: string; sistema: string; intensidad: 1 | 2 | 3 }

export type ResultadoRegistro = {
  presionSis: number | null
  presionDia: number | null
  animo: number | null
  palabra: string
  estres: number | null
  sueno: Sueno | null
  sintomas: Sintoma[]
}

export type Sesion = {
  fecha: string
  bpm: number | null
  perclos: number | null
  reaccionMs: number | null
  memoria: number | null
  presionSis: number | null
  presionDia: number | null
  animo: number | null
  estres: number | null
  suenoHoras: number | null
  sintomas: number
  cognitivoContado: boolean
}

type EstadoChequeo = {
  camara: ResultadoCamara | null
  cognitivo: ResultadoCognitivo | null
  registro: ResultadoRegistro | null
  historial: Sesion[]
  guardarCamara: (r: ResultadoCamara) => void
  guardarCognitivo: (r: ResultadoCognitivo) => void
  guardarRegistro: (r: ResultadoRegistro) => void
  cerrarSesion: (s: Sesion) => void
  reiniciar: () => void
}

export const useChequeoStore = create<EstadoChequeo>()(
  persist(
    (set) => ({
      camara: null,
      cognitivo: null,
      registro: null,
      historial: [],
      guardarCamara: (camara) => set({ camara }),
      guardarCognitivo: (cognitivo) => set({ cognitivo }),
      guardarRegistro: (registro) => set({ registro }),
      cerrarSesion: (s) => set((e) => ({ historial: [...e.historial, s].slice(-60) })),
      reiniciar: () => set({ camara: null, cognitivo: null, registro: null }),
    }),
    {
      name: 'astro_chequeos',
      // Solo el historial se queda guardado; el chequeo de hoy empieza limpio al recargar
      partialize: (e) => ({ historial: e.historial }),
    },
  ),
)

// Horas dormidas y eficiencia a partir del diario de sueño (Consensus Sleep Diary simplificado)
export function calcularSueno(s: Sueno) {
  const minutos = (h: string) => {
    const [hh, mm] = h.split(':').map(Number)
    return hh * 60 + mm
  }
  let enCama = minutos(s.despertar) - minutos(s.acostarse)
  if (enCama <= 0) enCama += 24 * 60
  const dormido = Math.max(0, enCama - s.latenciaMin - s.wasoMin)
  return { horas: dormido / 60, eficiencia: enCama ? (dormido / enCama) * 100 : 0 }
}

// "Tu normal": media y desviación de las últimas 14 sesiones con dato (mínimo 3)
export function tuNormal(historial: Sesion[], campo: keyof Sesion) {
  const valores = historial
    .map((s) => s[campo])
    .filter((v): v is number => typeof v === 'number')
    .slice(-14)
  if (valores.length < 3) return { media: null, sd: null, n: valores.length }
  const media = valores.reduce((a, b) => a + b, 0) / valores.length
  const sd = Math.sqrt(valores.reduce((a, b) => a + (b - media) ** 2, 0) / valores.length)
  return { media, sd, n: valores.length }
}
