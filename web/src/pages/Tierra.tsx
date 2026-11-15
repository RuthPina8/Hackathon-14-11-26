import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Check, Globe, Rocket } from 'lucide-react'
import { useAppStore, LINK } from '../store/useAppStore'
import { PageHeader, SimBanner } from '../components/ui/Page'
import type { QueueMessage } from '../store/mockData'

const PRI: Record<number, [string, string, string]> = {
  4: ['Crítica', '#FF6B7A', '#1A0508'],
  3: ['Alta', '#2A1218', '#FFB8BF'],
  2: ['Media', '#241D0D', '#F5D79A'],
  1: ['Baja', '#15233B', '#A3AEC4'],
}

const tiempo = (s: number) => (s < 90 ? `${Math.max(1, Math.ceil(s))} s` : `${Math.ceil(s / 60)} min`)

// Mensajes que vienen del back: él decide cuándo se envía y cuándo llega
const SHIP: Record<number, string> = { 4: '#FF6B7A', 3: '#F5B544', 2: '#8AD9F8', 1: '#A3AEC4' }

// Nave que lleva un paquete hacia Tierra, el color es la prioridad
function Nave({ color }: { color: string }) {
  return (
    <svg width="40" height="22" viewBox="0 0 40 22" aria-hidden="true" style={{ filter: `drop-shadow(0 0 6px ${color}99)`, overflow: 'visible' }}>
      <path className="halo" d="M9 8 L0 11 L9 14 Z" fill="#FFB86B" />
      <path d="M10 5 L4 0.5 L15 5 Z M10 17 L4 21.5 L15 17 Z" fill={color} fillOpacity="0.75" />
      <path d="M9 5 H26 C32 5 37 8.5 40 11 C37 13.5 32 17 26 17 H9 Z" fill={color} />
      <path d="M9 5 H26 C32 5 37 8.5 40 11 H9 Z" fill="#fff" fillOpacity="0.18" />
      <circle cx="26" cy="11" r="2.6" fill="#0A0F1B" stroke="#E8ECF4" strokeOpacity="0.6" strokeWidth="1" />
    </svg>
  )
}

function rowStateServer(x: QueueMessage, link: { retraso_s: number } | null) {
  const sv = x.server!
  const base = { bar: false, done: false, travel: false, waiting: false, pct: 0 }
  if (sv.estado === 'entregado') return { ...base, st: 'Tierra recibió', c: '#8FF0C4', pct: 100, done: true }
  if (sv.estado === 'en_transito') {
    const falta = Math.max(0, (sv.eta_s ?? 0) - (Date.now() - sv.recibidoMs) / 1000)
    const total = Math.max(link?.retraso_s ?? 0, sv.eta_s ?? 0, 1)
    return { ...base, st: falta > 0 ? `En camino, llega en ${tiempo(falta)}` : 'Llegando a Tierra', c: '#8AD9F8', pct: Math.round(((total - falta) / total) * 100), bar: true, travel: true }
  }
  if (sv.estado === 'transmitiendo') return { ...base, st: 'Enviando', c: '#8AD9F8', pct: 100, bar: true }
  return { ...base, st: 'En cola', c: '#A3AEC4', waiting: true }
}

function rowState(x: QueueMessage, t: number, link: { retraso_s: number } | null) {
  if (x.server) return rowStateServer(x, link)
  if (x.arrive !== null && t >= x.arrive) return { st: 'Tierra recibió', c: '#8FF0C4', pct: 100, bar: false, done: true, travel: false, waiting: false }
  if (x.arrive !== null) {
    const left = Math.max(1, Math.ceil(x.arrive - t))
    return { st: `En camino, llega en ${left} min`, c: '#8AD9F8', pct: Math.round(((LINK.DELAY_MIN - (x.arrive - t)) / LINK.DELAY_MIN) * 100), bar: true, done: false, travel: true, waiting: false }
  }
  if (x.sent > 0) { const pct = Math.round((x.sent / x.kb) * 100); return { st: `Enviando ${pct}%`, c: '#8AD9F8', pct, bar: true, done: false, travel: false, waiting: false } }
  if (x.big && t < LINK.WINDOW_MIN) return { st: 'Espera ventana', c: '#A3AEC4', pct: 0, bar: false, done: false, travel: false, waiting: true }
  return { st: 'En cola', c: '#A3AEC4', pct: 0, bar: false, done: false, travel: false, waiting: true }
}

