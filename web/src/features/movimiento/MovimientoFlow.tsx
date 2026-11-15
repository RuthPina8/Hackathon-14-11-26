import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { PageHeader, SimBanner } from '../../components/ui/Page'
import { useSession } from '../../store/useSession'
import MovimientoCamara from './MovimientoCamara'
import GuiaAnimada from '../../components/animaciones/GuiaAnimada'
import { pasosMovimiento } from '../../components/animaciones/Ejercicios'
import Demo3D from '../../components/animaciones/Demo3D'
import { idNumerico, movimientoApi, NOMBRE_EJERCICIO, type Sesion, type SesionIn } from './movimientoApi'
import type { Ejercicio } from './pose/calcularAngulos'
import { C } from '../../lib/paleta'
import { useEntrenamiento } from '../entrenamiento/entrenamientoStore'
import { enEntrenamiento } from '../chequeo/chequeoStore'

type Paso = 'elegir' | 'preparar' | 'camara' | 'resultado'

const COLOR = { estable: C.ok, bajo: C.warn, sin_referencia: C.accent, baja_calidad: C.warn }

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
    // En el entrenamiento la sesión va marcada como práctica (no cuenta para tu normal)
    const r = await movimientoApi.guardar({ ...s, practica: enEntrenamiento() })
    setGuardando(false)
    if (!r) { setError('No se pudo guardar: revisa que la API esté corriendo'); return }
    setResultado(r); setPaso('resultado'); cargar()
    useEntrenamiento.getState().completar('movimiento')
  }

  const demo = async (tipo: 'linea_base' | 'descenso') => {
    setError(null)
    const r = await movimientoApi.demo(tipo, astro, ejercicio)
    if (!r) { setError('No se pudo cargar la sesión de demo: revisa que la API esté corriendo'); return }
    setResultado(r[r.length - 1]); setPaso('resultado'); cargar()
    useEntrenamiento.getState().completar('movimiento')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader kicker="ASTRA-MOVE · evaluación funcional con webcam" title="Movimiento" />
      <p className="m-0 max-w-[820px] text-base leading-relaxed text-muted">
        Estimación computacional del desempeño funcional comparada contra <strong className="text-text">tu propia línea base</strong>.
        No mide fuerza muscular, no diagnostica lesiones y no sustituye a un especialista.
      </p>
      {error && <p role="alert" className="m-0 rounded-xl border border-warn-line bg-warn-bg px-5 py-4 text-base text-warn-soft">{error}</p>}

      {paso === 'elegir' && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {(['brazos', 'sentadilla'] as Ejercicio[]).map((e) => (
              <button key={e} type="button" data-tour={e === 'brazos' ? 'movimiento-brazos' : undefined} onClick={() => { setEjercicio(e); setPaso('preparar') }}
                className="card flex min-h-[220px] cursor-pointer flex-col items-start justify-between gap-4 text-left transition-colors hover:border-accent active:translate-y-[2px]"
                style={{ borderWidth: 2 }}>
                <span className="block h-[170px] w-full overflow-hidden rounded-xl border border-holo-line bg-holo-bg"><Demo3D ejercicio={e} mini /></span>
                <span>
                  <span className="block font-[family-name:var(--font-display)] text-[28px] font-bold">{NOMBRE_EJERCICIO[e]}</span>
                  <span className="mt-1 block text-base text-muted">
                    {e === 'brazos' ? 'Brazos extendidos al frente hasta los hombros. Funciona sentado frente a la laptop y compara ambos lados' : 'Necesitas unos 2 m de espacio. Cuenta repeticiones, rango de movimiento y regularidad'}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <section data-tour="movimiento-planb" className="card sim flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3"><span className="tag simt">PLAN B · DATO DE DEMO</span><span className="text-base text-subtle">Si la cámara falla, la demo sigue con sesiones preparadas de {NOMBRE_EJERCICIO[ejercicio].toLowerCase()}</span></div>
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

      {paso === 'preparar' && (
        <GuiaAnimada key={ejercicio} titulo={`Antes de empezar · ${NOMBRE_EJERCICIO[ejercicio]}`} pasos={pasosMovimiento(ejercicio).map((p, n, todos) => (n === todos.length - 1 ? { ...p, escena: <Demo3D ejercicio={ejercicio} /> } : p))}
          alTerminar={
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn pri flex-1" style={{ minHeight: 72, fontSize: 20 }} onClick={() => setPaso('camara')}>Ya estoy listo, abrir cámara</button>
              <button type="button" className="btn sec" style={{ minHeight: 72 }} onClick={() => setPaso('elegir')}>Otro ejercicio</button>
            </div>
          } />
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
