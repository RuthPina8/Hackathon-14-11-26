// Formas que manda el motor de Back 1 (/status, /indicators, /crew, /measurements) y su
// traducción al formato de las pantallas. Todo lo que muestre "tu normal" sale de aquí.

import type { CrewMember, Semaforo, StatusMock, SystemMetric, SystemStatus } from '../store/mockData'

export type SemaforoBack = 'verde' | 'amarillo' | 'rojo' | 'sin_datos'

export interface ServerStatus {
  astronauta_id: number
  readiness: number
  factores: { label: string; delta: number; peso: number }[]
  sistemas: Record<string, { estado: SemaforoBack; valor: string | null }>
  calibracion: number
  fase: 'tierra' | 'adaptacion' | 'personal'
  dia_mision: number
  n_mediciones: number
  racha: number
  dato_demo: boolean
  inmune: { estado: SemaforoBack; puntaje: number; motivo: string; dia_desde: number | null } | null
  animo_camara: {
    estado: 'aprendiendo' | 'activo'; acierto_pct: number | null; mae: number | null; n: number
    explicacion: string | null; estimado_hoy: number | null
  } | null
}

export interface ServerPunto {
  fecha: string; valor: number; capa: 'real' | 'auto' | 'sim'; fuente: string; confianza: number
  dia_mision: number | null; z: number | null; anomalo: boolean
}

export interface ServerIndicator {
  tipo: string
  nombre: string
  unidad: string
  serie: ServerPunto[]
  linea_base: { media: number | null; desviacion: number | null; n: number; peso_personal: number; congelada: boolean }
  rango_clinico: [number, number] | null
  rango_atencion: [number, number] | null
  anomalias: { fecha: string; valor: number; z: number | null; motivo: string | null; dia_mision: number | null }[]
  estado: SemaforoBack
  alerta_id: number | null
  desde: string | null
  experimental: boolean
  dato_demo: boolean
}

export interface ServerCrewMember {
  astronauta_id: number; nombre: string; rol: string; estado: SemaforoBack; readiness: number | null
  ultimo: string | null; ultimo_dia: number | null; ritmo: string | null; perclos: string | null; presion: string | null; animo: string | null
  alertas_activas: number; dato_demo: boolean
}

export interface MedicionEnvio {
  astronauta_id: number
  tipo: string
  valor: number
  unidad: string
  capa: 'real' | 'auto' | 'sim'
  fuente: 'camara' | 'prueba' | 'manual' | 'apple_watch'
  confianza: number
  fecha?: string
  dia_mision?: number | null
  detalle?: Record<string, unknown>
}

export interface GuardadoOut { guardadas: number; alerta_id: number | null }

export const SEM: Record<SemaforoBack, Semaforo> = { verde: 'ok', amarillo: 'warn', rojo: 'crit', sin_datos: 'none' }

// Sistemas del back -> ids de las pantallas
const SISTEMAS: { id: string; back: string; nombre: string; href: string }[] = [
  { id: 'cardio', back: 'cardiovascular', nombre: 'Cardiovascular', href: '/indicators/hr' },
  { id: 'sueno', back: 'sueno', nombre: 'Sleep', href: '/indicators/sleep' },
  { id: 'mental', back: 'mental', nombre: 'Mental and cognitive', href: '/indicators/rt' },
  { id: 'inmune', back: 'inmune', nombre: 'Immune', href: '/camera?paso=4' },
]

// Palabras con que el motor nombra las señales de cada sistema en sus factores (readiness.py, NOMBRES)
const PALABRAS: Record<string, string[]> = {
  cardio: ['ritmo', 'presión', 'vfc', 'respiración', 'heart', 'pressure', 'hrv', 'breathing'],
  sueno: ['perclos', 'fatiga', 'sueño', 'dormiste', 'parpadeo', 'fatigue', 'sleep', 'slept', 'blink'],
  mental: ['reacción', 'lapsos', 'ánimo', 'estrés', 'expresividad', 'reaction', 'lapses', 'mood', 'stress', 'expressiveness'],
}