export default function Tierra() {
  const queue = useAppStore((s) => s.queue)
  const t = useAppStore((s) => s.queueT)
  const demo = useAppStore((s) => s.demo)
  const prioritize = useAppStore((s) => s.prioritizePacket)
  const server = useAppStore((s) => s.server)
  const link = useAppStore((s) => s.link)

  const rows = queue
    .map((x) => ({ x, s: rowState(x, t, link) }))
    .sort((a, b) => (a.s.done === b.s.done ? Number(!!b.x.boost) - Number(!!a.x.boost) || b.x.pri - a.x.pri || a.x.id - b.x.id : a.s.done ? 1 : -1))
  const travelling = rows.filter((r) => r.s.travel).length
  const pending = rows.filter((r) => !r.s.done).length
  const win = Math.ceil(LINK.WINDOW_MIN - t)
  const muestra = rows.find((r) => r.x.server && r.x.server.payload.nivel)?.x
  const cols = { gridTemplateColumns: '90px 1fr 80px 190px' }
  const sim = demo ? 'card sim' : 'card'

  return (
    <>
      {demo && <SimBanner>Retraso y ancho de banda simulados para una nave rumbo a Marte, el tiempo corre a la velocidad de la barra de demo</SimBanner>}
      <PageHeader
        kicker="Enlace de comunicaciones"
        title="Comunicación con Tierra"
        right={<span className="num text-[13px] text-[#A3AEC4]">Reloj de misión T+{Math.floor(t)} min</span>}
      />

      <section className={`${sim} flex flex-col gap-[22px]`} style={{ padding: 26 }} aria-label="Enlace nave a Tierra">
        <div className="flex items-center gap-[18px]">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <span className="w-14 h-14 rounded-2xl bg-[#15233B] border border-[#2F3F60] grid place-items-center"><Rocket size={26} color="#8AD9F8" strokeWidth={1.8} /></span>
            <span className="text-[13px] font-semibold">Nave</span>
          </div>
          <div className="flex-1 relative h-14">
            <div className="absolute left-0 right-0 top-[27px] border-t-2 border-dashed border-[#2F3F60]" />
            {rows.filter((r) => r.s.travel).slice(0, 4).map(({ x, s: st }, i) => (
              <span
                key={x.id}
                className="mv absolute -ml-[20px]"
                title={`${x.name}, ${st.st.toLowerCase()}`}
                style={{ left: `${Math.min(96, Math.max(4, st.pct))}%`, top: 19 + (i % 2 ? 7 : -3), transition: 'left 1s linear' }}
              >
                <Nave color={SHIP[x.pri]} />
              </span>
            ))}
            <span className="num absolute left-1/2 -top-0.5 -translate-x-1/2 text-xs text-[#A3AEC4] whitespace-nowrap">{server && link ? `${tiempo(link.retraso_s)} · solo ida` : '13 min 20 s · solo ida'}</span>
          </div>
          <div className="flex flex-col items-center gap-2 shrink-0">
            <span className="w-14 h-14 rounded-full bg-[#0B2636] border border-[#1F5A78] grid place-items-center"><Globe size={26} color="#8AD9F8" strokeWidth={1.8} /></span>
            <span className="text-[13px] font-semibold">Tierra</span>
          </div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))' }}>
          {(server && link
            ? [['Ida y vuelta', tiempo(link.retraso_s * 2)], ['Ancho de banda', `${link.ancho_banda_kbps} kbps`], ['En camino', String(travelling)], ['Pendientes', String(pending)]]
            : [['Ida y vuelta', '26:40'], ['Próxima ventana', win > 0 ? `${win} min` : 'Abierta'], ['Ancho de banda', t >= LINK.WINDOW_MIN ? '8 kbps' : '2 kbps'], ['Pendientes', String(pending)]]
          ).map(([k, v]) => (
            <div key={k} className="p-4 rounded-xl bg-[#0A0F1B] border border-[#1C2740]"><p className="k">{k}</p><p className="big" style={{ marginTop: 6, fontSize: 24 }}>{v}</p></div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-5">
        <section className={sim} style={{ flex: '3 1 520px', minWidth: 0, padding: 0, overflow: 'hidden' }} aria-labelledby="cola">
          <div className="px-[18px] pt-5 pb-3">
            <h2 id="cola" className="h2">Cola con prioridad</h2>
            <p className="mt-1 mb-0 text-[13px] text-[#A3AEC4]">Lo crítico sale primero y lo rutinario espera la ventana. Si algo te urge, usa "Enviar primero"</p>
          </div>
          <div className="overflow-x-auto"><div className="min-w-[580px]">
            <div className="trow" style={{ ...cols, minHeight: 38 }}><span className="k">Prioridad</span><span className="k">Paquete</span><span className="k">Tamaño</span><span className="k">Estado</span></div>
            {rows.length === 0 && <p className="m-0 px-[18px] py-6 text-sm text-[#A3AEC4]">No hay paquetes en la cola. Cuando escales una alerta o se genere un reporte, aparece aquí.</p>}
            <AnimatePresence initial={false}>
              {rows.map(({ x, s }) => {
                const p = PRI[x.pri]
                return (
                  <motion.div layout key={x.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="trow" style={{ ...cols, color: s.done ? '#A3AEC4' : '#E8ECF4' }}>
                    <span><span className="tag" style={{ background: p[1], color: p[2] }}>{p[0]}</span></span>
                    <span className="flex flex-col gap-0.5">
                      {x.name}
                      {x.boost && !s.done && <span className="text-[11px] font-semibold text-[#8AD9F8]">Pediste enviarlo primero</span>}
                    </span>
                    <span className="num">{x.kb} KB</span>
                    <span className="flex flex-col gap-1.5 items-start">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: s.c }}>{s.done && <Check size={14} strokeWidth={2.6} />}{s.st}</span>
                      {s.bar && <span className="h-1 w-full rounded bg-[#1C2740]"><motion.span className="block h-full rounded bg-[#5CC8F5]" animate={{ width: `${s.pct}%` }} /></span>}
                      {s.waiting && !x.boost && !x.server && (
                        <button type="button" onClick={() => prioritize(x.id)} className="inline-flex items-center gap-1 min-h-[30px] px-2 -ml-2 rounded-md border-0 bg-transparent text-xs font-semibold text-[#5CC8F5] hover:bg-[#111A2C] cursor-pointer">
                          <ArrowUp size={13} strokeWidth={2.4} />Enviar primero
                        </button>
                      )}
                    </span>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div></div>
        </section>

        {demo && <section className={`${sim} flex flex-col gap-3`} style={{ flex: '2 1 320px', minWidth: 0 }} aria-labelledby="paq">
          <div className="flex justify-between items-baseline gap-2"><h2 id="paq" className="h2">Paquete médico</h2><span className="num text-xs text-[#A3AEC4]">{muestra ? `${muestra.kb} KB` : '2.1 KB comprimido'}</span></div>
          <pre className="code">{JSON.stringify(muestra?.server?.payload ?? { astronauta: 'A1', ts: 'D9T09:12', nivel: 'amarilla', senal: 'perclos', valor: 0.19, base: 0.09, desde_h: 14, accion: 'descanso' }, null, 2)}</pre>
          <p className="m-0 text-[13px] text-[#A3AEC4] leading-relaxed">Solo viaja lo necesario para decidir, el detalle completo se queda a bordo hasta que haya ancho de banda</p>
        </section>}
      </div>
    </>
  )
}
