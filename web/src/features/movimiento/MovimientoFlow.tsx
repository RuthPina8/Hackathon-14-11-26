import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowUpFromLine, PersonStanding } from 'lucide-react'
import { PageHeader, SimBanner } from '../../components/ui/Page'
import { useSession } from '../../store/useSession'
import MovimientoCamara from './MovimientoCamara'
import { idNumerico, movimientoApi, NOMBRE_EJERCICIO, type Sesion, type SesionIn } from './movimientoApi'
import type { Ejercicio } from './pose/calcularAngulos'

type Paso = 'elegir' | 'camara' | 'resultado'

const COLOR = { estable: '#3DDC97', bajo: '#F5B544', sin_referencia: '#5CC8F5', baja_calidad: '#F5B544' }

export default function MovimientoFlow() {
  const user = useSession((s) => s.user)
  const astro = idNumerico(user?.id)
  const [paso, setPaso] = useState<Paso>('elegir')
  const [ejercicio, setEjercicio] = useState<Ejercicio>('brazos')
  const [resultado, setResultado] = useState<Sesion | null>(null)
  const [historial, setHistorial] = useState<Sesion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = () => { void movimientoApi.historial(astro).then((h) => setHistorial(h ?? [])) }
  useEffect(cargar, [astro])

  const guardar = async (s: SesionIn) => {
    setGuardando(true); setError(null)
    const r = await movimientoApi.guardar(s)
    setGuardando(false)
    if (!r) { setError('No se pudo guardar: revisa que la API esté corriendo'); return }
    setResultado(r); setPaso('resultado'); cargar()
  }

  const demo = async (tipo: 'linea_base' | 'descenso') => {
    setError(null)
    const r = await movimientoApi.demo(tipo, astro, ejercicio)
    if (!r) { setError('No se pudo cargar la sesión de demo: revisa que la API esté corriendo'); return }
    setResultado(r[r.length - 1]); setPaso('resultado'); cargar()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader kicker="ASTRA-MOVE · evaluación funcional con webcam" title="Movimiento" />
      <p className="m-0 max-w-[820px] text-base leading-relaxed text-[#A3AEC4]">
        Estimación computacional del desempeño funcional comparada contra <strong className="text-[#E8ECF4]">tu propia línea base</strong>.
        No mide fuerza muscular, no diagnostica lesiones y no sustituye a un especialista.
      </p>
      {error && <p role="alert" className="m-0 rounded-xl border border-[#5C4A1C] bg-[#2A2312] px-5 py-4 text-base text-[#F5D79A]">{error}</p>}

      {paso === 'elegir' && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {(['brazos', 'sentadilla'] as Ejercicio[]).map((e) => (
              <button key={e} type="button" onClick={() => { setEjercicio(e); setPaso('camara') }}
                className="card flex min-h-[220px] cursor-pointer flex-col items-start justify-between gap-4 text-left transition-colors hover:border-[#5CC8F5] active:translate-y-[2px]"
                style={{ borderWidth: 2 }}>
                {e === 'brazos' ? <ArrowUpFromLine size={52} color="#5CC8F5" /> : <PersonStanding size={52} color="#5CC8F5" />}
                <span>
                  <span className="block font-[family-name:var(--font-display)] text-[28px] font-bold">{NOMBRE_EJERCICIO[e]}</span>
                  <span className="mt-1 block text-base text-[#A3AEC4]">
                    {e === 'brazos' ? 'Funciona sentado frente a la laptop. Cuenta repeticiones, amplitud y compara ambos lados' : 'Necesitas unos 2 m de espacio. Cuenta repeticiones, rango de movimiento y regularidad'}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <section className="card sim flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3"><span className="tag simt">PLAN B · DATO DE DEMO</span><span className="text-base text-[#C5CEDF]">Si la cámara falla, la demo sigue con sesiones preparadas de {NOMBRE_EJERCICIO[ejercicio].toLowerCase()}</span></div>
            <div className="flex flex-wrap gap-4">
              <button type="button" className="btn sec" onClick={() => void demo('linea_base')}>Cargar línea base de demo</button>
              <button type="button" className="btn sec" onClick={() => void demo('descenso')}>Sesión de respaldo con descenso</button>
            </div>
          </section>

          {historial.length > 0 && (
            <section className="card flex flex-col gap-3">
              <h2 className="h2">Tus últimas sesiones</h2>
              {historial.slice(0, 6).map((s) => (
                <div key={s.id} className="trow" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 2fr' }}>
                  <span className="font-semibold">{NOMBRE_EJERCICIO[s.ejercicio]}</span>
                  <span className="num">{s.repeticiones} reps</span>
                  <span>{s.dato_demo ? <span className="tag simt">DEMO</span> : <span className="tag real">WEBCAM</span>}</span>
                  <span style={{ color: COLOR[s.comparacion.estado] }}>{s.comparacion.texto}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {paso === 'camara' && (
        <>
          {guardando && <SimBanner tag="GUARDANDO">Registrando la sesión…</SimBanner>}
          <MovimientoCamara ejercicio={ejercicio} astronautaId={astro} onTerminar={(s) => void guardar(s)} onCancelar={() => setPaso('elegir')} onFallo={() => void demo('descenso')} />
        </>
      )}

      {paso === 'resultado' && resultado && (
        <section className="card flex flex-col gap-5" style={{ borderWidth: 2, borderColor: COLOR[resultado.comparacion.estado] }}>
          <div className="flex flex-wrap items-center gap-3">
            <Activity size={34} color={COLOR[resultado.comparacion.estado]} />
            <h2 className="m-0 font-[family-name:var(--font-display)] text-[28px] font-bold">Sesión registrada</h2>
            {resultado.dato_demo ? <span className="tag simt">DATO DE DEMO</span> : <span className="tag real">WEBCAM · REAL</span>}
          </div>
          <p className="m-0 text-2xl font-semibold" style={{ color: COLOR[resultado.comparacion.estado] }}>{resultado.comparacion.texto}</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div><p className="k">Ejercicio</p><p className="m-0 mt-1 text-lg font-semibold">{NOMBRE_EJERCICIO[resultado.ejercicio]}</p></div>
            <div><p className="k">Duración</p><p className="big">{Math.round(resultado.duracion_s)} s</p></div>
            <div><p className="k">Rango aprox.</p><p className="big">{resultado.rango_grados ?? '--'}°</p></div>
            <div><p className="k">Calidad de detección</p><p className="big">{Math.round(resultado.calidad * 100)}%</p></div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link to="/mission-intelligence" className="btn pri">Ver inteligencia de misión</Link>
            <button type="button" className="btn sec" onClick={() => setPaso('camara')}>Repetir evaluación</button>
            <button type="button" className="btn sec" onClick={() => setPaso('elegir')}>Otro ejercicio</button>
          </div>
        </section>
      )}
    </div>
  )
}
