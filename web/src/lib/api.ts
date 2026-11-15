// Cliente REST hacia la API (FastAPI). La URL sale de web/.env (VITE_API_URL).
// Si el back no está corriendo, cada función regresa null y la app sigue con datos de ejemplo.

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const hayApi = () => BASE.length > 0

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T | null> {
  if (!BASE) return null
  try {
    const res = await fetch(BASE + ruta, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// ---------- Tipos tal como los manda el back ----------

export type NivelApi = 'amarilla' | 'roja'

export interface AlertaApi {
  id: number
  astronauta_id: number
  nivel: NivelApi
  senal: string
  que_cambio: string
  cuanto: string | null
  desde: string | null
  factores: Record<string, number>
  estado: 'activa' | 'atendida' | 'escalada' | 'resuelta'
  detectores: string[]
  dia_mision: number | null
  creada: string
  actualizada: string
  mensaje_cola_id: number | null
}

export interface MensajeColaApi {
  id: number
  prioridad: number // 1 = más urgente
  tipo: string
  tamano: number // kB
  payload: Record<string, unknown>
  estado: 'en_cola' | 'transmitiendo' | 'en_transito' | 'entregado'
  creado: string
  progreso: number // 0 a 1
  eta_s: number | null
}

export interface ColaApi {
  entorno: string
  retraso_s: number
  ancho_banda_kbps: number
  mensajes: MensajeColaApi[]
}

export interface EntornoApi {
  activo: string
  disponibles: string[]
  perfil: { id: string; nombre: string; retraso_s: number; radiacion_msv_dia: number; gravedad_g: number }
}

export type SemaforoApi = 'verde' | 'amarillo' | 'rojo' | 'sin_datos'

export interface EstadoApi {
  astronauta_id: number
  readiness: number
  factores: { label: string; delta: number; peso: number }[]
  sistemas: Record<string, { estado: SemaforoApi; valor: string | null }>
  calibracion: number // 0 a 100
  fase: string
  dia_mision: number
  n_mediciones: number
  inmune: { puntaje: number; motivo: string } | null
}

export interface MedicionApi {
  astronauta_id?: number
  tipo: string
  valor: number
  unidad: string
  capa: 'real' | 'auto' | 'sim'
  fuente: 'camara' | 'prueba' | 'manual' | 'apple_watch' | 'simulador' | 'modelo'
  confianza: number
  dia_mision?: number
  detalle?: Record<string, unknown>
}

export interface IndicadorApi {
  tipo: string
  unidad: string
  serie: { fecha: string; valor: number; capa: string; fuente: string; confianza: number }[]
  linea_base: { media: number | null; desviacion: number | null; n: number; peso_personal: number }
  rango_clinico: [number, number] | null
}

// ---------- Llamadas ----------

export const api = {
  alertas: () => pedir<{ activas: AlertaApi[]; resueltas: AlertaApi[] }>('/alerts'),
  atenderAlerta: (id: number) => pedir<AlertaApi>(`/alerts/${id}/ack`, { method: 'POST', body: '{}' }),
  escalarAlerta: (id: number) => pedir<AlertaApi>(`/alerts/${id}/escalate`, { method: 'POST', body: '{}' }),
  cola: () => pedir<ColaApi>('/queue'),
  entorno: () => pedir<EntornoApi>('/environment'),
  cambiarEntorno: (id: string) => pedir<EntornoApi>('/environment', { method: 'PUT', body: JSON.stringify({ id }) }),
  estado: () => pedir<EstadoApi>('/status'),
  indicador: (tipo: string, rango = '30d') => pedir<IndicadorApi>(`/indicators/${tipo}?range=${rango}`),
  guardarMediciones: (m: MedicionApi[]) =>
    pedir<{ guardadas: number }>('/measurements', { method: 'POST', body: JSON.stringify(m.map((x) => ({ astronauta_id: 1, ...x }))) }),
  encolar: (m: { tipo: string; prioridad: number; tamano: number; payload: Record<string, unknown> }) =>
    pedir<MensajeColaApi>('/queue', { method: 'POST', body: JSON.stringify(m) }),
  demoIniciar: () => pedir('/demo/start', { method: 'POST', body: '{}' }),
  demoDetener: () => pedir('/demo/stop', { method: 'POST', body: '{}' }),
  demoReiniciar: () => pedir('/demo/reset', { method: 'POST', body: '{}' }),
}
