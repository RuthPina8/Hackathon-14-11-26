import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { ShieldCheck } from 'lucide-react'
import { PageHeader, SimBanner } from '../components/ui/Page'
import { useSession } from '../store/useSession'
import { BASE, api } from '../lib/api'
import { astroNumero } from '../lib/adapters'
import type { Confiabilidad as ConfT } from '../lib/back1'
import { useChequeoStore } from '../features/chequeo/chequeoStore'
import { C } from '../lib/paleta'

const ESTADO = {
  sin_validar: ['Not validated', C.faint],
  validando: ['Validating', C.warn],
  verificado: ['Verified', C.ok],
} as const

const FUENTES = [
  { v: 'oximetro', t: 'Finger oximeter' },
  { v: 'brazalete', t: 'Blood pressure cuff' },
  { v: 'apple_watch', t: 'Apple Watch' },
  { v: 'ecg', t: 'ECG' },
  { v: 'manual', t: 'Pulse counted by hand (60 s)' },
]

export default function Confiabilidad() {
  const yo = astroNumero(useSession((s) => s.user?.id)) ?? 1
  const camara = useChequeoStore((s) => s.camara)
  const [c, setC] = useState<ConfT | null>(null)
  const [cargado, setCargado] = useState(false)
  const [hr, setHr] = useState('')
  const [fuente, setFuente] = useState('oximetro')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [ahora] = useState(() => Date.now())

  const cargar = useCallback(() => {
    void api.get<ConfT>('/validacion').then((r) => { setC(r); setCargado(true) })
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const registrar = async () => {
    setMsg(null)
    const v = Number(hr)
    if (!Number.isFinite(v) || v < 30 || v > 220) { setMsg({ ok: false, t: 'Enter a heart rate between 30 and 220 bpm' }); return }
    try {
      const r = await fetch(`${BASE}/validacion/referencia`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ astronauta_id: yo, hr_lpm: v, fuente }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) { setMsg({ ok: false, t: typeof j?.detail === 'string' ? j.detail : 'Couldn’t save it' }); return }
      setMsg({ ok: true, t: `Pair saved: camera ${j.camara} bpm vs ${j.referencia} bpm (error ${(j.camara - j.referencia).toFixed(1)})` })
      setHr('')
      cargar()
    } catch {
      setMsg({ ok: false, t: 'No server connection' })
    }
  }

  const ba = (c?.pares ?? []).map((p) => ({ x: (p.camara + p.referencia) / 2, y: p.camara - p.referencia, z: p.confianza, origen: p.origen }))
  const propios = ba.filter((p) => p.origen === 'propio')
  const publicos = ba.filter((p) => p.origen !== 'propio')
  const minutos = camara ? Math.max(0, Math.round((ahora - new Date(camara.fecha).getTime()) / 60000)) : null
  const g = c?.global

  return (
    <>
      {cargado && !c && <SimBanner tag="NO SERVER">Validation lives on the server: start the API to save and view pairs</SimBanner>}
      <PageHeader kicker="How well the camera measures" title="Camera reliability"
        right={c && <span className="tag inline-flex items-center gap-1.5" style={{ fontSize: 13, padding: '8px 12px', background: C.deep, color: ESTADO[c.estado][1], boxShadow: `inset 0 0 0 1px ${ESTADO[c.estado][1]}66` }}><ShieldCheck size={16} />{ESTADO[c.estado][0]}</span>} />

      <section className="card flex flex-col gap-3" aria-labelledby="como">
        <h2 id="como" className="h2">How trust is earned</h2>
        <p className="m-0 text-sm leading-relaxed text-subtle">
          There’s no universal threshold: rPPG studies show that a threshold calibrated with one camera and light doesn’t work for others.
          That’s why each camera reading is compared against a reference device taken at the same time, and the threshold is computed from
          <strong> our own pairs</strong>: the minimum confidence at which at least {Math.round((c?.objetivo ?? 0.9) * 100)}% of readings fall within ±{c?.tolerancia_lpm ?? 5} bpm.
        </p>
        {c && <p className="m-0 text-sm font-semibold" style={{ color: ESTADO[c.estado][1] }}>{c.explicacion}</p>}
      </section>

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-col gap-3" style={{ flex: '3 1 520px', minWidth: 0 }} aria-labelledby="ba">
          <h2 id="ba" className="h2">Bland-Altman: camera − reference difference</h2>
          {ba.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-line2 text-sm text-muted" style={{ height: 280 }}>No pairs yet</div>
          ) : (
            <div style={{ width: '100%', height: 300 }} role="img" aria-label="Bland-Altman plot">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                  <CartesianGrid stroke={C.line} />
                  <XAxis type="number" dataKey="x" name="Average" unit=" bpm" domain={['dataMin - 5', 'dataMax + 5']} stroke={C.line3} tick={{ fill: C.faint, fontSize: 13 }} tickFormatter={(v: number) => v.toFixed(0)} />
                  <YAxis type="number" dataKey="y" name="Difference" unit=" bpm" stroke={C.line3} tick={{ fill: C.faint, fontSize: 13 }} width={58} tickFormatter={(v: number) => v.toFixed(0)} />
                  <ZAxis type="number" dataKey="z" range={[30, 90]} name="Confidence" />
                  <ReferenceLine y={c?.tolerancia_lpm ?? 5} stroke={C.ok} strokeDasharray="4 4" />
                  <ReferenceLine y={-(c?.tolerancia_lpm ?? 5)} stroke={C.ok} strokeDasharray="4 4" />
                  {g?.sesgo != null && <ReferenceLine y={g.sesgo} stroke={C.accent} label={{ value: `bias ${g.sesgo}`, fill: C.accentSoft, fontSize: 13, position: 'insideTopLeft' }} />}
                  {g?.loa && <ReferenceLine y={g.loa[0]} stroke={C.warn} strokeDasharray="2 4" />}
                  {g?.loa && <ReferenceLine y={g.loa[1]} stroke={C.warn} strokeDasharray="2 4" />}
                  <Tooltip contentStyle={{ background: C.panel, border: '1px solid #2F3F60', borderRadius: 10, fontSize: 14 }} formatter={(v) => Number(v).toFixed(2)} />
                  <Scatter name="Our pairs" data={propios} fill={C.accent} />
                  <Scatter name="Public datasets" data={publicos} fill={C.self} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-accent" />Our pairs</span>
            <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-self" />Public datasets (UBFC-rPPG, PURE)</span>
            <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-ok" />±{c?.tolerancia_lpm ?? 5} bpm</span>
            <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dotted border-warn" />95% limits of agreement</span>
          </div>
        </section>

        <div className="flex flex-col gap-4" style={{ flex: '2 1 300px', minWidth: 0 }}>
          <section className="card grid grid-cols-2 gap-x-3.5 gap-y-4" aria-labelledby="met">
            <h2 id="met" className="h2 col-span-2">Metrics ({g?.n ?? 0} pairs)</h2>
            <div><p className="k">Mean error</p><p className="big" style={{ fontSize: 24, marginTop: 4 }}>{g?.mae ?? '—'}<span className="text-sm text-muted"> bpm</span></p></div>
            <div><p className="k">A ±{c?.tolerancia_lpm ?? 5} bpm</p><p className="big" style={{ fontSize: 24, marginTop: 4 }}>{g?.exito_5 != null ? `${Math.round(g.exito_5 * 100)}%` : '—'}</p></div>
            <div><p className="k">Correlation</p><p className="big" style={{ fontSize: 24, marginTop: 4 }}>{g?.pearson ?? '—'}</p></div>
            <div><p className="k">Verified threshold</p><p className="big" style={{ fontSize: 24, marginTop: 4, color: c?.umbral != null ? C.ok : undefined }}>{c?.umbral != null ? `≥ ${c.umbral.toFixed(1)}` : '—'}</p></div>
            <p className="m-0 col-span-2 text-sm text-faint leading-relaxed">
              Published reference for {c?.referencia_publicada.metodo ?? 'POS'}: {c?.referencia_publicada.mae_lpm.join(' a ') ?? '1 a 4'} bpm mean error in {c?.referencia_publicada.bases.join(' y ') ?? 'UBFC-rPPG y PURE'}. {c?.referencia_publicada.nota}
            </p>
          </section>

          <section className="card flex flex-col gap-3" aria-labelledby="ref">
            <h2 id="ref" className="h2">Log a reference</h2>
            <p className="m-0 text-[13px] text-muted leading-relaxed">
              Right after the camera check-up (15 minutes max), measure your pulse with another device and enter it.
              {camara ? ` Your last camera reading was ${minutos} min ago (${camara.bpm ?? '--'} bpm).` : ' You haven’t done the camera check-up today yet.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <select value={fuente} onChange={(e) => setFuente(e.target.value)} className="min-h-14 flex-1 rounded-xl border border-line2 bg-input px-3 text-base text-text">
                {FUENTES.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
              </select>
              <input inputMode="numeric" placeholder="bpm" value={hr} onChange={(e) => setHr(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="min-h-14 w-24 rounded-xl border border-line2 bg-input px-3 font-mono text-text" />
              <button type="button" className="btn pri sm" onClick={() => void registrar()}>Save pair</button>
            </div>
            {msg && <p role="status" className="m-0 text-[13px]" style={{ color: msg.ok ? C.okSoft : C.warn }}>{msg.t}</p>}
            {!camara && <Link to="/camera" className="text-[13px] font-semibold">Do the camera check-up</Link>}
          </section>
        </div>
      </div>

      {c && (
        <section className="card" style={{ padding: 0, overflow: 'hidden' }} aria-labelledby="tramos">
          <h2 id="tramos" className="h2" style={{ padding: '18px 16px 10px' }}>Accuracy by reading confidence</h2>
          <div className="overflow-x-auto"><div className="min-w-[480px]">
            <div className="trow" style={{ gridTemplateColumns: '1fr 1fr 1fr 2fr', minHeight: 38 }}><span className="k">Confidence ≥</span><span className="k">Pairs</span><span className="k">Mean error</span><span className="k">A ±{c.tolerancia_lpm} bpm</span></div>
            {c.tramos.map((t) => (
              <div key={t.desde} className="trow" style={{ gridTemplateColumns: '1fr 1fr 1fr 2fr', background: c.umbral === t.desde ? C.okBg : undefined }}>
                <span className="num">{t.desde.toFixed(1)}{c.umbral === t.desde ? ' ✓' : ''}</span>
                <span className="num">{t.n}</span>
                <span className="num">{t.mae ?? '—'}</span>
                <span className="flex items-center gap-2">
                  <span className="h-2 flex-1 rounded bg-line"><span className="block h-full rounded" style={{ width: `${(t.exito_5 ?? 0) * 100}%`, background: (t.exito_5 ?? 0) >= c.objetivo ? C.ok : C.warn }} /></span>
                  <span className="num w-12 text-right">{t.exito_5 != null ? `${Math.round(t.exito_5 * 100)}%` : '—'}</span>
                </span>
              </div>
            ))}
          </div></div>
          <p className="m-0 px-4 py-3 text-sm text-faint leading-relaxed">
            To add public datasets: download UBFC-rPPG or PURE (their authors require registration) and run <code>python -m ml.validar_dataset --base ubfc --ruta … --api {BASE || 'http://localhost:8000'}</code> from <code>api/</code>.
          </p>
        </section>
      )}
    </>
  )
}
