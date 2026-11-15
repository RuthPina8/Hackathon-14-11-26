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
}

export interface StatusMock {
  readiness: number
  ayer: number
  factores: ReadinessFactor[]
  sistemas: SystemStatus[]
  calibracion: number
  diaBase: number // día actual de la línea base personal
  diasBase: number // total de días de la fase
  racha: number
  diaMision: number
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
}

export const mockStatus: StatusMock = {
  readiness: 82,
  ayer: 90,
  factores: [
    { label: 'Fatiga visual alta (PERCLOS)', delta: -5, peso: 62 },
    { label: 'Ritmo en reposo arriba de tu normal', delta: -2, peso: 25 },
    { label: 'Presión sin registrar hoy', delta: -1, peso: 13 },
  ],
  sistemas: [
    { id: 'cardio', nombre: 'Cardiovascular', estado: 'warn', valor: '74 lpm', href: '/indicators/hr' },
    { id: 'sueno', nombre: 'Sueño y fatiga', estado: 'warn', valor: '0.19', href: '/alerts' },
    { id: 'mental', nombre: 'Mental y cognitivo', estado: 'ok', valor: '286 ms', href: '/indicators/rt' },
    { id: 'inmune', nombre: 'Inmune', estado: 'ok', valor: 'estable', href: '/indicators/hr' },
    { id: 'oseo', nombre: 'Óseo', estado: 'none', valor: 'simulado', href: '/simulation', sim: true },
  ],
  calibracion: 64,
  diaBase: 9,
  diasBase: 14,
  racha: 6,
  diaMision: 9,
}

export const mockAlerts: AlertItem[] = [
  {
    id: 'a1', nivel: 'warn', icono: 'eye', titulo: 'Fatiga visual alta', resumen: 'PERCLOS 0.19, tu normal es 0.09', cuando: 'hace 14 h',
    queCambio: 'PERCLOS 0.19, tu normal es 0.09', cuanto: 'El doble de tu normal, arriba del umbral 0.15', desde: 'Últimas 3 sesiones, hace 14 h',
    factores: [{ name: 'PERCLOS', w: 62, capa: 'real' }, { name: 'Tiempo de reacción', w: 23, capa: 'real' }, { name: 'Ánimo reportado', w: 15, capa: 'self' }],
    tareas: ['Toma un descanso de 20 minutos lejos de pantallas', 'Hidrátate y revisa la iluminación del módulo', 'Evita tareas críticas o de precisión en las próximas 2 horas', 'Repite el chequeo con cámara después del descanso'],
    estado: 'activa',
  },
  {
    id: 'a2', nivel: 'warn', icono: 'pulse', titulo: 'Ritmo en reposo subiendo', resumen: 'Tendencia lenta detectada por CUSUM', cuando: 'hace 6 días',
    queCambio: 'Ritmo en reposo 74 lpm, tu normal es 68', cuanto: '+6 lpm, z-score 1.5, aún en rango clínico', desde: '6 días seguidos, detectado por CUSUM',
    factores: [{ name: 'CUSUM ritmo cardiaco', w: 60, capa: 'real' }, { name: 'Sueño reducido', w: 40, capa: 'self' }],
    tareas: ['Haz el chequeo en reposo, 10 minutos después de despertar', 'Revisa hidratación y consumo de cafeína', 'Mantén la rutina de ejercicio sin aumentar la intensidad'],
    estado: 'activa',
  },
  {
    id: 'a3', nivel: 'warn', icono: 'moon', titulo: 'Pocas horas de sueño', resumen: 'Dormiste 5.1 h, tu normal es 7.0 h', cuando: 'esta mañana',
    queCambio: 'Dormiste 5.1 h, tu normal es 7.0 h', cuanto: '−1.9 h, dos noches seguidas', desde: 'Hace 2 días',
    factores: [{ name: 'Horas de sueño', w: 80, capa: 'self' }, { name: 'PERCLOS', w: 20, capa: 'real' }],
    tareas: ['Ajusta la iluminación del módulo 1 h antes de dormir', 'Evita pantallas en la última hora del día'],
    estado: 'resuelta',
  },
]

export const mockQueue: QueueMessage[] = [
  { id: 1, pri: 3, name: 'Alerta escalada, fatiga visual', kb: 2.1, sent: 0.97, arrive: null },
  { id: 2, pri: 2, name: 'Tendencia de ritmo en reposo', kb: 3.4, sent: 0, arrive: null },
  { id: 3, pri: 1, name: 'Resumen clínico del día 9', kb: 5.8, sent: 0, arrive: null },
  { id: 4, pri: 1, name: 'Respaldo de mediciones', kb: 48, sent: 0, arrive: null, big: true },
  { id: 5, pri: 3, name: 'Alerta de sueño, día 8', kb: 1.9, sent: 1.9, arrive: -10 },
  { id: 6, pri: 1, name: 'Resumen clínico del día 8', kb: 5.2, sent: 5.2, arrive: 8 },
]

