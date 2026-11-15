import type { Semaforo } from '../../store/mockData'
import { C } from '../../lib/paleta'

export const semColor: Record<Semaforo, string> = {
  ok: C.ok,
  warn: C.warn,
  crit: C.crit,
  none: 'transparent',
}
