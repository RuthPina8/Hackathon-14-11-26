// Cliente REST hacia la API (FastAPI).
// Sin VITE_API_URL se usa el puerto 8000 de la misma máquina que sirve el front, así la app
// se conecta sola en la demo (localhost o la IP de la red). VITE_API_URL=off la deja solo con ejemplos.
// Si el back no contesta, cada llamada regresa null y la app sigue con los datos de ejemplo.

function baseUrl(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  if (env === 'off') return ''
  if (env) return env.replace(/\/$/, '')
  if (typeof window === 'undefined') return ''
  return `${window.location.protocol}//${window.location.hostname}:8000`
}

export const BASE = baseUrl()
export const apiEnabled = BASE !== ''

export function wsUrl(): string | null {
  const env = (import.meta.env.VITE_WS_URL as string | undefined)?.trim()
  if (env === 'off' || !apiEnabled) return null
  if (env) return env
  return BASE.replace(/^http/, 'ws') + '/ws'
}

async function request<T>(method: string, path: string, body?: unknown, timeoutMs = 6000): Promise<T | null> {
  if (!apiEnabled) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
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
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}, timeoutMs?: number) => request<T>('POST', path, body, timeoutMs),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
}
