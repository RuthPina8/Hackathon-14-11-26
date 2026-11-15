import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Upload } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PageHeader, SimBanner } from '../components/ui/Page'
import { useSession } from '../store/useSession'
import { api, apiEnabled, BASE } from '../lib/api'
import { astroNumero } from '../lib/adapters'
import type { ServerIndicator } from '../lib/back1'

// Indicadores con los que se calcula la calibración general (mismos pesos que motor.md §3)
const FILAS = [
  { tipo: 'hr_reposo', ind: 'Ritmo cardiaco', capa: 'real', peso: 0.25 },
  { tipo: 'perclos', ind: 'PERCLOS', capa: 'real', peso: 0.25 },
  { tipo: 'reaccion_ms', ind: 'Tiempo de reacción', capa: 'real', peso: 0.2 },
  { tipo: 'presion_sis', ind: 'Presión arterial', capa: 'self', peso: 0.15 },
  { tipo: 'animo', ind: 'Ánimo', capa: 'self', peso: 0.15 },
] as const

const EJEMPLO: Record<string, number> = { hr_reposo: 34, perclos: 34, reaccion_ms: 3, presion_sis: 8, animo: 9 }

const FASES = [
  { id: 'tierra', t: 'Línea base en Tierra', d: 'Antes del lanzamiento: aprende tu normal con gravedad (las mediciones del equipo en el hackathon)' },
  { id: 'adaptacion', t: 'Adaptación', d: 'Días 1 a 14 de misión: solo alerta por rangos clínicos porque el cuerpo cambia solo' },
  { id: 'personal', t: 'Línea base personal', d: 'Desde el día 15: tu normal en este entorno, contra el que se detectan las anomalías' },
] as const

type Ingesta = { recibidas: number; guardadas: number; duplicadas: number; ignoradas: number; por_tipo: Record<string, number> }

