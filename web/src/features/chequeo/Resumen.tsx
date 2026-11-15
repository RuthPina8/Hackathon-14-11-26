import { useEffect, useMemo, useRef, useState } from 'react'
import StepBar from './components/StepBar'
import { CONFIANZA_BUENA } from './camara/useRppg'
import { calcularSueno, tuNormal, useChequeoStore, type Sesion } from './chequeoStore'
import { api, type MedicionApi } from '../../lib/api'
import { useAppStore } from '../../store/useAppStore'

type Props = { onAtras: () => void; onIndicadores: () => void; onInicio: () => void }

type Fila = {
  nombre: string
  hoy: string
  normal: string
  capa: 'real' | 'self'
  estado: 'ok' | 'warn' | 'none'
}

const COLOR = { ok: '#3DDC97', warn: '#F5B544', none: '#93A0B8' }

// Racha: días seguidos con chequeo, contando hoy
function racha(historial: Sesion[]) {
  const dias = new Set(historial.map((s) => s.fecha.slice(0, 10)))
  let n = 0
  const d = new Date()
  while (dias.has(d.toISOString().slice(0, 10))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export default function Resumen({ onAtras, onIndicadores, onInicio }: Props) {
  const { camara, cognitivo, registro, historial, cerrarSesion } = useChequeoStore()
  const status = useAppStore((s) => s.status)
  const conexion = useAppStore((s) => s.connection)
  const syncFromApi = useAppStore((s) => s.syncFromApi)
  const conectado = conexion === 'connected'

  // "Tu normal" se calcula con las sesiones anteriores a hoy
  const [previas] = useState(historial)
  const [envio, setEnvio] = useState<'enviando' | 'guardado' | 'sin_back'>('enviando')
  const [nota, setNota] = useState('')
  const [notaEnviada, setNotaEnviada] = useState(false)
  const yaGuardado = useRef(false)

  const sueno = registro?.sueno ? calcularSueno(registro.sueno) : null

  // Mediciones de hoy con su capa, fuente y confianza (regla de honestidad de datos)
  const mediciones = useMemo<MedicionApi[]>(() => {
    const m: MedicionApi[] = []
    if (camara?.bpm != null) m.push({ tipo: 'hr_reposo', valor: camara.bpm, unidad: 'lpm', capa: 'real', fuente: 'camara', confianza: camara.confianza })
    if (camara?.perclos != null) m.push({ tipo: 'perclos', valor: camara.perclos, unidad: 'fraccion', capa: 'real', fuente: 'camara', confianza: 0.8 })
    if (camara?.parpadeosMin != null) m.push({ tipo: 'parpadeo_min', valor: camara.parpadeosMin, unidad: '/min', capa: 'real', fuente: 'camara', confianza: 0.8 })
    if (cognitivo?.reaccionMs != null)
      m.push({
        tipo: 'reaccion_ms', valor: cognitivo.reaccionMs, unidad: 'ms', capa: 'real', fuente: 'prueba',
        confianza: cognitivo.practica ? 0.3 : 0.9,
        detalle: { practica: cognitivo.practica, intentos: cognitivo.intentos, anticipaciones: cognitivo.anticipaciones, memoria: cognitivo.memoria },
      })
    if (cognitivo?.atencion) m.push({ tipo: 'lapsos', valor: cognitivo.atencion.omisiones, unidad: 'n', capa: 'real', fuente: 'prueba', confianza: cognitivo.practica ? 0.3 : 0.9, detalle: cognitivo.atencion })
    if (registro?.presionSis != null) m.push({ tipo: 'presion_sis', valor: registro.presionSis, unidad: 'mmHg', capa: 'auto', fuente: 'manual', confianza: 1 })
    if (registro?.presionDia != null) m.push({ tipo: 'presion_dia', valor: registro.presionDia, unidad: 'mmHg', capa: 'auto', fuente: 'manual', confianza: 1 })
    if (registro?.animo != null) m.push({ tipo: 'animo', valor: registro.animo, unidad: '1-5', capa: 'auto', fuente: 'manual', confianza: 1, detalle: { palabra: registro.palabra } })
    if (registro?.estres != null) m.push({ tipo: 'estres', valor: registro.estres, unidad: '0-10', capa: 'auto', fuente: 'manual', confianza: 1 })
    if (registro?.sueno && sueno) {
      const s = registro.sueno
      m.push({ tipo: 'sueno_horas', valor: Number(sueno.horas.toFixed(2)), unidad: 'h', capa: 'auto', fuente: 'manual', confianza: 1, detalle: { ...s } })
      m.push({ tipo: 'sueno_eficiencia_pct', valor: Math.round(sueno.eficiencia), unidad: '%', capa: 'auto', fuente: 'manual', confianza: 1 })
      m.push({ tipo: 'sueno_latencia_min', valor: s.latenciaMin, unidad: 'min', capa: 'auto', fuente: 'manual', confianza: 1 })
      m.push({ tipo: 'sueno_waso_min', valor: s.wasoMin, unidad: 'min', capa: 'auto', fuente: 'manual', confianza: 1 })
      m.push({ tipo: 'sueno_despertares', valor: s.despertares, unidad: 'n', capa: 'auto', fuente: 'manual', confianza: 1 })
      m.push({ tipo: 'sueno_calidad', valor: s.calidad, unidad: '1-5', capa: 'auto', fuente: 'manual', confianza: 1 })
      m.push({ tipo: 'sueno_medicamento', valor: s.medicamento ? 1 : 0, unidad: '0/1', capa: 'auto', fuente: 'manual', confianza: 1 })
    }
    if (registro) m.push({ tipo: 'sintomas', valor: registro.sintomas.length, unidad: 'n', capa: 'auto', fuente: 'manual', confianza: 1, detalle: { lista: registro.sintomas } })
    return m
  }, [camara, cognitivo, registro, sueno])

  // Se guarda una sola vez: en el historial de este dispositivo y en el back si está conectado
  useEffect(() => {
    if (yaGuardado.current) return
    yaGuardado.current = true
    cerrarSesion({
      fecha: new Date().toISOString(),
      bpm: camara?.bpm ?? null,
      perclos: camara?.perclos ?? null,
      reaccionMs: cognitivo?.reaccionMs ?? null,
      memoria: cognitivo?.memoria ?? null,
      presionSis: registro?.presionSis ?? null,
      presionDia: registro?.presionDia ?? null,
      animo: registro?.animo ?? null,
      estres: registro?.estres ?? null,
      suenoHoras: sueno ? Number(sueno.horas.toFixed(2)) : null,
      sintomas: registro?.sintomas.length ?? 0,
      cognitivoContado: Boolean(cognitivo && !cognitivo.practica),
    })
    if (!mediciones.length) {
      setEnvio('sin_back')
      return
    }
    void api.guardarMediciones(mediciones).then((r) => {
      setEnvio(r ? 'guardado' : 'sin_back')
      if (r) void syncFromApi()
    })
  }, [mediciones, camara, cognitivo, registro, sueno, cerrarSesion, syncFromApi])

  // Compara contra tu normal (z de 2 o más) o contra el rango clínico si todavía no hay normal
  const fila = (nombre: string, valor: number | null | undefined, campo: keyof Sesion, fmt: (v: number) => string, capa: Fila['capa'], clinico?: [number, number], unidadNormal = ''): Fila => {
    const n = tuNormal(previas, campo)
    if (valor == null) return { nombre, hoy: 'sin dato', normal: n.media != null ? fmt(n.media) : 'aprendiendo', capa, estado: 'none' }
    let estado: Fila['estado'] = 'ok'
    if (n.media != null && n.sd) estado = Math.abs((valor - n.media) / n.sd) >= 2 ? 'warn' : 'ok'
    else if (clinico) estado = valor < clinico[0] || valor > clinico[1] ? 'warn' : 'ok'
    const normal = n.media != null ? `${fmt(n.media)}${n.sd ? ` ± ${fmt(n.sd)}` : ''}${unidadNormal}` : `aprendiendo (${n.n} de 3)`
    return { nombre, hoy: fmt(valor), normal, capa, estado }
  }

  const filas: Fila[] = [
    fila('Ritmo cardiaco en reposo', camara?.bpm, 'bpm', (v) => `${Math.round(v)} lpm`, 'real', [60, 100]),
    fila('Fatiga visual (PERCLOS)', camara?.perclos, 'perclos', (v) => v.toFixed(2), 'real', [0, 0.15]),
    fila('Tiempo de reacción', cognitivo?.reaccionMs, 'reaccionMs', (v) => `${Math.round(v)} ms`, 'real'),
    fila('Memoria corta', cognitivo?.memoria, 'memoria', (v) => `${Math.round(v)} casillas`, 'real'),
    fila('Presión sistólica', registro?.presionSis, 'presionSis', (v) => `${Math.round(v)} mmHg`, 'self', [90, 140]),
    fila('Horas de sueño', sueno?.horas, 'suenoHoras', (v) => `${v.toFixed(1)} h`, 'self', [6, 12]),
    fila('Ánimo', registro?.animo, 'animo', (v) => `${v.toFixed(v % 1 ? 1 : 0)} de 5`, 'self', [3, 5]),
    fila('Estrés', registro?.estres, 'estres', (v) => `${v.toFixed(v % 1 ? 1 : 0)} de 10`, 'self', [0, 6]),
  ]
  const nSintomas = registro?.sintomas.length ?? 0
  filas.push({ nombre: 'Síntomas', hoy: nSintomas ? `${nSintomas}: ${registro?.sintomas.map((s) => s.nombre.toLowerCase()).join(', ')}` : 'ninguno', normal: '—', capa: 'self', estado: nSintomas >= 2 ? 'warn' : 'ok' })

  // Recomendaciones según lo medido hoy
  const tareas: { titulo: string; motivo: string; nivel: 'warn' | 'info' }[] = []
  if (camara?.perclos != null && camara.perclos > 0.15) tareas.push({ titulo: 'Descansa 20 min de pantallas', motivo: `PERCLOS de ${camara.perclos.toFixed(2)}, arriba del umbral de fatiga`, nivel: 'warn' })
  if (sueno && sueno.horas < 6) tareas.push({ titulo: 'Prioriza dormir esta noche', motivo: `Dormiste ${sueno.horas.toFixed(1)} h, menos de 6 h es deuda de sueño`, nivel: 'warn' })
  if (registro?.presionSis != null && (registro.presionSis >= 140 || (registro.presionDia ?? 0) >= 90)) tareas.push({ titulo: 'Repite la presión en 5 minutos', motivo: 'Salió arriba del rango clínico de referencia', nivel: 'warn' })
  if (registro?.estres != null && registro.estres >= 7) tareas.push({ titulo: 'Haz 5 minutos de respiración lenta', motivo: `Reportaste estrés de ${registro.estres} de 10`, nivel: 'warn' })
  if (registro?.sintomas.some((s) => s.id === 'fiebre')) tareas.push({ titulo: 'Tómate la temperatura', motivo: 'Reportaste fiebre o escalofríos', nivel: 'warn' })
  if (camara && camara.bpm == null) tareas.push({ titulo: 'Repite el chequeo con cámara con mejor luz', motivo: 'Hoy no hubo señal clara de ritmo cardiaco', nivel: 'info' })
  if (!tareas.some((t) => t.nivel === 'warn')) tareas.unshift({ titulo: 'Todo dentro de tu normal', motivo: 'Sigue con tu rutina de hoy', nivel: 'info' })

  const enviarNota = async () => {
    const r = await api.encolar({
      tipo: 'reporte',
      prioridad: 3,
      tamano: Math.max(1.5, mediciones.length * 0.25),
      payload: { titulo: 'Resumen clínico del chequeo de hoy', nota: nota.trim(), mediciones: mediciones.map(({ tipo, valor, capa }) => ({ tipo, valor, capa })) },
    })
    if (r) setNotaEnviada(true)
  }

  const dias = racha([...previas, { fecha: new Date().toISOString() } as Sesion])
  const bajaConfianzaRitmo = camara?.bpm != null && camara.confianza < CONFIANZA_BUENA

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div>
          <p className="k">Chequeo diario · paso 5 de 5</p>
          <h1 className="h1">Resumen de hoy</h1>
        </div>
        <StepBar actual={4} />
      </header>

      <div className="flex flex-wrap gap-5">
        <section className="card flex min-w-0 flex-[2_1_380px] items-center gap-[22px] p-[26px]" aria-labelledby="done">
          <span className="grid h-[72px] w-[72px] flex-none animate-pop place-items-center rounded-[22px] border border-[#1E5A43] bg-[#0E2A20]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3DDC97" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 id="done" className="m-0 font-display text-[22px] font-semibold">Chequeo completo</h2>
            <p className="m-0 text-sm leading-normal text-soft">
              Racha de <strong className="num text-ink">{dias} {dias === 1 ? 'día' : 'días'}</strong>.{' '}
              {envio === 'enviando' && 'Guardando…'}
              {envio === 'guardado' && `Se guardaron ${mediciones.length} mediciones a bordo y en el sistema`}
              {envio === 'sin_back' && 'Guardado en este dispositivo, se enviará cuando haya conexión con el back'}
            </p>
          </div>
        </section>
        <section className="card flex min-w-0 flex-[1_1_260px] flex-col gap-2.5" aria-labelledby="ready">
          <h2 id="ready" className="k">Disposición para la misión</h2>
          {conectado ? (
            <>
              <p className="big text-[40px]" style={{ color: status.readiness >= 85 ? '#3DDC97' : status.readiness >= 65 ? '#F5B544' : '#FF6B7A' }}>{status.readiness}</p>
              <div className="h-2 rounded bg-line"><div className="h-full rounded transition-all duration-700" style={{ width: `${status.readiness}%`, background: status.readiness >= 85 ? '#3DDC97' : status.readiness >= 65 ? '#F5B544' : '#FF6B7A' }} /></div>
            </>
          ) : (
            <p className="m-0 text-sm text-soft">Se calcula cuando se conecte el back</p>
          )}
        </section>
        <section className="card flex min-w-0 flex-[1_1_260px] flex-col gap-2.5" aria-labelledby="calib">
          <h2 id="calib" className="k">Calibración del modelo</h2>
          {conectado ? (
            <>
              <p className="big text-[40px] text-accent">{status.calibracion}%</p>
              <div className="h-2 rounded bg-line"><div className="h-full rounded bg-accent transition-all duration-700" style={{ width: `${status.calibracion}%` }} /></div>
            </>
          ) : (
            <p className="m-0 text-sm text-soft">{previas.length + 1} chequeos registrados en este dispositivo</p>
          )}
        </section>
      </div>

      <section className="card overflow-hidden p-0" aria-labelledby="med">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-[18px] pb-3 pt-5">
          <h2 id="med" className="h2">Lo que se midió hoy</h2>
          <span className="text-[13px] text-soft">Comparado contra tu propio normal</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="trow min-h-[38px]" style={{ gridTemplateColumns: '14px 2fr 1.4fr 1.2fr 0.8fr' }}>
              <span />
              <span className="k">Indicador</span>
              <span className="k">Hoy</span>
              <span className="k">Tu normal</span>
              <span className="k">Capa</span>
            </div>
            {filas.map((f) => (
              <div key={f.nombre} className="trow" style={{ gridTemplateColumns: '14px 2fr 1.4fr 1.2fr 0.8fr' }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[f.estado] }} />
                <span>{f.nombre}</span>
                <span className="num font-bold" style={{ color: f.estado === 'warn' ? '#F5B544' : f.estado === 'none' ? '#93A0B8' : '#E8ECF4' }}>
                  {f.hoy}
                  {f.nombre.startsWith('Ritmo') && bajaConfianzaRitmo && <span className="ml-2 text-[11px] font-semibold text-warn">baja confianza</span>}
                </span>
                <span className="num text-soft">{f.normal}</span>
                <span><span className={`tag ${f.capa === 'real' ? 'real' : 'self'}`}>{f.capa === 'real' ? 'Real' : 'Auto'}</span></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-5">
        <section className="card flex min-w-0 flex-[1_1_420px] flex-col gap-3" aria-labelledby="hacer">
          <h2 id="hacer" className="h2">Qué hacer hoy</h2>
          {tareas.map((t) => (
            <div
              key={t.titulo}
              className={`flex items-center gap-3.5 rounded-[14px] px-4 py-3.5 ${t.nivel === 'warn' ? 'border border-[#5C4A1C] bg-[#241D0D]' : 'border border-line bg-nav'}`}
            >
              <span className={`h-2.5 w-2.5 flex-none rounded-full ${t.nivel === 'warn' ? 'bg-warn' : 'bg-accent'}`} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <strong className="text-[15px]">{t.titulo}</strong>
                <span className={`text-[13px] ${t.nivel === 'warn' ? 'text-[#DCCB9F]' : 'text-soft'}`}>{t.motivo}</span>
              </span>
            </div>
          ))}
        </section>
        <section className="card flex min-w-0 flex-[1_1_300px] flex-col gap-3" aria-labelledby="nota">
          <h2 id="nota" className="h2">Nota para el flight surgeon</h2>
          <label className="flex flex-col gap-2 text-[13px] font-medium text-soft">
            Opcional, viaja con el resumen hacia Tierra
            <textarea
              rows={3}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. dormí mal por ruido en el módulo"
              className="box-border w-full resize-y rounded-xl border border-line-strong bg-nav px-3.5 py-3 text-[15px] text-ink"
            />
          </label>
          {conectado ? (
            <button type="button" className="btn sec self-start" onClick={enviarNota} disabled={notaEnviada}>
              {notaEnviada ? 'En la cola hacia Tierra' : 'Enviar resumen a Tierra'}
            </button>
          ) : (
            <p className="m-0 text-xs text-muted">Se podrá enviar cuando haya conexión con el back</p>
          )}
        </section>
      </div>

      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className="btn sec" onClick={onAtras}>Atrás</button>
        <button type="button" className="btn sec" onClick={onIndicadores}>Ver indicadores</button>
        <button type="button" className="btn pri" onClick={onInicio}>Volver al inicio</button>
      </div>
    </div>
  )
}
