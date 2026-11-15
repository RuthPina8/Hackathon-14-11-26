import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { astroNumero } from '../../lib/adapters'
import { SEM, type ServerIndicator } from '../../lib/back1'
import { useAppStore } from '../../store/useAppStore'
import { useSession } from '../../store/useSession'
import { useChequeoStore } from '../chequeo/chequeoStore'
import { calcularSueno } from '../chequeo/envio'

// Estado de salud para el escaneo corporal del Inicio, solo con lo que ya se mide:
// las series del motor (Back 1) y, si no hay back, lo que se midió hoy en el chequeo
export type Estado = 'ok' | 'warn' | 'crit' | 'none'
export type Organo = 'cerebro' | 'ojos' | 'corazon' | 'pulmones' | 'inmune'

type Def = {
  id: string
  label: string
  tipo: string // tipo en el motor
  unit: string
  dec: number
  escala?: number
  clin?: [number, number] // referencia clínica para cuando no hay back
  dir: 'sube' | 'baja' | 'ambas'
  organo: Organo
  capa: 'real' | 'self'
  experimental?: boolean
  link?: string
}

export const METRICAS: Def[] = [
  { id: 'hr', label: 'Heart rate', tipo: 'hr_reposo', unit: 'bpm', dec: 0, clin: [50, 100], dir: 'ambas', organo: 'corazon', capa: 'real', link: '/indicators/hr' },
  { id: 'hrv', label: 'HRV (stress)', tipo: 'hrv_rmssd', unit: 'ms', dec: 0, dir: 'baja', organo: 'corazon', capa: 'real', experimental: true, link: '/progress' },
  { id: 'resp', label: 'Breathing', tipo: 'resp_rpm', unit: 'resp/min', dec: 0, clin: [12, 20], dir: 'ambas', organo: 'pulmones', capa: 'real', experimental: true, link: '/progress' },
  { id: 'bp', label: 'Blood pressure', tipo: 'presion_sis', unit: 'mmHg', dec: 0, clin: [90, 140], dir: 'ambas', organo: 'corazon', capa: 'self', link: '/indicators/bp' },
  { id: 'sintomas', label: 'Symptoms', tipo: 'sintomas', unit: 'activos', dec: 0, clin: [0, 2.5], dir: 'sube', organo: 'inmune', capa: 'self', link: '/camera?paso=3' },
  { id: 'sleep', label: 'Sleep', tipo: 'sueno_horas', unit: 'h', dec: 1, clin: [6, 12], dir: 'baja', organo: 'ojos', capa: 'self', link: '/indicators/sleep' },
  { id: 'rt', label: 'Reaction', tipo: 'reaccion_ms', unit: 'ms', dec: 0, clin: [0, 350], dir: 'sube', organo: 'cerebro', capa: 'real', link: '/indicators/rt' },
  { id: 'mood', label: 'Mood', tipo: 'animo', unit: 'of 5', dec: 0, clin: [2.5, 5], dir: 'baja', organo: 'cerebro', capa: 'self', link: '/indicators/mood' },
  { id: 'stress', label: 'Stress', tipo: 'estres', unit: 'of 10', dec: 0, clin: [0, 7.5], dir: 'sube', organo: 'cerebro', capa: 'self', link: '/indicators/stress' },
  { id: 'expr', label: 'Expressiveness', tipo: 'expresividad', unit: 'out of 100', dec: 0, escala: 100, dir: 'ambas', organo: 'cerebro', capa: 'real', link: '/progress' },
]

export const ORGANOS: Record<Organo, { nombre: string; sistema: string; que: string }> = {
  cerebro: { nombre: 'Brain', sistema: 'Mental and cognitive', que: 'Reaction, mood, stress and expressiveness. Isolation and poor sleep show up here first' },
  ojos: { nombre: 'Eyes', sistema: 'Sleep', que: 'Hours of sleep. In orbit there are 16 sunrises a day and the sleep rhythm breaks down' },
  corazon: { nombre: 'Heart', sistema: 'Cardiovascular', que: 'Heart rate, variability and blood pressure. Without gravity fluids shift upward and the heart deconditions' },
  pulmones: { nombre: 'Lungs', sistema: 'Respiratory', que: 'Resting breaths per minute, measured with just the camera' },
  inmune: { nombre: 'Immune system', sistema: 'Immune', que: 'Reported symptoms. Radiation and stress weaken the immune system' },
}

// Sistema del motor que corresponde a cada órgano (status.sistemas)
const SISTEMA_ORGANO: Partial<Record<Organo, string>> = { corazon: 'cardio', ojos: 'sueno', cerebro: 'mental', inmune: 'inmune' }

export type Metrica = Def & {
  valor: number | null
  texto: string
  serie: number[]
  media: number | null
  n: number
  estado: Estado
  motivo: string
}

const ORDEN: Estado[] = ['none', 'ok', 'warn', 'crit']
export const peor = (a: Estado, b: Estado) => (ORDEN.indexOf(a) >= ORDEN.indexOf(b) ? a : b)

// Sin back solo hay el dato de hoy: se compara contra la referencia clínica
function evaluarLocal(d: Def, v: number): { estado: Estado; motivo: string } {
  if (!d.clin) return { estado: 'ok', motivo: 'No engine connection to compare it with your normal' }
  const [lo, hi] = d.clin
  const alto = d.dir !== 'baja' && v > hi
  const bajo = d.dir !== 'sube' && v < lo && lo > 0
  if (!alto && !bajo) return { estado: 'ok', motivo: 'Within the reference range' }
  const exceso = alto ? (v - hi) / (hi || 1) : (lo - v) / lo
  return { estado: exceso > 0.2 && !d.experimental ? 'crit' : 'warn', motivo: `Outside the reference range (${lo} to ${hi})` }
}

