// Convierte cada paso del chequeo en mediciones del contrato (POST /measurements).
// Regla de honestidad: cada medición lleva capa, fuente y confianza.
//   cámara y prueba cognitiva -> capa real; presión, ánimo, estrés, sueño y síntomas -> capa auto.

import type { MedicionEnvio } from '../../lib/back1'
import type { ResultadoCamara, ResultadoCognitivo, ResultadoPresion, ResultadoRegistro, Sueno } from './chequeoStore'

type Base = { astronauta_id: number; dia_mision: number | null }

const m = (b: Base, tipo: string, valor: number, unidad: string, capa: MedicionEnvio['capa'], fuente: MedicionEnvio['fuente'],
  confianza: number, detalle: Record<string, unknown> = {}): MedicionEnvio => ({
  astronauta_id: b.astronauta_id, dia_mision: b.dia_mision, tipo, valor: Number(valor.toFixed(4)), unidad, capa, fuente,
  confianza: Number(Math.max(0, Math.min(1, confianza)).toFixed(3)), detalle,
})

export function medicionesCamara(r: ResultadoCamara, b: Base): MedicionEnvio[] {
  const det = { segundos_validos: r.segundosValidos, fps: r.fps, luz: r.luz }
  const out: MedicionEnvio[] = []
  if (r.bpm !== null) out.push(m(b, 'hr_reposo', r.bpm, 'lpm', 'real', 'camara', r.confianzaMotor, { ...det, confianza_navegador: r.confianza }))
  // PERCLOS y parpadeo: la confianza depende de cuántos segundos útiles hubo (45 s o más = completa)
  const confOjos = Math.min(0.95, 0.4 + (r.segundosValidos / 45) * 0.55)
  if (r.perclos !== null) out.push(m(b, 'perclos', r.perclos, 'fracción', 'real', 'camara', confOjos, { ...det, cierres_largos: r.cierresLargos }))
  if (r.parpadeosMin !== null) out.push(m(b, 'parpadeo_min', r.parpadeosMin, '/min', 'real', 'camara', confOjos, det))
  if (r.parpadeoDurMs !== null) out.push(m(b, 'parpadeo_dur_ms', r.parpadeoDurMs, 'ms', 'real', 'camara', confOjos, det))
  if (r.expresion) {
    const c = Math.min(0.9, 0.4 + (r.expresion.muestras / 1200) * 0.5)
    out.push(m(b, 'expresividad', r.expresion.expresividad, '0-1', 'real', 'camara', c, det))
    out.push(m(b, 'sonrisa_media', r.expresion.sonrisa, '0-1', 'real', 'camara', c, det))
    out.push(m(b, 'ceno_medio', r.expresion.ceno, '0-1', 'real', 'camara', c, det))
    out.push(m(b, 'movimiento_cabeza', r.expresion.movimiento, '0-1', 'real', 'camara', c, det))
  }
  // Experimentales: entran a tu normal pero el motor no alerta con ellas
  if (r.hrv !== null) out.push(m(b, 'hrv_rmssd', r.hrv, 'ms', 'real', 'camara', r.confianzaMotor * 0.8, { ...det, experimental: true }))
  if (r.resp !== null) out.push(m(b, 'resp_rpm', r.resp, 'resp/min', 'real', 'camara', r.confianzaMotor * 0.8, { ...det, experimental: true }))
  return out
}

export function medicionesCognitivo(r: ResultadoCognitivo, b: Base): MedicionEnvio[] {
  const det = { practica: r.practica, estimulos: r.estimulos, falsos: r.falsos, media_ms: Math.round(r.mediaMs) }
  // Muchos toques en falso = la prueba no se hizo con atención: baja la confianza
  const conf = Math.max(0.3, 0.95 - r.falsos * 0.1)
  return [
    m(b, 'reaccion_ms', r.medianaMs, 'ms', 'real', 'prueba', conf, det),
    m(b, 'lapsos', r.lapsos, 'n', 'real', 'prueba', conf, det),
  ]
}

export function medicionesPresion(r: ResultadoPresion, b: Base): MedicionEnvio[] {
  if ('omitida' in r) return []
  const det = { origen: 'medical kit cuff' }
  const out = [m(b, 'presion_sis', r.sis, 'mmHg', 'auto', 'manual', 0.9, det), m(b, 'presion_dia', r.dia, 'mmHg', 'auto', 'manual', 0.9, det)]
  return out
}

// Igual que api/app/intelligence/sleep.py (Consensus Sleep Diary, versión core)
export function calcularSueno(s: Sueno) {
  const min = (h: string) => { const [a, c] = h.split(':').map(Number); return a * 60 + c }
  const despues = (t: number, ref: number) => (t < ref ? t + 1440 : t)
  const acostarse = min(s.acostarse)
  const intento = despues(min(s.intento || s.acostarse), acostarse)
  const despertar = despues(min(s.despertar), intento)
  const levantarse = despues(min(s.levantarse || s.despertar), despertar - 1)
  const tib = (levantarse - acostarse) / 60
  const tst = Math.max(0, (despertar - intento - s.latenciaMin - s.wasoMin) / 60)
  return { tibH: Number(tib.toFixed(2)), tstH: Number(tst.toFixed(2)), eficiencia: tib > 0 ? Number(((100 * tst) / tib).toFixed(1)) : 0 }
}

export function medicionesRegistro(r: ResultadoRegistro, b: Base): MedicionEnvio[] {
  const out: MedicionEnvio[] = [
    m(b, 'animo', r.animo, '1-5', 'auto', 'manual', 1, r.nota ? { nota: r.nota } : {}),
    m(b, 'estres', r.estres, '0-10', 'auto', 'manual', 1),
    m(b, 'sintomas', r.sintomas.length, 'n', 'auto', 'manual', 1, { lista: r.sintomas }),
  ]
  if (r.sueno) {
    const c = calcularSueno(r.sueno)
    const det = { diario: r.sueno, tib_h: c.tibH }
    out.push(
      m(b, 'sueno_horas', c.tstH, 'h', 'auto', 'manual', 1, det),
      m(b, 'sueno_eficiencia_pct', c.eficiencia, '%', 'auto', 'manual', 1, det),
      m(b, 'sueno_latencia_min', r.sueno.latenciaMin, 'min', 'auto', 'manual', 1, det),
      m(b, 'sueno_waso_min', r.sueno.wasoMin, 'min', 'auto', 'manual', 1, det),
      m(b, 'sueno_despertares', r.sueno.despertares, 'n', 'auto', 'manual', 1, det),
      m(b, 'sueno_calidad', r.sueno.calidad, '1-5', 'auto', 'manual', 1, det),
      m(b, 'sueno_medicamento', r.sueno.medicamento ? 1 : 0, '0/1', 'auto', 'manual', 1, det),
    )
  }
  return out
}
