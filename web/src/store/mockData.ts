// Datos de ejemplo (mocks) del rediseño v2.
// La forma de cada objeto sigue el contrato de la sección 3 del documento maestro:
// cuando Back 1 / Back 2 tengan sus endpoints, solo se reemplazan estas constantes
// por la respuesta de fetch o por los eventos del WebSocket.

export type Semaforo = 'ok' | 'warn' | 'crit' | 'none'
export type Capa = 'real' | 'self' | 'sim'

export interface ReadinessFactor { label: string; delta: number; peso: number }

export interface SystemStatus {
  id: string
  nombre: string
  estado: Semaforo
  valor: string
  href: string
  sim?: boolean
  real?: Record<string, string> // valores medidos hoy por la cámara, por nombre de métrica
  nota?: string // texto que reemplaza el "por qué" (lo usa la alerta roja del modo demo)
  metricas?: SystemMetric[] // métricas reales del motor (si no hay, se usan las de ejemplo)
  demo?: boolean // incluye datos del simulador
}

export interface StatusMock {
  readiness: number
  ayer: number | null // lectura anterior de la disposición (null = no hay)
  factores: ReadinessFactor[]
  sistemas: SystemStatus[]
  calibracion: number
  diaBase: number // día actual de la línea base personal
  diasBase: number // total de días de la fase
  racha: number
  diaMision: number
  // Solo cuando el estado viene del motor de Back 1
  fase?: 'tierra' | 'adaptacion' | 'personal'
  nMediciones?: number
  datoDemo?: boolean
  animoCamara?: { estado: 'aprendiendo' | 'activo'; acierto_pct: number | null; mae: number | null; n: number; explicacion: string | null; estimado_hoy: number | null } | null
  inmune?: { estado: string; puntaje: number; motivo: string; dia_desde: number | null } | null
}

export interface AlertFactor { name: string; w: number; capa: Capa }

export interface AlertItem {
  id: string
  nivel: Semaforo
  titulo: string
  resumen: string
  cuando: string
  queCambio: string
  cuanto: string
  desde: string
  factores: AlertFactor[]
  tareas: string[]
  estado: 'activa' | 'resuelta'
  icono: 'eye' | 'pulse' | 'moon' | 'heart'
  astro?: number // astronauta dueño de la alerta (solo vienen del back)
  escalada?: boolean // ya se mandó a la cola hacia Tierra
}

export interface QueueMessage {
  id: number
  pri: 1 | 2 | 3 | 4 // 4 = crítica
  name: string
  kb: number
  sent: number // KB ya enviados
  arrive: number | null // minuto simulado en que llega a Tierra
  big?: boolean // espera ventana de alto ancho de banda
  boost?: boolean // el astronauta pidió enviarlo primero
  // Solo en mensajes que vienen del back: él calcula el envío y el viaje a Tierra
  server?: {
    estado: 'en_cola' | 'transmitiendo' | 'en_transito' | 'entregado'
    progreso: number // 0 a 1 del viaje
    eta_s: number | null // segundos que faltaban al recibir el mensaje
    recibidoMs: number // Date.now() al recibir el mensaje, para contar el tiempo que falta
    payload: Record<string, unknown>
  }
}

export interface CrewMember {
  id: string
  nombre: string
  rol: string
  estado: Semaforo
  ultimo: string
  ritmo: string
  perclos: string
  presion: string
  animo: string
  alertas?: number
  demo?: boolean
}

export const mockStatus: StatusMock = {
  readiness: 82,
  ayer: 90,
  factores: [
    { label: 'High visual fatigue (PERCLOS)', delta: -5, peso: 62 },
    { label: 'Resting heart rate above your normal', delta: -2, peso: 25 },
    { label: 'Blood pressure not logged today', delta: -1, peso: 13 },
  ],
  sistemas: [
    { id: 'cardio', nombre: 'Cardiovascular', estado: 'warn', valor: '74 bpm', href: '/indicators/hr' },
    { id: 'sueno', nombre: 'Sleep and fatigue', estado: 'warn', valor: '0.19', href: '/alerts' },
    { id: 'mental', nombre: 'Mental and cognitive', estado: 'ok', valor: '286 ms', href: '/indicators/rt' },
    { id: 'inmune', nombre: 'Immune', estado: 'none', valor: 'no data', href: '/camera?paso=4', nota: 'No symptoms logged yet. Log them in the daily check-up' },
    { id: 'oseo', nombre: 'Bone', estado: 'none', valor: 'simulado', href: '/simulation', sim: true },
  ],
  calibracion: 64,
  diaBase: 1,
  diasBase: 14,
  racha: 1,
  diaMision: 1,
}

