import { C } from '../../lib/paleta'
import type { PasoGuia } from './GuiaAnimada'
import { rad, tramo, useFase, useVueltas, vaiven } from './useFase'

// Animaciones de ASTRA-MOVE: cómo hacer cada ejercicio y cómo acomodar la cámara.
// Figuras de líneas animadas por ángulos de las articulaciones (las mismas que mide la pose de la cámara).

const V = '0 0 320 200'
const cuerpo = { stroke: C.accentSoft, strokeWidth: 6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
const Etiqueta = ({ x, y, texto, ok = true, ancla = 'start' as 'start' | 'middle' | 'end' }: { x: number; y: number; texto: string; ok?: boolean; ancla?: 'start' | 'middle' | 'end' }) => (
  <text x={x} y={y} textAnchor={ancla} fill={ok ? C.ok : C.crit} fontSize={15} fontWeight={700}>{texto}</text>
)
const Contador = ({ n }: { n: number }) => (
  <g>
    <rect x={244} y={12} width={64} height={48} rx={10} fill={C.deep} stroke={C.line2} strokeWidth={2} />
    <text x={276} y={46} textAnchor="middle" fill={C.accent} fontSize={26} fontWeight={700} fontFamily="JetBrains Mono">{n}</text>
  </g>
)

// ---------- Elevación de brazos (de frente) ----------
export function DemoBrazos({ mini = false }: { mini?: boolean }) {
  const f = useFase(3600, 0.5)
  const reps = useVueltas(f)
  const a = 15 + vaiven(f) * 155 // de 15° (abajo) a 170° (arriba), los dos brazos a la vez, codos rectos
  const L = 62
  const hI = { x: 138, y: 72 }, hD = { x: 182, y: 72 }
  const mano = (h: { x: number; y: number }, s: number) => ({ x: h.x + s * Math.sin(rad(a)) * L, y: h.y + Math.cos(rad(a)) * L })
  const mI = mano(hI, -1), mD = mano(hD, 1)
  const arriba = a > 160
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      {/* arco del rango de movimiento */}
      <path d={`M${hI.x - L * Math.sin(rad(15))} ${hI.y + L * Math.cos(rad(15))} A${L} ${L} 0 0 1 ${hI.x - L * Math.sin(rad(170))} ${hI.y + L * Math.cos(rad(170))}`} stroke={C.line2} strokeWidth={2} strokeDasharray="5 5" fill="none" />
      <path d={`M${hD.x + L * Math.sin(rad(15))} ${hD.y + L * Math.cos(rad(15))} A${L} ${L} 0 0 0 ${hD.x + L * Math.sin(rad(170))} ${hD.y + L * Math.cos(rad(170))}`} stroke={C.line2} strokeWidth={2} strokeDasharray="5 5" fill="none" />
      <circle cx={160} cy={44} r={16} {...cuerpo} />
      <path d={`M${hI.x} ${hI.y} H${hD.x} M160 62 V132 M144 132 H176 M146 132 L142 190 M174 132 L178 190`} {...cuerpo} />
      <path d={`M${hI.x} ${hI.y} L${mI.x} ${mI.y} M${hD.x} ${hD.y} L${mD.x} ${mD.y}`} {...cuerpo} stroke={C.accent} />
      {!mini && (
        <>
          <Contador n={reps} />
          <Etiqueta x={12} y={30} texto="codos rectos" />
          <Etiqueta x={12} y={52} texto="los dos a la vez" />
          <Etiqueta x={160} y={196} texto={arriba ? 'arriba, manos casi juntas' : 'despacio'} ancla="middle" ok />
        </>
      )}
    </svg>
  )
}