export const mockCrew: CrewMember[] = [
  { id: 'A1', nombre: 'Astronauta 1', rol: 'Tú', estado: 'warn', ultimo: 'hace 2 h', ritmo: '74 lpm', perclos: '0.19', presion: '118/76', animo: '3 de 5' },
  { id: 'A2', nombre: 'Astronauta 2', rol: 'Ingeniería', estado: 'ok', ultimo: 'hace 5 h', ritmo: '63 lpm', perclos: '0.07', presion: '112/72', animo: '4 de 5' },
  { id: 'A3', nombre: 'Astronauta 3', rol: 'Ciencia', estado: 'ok', ultimo: 'hace 1 h', ritmo: '66 lpm', perclos: '0.10', presion: '121/79', animo: '4 de 5' },
  { id: 'A4', nombre: 'Astronauta 4', rol: 'Comandante', estado: 'none', ultimo: 'hace 26 h', ritmo: 'sin dato', perclos: 'sin dato', presion: 'sin dato', animo: 'sin dato' },
]

// ---------- entornos (pantalla 8) ----------
export const environments = ['estacion', 'nave', 'capsula'] as const
export type EnvironmentId = (typeof environments)[number]

export const environmentProfiles: Record<EnvironmentId, {
  nombre: string; rate: number; delay: string; note: string; risk: string; protocol: string; micro: boolean; g: string
}> = {
  estacion: { nombre: 'Estación espacial', rate: 0.5, delay: '< 1 s', note: 'Tierra puede responder casi en tiempo real', risk: 'Óseo, cardiovascular e inmune', protocol: 'Monitoreo crónico diario', micro: true, g: 'microgravedad estable' },
  nave: { nombre: 'Nave rumbo a Marte', rate: 1.8, delay: '4 a 24 min', note: 'Solo de ida, según la posición de los planetas', risk: 'Radiación y aislamiento', protocol: 'Triage a bordo, Tierra confirma después', micro: true, g: 'microgravedad con fases de adaptación' },
  capsula: { nombre: 'Cápsula de transporte', rate: 0.2, delay: '< 3 s', note: 'Misión de horas, lanzamiento o reentrada', risk: 'Cargas G e intolerancia ortostática', protocol: 'Protocolo ortostático post aterrizaje', micro: false, g: 'variable con picos de 3 a 8 g' },
}

// ---------- indicadores (pantalla 5) ----------
export interface IndicatorDef {
  label: string; name: string; sys: string; unit: string
  base: number; sd: number; lo: number; hi: number; dec: number; clin: string
  drift: number; noise: number; src: string; capa: Capa; warn: boolean
  head: string; explain: string
}

export const indicators: Record<string, IndicatorDef> = {
  hr: { label: 'Ritmo cardiaco', name: 'Ritmo cardiaco en reposo', sys: 'Cardiovascular', unit: 'lpm', base: 68, sd: 4, lo: 56, hi: 84, dec: 0, clin: '60 a 100', drift: 10, noise: 1.6, src: 'Cámara, rPPG', capa: 'real', warn: true,
    head: 'Tu ritmo en reposo lleva 6 días subiendo y ya salió de tu rango normal',
    explain: 'Ningún valor es grave por sí solo, pero la tendencia lenta de 6 días es lo que dispara la alerta amarilla' },
  perclos: { label: 'PERCLOS', name: 'Fatiga visual (PERCLOS)', sys: 'Sueño y fatiga', unit: '', base: 0.09, sd: 0.03, lo: 0, hi: 0.25, dec: 2, clin: '< 0.15', drift: 0.1, noise: 0.012, src: 'Cámara, face mesh', capa: 'real', warn: true,
    head: 'Tus ojos pasan cerrados el doble de tiempo que en tu normal desde hace 3 sesiones',
    explain: 'PERCLOS arriba de 0.15 se asocia con somnolencia, coincide con menos horas de sueño reportadas' },
  bp: { label: 'Presión arterial', name: 'Presión sistólica', sys: 'Cardiovascular', unit: 'mmHg', base: 118, sd: 6, lo: 100, hi: 140, dec: 0, clin: '90 a 130', drift: 0, noise: 3, src: 'Autorreportado', capa: 'self', warn: false,
    head: 'Tu presión se mantiene estable dentro de tu rango normal',
    explain: 'Sin cambios relevantes, sigue registrándola una vez al día para mantener la calibración' },
  rt: { label: 'Tiempo de reacción', name: 'Tiempo de reacción', sys: 'Mental y cognitivo', unit: 'ms', base: 261, sd: 20, lo: 210, hi: 330, dec: 0, clin: '< 350', drift: 0, noise: 10, src: 'Prueba cognitiva', capa: 'real', warn: false,
    head: 'Tu tiempo de reacción está dentro de lo esperado para ti',
    explain: 'Las 3 primeras sesiones de práctica no cuentan, desde la cuarta tu rendimiento es estable' },
  mood: { label: 'Ánimo', name: 'Ánimo reportado', sys: 'Mental y cognitivo', unit: 'de 5', base: 3.6, sd: 0.6, lo: 1, hi: 5, dec: 1, clin: 'n/a', drift: 0, noise: 0.35, src: 'Autorreportado', capa: 'self', warn: false,
    head: 'Tu ánimo se mantiene estable, con un día bajo esta semana',
    explain: 'Un día bajo aislado no genera alerta, solo una tendencia de varios días' },
}