export const mockAlerts: AlertItem[] = [
  {
    id: 'a1', nivel: 'warn', icono: 'eye', titulo: 'High visual fatigue', resumen: 'PERCLOS 0.19, your normal is 0.09', cuando: '14 h ago',
    queCambio: 'PERCLOS 0.19, your normal is 0.09', cuanto: 'Double your normal, above the 0.15 threshold', desde: 'Last 3 sessions, 14 h ago',
    factores: [{ name: 'PERCLOS', w: 62, capa: 'real' }, { name: 'Reaction time', w: 23, capa: 'real' }, { name: 'Reported mood', w: 15, capa: 'self' }],
    tareas: ['Take a 20-minute break away from screens', 'Hydrate and check the module lighting', 'Avoid critical or precision tasks for the next 2 hours', 'Repeat the camera check-up after the break'],
    estado: 'activa',
  },
  {
    id: 'a2', nivel: 'warn', icono: 'pulse', titulo: 'Resting heart rate rising', resumen: 'Slow trend detected by CUSUM', cuando: '6 days ago',
    queCambio: 'Resting heart rate 74 bpm, your normal is 68', cuanto: '+6 bpm, z-score 1.5, still within clinical range', desde: '6 days in a row, detected by CUSUM',
    factores: [{ name: 'Heart rate CUSUM', w: 60, capa: 'real' }, { name: 'Reduced sleep', w: 40, capa: 'self' }],
    tareas: ['Do the check-up at rest, 10 minutes after waking up', 'Check hydration and caffeine intake', 'Keep your exercise routine without increasing intensity'],
    estado: 'activa',
  },
  {
    id: 'a3', nivel: 'warn', icono: 'moon', titulo: 'Few hours of sleep', resumen: 'You slept 5.1 h, your normal is 7.0 h', cuando: 'this morning',
    queCambio: 'You slept 5.1 h, your normal is 7.0 h', cuanto: '−1.9 h, two nights in a row', desde: '2 days ago',
    factores: [{ name: 'Hours of sleep', w: 80, capa: 'self' }, { name: 'PERCLOS', w: 20, capa: 'real' }],
    tareas: ['Adjust the module lighting 1 h before bed', 'Avoid screens in the last hour of the day'],
    estado: 'resuelta',
  },
]

export const mockQueue: QueueMessage[] = [
  { id: 1, pri: 3, name: 'Escalated alert, visual fatigue', kb: 2.1, sent: 0.97, arrive: null },
  { id: 2, pri: 2, name: 'Resting heart rate trend', kb: 3.4, sent: 0, arrive: null },
  { id: 3, pri: 1, name: 'Day 1 clinical summary', kb: 5.8, sent: 0, arrive: null },
  { id: 4, pri: 1, name: 'Measurement backup', kb: 48, sent: 0, arrive: null, big: true },
  { id: 5, pri: 3, name: 'Last night’s sleep alert', kb: 1.9, sent: 1.9, arrive: -10 },
  { id: 6, pri: 1, name: 'Earth baseline summary', kb: 5.2, sent: 5.2, arrive: 8 },
]

export const mockCrew: CrewMember[] = [
  { id: 'A1', nombre: 'Astronaut 1', rol: 'You', estado: 'warn', ultimo: '2 h ago', ritmo: '74 bpm', perclos: '0.19', presion: '118/76', animo: '3 of 5' },
  { id: 'A2', nombre: 'Astronaut 2', rol: 'Engineering', estado: 'ok', ultimo: '5 h ago', ritmo: '63 bpm', perclos: '0.07', presion: '112/72', animo: '4 of 5' },
  { id: 'A3', nombre: 'Astronaut 3', rol: 'Science', estado: 'ok', ultimo: '1 h ago', ritmo: '66 bpm', perclos: '0.10', presion: '121/79', animo: '4 of 5' },
  { id: 'A4', nombre: 'Astronaut 4', rol: 'Commander', estado: 'none', ultimo: '26 h ago', ritmo: 'no data', perclos: 'no data', presion: 'no data', animo: 'no data' },
]

// ---------- entornos (pantalla 8) ----------
// Mismos ids que los perfiles de Back 2 (api/app/entornos/perfiles/*.json)
export const environments = ['iss', 'luna', 'nave', 'marte'] as const
export type EnvironmentId = (typeof environments)[number]
export const isEnvironmentId = (v: unknown): v is EnvironmentId => (environments as readonly unknown[]).includes(v)

