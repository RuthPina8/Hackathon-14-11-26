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
import { C } from '../lib/paleta'

// Indicadores con los que se calcula la calibración general (mismos pesos que motor.md §3)
const FILAS = [
  { tipo: 'hr_reposo', ind: 'Heart rate', capa: 'real', peso: 0.25 },
  { tipo: 'perclos', ind: 'PERCLOS', capa: 'real', peso: 0.25 },
  { tipo: 'reaccion_ms', ind: 'Reaction time', capa: 'real', peso: 0.2 },
  { tipo: 'presion_sis', ind: 'Blood pressure', capa: 'self', peso: 0.15 },
  { tipo: 'animo', ind: 'Mood', capa: 'self', peso: 0.15 },
] as const

const EJEMPLO: Record<string, number> = { hr_reposo: 34, perclos: 34, reaccion_ms: 3, presion_sis: 8, animo: 9 }

const FASES = [
  { id: 'tierra', t: 'Baseline on Earth', d: 'Before launch: it learns your normal under gravity (the team’s measurements at the hackathon)' },
  { id: 'adaptacion', t: 'Adaptation', d: 'Mission days 1 to 14: alerts only on clinical ranges because the body changes on its own' },
  { id: 'personal', t: 'Personal baseline', d: 'From day 15: your normal in this environment, used to detect anomalies' },
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
    if (f.size > 25 * 1024 * 1024) { setErrorWatch('The file is over 25 MB, export fewer days'); return }
    setSubiendo(true)
    try {
      const datos = JSON.parse(await f.text())
      const r = await fetch(`${BASE}/ingest/apple-health?astronauta_id=${yo}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
      })
      if (!r.ok) {
        const e = await r.json().catch(() => null)
        setErrorWatch(typeof e?.detail === 'string' ? e.detail : 'The server didn’t accept the file')
      } else {
        setIngesta(await r.json())
        void useAppStore.getState().refreshBack1()
      }
    } catch {
      setErrorWatch('It’s not a valid Health Auto Export JSON')
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
      {!statusReal && <SimBanner tag="SAMPLE DATA">No engine connection: calibration and baseline are sample data</SimBanner>}
      <PageHeader
        kicker={`${user?.nombre ?? ''} · ${user?.cargo ?? ''}`}
        title="Profile and calibration"
        right={<div className="flex items-baseline gap-2.5"><p className="big" style={{ fontSize: 40, color: C.accent }}>{status.calibracion}%</p><span className="text-[13px] text-muted">overall calibration</span></div>}
      />

      <section className="card flex flex-col gap-[18px]" aria-labelledby="fases">
        <h2 id="fases" className="h2">Phases of your baseline</h2>
        <ol className="m-0 p-0 list-none grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
          {FASES.map((f, i) => {
            const estado = i < idxFase ? 'done' : i === idxFase ? 'now' : 'next'
            const avance = estado === 'done' ? 100 : estado === 'now' ? (f.id === 'adaptacion' ? (Math.min(status.diaMision, 14) / 14) * 100 : f.id === 'tierra' ? 50 : Math.min(100, status.calibracion)) : 0
            return (
              <li key={f.t} className="flex flex-col gap-2.5" style={{ opacity: estado === 'next' ? 0.6 : 1 }}>
                <span className="flex items-center gap-2.5">
                  {estado === 'done'
                    ? <span className="w-7 h-7 rounded-full bg-ok text-on-accent grid place-items-center shrink-0"><Check size={15} strokeWidth={3} /></span>
                    : <span className="w-7 h-7 rounded-full bg-accent-bg border-2 border-accent grid place-items-center shrink-0">{estado === 'now' && <span className="w-2 h-2 rounded-full bg-accent" />}</span>}
                  <span className="flex-1 h-[3px] rounded bg-line">
                    <motion.span className="block h-full rounded" style={{ background: estado === 'done' ? C.ok : C.accent }} initial={{ width: 0 }} animate={{ width: `${avance}%` }} transition={{ delay: i * 0.2 }} />
                  </span>
                </span>
                <span className="k" style={{ color: estado === 'done' ? C.okSoft : C.accentSoft }}>
                  {estado === 'done' ? 'Complete' : estado === 'now' ? (f.id === 'adaptacion' ? `In progress · day ${status.diaMision} of 14` : 'In progress') : 'Next'}
                </span>
                <strong className="text-[15px]">{f.t}</strong>
                <span className="text-[13px] text-muted leading-relaxed">{f.d}</span>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="flex flex-wrap gap-5">
        <section className="card" style={{ flex: '3 1 540px', minWidth: 0, padding: 0, overflow: 'hidden' }} aria-labelledby="ind">
          <h2 id="ind" className="h2" style={{ padding: '20px 18px 12px' }}>Calibration by indicator</h2>
          <div className="overflow-x-auto"><div className="min-w-[560px]">
            <div className="trow" style={{ ...cols, minHeight: 38 }}><span className="k">Indicator</span><span className="k">Layer</span><span className="k">Data</span><span className="k">Weight</span><span className="k">Your normal</span></div>
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
                    <span className="h-2 flex-1 rounded bg-line"><motion.span className="block h-full rounded" style={{ background: r.capa === 'real' ? C.accent : C.self }} initial={{ width: 0 }} animate={{ width: `${w * 100}%` }} transition={{ delay: 0.1 + i * 0.08 }} /></span>
                    {ind?.linea_base.congelada && <span className="tag" title="Frozen while an alert is open" style={{ background: C.warnBg, color: C.warn }}>Frozen</span>}
                  </span>
                </div>
              )
            })}
            <div className="trow" style={cols}>
              <span>Camera mood reading</span>
              <span><span className="tag" style={{ background: C.sel, color: C.subtle }}>Estimated</span></span>
              <span className="num">{ac?.n ?? 0}</span>
              <span className="num">—</span>
              <span className="text-[13px] text-muted">
                {!ac || ac.estado === 'aprendiendo' ? `Learning (${ac?.n ?? 0} days with camera and mood)` : `Acierta ${Math.round(ac.acierto_pct ?? 0)}%`}
              </span>
            </div>
          </div></div>
          <p className="m-0 px-[18px] py-3 text-sm text-faint leading-relaxed">
            La lectura de ánimo por cámara no lee emociones: aprende cómo cambian tus señales cuando tú reportas sentirte mal. Se muestra como "estimado" y nunca alimenta tu línea base ni las alertas.
          </p>
        </section>

        <div className="flex flex-col gap-4" style={{ flex: '2 1 320px', minWidth: 0 }}>
          <section className="card flex flex-col gap-3.5" aria-labelledby="formula">
            <h2 id="formula" className="h2">How it’s computed</h2>
            <p className="num m-0 p-3.5 rounded-xl bg-input border border-line text-[17px] font-bold text-center">peso = n / (n + 7)</p>
            <label className="flex flex-col gap-1.5 text-[13px] text-muted">
              <span>Try with <strong className="num text-text">{n}</strong> data points</span>
              <input type="range" min={0} max={60} value={n} onChange={(e) => setN(Number(e.target.value))} />
            </label>
            <div role="img" aria-label={`With ${n} data points, ${pers}% your normal and ${100 - pers}% clinical range`} className="flex h-[30px] rounded-lg overflow-hidden text-[13px] font-bold">
              <motion.span animate={{ width: `${100 - pers}%` }} className="bg-track text-subtle flex items-center pl-2 whitespace-nowrap overflow-hidden">Clínico {100 - pers}%</motion.span>
              <motion.span animate={{ width: `${pers}%` }} className="bg-accent text-on-accent flex items-center justify-end pr-2 whitespace-nowrap overflow-hidden">Tú {pers}%</motion.span>
            </div>
            <p className="m-0 text-[13px] text-muted leading-relaxed">With little data the clinical range rules, with plenty your own normal rules</p>
          </section>

          <section className="card flex flex-col gap-1" aria-labelledby="fuentes">
            <h2 id="fuentes" className="h2 mb-2">Data sources</h2>
            <div className="flex justify-between items-center min-h-[44px] text-sm">
              <span>Webcam</span>
              <Link to="/reliability" className="text-[13px] font-semibold">View reliability</Link>
            </div>
            <div className="flex justify-between items-center min-h-[44px] text-sm">
              <span>Pre-mission medical record</span>
              <Link to="/record" className="text-[13px] font-semibold">Open record</Link>
            </div>
            <div className="flex justify-between items-center gap-3 min-h-[44px] text-sm">
              <span>Apple Watch <span className="text-faint">(Health Auto Export)</span></span>
              <input ref={archivo} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f) }} />
              <button type="button" className="btn sec sm" disabled={!apiEnabled || subiendo} onClick={() => archivo.current?.click()}>
                <Upload size={15} />{subiendo ? 'Uploading…' : 'Upload JSON'}
              </button>
            </div>
            {ingesta && (
              <p role="status" className="mt-1.5 mb-0 text-sm text-ok-soft leading-relaxed">
                {ingesta.guardadas} new readings ({Object.entries(ingesta.por_tipo).map(([k, v]) => `${v} ${k}`).join(', ') || 'ninguna'}){ingesta.duplicadas ? `, ${ingesta.duplicadas} were already there` : ''}{ingesta.ignoradas ? `, ${ingesta.ignoradas} metrics we don’t use` : ''}
              </p>
            )}
            {errorWatch && <p role="alert" className="mt-1.5 mb-0 text-sm text-warn">{errorWatch}</p>}
            <p className="mt-1.5 mb-0 text-sm text-faint leading-relaxed">
              Del reloj se toman ritmo en reposo, VFC (SDNN) y sueño, con confianza 0.95. No da presión arterial.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
