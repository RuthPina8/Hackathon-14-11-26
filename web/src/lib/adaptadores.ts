// Traductores entre el formato del back y el que usan las pantallas de Front 2.
// Así las pantallas no cambian y el back puede mandar sus propios nombres de campos.
import type { AlertaApi, ColaApi, EstadoApi, MensajeColaApi, SemaforoApi } from './api'
import type { AlertItem, Capa, EnvironmentId, QueueMessage, Semaforo, StatusMock } from '../store/mockData'

// ---------- señales ----------

const SENALES: Record<string, { titulo: string; icono: AlertItem['icono']; capa: Capa; tareas: string[] }> = {
  hr_reposo: {
    titulo: 'Ritmo en reposo fuera de tu normal', icono: 'pulse', capa: 'real',
    tareas: ['Repite el chequeo en reposo, sentado y sin hablar', 'Revisa hidratación y consumo de cafeína', 'Si se repite, avisa al comandante'],
  },
  perclos: {
    titulo: 'Fatiga visual alta', icono: 'eye', capa: 'real',
    tareas: ['Toma un descanso de 20 minutos lejos de pantallas', 'Revisa la iluminación del módulo', 'Evita tareas críticas o de precisión en las próximas 2 horas', 'Repite el chequeo después del descanso'],
  },
  presion_sis: {
    titulo: 'Presión arterial alta', icono: 'heart', capa: 'self',
    tareas: ['Siéntate y no hagas esfuerzo físico', 'Repite la medición en 5 minutos en el otro brazo', 'Si sigue alta, escala a Tierra'],
  },
  presion_dia: {
    titulo: 'Presión diastólica alta', icono: 'heart', capa: 'self',
    tareas: ['Siéntate y no hagas esfuerzo físico', 'Repite la medición en 5 minutos', 'Si sigue alta, escala a Tierra'],
  },
  reaccion_ms: {
    titulo: 'Reacción más lenta que tu normal', icono: 'eye', capa: 'real',
    tareas: ['Descansa antes de tareas de precisión', 'Revisa cuántas horas dormiste', 'Repite la prueba cognitiva más tarde'],
  },
  sueno_horas: {
    titulo: 'Pocas horas de sueño', icono: 'moon', capa: 'self',
    tareas: ['Ajusta la iluminación del módulo 1 h antes de dormir', 'Evita pantallas en la última hora del día'],
  },
  sintomas: {
    titulo: 'Síntomas que pueden indicar infección', icono: 'heart', capa: 'self',
    tareas: ['Tómate la temperatura', 'Lávate las manos y limita contacto cercano', 'Registra tus síntomas otra vez mañana'],
  },
  animo: {
    titulo: 'Ánimo más bajo que tu normal', icono: 'moon', capa: 'self',
    tareas: ['Habla con el comandante o con tu equipo de apoyo psicológico', 'Toma un descanso y revisa tu sueño'],
  },
  estres: {
    titulo: 'Estrés alto', icono: 'pulse', capa: 'self',
    tareas: ['Haz 5 minutos de respiración lenta', 'Revisa tu carga de trabajo con el comandante'],
  },
}

const NOMBRE_SENAL: Record<string, string> = {
  hr_reposo: 'Ritmo cardiaco', perclos: 'PERCLOS', presion_sis: 'Presión sistólica', presion_dia: 'Presión diastólica',
  reaccion_ms: 'Tiempo de reacción', lapsos: 'Lapsos de atención', sueno_horas: 'Horas de sueño', animo: 'Ánimo reportado',
  estres: 'Estrés', sintomas: 'Síntomas', parpadeo_min: 'Parpadeos por minuto',
}

const capaDe = (senal: string): Capa => SENALES[senal]?.capa ?? (['presion_sis', 'presion_dia', 'animo', 'estres', 'sintomas', 'sueno_horas'].includes(senal) ? 'self' : 'real')

