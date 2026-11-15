// Traduce lo que manda Back 2 (api/app/schemas/*) al formato que usan las pantallas.
// Los nombres del back están en español y con otra escala (prioridad 1 = más urgente,
// nivel amarilla/roja, estados atendida/escalada), aquí se convierten una sola vez.

import type { AlertFactor, AlertItem, Capa, QueueMessage, Semaforo } from '../store/mockData'

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

// ---------- señales ----------
interface InfoSenal { nombre: string; icono: AlertItem['icono']; capa: Capa; tareas: string[] }

const SENALES: Record<string, InfoSenal> = {
  hr_reposo: {
    nombre: 'Ritmo en reposo', icono: 'pulse', capa: 'real',
    tareas: ['Haz el chequeo en reposo, 10 minutos después de despertar', 'Revisa hidratación y consumo de cafeína', 'Mantén la rutina de ejercicio sin aumentar la intensidad'],
  },
  sueno_horas: {
    nombre: 'Horas de sueño', icono: 'moon', capa: 'self',
    tareas: ['Duerme al menos 7 h esta noche', 'Baja la luz del módulo 1 h antes de dormir', 'Evita pantallas en la última hora del día'],
  },
  perclos: {
    nombre: 'Fatiga visual', icono: 'eye', capa: 'real',
    tareas: ['Toma un descanso de 20 minutos lejos de pantallas', 'Revisa la iluminación del módulo', 'Repite el chequeo con cámara después del descanso'],
  },
  presion_sis: {
    nombre: 'Presión sistólica', icono: 'heart', capa: 'self',
    tareas: ['Siéntate y repite la medición en 5 minutos', 'Evita el esfuerzo físico mientras tanto', 'Avisa al comandante si sigue alta'],
  },
  presion_dia: {
    nombre: 'Presión diastólica', icono: 'heart', capa: 'self',
    tareas: ['Siéntate y repite la medición en 5 minutos', 'Evita el esfuerzo físico mientras tanto', 'Avisa al comandante si sigue alta'],
  },
  resp_rpm: {
    nombre: 'Respiración', icono: 'pulse', capa: 'real',
    tareas: ['Respira con calma 5 minutos y repite la medición', 'Avisa al comandante si persiste'],
  },
  inmune: {
    nombre: 'Señales inmunes', icono: 'pulse', capa: 'self',
    tareas: ['Anota tus síntomas en el chequeo diario', 'Descansa y mantente hidratado', 'Avisa al comandante si empeoras'],
  },
}

const TAREAS_GENERICAS = ['Repite la medición en reposo', 'Avisa al comandante si persiste']

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
  return `hace ${Math.round(min / 1440)} días`
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
  if (nivel === 'crit') tareas.push('Escala la alerta a Tierra para que el flight surgeon la revise')

  return {
    id: String(a.id),
    astro: a.astronauta_id,
    nivel,
    icono: info?.icono ?? 'pulse',
    titulo: nombre,
    resumen: a.que_cambio,
    cuando: a.dia_mision != null ? `día ${a.dia_mision}` : hace(a.actualizada),
    queCambio: a.que_cambio,
    cuanto: a.cuanto ?? 'Sin dato de cuánto cambió',
    desde: a.desde
      ? `Desde el ${new Date(a.desde).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`
      : a.dia_mision != null ? `Día ${a.dia_mision} de la misión` : 'Hace unos minutos',
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
  else if (m.tipo === 'alerta') name = `Alerta ${payload.nivel === 'roja' ? 'roja' : 'amarilla'}, ${nombreSenal(String(payload.senal ?? 'señal')).toLowerCase()}`
  else if (m.tipo === 'reporte') name = 'Reporte'
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
