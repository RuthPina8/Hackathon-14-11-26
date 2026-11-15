import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ShieldAlert } from 'lucide-react'
import { systemDetails, type Semaforo, type SystemStatus } from '../../store/mockData'
import { C } from '../../lib/paleta'

// Explorador del cuerpo (Inicio). Cada órgano de la figura y cada fila de la lista
// seleccionan un sistema; el panel de la derecha explica qué pasa, contra tu normal,
// qué riesgo de NASA cubre y qué hacer. Los colores salen del estado en vivo del store.

const COL: Record<Semaforo, string> = { ok: C.ok, warn: C.warn, crit: C.crit, none: C.none }
const BG: Record<Semaforo, string> = { ok: C.okBg, warn: C.warnBg, crit: C.critBg, none: C.sel }
const TXT: Record<Semaforo, string> = { ok: 'Dentro de tu normal', warn: 'Atención a bordo', crit: 'Escalar a Tierra', none: 'Proyección simulada' }
// Un sistema medido hoy pero sin línea base todavía no está "simulado", está aprendiendo tu normal
// Un sistema sin mediciones todavía no es "simulado": solo el óseo es proyección
const etiqueta = (s?: { estado: Semaforo; real?: Record<string, string>; sim?: boolean }) =>
  !s ? TXT.none : s.estado !== 'none' ? TXT[s.estado] : s.sim ? TXT.none : s.real ? 'Aprendiendo tu normal' : 'Sin datos todavía'
const capaTag = { real: ['real', 'Real'], self: ['self', 'Autorreportado'], sim: ['simt', 'Simulado'] } as const

// contorno del cuerpo (simétrico, generado a partir de la mitad derecha)
const BODY = 'M110 8 C125 8 137 20 137 40 C137 56 132 68 124 76 C120 80 119 84 119 90 C119 96 120 100 123 103 C130 107 142 109 152 113 C163 117 168 126 168 140 C169 158 171 176 173 192 C175 210 178 226 180 242 C181 252 183 262 181 272 C179 282 172 286 169 280 C166 272 168 262 167 252 C164 232 161 212 159 194 C157 176 156 160 154 146 C150 150 148 170 147 192 C146 208 150 224 152 240 C153 264 148 300 143 330 C140 352 141 374 139 396 C138 408 141 416 146 422 C150 428 140 432 125 430 C120 429 120 420 121 410 C122 380 123 350 121 322 C119 292 117 266 113 252 C112 248 110 247 110 247 C110 247 108 248 107 252 C103 266 101 292 99 322 C97 350 98 380 99 410 C100 420 100 429 95 430 C80 432 70 428 74 422 C79 416 82 408 81 396 C79 374 80 352 77 330 C72 300 67 264 68 240 C70 224 74 208 73 192 C72 170 70 150 66 146 C64 160 63 176 61 194 C59 212 56 232 53 252 C52 262 54 272 51 280 C48 286 41 282 39 272 C37 262 39 252 40 242 C42 226 45 210 47 192 C49 176 51 158 52 140 C52 126 57 117 68 113 C78 109 90 107 97 103 C100 100 101 96 101 90 C101 84 100 80 96 76 C88 68 83 56 83 40 C83 20 95 8 110 8 Z'

// centro de cada órgano, para el anillo de selección
const center: Record<string, [number, number, number]> = {
  mental: [110, 31, 27], sueno: [110, 56, 22], cardio: [122, 162, 22], inmune: [110, 172, 74], oseo: [110, 318, 74],
}

function Spark({ serie, color }: { serie: number[]; color: string }) {
  const min = Math.min(...serie), max = Math.max(...serie)
  const span = max - min || 1
  const pts = serie.map((v, i) => `${(i / (serie.length - 1)) * 116 + 2},${28 - ((v - min) / span) * 24}`).join(' ')
  const last = pts.split(' ').pop()!.split(',')
  return (
    <svg width="120" height="32" viewBox="0 0 120 32" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  )
}

function Organ({ id, label, sel, hover, onPick, onHover, children }: {
  id: string; label: string; sel: boolean; hover: boolean
  onPick: (id: string) => void; onHover: (id: string | null) => void; children: ReactNode
}) {
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(id) } }
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={sel}
      onClick={() => onPick(id)}
      onKeyDown={key}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
      style={{ cursor: 'pointer', outline: 'none', opacity: sel || hover ? 1 : 0.78, transition: 'opacity .2s' }}
    >
      {children}
    </g>
  )
}

