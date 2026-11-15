import type { Semaforo } from '../../store/mockData'

export const semColor: Record<Semaforo, string> = {
  ok: '#3DDC97',
  warn: '#F5B544',
  crit: '#FF6B7A',
  none: 'transparent',
}
