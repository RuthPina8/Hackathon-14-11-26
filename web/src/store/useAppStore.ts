import { create } from 'zustand'
import {
  mockStatus, mockAlerts, mockQueue, mockCrew,
  isEnvironmentId,
  type StatusMock, type AlertItem, type QueueMessage, type CrewMember, type EnvironmentId,
} from './mockData'
import { api } from '../lib/api'
import {
  adaptAlert, adaptQueue, adaptStatus, astroNumero, SEMAFORO_BACK, SISTEMA_BACK,
  type ServerStatus, type ServerAlert, type ServerAlertList, type ServerDemo, type ServerEnvironment, type ServerQueueMessage, type ServerQueueState,
} from '../lib/adapters'
import { useSession } from './useSession'

// Estado global de Front 2. Arranca con los mocks del rediseño v2 y se actualiza
// con los eventos del WebSocket (lib/ws.ts): measurement_added, status_changed,
// calibration_changed, alert_raised, alert_updated, queue_updated, environment_changed, demo_tick.
// Con el back de Back 2 conectado (server = true), alertas y cola salen de él;
// si no responde, todo sigue con los datos de ejemplo.

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
  server: boolean // true cuando alertas y cola vienen del back
  statusReal: boolean // true cuando el estado, la línea base y los indicadores vienen del motor de Back 1 (hoy son ejemplos)
  link: { retraso_s: number; ancho_banda_kbps: number } | null // enlace con Tierra del entorno activo
  serverDemo: ServerDemo | null // reloj de misión del back (día, si corre)

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
  applyCameraResult: (r: { bpm: number | null; confianza: number; perclos: number | null }) => void
  applyServerEvent: (event: string, data: unknown) => void
  loadFromServer: () => Promise<void>
  syncFromApi: () => Promise<void> // vuelve a leer todo del back (lo usa el resumen del chequeo después de guardar)
  demoStart: () => void
  demoStop: () => void
  demoAdvance: (dias?: number) => void
}

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
  server: false,
  statusReal: false,
  link: null,
  serverDemo: null,

  setEnvironment: (environment) => {
    set({ environment })
    if (get().server) void api.put('/environment', { id: environment })
  },
  setConnection: (connection) => set({ connection }),

  // Primera carga desde Back 2: alertas, cola, entorno y reloj de la demo.
  // Si el back no contesta no se toca nada y la app sigue con los ejemplos.
  loadFromServer: async () => {
    const yo = astroNumero(useSession.getState().user?.id) ?? 1
    const [alertas, cola, entorno, demo, estado] = await Promise.all([
      api.get<ServerAlertList>('/alerts'),
      api.get<ServerQueueState>('/queue'),
      api.get<ServerEnvironment>('/environment'),
      api.get<ServerDemo>('/demo'),
      api.get<ServerStatus>(`/status?astronauta_id=${yo}`),
    ])
    if (!alertas && !cola) return
    set((s) => ({
      server: true,
      alerts: alertas ? [...alertas.activas, ...alertas.resueltas].map(adaptAlert) : s.alerts,
      queue: cola ? cola.mensajes.map(adaptQueue) : s.queue,
      link: cola ? { retraso_s: cola.retraso_s, ancho_banda_kbps: cola.ancho_banda_kbps } : s.link,
      environment: entorno && isEnvironmentId(entorno.activo) ? entorno.activo : s.environment,
      serverDemo: demo ?? s.serverDemo,
      // Con /status de Back 1 el estado general es real; si no responde se queda el de ejemplo
      statusReal: estado ? true : s.statusReal,
      status: estado
        ? { ...adaptStatus(s.status, estado), ayer: s.statusReal ? s.status.readiness : estado.readiness }
        : demo && demo.dia > 0 ? { ...s.status, diaMision: demo.dia } : s.status,
    }))
  },

  syncFromApi: () => get().loadFromServer(),

  // Marcar como atendida: POST /alerts/{id}/ack (el back descongela la línea base).
  // Las alertas de ejemplo no tienen id numérico y solo cambian aquí.
  resolveAlert: (id) => {
    set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, estado: 'resuelta' } : a)) }))
    const n = Number(id)
    if (get().server && Number.isInteger(n)) {
      void api.post<ServerAlert>(`/alerts/${n}/ack`).then((r) => { if (r) get().applyServerEvent('alert_updated', r) })
    }
  },

  // Escalar a Tierra: POST /alerts/{id}/escalate, el mensaje llega después por queue_updated.
  escalateAlert: (id) => {
    const n = Number(id)
    if (get().server && Number.isInteger(n)) {
      set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, escalada: true } : a)) }))
      void api.post<ServerAlert>(`/alerts/${n}/escalate`).then((r) => { if (r) get().applyServerEvent('alert_updated', r) })
      return
    }
    set((s) => {
      const a = s.alerts.find((x) => x.id === id)
      const pri = a?.nivel === 'crit' ? 4 : 3
      return {
        alerts: s.alerts.map((x) => (x.id === id ? { ...x, escalada: true } : x)),
        queue: [{ id: nextQueueId(s.queue), pri, name: `Alerta escalada, ${a?.titulo.toLowerCase() ?? 'alerta'}`, kb: 2.2, sent: 0, arrive: null }, ...s.queue],
      }
    })
  },

  // Reloj de la demo en el back: correr, pausar y avanzar días
  demoStart: () => void callDemo(set, get, '/demo/start'),
  demoStop: () => void callDemo(set, get, '/demo/stop'),
  demoAdvance: (dias = 1) => void callDemo(set, get, '/demo/advance', { dias }),

  // Reloj de misión: envía por prioridad con el ancho de banda disponible;
  // cada paquete completo tarda DELAY_MIN en llegar a Tierra.
  // TODO Back 2: en la app real esto lo calcula el back y llega por queue_updated.
  advanceQueue: (minutes) => {
    const { queue, queueT, server } = get()
    const t = queueT + minutes
    // Con el back conectado, él envía y calcula el viaje: aquí solo corre el reloj
    if (server) { set({ queueT: t }); return }
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
  },
  setDemoSpeed: (demoSpeed) => set({ demoSpeed }),

  // Demo: dispara una alerta roja completa, aparece en Inicio y Alertas,
  // baja el estado general y su paquete crítico se salta la cola hacia Tierra.
  simulateRedAlert: () => {
    // Con el back conectado el paquete crítico entra a su cola real (POST /queue)
    if (get().server) {
      void api.post<ServerQueueMessage>('/queue', {
        tipo: 'alerta', prioridad: 1, tamano: 1.2,
        payload: { nivel: 'roja', senal: 'presion_sis', texto: 'ALERTA ROJA, presión muy alta' },
      }).then((m) => { if (m) get().applyServerEvent('queue_updated', m) })
    }
    set((s) => {
      const n = s.redCount + 1
      const alert = redAlert(n)
      return {
        redCount: n,
        alerts: [alert, ...s.alerts],
        queue: s.server ? s.queue : [{ id: nextQueueId(s.queue), pri: 4, name: 'ALERTA ROJA, presión muy alta', kb: 1.2, sent: 0, arrive: null }, ...s.queue],
        status: {
          ...s.status,
          readiness: Math.min(s.status.readiness, 58),
          factores: [{ label: 'Presión arterial muy alta', delta: -24, peso: 100 }, ...s.status.factores.filter((f) => f.label !== 'Presión arterial muy alta')],
          sistemas: s.status.sistemas.map((x) => (x.id === 'cardio' ? { ...x, estado: 'crit', valor: '168/104', nota: 'Presión de 168/104 mmHg hace 2 minutos, confirmada 2 veces. Ya se mandó un aviso crítico a Tierra' } : x)),
        },
      }
    })
  },

  // Resultado REAL del chequeo con cámara (Front 1, features/chequeo) -> valor medido por sistema.
  // Todavía no hay línea base personal calculada por el motor, así que NO se compara contra un
  // "tu normal" inventado y no se pinta amarillo: el sistema queda como "aprendiendo tu normal".
  // TODO Back 1: mandar POST /measurements y dejar que el back calcule /status con la línea base real.
  applyCameraResult: (r) =>
    set((s) => {
      const aprende = `Aún estamos aprendiendo tu normal (día ${s.status.diaBase} de ${s.status.diasBase}), por eso todavía no se compara`
      return {
        status: {
          ...s.status,
          sistemas: s.status.sistemas.map((x) => {
            const estado = x.estado === 'crit' ? 'crit' : 'none'
            if (x.id === 'cardio' && r.bpm !== null) {
              const bpm = Math.round(r.bpm)
              return { ...x, estado, valor: `${bpm} lpm`, real: { 'Ritmo en reposo': `${bpm} lpm` }, nota: `Medido hoy con la cámara (confianza ${r.confianza.toFixed(2)}). ${aprende}` }
            }
            if (x.id === 'sueno' && r.perclos !== null) {
              return { ...x, estado, valor: r.perclos.toFixed(2), real: { PERCLOS: r.perclos.toFixed(2) }, nota: `PERCLOS medido hoy con la cámara: ${r.perclos.toFixed(2)}. ${aprende}` }
            }
            return x
          }),
        },
      }
    }),

  resetDemo: () => {
    if (get().server) {
      // El back regresa al día 0 y limpia alertas y cola; después se vuelve a cargar su estado
      set({ status: mockStatus, queueT: 0, redCount: 0, watch: 'idle' })
      void api.post('/demo/reset').then(() => get().loadFromServer())
      return
    }
    set({ status: mockStatus, alerts: mockAlerts, queue: mockQueue, queueT: 0, redCount: 0, watch: 'idle' })
  },

  // Punto único de entrada de los eventos del WebSocket (sección 4 del documento).
  applyServerEvent: (event, data) => {
    // Si llega un evento del back sin haber cargado su estado, los ejemplos dejan de valer
    const entrarAlBack = () => { if (!get().server) set({ server: true, alerts: [], queue: [] }) }
    switch (event) {
      case 'alert_raised':
      case 'alert_updated': {
        entrarAlBack()
        const item = adaptAlert(data as ServerAlert)
        set((s) => ({ alerts: s.alerts.some((a) => a.id === item.id) ? s.alerts.map((a) => (a.id === item.id ? item : a)) : [item, ...s.alerts] }))
        break
      }
      case 'queue_updated': {
        entrarAlBack()
        const msg = adaptQueue(data as ServerQueueMessage)
        set((s) => ({ queue: s.queue.some((q) => q.id === msg.id) ? s.queue.map((q) => (q.id === msg.id ? msg : q)) : [msg, ...s.queue] }))
        break
      }
      case 'environment_changed': {
        const { activo } = data as ServerEnvironment
        if (isEnvironmentId(activo)) set({ environment: activo })
        // El retraso y el ancho de banda cambian con el entorno
        void api.get<ServerQueueState>('/queue').then((c) => { if (c) set({ link: { retraso_s: c.retraso_s, ancho_banda_kbps: c.ancho_banda_kbps } }) })
        break
      }
      case 'demo_tick': {
        const { dia, fuente_datos, reset } = data as { dia: number; fuente_datos: ServerDemo['fuente_datos']; reset?: boolean }
        set((s) => ({
          serverDemo: { corriendo: false, segundos_por_dia: 5, ...s.serverDemo, dia, fuente_datos },
          status: dia > 0 ? { ...s.status, diaMision: dia } : s.status,
        }))
        if (reset) void get().loadFromServer()
        break
      }
      case 'calibration_changed': {
        // Back 2 manda { antes, despues, delta }; el contrato viejo mandaba { calibracion }
        const d = data as { despues?: number; calibracion?: number }
        const calibracion = Math.round(d.despues ?? d.calibracion ?? get().status.calibracion)
        set((s) => ({ status: { ...s.status, calibracion } }))
        break
      }
      case 'status_changed': {
        const d = data as { astronauta_id?: number; readiness?: number; sistemas?: Record<string, string> }
        // Solo el estado de quien tiene la sesión abierta
        if (d.astronauta_id !== undefined && d.astronauta_id !== astroNumero(useSession.getState().user?.id)) break
        set((s) => ({
          status: {
            ...s.status,
            ...(typeof d.readiness === 'number' ? { readiness: d.readiness, ayer: s.status.readiness } : {}),
            sistemas: d.sistemas
              ? s.status.sistemas.map((x) => {
                  const clave = Object.keys(d.sistemas!).find((k) => SISTEMA_BACK[k] === x.id)
                  const estado = clave ? SEMAFORO_BACK[d.sistemas![clave]] : undefined
                  return estado ? { ...x, estado } : x
                })
              : s.status.sistemas,
          },
        }))
        break
      }
      case 'measurement_added':
      case 'pong':
        break
      default:
        console.warn('[ws] evento no manejado:', event, data)
    }
  },
}))

// Llama al reloj de la demo del back y guarda su estado (día y si corre)
async function callDemo(
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  get: () => AppState,
  path: string,
  body?: unknown,
) {
  if (!get().server) return
  const r = await api.post<ServerDemo>(path, body)
  if (!r) return
  set((s) => ({
    serverDemo: { dia: r.dia, corriendo: r.corriendo, segundos_por_dia: r.segundos_por_dia, fuente_datos: r.fuente_datos },
    status: r.dia > 0 ? { ...s.status, diaMision: r.dia } : s.status,
  }))
}
