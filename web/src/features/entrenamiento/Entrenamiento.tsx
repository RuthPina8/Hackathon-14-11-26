import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, ArrowRight, Brain, CheckCircle2, Clock, Gauge, GraduationCap, HeartPulse, Moon, PersonStanding, RotateCcw, Siren, Sparkles } from 'lucide-react'
import { PageHeader } from '../../components/ui/Page'
import { BotonConfirmar } from '../../components/ui/Deshacer'
import Holograma from '../inicio/Holograma'
import { useSexo, type Estado, type Organo } from '../inicio/useSalud'
import { useChequeoStore } from '../chequeo/chequeoStore'
import { useSession } from '../../store/useSession'
import { useAppStore } from '../../store/useAppStore'
import { useEntrenamiento, listoParaMision } from './entrenamientoStore'
import { MODULOS, moduloPorId, type Insignia, type ModuloId } from './modulos'

// Misión de entrenamiento: en una misión lejana no hay instructor, así que la app entrena a la tripulación.
// El cuerpo 3D es el tablero: arranca apagado y cada módulo completado enciende sus órganos.

const ICONO: Record<ModuloId, typeof HeartPulse> = { camara: HeartPulse, atencion: Brain, presion: Gauge, registro: Moon, movimiento: PersonStanding, alerta: Siren }
const INSIGNIAS: { id: Insignia; nombre: string; icono: typeof Gauge; modulo: ModuloId }[] = [
  { id: 'presion', nombre: 'Presión', icono: Gauge, modulo: 'presion' },
  { id: 'estres', nombre: 'Estrés', icono: Activity, modulo: 'registro' },
  { id: 'movimiento', nombre: 'Movimiento', icono: PersonStanding, modulo: 'movimiento' },
]
const NOMBRE_ORGANO: Record<Organo, string> = { cerebro: 'Cerebro', ojos: 'Sueño', corazon: 'Corazón', pulmones: 'Pulmones', inmune: 'Inmune' }

// Lo que se midió en la práctica, para explicar el resultado con TU dato
function datoPractica(id: ModuloId, c: ReturnType<typeof useChequeoStore.getState>): string | null {
  if (id === 'camara') return c.camara?.bpm != null ? `Tu ritmo en la práctica: ${c.camara.bpm} lpm` : 'La cámara no juntó una señal clara: en el chequeo real te dirá qué corregir'
  if (id === 'atencion') return c.cognitivo ? `Tu reacción en la práctica: ${Math.round(c.cognitivo.medianaMs)} ms (mediana), ${c.cognitivo.lapsos} lapsos` : null
  if (id === 'presion') return c.presion && 'sis' in c.presion ? `Registraste ${c.presion.sis}/${c.presion.dia} mmHg` : 'Sin brazalete: la presión se puede omitir'
  if (id === 'registro' && c.registro) return `Ánimo ${c.registro.animo} de 5 · estrés ${c.registro.estres} de 10 · ${c.registro.sintomas.length} síntomas marcados`
  return null
}