// Serie simulada determinista: misma forma cada vez que se abre la pantalla.
// TODO Back 1: reemplazar por GET /indicators/{tipo}?range=30d
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
    organo: 'Corazón y vasos',
    funcion: 'Sin gravedad los líquidos suben a la cabeza y el corazón trabaja distinto, con el tiempo se desacondiciona',
    porque: 'Tu ritmo en reposo lleva 6 días subiendo poco a poco, ningún valor es grave pero la tendencia sí',
    riesgo: 'Cambios cardiovasculares por vuelo espacial',
    hacer: 'Haz el chequeo en reposo al despertar y revisa hidratación y cafeína',
    capa: 'real',
    link: { to: '/indicators/hr', label: 'Ver ritmo cardiaco' },
    metricas: [
      { label: 'Ritmo en reposo', value: '74 lpm', base: '68 ± 4', estado: 'warn', serie: [67, 68, 69, 70, 71, 73, 74] },
      { label: 'Presión', value: '118/76', base: '117/75', estado: 'ok', serie: [117, 119, 116, 118, 117, 118, 118] },
    ],
  },
  sueno: {
    organo: 'Ojos y sueño',
    funcion: 'La luz artificial y los horarios de la misión alteran el sueño, y la fatiga aumenta los errores',
    porque: 'Tus ojos pasan cerrados el doble de tiempo que en tu normal desde hace 3 sesiones',
    riesgo: 'Falta de sueño y desajuste del ritmo circadiano',
    hacer: 'Descansa 20 minutos de pantallas y evita tareas de precisión por 2 horas',
    capa: 'real',
    link: { to: '/indicators/perclos', label: 'Ver fatiga visual' },
    metricas: [
      { label: 'PERCLOS', value: '0.19', base: '0.09', estado: 'warn', serie: [0.09, 0.08, 0.1, 0.11, 0.14, 0.17, 0.19] },
      { label: 'Horas de sueño', value: '5.1 h', base: '7.0 h', estado: 'warn', serie: [7.1, 6.9, 7.0, 6.4, 5.8, 5.3, 5.1] },
    ],
  },
  mental: {
    organo: 'Cerebro',
    funcion: 'El aislamiento y el encierro afectan el ánimo, la atención y la memoria de trabajo',
    porque: 'Tu tiempo de reacción y tu memoria están dentro de lo esperado para ti',
    riesgo: 'Problemas conductuales y de desempeño cognitivo',
    hacer: 'Sigue con la prueba cognitiva diaria, mantiene tu línea base al día',
    capa: 'real',
    link: { to: '/indicators/rt', label: 'Ver tiempo de reacción' },
    metricas: [
      { label: 'Tiempo de reacción', value: '286 ms', base: '261 ± 20', estado: 'ok', serie: [265, 258, 270, 262, 275, 280, 286] },
      { label: 'Ánimo', value: '3 de 5', base: '3.6', estado: 'ok', serie: [4, 4, 3, 4, 4, 3, 3] },
    ],
  },
  inmune: {
    organo: 'Sistema inmune',
    funcion: 'En el espacio el sistema inmune se debilita y virus dormidos pueden reactivarse, por ejemplo con ronchas',
    porque: 'Sin síntomas de reactivación viral en los últimos reportes',
    riesgo: 'Sistema inmune alterado',
    hacer: 'Reporta cualquier roncha o herida que tarde en sanar',
    capa: 'self',
    link: { to: '/manual', label: 'Registrar síntomas' },
    metricas: [
      { label: 'Síntomas en piel', value: 'ninguno', base: 'ninguno', estado: 'ok', serie: [0, 0, 0, 0, 0, 0, 0] },
      { label: 'Congestión nasal', value: 'leve', base: 'no', estado: 'ok', serie: [0, 0, 0, 1, 1, 1, 1] },
    ],
  },
  oseo: {
    organo: 'Huesos y músculos',
    funcion: 'Sin carga los huesos pierden entre 1 y 1.5% de densidad por mes en las zonas que cargan peso',
    porque: 'No se mide con la app, es una proyección según los días de misión y el ejercicio',
    riesgo: 'Pérdida ósea y de masa muscular',
    hacer: 'Cumple el ejercicio de resistencia diario para frenar la pérdida',
    capa: 'sim',
    link: { to: '/simulation', label: 'Ver proyección' },
    metricas: [
      { label: 'Densidad proyectada', value: '−0.3%', base: 'día 9', estado: 'none', serie: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3] },
    ],
  },
}
