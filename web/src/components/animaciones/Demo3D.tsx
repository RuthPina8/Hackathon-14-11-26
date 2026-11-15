import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { C } from '../../lib/paleta'
import { movimientoReducido } from '../../lib/efectos'
import { DemoEjercicio } from './Ejercicios'
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
    renderer.setPixelRatio(Math.min(mini ? 1 : 2, window.devicePixelRatio))
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
    if (ejercicio === 'brazos') camara.position.set(3.9, 1.4, 3.0)
    else camara.position.set(4.1, 1.25, 2.6)
    camara.lookAt(objetivo)

    // Luces de estudio: clave al frente, relleno del cielo y un contorno cian por detrás
    escena.add(new THREE.HemisphereLight('#dbe8ff', '#0b1220', 1.1))
    const clave = new THREE.DirectionalLight('#ffffff', 2.4)
    clave.position.set(2.5, 4, 4)
    clave.castShadow = !mini
    clave.shadow.mapSize.set(1024, 1024)
    clave.shadow.camera.near = 0.5
    clave.shadow.camera.far = 14
    clave.shadow.radius = 4
    escena.add(clave)
    const contorno = new THREE.DirectionalLight(C.accent, 2.2)
    contorno.position.set(-3, 2.5, -3.5)
    escena.add(contorno)

    // Piso: sombra suave, plataforma con anillos y cuadrícula tenue
    const geos: THREE.BufferGeometry[] = []
    const mats: THREE.Material[] = []
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.38 }))
    piso.rotation.x = -Math.PI / 2
    piso.receiveShadow = true
    escena.add(piso)
    geos.push(piso.geometry); mats.push(piso.material as THREE.Material)
    for (const [r0, r1, op] of [[0.62, 0.64, 0.8], [0.8, 0.81, 0.4]] as const) {
      const m = new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: op, side: THREE.DoubleSide })
      const anillo = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), m)
      anillo.rotation.x = -Math.PI / 2
      anillo.position.y = 0.002
      escena.add(anillo)
      geos.push(anillo.geometry); mats.push(m)
    }
    const grid = new THREE.GridHelper(8, 32, C.accentLine, C.holoLine)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.25
    escena.add(grid)
    mats.push(grid.material as THREE.Material); geos.push(grid.geometry)

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
      modelo.position.y = -bb.min.y * s
      grupo.add(modelo)

      vestir(modelo, C.accent, mats, true)

      const h = buscarHueso(modelo)
      const huesos = {
        cadera: h('Hips'), col: h('Spine'),
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
        apuntar(pie, dedo, dirPie)
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
          return { ang: g, ok: g > 82, texto: g > 82 ? 'Altura de hombros' : 'Hombros' }
        }
        // Sentadilla: la cadera baja y va hacia atrás
        const objetivoCadera = caderaMundo0.clone().add(new THREE.Vector3(0, -d * largoMuslo * 0.62, -d * largoMuslo * 0.42 * frente))
        huesos.cadera.position.copy(huesos.cadera.parent!.worldToLocal(objetivoCadera))
        modelo.updateMatrixWorld(true)
        const angI = pierna(huesos.musloI, huesos.piernaI, huesos.pieI, huesos.dedoI, tobilloI, dirPieI)
        pierna(huesos.musloD, huesos.piernaD, huesos.pieD, huesos.dedoD, tobilloD, dirPieD)
        girarMundo(huesos.col, ejeLado, frente * THREE.MathUtils.degToRad(d * 32)) // espalda recta, inclinada
        const adelante = new THREE.Vector3(0, -0.1 + d * 0.15, frente)
        apuntar(huesos.brazoI, huesos.anteI, adelante.clone().setX(lado * 0.1)); apuntar(huesos.anteI, huesos.manoI, adelante.clone().setX(lado * 0.1))
        apuntar(huesos.brazoD, huesos.anteD, adelante.clone().setX(-lado * 0.1)); apuntar(huesos.anteD, huesos.manoD, adelante.clone().setX(-lado * 0.1))
        return { ang: angI, ok: d > 0.9, texto: d > 0.9 ? 'Abajo' : 'Rodilla' }
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
      renderer.dispose()
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement)
    }
  }, [ejercicio, mini])

  if (fallo) return <DemoEjercicio ejercicio={ejercicio} mini={mini} />

  return (
    <div className="relative h-full w-full" style={{ background: 'radial-gradient(ellipse at 50% 40%, #12304A 0%, #0A1626 55%, #060B16 100%)' }}>
      <div ref={caja} className="absolute inset-0" role="img" aria-label={ejercicio === 'brazos' ? 'Astronauta en 3D haciendo elevación frontal de brazos' : 'Astronauta en 3D haciendo sentadilla controlada'} />
      {!mini && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
            <span ref={angRef} className="num rounded-lg bg-[rgba(6,11,22,.8)] px-3 py-1.5 text-[17px] font-bold text-accent-soft">--</span>
            <span ref={okRef} className="rounded-lg bg-ok-bg px-3 py-1.5 text-[15px] font-bold text-ok-soft transition-opacity" style={{ opacity: 0 }}>
              {ejercicio === 'brazos' ? '✓ Codos rectos, brazos al frente' : '✓ Espalda recta, talones abajo'}
            </span>
          </div>
          <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-center rounded-xl bg-[rgba(6,11,22,.8)] px-4 py-2">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-faint">Reps</span>
            <span ref={repRef} className="num text-[30px] font-bold leading-none text-accent">0</span>
          </div>
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[rgba(6,11,22,.75)] px-3 py-1 text-[13px] text-faint">Arrastra para girar</span>
        </>
      )}
    </div>
  )
}
