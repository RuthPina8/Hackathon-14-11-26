import { useCallback, useEffect, useRef, useState } from 'react'
import { abrirCamaraReal } from '../lib/camaraReal'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Eye, Lock, ScanFace, Shuffle, UserPlus, X } from 'lucide-react'
import type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import {
  averageSignature, CHALLENGES, descriptorDistance, faceDescriptor, getFaceApi, getFaceLandmarker, poseCheck,
  randomChallenges, type ChallengeId,
} from '../lib/faceLandmarker'
import { crewForLogin, useSession } from '../store/useSession'
import { useAppStore } from '../store/useAppStore'
import { C } from '../lib/paleta'

// Inicio de sesión solo con la cara: reconoce quién eres, pide 2 gestos al azar como prueba
// de vida (una foto no se mueve y un video grabado no sabe qué gestos tocan) y abre tu sesión. La primera vez cada tripulante registra su cara.

// Distancia entre huellas de face-api: misma persona suele quedar en 0.25 a 0.40, otra persona arriba de 0.5.
const MATCH_THRESHOLD = 0.42 // menor = más estricto. Ajustar en sitio si confunde o rechaza
const MATCH_MARGIN = 0.06 // el mejor candidato debe ganarle al segundo por al menos esto
const IDENT_SAMPLES = 4
const ENROLL_SAMPLES = 10
const SAMPLE_EVERY_MS = 220
const CHALLENGE_STEPS = 1
const CHALLENGE_MS = 5000 // tiempo para cada gesto
const HOLD_FRAMES = 3 // cuadros seguidos que debe sostenerse el gesto

type Phase =
  | 'loading' | 'nocam' | 'search' | 'align' | 'identify' | 'challenge' | 'welcome' | 'unknown' | 'noFaces'
  | 'pick' | 'enroll' | 'enrolled'

const PHASE_TEXT: Partial<Record<Phase, string>> = {
  loading: 'Preparing the camera…',
  search: 'Position yourself in front of the camera',
  identify: 'Recognizing…',
  unknown: 'I don’t recognize you',
  noFaces: 'No faces registered on this device yet',
  pick: 'Who are you? First time only',
  enroll: 'Look at the camera and move your head a little',
  enrolled: 'Face registered',
}

