import { api } from '../../lib/api'
import type { Sesion } from '../movimiento/movimientoApi'

export type Escenario = 'estable' | 'cambio' | 'revision'
export type Variable = 'co2_ppm' | 'o2_pct' | 'temp_c' | 'humedad_pct' | 'radiacion_msv_dia'

export interface Lectura {
  id: number
  fecha: string
  co2_ppm: number
  o2_pct: number
  temp_c: number
  humedad_pct: number
  radiacion_msv_dia: number
  capa: 'real' | 'sim'
  fuente: string
  escenario: Escenario | null
  fuera_de_rango: Variable[]
}

export interface Rango { variable: Variable; nombre: string; unidad: string; minimo: number | null; maximo: number | null }

export interface TelemetriaEstado { escenario: Escenario; ultima: Lectura | null; rangos: Rango[]; nota: string }

export interface Observacion {
  id: number
  nivel: 'informativa'
  titulo: string
  texto: string
  causalidad: string
  que_cambio_funcional: string
  que_cambio_ambiente: { variable: Variable; nombre: string; unidad: string; minimo_registrado: number; maximo_registrado: number; rango: [number | null, number | null]; lecturas_fuera: number }[]
  desde: string
  hasta: string
  datos_usados: string[]
  confiabilidad: string[]
  acciones: string[]
  creada: string
}

export interface ContextoMision {
  dia_mision: number
  astronauta_id: number
  entorno: string
  funcional: Sesion | null
  ambiente: Lectura | null
  escenario: Escenario
  rangos: Rango[]
  observaciones: Observacion[]
  nota_ambiente: string
}

export const ambienteApi = {
  estado: () => api.get<TelemetriaEstado>('/telemetry/latest'),
  historial: (limite = 60) => api.get<Lectura[]>(`/telemetry/history?limite=${limite}`),
  simular: (escenario: Escenario) => api.post<TelemetriaEstado>('/telemetry/simulate', { escenario }),
  contexto: (astronautaId: number) => api.get<ContextoMision>(`/mission/context?astronauta_id=${astronautaId}`),
}

export const NOMBRE_ESCENARIO: Record<Escenario, string> = {
  estable: 'Stable environment',
  cambio: 'Environmental change',
  revision: 'Needs review',
}