// ---------- Sentadilla controlada (de lado) ----------
export function DemoSentadilla({ mini = false }: { mini?: boolean }) {
  const f = useFase(4200, 0.5)
  const reps = useVueltas(f)
  const d = vaiven(f)
  const tobillo = { x: 206, y: 186 }
  const s = rad(d * 32) // espinilla: la rodilla avanza poco
  const rodilla = { x: tobillo.x + Math.sin(s) * 46, y: tobillo.y - Math.cos(s) * 46 }
  const t = rad(d * 92) // muslo: la cadera va hacia atrás, como sentándose
  const cadera = { x: rodilla.x - Math.sin(t) * 48, y: rodilla.y - Math.cos(t) * 48 }
  const l = rad(d * 34) // torso con la espalda recta, un poco inclinado
  const hombro = { x: cadera.x + Math.sin(l) * 58, y: cadera.y - Math.cos(l) * 58 }
  const cabeza = { x: hombro.x + Math.sin(l) * 20, y: hombro.y - Math.cos(l) * 20 }
  const brazo = { x: hombro.x + 46, y: hombro.y + 6 * (1 - d) + 2 } // brazos al frente para equilibrio
  const abajo = d > 0.85
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      <line x1={120} y1={192} x2={300} y2={192} stroke={C.line2} strokeWidth={3} />
      <circle cx={cabeza.x} cy={cabeza.y} r={14} {...cuerpo} />
      <path d={`M${hombro.x} ${hombro.y} L${cadera.x} ${cadera.y} L${rodilla.x} ${rodilla.y} L${tobillo.x} ${tobillo.y} L${tobillo.x + 22} ${tobillo.y}`} {...cuerpo} />
      <path d={`M${hombro.x} ${hombro.y} L${brazo.x} ${brazo.y}`} {...cuerpo} stroke={C.accent} />
      {/* espalda recta: línea guía sobre el torso */}
      {abajo && <line x1={cadera.x} y1={cadera.y} x2={hombro.x} y2={hombro.y} stroke={C.ok} strokeWidth={10} opacity={0.35} strokeLinecap="round" />}
      {!mini && (
        <>
          <g transform="translate(-232 100)"><Contador n={reps} /></g>
          <Etiqueta x={12} y={30} texto="espalda recta" />
          <Etiqueta x={12} y={52} texto="talones en el piso" />
          <Etiqueta x={12} y={74} texto={abajo ? 'muslos casi paralelos' : 'cadera hacia atrás'} />
        </>
      )}
    </svg>
  )
}

export function DemoEjercicio({ ejercicio, mini }: { ejercicio: 'brazos' | 'sentadilla'; mini?: boolean }) {
  return ejercicio === 'brazos' ? <DemoBrazos mini={mini} /> : <DemoSentadilla mini={mini} />
}

// ---------- Cómo acomodar la cámara ----------
function Laptop() {
  const f = useFase(4000, 0.9)
  const sube = tramo(f, 0.2, 0.55) * 26 // la laptop sube sobre libros hasta la altura del pecho
  const ok = sube > 24
  const camY = 116 - sube
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      <path d="M180 150 H300 M290 150 V190" stroke={C.line3} strokeWidth={5} strokeLinecap="round" />
      {sube > 1 && <rect x={232} y={150 - sube} width={46} height={sube} rx={3} fill={C.raised} stroke={C.line3} strokeWidth={2} />}
      <path d={`M232 ${150 - sube} H278 L268 ${120 - sube}`} stroke={C.text} strokeWidth={4} fill="none" strokeLinejoin="round" />
      <circle cx={268} cy={camY} r={4} fill={C.accent} />
      {/* campo de visión de la cámara */}
      <path d={`M268 ${camY} L70 ${camY - 70} L70 ${camY + 70} Z`} fill={C.accent} opacity={0.08} />
      <line x1={268} y1={camY} x2={70} y2={camY} stroke={ok ? C.ok : C.warn} strokeWidth={2} strokeDasharray="6 5" />
      {/* persona */}
      <circle cx={70} cy={52} r={15} {...cuerpo} />
      <path d="M70 68 V130 M50 90 L70 80 L90 90 M70 130 L60 188 M70 130 L80 188" {...cuerpo} />
      <text x={150} y={30} fill={ok ? C.ok : C.warn} fontSize={16} fontWeight={700}>{ok ? 'cámara a la altura del pecho' : 'muy baja'}</text>
    </svg>
  )
}

