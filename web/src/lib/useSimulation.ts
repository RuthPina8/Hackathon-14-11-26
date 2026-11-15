import { useEffect, useState } from 'react'
import { api } from './api'
import type { ServerSimulation } from './adapters'

// Proyección de Back 2 (GET /simulation). `full` trae la curva de 180 días para las gráficas
// y `now` los valores del día elegido. Sin back (enabled = false) regresa null y la pantalla calcula sola.
export function useSimulation(env: string, day: number, enabled: boolean) {
  const [now, setNow] = useState<ServerSimulation | null>(null)
  const [full, setFull] = useState<ServerSimulation | null>(null)

  useEffect(() => {
    if (!enabled) return
    let vivo = true
    void api.get<ServerSimulation>(`/simulation?env=${env}&day=180`).then((r) => { if (vivo) setFull(r) })
    return () => { vivo = false }
  }, [env, enabled])

  useEffect(() => {
    if (!enabled) return
    let vivo = true
    const t = setTimeout(() => {
      void api.get<ServerSimulation>(`/simulation?env=${env}&day=${day}`).then((r) => { if (vivo) setNow(r) })
    }, 120)
    return () => { vivo = false; clearTimeout(t) }
  }, [env, day, enabled])

  // Sin back, o con una respuesta de otro entorno, la pantalla usa su cálculo propio
  return {
    now: enabled && now?.entorno === env ? now : null,
    full: enabled && full?.entorno === env ? full : null,
  }
}
