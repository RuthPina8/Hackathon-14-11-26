import { useCallback, useEffect, useRef, useState } from 'react'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import CameraView from './components/CameraView'
import PulseWave from './components/PulseWave'
import StepBar from './components/StepBar'
import { PUNTO_NARIZ } from './camara/landmarks'
import type { Roi } from './camara/landmarks'
import { CONFIANZA_BUENA, CONFIANZA_MINIMA, useRppg, type Final } from './camara/useRppg'
import { useExpresividad } from './camara/useExpresividad'
import { usePerclos } from './camara/usePerclos'
import { tuNormal, useChequeoStore } from './chequeoStore'

const TOTAL = 60 // segundos de medición
const UMBRAL_PERCLOS = 0.15
const BRILLO_MINIMO = 70 // por debajo, la piel se ve muy oscura para el rPPG
// Velocidad de la cara en fracciones de la imagen por segundo. Moverse es normal en microgravedad:
// solo se descartan los cuadros con movimientos bruscos, el resto se sigue usando
const MOVIMIENTO_SEGUIMIENTO = 0.12
const MOVIMIENTO_BRUSCO = 0.6

type Fase = 'inicio' | 'midiendo' | 'pausa' | 'completo'
type ResultadoFinal = Omit<Final, 'bpm'> & { bpm: number | null }

