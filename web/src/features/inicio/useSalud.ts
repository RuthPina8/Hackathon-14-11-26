import { useMemo } from 'react'
import { tuNormal, useChequeoStore, type Sesion } from '../chequeo/chequeoStore'

// Estado de salud para la pantalla principal, calculado solo con lo que ya se mide:
// el historial de chequeos de este astronauta. No hay datos de ejemplo aquí
export type Estado = 'ok' | 'warn' | 'crit' | 'none'
export type Organo = 'cerebro' | 'ojos' | 'corazon' | 'pulmones' | 'inmune'

type Def = {
  id: string
  label: string
  campo: keyof Sesion
  unit: string
  dec: number
  escala?: number
  clin?: [number, number] // rango clínico de referencia
  dir: 'sube' | 'baja' | 'ambas' // hacia dónde es malo moverse
  organo: Organo
  capa: 'real' | 'self'
  experimental?: boolean
  soloAviso?: boolean // no es clínica: puede pedir atención pero nunca marca crítico
  link: string
}

export const METRICAS: Def[] = [
  { id: 'hr', label: 'Ritmo cardiaco', campo: 'bpm', unit: 'lpm', dec: 0, clin: [50, 100], dir: 'ambas', organo: 'corazon', capa: 'real', link: '/indicators/hr' },
  { id: 'hrv', label: 'VFC (estrés)', campo: 'rmssd', unit: 'ms', dec: 0, dir: 'baja', organo: 'corazon', capa: 'real', experimental: true, link: '/indicators/hrv' },
  { id: 'resp', label: 'Respiración', campo: 'respRpm', unit: 'resp/min', dec: 0, clin: [12, 20], dir: 'ambas', organo: 'pulmones', capa: 'real', experimental: true, link: '/indicators/resp' },
  { id: 'bp', label: 'Presión arterial', campo: 'presionSis', unit: 'mmHg', dec: 0, clin: [90, 140], dir: 'ambas', organo: 'corazon', capa: 'self', link: '/indicators/bp' },
  { id: 'sintomas', label: 'Síntomas', campo: 'sintomas', unit: 'activos', dec: 0, clin: [0, 2.5], dir: 'sube', organo: 'inmune', capa: 'self', link: '/manual' },
  { id: 'perclos', label: 'Fatiga visual', campo: 'perclos', unit: 'PERCLOS', dec: 2, clin: [0, 0.15], dir: 'sube', organo: 'ojos', capa: 'real', link: '/indicators/perclos' },
  { id: 'sleep', label: 'Sueño', campo: 'suenoHoras', unit: 'h', dec: 1, clin: [6, 12], dir: 'baja', organo: 'ojos', capa: 'self', link: '/indicators/sleep' },
  { id: 'rt', label: 'Reacción', campo: 'reaccionMs', unit: 'ms', dec: 0, clin: [0, 350], dir: 'sube', organo: 'cerebro', capa: 'real', link: '/indicators/rt' },
  { id: 'mood', label: 'Ánimo', campo: 'animo', unit: 'de 5', dec: 0, clin: [2.5, 5], dir: 'baja', organo: 'cerebro', capa: 'self', link: '/indicators/mood' },
  { id: 'expr', label: 'Expresividad', campo: 'expresividad', unit: 'de 100', dec: 0, escala: 100, dir: 'ambas', organo: 'cerebro', capa: 'real', soloAviso: true, link: '/indicators/expr' },
]

export const ORGANOS: Record<Organo, { nombre: string; sistema: string; que: string }> = {
  cerebro: { nombre: 'Cerebro', sistema: 'Mental y cognitivo', que: 'Reacción, ánimo y expresividad. El aislamiento y el mal sueño se notan primero aquí' },
  ojos: { nombre: 'Ojos', sistema: 'Sueño y fatiga', que: 'Fatiga visual y horas de sueño. En órbita hay 16 amaneceres al día y el ritmo de sueño se rompe' },
  corazon: { nombre: 'Corazón', sistema: 'Cardiovascular', que: 'Ritmo, variabilidad y presión. Sin gravedad los líquidos suben y el corazón se desacondiciona' },
  pulmones: { nombre: 'Pulmones', sistema: 'Respiratorio', que: 'Respiraciones por minuto en reposo, medidas solo con la cámara' },
  inmune: { nombre: 'Sistema inmune', sistema: 'Inmune', que: 'Síntomas reportados. La radiación y el estrés debilitan las defensas' },
}

