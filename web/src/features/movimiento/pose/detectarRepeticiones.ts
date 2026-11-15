import type { Ejercicio } from './calcularAngulos'

// Máquina de estados para contar repeticiones (no se cuenta en cada cuadro):
//   inicial → bajando → abajo → subiendo → inicial (+1 repetición)
// Con histéresis: hay que pasar claramente cada umbral, así el ruido no cuenta repeticiones falsas.
// "Abajo" significa la posición inferior de la sentadilla o los brazos ARRIBA en la elevación.

export type Fase = 'inicial' | 'bajando' | 'abajo' | 'subiendo'

const UMBRALES: Record<Ejercicio, { inicio: number; fondo: number; sube: (a: number, u: number) => boolean }> = {
  // rodilla: de pie > 160°, abajo < 105°
  sentadilla: { inicio: 160, fondo: 105, sube: (a, u) => a < u },
  // hombro: brazos abajo < 45°, arriba > 140°
  brazos: { inicio: 45, fondo: 140, sube: (a, u) => a > u },
}

const MIN_REP_MS = 600 // más rápido que esto es un rebote, no una repetición

export interface Contador {
  fase: Fase
  repeticiones: number
  duraciones: number[] // ms de cada repetición
  extremos: number[] // ángulo más profundo (o más alto) de cada repetición
  simetrias: number[] // 0 a 1, qué tan parecidos fueron ambos lados en cada repetición
}

export function nuevoContador(): Contador {
  return { fase: 'inicial', repeticiones: 0, duraciones: [], extremos: [], simetrias: [] }
}

interface Interno { inicioRep: number; extremo: number; asimetria: number }
const internos = new WeakMap<Contador, Interno>()

export function actualizar(c: Contador, ejercicio: Ejercicio, ang: { izq: number; der: number; prom: number }, t: number): Contador {
  const u = UMBRALES[ejercicio]
  const yaPaso = (a: number, umbral: number) => u.sube(a, umbral)
  const enInicio = ejercicio === 'sentadilla' ? ang.prom > u.inicio : ang.prom < u.inicio
  const i = internos.get(c) ?? { inicioRep: t, extremo: ang.prom, asimetria: 0 }
  const mas = (a: number, b: number) => (ejercicio === 'sentadilla' ? Math.min(a, b) : Math.max(a, b))
  let fase = c.fase
  const out: Contador = { ...c }

  if (fase === 'inicial' && !enInicio) {
    fase = 'bajando'
    i.inicioRep = t; i.extremo = ang.prom; i.asimetria = 0
  }
  if (fase === 'bajando' || fase === 'abajo') {
    i.extremo = mas(i.extremo, ang.prom)
    i.asimetria = Math.max(i.asimetria, Math.abs(ang.izq - ang.der))
  }
  if (fase === 'bajando' && yaPaso(ang.prom, u.fondo)) fase = 'abajo'
  if (fase === 'abajo' && !yaPaso(ang.prom, u.fondo)) fase = 'subiendo'
  if (fase === 'subiendo' && yaPaso(ang.prom, u.fondo)) fase = 'abajo' // volvió a bajar
  if ((fase === 'bajando' || fase === 'subiendo') && enInicio) {
    const dur = t - i.inicioRep
    if (fase === 'subiendo' && dur >= MIN_REP_MS) {
      out.repeticiones = c.repeticiones + 1
      out.duraciones = [...c.duraciones, dur]
      out.extremos = [...c.extremos, i.extremo]
      out.simetrias = [...c.simetrias, Math.max(0, 1 - i.asimetria / 90)]
    }
    fase = 'inicial' // si nunca llegó abajo, fue un intento incompleto: no cuenta
  }
  out.fase = fase
  internos.set(out, i)
  return out
}

const prom = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0)

// Resumen de la sesión para guardarla
export function resumen(c: Contador, ejercicio: Ejercicio) {
  const durs = c.duraciones
  const media = prom(durs)
  const cv = durs.length > 1 ? Math.sqrt(prom(durs.map((d) => (d - media) ** 2))) / (media || 1) : 0
  // Rango de movimiento aproximado: de la posición inicial al extremo promedio
  const rango = c.extremos.length ? (ejercicio === 'sentadilla' ? 175 - prom(c.extremos) : prom(c.extremos) - 15) : null
  return {
    rango_grados: rango === null ? null : Math.max(0, Math.round(rango)),
    regularidad: durs.length > 1 ? Math.max(0, Math.min(1, Number((1 - cv).toFixed(2)))) : null,
    simetria: ejercicio === 'brazos' && c.simetrias.length ? Number(prom(c.simetrias).toFixed(2)) : null,
  }
}
