import { useCallback, useEffect, useRef, useState } from 'react'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import CameraView from './components/CameraView'
import PulseWave from './components/PulseWave'
import StepBar from './components/StepBar'
import { PUNTO_NARIZ } from './camara/landmarks'
import type { Roi } from './camara/landmarks'
import { CONFIANZA_BUENA, CONFIANZA_MINIMA, useRppg } from './camara/useRppg'
import { usePerclos } from './camara/usePerclos'
import { useChequeoStore } from './chequeoStore'

const TOTAL = 60 // segundos de medición
const UMBRAL_PERCLOS = 0.15
const BRILLO_MINIMO = 70 // por debajo, la piel se ve muy oscura para el rPPG
// Movimiento por cuadro (fracción de la imagen). Moverse es normal en microgravedad:
// solo se descartan los cuadros con movimientos bruscos, el resto se sigue usando
const MOVIMIENTO_SEGUIMIENTO = 0.004
const MOVIMIENTO_BRUSCO = 0.02

type Fase = 'inicio' | 'midiendo' | 'pausa' | 'completo'

type Props = {
  onSiguiente: () => void
  onCancelar: () => void
}

const reloj = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function ChequeoCamara({ onSiguiente, onCancelar }: Props) {
  const { bpm: bpmVivo, confianza, onda, brillo, registrar: registrarColor, reiniciar: reiniciarRppg, estimarFinal } = useRppg()
  const { perclos, parpadeosMin, registrar: registrarOjos, reiniciar: reiniciarPerclos } = usePerclos()
  const guardarCamara = useChequeoStore((s) => s.guardarCamara)

  const [fase, setFase] = useState<Fase>('inicio')
  const [seg, setSeg] = useState(0)
  const [camaraLista, setCamaraLista] = useState(false)
  const [hayCara, setHayCara] = useState(false)
  const [movimiento, setMovimiento] = useState<'estable' | 'siguiendo' | 'brusco'>('estable')
  const [final, setFinal] = useState<{ bpm: number | null; confianza: number } | null>(null)

  const faseRef = useRef(fase)
  useEffect(() => {
    faseRef.current = fase
  }, [fase])

  const narizAnterior = useRef<{ x: number; y: number } | null>(null)
  const movimientoProm = useRef(0)
  const ultimaUi = useRef(0)

  // Cada cuadro: revisa movimiento y, si está midiendo, alimenta rPPG y PERCLOS
  const onResultado = useCallback(
    (r: FaceLandmarkerResult, t: number, video: HTMLVideoElement, rois: Roi[] | null) => {
      const cara = r.faceLandmarks[0]
      setHayCara(Boolean(cara))
      if (!cara) {
        narizAnterior.current = null
        return
      }
      const nariz = cara[PUNTO_NARIZ]
      let d = 0
      if (narizAnterior.current) {
        d = Math.hypot(nariz.x - narizAnterior.current.x, nariz.y - narizAnterior.current.y)
        movimientoProm.current = movimientoProm.current * 0.85 + d * 0.15
      }
      narizAnterior.current = { x: nariz.x, y: nariz.y }
      if (t - ultimaUi.current > 300) {
        const m = movimientoProm.current
        setMovimiento(m > MOVIMIENTO_BRUSCO * 0.6 ? 'brusco' : m > MOVIMIENTO_SEGUIMIENTO ? 'siguiendo' : 'estable')
        ultimaUi.current = t
      }
      if (faseRef.current !== 'midiendo') return
      // Cuadro con movimiento brusco: se descarta solo ese, la medición sigue
      if (rois && d < MOVIMIENTO_BRUSCO) {
        // Tiempo real del cuadro de video, no el de cuando terminó MediaPipe
        registrarColor(video, rois, video.currentTime * 1000)
      }
      registrarOjos(r.faceBlendshapes[0]?.categories, t)
    },
    [registrarColor, registrarOjos],
  )

  // Reloj de la medición
  useEffect(() => {
    if (fase !== 'midiendo') return
    const id = setInterval(() => setSeg((s) => Math.min(TOTAL, s + 1)), 1000)
    return () => clearInterval(id)
  }, [fase])

  // Al llegar a 60 segundos se guarda el resultado
  useEffect(() => {
    if (fase === 'midiendo' && seg >= TOTAL) {
      const est = estimarFinal()
      // Solo se guarda un ritmo si la señal fue confiable
      const resultado = {
        bpm: est && est.confianza >= CONFIANZA_MINIMA ? est.bpm : null,
        confianza: est?.confianza ?? 0,
      }
      setFinal(resultado)
      setFase('completo')
      guardarCamara({ ...resultado, perclos, parpadeosMin, fecha: new Date().toISOString() })
    }
  }, [fase, seg, perclos, parpadeosMin, guardarCamara, estimarFinal])

  const iniciar = () => {
    if (fase === 'pausa') {
      // Al continuar se limpia la señal de color para que la pausa no deje un hueco en la onda
      reiniciarRppg()
    } else {
      reiniciarRppg()
      reiniciarPerclos()
      setFinal(null)
      setSeg(0)
    }
    setFase('midiendo')
  }

  const midiendo = fase === 'midiendo'
  // Al terminar se muestra el cálculo final, mientras mide se muestra el de en vivo
  const bpm = fase === 'completo' && final ? final.bpm : bpmVivo
  const confianzaMostrada = fase === 'completo' && final ? final.confianza : confianza
  const hayRitmo = bpm !== null && confianzaMostrada >= CONFIANZA_MINIMA
  // Entre 0.12 y 0.3 se muestra el ritmo, pero en gris y marcado como baja confianza
  const bajaConfianza = hayRitmo && confianzaMostrada < CONFIANZA_BUENA
  const senalDebil = !hayRitmo && onda.length > 0
  const luzBuena = brillo === null || brillo >= BRILLO_MINIMO
  const fatiga = perclos !== null && perclos > UMBRAL_PERCLOS
  const barrasCalidad = onda.length > 0 ? Math.max(1, Math.round(confianzaMostrada * 5)) : 0

  let pista = 'Siéntate frente a la cámara con buena luz'
  if (fase === 'pausa') pista = 'Medición en pausa'
  if (fase === 'completo') pista = hayRitmo ? 'Listo, ya puedes pasar a la prueba cognitiva' : 'No hubo señal clara de ritmo, puedes repetir la medición'
  if (midiendo) {
    if (!hayCara) pista = 'No encuentro tu cara, que se vea completa en el centro'
    else if (movimiento === 'brusco') pista = 'Movimiento brusco, esos cuadros no se cuentan'
    else if (!luzBuena) pista = 'Hay poca luz, acércate a una ventana o lámpara'
    else if (senalDebil || bajaConfianza) pista = 'Señal débil: pon una luz de frente y evita lámparas detrás o arriba de ti'
    else if (!hayRitmo) pista = 'Estabilizando la señal…'
    else pista = 'Mantén la cara dentro del óvalo y respira normal'
  }

  const tarjeta = {
    inicio: ['Medición de 60 segundos', 'Mide ritmo cardiaco y fatiga visual solo con la cámara, sin sensores', 'Iniciar medición'],
    pausa: ['Medición en pausa', `Llevas ${seg} de ${TOTAL} segundos, vuelve a acomodarte en el óvalo`, 'Continuar'],
    completo: [
      'Medición completa',
      hayRitmo
        ? `Ritmo ${bpm} lpm${bajaConfianza ? ' (baja confianza)' : ''} y PERCLOS ${perclos?.toFixed(2) ?? '--'} guardados con confianza ${confianzaMostrada.toFixed(2)}`
        : 'No hubo un tramo con señal clara, centra tu cara y evita lámparas detrás o arriba de ti',
      'Repetir medición',
    ],
  }

  const estadoChip = {
    inicio: { texto: 'Cámara lista', borde: 'border-line-strong', color: 'text-soft', punto: 'bg-muted' },
    midiendo: { texto: 'Midiendo', borde: 'border-[#5A2A33]', color: 'text-[#FFB8BF]', punto: 'bg-crit animate-blink' },
    pausa: { texto: 'En pausa', borde: 'border-[#5C4A1C]', color: 'text-[#F5D79A]', punto: 'bg-warn' },
    completo: { texto: 'Completo', borde: 'border-[#1E5A43]', color: 'text-[#8FF0C4]', punto: 'bg-ok' },
  }[fase]

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Chequeo diario · paso 1 de 5</p>
            <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-tight">Chequeo con cámara</h1>
          </div>
          <p className="m-0 text-sm text-soft">
            Unos <strong className="text-ink">4 minutos</strong> en total
          </p>
        </div>
        <StepBar actual={0} />
      </header>

      <div className="flex flex-wrap gap-5">
        <div className="min-w-0 flex-[3_1_480px]">
          <CameraView onResultado={onResultado} onListo={setCamaraLista} ovalo={fase === 'completo' ? 'ok' : fase === 'inicio' ? 'tenue' : 'normal'}>
            {/* Línea que recorre la cara mientras mide */}
            {midiendo && (
              <div className="pointer-events-none absolute left-[22%] right-[22%] h-0.5 animate-scan bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_18px_var(--color-accent)]" />
            )}

            <div className="absolute left-[18px] right-[18px] top-[18px] flex flex-wrap justify-between gap-2">
              <span className={`inline-flex items-center gap-2 rounded-[10px] border bg-[rgba(4,7,14,0.85)] px-3 py-2 text-[13px] font-semibold ${estadoChip.borde} ${estadoChip.color}`}>
                <span className={`h-2 w-2 rounded-full ${estadoChip.punto}`} />
                {estadoChip.texto} <span className="font-mono">{reloj(seg)} / {reloj(TOTAL)}</span>
              </span>
              <span className="flex gap-2">
                <span className={`rounded-[10px] border bg-[rgba(4,7,14,0.85)] px-3 py-2 text-xs font-semibold ${luzBuena ? 'border-[#1E5A43] text-[#8FF0C4]' : 'border-[#5C4A1C] text-[#F5D79A]'}`}>
                  {luzBuena ? 'Luz buena' : 'Poca luz'}
                </span>
                <span
                  className={`rounded-[10px] border bg-[rgba(4,7,14,0.85)] px-3 py-2 text-xs font-semibold ${
                    !hayCara || movimiento === 'brusco'
                      ? 'border-[#5C4A1C] text-[#F5D79A]'
                      : movimiento === 'siguiendo'
                        ? 'border-[#1F5A78] text-[#8AD9F8]'
                        : 'border-[#1E5A43] text-[#8FF0C4]'
                  }`}
                >
                  {!hayCara ? 'Sin cara' : movimiento === 'brusco' ? 'Movimiento brusco' : movimiento === 'siguiendo' ? 'Siguiendo tu cara' : 'Estable'}
                </span>
              </span>
            </div>

            {fase !== 'midiendo' && (
              <div className="absolute left-1/2 top-1/2 flex w-[300px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3.5 rounded-[20px] border border-line-strong bg-[rgba(10,15,27,0.92)] px-[30px] py-[26px] text-center">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                  <circle cx="12" cy="12" r="3.5" />
                </svg>
                <p className="m-0 font-display text-lg font-semibold">{tarjeta[fase][0]}</p>
                <p className="m-0 text-[13px] leading-normal text-soft">{tarjeta[fase][1]}</p>
                <button
                  type="button"
                  onClick={iniciar}
                  disabled={!camaraLista}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-[#04121C] hover:bg-[#8AD9F8] disabled:opacity-50"
                >
                  {tarjeta[fase][2]}
                </button>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-b from-transparent to-[rgba(4,7,14,0.92)] px-[22px] pb-5 pt-[18px]">
              <div className="flex items-center gap-3.5">
                <p aria-live="polite" className="m-0 flex-1 text-[15px] text-[#C5CEDF]">{pista}</p>
                {midiendo && (
                  <button
                    type="button"
                    onClick={() => setFase('pausa')}
                    className="min-h-10 rounded-xl bg-[rgba(10,15,27,0.8)] px-5 text-sm font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel"
                  >
                    Pausar
                  </button>
                )}
              </div>
              <div className="h-1 rounded-sm bg-line">
                <div
                  className={`h-full rounded-sm transition-all duration-1000 ease-linear ${fase === 'completo' ? 'bg-ok' : 'bg-accent'}`}
                  style={{ width: `${Math.round((seg / TOTAL) * 100)}%` }}
                />
              </div>
            </div>
          </CameraView>
        </div>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <section aria-labelledby="hr" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-[22px]">
            <div className="flex items-center justify-between">
              <h2 id="hr" className="m-0 font-display text-base font-semibold">Ritmo cardiaco</h2>
              <span className="rounded-md bg-[#0B2636] px-2 py-1 text-[11px] font-semibold tracking-wide text-[#8AD9F8]">rPPG · Real</span>
            </div>
            <div className="flex items-center gap-3.5">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={hayRitmo && midiendo ? 'animate-beat' : ''}
                style={hayRitmo ? { animationDuration: `${(60 / (bpm ?? 72)).toFixed(2)}s` } : undefined}
              >
                <path
                  d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"
                  fill={hayRitmo && !bajaConfianza ? 'var(--color-crit)' : '#46536F'}
                />
              </svg>
              <p className={`m-0 font-mono text-[44px] font-bold tracking-tight transition-colors ${bajaConfianza ? 'text-muted' : 'text-ink'}`}>
                {hayRitmo ? bpm : '--'}
              </p>
              <span className="text-sm text-soft">lpm</span>
              {bajaConfianza && (
                <span className="ml-auto rounded-md bg-[#2A2312] px-2 py-1 text-[11px] font-semibold text-warn">Baja confianza</span>
              )}
            </div>
            <PulseWave valores={onda} />
            <p className="m-0 text-[13px] text-soft">
              {hayRitmo
                ? fase === 'completo'
                  ? 'Calculado con el tramo más limpio de 20 s de la medición'
                  : 'Calculado con el color de frente y mejillas en los últimos 20 segundos'
                : senalDebil
                  ? 'Señal débil, no se muestra un ritmo poco confiable'
                  : 'Se necesitan unos segundos de señal estable'}
            </p>
          </section>

          <section aria-labelledby="calidad" className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-[22px]">
            <div className="flex items-baseline justify-between">
              <h2 id="calidad" className="m-0 font-display text-base font-semibold">Calidad de la señal</h2>
              <span className="font-mono text-[13px] text-soft">{onda.length > 0 ? `confianza ${confianzaMostrada.toFixed(2)}` : 'sin señal'}</span>
            </div>
            <div role="img" aria-label={`Calidad ${barrasCalidad} de 5`} className="grid grid-cols-5 gap-[5px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={`h-2 rounded-[3px] transition-colors duration-500 ${i < barrasCalidad ? (barrasCalidad <= 2 ? 'bg-warn' : 'bg-ok') : 'bg-line'}`}
                />
              ))}
            </div>
            <p className="m-0 text-[13px] leading-normal text-soft">Con menos de <span className="font-mono">{CONFIANZA_MINIMA}</span> no se muestra el ritmo, hasta <span className="font-mono">{CONFIANZA_BUENA}</span> sale en gris, y entre más baja la confianza menos pesa el dato</p>
          </section>

          <section aria-labelledby="fatiga" className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-[22px]">
            <div className="flex items-center justify-between">
              <h2 id="fatiga" className="m-0 font-display text-base font-semibold">Fatiga visual</h2>
              <span className="rounded-md bg-[#0B2636] px-2 py-1 text-[11px] font-semibold tracking-wide text-[#8AD9F8]">Real</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">PERCLOS</p>
                <p className={`mt-1 font-mono text-[28px] font-bold ${fatiga ? 'text-warn' : 'text-ink'}`}>{perclos === null ? '--' : perclos.toFixed(2)}</p>
              </div>
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Parpadeos / min</p>
                <p className="mt-1 font-mono text-[28px] font-bold">{parpadeosMin ?? '--'}</p>
              </div>
            </div>
            <div className="relative h-2 rounded bg-line">
              <div
                className={`h-full rounded transition-all duration-500 ${fatiga ? 'bg-warn' : 'bg-ok'}`}
                style={{ width: `${perclos === null ? 0 : Math.min(100, (perclos / (UMBRAL_PERCLOS * 2)) * 100)}%` }}
              />
              <div className="absolute left-1/2 top-[-5px] h-[18px] w-0.5 rounded-sm bg-ink" />
            </div>
            <p className="m-0 text-xs text-muted">
              La marca blanca es el umbral de fatiga, <span className="font-mono">{UMBRAL_PERCLOS}</span>
            </p>
          </section>

          <div className="flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancelar}
              className="min-h-11 rounded-xl px-5 text-sm font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSiguiente}
              className={`min-h-11 rounded-xl px-5 text-sm font-semibold ${
                fase === 'completo' ? 'bg-accent text-[#04121C] hover:bg-[#8AD9F8]' : 'shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel'
              }`}
            >
              Siguiente: prueba cognitiva
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