// Navegadores sin requestVideoFrameCallback toman el color al ritmo de MediaPipe
const SIN_CUADRO_A_CUADRO = typeof (HTMLVideoElement.prototype as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback !== 'function'

type Props = {
  onSiguiente: () => void
  onCancelar: () => void
}

const reloj = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function ChequeoCamara({ onSiguiente, onCancelar }: Props) {
  const { bpm: bpmVivo, confianza, onda, brillo, zona, respVivo, registrar: registrarColor, registrarCara, reiniciar: reiniciarRppg, estimarFinal, ventana } = useRppg()
  const { perclos, parpadeosMin, registrar: registrarOjos, reiniciar: reiniciarPerclos } = usePerclos()
  const { expresion, registrar: registrarExpresion, calcular: calcularExpresion, reiniciar: reiniciarExpresion } = useExpresividad()
  const guardarCamara = useChequeoStore((s) => s.guardarCamara)
  const camaraGuardada = useChequeoStore((s) => s.camara)
  const historial = useChequeoStore((s) => s.historial)

  const [fase, setFase] = useState<Fase>('inicio')
  const [seg, setSeg] = useState(0)
  const [camaraLista, setCamaraLista] = useState(false)
  const [hayCara, setHayCara] = useState(false)
  const [movimiento, setMovimiento] = useState<'estable' | 'siguiendo' | 'brusco'>('estable')
  const [final, setFinal] = useState<ResultadoFinal | null>(null)
  // Respaldo cuando la cámara no saca el ritmo: capturarlo del Apple Watch o tomado a mano
  const [pulsoManual, setPulsoManual] = useState('')
  const [fuenteManual, setFuenteManual] = useState<'apple_watch' | 'manual'>('apple_watch')

  const faseRef = useRef(fase)
  useEffect(() => {
    faseRef.current = fase
  }, [fase])

  const narizAnterior = useRef<{ x: number; y: number; t: number } | null>(null)
  const movimientoProm = useRef(0)
  const ultimoMovimiento = useRef(0)
  const cuadrosDeteccion = useRef(0)
  const ultimaUi = useRef(0)

  // Cada cuadro: revisa movimiento y, si está midiendo, alimenta rPPG y PERCLOS
  const onResultado = useCallback(
    (r: FaceLandmarkerResult, t: number, video: HTMLVideoElement, rois: Roi[] | null) => {
      cuadrosDeteccion.current++
      const cara = r.faceLandmarks[0]
      setHayCara(Boolean(cara))
      if (!cara) {
        narizAnterior.current = null
        return
      }
      const nariz = cara[PUNTO_NARIZ]
      // Velocidad por segundo: MediaPipe no analiza todos los cuadros, así que se divide entre el tiempo real
      let d = 0
      const previa = narizAnterior.current
      if (previa && t > previa.t) {
        d = Math.hypot(nariz.x - previa.x, nariz.y - previa.y) / ((t - previa.t) / 1000)
        movimientoProm.current = movimientoProm.current * 0.85 + d * 0.15
      }
      narizAnterior.current = { x: nariz.x, y: nariz.y, t }
      ultimoMovimiento.current = d
      if (t - ultimaUi.current > 300) {
        const m = movimientoProm.current
        setMovimiento(m > MOVIMIENTO_BRUSCO * 0.6 ? 'brusco' : m > MOVIMIENTO_SEGUIMIENTO ? 'siguiendo' : 'estable')
        ultimaUi.current = t
      }
      if (faseRef.current !== 'midiendo') return
      // Respaldo para navegadores sin requestVideoFrameCallback: color al ritmo de MediaPipe
      if (SIN_CUADRO_A_CUADRO && rois && d < MOVIMIENTO_BRUSCO) {
        registrarColor(video, rois, video.currentTime * 1000)
      }
      registrarOjos(r.faceBlendshapes[0]?.categories, t)
      // Para la respiración: altura de la nariz relativa al tamaño de la cara (no cambia con la distancia)
      const anchoCara = Math.abs(cara[454].x - cara[234].x)
      if (anchoCara > 0) registrarCara(t, nariz.y / anchoCara)
      registrarExpresion(r.faceBlendshapes[0]?.categories, t, d)
    },
    [registrarColor, registrarOjos, registrarExpresion, registrarCara],
  )

  // Color de la piel en cada cuadro de la cámara (30 por segundo), con las últimas zonas conocidas
  const onCuadro = useCallback(
    (video: HTMLVideoElement, rois: Roi[], tiempoMs: number) => {
      if (faseRef.current !== 'midiendo') return
      // Cuadro con movimiento brusco: se descarta solo ese, la medición sigue
      if (ultimoMovimiento.current >= MOVIMIENTO_BRUSCO) return
      registrarColor(video, rois, tiempoMs)
    },
    [registrarColor],
  )

  // Diagnóstico: descarga la señal cruda para analizarla fuera de la app
  const descargarSenal = () => {
    const datos = {
      fecha: new Date().toISOString(),
      resultado: final,
      perclos,
      parpadeosMin,
      cuadrosDeteccion: cuadrosDeteccion.current,
      muestras: ventana(),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(datos)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `senal-rppg-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

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
      const ritmoOk = Boolean(est && est.confianza >= CONFIANZA_MINIMA)
      const resultado: ResultadoFinal = {
        bpm: ritmoOk && est ? est.bpm : null,
        confianza: est?.confianza ?? 0,
        // Sin ritmo confiable tampoco hay VFC
        rmssd: ritmoOk ? (est?.rmssd ?? null) : null,
        confianzaVfc: ritmoOk ? (est?.confianzaVfc ?? 0) : 0,
        respRpm: est?.respRpm ?? null,
        confianzaResp: est?.confianzaResp ?? 0,
        fuenteResp: est?.fuenteResp ?? null,
        zona: est?.zona,
      }
      const e = calcularExpresion()
      setFinal(resultado)
      setFase('completo')
      guardarCamara({
        ...resultado,
        fuenteBpm: 'camara',
        zona: resultado.zona ?? null,
        perclos,
        parpadeosMin,
        expresividad: e?.expresividad ?? null,
        sonrisa: e?.sonrisa ?? null,
        ceno: e?.ceno ?? null,
        movimientoCabeza: e?.movimiento ?? null,
        fecha: new Date().toISOString(),
      })
    }
  }, [fase, seg, perclos, parpadeosMin, guardarCamara, estimarFinal, calcularExpresion])

  const iniciar = () => {
    if (fase === 'pausa') {
      // Al continuar se limpia la señal de color para que la pausa no deje un hueco en la onda
      reiniciarRppg()
    } else {
      reiniciarRppg()
      reiniciarPerclos()
      reiniciarExpresion()
      setFinal(null)
      cuadrosDeteccion.current = 0
      setSeg(0)
    }
    setFase('midiendo')
  }

  // Reinicia la prueba desde cero: borra la señal, el PERCLOS y el reloj, y vuelve a medir
  const reiniciarPrueba = () => {
    reiniciarRppg()
    reiniciarPerclos()
    reiniciarExpresion()
    setFinal(null)
    cuadrosDeteccion.current = 0
    narizAnterior.current = null
    movimientoProm.current = 0
    setSeg(0)
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

  // Tu normal de las señales nuevas, con las sesiones anteriores guardadas en este dispositivo
  const normalVfc = tuNormal(historial, 'rmssd')
  const normalResp = tuNormal(historial, 'respRpm')
  const normalExp = tuNormal(historial, 'expresividad')
  const terminado = fase === 'completo' && final !== null
  const comparar = (valor: number | null | undefined, n: { media: number | null; sd: number | null; n: number }) => {
    if (valor == null) return null
    if (n.media == null) return `Aprendiendo tu normal (${n.n} de 3 sesiones)`
    const z = n.sd ? (valor - n.media) / n.sd : 0
    if (z <= -2) return 'Más bajo que tu normal'
    if (z >= 2) return 'Más alto que tu normal'
    return 'Dentro de tu normal'
  }
  const expresividadHoy = expresion?.expresividad ?? null
  const respMostrada = terminado ? (final?.respRpm != null ? { rpm: final.respRpm, confianza: final.confianzaResp, fuente: final.fuenteResp } : null) : respVivo
  const pulsoNum = Number(pulsoManual)
  const pulsoValido = pulsoManual !== '' && Number.isFinite(pulsoNum) && pulsoNum >= 30 && pulsoNum <= 220
  const pulsoRespaldo = camaraGuardada && camaraGuardada.fuenteBpm !== 'camara' ? camaraGuardada : null
  const guardarPulsoManual = () => {
    if (!pulsoValido || !camaraGuardada) return
    guardarCamara({ ...camaraGuardada, bpm: Math.round(pulsoNum), confianza: 1, fuenteBpm: fuenteManual, rmssd: null, confianzaVfc: 0 })
  }

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
    inicio: ['Medición de 60 segundos', 'Mide ritmo, fatiga visual, respiración y expresividad solo con la cámara, sin sensores', 'Iniciar medición'],
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
          <CameraView onResultado={onResultado} onCuadro={onCuadro} onListo={setCamaraLista} ovalo={fase === 'completo' ? 'ok' : fase === 'inicio' ? 'tenue' : 'normal'}>
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
                {fase === 'pausa' && (
                  <button
                    type="button"
                    onClick={reiniciarPrueba}
                    disabled={!camaraLista}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel disabled:opacity-50"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                    Reiniciar prueba
                  </button>
                )}
                {fase === 'completo' && (
                  <button type="button" onClick={descargarSenal} className="text-xs font-semibold text-accent underline-offset-2 hover:underline">
                    Descargar señal (diagnóstico)
                  </button>
                )}
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-b from-transparent to-[rgba(4,7,14,0.92)] px-[22px] pb-5 pt-[18px]">
              <div className="flex items-center gap-3.5">
                <p aria-live="polite" className="m-0 flex-1 text-[15px] text-[#C5CEDF]">{pista}</p>
                {midiendo && (
                  <button
                    type="button"
                    onClick={reiniciarPrueba}
                    title="Empezar la medición otra vez desde 00:00"
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[rgba(10,15,27,0.8)] px-4 text-sm font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-panel"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                    Reiniciar
                  </button>
                )}
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
              {hayRitmo && zona && midiendo && <span className="text-muted"> · mejor zona: {zona}</span>}
            </p>
            {fase === 'completo' && !hayRitmo && (
              <div className="flex flex-col gap-2 rounded-xl border border-line-strong p-3">
                {pulsoRespaldo ? (
                  <p className="m-0 text-[13px] text-[#8FF0C4]">
                    Guardado {pulsoRespaldo.bpm} lpm, {pulsoRespaldo.fuenteBpm === 'apple_watch' ? 'del Apple Watch' : 'tomado a mano'}
                  </p>
                ) : (
                  <>
                    <p className="m-0 text-[13px] text-soft">La cámara no pudo con esta luz. Captura tu pulso para no perder el dato</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={fuenteManual}
                        onChange={(e) => setFuenteManual(e.target.value as 'apple_watch' | 'manual')}
                        className="min-h-10 rounded-lg border border-line-strong bg-[#0A0F1B] px-2 text-sm"
                      >
                        <option value="apple_watch">Apple Watch</option>
                        <option value="manual">A mano (15 s × 4)</option>
                      </select>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={30}
                        max={220}
                        value={pulsoManual}
                        onChange={(e) => setPulsoManual(e.target.value)}
                        placeholder="lpm"
                        className="min-h-10 w-20 rounded-lg border border-line-strong bg-[#0A0F1B] px-2 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={guardarPulsoManual}
                        disabled={!pulsoValido}
                        className="min-h-10 rounded-lg bg-accent px-3 text-sm font-semibold text-[#04121C] disabled:opacity-50"
                      >
                        Guardar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
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

      <div className="grid gap-4 md:grid-cols-3">
        <section aria-labelledby="vfc" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-[22px]">
          <div className="flex flex-col items-start gap-1.5">
            <h2 className="m-0 font-display text-base font-semibold" id="vfc">Estrés (VFC)</h2>
            <span className="rounded-md bg-[#2A2312] px-2 py-1 text-[11px] font-semibold tracking-wide text-warn">Experimental</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="m-0 font-mono text-[32px] font-bold">{terminado && final?.rmssd != null ? final.rmssd : '--'}</p>
            <span className="text-sm text-soft">ms RMSSD</span>
          </div>
          <p className="m-0 text-[13px] leading-normal text-soft">
            {!terminado
              ? 'Se calcula al terminar, latido por latido, con el tramo más limpio'
              : final?.rmssd == null
                ? 'La señal no alcanzó para separar latido por latido, no se guarda'
                : `${comparar(final.rmssd, normalVfc)}. Una VFC más baja de lo usual suele ir con estrés o cansancio`}
          </p>
          {terminado && final?.rmssd != null && <p className="m-0 font-mono text-xs text-muted">confianza {final.confianzaVfc.toFixed(2)}</p>}
        </section>

        <section aria-labelledby="resp" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-[22px]">
          <div className="flex flex-col items-start gap-1.5">
            <h2 className="m-0 font-display text-base font-semibold" id="resp">Respiración</h2>
            <span className="rounded-md bg-[#2A2312] px-2 py-1 text-[11px] font-semibold tracking-wide text-warn">Experimental</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="m-0 font-mono text-[32px] font-bold">{respMostrada ? respMostrada.rpm : '--'}</p>
            <span className="text-sm text-soft">resp/min</span>
          </div>
          <p className="m-0 text-[13px] leading-normal text-soft">
            {respMostrada
              ? `${comparar(respMostrada.rpm, normalResp)}. En reposo lo típico es de 12 a 20`
              : terminado
                ? 'No hubo una onda de respiración clara, no se guarda'
                : seg < 25
                  ? 'Aparece a los 25 s, con el color de tu piel y el movimiento de tu cara'
                  : 'Buscando una onda de respiración clara, respira normal'}
          </p>
          {respMostrada && (
            <p className="m-0 font-mono text-xs text-muted">
              por {respMostrada.fuente === 'movimiento' ? 'movimiento de la cara' : 'color de la piel'} · confianza {respMostrada.confianza.toFixed(2)}
            </p>
          )}
        </section>

        <section aria-labelledby="expresividad" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-[22px]">
          <div className="flex flex-col items-start gap-1.5">
            <h2 className="m-0 font-display text-base font-semibold" id="expresividad">Expresividad</h2>
            <span className="rounded-md bg-[#0B2636] px-2 py-1 text-[11px] font-semibold tracking-wide text-[#8AD9F8]">Real</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="m-0 font-mono text-[32px] font-bold">{expresividadHoy != null ? Math.round(expresividadHoy * 100) : '--'}</p>
            <span className="text-sm text-soft">de 100</span>
          </div>
          <div className="relative h-2 rounded bg-line">
            <div className="h-full rounded bg-accent transition-all duration-500" style={{ width: `${Math.round((expresividadHoy ?? 0) * 100)}%` }} />
            {normalExp.media != null && (
              <div className="absolute top-[-5px] h-[18px] w-0.5 rounded-sm bg-ink" style={{ left: `${Math.round(normalExp.media * 100)}%` }} />
            )}
          </div>
          <p className="m-0 text-[13px] leading-normal text-soft">
            {expresividadHoy == null
              ? 'Cuánto se mueven cejas, boca y mejillas, sin etiquetar emociones'
              : normalExp.media != null
                ? `${comparar(expresividadHoy, normalExp)}, la marca blanca es tu normal`
                : comparar(expresividadHoy, normalExp)}
          </p>
          {expresion && (
            <p className="m-0 font-mono text-xs text-muted">
              sonrisa {expresion.sonrisa.toFixed(2)} · ceño {expresion.ceno.toFixed(2)} · cabeza {expresion.movimiento.toFixed(2)}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