export const environmentProfiles: Record<EnvironmentId, {
  nombre: string; corto: string; rate: number; bone: number; delay: string; note: string; risk: string; protocol: string; micro: boolean; g: string
}> = {
  iss: { nombre: 'International Space Station', corto: 'ISS', rate: 0.5, bone: 1.2, delay: '< 1 s', note: 'Earth can respond almost in real time', risk: 'Bone, cardiovascular and immune', protocol: 'Daily chronic monitoring', micro: true, g: 'stable microgravity' },
  luna: { nombre: 'Lunar surface', corto: 'Moon', rate: 1.37, bone: 0.8, delay: '1.3 s', note: 'Conversation with a short pause', risk: 'Radiation, lunar dust and 1/6 gravity', protocol: 'On-board triage with near-immediate support', micro: true, g: '0.17 g' },
  nave: { nombre: 'Spacecraft in transit to Mars', corto: 'Spacecraft', rate: 1.8, bone: 1.2, delay: '4 to 24 min', note: 'One way, depending on planetary positions', risk: 'Radiation and isolation', protocol: 'On-board triage, Earth confirms later', micro: true, g: 'microgravity with adaptation phases' },
  marte: { nombre: 'Mars surface', corto: 'Mars', rate: 0.67, bone: 0.6, delay: '4 to 24 min', note: 'No evacuation possible, the return window comes every 26 months', risk: 'Isolation, dust and radiation', protocol: 'On-board medical autonomy', micro: true, g: '0.38 g' },
}

// ---------- indicadores (pantalla 5) ----------
export interface IndicatorDef {
  tipo: string // nombre de la señal en el back (lista cerrada de api/CLAUDE.md)
  label: string; name: string; sys: string; unit: string
  base: number; sd: number; lo: number; hi: number; dec: number; clin: string
  drift: number; noise: number; src: string; capa: Capa; warn: boolean
  head: string; explain: string
}

export const indicators: Record<string, IndicatorDef> = {
  hr: { tipo: 'hr_reposo', label: 'Heart rate', name: 'Resting heart rate', sys: 'Cardiovascular', unit: 'bpm', base: 68, sd: 4, lo: 56, hi: 84, dec: 0, clin: '60 to 100', drift: 10, noise: 1.6, src: 'Camera, rPPG', capa: 'real', warn: true,
    head: 'Your resting heart rate has been rising for 6 days and is now outside your normal range',
    explain: 'No single value is serious on its own, but the slow 6-day trend is what triggers the yellow alert' },
  bp: { tipo: 'presion_sis', label: 'Blood pressure', name: 'Systolic pressure', sys: 'Cardiovascular', unit: 'mmHg', base: 118, sd: 6, lo: 100, hi: 140, dec: 0, clin: '90 a 130', drift: 0, noise: 3, src: 'Autorreportado', capa: 'self', warn: false,
    head: 'Your blood pressure is stable within your normal range',
    explain: 'No relevant changes, keep logging it once a day to maintain calibration' },
  rt: { tipo: 'reaccion_ms', label: 'Reaction time', name: 'Reaction time', sys: 'Mental and cognitive', unit: 'ms', base: 261, sd: 20, lo: 210, hi: 330, dec: 0, clin: '< 350', drift: 0, noise: 10, src: 'Cognitive test', capa: 'real', warn: false,
    head: 'Your reaction time is within what’s expected for you',
    explain: 'The first 3 practice sessions don’t count, from the fourth on your performance is stable' },
  mood: { tipo: 'animo', label: 'Mood', name: 'Reported mood', sys: 'Mental and cognitive', unit: 'of 5', base: 3.6, sd: 0.6, lo: 1, hi: 5, dec: 1, clin: 'n/a', drift: 0, noise: 0.35, src: 'Autorreportado', capa: 'self', warn: false,
    head: 'Your mood is stable, with one low day this week',
    explain: 'A single low day doesn’t raise an alert, only a multi-day trend does' },
  sleep: { tipo: 'sueno_horas', label: 'Sleep', name: 'Hours of sleep', sys: 'Sleep and fatigue', unit: 'h', base: 7.1, sd: 0.5, lo: 4, hi: 9.5, dec: 1, clin: '≥ 6 h', drift: -1.6, noise: 0.25, src: 'Sleep diary or Apple Watch', capa: 'self', warn: true,
    head: 'You’ve slept less than usual for several nights',
    explain: 'The sleep rule warns after 3 nights in a row under 6 h, even if no single night is serious' },
  stress: { tipo: 'estres', label: 'Stress', name: 'Reported stress', sys: 'Mental and cognitive', unit: 'of 10', base: 3, sd: 1.2, lo: 0, hi: 10, dec: 0, clin: 'n/a', drift: 0, noise: 0.8, src: 'Autorreportado', capa: 'self', warn: false,
    head: 'Your reported stress is within your range',
    explain: 'A value of 8 or more needs attention even while your normal is still being learned' },
}

