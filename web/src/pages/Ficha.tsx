import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Download, Save, Upload, X } from 'lucide-react'
import { PageHeader, SimBanner } from '../components/ui/Page'
import { useSession } from '../store/useSession'
import { useAppStore } from '../store/useAppStore'
import { BASE, api, apiEnabled } from '../lib/api'
import { astroNumero } from '../lib/adapters'
import type { Basales, FichaMedica } from '../lib/back1'

// Ficha médica pre-misión: lo que el equipo médico registra antes del vuelo (como el expediente que
// tiene cada astronauta). Es la referencia contra la que se mide la evolución; no alimenta el motor.

const vacia = (id: number, nombre: string): FichaMedica => ({
  astronauta_id: id, nombre, fecha_nacimiento: null, sexo: '', estatura_cm: null, tipo_sangre: '',
  alergias: [], medicamentos: [], condiciones: [], cirugias: [], vacunas: [],
  basales: { hr_reposo: null, presion_sis: null, presion_dia: null, reaccion_ms: null, sueno_horas: null, hrv_rmssd: null, peso_kg: null, spo2_pct: null },
  fecha_evaluacion: null, medico: '', notas: '', actualizada: null,
})

const BASALES: { k: keyof Basales; label: string; unidad: string; min: number; max: number }[] = [
  { k: 'hr_reposo', label: 'Ritmo en reposo', unidad: 'lpm', min: 25, max: 200 },
  { k: 'presion_sis', label: 'Presión sistólica', unidad: 'mmHg', min: 60, max: 260 },
  { k: 'presion_dia', label: 'Presión diastólica', unidad: 'mmHg', min: 30, max: 160 },
  { k: 'hrv_rmssd', label: 'VFC (RMSSD)', unidad: 'ms', min: 1, max: 300 },
  { k: 'reaccion_ms', label: 'Tiempo de reacción', unidad: 'ms', min: 100, max: 1500 },
  { k: 'sueno_horas', label: 'Sueño habitual', unidad: 'h', min: 0, max: 16 },
  { k: 'peso_kg', label: 'Peso', unidad: 'kg', min: 20, max: 250 },
  { k: 'spo2_pct', label: 'Saturación de oxígeno', unidad: '%', min: 50, max: 100 },
]

const LISTAS: { k: 'alergias' | 'medicamentos' | 'condiciones' | 'cirugias' | 'vacunas'; label: string; ej: string }[] = [
  { k: 'alergias', label: 'Alergias', ej: 'penicilina' },
  { k: 'medicamentos', label: 'Medicamentos actuales', ej: 'melatonina 3 mg' },
  { k: 'condiciones', label: 'Antecedentes y condiciones', ej: 'asma leve en la infancia' },
  { k: 'cirugias', label: 'Cirugías', ej: 'apendicectomía 2018' },
  { k: 'vacunas', label: 'Vacunas', ej: 'influenza 2026' },
]

function Lista({ valor, onChange, ej }: { valor: string[]; onChange: (v: string[]) => void; ej: string }) {
  const [txt, setTxt] = useState('')
  const agregar = () => { const t = txt.trim(); if (t && !valor.includes(t)) onChange([...valor, t]); setTxt('') }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {valor.length === 0 && <span className="text-xs text-[#93A0B8]">Ninguna registrada</span>}
        {valor.map((v) => (
          <span key={v} className="inline-flex items-center gap-1.5 rounded-lg bg-[#15233B] px-2.5 py-1 text-[13px]">
            {v}<button type="button" aria-label={`Quitar ${v}`} onClick={() => onChange(valor.filter((x) => x !== v))} className="border-0 bg-transparent p-0 text-[#A3AEC4] cursor-pointer"><X size={13} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }} placeholder={`Ej. ${ej}`}
          className="min-h-10 flex-1 rounded-xl border border-[#2F3F60] bg-[#080C16] px-3 text-sm text-[#E8ECF4] outline-none focus:border-[#5CC8F5]" />
        <button type="button" className="btn sec sm" onClick={agregar}>Agregar</button>
      </div>
    </div>
  )
}

