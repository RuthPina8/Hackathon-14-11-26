// Traduce lo que manda Back 2 (api/app/schemas/*) al formato que usan las pantallas.
// Los nombres del back están en español y con otra escala (prioridad 1 = más urgente,
// nivel amarilla/roja, estados atendida/escalada), aquí se convierten una sola vez.

import type { AlertFactor, AlertItem, Capa, QueueMessage, Semaforo, StatusMock } from '../store/mockData'

// ---------- formas del back ----------
export interface ServerAlert {
  id: number
  astronauta_id: number
  nivel: 'amarilla' | 'roja'
  senal: string
  que_cambio: string
  cuanto: string | null
  desde: string | null
  factores: Record<string, number>
  estado: 'activa' | 'atendida' | 'escalada' | 'resuelta'
  dia_mision: number | null
  creada: string
  actualizada: string
  mensaje_cola_id: number | null
}

export interface ServerAlertList { activas: ServerAlert[]; resueltas: ServerAlert[] }

export interface ServerQueueMessage {
  id: number
  prioridad: number
  tipo: string
  tamano: number
  payload: Record<string, unknown>
  estado: 'en_cola' | 'transmitiendo' | 'en_transito' | 'entregado'
  progreso: number
  eta_s: number | null
}

export interface ServerQueueState {
  entorno: string
  retraso_s: number
  ancho_banda_kbps: number
  mensajes: ServerQueueMessage[]
}

export interface ServerEnvironment { activo: string; disponibles: string[] }

export interface ServerDemo {
  dia: number
  corriendo: boolean
  segundos_por_dia: number
  fuente_datos: 'simulador_back1' | 'guion_back2'
}

export interface SeriePunto { dia: number; valor: number }
export interface ServerSimulation {
  entorno: string
  dia: number
  oseo: { perdida_pct: number; densidad_relativa: number; serie: SeriePunto[] }
  radiacion: { dosis_msv: number; limite_carrera_msv: number; pct_limite: number; serie: SeriePunto[] }
  retraso: { ida_s: number; ida_vuelta_s: number; texto: string }
  riesgo: { nivel: 'bajo' | 'medio' | 'alto'; puntaje: number; motivos: string[] }
}

export interface ServerStatus {
  astronauta_id: number
  readiness: number
  factores: { label: string; delta: number; peso: number }[]
  sistemas: Record<string, { estado: string; valor: string | null }>
  calibracion: number
  fase: 'tierra' | 'adaptacion' | 'personal'
  dia_mision: number
  n_mediciones: number
}

// ---------- señales ----------
interface InfoSenal { nombre: string; icono: AlertItem['icono']; capa: Capa; tareas: string[] }

const SENALES: Record<string, InfoSenal> = {
  hr_reposo: {
    nombre: 'Resting heart rate', icono: 'pulse', capa: 'real',
    tareas: ['Do the check-up at rest, 10 minutes after waking up', 'Check hydration and caffeine intake', 'Keep your exercise routine without increasing intensity'],
  },
  sueno_horas: {
    nombre: 'Hours of sleep', icono: 'moon', capa: 'self',
    tareas: ['Sleep at least 7 h tonight', 'Dim the module lights 1 h before bed', 'Avoid screens in the last hour of the day'],
  },
  perclos: {
    nombre: 'Visual fatigue', icono: 'eye', capa: 'real',
    tareas: ['Take a 20-minute break away from screens', 'Check the module lighting', 'Repeat the camera check-up after the break'],
  },
  presion_sis: {
    nombre: 'Systolic pressure', icono: 'heart', capa: 'self',
    tareas: ['Sit down and repeat the reading in 5 minutes', 'Avoid physical exertion in the meantime', 'Tell the commander if it stays high'],
  },
  presion_dia: {
    nombre: 'Diastolic pressure', icono: 'heart', capa: 'self',
    tareas: ['Sit down and repeat the reading in 5 minutes', 'Avoid physical exertion in the meantime', 'Tell the commander if it stays high'],
  },
  resp_rpm: {
    nombre: 'Breathing', icono: 'pulse', capa: 'real',
    tareas: ['Breathe calmly for 5 minutes and repeat the reading', 'Tell the commander if it persists'],
  },
  inmune: {
    nombre: 'Immune signals', icono: 'pulse', capa: 'self',
    tareas: ['Log your symptoms in the daily check-up', 'Rest and stay hydrated', 'Tell the commander if you get worse'],
  },
}

const TAREAS_GENERICAS = ['Repeat the reading at rest', 'Tell the commander if it persists']