export default function Entrenamiento() {
  const usuario = useSession((s) => s.user?.id ?? 'A1')
  const { completados, activo, fase, cargar, empezar, aAccion, cerrarResultado, salir, reiniciar } = useEntrenamiento()
  const chequeo = useChequeoStore()
  const simularAlerta = useAppStore((s) => s.simulateRedAlert)
  const sexo = useSexo()
  const navigate = useNavigate()
  useEffect(() => { cargar(usuario) }, [usuario, cargar])

  const hecho = (id: ModuloId) => completados.includes(id)
  const listo = listoParaMision(completados)
  const organos = { cerebro: 'none', ojos: 'none', corazon: 'none', pulmones: 'none', inmune: 'none' } as Record<Organo, Estado>
  MODULOS.forEach((m) => { if (hecho(m.id)) m.enciende.forEach((o) => { organos[o] = 'ok' }) })
  const etiquetas = Object.fromEntries((Object.keys(organos) as Organo[]).map((o) => [o, `${NOMBRE_ORGANO[o]} · ${organos[o] === 'ok' ? 'encendido' : 'apagado'}`])) as Record<Organo, string>
  const siguiente = MODULOS.find((m) => !hecho(m.id))
  const mod = activo ? moduloPorId(activo) : null

  const irAccion = async () => {
    if (!mod) return
    aAccion()
    // Último nivel: se genera una alerta roja de práctica (dato de demo) para atenderla y escalarla
    if (mod.id === 'alerta') await simularAlerta()
    navigate(mod.ruta)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader kicker="Misión de entrenamiento · la app entrena a la tripulación" title="Entrenamiento"
        right={<span className="inline-flex min-h-[52px] items-center gap-2 rounded-xl border-2 border-line bg-panel px-4 text-base"><GraduationCap size={20} className="text-accent" /><strong className="num">{completados.length}</strong> de {MODULOS.length} módulos</span>} />

      <AnimatePresence>
        {listo && (
          <motion.section initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card flex flex-wrap items-center gap-5" style={{ borderWidth: 2, borderColor: 'var(--color-ok)', background: 'linear-gradient(135deg, var(--color-ok-bg), var(--color-panel))' }}>
            <Sparkles size={44} className="text-ok" />
            <div className="min-w-[240px] flex-1">
              <p className="m-0 font-display text-[28px] font-bold text-ok-soft">Listo para la misión</p>
              <p className="m-0 mt-1 text-[17px] text-subtle">Completaste todos los módulos: ya sabes medirte, registrar tu estado y atender una alerta roja.</p>
            </div>
            <BotonConfirmar onConfirmar={reiniciar} confirmar="¿Reiniciar el entrenamiento? Toca otra vez"><RotateCcw size={18} />Repetir entrenamiento</BotonConfirmar>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_1.1fr]">
        {/* Tablero: el cuerpo se enciende por módulo */}
        <section className="relative flex min-h-[560px] flex-col overflow-hidden rounded-2xl border-2 border-holo-line" aria-label="Progreso en el cuerpo">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
            <h2 className="m-0 font-display text-[16px] font-semibold tracking-wide text-accent-soft">TABLERO DE ENTRENAMIENTO</h2>
            <span className="text-[14px] text-faint">{listo ? 'Todos los sistemas encendidos' : 'Cada módulo enciende un sistema'}</span>
          </div>
          <div className="relative flex-1">
            <Holograma organos={organos} etiquetas={etiquetas} bpm={hecho('camara') ? chequeo.camara?.bpm ?? null : null} rpm={null}
              seleccionado={null} onSelect={() => {}} vista={0} sexo={sexo} />
          </div>
          <div className="relative z-10 m-3 grid grid-cols-3 gap-2">
            {INSIGNIAS.map((i) => {
              const ok = hecho(i.modulo)
              const Ic = i.icono
              return (
                <motion.div key={i.id} animate={ok ? { scale: [1, 1.12, 1] } : {}} transition={{ duration: 0.5 }}
                  className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-2 text-[14px] font-semibold"
                  style={{ borderColor: ok ? 'var(--color-ok-line)' : 'var(--color-line)', background: ok ? 'var(--color-ok-bg)' : 'var(--color-holo-bg)', color: ok ? 'var(--color-ok-soft)' : 'var(--color-faint)' }}>
                  <Ic size={22} />{i.nombre}
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* Módulos */}
        <section className="flex flex-col gap-3" aria-label="Módulos">
          {MODULOS.map((m, i) => {
            const ok = hecho(m.id)
            const Ic = ICONO[m.id]
            const esSiguiente = siguiente?.id === m.id
            return (
              <motion.button key={m.id} type="button" onClick={() => empezar(m.id)}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className="card flex min-h-[88px] cursor-pointer items-center gap-4 text-left text-text active:translate-y-[2px]"
                style={{ borderWidth: 2, borderColor: ok ? 'var(--color-ok-line)' : esSiguiente ? 'var(--color-accent)' : 'var(--color-line)' }}>
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ background: ok ? 'var(--color-ok-bg)' : 'var(--color-accent-bg)' }}>
                  {ok ? <CheckCircle2 size={30} className="text-ok" /> : <Ic size={28} className="text-accent" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[20px] font-semibold">{i + 1}. {m.titulo}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[14px] text-muted">
                    <span className="inline-flex items-center gap-1"><Clock size={14} />{m.minutos} min</span>
                    {m.enciende.length > 0 && <span>Enciende: {m.enciende.map((o) => NOMBRE_ORGANO[o]).join(' y ')}</span>}
                    {m.insignias.length > 0 && <span>Insignia: {m.insignias.map((x) => INSIGNIAS.find((y) => y.id === x)!.nombre).join(', ')}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-[15px] font-semibold" style={{ color: ok ? 'var(--color-ok-soft)' : 'var(--color-accent)' }}>
                  {ok ? 'Repetir' : esSiguiente ? 'Empezar' : 'Abrir'} <ArrowRight size={16} className="inline" />
                </span>
              </motion.button>
            )
          })}
        </section>
      </div>

      {/* Momento 1: por qué importa · Momento 3: resultado explicado */}
      <AnimatePresence>
        {mod && (fase === 'por_que' || fase === 'resultado') && (
          <motion.div key="modal" className="fixed inset-0 z-[67] grid place-items-center bg-[rgba(4,7,14,.72)] p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section role="dialog" aria-modal="true" aria-labelledby="mod-titulo" initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30 }}
              className="flex w-[min(640px,100%)] flex-col gap-5 rounded-3xl border-2 bg-raised p-7" style={{ borderColor: fase === 'resultado' ? 'var(--color-ok-line)' : 'var(--color-accent-line)' }}>
              <div className="flex items-center gap-3">
                {fase === 'resultado' ? <CheckCircle2 size={34} className="text-ok" /> : (() => { const Ic = ICONO[mod.id]; return <Ic size={34} className="text-accent" /> })()}
                <h2 id="mod-titulo" className="m-0 font-display text-[26px] font-bold">{fase === 'resultado' ? 'Módulo completado' : mod.titulo}</h2>
              </div>
              {fase === 'por_que' ? (
                <>
                  <div>
                    <p className="k">Por qué importa</p>
                    <p className="m-0 mt-2 text-[19px] leading-relaxed">{mod.porQue}</p>
                  </div>
                  <p className="m-0 rounded-xl border-2 border-dashed border-line2 px-4 py-3 text-[16px] leading-relaxed text-subtle">{mod.dato}</p>
                  <p className="m-0 text-[15px] text-faint">Es práctica: lo que hagas aquí no cuenta para tu normal ni genera alertas reales.</p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="btn pri flex-1" style={{ minHeight: 68, fontSize: 19 }} onClick={() => void irAccion()}>Empezar práctica <ArrowRight size={20} /></button>
                    <button type="button" className="btn sec" style={{ minHeight: 68 }} onClick={salir}>Ahora no</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="m-0 font-display text-[20px] font-semibold text-ok-soft">{mod.titulo}</p>
                  {datoPractica(mod.id, chequeo) && <p className="num m-0 rounded-xl bg-deep px-4 py-3 text-[18px] text-text">{datoPractica(mod.id, chequeo)}</p>}
                  <p className="m-0 text-[18px] leading-relaxed">{mod.resultado}</p>
                  {(mod.enciende.length > 0 || mod.insignias.length > 0) && (
                    <p className="m-0 text-[16px] text-ok-soft">
                      {mod.enciende.length > 0 && `Se encendió: ${mod.enciende.map((o) => NOMBRE_ORGANO[o]).join(' y ')}. `}
                      {mod.insignias.length > 0 && `Ganaste la insignia: ${mod.insignias.map((x) => INSIGNIAS.find((y) => y.id === x)!.nombre).join(', ')}.`}
                    </p>
                  )}
                  <button type="button" className="btn pri" style={{ minHeight: 68, fontSize: 19 }} onClick={cerrarResultado}>Continuar</button>
                </>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