export default function Perfil() {
  const status = useAppStore((s) => s.status)
  const statusReal = useAppStore((s) => s.statusReal)
  const user = useSession((s) => s.user)
  const yo = astroNumero(user?.id) ?? 1
  const [n, setN] = useState(9)
  const [inds, setInds] = useState<Record<string, ServerIndicator>>({})
  const [subiendo, setSubiendo] = useState(false)
  const [ingesta, setIngesta] = useState<Ingesta | null>(null)
  const [errorWatch, setErrorWatch] = useState<string | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const pers = Math.round((n / (n + 7)) * 100)
  const cols = { gridTemplateColumns: '1.3fr .8fr .7fr .7fr 1.6fr' }

  // Línea base real de cada indicador (n y peso personal salen del motor)
  useEffect(() => {
    if (!statusReal) return
    let vivo = true
    void Promise.all(FILAS.map((f) => api.get<ServerIndicator>(`/indicators/${f.tipo}?astronauta_id=${yo}&range=mision`))).then((r) => {
      if (!vivo) return
      const m: Record<string, ServerIndicator> = {}
      r.forEach((x, i) => { if (x) m[FILAS[i].tipo] = x })
      setInds(m)
    })
    return () => { vivo = false }
  }, [statusReal, yo, status.nMediciones])

  // Apple Watch: archivo JSON de la app Health Auto Export -> POST /ingest/apple-health
  const subir = async (f: File) => {
    setErrorWatch(null)
    setIngesta(null)
    if (f.size > 25 * 1024 * 1024) { setErrorWatch('El archivo pesa más de 25 MB, exporta menos días'); return }
    setSubiendo(true)
    try {
      const datos = JSON.parse(await f.text())
      const r = await fetch(`${BASE}/ingest/apple-health?astronauta_id=${yo}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
      })
      if (!r.ok) {
        const e = await r.json().catch(() => null)
        setErrorWatch(typeof e?.detail === 'string' ? e.detail : 'El back no aceptó el archivo')
      } else {
        setIngesta(await r.json())
        void useAppStore.getState().refreshBack1()
      }
    } catch {
      setErrorWatch('No es un JSON válido de Health Auto Export')
    } finally {
      setSubiendo(false)
      if (archivo.current) archivo.current.value = ''
    }
  }

  const faseActual = status.fase ?? (status.diaMision <= 14 ? 'adaptacion' : 'personal')
  const idxFase = FASES.findIndex((f) => f.id === faseActual)
  const ac = status.animoCamara

  return (
    <>
      {!statusReal && <SimBanner tag="DATOS DE EJEMPLO">Sin conexión con el motor: la calibración y la línea base son de ejemplo</SimBanner>}
      <PageHeader
        kicker={`${user?.nombre ?? ''} · ${user?.cargo ?? ''}`}
        title="Perfil y calibración"
        right={<div className="flex items-baseline gap-2.5"><p className="big" style={{ fontSize: 40, color: '#5CC8F5' }}>{status.calibracion}%</p><span className="text-[13px] text-[#A3AEC4]">calibración general</span></div>}
      />

      <section className="card flex flex-col gap-[18px]" aria-labelledby="fases">
        <h2 id="fases" className="h2">Fases de tu línea base</h2>
        <ol className="m-0 p-0 list-none grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
          {FASES.map((f, i) => {
            const estado = i < idxFase ? 'done' : i === idxFase ? 'now' : 'next'
            const avance = estado === 'done' ? 100 : estado === 'now' ? (f.id === 'adaptacion' ? (Math.min(status.diaMision, 14) / 14) * 100 : f.id === 'tierra' ? 50 : Math.min(100, status.calibracion)) : 0
            return (
              <li key={f.t} className="flex flex-col gap-2.5" style={{ opacity: estado === 'next' ? 0.6 : 1 }}>
                <span className="flex items-center gap-2.5">
                  {estado === 'done'
                    ? <span className="w-7 h-7 rounded-full bg-[#3DDC97] text-[#04121C] grid place-items-center shrink-0"><Check size={15} strokeWidth={3} /></span>
                    : <span className="w-7 h-7 rounded-full bg-[#0B2636] border-2 border-[#5CC8F5] grid place-items-center shrink-0">{estado === 'now' && <span className="w-2 h-2 rounded-full bg-[#5CC8F5]" />}</span>}
                  <span className="flex-1 h-[3px] rounded bg-[#1C2740]">
                    <motion.span className="block h-full rounded" style={{ background: estado === 'done' ? '#3DDC97' : '#5CC8F5' }} initial={{ width: 0 }} animate={{ width: `${avance}%` }} transition={{ delay: i * 0.2 }} />
                  </span>
                </span>
                <span className="k" style={{ color: estado === 'done' ? '#8FF0C4' : '#8AD9F8' }}>
                  {estado === 'done' ? 'Completa' : estado === 'now' ? (f.id === 'adaptacion' ? `En curso · día ${status.diaMision} de 14` : 'En curso') : 'Siguiente'}
                </span>
                <strong className="text-[15px]">{f.t}</strong>
                <span className="text-[13px] text-[#A3AEC4] leading-relaxed">{f.d}</span>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="flex flex-wrap gap-5">
        <section className="card" style={{ flex: '3 1 540px', minWidth: 0, padding: 0, overflow: 'hidden' }} aria-labelledby="ind">
          <h2 id="ind" className="h2" style={{ padding: '20px 18px 12px' }}>Calibración por indicador</h2>
          <div className="overflow-x-auto"><div className="min-w-[560px]">
            <div className="trow" style={{ ...cols, minHeight: 38 }}><span className="k">Indicador</span><span className="k">Capa</span><span className="k">Datos</span><span className="k">Peso</span><span className="k">Tu normal</span></div>
            {FILAS.map((r, i) => {
              const ind = inds[r.tipo]
              const datos = statusReal ? ind?.linea_base.n ?? 0 : EJEMPLO[r.tipo]
              const w = statusReal ? ind?.linea_base.peso_personal ?? 0 : datos / (datos + 7)
              return (
                <div key={r.ind} className="trow" style={cols}>
                  <span>{r.ind}</span>
                  <span><span className={`tag ${r.capa}`}>{r.capa === 'real' ? 'Real' : 'Auto'}</span></span>
                  <span className="num">{datos}</span>
                  <span className="num">{w.toFixed(2)}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 rounded bg-[#1C2740]"><motion.span className="block h-full rounded" style={{ background: r.capa === 'real' ? '#5CC8F5' : '#B7A4FF' }} initial={{ width: 0 }} animate={{ width: `${w * 100}%` }} transition={{ delay: 0.1 + i * 0.08 }} /></span>
                    {ind?.linea_base.congelada && <span className="tag" title="Congelada mientras hay una alerta abierta" style={{ background: '#241D0D', color: '#F5B544' }}>Congelada</span>}
                  </span>
                </div>
              )
            })}
            <div className="trow" style={cols}>
              <span>Lectura de ánimo por cámara</span>
              <span><span className="tag" style={{ background: '#15233B', color: '#C5CEDF' }}>Estimado</span></span>
              <span className="num">{ac?.n ?? 0}</span>
              <span className="num">—</span>
              <span className="text-[13px] text-[#A3AEC4]">
                {!ac || ac.estado === 'aprendiendo' ? `Aprendiendo (${ac?.n ?? 0} días con cámara y ánimo)` : `Acierta ${Math.round(ac.acierto_pct ?? 0)}%`}
              </span>
            </div>
          </div></div>
          <p className="m-0 px-[18px] py-3 text-xs text-[#93A0B8] leading-relaxed">
            La lectura de ánimo por cámara no lee emociones: aprende cómo cambian tus señales cuando tú reportas sentirte mal. Se muestra como "estimado" y nunca alimenta tu línea base ni las alertas.
          </p>
        </section>

        <div className="flex flex-col gap-4" style={{ flex: '2 1 320px', minWidth: 0 }}>
          <section className="card flex flex-col gap-3.5" aria-labelledby="formula">
            <h2 id="formula" className="h2">Cómo se calcula</h2>
            <p className="num m-0 p-3.5 rounded-xl bg-[#080C16] border border-[#1C2740] text-[17px] font-bold text-center">peso = n / (n + 7)</p>
            <label className="flex flex-col gap-1.5 text-[13px] text-[#A3AEC4]">
              <span>Prueba con <strong className="num text-[#E8ECF4]">{n}</strong> datos</span>
              <input type="range" min={0} max={60} value={n} onChange={(e) => setN(Number(e.target.value))} />
            </label>
            <div role="img" aria-label={`Con ${n} datos, ${pers}% tu normal y ${100 - pers}% rango clínico`} className="flex h-[30px] rounded-lg overflow-hidden text-[11px] font-bold">
              <motion.span animate={{ width: `${100 - pers}%` }} className="bg-[#22314F] text-[#C5CEDF] flex items-center pl-2 whitespace-nowrap overflow-hidden">Clínico {100 - pers}%</motion.span>
              <motion.span animate={{ width: `${pers}%` }} className="bg-[#5CC8F5] text-[#04121C] flex items-center justify-end pr-2 whitespace-nowrap overflow-hidden">Tú {pers}%</motion.span>
            </div>
            <p className="m-0 text-[13px] text-[#A3AEC4] leading-relaxed">Con pocos datos manda el rango clínico, con muchos manda tu propio normal</p>
          </section>

          <section className="card flex flex-col gap-1" aria-labelledby="fuentes">
            <h2 id="fuentes" className="h2 mb-2">Fuentes de datos</h2>
            <div className="flex justify-between items-center min-h-[44px] text-sm">
              <span>Cámara web</span>
              <Link to="/reliability" className="text-[13px] font-semibold">Ver confiabilidad</Link>
            </div>
            <div className="flex justify-between items-center min-h-[44px] text-sm">
              <span>Ficha médica pre-misión</span>
              <Link to="/record" className="text-[13px] font-semibold">Abrir ficha</Link>
            </div>
            <div className="flex justify-between items-center gap-3 min-h-[44px] text-sm">
              <span>Apple Watch <span className="text-[#93A0B8]">(Health Auto Export)</span></span>
              <input ref={archivo} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f) }} />
              <button type="button" className="btn sec sm" disabled={!apiEnabled || subiendo} onClick={() => archivo.current?.click()}>
                <Upload size={15} />{subiendo ? 'Subiendo…' : 'Subir JSON'}
              </button>
            </div>
            {ingesta && (
              <p role="status" className="mt-1.5 mb-0 text-xs text-[#8FF0C4] leading-relaxed">
                {ingesta.guardadas} lecturas nuevas ({Object.entries(ingesta.por_tipo).map(([k, v]) => `${v} ${k}`).join(', ') || 'ninguna'}){ingesta.duplicadas ? `, ${ingesta.duplicadas} ya estaban` : ''}{ingesta.ignoradas ? `, ${ingesta.ignoradas} métricas que no usamos` : ''}
              </p>
            )}
            {errorWatch && <p role="alert" className="mt-1.5 mb-0 text-xs text-[#F5B544]">{errorWatch}</p>}
            <p className="mt-1.5 mb-0 text-xs text-[#93A0B8] leading-relaxed">
              Del reloj se toman ritmo en reposo, VFC (SDNN) y sueño, con confianza 0.95. No da presión arterial.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