function haceCuanto(iso: string | null): string {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

export function adaptarAlerta(a: AlertaApi): AlertItem {
  const info = SENALES[a.senal]
  const factores = Object.entries(a.factores ?? {}).map(([senal, w]) => ({
    name: NOMBRE_SENAL[senal] ?? senal,
    w: Math.round(w <= 1 ? w * 100 : w),
    capa: capaDe(senal),
  }))
  return {
    id: String(a.id),
    nivel: a.nivel === 'roja' ? 'crit' : 'warn',
    icono: info?.icono ?? 'pulse',
    titulo: info?.titulo ?? `Cambio en ${NOMBRE_SENAL[a.senal] ?? a.senal}`,
    resumen: a.que_cambio,
    cuando: haceCuanto(a.creada),
    queCambio: a.que_cambio,
    cuanto: a.cuanto ?? (a.detectores.length ? `Detectado por ${a.detectores.join(', ')}` : ''),
    desde: a.desde ? `Desde ${haceCuanto(a.desde)}` : `Detectado ${haceCuanto(a.creada)}`,
    factores: factores.length ? factores : [{ name: NOMBRE_SENAL[a.senal] ?? a.senal, w: 100, capa: capaDe(a.senal) }],
    tareas: info?.tareas ?? ['Repite la medición', 'Si se repite, escala a Tierra'],
    estado: a.estado === 'atendida' || a.estado === 'resuelta' ? 'resuelta' : 'activa',
  }
}

// ---------- cola hacia Tierra ----------

export function adaptarMensaje(m: MensajeColaApi, minutoActual: number): QueueMessage {
  const titulo = typeof m.payload?.titulo === 'string' ? m.payload.titulo : typeof m.payload?.que_cambio === 'string' ? `Alerta, ${m.payload.que_cambio}` : `${m.tipo[0]?.toUpperCase() ?? ''}${m.tipo.slice(1)} #${m.id}`
  const enviado = m.estado === 'en_cola' ? 0 : m.estado === 'transmitiendo' ? m.progreso * m.tamano : m.tamano
  const llega = m.estado === 'entregado' ? minutoActual - 1 : m.estado === 'en_transito' ? minutoActual + (m.eta_s ?? 0) / 60 : null
  return {
    id: 10_000 + m.id, // separado de los ids de ejemplo
    pri: Math.min(4, Math.max(1, 5 - m.prioridad)) as QueueMessage['pri'],
    name: titulo,
    kb: m.tamano,
    sent: enviado,
    arrive: llega,
  }
}

export const adaptarCola = (c: ColaApi, minutoActual: number) => c.mensajes.map((m) => adaptarMensaje(m, minutoActual))

// ---------- entorno ----------

const ENTORNO_A_API: Partial<Record<EnvironmentId, string>> = { estacion: 'iss', nave: 'nave' }
export const entornoApi = (id: EnvironmentId) => ENTORNO_A_API[id] ?? null
export function entornoFront(id: string): EnvironmentId | null {
  if (id === 'iss') return 'estacion'
  if (id === 'nave' || id === 'marte') return 'nave'
  return null
}

// ---------- estado general ----------

const SEMAFORO: Record<SemaforoApi, Semaforo> = { verde: 'ok', amarillo: 'warn', rojo: 'crit', sin_datos: 'none' }
// El back nombra los sistemas de una forma y Front 2 de otra
const SISTEMA: Record<string, string> = { cardiovascular: 'cardio', cardio: 'cardio', sueno: 'sueno', mental: 'mental', inmune: 'inmune' }

type SistemaParcial = { estado?: SemaforoApi | string; valor?: string | null } | SemaforoApi | string

// Acepta el /status completo de Back 1 o los avisos parciales del guion de la demo
export function adaptarEstado(actual: StatusMock, datos: Partial<EstadoApi> & { sistemas?: Record<string, SistemaParcial> }): StatusMock {
  const sistemas = actual.sistemas.map((s) => {
    const entrada = Object.entries(datos.sistemas ?? {}).find(([k]) => SISTEMA[k] === s.id)?.[1]
    if (!entrada) return s
    const estado = typeof entrada === 'string' ? entrada : entrada.estado
    const valor = typeof entrada === 'string' ? null : entrada.valor
    return {
      ...s,
      estado: SEMAFORO[estado as SemaforoApi] ?? s.estado,
      valor: valor ?? (estado === 'sin_datos' ? 'sin datos' : s.valor),
      nota: undefined,
    }
  })
  const calib = datos.calibracion
  return {
    ...actual,
    readiness: typeof datos.readiness === 'number' ? Math.round(datos.readiness) : actual.readiness,
    factores: Array.isArray(datos.factores) ? datos.factores : actual.factores,
    calibracion: typeof calib === 'number' ? Math.round(calib <= 1 ? calib * 100 : calib) : actual.calibracion,
    diaMision: typeof datos.dia_mision === 'number' ? datos.dia_mision : actual.diaMision,
    sistemas,
  }
}
