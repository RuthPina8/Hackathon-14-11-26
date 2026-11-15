import { create } from 'zustand'
import {
  mockStatus, mockAlerts, mockQueue, mockCrew,
  type StatusMock, type AlertItem, type QueueMessage, type CrewMember, type EnvironmentId,
} from './mockData'
import { api, type AlertaApi, type EntornoApi, type EstadoApi, type MensajeColaApi } from '../lib/api'
import { adaptarAlerta, adaptarCola, adaptarEstado, adaptarMensaje, entornoApi, entornoFront } from '../lib/adaptadores'

// Estado global de Front 2. Arranca con los mocks del rediseño v2 y se actualiza
// con los eventos del WebSocket (lib/ws.ts): measurement_added, status_changed,
// calibration_changed, alert_raised, queue_updated.

export type ConnectionState = 'mock' | 'connecting' | 'connected' | 'disconnected'
export type DemoSpeed = 1 | 10 | 60

// Parámetros del enlace con Tierra (pantalla 9)
export const LINK = { WINDOW_MIN: 45, DELAY_MIN: 15, KB_PER_MIN: 1.5 }

// ---------- Modo demo ----------
// Apagado: la app se ve como sería la real (reloj a velocidad normal, sin controles de simulación).
// Encendido: aparece la barra de demo (velocidad, alerta roja, reiniciar) para presentar al jurado.
// Se activa con el interruptor del menú o abriendo la app con ?demo=1, y se recuerda en este navegador.
function initialDemo(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('demo')
    if (q === '1') { localStorage.setItem('astro_demo', '1'); return true }
    if (q === '0') { localStorage.setItem('astro_demo', '0'); return false }
    return localStorage.getItem('astro_demo') === '1'
  } catch {
    return false
  }
}

const redAlert = (n: number): AlertItem => ({
  id: `demo-red-${n}`, nivel: 'crit', icono: 'heart', titulo: 'Presión arterial muy alta', resumen: '168/104 mmHg, tu normal es 117/75', cuando: 'ahora',
  queCambio: 'Presión 168/104 mmHg, tu normal es 117/75', cuanto: '+51 mmHg sistólica, arriba del rango clínico', desde: 'Medición de hace 2 minutos, confirmada 2 veces',
  factores: [{ name: 'Presión sistólica', w: 70, capa: 'self' }, { name: 'Ritmo cardiaco', w: 20, capa: 'real' }, { name: 'Dolor de cabeza', w: 10, capa: 'self' }],
  tareas: ['Siéntate y no hagas esfuerzo físico', 'Repite la medición en 5 minutos en el otro brazo', 'Avisa al comandante, ya se envió un aviso a Tierra con prioridad crítica', 'Ten listo el kit médico por si Tierra indica medicación'],
  estado: 'activa',
})

interface AppState {
  status: StatusMock
  alerts: AlertItem[]
  queue: QueueMessage[]
  queueT: number // minutos de misión transcurridos en esta sesión
  crew: CrewMember[]
  environment: EnvironmentId
  connection: ConnectionState
  watch: 'idle' | 'busy' | 'on'
  demo: boolean
  demoSpeed: DemoSpeed
  redCount: number

  setEnvironment: (env: EnvironmentId) => void
  setConnection: (c: ConnectionState) => void
  resolveAlert: (id: string) => void
  escalateAlert: (id: string) => void
  advanceQueue: (minutes: number) => void
  prioritizePacket: (id: number) => void
  connectWatch: () => void
  disconnectWatch: () => void
  setDemo: (on: boolean) => void
  setDemoSpeed: (s: DemoSpeed) => void
  simulateRedAlert: () => void
  resetDemo: () => void
  applyServerEvent: (event: string, data: unknown) => void
  // Trae del back el estado real (alertas, cola, entorno, estado general) al conectarse
  syncFromApi: () => Promise<void>
}

const esIdDelBack = (id: string) => /^\d+$/.test(id)

const nextQueueId = (q: QueueMessage[]) => Math.max(0, ...q.map((x) => x.id)) + 1