function edadEn(nacimiento: string): number {
  const n = new Date(nacimiento)
  const h = new Date()
  return h.getFullYear() - n.getFullYear() - (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate()) ? 1 : 0)
}

const Campo = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-[13px] text-[#A3AEC4]">{label}{children}</label>
)
const input = 'min-h-11 rounded-xl border border-[#2F3F60] bg-[#080C16] px-3 text-sm text-[#E8ECF4] outline-none focus:border-[#5CC8F5]'

export default function Ficha() {
  const user = useSession((s) => s.user)
  const yo = astroNumero(user?.id) ?? 1
  const statusReal = useAppStore((s) => s.statusReal)
  const [f, setF] = useState<FichaMedica>(vacia(yo, user?.nombre ?? ''))
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'guardando' | 'guardado' | 'error'>('cargando')
  const [msg, setMsg] = useState<string | null>(null)
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    void api.get<FichaMedica>(`/ficha/${yo}`).then((r) => {
      if (!vivo) return
      setF(r ? { ...vacia(yo, user?.nombre ?? ''), ...r, nombre: r.nombre || user?.nombre || '' } : vacia(yo, user?.nombre ?? ''))
      setEstado('listo')
    })
    return () => { vivo = false }
  }, [yo, user?.nombre])

  const set = <K extends keyof FichaMedica>(k: K, v: FichaMedica[K]) => { setF((x) => ({ ...x, [k]: v })); setEstado('listo') }
  const setBasal = (k: keyof Basales, v: string) => { setF((x) => ({ ...x, basales: { ...x.basales, [k]: v === '' ? null : Number(v) } })); setEstado('listo') }

  const fueraDeRango = BASALES.filter((b) => { const v = f.basales[b.k]; return v !== null && (v < b.min || v > b.max) })

  const guardar = async () => {
    setMsg(null)
    if (fueraDeRango.length) { setMsg(`Revisa: ${fueraDeRango.map((b) => `${b.label} (${b.min} a ${b.max})`).join(', ')}`); return }
    setEstado('guardando')
    try {
      const r = await fetch(`${BASE}/ficha/${yo}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, astronauta_id: yo }) })
      if (!r.ok) {
        const e = await r.json().catch(() => null)
        setMsg(Array.isArray(e?.detail) ? e.detail.map((d: { loc: string[]; msg: string }) => `${d.loc.slice(-1)[0]}: ${d.msg}`).join(' · ') : 'El back rechazó la ficha')
        setEstado('error')
        return
      }
      setF(await r.json())
      setEstado('guardado')
    } catch {
      setMsg('No hay conexión con el back')
      setEstado('error')
    }
  }

  const exportar = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ficha-medica-${user?.id ?? 'A1'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importar = async (file: File) => {
    try {
      const d = JSON.parse(await file.text()) as Partial<FichaMedica>
      if (typeof d !== 'object' || d === null) throw new Error()
      setF({ ...vacia(yo, user?.nombre ?? ''), ...d, astronauta_id: yo, basales: { ...vacia(yo, '').basales, ...(d.basales ?? {}) } })
      setMsg('Ficha importada. Revísala y pulsa Guardar')
      setEstado('listo')
    } catch {
      setMsg('El archivo no es una ficha válida (JSON)')
    } finally {
      if (archivo.current) archivo.current.value = ''
    }
  }

  const edad = f.fecha_nacimiento ? edadEn(f.fecha_nacimiento) : null
  const imc = f.estatura_cm && f.basales.peso_kg ? f.basales.peso_kg / (f.estatura_cm / 100) ** 2 : null

  return (
    <>
      {!apiEnabled || (!statusReal && estado !== 'cargando') ? <SimBanner tag="SIN BACK">La ficha se guarda en la base de datos; sin el back solo puedes importarla y exportarla</SimBanner> : null}
      <PageHeader
        kicker={`${user?.nombre ?? ''} · evaluación médica previa al vuelo`}
        title="Ficha médica"
        right={
          <div className="flex flex-wrap gap-2">
            <input ref={archivo} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) void importar(x) }} />
            <button type="button" className="btn sec sm" onClick={() => archivo.current?.click()}><Upload size={15} />Importar</button>
            <button type="button" className="btn sec sm" onClick={exportar}><Download size={15} />Exportar</button>
            <button type="button" className="btn pri sm" onClick={() => void guardar()} disabled={estado === 'guardando'}><Save size={15} />{estado === 'guardando' ? 'Guardando…' : 'Guardar'}</button>
          </div>
        }
      />
      {(msg || estado === 'guardado') && (
        <p role="status" className="m-0 text-sm" style={{ color: estado === 'guardado' ? '#8FF0C4' : '#F5B544' }}>
          {estado === 'guardado' ? <>✓ Ficha guardada. <Link to="/progress">Ver tu evolución contra ella</Link></> : msg}
        </p>
      )}

      <div className="flex flex-wrap gap-5">
        <section className="card flex flex-col gap-4" style={{ flex: '1 1 360px', minWidth: 0 }} aria-labelledby="gen">
          <h2 id="gen" className="h2">Datos generales</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Campo label="Nombre"><input className={input} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></Campo>
            <Campo label={`Fecha de nacimiento${edad !== null ? ` (${edad} años)` : ''}`}><input type="date" className={input} value={f.fecha_nacimiento ?? ''} onChange={(e) => set('fecha_nacimiento', e.target.value || null)} /></Campo>
            <Campo label="Sexo">
              <select className={input} value={f.sexo} onChange={(e) => set('sexo', e.target.value as FichaMedica['sexo'])}>
                <option value="">Sin dato</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo label="Tipo de sangre">
              <select className={input} value={f.tipo_sangre} onChange={(e) => set('tipo_sangre', e.target.value as FichaMedica['tipo_sangre'])}>
                {['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((t) => <option key={t} value={t}>{t || 'Sin dato'}</option>)}
              </select>
            </Campo>
            <Campo label={`Estatura (cm)${imc ? ` · IMC ${imc.toFixed(1)}` : ''}`}><input type="number" className={input} value={f.estatura_cm ?? ''} onChange={(e) => set('estatura_cm', e.target.value === '' ? null : Number(e.target.value))} /></Campo>
            <Campo label="Fecha de la evaluación"><input type="date" className={input} value={f.fecha_evaluacion ?? ''} onChange={(e) => set('fecha_evaluacion', e.target.value || null)} /></Campo>
            <Campo label="Médico (flight surgeon)"><input className={input} value={f.medico} onChange={(e) => set('medico', e.target.value)} /></Campo>
          </div>
        </section>

        <section className="card flex flex-col gap-4" style={{ flex: '1 1 360px', minWidth: 0 }} aria-labelledby="bas">
          <h2 id="bas" className="h2">Valores basales en Tierra</h2>
          <p className="m-0 text-[13px] text-[#A3AEC4] leading-relaxed">Tu referencia antes del vuelo. "Mi evolución" compara tus mediciones de la misión contra estos valores.</p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {BASALES.map((b) => {
              const v = f.basales[b.k]
              const mal = v !== null && (v < b.min || v > b.max)
              return (
                <Campo key={b.k} label={`${b.label} (${b.unidad})`}>
                  <input type="number" className={input} style={mal ? { borderColor: '#F5B544' } : undefined} value={v ?? ''} onChange={(e) => setBasal(b.k, e.target.value)} />
                </Campo>
              )
            })}
          </div>
        </section>
      </div>

      <section className="card grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }} aria-label="Antecedentes">
        {LISTAS.map((l) => (
          <div key={l.k} className="flex flex-col gap-2">
            <h3 className="m-0 text-[15px] font-semibold">{l.label}</h3>
            <Lista valor={f[l.k]} onChange={(v) => set(l.k, v)} ej={l.ej} />
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[15px] font-semibold">Notas del equipo médico</h3>
          <textarea value={f.notas} maxLength={2000} onChange={(e) => set('notas', e.target.value)} rows={4} className={`${input} py-2`} />
        </div>
      </section>
      <p className="m-0 text-xs text-[#93A0B8]">
        Datos médicos sensibles: se guardan en la base de la misión y no viajan a Tierra salvo en un reporte que tú escales.
        {f.actualizada && ` Última actualización: ${new Date(f.actualizada).toLocaleString('es-MX')}.`}
      </p>
    </>
  )
}