// Señales que alimentan el explorador del cuerpo (mini gráficas de cada sistema)
export const METRICAS_SISTEMA: Record<string, { tipo: string; label: string; fmt: (v: number) => string }[]> = {
  cardio: [
    { tipo: 'hr_reposo', label: 'Resting heart rate', fmt: (v) => `${Math.round(v)} bpm` },
    { tipo: 'presion_sis', label: 'Systolic pressure', fmt: (v) => `${Math.round(v)} mmHg` },
  ],
  sueno: [
    { tipo: 'sueno_horas', label: 'Hours of sleep', fmt: (v) => `${v.toFixed(1)} h` },
  ],
  mental: [
    { tipo: 'reaccion_ms', label: 'Reaction time', fmt: (v) => `${Math.round(v)} ms` },
    { tipo: 'animo', label: 'Mood', fmt: (v) => `${v.toFixed(0)} of 5` },
  ],
  inmune: [{ tipo: 'sintomas', label: 'Reported symptoms', fmt: (v) => (v === 0 ? 'none' : `${v.toFixed(0)}`) }],
}

export const TIPOS_METRICAS = [...new Set(Object.values(METRICAS_SISTEMA).flat().map((m) => m.tipo))]

const fmtNormal = (ind: ServerIndicator, fmt: (v: number) => string) => {
  const { media, desviacion, n } = ind.linea_base
  if (media === null || n < 3) return 'aprendiendo'
  return desviacion ? `${fmt(media)} ± ${fmt(desviacion).replace(/[^\d.]/g, '')}` : fmt(media)
}

export function metricasDeSistema(id: string, inds: Record<string, ServerIndicator>): SystemMetric[] | undefined {
  const defs = METRICAS_SISTEMA[id]
  if (!defs) return undefined
  const out: SystemMetric[] = []
  for (const d of defs) {
    const ind = inds[d.tipo]
    const pts = ind?.serie.filter((p) => p.fuente !== 'modelo') ?? []
    if (!ind || pts.length === 0) {
      out.push({ label: d.label, value: 'no data', base: 'no data', estado: 'none', serie: [] })
      continue
    }
    const ult = pts[pts.length - 1]
    out.push({
      label: d.label,
      value: d.fmt(ult.valor),
      base: fmtNormal(ind, d.fmt),
      estado: SEM[ind.estado],
      serie: pts.slice(-7).map((p) => p.valor),
    })
  }
  return out
}

// /status del back -> estado de la pantalla de Inicio
export function adaptStatus(s: ServerStatus, prev: StatusMock, inds: Record<string, ServerIndicator>): StatusMock {
  const sistemas: SystemStatus[] = SISTEMAS.map((x) => {
    const b = s.sistemas[x.back]
    const estado = SEM[b?.estado ?? 'sin_datos']
    let nota: string | undefined
    if (x.id === 'inmune') {
      nota = s.inmune ? s.inmune.motivo : 'No symptoms logged yet. Log them in the daily check-up'
    } else if (estado === 'none') {
      nota = 'No measurements yet. Do your daily check-up so it can be computed'
    } else {
      const claves = PALABRAS[x.id] ?? []
      const fs = s.factores.filter((f) => claves.some((k) => f.label.toLowerCase().includes(k)))
      nota = fs.length ? fs.map((f) => f.label).join('. ') : estado === 'ok' ? 'Today’s signals are within your normal' : undefined
    }
    return {
      id: x.id, nombre: x.nombre, estado, href: x.href, nota,
      valor: b?.valor ?? (x.id === 'inmune' ? 'no data' : 'no data'),
      metricas: metricasDeSistema(x.id, inds),
      demo: s.dato_demo,
    }
  })
  const oseo = prev.sistemas.find((x) => x.id === 'oseo')
  if (oseo) sistemas.push(oseo)

  const diasFase = 14
  return {
    readiness: s.readiness,
    // "ayer" = la lectura anterior del motor; si lo anterior eran ejemplos, no hay
    ayer: !prev.nMediciones ? null : s.readiness !== prev.readiness ? prev.readiness : prev.ayer,
    factores: s.factores,
    sistemas,
    calibracion: s.calibracion,
    diaBase: Math.min(s.dia_mision, diasFase),
    diasBase: diasFase,
    racha: s.racha,
    diaMision: s.dia_mision,
    fase: s.fase,
    nMediciones: s.n_mediciones,
    datoDemo: s.dato_demo,
    animoCamara: s.animo_camara,
    inmune: s.inmune,
  }
}