const humanizar = (s: string) => {
  const t = s.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const nombreSenal = (s: string) => SENALES[s]?.nombre ?? humanizar(s)

function hace(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 1440) return `hace ${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} days ago`
}

// ---------- alertas ----------
export function adaptAlert(a: ServerAlert): AlertItem {
  const info = SENALES[a.senal]
  const nombre = nombreSenal(a.senal)
  const nivel: Semaforo = a.nivel === 'roja' ? 'crit' : 'warn'
  const factores: AlertFactor[] = Object.entries(a.factores ?? {})
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => ({ name: nombreSenal(k), w: Math.round(v), capa: SENALES[k]?.capa ?? 'real' }))
  const tareas = [...(info?.tareas ?? TAREAS_GENERICAS)]
  if (nivel === 'crit') tareas.push('Escalate the alert to Earth so the flight surgeon can review it')

  return {
    id: String(a.id),
    astro: a.astronauta_id,
    nivel,
    icono: info?.icono ?? 'pulse',
    titulo: nombre,
    resumen: a.que_cambio,
    cuando: a.dia_mision != null ? `day ${a.dia_mision}` : hace(a.actualizada),
    queCambio: a.que_cambio,
    cuanto: a.cuanto ?? 'No data on how much it changed',
    desde: a.desde
      ? `Since ${new Date(a.desde).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
      : a.dia_mision != null ? `Mission day ${a.dia_mision}` : 'A few minutes ago',
    factores: factores.length ? factores : [{ name: nombre, w: 100, capa: info?.capa ?? 'real' }],
    tareas,
    // "atendida" y "resuelta" ya no piden acción; "escalada" sigue abierta hasta que se resuelva
    estado: a.estado === 'activa' || a.estado === 'escalada' ? 'activa' : 'resuelta',
    escalada: a.estado === 'escalada' || a.mensaje_cola_id != null,
  }
}

// ---------- cola hacia Tierra ----------
export function adaptQueue(m: ServerQueueMessage): QueueMessage {
  const payload = m.payload ?? {}
  let name: string
  if (typeof payload.texto === 'string') name = payload.texto
  else if (m.tipo === 'alerta') name = `${payload.nivel === 'roja' ? 'Red' : 'Yellow'} alert, ${nombreSenal(String(payload.senal ?? 'signal')).toLowerCase()}`
  else if (m.tipo === 'reporte') name = 'Report'
  else name = humanizar(m.tipo)

  return {
    id: m.id,
    // el back usa 1 = más urgente, las pantallas 4 = crítica
    pri: Math.min(4, Math.max(1, 5 - m.prioridad)) as 1 | 2 | 3 | 4,
    name,
    kb: m.tamano,
    sent: m.estado === 'en_cola' ? 0 : m.tamano,
    arrive: null,
    server: { estado: m.estado, progreso: m.progreso, eta_s: m.eta_s, recibidoMs: Date.now(), payload },
  }
}

// ---------- estado general ----------
export const SEMAFORO_BACK: Record<string, Semaforo> = { verde: 'ok', amarillo: 'warn', rojo: 'crit', gris: 'none' }
export const SISTEMA_BACK: Record<string, string> = { sueno: 'sueno', cardiovascular: 'cardio', mental: 'mental', inmune: 'inmune', oseo: 'oseo' }

// "A3" -> 3 (el back identifica a los astronautas por número)
export const astroNumero = (id: string | undefined | null): number | null => {
  const n = Number((id ?? '').replace(/\D/g, ''))
  return Number.isInteger(n) && n > 0 ? n : null
}

// ---------- estado general (GET /status de Back 1) ----------
// Los sistemas que el back no calcula (el óseo es una proyección) se quedan como están.
export function adaptStatus(prev: StatusMock, s: ServerStatus): StatusMock {
  const sistemas = prev.sistemas.map((x) => {
    const clave = Object.keys(s.sistemas).find((k) => SISTEMA_BACK[k] === x.id)
    if (!clave) return x.id === 'oseo' ? x : { ...x, estado: 'none' as const, valor: 'no data', nota: undefined }
    const r = s.sistemas[clave]
    const estado = SEMAFORO_BACK[r.estado] ?? 'none'
    return { ...x, estado, valor: r.valor ?? 'no data', nota: undefined }
  })
  return {
    ...prev,
    readiness: s.readiness,
    factores: s.factores,
    sistemas,
    calibracion: s.calibracion,
    diaMision: s.dia_mision,
    diaBase: Math.min(s.dia_mision, prev.diasBase),
  }
}
