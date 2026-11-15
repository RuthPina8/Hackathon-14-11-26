import { C } from '../../lib/paleta'

// Estado con FORMA además de color (auditoría UX): verde y ámbar tienen el mismo brillo y una
// persona con daltonismo no los distingue. Cada estado tiene su figura:
//   ok   -> círculo con palomita
//   warn -> triángulo con signo de admiración
//   crit -> octágono con signo de admiración
//   none -> círculo punteado (sin datos)
export type EstadoForma = 'ok' | 'warn' | 'crit' | 'none'

export const COLOR_ESTADO: Record<EstadoForma, string> = { ok: C.ok, warn: C.warn, crit: C.crit, none: C.none }
export const TEXTO_ESTADO: Record<EstadoForma, string> = { ok: 'Normal', warn: 'Atención', crit: 'Crítico', none: 'Sin datos' }

export default function EstadoIcono({ estado, size = 14, titulo }: { estado: EstadoForma; size?: number; titulo?: string }) {
  const c = COLOR_ESTADO[estado]
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" role={titulo ? 'img' : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      {estado === 'ok' && (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M4.6 8.3 7 10.6l4.4-5" fill="none" stroke={C.void} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {estado === 'warn' && (
        <>
          <path d="M8 1.2 15.2 14.4H.8Z" fill={c} strokeLinejoin="round" />
          <path d="M8 6v4" stroke={C.void} strokeWidth="2" strokeLinecap="round" />
          <circle cx="8" cy="12.2" r="1.05" fill={C.void} />
        </>
      )}
      {estado === 'crit' && (
        <>
          <path d="M5.1 1h5.8L15 5.1v5.8L10.9 15H5.1L1 10.9V5.1Z" fill={c} />
          <path d="M8 4.2v4.6" stroke={C.void} strokeWidth="2" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="1.1" fill={C.void} />
        </>
      )}
      {estado === 'none' && <circle cx="8" cy="8" r="6.2" fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="2.4 2" />}
    </svg>
  )
}