export default function Login() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)

  const faces = useSession((s) => s.faces)
  const login = useSession((s) => s.login)
  const enroll = useSession((s) => s.enroll)
  const demo = useAppStore((s) => s.demo)

  const [phase, setPhase] = useState<Phase>('loading')
  const [hint, setHint] = useState('')
  const [who, setWho] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [enrollId, setEnrollId] = useState<string | null>(null)
  const [dist, setDist] = useState<number | null>(null)
  const [chal, setChal] = useState<{ list: ChallengeId[]; idx: number }>({ list: [], idx: 0 })
  const [failMsg, setFailMsg] = useState('')

  // estado mutable del ciclo de detección (no causa renders)
  const st = useRef({
    phase: 'loading' as Phase, buf: [] as number[][], enrollBuf: [] as number[][], enrollId: null as string | null,
    who: null as string | null, misses: 0,
    chal: [] as ChallengeId[], chalIdx: 0, chalSince: 0, chalNeutral: false, chalHold: 0, faces: faces, busy: false, lastSample: 0,
  })
  useEffect(() => { st.current.faces = faces }, [faces])

  const go = useCallback((p: Phase) => { st.current.phase = p; setPhase(p) }, [])

  // ---------- cámara + ciclo de detección ----------
  useEffect(() => {
    let alive = true

    async function start() {
      try {
        const stream = await abrirCamaraReal(640, 480)
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        const v = videoRef.current!
        v.srcObject = stream
        await v.play()
      } catch {
        go('nocam')
        return
      }
      let fl: FaceLandmarker
      try { [fl] = await Promise.all([getFaceLandmarker(2), getFaceApi()]) } catch { go('nocam'); setHint('Couldn’t load the recognition models'); return }
      if (!alive) return
      go(Object.keys(st.current.faces).length ? 'search' : 'noFaces')

      const loop = () => {
        if (!alive) return
        const v = videoRef.current, c = canvasRef.current
        if (v && c && v.readyState >= 2) {
          const res = fl.detectForVideo(v, performance.now())
          draw(c, v, res.faceLandmarks)
          step(res, v)
        }
        raf.current = requestAnimationFrame(loop)
      }
      raf.current = requestAnimationFrame(loop)
    }

    function draw(c: HTMLCanvasElement, v: HTMLVideoElement, faces: { x: number; y: number }[][]) {
      c.width = v.videoWidth; c.height = v.videoHeight
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, c.width, c.height)
      const ph = st.current.phase
      ctx.fillStyle = ph === 'welcome' || ph === 'enrolled' ? 'rgba(61,220,151,0.85)' : ph === 'unknown' ? 'rgba(255,107,122,0.8)' : 'rgba(138,217,248,0.7)'
      for (const lm of faces) for (let i = 0; i < lm.length; i += 3) ctx.fillRect(lm[i].x * c.width - 1, lm[i].y * c.height - 1, 2, 2)
    }

    function fail(msg: string) {
      const s = st.current
      s.buf = []; s.who = null; setWho(null); setFailMsg(msg)
      go('search')
    }

    function sample(v: HTMLVideoElement, expect: Phase, onDesc: (d: number[]) => void) {
      const s = st.current
      const now = performance.now()
      if (s.busy || now - s.lastSample < SAMPLE_EVERY_MS) return
      s.busy = true; s.lastSample = now
      faceDescriptor(v)
        .then((d) => { if (d && st.current.phase === expect) onDesc(d) })
        .catch(() => { /* cuadro sin cara, se ignora */ })
        .finally(() => { st.current.busy = false })
    }

    function step(res: FaceLandmarkerResult, v: HTMLVideoElement) {
      const s = st.current
      const ph = s.phase
      if (ph === 'welcome' || ph === 'enrolled' || ph === 'pick' || ph === 'unknown' || ph === 'noFaces' || ph === 'nocam' || ph === 'loading') return

      const n = res.faceLandmarks.length
      if (n === 0) { if (ph !== 'enroll') { s.buf = []; go('search') } setHint(ph === 'enroll' ? 'I can’t see your face' : ''); return }
      if (n > 1) { s.buf = []; setHint('Only one person in front of the camera'); return }

      const lm = res.faceLandmarks[0]
      const pose = poseCheck(lm)
      const bad = !pose.nearEnough ? 'Move a little closer' : pose.tooClose ? 'Move back a little' : !pose.centered ? 'Center your face in the oval' : !pose.frontal && ph !== 'enroll' && ph !== 'challenge' ? 'Look straight at the camera' : ''

      // ----- registro de cara -----
      if (ph === 'enroll') {
        if (bad && bad !== 'Look straight at the camera') { setHint(bad); return }
        setHint('')
        sample(v, 'enroll', (d) => {
          s.enrollBuf.push(d)
          setProgress(s.enrollBuf.length / ENROLL_SAMPLES)
          if (s.enrollBuf.length >= ENROLL_SAMPLES && s.enrollId) {
            enroll(s.enrollId, averageSignature(s.enrollBuf))
            go('enrolled')
            setTimeout(() => { s.buf = []; go('search') }, 1600)
          }
        })
        return
      }

      if (bad) { s.buf = []; setHint(bad); if (ph !== 'challenge') go('align'); return }
      setHint('')

      // ----- reto de vida aleatorio -----
      if (ph === 'challenge') {
        const id = s.chal[s.chalIdx]
        const ok = CHALLENGES[id].check(lm, res.faceBlendshapes[0])
        // el gesto debe empezar desde cara neutra y sostenerse unos cuadros
        if (!ok) { s.chalNeutral = true; s.chalHold = 0 }
        else if (s.chalNeutral) s.chalHold++
        // la persona debe seguir siendo la misma durante el reto
        sample(v, 'challenge', (d) => {
          const ref = s.faces[s.who!]
          if (ref && descriptorDistance(d, ref) > MATCH_THRESHOLD + 0.08) fail('The face changed during verification')
        })
        if (s.chalHold >= HOLD_FRAMES) {
          s.chalIdx++; s.chalNeutral = false; s.chalHold = 0; s.chalSince = performance.now()
          if (s.chalIdx >= s.chal.length) {
            go('welcome')
            const who = s.who!
            setTimeout(() => login(who), 1300)
          } else setChal({ list: s.chal, idx: s.chalIdx })
        } else if (performance.now() - s.chalSince > CHALLENGE_MS) {
          fail('The gesture wasn’t completed in time')
        }
        return
      }

      // ----- identificar -----
      if (ph === 'search' || ph === 'align') go('identify')
      sample(v, 'identify', (d) => {
        s.buf.push(d)
        setProgress(s.buf.length / IDENT_SAMPLES)
        if (s.buf.length < IDENT_SAMPLES) return
        const q = averageSignature(s.buf)
        s.buf = []
        const ranked = Object.entries(s.faces)
          .filter(([, f]) => f.length === q.length)
          .map(([id, f]) => ({ id, d: descriptorDistance(q, f) }))
          .sort((a, b) => a.d - b.d)
        const best = ranked[0]
        setDist(best ? best.d : null)
        const clear = best && best.d < MATCH_THRESHOLD && (!ranked[1] || ranked[1].d - best.d > MATCH_MARGIN)
        if (clear) {
          s.who = best.id; setWho(best.id); s.misses = 0
          s.chal = randomChallenges(CHALLENGE_STEPS); s.chalIdx = 0; s.chalNeutral = false; s.chalHold = 0; s.chalSince = performance.now()
          setChal({ list: s.chal, idx: 0 }); setFailMsg('')
          go('challenge')
        } else if (++s.misses >= 2) {
          s.misses = 0
          go('unknown')
        }
      })
    }

    start()
    return () => {
      alive = false
      cancelAnimationFrame(raf.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [go, enroll, login])

  const retry = () => { st.current.buf = []; setWho(null); go(Object.keys(faces).length ? 'search' : 'noFaces') }
  const startEnroll = (id: string) => { st.current.enrollId = id; st.current.enrollBuf = []; setEnrollId(id); setProgress(0); go('enroll') }

  const person = crewForLogin.find((c) => c.id === (phase === 'enroll' || phase === 'enrolled' ? enrollId : who))
  const ovalColor = phase === 'welcome' || phase === 'enrolled' ? C.ok : phase === 'unknown' ? C.crit : phase === 'challenge' ? C.warn : C.accent
  const showRing = phase === 'identify' || phase === 'enroll'
  const enrolledCount = Object.keys(faces).length

  return (
    <div className="min-h-screen w-screen flex flex-wrap bg-bg">
      {/* ---------- panel de marca ---------- */}
      <aside className="flex flex-col justify-between gap-8 p-10 bg-deep border-r border-line" style={{ flex: '1 1 340px', maxWidth: 460 }}>
        <div className="flex items-center gap-3">
          <svg width="38" height="38" viewBox="0 0 30 30" aria-hidden="true">
            <rect x="1" y="1" width="28" height="28" rx="9" fill={C.accentBg} stroke={C.accentLine} />
            <path d="M6 16h4l2.5-6 4.5 11 2.5-5h4.5" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-[family-name:var(--font-display)] text-2xl font-bold">AstroHealth</span>
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="m-0 font-[family-name:var(--font-display)] text-[34px] leading-tight font-semibold">Your pocket doctor on the mission</h1>
          <p className="m-0 text-[15px] text-muted leading-relaxed">Sign in with just your face. The same camera that identifies you is the one that measures you, so your data never gets mixed with another crew member’s.</p>
          <ul className="m-0 p-0 list-none flex flex-col gap-3 text-sm text-subtle">
            <li className="flex items-center gap-3"><ScanFace size={18} color={C.accent} />It recognizes you with no username or password</li>
            <li className="flex items-center gap-3"><Eye size={18} color={C.accent} />A random gesture confirms it’s you, not a photo or a video</li>
            <li className="flex items-center gap-3"><Lock size={18} color={C.accent} />Your facial signature stays on board, it never travels to Earth</li>
          </ul>
        </div>
        <p className="m-0 text-sm text-faint">{enrolledCount} of {crewForLogin.length} crew members with a registered face on this device</p>
      </aside>

      {/* ---------- cámara ---------- */}
      <main className="flex-1 min-w-0 flex flex-col items-center justify-center gap-6 p-8" style={{ flexBasis: 520 }}>
        <div className="relative w-full max-w-[560px] aspect-[4/3] rounded-[24px] overflow-hidden bg-void border border-line">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)', opacity: phase === 'loading' || phase === 'nocam' ? 0 : 0.9 }} />
          <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />

          {/* óvalo guía con anillo de progreso */}
          <svg viewBox="0 0 400 300" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
            <defs><mask id="ovalMask"><rect width="400" height="300" fill="white" /><ellipse cx="200" cy="148" rx="88" ry="114" fill="black" /></mask></defs>
            <rect width="400" height="300" fill={C.void} fillOpacity="0.55" mask="url(#ovalMask)" />
            <ellipse cx="200" cy="148" rx="88" ry="114" fill="none" stroke={ovalColor} strokeWidth="2.5" strokeDasharray={showRing ? undefined : '8 7'} strokeOpacity={showRing ? 0.25 : 1} />
            {showRing && (
              <ellipse cx="200" cy="148" rx="88" ry="114" fill="none" stroke={ovalColor} strokeWidth="3.5" pathLength={100}
                strokeDasharray={`${progress * 100} 100`} transform="rotate(-90 200 148)" strokeLinecap="round" style={{ transition: 'stroke-dasharray .15s' }} />
            )}
          </svg>

          {/* estado */}
          <div className="absolute top-4 left-4 right-4 flex justify-between gap-2">
            <span className="tag" style={{ background: 'rgba(4,7,14,.85)', color: ovalColor, fontSize: 14, padding: '7px 10px', boxShadow: `inset 0 0 0 1px ${ovalColor}55` }}>
              {phase === 'enroll' ? 'REGISTERING FACE' : 'SIGN IN'}
            </span>
            {demo && dist !== null && <span className="tag num" style={{ background: 'rgba(4,7,14,.85)', color: C.muted }}>dist {dist.toFixed(3)} · threshold {MATCH_THRESHOLD}</span>}
          </div>

          {phase === 'challenge' && chal.list[chal.idx] && (
            <div className="absolute left-4 right-4 bottom-4 flex flex-col gap-2.5 p-4 rounded-2xl" style={{ background: 'rgba(4,7,14,.88)', boxShadow: 'inset 0 0 0 1px #5C4A1C' }}>
              <div className="flex items-center gap-3">
                {chal.list[chal.idx] === 'left' && <ArrowLeft size={30} color={C.warn} />}
                <span className="flex-1 flex items-center gap-2.5">
                  <Shuffle size={16} color={C.warn} className="shrink-0" />
                  <strong className="font-[family-name:var(--font-display)] text-xl">{CHALLENGES[chal.list[chal.idx]].label}</strong>
                </span>
                {chal.list[chal.idx] === 'right' && <ArrowRight size={30} color={C.warn} />}
                <span className="flex gap-1.5">
                  {chal.list.map((c, i) => <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: i < chal.idx ? C.ok : i === chal.idx ? C.warn : C.line2 }} />)}
                </span>
              </div>
              <div className="h-1 rounded bg-line overflow-hidden">
                <motion.div key={chal.idx} className="h-full bg-warn" initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: CHALLENGE_MS / 1000, ease: 'linear' }} />
              </div>
            </div>
          )}

          <AnimatePresence>
            {(phase === 'welcome' || phase === 'enrolled') && (
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 grid place-items-center pointer-events-none">
                <span className="w-24 h-24 rounded-full grid place-items-center bg-ok text-on-accent" style={{ boxShadow: '0 0 60px rgba(61,220,151,.55)' }}><Check size={48} strokeWidth={3} /></span>
              </motion.div>
            )}
          </AnimatePresence>

          {phase === 'nocam' && (
            <div className="absolute inset-0 grid place-items-center p-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <ScanFace size={40} color={C.line3} />
                <p className="m-0 font-semibold">I couldn’t use the camera</p>
                <p className="m-0 text-sm text-muted">{hint || 'Allow camera access in the browser and reload the page'}</p>
              </div>
            </div>
          )}
        </div>

        {/* ---------- mensaje y acciones ---------- */}
        <div className="w-full max-w-[560px] flex flex-col items-center gap-4 text-center min-h-[150px]">
          <AnimatePresence mode="wait">
            <motion.div key={phase + (hint || '')} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-1.5" aria-live="polite">
              <p className="m-0 font-[family-name:var(--font-display)] text-2xl font-semibold">
                {phase === 'welcome' ? `Hi, ${person?.nombre}` : phase === 'challenge' ? CHALLENGES[chal.list[chal.idx]]?.label ?? '' : phase === 'enrolled' ? `All set, ${person?.nombre}` : hint || PHASE_TEXT[phase] || ''}
              </p>
              <p className="m-0 text-sm text-muted">
                {phase === 'welcome' && 'Opening your session…'}
                {phase === 'challenge' && `${person?.nombre}, we’re checking it’s you and not a photo or a video`}
                {(phase === 'search' || phase === 'align') && failMsg && <span style={{ color: C.critSoft }}>{failMsg}, try again</span>}
                {phase === 'identify' && 'Hold still for a moment'}
                {phase === 'unknown' && 'It may be the light or the angle. If it’s your first time here, register your face'}
                {phase === 'enroll' && `Registering ${person?.nombre}, it only takes a few seconds`}
                {phase === 'enrolled' && 'Now face the camera to sign in'}
              </p>
            </motion.div>
          </AnimatePresence>

          {(phase === 'unknown' || phase === 'noFaces') && (
            <div className="flex flex-wrap justify-center gap-2.5">
              {phase === 'unknown' && <button type="button" className="btn sec" onClick={retry}>Try again</button>}
              <button type="button" className="btn pri" onClick={() => go('pick')}><UserPlus size={17} />Register my face</button>
            </div>
          )}

          {phase === 'pick' && (
            <div className="w-full flex flex-col gap-3">
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, 100%), 1fr))' }}>
                {crewForLogin.map((c) => (
                  <button key={c.id} type="button" onClick={() => startEnroll(c.id)}
                    className="flex flex-col items-center gap-1.5 p-3.5 rounded-[14px] bg-panel border border-line hover:border-accent cursor-pointer text-text" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <span className="w-11 h-11 rounded-[12px] grid place-items-center bg-sel font-[family-name:var(--font-display)] font-bold">{c.id}</span>
                    <span className="text-sm font-semibold">{c.nombre}</span>
                    <span className="text-[13px] text-faint">{faces[c.id] ? 'Already registered, update' : c.cargo}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn sec sm self-center" onClick={retry}><X size={15} />Cancel</button>
            </div>
          )}

          {demo && phase !== 'welcome' && (
            <button type="button" onClick={() => login(crewForLogin[0].id)} className="mt-2 border-0 bg-transparent text-sm text-faint underline cursor-pointer">
              Demo mode: sign in as {crewForLogin[0].nombre} without camera
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
