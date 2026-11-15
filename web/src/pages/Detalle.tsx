import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine,
} from 'recharts'
import { PageHeader, Segmented } from '../components/ui/Page'
import { api, type IndicadorApi } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { tuNormal, useChequeoStore, type Sesion } from '../features/chequeo/chequeoStore'

type Range = 7 | 30 | 60

// Qué es cada indicador. Los valores salen del back (GET /indicators) o, si no hay back,
// del historial de chequeos guardado en este dispositivo. Aquí no hay datos de ejemplo
type Meta = {
  label: string
  name: string
  sys: string
  tipo: string // tipo en el back
  campo: keyof Sesion // campo en el historial local
  unit: string
  dec: number
  clin: string
  experimental?: boolean
}

const META: Record<string, Meta> = {
  hr: { label: 'Ritmo cardiaco', name: 'Ritmo cardiaco en reposo', sys: 'Cardiovascular', tipo: 'hr_reposo', campo: 'bpm', unit: 'lpm', dec: 0, clin: '60 a 100' },
  hrv: { label: 'VFC', name: 'Variabilidad del ritmo (RMSSD)', sys: 'Cardiovascular', tipo: 'hrv_rmssd', campo: 'rmssd', unit: 'ms', dec: 0, clin: 'n/a', experimental: true },
  resp: { label: 'Respiración', name: 'Respiración en reposo', sys: 'Cardiovascular', tipo: 'resp_rpm', campo: 'respRpm', unit: 'resp/min', dec: 0, clin: '12 a 20', experimental: true },
  bp: { label: 'Presión arterial', name: 'Presión sistólica', sys: 'Cardiovascular', tipo: 'presion_sis', campo: 'presionSis', unit: 'mmHg', dec: 0, clin: '90 a 140' },
  perclos: { label: 'PERCLOS', name: 'Fatiga visual (PERCLOS)', sys: 'Sueño y fatiga', tipo: 'perclos', campo: 'perclos', unit: '', dec: 2, clin: '< 0.15' },
  sleep: { label: 'Sueño', name: 'Horas de sueño', sys: 'Sueño y fatiga', tipo: 'sueno_horas', campo: 'suenoHoras', unit: 'h', dec: 1, clin: '7 a 9' },
  rt: { label: 'Tiempo de reacción', name: 'Tiempo de reacción', sys: 'Mental y cognitivo', tipo: 'reaccion_ms', campo: 'reaccionMs', unit: 'ms', dec: 0, clin: '< 350' },
  mood: { label: 'Ánimo', name: 'Ánimo reportado', sys: 'Mental y cognitivo', tipo: 'animo', campo: 'animo', unit: 'de 5', dec: 1, clin: 'n/a' },
  expr: { label: 'Expresividad', name: 'Expresividad facial', sys: 'Mental y cognitivo', tipo: 'expresividad', campo: 'expresividad', unit: 'de 100', dec: 0, clin: 'n/a' },
}

const FUENTES: Record<string, string> = {
  camara: 'Cámara', prueba: 'Prueba cognitiva', manual: 'Autorreportado', apple_watch: 'Apple Watch', simulador: 'Simulador', modelo: 'Modelo',
}

type Punto = { fecha: string; valor: number; capa: string; fuente: string; confianza: number | null }