// Serie de ejemplo determinista, solo para cuando no hay back (con back sale de GET /indicators/{tipo}).
export function mockSeries(key: string, n: number): number[] {
  const d = indicators[key]
  const rnd = (i: number) => {
    const x = Math.sin(i * 12.9898 + key.length * 78.233) * 43758.5453
    return x - Math.floor(x) - 0.5
  }
  return Array.from({ length: n }, (_, i) => {
    const t = (i - (n - 7)) / 6
    const drift = t > 0 ? d.drift * Math.min(1, t) : 0
    return d.base + rnd(i) * 2 * d.noise + drift
  })
}

// ---------- detalle por sistema (explorador del cuerpo en Inicio) ----------
export interface SystemMetric {
  label: string
  value: string
  base: string
  estado: Semaforo
  serie: number[] // últimos 7 días, para la mini gráfica
}

export interface SystemDetail {
  organo: string
  funcion: string // qué hace y por qué importa en el espacio
  porque: string // por qué está en este color hoy
  riesgo: string // riesgo del Human Research Program de NASA relacionado
  hacer: string
  capa: Capa
  link: { to: string; label: string }
  metricas: SystemMetric[]
}

export const systemDetails: Record<string, SystemDetail> = {
  cardio: {
    organo: 'Heart and vessels',
    funcion: 'Without gravity fluids shift toward the head and the heart works differently, over time it deconditions',
    porque: 'Your resting heart rate has been creeping up for 6 days, no single value is serious but the trend is',
    riesgo: 'Cardiovascular changes from spaceflight',
    hacer: 'Do the check-up at rest after waking up and check hydration and caffeine',
    capa: 'real',
    link: { to: '/indicators/hr', label: 'View heart rate' },
    metricas: [
      { label: 'Resting heart rate', value: '74 bpm', base: '68 ± 4', estado: 'warn', serie: [67, 68, 69, 70, 71, 73, 74] },
      { label: 'Blood pressure', value: '118/76', base: '117/75', estado: 'ok', serie: [117, 119, 116, 118, 117, 118, 118] },
    ],
  },
  sueno: {
    organo: 'Eyes and sleep',
    funcion: 'Artificial light and mission schedules disrupt sleep, and fatigue increases errors',
    porque: 'Your eyes have been closed twice as long as your normal for the last 3 sessions',
    riesgo: 'Sleep loss and circadian misalignment',
    hacer: 'Take a 20-minute screen break and avoid precision tasks for 2 hours',
    capa: 'real',
    link: { to: '/indicators/sleep', label: 'View sleep' },
    metricas: [
      { label: 'PERCLOS', value: '0.19', base: '0.09', estado: 'warn', serie: [0.09, 0.08, 0.1, 0.11, 0.14, 0.17, 0.19] },
      { label: 'Hours of sleep', value: '5.1 h', base: '7.0 h', estado: 'warn', serie: [7.1, 6.9, 7.0, 6.4, 5.8, 5.3, 5.1] },
    ],
  },
  mental: {
    organo: 'Brain',
    funcion: 'Isolation and confinement affect mood, attention and working memory',
    porque: 'Your reaction time and memory are within what’s expected for you',
    riesgo: 'Behavioral and cognitive performance issues',
    hacer: 'Keep doing the daily cognitive test, it keeps your baseline up to date',
    capa: 'real',
    link: { to: '/indicators/rt', label: 'View reaction time' },
    metricas: [
      { label: 'Reaction time', value: '286 ms', base: '261 ± 20', estado: 'ok', serie: [265, 258, 270, 262, 275, 280, 286] },
      { label: 'Mood', value: '3 of 5', base: '3.6', estado: 'ok', serie: [4, 4, 3, 4, 4, 3, 3] },
    ],
  },
  inmune: {
    organo: 'Immune system',
    funcion: 'In space the immune system weakens and dormant viruses can reactivate, for example with hives',
    porque: 'No signs of viral reactivation in recent reports',
    riesgo: 'Immune system impaired',
    hacer: 'Report any hives or wounds that are slow to heal',
    capa: 'self',
    link: { to: '/camera?paso=4', label: 'Log symptoms' },
    metricas: [
      { label: 'Skin symptoms', value: 'none', base: 'none', estado: 'ok', serie: [0, 0, 0, 0, 0, 0, 0] },
      { label: 'Nasal congestion', value: 'leve', base: 'no', estado: 'ok', serie: [0, 0, 0, 1, 1, 1, 1] },
    ],
  },
  oseo: {
    organo: 'Bones and muscles',
    funcion: 'Without load, weight-bearing bones lose 1 to 1.5% of density per month',
    porque: 'Not measured by the app, it’s a projection based on mission days and exercise',
    riesgo: 'Bone and muscle mass loss',
    hacer: 'Do your daily resistance exercise to slow the loss',
    capa: 'sim',
    link: { to: '/simulation', label: 'View projection' },
    metricas: [
      { label: 'Projected density', value: 'view projection', base: 'based on mission days', estado: 'none', serie: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3] },
    ],
  },
}
