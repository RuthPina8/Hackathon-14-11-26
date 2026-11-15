import { C } from '../../lib/paleta'
import type { PasoGuia } from './GuiaAnimada'
import { rad, tramo, useFase, vaiven } from './useFase'

// Cómo medir la presión con el brazalete del kit médico, paso a paso y animado.
// Técnica recomendada para medir en casa (guía AHA): reposo de 5 min sentado con la espalda apoyada
// y los pies en el piso, brazo apoyado a la altura del corazón, brazalete sobre la piel 2–3 cm arriba
// del pliegue del codo, marca del tubo sobre la arteria, ajuste de dos dedos, sin hablar, y dos
// mediciones con un minuto de diferencia.

const V = '0 0 320 200'
const trazo = { stroke: C.accentSoft, strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
const Ok = ({ x, y, on }: { x: number; y: number; on: boolean }) => (
  <g opacity={on ? 1 : 0} style={{ transition: 'opacity .3s' }}>
    <circle cx={x} cy={y} r={14} fill={C.ok} />
    <path d={`M${x - 6} ${y} l4 4 l8 -9`} stroke={C.void} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </g>
)
const Mal = ({ x, y, on }: { x: number; y: number; on: boolean }) => (
  <g opacity={on ? 1 : 0} style={{ transition: 'opacity .3s' }}>
    <circle cx={x} cy={y} r={14} fill={C.crit} />
    <path d={`M${x - 5} ${y - 5} l10 10 M${x + 5} ${y - 5} l-10 10`} stroke={C.void} strokeWidth={3} strokeLinecap="round" />
  </g>
)

// Persona sentada de perfil, con el antebrazo apoyado en la mesa a la altura `brazoY`
function Sentado({ brazoY = 92, conBrazalete = false }: { brazoY?: number; conBrazalete?: boolean }) {
  const hombro = { x: 120, y: 70 }
  const codo = { x: 150, y: brazoY + 8 }
  const mano = { x: 196, y: brazoY + 6 }
  return (
    <g>
      {/* silla con respaldo */}
      <path d="M78 48 L84 142 M84 128 H142 M92 128 V176 M138 128 V176" stroke={C.line3} strokeWidth={5} strokeLinecap="round" fill="none" />
      {/* mesa */}
      <path d={`M160 ${brazoY + 14} H260 M244 ${brazoY + 14} V176`} stroke={C.line3} strokeWidth={5} strokeLinecap="round" />
      {/* cuerpo: espalda recta contra el respaldo, rodillas a 90°, pies planos */}
      <circle cx={112} cy={38} r={14} {...trazo} />
      <path d="M112 54 L108 124 L150 124 L150 172 L168 172" {...trazo} />
      <path d={`M${hombro.x} ${hombro.y} L${codo.x} ${codo.y} L${mano.x} ${mano.y}`} {...trazo} />
      {conBrazalete && <rect x={128} y={(hombro.y + codo.y) / 2 - 9} width={18} height={18} rx={4} fill={C.accent} transform={`rotate(${Math.atan2(codo.y - hombro.y, codo.x - hombro.x) * 57.3} ${137} ${(hombro.y + codo.y) / 2})`} />}
      {/* corazón */}
      <circle cx={118} cy={80} r={6} fill={C.crit} />
    </g>
  )
}

function Reposo() {
  const f = useFase(5000, 0.7)
  const ang = f * 360
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      <Sentado />
      {/* reloj de 5 minutos */}
      <circle cx={262} cy={52} r={30} fill="none" stroke={C.line2} strokeWidth={4} />
      <path d={`M262 52 L${262 + 22 * Math.sin(rad(ang))} ${52 - 22 * Math.cos(rad(ang))}`} stroke={C.accent} strokeWidth={4} strokeLinecap="round" />
      <text x={262} y={100} textAnchor="middle" fill={C.text} fontSize={18} fontWeight={700} fontFamily="JetBrains Mono">5 min</text>
      {/* sin hablar */}
      <g transform="translate(40 150)">
        <path d="M0 0 h34 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-20 l-8 8 v-8 h-6 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6z" fill="none" stroke={C.muted} strokeWidth={3} transform="translate(-6 -16)" />
        <path d="M-2 -18 L38 16" stroke={C.crit} strokeWidth={4} strokeLinecap="round" />
      </g>
      {/* pies planos */}
      <path d="M148 182 H176" stroke={C.ok} strokeWidth={4} strokeLinecap="round" opacity={0.5 + 0.5 * vaiven(f * 2)} />
    </svg>
  )
}