const hace = (iso: string | null) => {
  if (!iso) return 'no check-up'
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 1440) return `hace ${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} days ago`
}

export function adaptCrew(list: ServerCrewMember[], prev: CrewMember[]): CrewMember[] {
  return list.map((c) => {
    const id = `A${c.astronauta_id}`
    const p = prev.find((x) => x.id === id)
    return {
      id,
      nombre: c.nombre,
      rol: p?.rol ?? c.rol,
      estado: SEM[c.estado],
      // Los datos del simulador tienen fechas sintéticas: se muestra su día de misión
      ultimo: c.dato_demo && c.ultimo_dia != null ? `mission day ${c.ultimo_dia}` : hace(c.ultimo),
      ritmo: c.ritmo ?? 'no data',
      perclos: c.perclos ?? 'no data',
      presion: c.presion ?? 'no data',
      animo: c.animo ?? 'no data',
      alertas: c.alertas_activas,
      demo: c.dato_demo,
    }
  })
}

// ---------- ficha médica, evolución y confiabilidad (routers/clinico.py) ----------

export interface Basales {
  hr_reposo: number | null; presion_sis: number | null; presion_dia: number | null; reaccion_ms: number | null
  sueno_horas: number | null; hrv_rmssd: number | null; peso_kg: number | null; spo2_pct: number | null
}

export interface FichaMedica {
  astronauta_id: number
  nombre: string
  fecha_nacimiento: string | null
  sexo: 'F' | 'M' | 'otro' | ''
  estatura_cm: number | null
  tipo_sangre: '' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
  alergias: string[]
  medicamentos: string[]
  condiciones: string[]
  cirugias: string[]
  vacunas: string[]
  basales: Basales
  fecha_evaluacion: string | null
  medico: string
  notas: string
  actualizada: string | null
}

export interface ItemEvolucion {
  tipo: string; nombre: string; unidad: string
  ficha: number | null; inicio: number | null; reciente: number | null
  referencia: 'ficha' | 'inicio' | 'ninguna'
  cambio: number | null; cambio_pct: number | null; tendencia_semana: number | null
  estado: 'mejora' | 'estable' | 'empeora' | 'sin_datos'
  explicacion: string; n: number; serie: { dia: number; valor: number }[]
}

export interface Evolucion { astronauta_id: number; tiene_ficha: boolean; dias_con_datos: number; resumen: string; items: ItemEvolucion[] }

export interface MetricasValidacion {
  n: number; mae: number | null; rmse: number | null; sesgo: number | null
  loa: [number, number] | null; pearson: number | null; exito_5: number | null
}

export interface ParValidacion {
  id: number; camara: number; referencia: number; confianza: number; origen: string
  astronauta_id: number | null; fuente_referencia: string | null; fecha: string | null
}

export interface Confiabilidad {
  estado: 'sin_validar' | 'validando' | 'verificado'
  explicacion: string
  umbral: number | null
  tolerancia_lpm: number
  objetivo: number
  global: MetricasValidacion
  sobre_umbral: MetricasValidacion | null
  por_origen: Record<string, MetricasValidacion>
  tramos: { desde: number; n: number; mae: number | null; exito_5: number | null }[]
  referencia_publicada: { metodo: string; mae_lpm: [number, number]; bases: string[]; nota: string }
  pares: ParValidacion[]
}
