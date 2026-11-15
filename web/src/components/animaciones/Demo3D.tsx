import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { C } from '../../lib/paleta'
import { movimientoReducido } from '../../lib/efectos'
import { DemoEjercicio } from './Ejercicios'
import { crearEstacion } from './estacion'
import { ALTURA, apuntar, buscarHueso, cargarModelo, girarMundo, v, vestir } from './esqueleto'

// El astronauta del Inicio (mismo modelo con esqueleto) haciendo los ejercicios de ASTRA-MOVE en 3D.
// La animación se calcula moviendo sus huesos:
// - Elevación de brazos: los dos hombros suben a la vez con los codos rectos.
// - Sentadilla: la cadera baja y va hacia atrás; las piernas se resuelven con cinemática inversa de
//   dos huesos para que los pies queden fijos en el piso; la espalda se inclina un poco, recta.
// En pantalla: el ángulo que mide la cámara (hombro o rodilla) y el contador de repeticiones.
// 30 cuadros por segundo; con "reducir movimiento" queda quieto en la pose clave.

const FPS = 30

type Ejercicio = 'brazos' | 'sentadilla'

export default function Demo3D({ ejercicio, mini = false }: { ejercicio: Ejercicio; mini?: boolean }) {
  const caja = useRef<HTMLDivElement>(null)
  const angRef = useRef<HTMLSpanElement>(null)
  const repRef = useRef<HTMLSpanElement>(null)
  const okRef = useRef<HTMLSpanElement>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const reducido = movimientoReducido()
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFallo(true)
      return
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = !mini
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'

    const escena = new THREE.Scene()
    const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    const objetivo = new THREE.Vector3(0, ejercicio === 'sentadilla' ? 0.8 : 1.0, 0)
    // Los dos ejercicios se ven de tres cuartos de perfil: así se nota que los brazos van al frente
    // y la profundidad de la sentadilla (de frente, el brazo apuntaría a la cámara y no se vería)
    if (ejercicio === 'brazos') camara.position.set(3.3, 1.4, 2.6)
    else camara.position.set(3.4, 1.2, 2.3)
    camara.lookAt(objetivo)

    // Entorno: módulo de estación espacial (luces, paredes, ventana, piso y plataforma)
    const geos: THREE.BufferGeometry[] = []
    const mats: THREE.Material[] = []
    const texturas: THREE.Texture[] = []
    const estacion = crearEstacion(escena, renderer, { geos, mats, texturas }, { sombras: !mini })

    // Tamaño
    const ajustar = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h)
      camara.aspect = w / h
      camara.updateProjectionMatrix()
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)

    // Girar con el dedo
    const grupo = new THREE.Group()
    escena.add(grupo)
    let arrastre = false, ultimoX = 0, giroY = 0
    const abajo = (e: PointerEvent) => { arrastre = true; ultimoX = e.clientX; renderer.domElement.setPointerCapture(e.pointerId) }
    const mover = (e: PointerEvent) => { if (!arrastre) return; giroY += (e.clientX - ultimoX) * 0.01; ultimoX = e.clientX }
    const arriba = () => { arrastre = false }
    renderer.domElement.addEventListener('pointerdown', abajo)
    renderer.domElement.addEventListener('pointermove', mover)
    renderer.domElement.addEventListener('pointerup', arriba)

    let cancelado = false
    let frame = 0

    cargarModelo().then((gltf) => {
      if (cancelado) return
      const modelo = clonarEsqueleto(gltf.scene)
      modelo.updateMatrixWorld(true)
      const bb = new THREE.Box3().setFromObject(modelo)
      const s = ALTURA / (bb.max.y - bb.min.y)
      modelo.scale.setScalar(s)
      modelo.position.y = -bb.min.y * s + estacion.alturaPiso
      grupo.add(modelo)

      vestir(modelo, C.accent, mats, true, geos)

      const h = buscarHueso(modelo)
      const huesos = {
        cadera: h('Hips'), col: h('Spine'), cuello: h('Neck'),
        brazoI: h('LeftArm'), anteI: h('LeftForeArm'), manoI: h('LeftHand'),
        brazoD: h('RightArm'), anteD: h('RightForeArm'), manoD: h('RightHand'),
        musloI: h('LeftUpLeg'), piernaI: h('LeftLeg'), pieI: h('LeftFoot'), dedoI: h('LeftToeBase'),
        musloD: h('RightUpLeg'), piernaD: h('RightLeg'), pieD: h('RightFoot'), dedoD: h('RightToeBase'),
      }
      // Pose de reposo para volver a ella en cada cuadro
      const reposo = new Map<THREE.Object3D, THREE.Quaternion>()
      modelo.traverse((o) => { if ((o as THREE.Bone).isBone) reposo.set(o, o.quaternion.clone()) })
      const caderaReposo = huesos.cadera.position.clone()
      modelo.updateMatrixWorld(true)

      // Orientación del modelo: hacia dónde ve y cuál es su izquierda
      const pc = huesos.cadera.getWorldPosition(v())
      const lado = Math.sign(huesos.brazoI.getWorldPosition(v()).x - pc.x) || 1
      const frente = Math.sign(huesos.dedoI.getWorldPosition(v()).z - huesos.pieI.getWorldPosition(v()).z) || 1
      const ejeLado = new THREE.Vector3(1, 0, 0)
      const largoMuslo = huesos.musloI.getWorldPosition(v()).distanceTo(huesos.piernaI.getWorldPosition(v()))
      const largoPierna = huesos.piernaI.getWorldPosition(v()).distanceTo(huesos.pieI.getWorldPosition(v()))
      const tobilloI = huesos.pieI.getWorldPosition(v())
      const tobilloD = huesos.pieD.getWorldPosition(v())
      const dirPieI = huesos.dedoI.getWorldPosition(v()).sub(tobilloI)
      const dirPieD = huesos.dedoD.getWorldPosition(v()).sub(tobilloD)
      const caderaMundo0 = huesos.cadera.getWorldPosition(v())
      const piePlano = new Map<THREE.Object3D, THREE.Quaternion>([[huesos.pieI, huesos.pieI.getWorldQuaternion(new THREE.Quaternion())], [huesos.pieD, huesos.pieD.getWorldQuaternion(new THREE.Quaternion())]])
      const articulacionCadera0 = huesos.musloI.getWorldPosition(v())

      const reiniciar = () => {
        reposo.forEach((qq, b) => b.quaternion.copy(qq))
        huesos.cadera.position.copy(caderaReposo)
        modelo.updateMatrixWorld(true)
      }

      // Pierna con cinemática inversa de dos huesos en el plano de perfil (y arriba, z al frente)
      const pierna = (muslo: THREE.Object3D, rodillaH: THREE.Object3D, pie: THREE.Object3D, dedo: THREE.Object3D, tobillo: THREE.Vector3, dirPie: THREE.Vector3) => {
        const cad = muslo.getWorldPosition(v())
        const dz = (tobillo.z - cad.z) * frente, dy = tobillo.y - cad.y
        const dist = Math.min(Math.hypot(dz, dy), largoMuslo + largoPierna - 1e-4)
        const phi = Math.atan2(dy, dz)
        const a = Math.acos(THREE.MathUtils.clamp((largoMuslo ** 2 + dist ** 2 - largoPierna ** 2) / (2 * largoMuslo * dist), -1, 1))
        // de las dos soluciones, la rodilla va hacia el frente
        const c1 = phi + a, c2 = phi - a
        const ang = Math.cos(c1) > Math.cos(c2) ? c1 : c2
        const rodilla = new THREE.Vector3(cad.x + (tobillo.x - cad.x) * 0.5, cad.y + Math.sin(ang) * largoMuslo, cad.z + Math.cos(ang) * largoMuslo * frente)
        apuntar(muslo, rodillaH, rodilla.clone().sub(cad))
        apuntar(rodillaH, pie, tobillo.clone().sub(rodillaH.getWorldPosition(v())))
        // el pie conserva exactamente su orientación de pie parado: planta completa en el piso, sin girar
        const q0 = piePlano.get(pie)
        if (q0) { pie.quaternion.copy(pie.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q0)); pie.updateMatrixWorld(true) }
        else apuntar(pie, dedo, dirPie)
        // ángulo de rodilla (como lo mide la cámara: cadera -> rodilla -> tobillo)
        const r = rodillaH.getWorldPosition(v())
        return THREE.MathUtils.radToDeg(cad.clone().sub(r).angleTo(tobillo.clone().sub(r)))
      }

      const periodo = ejercicio === 'brazos' ? 3.6 : 4.2
      const reloj = new THREE.Clock()
      let acumulado = 0
      let reps = 0
      let faseAnterior = 0

      const pose = (d: number) => {
        reiniciar()
        if (ejercicio === 'brazos') {
          // Elevación frontal: de los costados (10°) hasta extendidos al frente a la altura de los hombros (90°),
          // los dos a la vez, codos rectos, brazos paralelos al ancho de los hombros
          const g = 10 + d * 80
          const th = THREE.MathUtils.degToRad(g)
          const dirI = new THREE.Vector3(lado * 0.1, -Math.cos(th), Math.sin(th) * frente)
          const dirD = new THREE.Vector3(-lado * 0.1, -Math.cos(th), Math.sin(th) * frente)
          apuntar(huesos.brazoI, huesos.anteI, dirI); apuntar(huesos.anteI, huesos.manoI, dirI)
          apuntar(huesos.brazoD, huesos.anteD, dirD); apuntar(huesos.anteD, huesos.manoD, dirD)
          return { ang: g, ok: g > 82, texto: g > 82 ? 'Shoulder height' : 'Shoulders' }
        }
        // Sentadilla como la hace un cuerpo humano:
        // - abajo, el muslo queda casi paralelo al piso (15° arriba de la horizontal) y la espinilla se inclina
        //   22° al frente: la rodilla queda sobre la punta del pie, no más adelante;
        // - la cadera va hacia atrás y TODO el tronco se inclina desde la cadera (bisagra de cadera), con la
        //   espalda recta; antes solo se doblaba la columna y el cuerpo se veía partido;
        // - los pies no se mueven: talones y puntas en el piso; la cabeza sigue viendo al frente.
        const MUSLO = THREE.MathUtils.degToRad(15), ESPINILLA = THREE.MathUtils.degToRad(22)
        const alturaAbajo = tobilloI.y + largoPierna * Math.cos(ESPINILLA) + largoMuslo * Math.sin(MUSLO)
        const baja = Math.max(0, articulacionCadera0.y - alturaAbajo)
        const atras = Math.max(0, largoMuslo * Math.cos(MUSLO) - largoPierna * Math.sin(ESPINILLA) - (articulacionCadera0.z - tobilloI.z) * frente)
        const objetivoCadera = caderaMundo0.clone().add(new THREE.Vector3(0, -d * baja, -d * atras * frente))
        huesos.cadera.position.copy(huesos.cadera.parent!.worldToLocal(objetivoCadera))
        modelo.updateMatrixWorld(true)
        girarMundo(huesos.cadera, ejeLado, frente * THREE.MathUtils.degToRad(d * 40)) // bisagra de cadera
        girarMundo(huesos.col, ejeLado, -frente * THREE.MathUtils.degToRad(d * 6)) // pecho arriba
        girarMundo(huesos.cuello, ejeLado, -frente * THREE.MathUtils.degToRad(d * 26)) // mirada al frente
        const angI = pierna(huesos.musloI, huesos.piernaI, huesos.pieI, huesos.dedoI, tobilloI, dirPieI)
        pierna(huesos.musloD, huesos.piernaD, huesos.pieD, huesos.dedoD, tobilloD, dirPieD)
        // brazos al frente como contrapeso, a la altura de los hombros
        const adelante = new THREE.Vector3(0, -0.85 + d * 0.85, (0.12 + d * 0.88) * frente)
        apuntar(huesos.brazoI, huesos.anteI, adelante.clone().setX(lado * 0.1)); apuntar(huesos.anteI, huesos.manoI, adelante.clone().setX(lado * 0.1))
        apuntar(huesos.brazoD, huesos.anteD, adelante.clone().setX(-lado * 0.1)); apuntar(huesos.anteD, huesos.manoD, adelante.clone().setX(-lado * 0.1))
        return { ang: angI, ok: d > 0.9, texto: d > 0.9 ? 'Down' : 'Knee' }
      }

      const hud = (r: { ang: number; ok: boolean; texto: string }) => {
        if (angRef.current) angRef.current.textContent = `${r.texto} ${Math.round(r.ang)}°`
        if (repRef.current) repRef.current.textContent = String(reps)
        if (okRef.current) okRef.current.style.opacity = r.ok ? '1' : '0'
      }

      if (reducido) {
        hud(pose(1))
        renderer.render(escena, camara)
        return
      }

      const animar = () => {
        frame = requestAnimationFrame(animar)
        acumulado += reloj.getDelta()
        if (acumulado < 1 / FPS) return
        acumulado = 0
        const f = (reloj.elapsedTime % periodo) / periodo
        if (f < faseAnterior) reps += 1
        faseAnterior = f
        const d = 0.5 - 0.5 * Math.cos(f * Math.PI * 2)
        grupo.rotation.y += (giroY - grupo.rotation.y) * 0.15
        hud(pose(d))
        estacion.animar(reloj.elapsedTime)
        renderer.render(escena, camara)
      }
      animar()
    }).catch(() => { if (!cancelado) setFallo(true) })

    return () => {
      cancelado = true
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', abajo)
      renderer.domElement.removeEventListener('pointermove', mover)
      renderer.domElement.removeEventListener('pointerup', arriba)
      geos.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      texturas.forEach((x) => x.dispose())
      renderer.dispose()
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement)
    }
  }, [ejercicio, mini])

  if (fallo) return <DemoEjercicio ejercicio={ejercicio} mini={mini} />

  return (
    <div className="relative h-full w-full" style={{ background: 'radial-gradient(ellipse at 50% 40%, #12304A 0%, #0A1626 55%, #060B16 100%)' }}>
      <div ref={caja} className="absolute inset-0" role="img" aria-label={ejercicio === 'brazos' ? '3D astronaut doing front arm raises' : '3D astronaut doing a controlled squat'} />
      {!mini && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
            <span ref={angRef} className="num rounded-lg bg-[rgba(6,11,22,.8)] px-3 py-1.5 text-[17px] font-bold text-accent-soft">--</span>
            <span ref={okRef} className="rounded-lg bg-ok-bg px-3 py-1.5 text-[15px] font-bold text-ok-soft transition-opacity" style={{ opacity: 0 }}>
              {ejercicio === 'brazos' ? '✓ Elbows straight, arms forward' : '✓ Back straight, heels down'}
            </span>
          </div>
          <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-center rounded-xl bg-[rgba(6,11,22,.8)] px-4 py-2">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-faint">Reps</span>
            <span ref={repRef} className="num text-[30px] font-bold leading-none text-accent">0</span>
          </div>
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[rgba(6,11,22,.75)] px-3 py-1 text-[13px] text-faint">Drag to rotate</span>
        </>
      )}
    </div>
  )
}