export function useSalud() {
  const statusReal = useAppStore((s) => s.statusReal)
  const status = useAppStore((s) => s.status)
  const indicadoresStore = useAppStore((s) => s.indicadores)
  const user = useSession((s) => s.user)
  const yo = astroNumero(user?.id) ?? 1
  const { camara, cognitivo, presion, registro } = useChequeoStore()
  const [extra, setExtra] = useState<Record<string, ServerIndicator>>({})
  const nMed = status.nMediciones ?? 0

  // El store ya trae algunas series; las que faltan (VFC, respiración, estrés, expresividad, diastólica) se piden aquí
  useEffect(() => {
    // Sin back no se pide nada: las series solo se usan cuando statusReal es verdadero
    if (!statusReal) return
    let vivo = true
    const faltan = [...METRICAS.map((m) => m.tipo), 'presion_dia'].filter((t) => !indicadoresStore[t])
    void Promise.all(faltan.map((t) => api.get<ServerIndicator>(`/indicators/${t}?astronauta_id=${yo}&range=mision`))).then((rs) => {
      if (!vivo) return
      const nuevo: Record<string, ServerIndicator> = {}
      rs.forEach((r, i) => {
        if (r) nuevo[faltan[i]] = r
      })
      setExtra(nuevo)
    })
    return () => {
      vivo = false
    }
  }, [statusReal, yo, nMed, indicadoresStore])

  return useMemo(() => {
    const inds = { ...extra, ...indicadoresStore }
    const sueno = registro?.sueno ? calcularSueno(registro.sueno).tstH : null
    const hoy: Record<string, number | null> = {
      hr_reposo: camara?.bpm ?? null,
      hrv_rmssd: camara?.hrv ?? null,
      resp_rpm: camara?.resp ?? null,
      presion_sis: presion && !('omitida' in presion) ? presion.sis : null,
      presion_dia: presion && !('omitida' in presion) ? presion.dia : null,
      sintomas: registro ? registro.sintomas.filter((s) => s.intensidad > 0).length : null,
      sueno_horas: sueno,
      reaccion_ms: cognitivo?.medianaMs ?? null,
      animo: registro?.animo ?? null,
      estres: registro?.estres ?? null,
      expresividad: camara?.expresion?.expresividad ?? null,
    }

    const metricas: Metrica[] = METRICAS.map((d) => {
      const esc = d.escala ?? 1
      const ind = statusReal ? inds[d.tipo] : undefined
      const serie = (ind?.serie ?? []).map((p) => p.valor * esc)
      let valor = serie.length ? serie[serie.length - 1] : null
      if (valor == null && hoy[d.tipo] != null) valor = (hoy[d.tipo] as number) * esc
      const lb = ind?.linea_base
      const media = lb && lb.media != null && lb.n >= 3 ? lb.media * esc : null
      let estado: Estado = 'none'
      let motivo = 'No data yet'
      if (valor != null) {
        if (ind && ind.estado !== 'sin_datos') {
          estado = SEM[ind.estado]
          const ult = ind.serie[ind.serie.length - 1]
          motivo =
            estado === 'ok'
              ? media == null ? 'Learning your normal' : 'Within your normal'
              : ult?.z != null ? `${ult.z > 0 ? 'Higher' : 'Lower'} than your normal (z ${ult.z.toFixed(1)})` : 'Outside your range'
        } else {
          ;({ estado, motivo } = evaluarLocal(d, valor))
        }
      }
      let texto = valor == null ? '--' : valor.toFixed(d.dec)
      if (d.id === 'bp' && valor != null) {
        const dia = inds.presion_dia?.serie.at(-1)?.valor ?? hoy.presion_dia
        if (dia != null) texto = `${Math.round(valor)}/${Math.round(dia)}`
      }
      return { ...d, valor, texto, serie: serie.slice(-12), media, n: lb?.n ?? 0, estado, motivo }
    })

    const organos = {} as Record<Organo, Estado>
    for (const o of Object.keys(ORGANOS) as Organo[]) {
      let e = metricas.filter((m) => m.organo === o).reduce<Estado>((acc, m) => peor(acc, m.estado), 'none')
      // Con back, el semáforo del sistema que calcula el motor también cuenta
      const sis = SISTEMA_ORGANO[o]
      if (statusReal && sis) {
        const s = status.sistemas.find((x) => x.id === sis)
        if (s) e = peor(e, s.estado as Estado)
      }
      organos[o] = e
    }
    return { metricas, organos }
  }, [extra, indicadoresStore, statusReal, status.sistemas, camara, cognitivo, presion, registro])
}

// Sexo de la ficha médica del astronauta en sesión: decide el cuerpo del escaneo, sin botón
export function useSexo(): 'F' | 'M' | '' {
  const statusReal = useAppStore((s) => s.statusReal)
  const user = useSession((s) => s.user)
  const yo = astroNumero(user?.id) ?? 1
  const [sexo, setSexo] = useState<'F' | 'M' | ''>('')
  useEffect(() => {
    if (!statusReal) return
    let vivo = true
    void api.get<{ sexo: 'F' | 'M' | 'otro' | '' }>(`/ficha/${yo}`).then((r) => {
      if (vivo) setSexo(r?.sexo === 'F' || r?.sexo === 'M' ? r.sexo : '')
    })
    return () => {
      vivo = false
    }
  }, [statusReal, yo])
  return sexo
}
