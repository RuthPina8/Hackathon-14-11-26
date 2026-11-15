// Cliente REST hacia la API de Back 2 (FastAPI).
// Si no hay VITE_API_URL, o el back no contesta, cada llamada regresa null y la app
// sigue con los datos de ejemplo, así nadie se bloquea esperando al back.

import { useSession } from '../store/useSession'
import { astroNumero, type ServerQueueMessage } from './adapters'

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')

export const apiEnabled = BASE !== ''

// Medición que entiende POST /measurements (Back 1). La capa y la fuente siguen la regla de honestidad:
// real = medida por sensor o cámara, auto = autorreportada, sim = simulada.
export interface MedicionApi {
  tipo: string
  valor: number
  unidad: string
  capa: 'real' | 'auto' | 'sim'
  fuente: 'camara' | 'prueba' | 'manual' | 'apple_watch' | 'simulador' | 'modelo'
  confianza: number
  dia_mision?: number
  detalle?: Record<string, unknown>
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  if (!apiEnabled) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 4000)
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  // Guarda las mediciones de hoy a nombre de quien tiene la sesión abierta
  guardarMediciones: (m: MedicionApi[]) => {
    const astronauta_id = astroNumero(useSession.getState().user?.id) ?? 1
    return request<{ guardadas: number; alerta_id: number | null }>('POST', '/measurements', m.map((x) => ({ astronauta_id, ...x })))
  },
  // Manda un mensaje a la cola hacia Tierra (por ejemplo, el resumen clínico con una nota)
  encolar: (m: { tipo: string; prioridad: number; tamano: number; payload: Record<string, unknown> }) =>
    request<ServerQueueMessage>('POST', '/queue', m),
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
}