const fechaCorta = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()} ${d.toLocaleString('es-MX', { month: 'short' }).replace('.', '')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function Detalle() {
  const { tipo = 'hr' } = useParams()
  const key = META[tipo] ? tipo : 'hr'
  const d = META[key]
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>(30)
  const conectado = useAppStore((s) => s.connection) === 'connected'
  const status = useAppStore((s) => s.status) // cambia con cada medición nueva, sirve para refrescar
  const historial = useChequeoStore((s) => s.historial)
  const [remoto, setRemoto] = useState<IndicadorApi | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!conectado) {
      setRemoto(null)
      return
    }
    let vivo = true
    setCargando(true)
    void api.indicador(d.tipo, `${range}d`).then((r) => {
      if (!vivo) return
      setRemoto(r)
      setCargando(false)
    })
    return () => {
      vivo = false
    }
  }, [conectado, d.tipo, range, status])

  // La expresividad se guarda de 0 a 1 y se muestra de 0 a 100
  const escala = key === 'expr' ? 100 : 1

  const { puntos, media, sd, n, origen } = useMemo(() => {
    if (remoto) {
      return {
        puntos: remoto.serie.map((p) => ({ ...p, valor: p.valor * escala })) as Punto[],
        media: remoto.linea_base.media != null && remoto.linea_base.n >= 3 ? remoto.linea_base.media * escala : null,
        sd: remoto.linea_base.desviacion != null ? remoto.linea_base.desviacion * escala : null,
        n: remoto.linea_base.n,
        origen: 'back' as const,
      }
    }
    // Sin back: el historial de chequeos de este dispositivo
    const desde = Date.now() - range * 86_400_000
    const locales: Punto[] = historial
      .filter((s) => new Date(s.fecha).getTime() >= desde && typeof s[d.campo] === 'number')
      .map((s) => ({
        fecha: s.fecha,
        valor: (s[d.campo] as number) * escala,
        capa: ['bp', 'sleep', 'mood'].includes(key) ? 'auto' : 'real',
        fuente: ['bp', 'sleep', 'mood'].includes(key) ? 'manual' : key === 'rt' ? 'prueba' : 'camara',
        confianza: null,
      }))
    const normal = tuNormal(historial.slice(0, -1), d.campo)
    return {
      puntos: locales,
      media: normal.media != null ? normal.media * escala : null,
      sd: normal.sd != null ? normal.sd * escala : null,
      n: normal.n,
      origen: 'local' as const,
    }
  }, [remoto, historial, range, d.campo, key, escala])

  const upper = media != null && sd ? media + 2 * sd : null
  const lower = media != null && sd ? media - 2 * sd : null
  const fuera = (v: number) => upper != null && lower != null && (v > upper || v < lower)
  const data = puntos.map((p, i) => ({ i, label: fechaCorta(p.fecha), v: Number(p.valor.toFixed(d.dec + 1)), anom: fuera(p.valor) }))
  const ultimo = puntos[puntos.length - 1]
  const hoy = ultimo?.valor ?? null
  const z = hoy != null && media != null && sd ? (hoy - media) / sd : null
  const f = (v: number) => v.toFixed(d.dec)

  let head = `Todavía no hay mediciones de ${d.label.toLowerCase()}, haz un chequeo diario para empezar`
  let explain = 'Cada chequeo agrega un punto a esta gráfica'
  if (hoy != null) {
    if (media == null) {
      head = `Aprendiendo tu normal: ${n} de 3 mediciones`
      explain = 'Con 3 mediciones ya se puede comparar contra ti; mientras tanto se usa el rango clínico de referencia'
    } else if (z != null && Math.abs(z) >= 2) {
      head = `Tu última medición salió de tu rango normal (${z > 0 ? 'arriba' : 'abajo'})`
      explain = `Está a ${Math.abs(z).toFixed(1)} desviaciones de tu promedio. Un valor aislado no es grave, lo que cuenta es si se repite`
    } else {
      head = `Tu ${d.label.toLowerCase()} está dentro de tu rango normal`
      explain = 'Las alertas comparan contra tu propio normal, no solo contra el rango clínico'
    }
  }
  if (d.experimental) explain += '. Señal experimental: se guarda y se compara, pero no levanta alertas'

  const valores = data.map((p) => p.v).concat(upper != null && lower != null ? [upper, lower] : [])
  const min = valores.length ? Math.min(...valores) : 0
  const max = valores.length ? Math.max(...valores) : 1
  const margen = (max - min) * 0.15 || Math.max(1, Math.abs(max) * 0.1)
  const dominio: [number, number] = [Number((min - margen).toFixed(d.dec + 1)), Number((max + margen).toFixed(d.dec + 1))]

  const ultimas = [...puntos].reverse().slice(0, 6)

  return (
    <>
      <PageHeader
        kicker={`Indicadores · ${d.sys}`}
        title={d.name}
        right={
          <Segmented<Range>
            label="Rango de tiempo"
            value={range}
            onChange={setRange}
            options={[{ value: 7, label: '7 días' }, { value: 30, label: '30 días' }, { value: 60, label: 'Misión' }]}
          />
        }
      />

      <div role="group" aria-label="Indicador" className="flex flex-wrap gap-2">
        {Object.entries(META).map(([k, ind]) => (
          <button key={k} type="button" className="chip" aria-pressed={k === key} onClick={() => navigate(`/indicators/${k}`)}>
            <span className="w-2 h-2 rounded-full" style={{ background: ind.experimental ? '#F5B544' : '#5CC8F5' }} />
            {ind.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-col gap-3.5" style={{ flex: '3 1 540px', minWidth: 0 }} aria-labelledby="graf">
          <h2 id="graf" className="h2" style={{ fontSize: 17, lineHeight: 1.4 }}>{head}</h2>
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#2F3F60] text-center" style={{ height: 300 }}>
              <p className="m-0 text-sm text-[#A3AEC4]">{cargando ? 'Cargando…' : 'Sin mediciones en este rango'}</p>
              <button type="button" className="btn pri" onClick={() => navigate('/camera')}>Hacer chequeo</button>
            </div>
          ) : (
            <div style={{ width: '100%', height: 300 }} role="img" aria-label={`${d.name} de los últimos ${range} días contra tu línea base`}>
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1C2740" vertical={false} />
                  <XAxis dataKey="label" stroke="#46536F" tick={{ fill: '#93A0B8', fontSize: 11 }} interval="preserveStartEnd" tickLine={false} />
                  <YAxis domain={dominio} stroke="#46536F" tick={{ fill: '#93A0B8', fontSize: 11, fontFamily: 'JetBrains Mono' }} width={44} tickLine={false} tickFormatter={(v: number) => v.toFixed(d.dec)} />
                  {upper != null && lower != null && (
                    <ReferenceArea y1={lower} y2={upper} fill="#5CC8F5" fillOpacity={0.09} stroke="none"
                      label={{ value: `Tu rango normal ${f(lower)} a ${f(upper)}`, position: 'insideTopLeft', fill: '#8AD9F8', fontSize: 11 }} />
                  )}
                  {media != null && <ReferenceLine y={media} stroke="#5CC8F5" strokeOpacity={0.55} strokeDasharray="5 5" />}
                  <Tooltip
                    contentStyle={{ background: '#0E1422', border: '1px solid #2F3F60', borderRadius: 10, fontSize: 12 }}
                    labelStyle={{ color: '#93A0B8' }}
                    formatter={(v: number) => [`${v.toFixed(d.dec)} ${d.unit}`, d.label]}
                  />
                  <Area type="monotone" dataKey="v" stroke="none" fill="#E8ECF4" fillOpacity={0.04} isAnimationActive />
                  <Line
                    type="monotone" dataKey="v" stroke="#E8ECF4" strokeWidth={2.2} isAnimationActive
                    dot={(p: { cx?: number; cy?: number; index?: number; payload?: { anom: boolean } }) => (
                      <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload?.anom ? 5 : 3} fill={p.payload?.anom ? '#F5B544' : '#E8ECF4'} stroke="#0E1422" strokeWidth={2} />
                    )}
                    activeDot={{ r: 5, fill: '#5CC8F5' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-[#A3AEC4]">
            <span className="inline-flex items-center gap-2"><span className="w-4 h-2 rounded-sm" style={{ background: 'rgba(92,200,245,0.3)' }} />Tu rango normal</span>
            <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#F5B544]" />Fuera de tu rango</span>
            <span className="ml-auto text-[#93A0B8]">{origen === 'back' ? 'Datos del servidor' : 'Datos de este dispositivo (sin conexión al servidor)'}</span>
          </div>
        </section>

        <div className="flex flex-col gap-4" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <section className="card grid grid-cols-2 gap-x-3.5 gap-y-4" aria-labelledby="resumen">
            <h2 id="resumen" className="h2 col-span-2">Resumen</h2>
            <div><p className="k">Último</p><p className="big" style={{ marginTop: 4, fontSize: 28, color: hoy != null && fuera(hoy) ? '#F5B544' : '#E8ECF4' }}>{hoy != null ? f(hoy) : '--'}</p></div>
            <div><p className="k">Tu normal</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{media != null ? `${f(media)}${sd ? ` ± ${f(sd)}` : ''}` : 'aprendiendo'}</p></div>
            <div><p className="k">z-score</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{z != null ? z.toFixed(1) : '--'}</p></div>
            <div><p className="k">Rango clínico</p><p className="big" style={{ marginTop: 4, fontSize: 22 }}>{d.clin}</p></div>
          </section>
          <section className="card flex flex-col gap-2.5" aria-labelledby="det">
            <h2 id="det" className="h2">Qué detectó el modelo</h2>
            <p className="m-0 text-sm leading-relaxed">{explain}</p>
          </section>
          <section className="card flex flex-col gap-2.5" aria-labelledby="fuente">
            <h2 id="fuente" className="h2">Fuente de este dato</h2>
            <p className="m-0 text-sm flex justify-between gap-2">
              <span className={`tag ${ultimo?.capa === 'auto' ? 'self' : 'real'}`}>{ultimo ? FUENTES[ultimo.fuente] ?? ultimo.fuente : '—'}</span>
              <span className="num text-[#A3AEC4]">{puntos.length} mediciones</span>
            </p>
          </section>
        </div>
      </div>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }} aria-labelledby="ult">
        <h2 id="ult" className="h2" style={{ padding: '18px 16px 10px' }}>Últimas mediciones</h2>
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="trow" style={{ gridTemplateColumns: '1.2fr 1fr 1fr .8fr 1.4fr', minHeight: 38 }}>
              <span className="k">Fecha</span><span className="k">Valor</span><span className="k">Fuente</span><span className="k">Confianza</span><span className="k">Estado</span>
            </div>
            {ultimas.length === 0 && <p className="m-0 px-4 py-4 text-sm text-[#93A0B8]">Sin mediciones todavía</p>}
            {ultimas.map((p, j) => {
              const o = fuera(p.valor)
              const c = media == null ? '#93A0B8' : o ? '#F5B544' : '#3DDC97'
              return (
                <div key={`${p.fecha}-${j}`} className="trow" style={{ gridTemplateColumns: '1.2fr 1fr 1fr .8fr 1.4fr' }}>
                  <span>{fechaCorta(p.fecha)}</span>
                  <span className="num font-bold">{f(p.valor)}{d.unit ? ` ${d.unit}` : ''}</span>
                  <span>{FUENTES[p.fuente] ?? p.fuente}</span>
                  <span className="num">{p.capa === 'auto' || p.confianza == null ? 'n/a' : p.confianza.toFixed(2)}</span>
                  <span className="inline-flex items-center gap-2" style={{ color: c }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                    {media == null ? 'Aprendiendo' : o ? 'Fuera de tu normal' : 'Normal'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
