import { api } from '../../lib/api'
import type { Ejercicio } from './pose/calcularAngulos'

export interface Comparacion {
  estado: 'sin_referencia' | 'estable' | 'bajo' | 'baja_calidad'
  referencia_reps: number | null
  n_referencia: number
  cambio_pct: number | null
  texto: string
}

export interface Sesion {
  id: number
  astronauta_id: number
  ejercicio: Ejercicio
  repeticiones: number
  duracion_s: number
  rango_grados: number | null
  regularidad: number | null
  simetria: number | null
  calidad: number
  fuente: 'webcam' | 'demo'
  capa: 'real' | 'sim'
  dato_demo: boolean
  fecha: string
  comparacion: Comparacion
}

export type SesionIn = Omit<Sesion, 'id' | 'fecha' | 'capa' | 'dato_demo' | 'comparacion'>

export const movimientoApi = {
  guardar: (s: SesionIn) => api.post<Sesion>('/movement/sessions', s),
  ultima: (astronautaId: number) => api.get<Sesion>(`/movement/latest?astronauta_id=${astronautaId}`),
  historial: (astronautaId: number) => api.get<Sesion[]>(`/movement/history?astronauta_id=${astronautaId}`),
  demo: (tipo: 'linea_base' | 'descenso', astronautaId: number, ejercicio: Ejercicio) =>
    api.post<Sesion[]>('/movement/demo', { tipo, astronauta_id: astronautaId, ejercicio }),
}

export const NOMBRE_EJERCICIO: Record<Ejercicio, string> = { brazos: 'Elevación de brazos', sentadilla: 'Sentadilla controlada' }

// "A1" -> 1
export const idNumerico = (id: string | undefined) => Number((id ?? '1').replace(/\D/g, '')) || 1
