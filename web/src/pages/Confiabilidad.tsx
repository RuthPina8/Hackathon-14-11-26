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

const ESTADO = {
  sin_validar: ['Sin validar', '#93A0B8'],
  validando: ['Validando', '#F5B544'],
  verificado: ['Verificado', '#3DDC97'],
} as const

const FUENTES = [
  { v: 'oximetro', t: 'Oxímetro de dedo' },
  { v: 'brazalete', t: 'Brazalete de presión' },
  { v: 'apple_watch', t: 'Apple Watch' },
  { v: 'ecg', t: 'ECG' },
  { v: 'manual', t: 'Pulso contado a mano (60 s)' },
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
    if (!Number.isFinite(v) || v < 30 || v > 220) { setMsg({ ok: false, t: 'Escribe un ritmo entre 30 y 220 lpm' }); return }
    try {
      const r = await fetch(`${BASE}/validacion/referencia`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ astronauta_id: yo, hr_lpm: v, fuente }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) { setMsg({ ok: false, t: typeof j?.detail === 'string' ? j.detail : 'No se pudo registrar' }); return }
      setMsg({ ok: true, t: `Par guardado: cámara ${j.camara} lpm contra ${j.referencia} lpm (error ${(j.camara - j.referencia).toFixed(1)})` })
      setHr('')
      cargar()
    } catch {
      setMsg({ ok: false, t: 'Sin conexión con el back' })
    }
  }

  const ba = (c?.pares ?? []).map((p) => ({ x: (p.camara + p.referencia) / 2, y: p.camara - p.referencia, z: p.confianza, origen: p.origen }))
  const propios = ba.filter((p) => p.origen === 'propio')
  const publicos = ba.filter((p) => p.origen !== 'propio')
  const minutos = camara ? Math.max(0, Math.round((ahora - new Date(camara.fecha).getTime()) / 60000)) : null
  const g = c?.global

  return (
    <>
      {cargado && !c && <SimBanner tag="SIN BACK">La validación vive en el back: arranca la API para registrar y ver los pares</SimBanner>}
      <PageHeader kicker="Qué tan bien mide la cámara" title="Confiabilidad de la cámara"
        right={c && <span className="tag inline-flex items-center gap-1.5" style={{ fontSize: 13, padding: '8px 12px', background: '#0A0F1B', color: ESTADO[c.estado][1], boxShadow: `inset 0 0 0 1px ${ESTADO[c.estado][1]}66` }}><ShieldCheck size={16} />{ESTADO[c.estado][0]}</span>} />

      <section className="card flex flex-col gap-3" aria-labelledby="como">
        <h2 id="como" className="h2">Cómo se gana la confianza</h2>
        <p className="m-0 text-sm leading-relaxed text-[#C5CEDF]">
          No hay un umbral universal: los estudios de rPPG muestran que un umbral calibrado con una cámara y una luz no sirve para otras.
          Por eso cada lectura de la cámara se compara contra un aparato de referencia tomado al mismo tiempo, y el umbral se calcula con
          <strong> nuestros propios pares</strong>: la confianza mínima a la que al menos el {Math.round((c?.objetivo ?? 0.9) * 100)}% de las lecturas queda a ±{c?.tolerancia_lpm ?? 5} lpm.
        </p>
        {c && <p className="m-0 text-sm font-semibold" style={{ color: ESTADO[c.estado][1] }}>{c.explicacion}</p>}
      </section>

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-col gap-3" style={{ flex: '3 1 520px', minWidth: 0 }} aria-labelledby="ba">
          <h2 id="ba" className="h2">Bland-Altman: diferencia cámara − referencia</h2>
          {ba.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-[#2F3F60] text-sm text-[#A3AEC4]" style={{ height: 280 }}>Sin pares todavía</div>
          ) : (
            <div style={{ width: '100%', height: 300 }} role="img" aria-label="Gráfico de Bland-Altman">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                  <CartesianGrid stroke="#1C2740" />
                  <XAxis type="number" dataKey="x" name="Promedio" unit=" lpm" domain={['dataMin - 5', 'dataMax + 5']} stroke="#46536F" tick={{ fill: '#93A0B8', fontSize: 11 }} tickFormatter={(v: number) => v.toFixed(0)} />
                  <YAxis type="number" dataKey="y" name="Diferencia" unit=" lpm" stroke="#46536F" tick={{ fill: '#93A0B8', fontSize: 11 }} width={58} tickFormatter={(v: number) => v.toFixed(0)} />
                  <ZAxis type="number" dataKey="z" range={[30, 90]} name="Confianza" />
                  <ReferenceLine y={c?.tolerancia_lpm ?? 5} stroke="#3DDC97" strokeDasharray="4 4" />
                  <ReferenceLine y={-(c?.tolerancia_lpm ?? 5)} stroke="#3DDC97" strokeDasharray="4 4" />
                  {g?.sesgo != null && <ReferenceLine y={g.sesgo} stroke="#5CC8F5" label={{ value: `sesgo ${g.sesgo}`, fill: '#8AD9F8', fontSize: 11, position: 'insideTopLeft' }} />}
                  {g?.loa && <ReferenceLine y={g.loa[0]} stroke="#F5B544" strokeDasharray="2 4" />}
                  {g?.loa && <ReferenceLine y={g.loa[1]} stroke="#F5B544" strokeDasharray="2 4" />}
                  <Tooltip contentStyle={{ background: '#0E1422', border: '1px solid #2F3F60', borderRadius: 10, fontSize: 12 }} formatter={(v) => Number(v).toFixed(2)} />
                  <Scatter name="Nuestros pares" data={propios} fill="#5CC8F5" />
                  <Scatter name="Bases públicas" data={publicos} fill="#B7A4FF" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-[#A3AEC4]">
            <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#5CC8F5]" />Nuestros pares</span>
            <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#B7A4FF]" />Bases públicas (UBFC-rPPG, PURE)</span>
            <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-[#3DDC97]" />±{c?.tolerancia_lpm ?? 5} lpm</span>
            <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dotted border-[#F5B544]" />Límites de acuerdo 95%</span>
          </div>
        </section>

        <div className="flex flex-col gap-4" style={{ flex: '2 1 300px', minWidth: 0 }}>
          <section className="card grid grid-cols-2 gap-x-3.5 gap-y-4" aria-labelledby="met">
            <h2 id="met" className="h2 col-span-2">Métricas ({g?.n ?? 0} pares)</h2>
            <div><p className="k">Error medio</p><p className="big" style={{ fontSize: 24, marginTop: 4 }}>{g?.mae ?? '—'}<span className="text-sm text-[#A3AEC4]"> lpm</span></p></div>
            <div><p className="k">A ±{c?.tolerancia_lpm ?? 5} lpm</p><p className="big" style={{ fontSize: 24, marginTop: 4 }}>{g?.exito_5 != null ? `${Math.round(g.exito_5 * 100)}%` : '—'}</p></div>
            <div><p className="k">Correlación</p><p className="big" style={{ fontSize: 24, marginTop: 4 }}>{g?.pearson ?? '—'}</p></div>
            <div><p className="k">Umbral verificado</p><p className="big" style={{ fontSize: 24, marginTop: 4, color: c?.umbral != null ? '#3DDC97' : undefined }}>{c?.umbral != null ? `≥ ${c.umbral.toFixed(1)}` : '—'}</p></div>
            <p className="m-0 col-span-2 text-xs text-[#93A0B8] leading-relaxed">
              Referencia publicada de {c?.referencia_publicada.metodo ?? 'POS'}: {c?.referencia_publicada.mae_lpm.join(' a ') ?? '1 a 4'} lpm de error medio en {c?.referencia_publicada.bases.join(' y ') ?? 'UBFC-rPPG y PURE'}. {c?.referencia_publicada.nota}
            </p>
          </section>

          <section className="card flex flex-col gap-3" aria-labelledby="ref">
            <h2 id="ref" className="h2">Registrar una referencia</h2>
            <p className="m-0 text-[13px] text-[#A3AEC4] leading-relaxed">
              Justo al terminar el chequeo con cámara (máximo 15 minutos después), mide tu pulso con otro aparato y escríbelo.
              {camara ? ` Tu última lectura de cámara fue hace ${minutos} min (${camara.bpm ?? '--'} lpm).` : ' Aún no haces el chequeo con cámara hoy.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <select value={fuente} onChange={(e) => setFuente(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-[#2F3F60] bg-[#080C16] px-3 text-sm text-[#E8ECF4]">
                {FUENTES.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
              </select>
              <input inputMode="numeric" placeholder="lpm" value={hr} onChange={(e) => setHr(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="min-h-11 w-24 rounded-xl border border-[#2F3F60] bg-[#080C16] px-3 font-mono text-[#E8ECF4]" />
              <button type="button" className="btn pri sm" onClick={() => void registrar()}>Guardar par</button>
            </div>
            {msg && <p role="status" className="m-0 text-[13px]" style={{ color: msg.ok ? '#8FF0C4' : '#F5B544' }}>{msg.t}</p>}
            {!camara && <Link to="/camera" className="text-[13px] font-semibold">Hacer el chequeo con cámara</Link>}
          </section>
        </div>
      </div>

      {c && (
        <section className="card" style={{ padding: 0, overflow: 'hidden' }} aria-labelledby="tramos">
          <h2 id="tramos" className="h2" style={{ padding: '18px 16px 10px' }}>Precisión según la confianza de la lectura</h2>
          <div className="overflow-x-auto"><div className="min-w-[480px]">
            <div className="trow" style={{ gridTemplateColumns: '1fr 1fr 1fr 2fr', minHeight: 38 }}><span className="k">Confianza ≥</span><span className="k">Pares</span><span className="k">Error medio</span><span className="k">A ±{c.tolerancia_lpm} lpm</span></div>
            {c.tramos.map((t) => (
              <div key={t.desde} className="trow" style={{ gridTemplateColumns: '1fr 1fr 1fr 2fr', background: c.umbral === t.desde ? '#0E2A20' : undefined }}>
                <span className="num">{t.desde.toFixed(1)}{c.umbral === t.desde ? ' ✓' : ''}</span>
                <span className="num">{t.n}</span>
                <span className="num">{t.mae ?? '—'}</span>
                <span className="flex items-center gap-2">
                  <span className="h-2 flex-1 rounded bg-[#1C2740]"><span className="block h-full rounded" style={{ width: `${(t.exito_5 ?? 0) * 100}%`, background: (t.exito_5 ?? 0) >= c.objetivo ? '#3DDC97' : '#F5B544' }} /></span>
                  <span className="num w-12 text-right">{t.exito_5 != null ? `${Math.round(t.exito_5 * 100)}%` : '—'}</span>
                </span>
              </div>
            ))}
          </div></div>
          <p className="m-0 px-4 py-3 text-xs text-[#93A0B8] leading-relaxed">
            Para sumar bases públicas: descarga UBFC-rPPG o PURE (piden registro a sus autores) y corre <code>python -m ml.validar_dataset --base ubfc --ruta … --api {BASE || 'http://localhost:8000'}</code> desde <code>api/</code>.
          </p>
        </section>
      )}
    </>
  )
}