function AlturaCorazon() {
  const f = useFase(4500, 0.9)
  const bajo = 1 - tramo(f, 0.25, 0.55) // primero abajo (mal), luego sube a la altura del corazón
  const brazoY = 72 + bajo * 36
  const alineado = bajo < 0.05
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      <Sentado brazoY={brazoY} conBrazalete />
      <line x1={100} y1={80} x2={300} y2={80} stroke={alineado ? C.ok : C.warn} strokeWidth={3} strokeDasharray="8 6" />
      <text x={300} y={72} textAnchor="end" fill={alineado ? C.ok : C.warn} fontSize={15} fontWeight={700}>altura del corazón</text>
      {!alineado && <path d={`M210 ${brazoY + 4} v-16 m-7 7 l7 -7 l7 7`} stroke={C.warn} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      <Ok x={290} y={130} on={alineado} />
      <Mal x={290} y={130} on={!alineado} />
    </svg>
  )
}

// Brazo de cerca, horizontal: hombro a la izquierda, codo a la derecha
function BrazoCerca({ children }: { children?: React.ReactNode }) {
  return (
    <g>
      <path d="M20 78 C90 70 170 70 220 82 L300 96 M20 132 C90 140 170 138 214 126 L300 122" stroke={C.accentSoft} strokeWidth={5} fill="none" strokeLinecap="round" />
      {/* pliegue del codo */}
      <path d="M216 84 Q224 104 216 124" stroke={C.muted} strokeWidth={3} fill="none" strokeDasharray="5 4" />
      <text x={222} y={150} fill={C.muted} fontSize={14} fontWeight={600}>codo</text>
      {children}
    </g>
  )
}

function Colocar() {
  const f = useFase(4500, 0.9)
  const x = 20 + tramo(f, 0.1, 0.5) * 120 // el brazalete se desliza hasta 2–3 cm arriba del codo
  const listo = f > 0.5
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      <BrazoCerca>
        <rect x={x} y={64} width={56} height={84} rx={10} fill={C.accentBg} stroke={C.accent} strokeWidth={4} />
        <path d={`M${x + 8} 72 V140 M${x + 48} 72 V140`} stroke={C.accentLine} strokeWidth={3} />
        {listo && (
          <g>
            <path d={`M${x + 58} 170 H214 M${x + 58} 164 v12 M214 164 v12`} stroke={C.ok} strokeWidth={3} />
            <text x={(x + 58 + 214) / 2} y={192} textAnchor="middle" fill={C.ok} fontSize={16} fontWeight={700}>2–3 cm</text>
          </g>
        )}
      </BrazoCerca>
      <text x={20} y={40} fill={C.text} fontSize={15} fontWeight={600}>sobre la piel, sin manga</text>
      <Ok x={290} y={40} on={listo} />
    </svg>
  )
}

function Tubo() {
  const f = useFase(1100, 0.3)
  const pulso = 0.4 + 0.6 * Math.exp(-f * 5)
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      <BrazoCerca>
        {/* arteria por la cara interna del brazo, latiendo */}
        <path d="M30 118 C100 124 160 122 214 116" stroke={C.crit} strokeWidth={4} fill="none" opacity={pulso} />
        <rect x={140} y={64} width={56} height={84} rx={10} fill={C.accentBg} stroke={C.accent} strokeWidth={4} />
        {/* marca de la arteria y tubo: alineados sobre la arteria */}
        <path d="M168 108 l-8 -10 h16z" fill={C.ok} />
        <path d="M168 148 C168 172 196 178 236 182" stroke={C.muted} strokeWidth={5} fill="none" strokeLinecap="round" />
      </BrazoCerca>
      <text x={20} y={40} fill={C.text} fontSize={15} fontWeight={600}>marca ▼ sobre la arteria</text>
      <circle cx={30} cy={170} r={6} fill={C.crit} opacity={pulso} />
      <text x={42} y={175} fill={C.critSoft} fontSize={14} fontWeight={600}>arteria</text>
    </svg>
  )
}