export default function SystemExplorer({ sistemas }: { sistemas: SystemStatus[] }) {
  const reduce = useReducedMotion()
  const worst = [...sistemas].sort((a, b) => ['crit', 'warn', 'ok', 'none'].indexOf(a.estado) - ['crit', 'warn', 'ok', 'none'].indexOf(b.estado))[0]
  const [picked, setPicked] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const selId = picked ?? worst.id
  const by = Object.fromEntries(sistemas.map((s) => [s.id, s]))
  const col = (id: string) => COL[by[id]?.estado ?? 'none']

  const sel = by[selId]
  const det = systemDetails[selId]
  const st = sel.estado
  const [cx, cy, r] = center[selId]

  const organProps = (id: string) => ({ id, sel: selId === id, hover: hover === id, onPick: setPicked, onHover: setHover })

  return (
    <section className="card" aria-labelledby="cuerpo" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-[22px] pt-5">
        <h2 id="cuerpo" className="h2">Estado por sistema</h2>
        <span className="text-[13px] text-faint">Toca un órgano o un sistema para ver el detalle</span>
      </div>

      <div className="flex flex-wrap items-stretch gap-2 p-[22px] pt-4">
        {/* ---------- lista ---------- */}
        <div role="list" className="flex flex-col gap-1.5 min-w-0" style={{ flex: '1 1 240px', maxWidth: 300 }}>
          {sistemas.map((s) => {
            const on = s.id === selId
            return (
              <button
                key={s.id}
                type="button"
                role="listitem"
                aria-pressed={on}
                onClick={() => setPicked(s.id)}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                className="flex items-center gap-2.5 min-h-[48px] px-3 rounded-[12px] text-sm text-left cursor-pointer transition-colors"
                style={{
                  background: on ? BG[s.estado] : hover === s.id ? C.hover : 'transparent',
                  border: `1px ${s.sim ? 'dashed' : 'solid'} ${on ? COL[s.estado] : s.sim ? C.line3 : C.line}`,
                  color: s.sim && !on ? C.muted : C.text,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: s.sim ? 'transparent' : COL[s.estado], border: s.sim ? '1.5px dashed #A3AEC4' : undefined }} />
                <span className="flex-1 min-w-0 font-medium">{s.nombre}</span>
                <span className="num text-sm" style={{ color: s.estado === 'ok' || s.sim ? C.muted : COL[s.estado] }}>{s.valor}</span>
              </button>
            )
          })}
        </div>

        {/* ---------- figura ---------- */}
        <div className="relative flex justify-center shrink-0" style={{ flex: '0 0 240px' }}>
          <svg width="230" height="460" viewBox="0 0 220 440" role="group" aria-label="Figura del cuerpo, cada órgano es un botón">
            <defs>
              <linearGradient id="bodyFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#1A2844" />
                <stop offset="0.55" stopColor="#121C30" />
                <stop offset="1" stopColor="#0D1524" />
              </linearGradient>
              <radialGradient id="bodyLight" cx="0.5" cy="0.3" r="0.6">
                <stop offset="0" stopColor={C.accent} stopOpacity="0.10" />
                <stop offset="1" stopColor={C.accent} stopOpacity="0" />
              </radialGradient>
              <filter id="bodyGlow" x="-20%" y="-10%" width="140%" height="120%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
              <linearGradient id="scan" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={C.accent} stopOpacity="0" />
                <stop offset="0.5" stopColor={C.accent} stopOpacity="0.32" />
                <stop offset="1" stopColor={C.accent} stopOpacity="0" />
              </linearGradient>
              <clipPath id="bodyClip"><path d={BODY} /></clipPath>
            </defs>

            {/* silueta: halo, relleno con volumen y contorno */}
            <path d={BODY} fill="none" stroke={C.accent} strokeOpacity="0.28" strokeWidth="6" filter="url(#bodyGlow)" />
            <path d={BODY} fill="url(#bodyFill)" />
            <path d={BODY} fill="url(#bodyLight)" />
            <path d={BODY} fill="none" stroke="#3A5078" strokeWidth="1.4" strokeLinejoin="round" />

            {/* detalles anatómicos sutiles */}
            <g fill="none" stroke={C.line2} strokeWidth="1.1" strokeLinecap="round" opacity="0.9">
              <path d="M84 118 Q96 122 106 119 M136 118 Q124 122 114 119" />
              <path d="M110 160 L110 232" strokeDasharray="2 4" />
              <path d="M84 196 Q96 200 106 198 M136 196 Q124 200 114 198" opacity="0.6" />
              <path d="M81 326 Q88 331 96 326 M139 326 Q132 331 124 326" />
              <path d="M52 196 Q57 199 62 196 M168 196 Q163 199 158 196" />
            </g>
            <circle cx="110" cy="216" r="1.8" fill={C.line2} />

            {/* pulmones de referencia, sin estado */}
            <g fill={C.accent} fillOpacity="0.05" stroke={C.line2} strokeWidth="1">
              <path d="M86 128 C76 140 74 172 78 196 C88 200 100 194 104 182 L104 132 C98 124 92 124 86 128 Z" />
              <path d="M134 128 C144 140 146 172 142 196 C132 200 120 194 116 182 L116 132 C122 124 128 124 134 128 Z" />
            </g>

            {/* huesos (simulado) */}
            <Organ label="Huesos y músculos, proyección simulada" {...organProps('oseo')}>
              <rect x="30" y="250" width="160" height="180" fill="transparent" />
              <g stroke={col('oseo')} strokeWidth="4.5" strokeLinecap="round" strokeDasharray="7 6" fill="none" opacity="0.75">
                <line x1="87" y1="258" x2="87" y2="316" /><line x1="133" y1="258" x2="133" y2="316" />
                <line x1="88" y1="338" x2="90" y2="398" /><line x1="132" y1="338" x2="130" y2="398" />
                <line x1="58" y1="142" x2="56" y2="188" /><line x1="162" y1="142" x2="164" y2="188" />
                <line x1="54" y1="204" x2="49" y2="244" /><line x1="166" y1="204" x2="171" y2="244" />
              </g>
              <g fill={col('oseo')} opacity="0.75"><circle cx="88" cy="327" r="4.5" /><circle cx="132" cy="327" r="4.5" /></g>
            </Organ>

            {/* sistema inmune: ganglios y bazo */}
            <Organ label={`Sistema inmune, ${etiqueta(by.inmune)}`} {...organProps('inmune')}>
              <g stroke={col('inmune')} strokeOpacity="0.35" strokeWidth="1.2" fill="none">
                <path d="M103 96 L74 150 M117 96 L146 150 M74 150 L88 206 M146 150 L124 238 M88 206 L96 238" />
              </g>
              <g fill={col('inmune')}>
                <circle cx="103" cy="96" r="3.5" /><circle cx="117" cy="96" r="3.5" />
                <circle cx="74" cy="150" r="3.5" /><circle cx="146" cy="150" r="3.5" />
                <circle cx="96" cy="238" r="3.5" /><circle cx="124" cy="238" r="3.5" />
                <ellipse cx="88" cy="206" rx="8" ry="5" opacity="0.85" />
              </g>
            </Organ>

            {/* corazón */}
            <Organ label={`Corazón, ${etiqueta(by.cardio)}`} {...organProps('cardio')}>
              <circle cx="122" cy="162" r="18" fill="transparent" />
              <motion.path
                d="M122 178 C104 166 104 148 114 146 C119 145 122 149 122 153 C122 149 125 145 130 146 C140 148 140 166 122 178 Z"
                fill={col('cardio')}
                animate={reduce ? undefined : { scale: [1, 1.12, 1, 1.06, 1] }}
                transition={{ duration: by.cardio?.estado === 'crit' ? 0.6 : 1.1, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: '122px 162px' }}
              />
            </Organ>

            {/* cerebro */}
            <Organ label={`Cerebro, ${etiqueta(by.mental)}`} {...organProps('mental')}>
              <path d="M110 16 C96 13 87 21 88 31 C84 37 87 45 94 46 L126 46 C133 45 136 37 132 31 C133 21 124 13 110 16 Z" fill={col('mental')} fillOpacity="0.22" stroke={col('mental')} strokeWidth="1.6" />
              <path d="M110 18 L110 45 M98 25 C102 29 102 35 97 40 M122 25 C118 29 118 35 123 40" stroke={col('mental')} strokeWidth="1.3" fill="none" strokeLinecap="round" />
            </Organ>

            {/* ojos */}
            <Organ label={`Ojos y sueño, ${etiqueta(by.sueno)}`} {...organProps('sueno')}>
              <rect x="88" y="48" width="44" height="16" fill="transparent" />
              <ellipse cx="99" cy="56" rx="6.5" ry="3.6" fill={col('sueno')} />
              <ellipse cx="121" cy="56" rx="6.5" ry="3.6" fill={col('sueno')} />
            </Organ>

            {/* anillo del sistema seleccionado */}
            <motion.circle
              key={selId}
              cx={cx} cy={cy} r={r}
              fill="none" stroke={COL[st]} strokeWidth="1.5"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={reduce ? { opacity: 0.7, scale: 1 } : { opacity: [0.8, 0.15, 0.8], scale: [1, 1.08, 1] }}
              transition={{ duration: 2, repeat: reduce ? 0 : Infinity }}
              style={{ transformOrigin: `${cx}px ${cy}px`, pointerEvents: 'none' }}
            />

            {/* línea de escaneo */}
            {!reduce && (
              <g clipPath="url(#bodyClip)" style={{ pointerEvents: 'none' }}>
                <motion.rect x="20" width="180" height="40" fill="url(#scan)" animate={{ y: [-40, 440] }} transition={{ duration: 5, repeat: Infinity, ease: 'linear' }} />
              </g>
            )}
          </svg>
        </div>

        {/* ---------- detalle ---------- */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selId + st}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            aria-live="polite"
            className="flex flex-col gap-4 min-w-0 rounded-[14px] p-5 bg-deep border"
            style={{ flex: '1.4 1 320px', borderColor: st === 'ok' || st === 'none' ? C.line : COL[st] + '66', borderStyle: sel.sim ? 'dashed' : 'solid' }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="k">{det.organo}</p>
                <h3 className="m-0 mt-1 font-[family-name:var(--font-display)] text-xl font-semibold">{sel.nombre}</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="tag" style={{ background: BG[st], color: COL[st] }}>{etiqueta(sel)}</span>
                <span className={`tag ${capaTag[det.capa][0]}`}>{capaTag[det.capa][1]}</span>
              </div>
            </div>

            <p className="m-0 text-sm leading-relaxed" style={{ color: st === 'crit' ? C.critSoft : C.text }}>{sel.nota ?? det.porque}</p>

            <div className="flex flex-col gap-2">
              {(sel.metricas ?? det.metricas).map((m) => {
                const mst = st === 'crit' && m.label === 'Presión' ? 'crit' : m.estado
                const real = sel.real?.[m.label]
                const val = st === 'crit' && m.label === 'Presión' ? sel.valor : real ?? m.value
                return (
                  <div key={m.label} className="flex items-center gap-3 py-2 border-b border-line last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="m-0 text-[13px] text-muted">{m.label}</p>
                      <p className="m-0 mt-0.5 flex items-baseline gap-2">
                        <strong className="num text-lg" style={{ color: mst === 'ok' ? C.text : COL[mst] }}>{val}</strong>
                        <span className="num text-sm text-faint">tu normal {m.base}</span>
                        {real && <span className="tag real">Medido hoy</span>}
                      </p>
                    </div>
                    {m.serie.length > 1 ? <Spark serie={m.serie} color={COL[mst]} /> : <span className="w-[120px] text-right text-[13px] text-faint">{m.serie.length ? '1 dato' : 'sin datos'}</span>}
                  </div>
                )
              })}
            </div>

            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
              <div className="p-3 rounded-[10px] bg-panel border border-line">
                <p className="k flex items-center gap-1.5"><ShieldAlert size={13} />Riesgo NASA</p>
                <p className="m-0 mt-1.5 text-[13px] leading-snug">{det.riesgo}</p>
              </div>
              <div className="p-3 rounded-[10px] bg-panel border border-line">
                <p className="k">Por qué importa</p>
                <p className="m-0 mt-1.5 text-[13px] leading-snug text-subtle">{det.funcion}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-auto">
              <p className="m-0 text-[13px] text-muted flex-1 min-w-[200px]"><strong className="text-text">Qué hacer:</strong> {st === 'crit' ? 'Siéntate, repite la medición en 5 minutos y sigue la alerta roja' : det.hacer}</p>
              <Link to={st === 'crit' ? '/alerts' : det.link.to} className="btn sec sm">{st === 'crit' ? 'Ver alerta' : det.link.label}<ArrowRight size={15} /></Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