function Encuadre({ ejercicio }: { ejercicio: 'brazos' | 'sentadilla' }) {
  const f = useFase(4500, 0.9)
  const k = 1.6 - tramo(f, 0.1, 0.6) * 0.75 // la persona se aleja hasta caber completa en el cuadro
  const cabe = k < 0.9
  const alto = ejercicio === 'sentadilla' ? 150 : 96 // de la cabeza a los tobillos, o a la cadera
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      {/* vista de la cámara */}
      <defs><clipPath id={`cuadro-${ejercicio}`}><rect x={72} y={16} width={176} height={168} rx={9} /></clipPath></defs>
      <rect x={70} y={14} width={180} height={172} rx={10} fill={C.void} />
      {/* la figura se recorta al cuadro, como en la vista real de la cámara */}
      <g clipPath={`url(#cuadro-${ejercicio})`}><g transform={`translate(160 ${100}) scale(${k}) translate(-160 -100)`}>
        <circle cx={160} cy={100 - alto / 2 - 4} r={12} {...cuerpo} />
        <path d={`M160 ${100 - alto / 2 + 10} V${100 + (ejercicio === 'sentadilla' ? 10 : alto / 2)} M138 ${100 - alto / 2 + 22} H182`} {...cuerpo} />
        {ejercicio === 'sentadilla' && <path d={`M160 110 L146 ${100 + alto / 2} M160 110 L174 ${100 + alto / 2}`} {...cuerpo} />}
      </g></g>
      <rect x={70} y={14} width={180} height={172} rx={10} fill="none" stroke={cabe ? C.ok : C.warn} strokeWidth={4} />
      <text x={160} y={198} textAnchor="middle" fill={cabe ? C.ok : C.warn} fontSize={16} fontWeight={700}>
        {cabe ? (ejercicio === 'sentadilla' ? 'te veo de la cabeza a los tobillos' : 'te veo de la cabeza a la cadera') : 'aléjate un poco'}
      </text>
      <text x={290} y={100} textAnchor="middle" fill={C.text} fontSize={20} fontWeight={700} fontFamily="JetBrains Mono">{ejercicio === 'sentadilla' ? '≈2 m' : '≈1 m'}</text>
    </svg>
  )
}

function Luz() {
  const f = useFase(5000, 0.25)
  const bien = f < 0.5 // alterna: luz de frente (bien) / ventana detrás (mal)
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      <circle cx={160} cy={64} r={18} {...cuerpo} />
      <path d="M160 82 V140 M136 104 L160 94 L184 104 M160 140 L148 190 M160 140 L172 190" {...cuerpo} />
      {/* cámara al frente (a la derecha) */}
      <rect x={278} y={88} width={26} height={18} rx={4} fill={C.text} />
      {bien ? (
        <g>
          <circle cx={254} cy={40} r={14} fill={C.warnSoft} />
          {[0, 1, 2, 3].map((n) => <line key={n} x1={240} y1={46 + n * 6} x2={186} y2={58 + n * 8} stroke={C.warnSoft} strokeWidth={2} opacity={0.6} />)}
          <text x={160} y={24} textAnchor="middle" fill={C.ok} fontSize={16} fontWeight={700}>luz de frente</text>
        </g>
      ) : (
        <g>
          <rect x={28} y={30} width={70} height={100} rx={4} fill={C.subtle} opacity={0.9} />
          <path d="M63 30 V130 M28 80 H98" stroke={C.line3} strokeWidth={3} />
          <text x={160} y={24} textAnchor="middle" fill={C.crit} fontSize={16} fontWeight={700}>ventana detrás: contraluz</text>
        </g>
      )}
      <g transform="translate(274 150)">
        <circle r={14} fill={bien ? C.ok : C.crit} />
        {bien
          ? <path d="M-6 0 l4 4 l8 -9" stroke={C.void} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M-5 -5 l10 10 M5 -5 l-10 10" stroke={C.void} strokeWidth={3} strokeLinecap="round" />}
      </g>
    </svg>
  )
}

export function pasosMovimiento(ejercicio: 'brazos' | 'sentadilla'): PasoGuia[] {
  return [
    { titulo: 'Cámara a la altura del pecho', detalle: 'Si hace falta, sube la laptop sobre libros', escena: <Laptop /> },
    { titulo: ejercicio === 'sentadilla' ? 'Aléjate unos 2 metros' : 'Aléjate como 1 metro', detalle: 'Hasta que el cuadro se ponga verde', escena: <Encuadre ejercicio={ejercicio} /> },
    { titulo: 'Luz de frente', detalle: 'Nunca una ventana detrás de ti', escena: <Luz /> },
    { titulo: ejercicio === 'sentadilla' ? 'Así se hace la sentadilla' : 'Así se suben los brazos', escena: ejercicio === 'sentadilla' ? <DemoSentadilla /> : <DemoBrazos />, ms: 8400 },
  ]
}