export const useAppStore = create<AppState>((set, get) => ({
  status: mockStatus,
  alerts: mockAlerts,
  queue: mockQueue,
  queueT: 0,
  crew: mockCrew,
  environment: 'nave',
  connection: 'mock',
  watch: 'idle',
  demo: initialDemo(),
  demoSpeed: 10,
  redCount: 0,

  setEnvironment: (environment) => {
    set({ environment })
    const id = entornoApi(environment)
    if (id && get().connection === 'connected') void api.cambiarEntorno(id)
  },
  setConnection: (connection) => set({ connection }),

  // POST /alerts/{id}/ack en el back (descongela la línea base); se marca al instante en pantalla
  resolveAlert: (id) => {
    set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, estado: 'resuelta' } : a)) }))
    if (esIdDelBack(id) && get().connection === 'connected') void api.atenderAlerta(Number(id))
  },

  // POST /alerts/{id}/escalate en el back: el back encola el paquete y avisa por queue_updated.
  // Sin back (o con alertas de ejemplo), se encola aquí mismo.
  escalateAlert: (id) => {
    if (esIdDelBack(id) && get().connection === 'connected') {
      void api.escalarAlerta(Number(id))
      return
    }
    set((s) => {
      const a = s.alerts.find((x) => x.id === id)
      const pri = a?.nivel === 'crit' ? 4 : 3
      return { queue: [{ id: nextQueueId(s.queue), pri, name: `Alerta escalada, ${a?.titulo.toLowerCase() ?? 'alerta'}`, kb: 2.2, sent: 0, arrive: null }, ...s.queue] }
    })
  },

  // Reloj de misión: envía por prioridad con el ancho de banda disponible;
  // cada paquete completo tarda DELAY_MIN en llegar a Tierra.
  // TODO Back 2: en la app real esto lo calcula el back y llega por queue_updated.
  advanceQueue: (minutes) => {
    const { queue, queueT } = get()
    const t = queueT + minutes
    const q = queue.map((x) => ({ ...x }))
    let budget = LINK.KB_PER_MIN * minutes * (t >= LINK.WINDOW_MIN ? 4 : 1)
    const order = q
      .filter((x) => x.sent < x.kb && (!x.big || t >= LINK.WINDOW_MIN))
      .sort((a, b) => Number(!!b.boost) - Number(!!a.boost) || b.pri - a.pri || a.id - b.id)
    for (const x of order) {
      if (budget <= 0) break
      const use = Math.min(x.kb - x.sent, budget)
      x.sent += use
      budget -= use
      if (x.sent >= x.kb - 0.001) { x.sent = x.kb; x.arrive = t + LINK.DELAY_MIN }
    }
    set({ queue: q, queueT: t })
  },

  // Acción real del astronauta: "Enviar primero"
  prioritizePacket: (id) =>
    set((s) => ({ queue: s.queue.map((x) => (x.id === id ? { ...x, boost: true, big: false } : x)) })),

  connectWatch: () => {
    set({ watch: 'busy' })
    setTimeout(() => set({ watch: 'on' }), 1400)
  },
  disconnectWatch: () => set({ watch: 'idle' }),

  setDemo: (demo) => {
    try { localStorage.setItem('astro_demo', demo ? '1' : '0') } catch { /* sin storage */ }
    set({ demo })
    // Con el back conectado, el modo demo también arranca el guion de Back 2 (avanza días y manda eventos)
    if (get().connection === 'connected') void (demo ? api.demoIniciar() : api.demoDetener())
  },
  setDemoSpeed: (demoSpeed) => set({ demoSpeed }),

  // Demo: dispara una alerta roja completa, aparece en Inicio y Alertas,
  // baja el estado general y su paquete crítico se salta la cola hacia Tierra.
  simulateRedAlert: () =>
    set((s) => {
      const n = s.redCount + 1
      const alert = redAlert(n)
      return {
        redCount: n,
        alerts: [alert, ...s.alerts],
        queue: [{ id: nextQueueId(s.queue), pri: 4, name: 'ALERTA ROJA, presión muy alta', kb: 1.2, sent: 0, arrive: null }, ...s.queue],
        status: {
          ...s.status,
          readiness: Math.min(s.status.readiness, 58),
          factores: [{ label: 'Presión arterial muy alta', delta: -24, peso: 100 }, ...s.status.factores.filter((f) => f.label !== 'Presión arterial muy alta')],
          sistemas: s.status.sistemas.map((x) => (x.id === 'cardio' ? { ...x, estado: 'crit', valor: '168/104', nota: 'Presión de 168/104 mmHg hace 2 minutos, confirmada 2 veces. Ya se mandó un aviso crítico a Tierra' } : x)),
        },
      }
    }),

  resetDemo: () => {
    if (get().connection === 'connected') {
      set({ queueT: 0, redCount: 0, watch: 'idle' })
      void api.demoReiniciar().then(() => get().syncFromApi())
      return
    }
    set({ status: mockStatus, alerts: mockAlerts, queue: mockQueue, queueT: 0, redCount: 0, watch: 'idle' })
  },

  syncFromApi: async () => {
    const [alertas, cola, entorno, estado] = await Promise.all([api.alertas(), api.cola(), api.entorno(), api.estado()])
    const cambios: Partial<AppState> = {}
    if (alertas) cambios.alerts = [...alertas.activas, ...alertas.resueltas].map(adaptarAlerta)
    if (cola) cambios.queue = adaptarCola(cola, get().queueT)
    if (entorno) {
      const env = entornoFront(entorno.activo)
      if (env) cambios.environment = env
    }
    if (estado) cambios.status = adaptarEstado(get().status, estado)
    set(cambios)
  },

  // Punto único de entrada de los eventos del WebSocket (sección 4 del documento).
  // Los datos del back se traducen con lib/adaptadores; los de la demo local ya vienen en formato de pantalla.
  applyServerEvent: (event, data) => {
    const d = data as Record<string, unknown>
    switch (event) {
      case 'status_changed':
        set((s) => ({ status: adaptarEstado(s.status, d as Partial<EstadoApi>) }))
        break
      case 'calibration_changed': {
        const c = Number(d.calibracion)
        if (!Number.isNaN(c)) set((s) => ({ status: { ...s.status, calibracion: Math.round(c <= 1 ? c * 100 : c) } }))
        break
      }
      case 'alert_raised':
      case 'alert_updated': {
        const alerta = 'senal' in d ? adaptarAlerta(d as unknown as AlertaApi) : (d as unknown as AlertItem)
        set((s) => ({ alerts: [alerta, ...s.alerts.filter((a) => a.id !== alerta.id)] }))
        break
      }
      case 'queue_updated': {
        const msg = 'prioridad' in d ? adaptarMensaje(d as unknown as MensajeColaApi, get().queueT) : (d as unknown as QueueMessage)
        set((s) => ({
          queue: s.queue.some((q) => q.id === msg.id) ? s.queue.map((q) => (q.id === msg.id ? msg : q)) : [msg, ...s.queue],
        }))
        break
      }
      case 'environment_changed': {
        const env = entornoFront((d as unknown as EntornoApi).activo ?? '')
        if (env) set({ environment: env })
        break
      }
      case 'measurement_added':
      case 'demo_tick':
      case 'pong':
        break
      default:
        console.warn('[ws] evento no manejado:', event, data)
    }
  },
}))
