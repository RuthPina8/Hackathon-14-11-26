import { useAppStore } from '../../store/useAppStore'
import { useSession } from '../../store/useSession'
import { astroNumero } from '../../lib/adapters'
import { apiEnabled } from '../../lib/api'
import type { MedicionEnvio } from '../../lib/back1'
import { useChequeoStore, type Paso } from './chequeoStore'

// Base de cada medición: quién y qué día de misión
export function baseMedicion() {
  const yo = astroNumero(useSession.getState().user?.id) ?? 1
  return { astronauta_id: yo, dia_mision: useAppStore.getState().status.diaMision || null }
}

// Manda un paso al motor. Sin conexión queda en la cola local y se reintenta al reconectar.
export async function enviarPaso(paso: Paso, lote: MedicionEnvio[]) {
  const marcar = useChequeoStore.getState().marcarEnvio
  if (lote.length === 0) return
  if (!apiEnabled) {
    marcar(paso, 'sin_back')
    return
  }
  const r = await useAppStore.getState().sendMeasurements(lote)
  marcar(paso, r ? 'enviado' : 'pendiente', r?.alerta_id ?? null)
}
