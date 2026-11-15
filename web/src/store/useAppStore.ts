import { create } from 'zustand'
import {
  mockStatus, mockAlerts, mockQueue, mockCrew,
  isEnvironmentId,
  type StatusMock, type AlertItem, type QueueMessage, type CrewMember, type EnvironmentId,
} from './mockData'
import { api } from '../lib/api'
import {
  adaptAlert, adaptQueue, astroNumero,
  type ServerAlert, type ServerAlertList, type ServerDemo, type ServerEnvironment, type ServerQueueMessage, type ServerQueueState,
} from '../lib/adapters'
import { useSession } from './useSession'
import {
  adaptCrew, adaptStatus, TIPOS_METRICAS,
  type MedicionEnvio, type GuardadoOut, type ServerCrewMember, type ServerIndicator, type ServerStatus,
} from '../lib/back1'

// Estado global. Arranca con los mocks del rediseño v2 y se actualiza
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
  id: `demo-red-${n}`, nivel: 'crit', icono: 'heart', titulo: 'Very high blood pressure', resumen: '168/104 mmHg, your normal is 117/75', cuando: 'just now',
  queCambio: 'Blood pressure 168/104 mmHg, your normal is 117/75', cuanto: '+51 mmHg systolic, above the clinical range', desde: 'Reading from 2 minutes ago, confirmed twice',
  factores: [{ name: 'Systolic pressure', w: 70, capa: 'self' }, { name: 'Heart rate', w: 20, capa: 'real' }, { name: 'Headache', w: 10, capa: 'self' }],
  tareas: ['Sit down and avoid physical exertion', 'Repeat the reading in 5 minutes on the other arm', 'Tell the commander, a critical-priority notice has already been sent to Earth', 'Have the medical kit ready in case Earth prescribes medication'],
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
  demo: boolean
  demoSpeed: DemoSpeed
  redCount: number
  server: boolean // true cuando alertas y cola vienen del back
  statusReal: boolean // true cuando el estado, la línea base y los indicadores vienen del motor de Back 1
  indicadores: Record<string, ServerIndicator> // series del motor para el explorador del cuerpo
  pendientes: MedicionEnvio[][] // lotes del chequeo que no llegaron al back (se reintentan al reconectar)
  link: { retraso_s: number; ancho_banda_kbps: number } | null // enlace con Tierra del entorno activo
  serverDemo: ServerDemo | null // reloj de misión del back (día, si corre)

  setEnvironment: (env: EnvironmentId) => void
  setConnection: (c: ConnectionState) => void
  resolveAlert: (id: string) => void
  escalateAlert: (id: string) => void
  advanceQueue: (minutes: number) => void
  prioritizePacket: (id: number) => void
  setDemo: (on: boolean) => void
  setDemoSpeed: (s: DemoSpeed) => void
  simulateRedAlert: () => Promise<string>
  resetDemo: () => void
  applyCameraResult: (r: { bpm: number | null; confianza: number; perclos: number | null }) => void
  applyServerEvent: (event: string, data: unknown) => void
  loadFromServer: () => Promise<void>
  refreshBack1: () => Promise<void>
  sendMeasurements: (lote: MedicionEnvio[]) => Promise<GuardadoOut | null>
  flushPending: () => Promise<void>
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
  demo: initialDemo(),
  demoSpeed: 10,
  redCount: 0,
  server: false,
  statusReal: false,
  indicadores: {},
  pendientes: leerPendientes(),
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
    const [alertas, cola, entorno, demo] = await Promise.all([
      api.get<ServerAlertList>('/alerts'),
      api.get<ServerQueueState>('/queue'),
      api.get<ServerEnvironment>('/environment'),
      api.get<ServerDemo>('/demo'),
    ])
    // Estado del motor de Back 1 (independiente de que Back 2 conteste)
    void get().refreshBack1()
    void get().flushPending()
    if (!alertas && !cola) return
    set((s) => ({
      server: true,
      alerts: alertas ? [...alertas.activas, ...alertas.resueltas].map(adaptAlert) : s.alerts,
      queue: cola ? cola.mensajes.map(adaptQueue) : s.queue,
      link: cola ? { retraso_s: cola.retraso_s, ancho_banda_kbps: cola.ancho_banda_kbps } : s.link,
      environment: entorno && isEnvironmentId(entorno.activo) ? entorno.activo : s.environment,
      serverDemo: demo ?? s.serverDemo,
      status: demo && demo.dia > 0 ? { ...s.status, diaMision: demo.dia } : s.status,
    }))
  },

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
        queue: [{ id: nextQueueId(s.queue), pri, name: `Escalated alert, ${a?.titulo.toLowerCase() ?? 'alert'}`, kb: 2.2, sent: 0, arrive: null }, ...s.queue],
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

  // Estado, indicadores y tripulación del motor de Back 1. Sin back regresa sin tocar nada.
  refreshBack1: async () => {
    const yo = astroNumero(useSession.getState().user?.id) ?? 1
    const [st, crew, ...inds] = await Promise.all([
      api.get<ServerStatus>(`/status?astronauta_id=${yo}`),
      api.get<ServerCrewMember[]>('/crew'),
      ...TIPOS_METRICAS.map((t) => api.get<ServerIndicator>(`/indicators/${t}?astronauta_id=${yo}&range=mision`)),
    ])
    if (!st) return
    const indicadores: Record<string, ServerIndicator> = {}
    inds.forEach((r, i) => { if (r) indicadores[TIPOS_METRICAS[i]] = r })
    set((s) => ({
      // Con el motor conectado todo sale de él, aunque todavía no haya mediciones (las pantallas
      // muestran entonces "haz tu primer chequeo" en lugar de números de ejemplo)
      status: adaptStatus(st, s.statusReal ? s.status : mockStatus, indicadores),
      statusReal: true,
      indicadores,
      crew: crew ? adaptCrew(crew, s.crew) : s.crew,
    }))
  },

  // Manda un lote del chequeo a POST /measurements. Si el back no está, se guarda y se reintenta:
  // en una nave el enlace se cae y ninguna medición debe perderse.
  sendMeasurements: async (lote) => {
    if (lote.length === 0) return null
    const r = await api.post<GuardadoOut>('/measurements', lote, 15000)
    if (r) {
      void get().refreshBack1()
      return r
    }
    set((s) => {
      const pendientes = [...s.pendientes, lote]
      guardarPendientes(pendientes)
      return { pendientes }
    })
    return null
  },

  flushPending: async () => {
    const lotes = get().pendientes
    if (lotes.length === 0) return
    const quedan: MedicionEnvio[][] = []
    for (const lote of lotes) {
      const r = await api.post<GuardadoOut>('/measurements', lote, 15000)
      if (!r) quedan.push(lote)
    }
    guardarPendientes(quedan)
    set({ pendientes: quedan })
    if (quedan.length < lotes.length) void get().refreshBack1()
  },

  setDemo: (demo) => {
    try { localStorage.setItem('astro_demo', demo ? '1' : '0') } catch { /* sin storage */ }
    set({ demo })
  },
  setDemoSpeed: (demoSpeed) => set({ demoSpeed }),

  // Demo: dispara una alerta roja completa, aparece en Inicio y Alertas,
  // baja el estado general y su paquete crítico se salta la cola hacia Tierra.
  simulateRedAlert: async () => {
    // Con el back conectado la presión de demo entra por el motor real: rango clínico -> triage ->
    // alerta roja -> cola a Tierra, todo por WebSocket. Va con fuente "simulador" (dato de demo).
    if (get().server) {
      const yo = astroNumero(useSession.getState().user?.id) ?? 1
      const dia = get().status.diaMision
      const base = { astronauta_id: yo, unidad: 'mmHg', capa: 'auto', fuente: 'simulador', confianza: 1, dia_mision: dia, detalle: { demo: 'alerta_roja' } }
      const r = await api.post<GuardadoOut>('/measurements', [
        // Arriba de 180/120 (hipertensión severa, AHA/ACC) es el rango clínico rojo de app/core/umbrales.py
        { ...base, tipo: 'presion_sis', valor: 186 }, { ...base, tipo: 'presion_dia', valor: 122 },
      ])
      if (r && r.alerta_id != null) return String(r.alerta_id)
    }
    let id = ''
    set((s) => {
      const n = s.redCount + 1
      const alert = redAlert(n)
      id = alert.id
      return {
        redCount: n,
        alerts: [alert, ...s.alerts],
        queue: [{ id: nextQueueId(s.queue), pri: 4, name: 'RED ALERT, very high blood pressure', kb: 1.2, sent: 0, arrive: null }, ...s.queue],
        status: {
          ...s.status,
          readiness: Math.min(s.status.readiness, 58),
          factores: [{ label: 'Very high blood pressure', delta: -24, peso: 100 }, ...s.status.factores.filter((f) => f.label !== 'Very high blood pressure')],
          sistemas: s.status.sistemas.map((x) => (x.id === 'cardio' ? { ...x, estado: 'crit', valor: '168/104', nota: 'Blood pressure of 168/104 mmHg 2 minutes ago, confirmed twice. A critical notice has already been sent to Earth' } : x)),
        },
      }
    })
    return id
  },

  // Resultado REAL del chequeo con cámara (Front 1, features/chequeo) -> valor medido por sistema.
  // Todavía no hay línea base personal calculada por el motor, así que NO se compara contra un
  // "tu normal" inventado y no se pinta amarillo: el sistema queda como "aprendiendo tu normal".
  // TODO Back 1: mandar POST /measurements y dejar que el back calcule /status con la línea base real.
  applyCameraResult: (r) =>
    set((s) => {
      // Con el motor conectado, el estado lo calcula el back con la línea base real
      if (s.statusReal || s.server) return {}
      const aprende = `We’re still learning your normal (day ${s.status.diaBase} of ${s.status.diasBase}), so it isn’t compared yet`
      return {
        status: {
          ...s.status,
          sistemas: s.status.sistemas.map((x) => {
            const estado = x.estado === 'crit' ? 'crit' : 'none'
            if (x.id === 'cardio' && r.bpm !== null) {
              const bpm = Math.round(r.bpm)
              return { ...x, estado, valor: `${bpm} bpm`, real: { 'Resting heart rate': `${bpm} bpm` }, nota: `Measured today with the camera (confidence ${r.confianza.toFixed(2)}). ${aprende}` }
            }
            if (x.id === 'sueno' && r.perclos !== null) {
              return { ...x, estado, valor: r.perclos.toFixed(2), real: { PERCLOS: r.perclos.toFixed(2) }, nota: `PERCLOS measured today with the camera: ${r.perclos.toFixed(2)}. ${aprende}` }
            }
            return x
          }),
        },
      }
    }),

  resetDemo: () => {
    if (get().server) {
      // El back regresa al día 0 y limpia alertas y cola; después se vuelve a cargar su estado
      set({ queueT: 0, redCount: 0 })
      void api.post('/demo/reset').then(() => get().loadFromServer())
      return
    }
    set({ status: mockStatus, alerts: mockAlerts, queue: mockQueue, queueT: 0, redCount: 0 })
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
        const d = data as { astronauta_id?: number; despues?: number; calibracion?: number }
        if (d.astronauta_id !== undefined && d.astronauta_id !== (astroNumero(useSession.getState().user?.id) ?? 1)) break
        const calibracion = Math.round(d.despues ?? d.calibracion ?? get().status.calibracion)
        set((s) => ({ status: { ...s.status, calibracion } }))
        break
      }
      case 'status_changed':
      case 'measurement_added':
        // El motor cambió algo: se vuelve a pedir el estado completo, agrupando ráfagas
        // (la demo manda decenas de mediciones por día simulado)
        refrescarPronto(get)
        break
      case 'pong':
        break
      default:
        console.warn('[ws] unhandled event:', event, data)
    }
  },
}))

// Agrupa los eventos del motor: un solo refresco 400 ms después de la última ráfaga
let timerRefresco: ReturnType<typeof setTimeout> | null = null
function refrescarPronto(get: () => AppState) {
  if (timerRefresco) clearTimeout(timerRefresco)
  timerRefresco = setTimeout(() => { timerRefresco = null; void get().refreshBack1() }, 400)
}

const PENDIENTES_KEY = 'astro_pendientes_v1'
function leerPendientes(): MedicionEnvio[][] {
  try { return JSON.parse(localStorage.getItem(PENDIENTES_KEY) ?? '[]') as MedicionEnvio[][] } catch { return [] }
}
function guardarPendientes(p: MedicionEnvio[][]) {
  try { localStorage.setItem(PENDIENTES_KEY, JSON.stringify(p)) } catch { /* sin storage */ }
}

// Al cambiar de usuario (inicio de sesión con la cara) se pide su estado
useSession.subscribe((s, prev) => {
  if (s.user?.id !== prev.user?.id && s.user) void useAppStore.getState().refreshBack1()
})

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
