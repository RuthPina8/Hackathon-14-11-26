import { useMemo } from 'react'
import { useAppStore } from './useAppStore'
import { useSession } from './useSession'
import { astroNumero } from '../lib/adapters'
import type { AlertItem } from './mockData'

// Alertas de quien tiene la sesión abierta. El comandante ve las de toda la tripulación.
// Las de ejemplo y las de la demo local no tienen dueño y las ve todo el mundo.
export function useMyAlerts(): AlertItem[] {
  const alerts = useAppStore((s) => s.alerts)
  const user = useSession((s) => s.user)
  return useMemo(() => {
    if (!user || user.rol === 'comandante') return alerts
    const yo = astroNumero(user.id)
    return alerts.filter((a) => a.astro === undefined || a.astro === yo)
  }, [alerts, user])
}