function DosDedos() {
  const f = useFase(4000, 0.75)
  const entra = tramo(f, 0.15, 0.55) // dos dedos se deslizan bajo el borde del brazalete
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      {/* corte del brazo con el brazalete alrededor */}
      <ellipse cx={130} cy={104} rx={62} ry={62} fill="none" stroke={C.accentSoft} strokeWidth={5} />
      <ellipse cx={130} cy={104} rx={74} ry={74} fill="none" stroke={C.accent} strokeWidth={12} opacity={0.85} />
      {/* dedos */}
      {[0, 1].map((k) => (
        <rect key={k} x={232 - entra * 52} y={92 + k * 18} width={64} height={14} rx={7} fill={C.subtle} stroke={C.line3} strokeWidth={2} />
      ))}
      <text x={210} y={56} fill={C.text} fontSize={16} fontWeight={700}>caben 2 dedos</text>
      <text x={210} y={164} fill={C.muted} fontSize={14}>ni apretado ni flojo</text>
      <Ok x={290} y={190 - 16} on={f > 0.55} />
    </svg>
  )
}

function DosMediciones() {
  const f = useFase(7000, 0.95)
  const a = tramo(f, 0.05, 0.3)
  const espera = tramo(f, 0.35, 0.65)
  const b = tramo(f, 0.7, 0.92)
  const lectura = (k: number, s: number, d: number) => `${Math.round(s * k)}/${Math.round(d * k)}`
  return (
    <svg viewBox={V} className="h-full w-full" aria-hidden>
      {[0, 1].map((n) => {
        const k = n === 0 ? a : b
        return (
          <g key={n} transform={`translate(${n === 0 ? 24 : 200} 40)`}>
            <rect width={100} height={74} rx={12} fill={C.deep} stroke={k >= 1 ? C.ok : C.line2} strokeWidth={3} />
            <text x={50} y={44} textAnchor="middle" fill={k >= 1 ? C.text : C.faint} fontSize={k >= 1 ? 22 : 15} fontWeight={700} fontFamily="JetBrains Mono">
              {k >= 1 ? lectura(1, n === 0 ? 118 : 116, n === 0 ? 76 : 75) : k > 0 ? `midiendo${'.'.repeat(1 + Math.floor(k * 9) % 3)}` : '--/--'}
            </text>
            <text x={50} y={66} textAnchor="middle" fill={C.faint} fontSize={13}>{n === 0 ? '1.ª medición' : '2.ª medición'}</text>
          </g>
        )
      })}
      {/* espera de 1 minuto */}
      <circle cx={160} cy={77} r={22} fill="none" stroke={C.line2} strokeWidth={5} />
      <circle cx={160} cy={77} r={22} fill="none" stroke={C.accent} strokeWidth={5} strokeDasharray={`${espera * 138} 138`} transform="rotate(-90 160 77)" strokeLinecap="round" />
      <text x={160} y={82} textAnchor="middle" fill={C.text} fontSize={13} fontWeight={700}>1 min</text>
      <text x={160} y={160} textAnchor="middle" fill={b >= 1 ? C.ok : C.faint} fontSize={18} fontWeight={700}>{b >= 1 ? 'Anota el promedio: 117/76' : 'sin hablar ni moverte'}</text>
    </svg>
  )
}

export const PASOS_BRAZALETE: PasoGuia[] = [
  { titulo: 'Descansa 5 minutos', detalle: 'Espalda apoyada, pies en el piso, sin hablar', escena: <Reposo /> },
  { titulo: 'Brazo a la altura del corazón', detalle: 'Apoyado en la mesa, relajado', escena: <AlturaCorazon /> },
  { titulo: 'Brazalete arriba del codo', detalle: 'Sobre la piel, 2–3 cm arriba del pliegue', escena: <Colocar /> },
  { titulo: 'Marca sobre la arteria', detalle: 'El tubo queda por dentro del brazo', escena: <Tubo /> },
  { titulo: 'Ajusta: caben 2 dedos', escena: <DosDedos /> },
  { titulo: 'Mide 2 veces', detalle: 'Con 1 minuto entre cada una', escena: <DosMediciones />, ms: 7000 },
]