export type Metrica = Def & {
  valor: number | null
  texto: string
  serie: number[]
  media: number | null
  n: number
  estado: Estado
  motivo: string
}

const PEOR: Estado[] = ['none', 'ok', 'warn', 'crit']
export const peor = (a: Estado, b: Estado) => (PEOR.indexOf(a) >= PEOR.indexOf(b) ? a : b)

function evaluar(d: Def, v: number, media: number | null, sd: number | null): { estado: Estado; motivo: string } {
  let estado: Estado = 'ok'
  let motivo = media == null ? 'Aprendiendo tu normal' : 'Dentro de tu normal'
  if (d.clin) {
    const [lo, hi] = d.clin
    const alto = d.dir !== 'baja' && v > hi
    const bajo = d.dir !== 'sube' && v < lo && lo > 0
    if (alto || bajo) {
      const exceso = alto ? (v - hi) / (hi || 1) : (lo - v) / lo
      estado = exceso > 0.2 ? 'crit' : 'warn'
      motivo = `Fuera del rango clínico (${lo} a ${hi})`
    }
  }
  if (media != null && sd) {
    const z = (v - media) / sd
    const malo = d.dir === 'ambas' ? Math.abs(z) : d.dir === 'sube' ? z : -z
    if (malo >= 2) {
      // Las experimentales y las no clínicas solo avisan, nunca llegan a crítico
      const nivel: Estado = malo >= 3 && !d.experimental && !d.soloAviso ? 'crit' : 'warn'
      if (PEOR.indexOf(nivel) > PEOR.indexOf(estado)) {
        estado = nivel
        motivo = `${z > 0 ? 'Más alto' : 'Más bajo'} que tu normal (z ${z.toFixed(1)})`
      }
    }
  }
  return { estado, motivo }
}

export function useSalud() {
  const historial = useChequeoStore((s) => s.historial)

  return useMemo(() => {
    const metricas: Metrica[] = METRICAS.map((d) => {
      const esc = d.escala ?? 1
      const valores = historial.map((s) => s[d.campo]).filter((v): v is number => typeof v === 'number').map((v) => v * esc)
      const valor = valores.length ? valores[valores.length - 1] : null
      // Tu normal sin contar la última medición, para comparar el hoy contra el antes
      const conDato = historial.filter((s) => typeof s[d.campo] === 'number')
      const normal = tuNormal(conDato.slice(0, -1), d.campo)
      const media = normal.media != null ? normal.media * esc : null
      const sd = normal.sd != null ? normal.sd * esc : null
      const { estado, motivo } = valor == null ? { estado: 'none' as Estado, motivo: 'Sin datos todavía' } : evaluar(d, valor, media, sd)
      let texto = valor == null ? '--' : valor.toFixed(d.dec)
      if (d.id === 'bp' && valor != null) {
        const ult = [...historial].reverse().find((s) => s.presionSis != null)
        if (ult?.presionDia != null) texto = `${ult.presionSis}/${ult.presionDia}`
      }
      return { ...d, valor, texto, serie: valores.slice(-12), media, n: normal.n, estado, motivo }
    })

    const organos = {} as Record<Organo, Estado>
    for (const o of Object.keys(ORGANOS) as Organo[]) {
      organos[o] = metricas.filter((m) => m.organo === o).reduce<Estado>((acc, m) => peor(acc, m.estado), 'none')
    }
    const ultimo = historial[historial.length - 1]
    return { metricas, organos, ultimo, sesiones: historial.length }
  }, [historial])
}
