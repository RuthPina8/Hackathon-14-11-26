// Cliente REST hacia la API de Back 2 (FastAPI).
// Si no hay VITE_API_URL, o el back no contesta, cada llamada regresa null y la app
// sigue con los datos de ejemplo, así nadie se bloquea esperando al back.

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')

export const apiEnabled = BASE !== ''

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
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
}
