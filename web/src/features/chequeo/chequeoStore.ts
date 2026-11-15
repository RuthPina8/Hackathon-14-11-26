import { create } from 'zustand'
import type { ResultadoExpresion } from './camara/useExpresion'

// Resultados del chequeo diario, compartidos entre los 5 pasos y con Inicio (rutina de hoy).
// Se guardan por astronauta y por día en este dispositivo, así recargar la página no borra lo hecho.

export type ResultadoCamara = {
  bpm: number | null
  confianza: number // escala del navegador (0.12 mínima, 0.2 buena)
  confianzaMotor: number // misma confianza en la escala del motor (0.5 = entra a tu línea base)
  perclos: number | null
  parpadeosMin: number | null
  parpadeoDurMs: number | null
  cierresLargos: number
  expresion: ResultadoExpresion | null
  hrv: number | null // experimental, de POST /rppg/estimate
  resp: number | null // experimental
  segundosValidos: number
  fps: number | null
  luz: string | null // problema de luz más frecuente, si hubo
  fecha: string
}

export type ResultadoCognitivo = {
  medianaMs: number
  mediaMs: number
  lapsos: number // respuestas de más de 500 ms
  falsos: number // tocó antes de que apareciera el estímulo
  estimulos: number
  practica: boolean // las 3 primeras sesiones no cuentan para tu normal
  fecha: string
}

export type ResultadoPresion = { sis: number; dia: number; pulso: number | null; fecha: string } | { omitida: true; fecha: string }

export type Sueno = {
  acostarse: string; intento: string; latenciaMin: number; despertares: number; wasoMin: number
  despertar: string; levantarse: string; calidad: number; medicamento: boolean
}
export type Sintoma = { clave: string; intensidad: number }
export type ResultadoRegistro = { animo: number; estres: number; sueno: Sueno | null; sintomas: Sintoma[]; nota: string; fecha: string }

export type Paso = 'camara' | 'cognitivo' | 'presion' | 'registro'
export type EstadoEnvio = 'enviado' | 'pendiente' | 'sin_back'

type Datos = {
  camara: ResultadoCamara | null
  cognitivo: ResultadoCognitivo | null
  presion: ResultadoPresion | null
  registro: ResultadoRegistro | null
  envios: Partial<Record<Paso, EstadoEnvio>>
  alertas: number[] // alertas que levantó el motor con este chequeo
}

type EstadoChequeo = Datos & {
  clave: string // usuario + día
  cargar: (usuario: string) => void
  guardarCamara: (r: ResultadoCamara) => void
  guardarCognitivo: (r: ResultadoCognitivo) => void
  guardarPresion: (r: ResultadoPresion) => void
  guardarRegistro: (r: ResultadoRegistro) => void
  marcarEnvio: (paso: Paso, estado: EstadoEnvio, alertaId?: number | null) => void
  reiniciar: () => void
}

const VACIO: Datos = { camara: null, cognitivo: null, presion: null, registro: null, envios: {}, alertas: [] }

export const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const leer = (clave: string): Datos => {
  try {
    const raw = localStorage.getItem(clave)
    return raw ? { ...VACIO, ...(JSON.parse(raw) as Datos) } : VACIO
  } catch {
    return VACIO
  }
}

export const useChequeoStore = create<EstadoChequeo>()((set, get) => {
  const guardar = (parcial: Partial<Datos>) => {
    set(parcial)
    const { camara, cognitivo, presion, registro, envios, alertas, clave } = get()
    try { localStorage.setItem(clave, JSON.stringify({ camara, cognitivo, presion, registro, envios, alertas })) } catch { /* sin storage */ }
  }
  return {
    ...VACIO,
    clave: '',
    cargar: (usuario) => {
      const clave = `astro_chequeo_${usuario}_${hoyLocal()}`
      if (clave === get().clave) return
      set({ ...leer(clave), clave })
    },
    guardarCamara: (camara) => guardar({ camara }),
    guardarCognitivo: (cognitivo) => guardar({ cognitivo }),
    guardarPresion: (presion) => guardar({ presion }),
    guardarRegistro: (registro) => {
      guardar({ registro })
      // El último sueño se recuerda para precargar el registro del día siguiente
      const usuario = get().clave.split('_')[2]
      if (registro.sueno && usuario) {
        try { localStorage.setItem(`astro_ultimo_sueno_${usuario}`, JSON.stringify(registro.sueno)) } catch { /* sin storage */ }
      }
    },
    marcarEnvio: (paso, estado, alertaId) => guardar({
      envios: { ...get().envios, [paso]: estado },
      alertas: alertaId != null && !get().alertas.includes(alertaId) ? [...get().alertas, alertaId] : get().alertas,
    }),
    reiniciar: () => guardar({ ...VACIO }),
  }
})

// Sesiones de la prueba cognitiva hechas por este astronauta (las 3 primeras son de práctica)
export function sesionesCognitivas(usuario: string): number {
  try { return Number(localStorage.getItem(`astro_pvt_${usuario}`) ?? '0') || 0 } catch { return 0 }
}
export function sumarSesionCognitiva(usuario: string) {
  try { localStorage.setItem(`astro_pvt_${usuario}`, String(sesionesCognitivas(usuario) + 1)) } catch { /* sin storage */ }
}

// Último sueño registrado por este astronauta (para precargar el registro de hoy)
export function ultimoSueno(): Sueno | null {
  const usuario = useChequeoStore.getState().clave.split('_')[2]
  if (!usuario) return null
  try {
    const raw = localStorage.getItem(`astro_ultimo_sueno_${usuario}`)
    return raw ? (JSON.parse(raw) as Sueno) : null
  } catch {
    return null
  }
}
