import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { C } from '../../lib/paleta'
import { movimientoReducido } from '../../lib/efectos'
import { crearEstacion } from './estacion'
import { ALTURA, apuntar, buscarHueso, cargarModelo, v, vestir } from './esqueleto'
import { crearHaz, crearMesa, crearMonitorPresion, crearSilla } from './utileria'

// Guía del brazalete en 3D con el astronauta del Inicio, sentado a la mesa.
// Una sola escena para los 6 pasos: la cámara viaja suave de un plano a otro y cada paso anima lo suyo.
// Técnica para medir en casa (guía AHA): 5 min de reposo con la espalda apoyada y los pies en el piso;
// brazo apoyado con el brazalete a la altura del corazón; brazalete sobre la piel 2–3 cm arriba del
// pliegue del codo; marca sobre la arteria (cara interna); ajuste de dos dedos; dos mediciones con un
// minuto entre cada una, sin hablar.
// Si no hay WebGL se muestra la animación 2D del mismo paso (`fallback`).

const FPS = 30
const ANCHO_BRAZALETE = 0.14 // m, un brazalete de adulto
const R_BRAZO = 0.07 // radio aproximado del brazo del modelo a 1.8 m
const R_AJUSTADO = 0.086
const R_FLOJO = 0.104
const DESDE_CODO = 0.025 + ANCHO_BRAZALETE / 2 // centro del brazalete: borde 2.5 cm arriba del pliegue

const tramo = (f: number, a: number, b: number) => THREE.MathUtils.clamp((f - a) / (b - a), 0, 1)
const suave = (x: number) => x * x * (3 - 2 * x)

interface Hud { texto: string; ok: boolean | null }

export default function Brazalete3D({ paso, ms, play, fallback }: { paso: number; ms: number; play: boolean; fallback: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null)
  const textoRef = useRef<HTMLSpanElement>(null)
  const okRef = useRef<HTMLSpanElement>(null)
  const extraRef = useRef<HTMLSpanElement>(null)
  const estado = useRef({ paso, ms, play })
  useEffect(() => { estado.current = { paso, ms, play } })
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
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'

    const escena = new THREE.Scene()
    const camara = new THREE.PerspectiveCamera(32, 1, 0.05, 50)
    const geos: THREE.BufferGeometry[] = []
    const mats: THREE.Material[] = []
    const texturas: THREE.Texture[] = []
    const malla = <G extends THREE.BufferGeometry, M extends THREE.Material>(g: G, m: M) => {
      geos.push(g); mats.push(m)
      const o = new THREE.Mesh(g, m)
      o.castShadow = true
      o.receiveShadow = true
      return o
    }

    // Entorno: módulo de estación espacial (luces, paredes, ventana y piso), sin plataforma porque hay silla y mesa
    const estacion = crearEstacion(escena, renderer, { geos, mats, texturas }, { plataforma: 0 })

    const ajustar = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h)
      camara.aspect = w / h
      camara.updateProjectionMatrix()
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)

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
      escena.add(modelo)
      vestir(modelo, C.accent, mats, true, geos, { mochila: false })
      modelo.updateMatrixWorld(true)

      const h = buscarHueso(modelo)
      const hu = {
        cadera: h('Hips'), pecho: h('Spine2'),
        brazoI: h('LeftArm'), anteI: h('LeftForeArm'), manoI: h('LeftHand'), dedoI: h('LeftHandMiddle1'),
        brazoD: h('RightArm'), anteD: h('RightForeArm'), manoD: h('RightHand'), dedoD: h('RightHandMiddle1'),
        musloI: h('LeftUpLeg'), piernaI: h('LeftLeg'), pieI: h('LeftFoot'), puntaI: h('LeftToeBase'),
        musloD: h('RightUpLeg'), piernaD: h('RightLeg'), pieD: h('RightFoot'), puntaD: h('RightToeBase'),
      }

      // Orientación del modelo: hacia dónde ve (frente, eje z) y de qué lado tiene el brazo izquierdo (eje x)
      const pc = hu.cadera.getWorldPosition(v())
      const lado = Math.sign(hu.brazoI.getWorldPosition(v()).x - pc.x) || 1
      const frente = Math.sign(hu.puntaI.getWorldPosition(v()).z - hu.pieI.getWorldPosition(v()).z) || 1
      const tobillo0 = hu.pieI.getWorldPosition(v()).y
      const dirPieI = hu.puntaI.getWorldPosition(v()).sub(hu.pieI.getWorldPosition(v()))
      const dirPieD = hu.puntaD.getWorldPosition(v()).sub(hu.pieD.getWorldPosition(v()))

      // --- Sentado: muslos horizontales, rodillas a 90°, pies planos, espalda recta ---
      const sentar = () => {
        for (const [muslo, pierna, pie, punta, x, dPie] of [
          [hu.musloI, hu.piernaI, hu.pieI, hu.puntaI, lado, dirPieI],
          [hu.musloD, hu.piernaD, hu.pieD, hu.puntaD, -lado, dirPieD],
        ] as const) {
          apuntar(muslo, pierna, new THREE.Vector3(x * 0.08, 0, frente))
          apuntar(pierna, pie, new THREE.Vector3(0, -1, 0.04 * frente))
          apuntar(pie, punta, dPie)
        }
        // baja la cadera hasta que los pies toquen el piso
        const baja = hu.pieI.getWorldPosition(v()).y - tobillo0
        const c = hu.cadera.getWorldPosition(v()).add(new THREE.Vector3(0, -baja, 0))
        hu.cadera.position.copy(hu.cadera.parent!.worldToLocal(c))
        modelo.updateMatrixWorld(true)
      }
      sentar()

      // --- Puntos clave ---
      const corazon = hu.pecho.getWorldPosition(v()).add(new THREE.Vector3(lado * 0.035, -0.04, 0.05 * frente))
      const hombro = hu.brazoI.getWorldPosition(v())
      const largoBrazo = hombro.distanceTo(hu.anteI.getWorldPosition(v()))
      // Inclinación del brazo para que el CENTRO del brazalete quede a la altura del corazón
      const caida = THREE.MathUtils.clamp((hombro.y - corazon.y) / (largoBrazo - DESDE_CODO), 0.25, 0.97)
      const dirBrazoBien = new THREE.Vector3(lado * 0.12, -caida, Math.sqrt(1 - caida * caida) * frente).normalize()
      const dirAnteBien = new THREE.Vector3(-lado * 0.06, -0.02, frente).normalize()
      const dirColgando = new THREE.Vector3(lado * 0.1, -1, 0.06 * frente).normalize()

      // Pose del brazo izquierdo: 1 = apoyado en la mesa, 0 = colgando
      const brazo = (k: number) => {
        const dB = dirColgando.clone().lerp(dirBrazoBien, k).normalize()
        const dA = dirColgando.clone().lerp(dirAnteBien, k).normalize()
        apuntar(hu.brazoI, hu.anteI, dB)
        apuntar(hu.anteI, hu.manoI, dA)
        apuntar(hu.manoI, hu.dedoI, dA)
      }
      brazo(1)
      // el brazo derecho también descansa en la mesa (espejo del izquierdo)
      const espejo = (d: THREE.Vector3) => d.clone().setX(-d.x)
      apuntar(hu.brazoD, hu.anteD, espejo(dirBrazoBien))
      apuntar(hu.anteD, hu.manoD, espejo(dirAnteBien))
      apuntar(hu.manoD, hu.dedoD, espejo(dirAnteBien))
      const codo = hu.anteI.getWorldPosition(v())
      const mano = hu.manoI.getWorldPosition(v())
      const eje = hombro.clone().sub(codo).normalize() // del codo hacia el hombro
      const centro = codo.clone().addScaledVector(eje, DESDE_CODO)
      // cara interna del brazo (hacia el cuerpo), perpendicular al brazo
      const interna = new THREE.Vector3(-lado, 0, 0).addScaledVector(eje, lado * eje.x).normalize()
      const arribaBrazo = new THREE.Vector3(0, 1, 0).addScaledVector(eje, -eje.y).normalize()
      // la arteria braquial va por la cara anterior-interna (con la palma hacia arriba queda arriba y hacia el cuerpo)
      const arteriaLado = interna.clone().add(arribaBrazo).normalize()

      // --- Muebles detallados: silla acolchada y mesa a la altura del codo ---
      const rec = { geos, mats, texturas }
      const cad = hu.cadera.getWorldPosition(v())
      const asiento = cad.y - 0.1
      const silla = crearSilla(rec, asiento, frente)
      silla.grupo.position.set(cad.x, 0, cad.z + 0.1 * frente)
      escena.add(silla.grupo)
      const mesaY = codo.y - 0.05
      const xm = cad.x + lado * 0.12
      const zm = (codo.z + mano.z) / 2 + 0.12 * frente
      const mesa = crearMesa(rec, 1.0, 0.62, mesaY - 0.004)
      mesa.position.set(xm, 0, zm)
      escena.add(mesa)

      // --- Luz de trabajo sobre la mesa: foco cenital con haz volumétrico y polvo ---
      const foco = new THREE.SpotLight('#FFF3DE', 2.6, 6, 0.42, 0.7, 1.2)
      foco.position.set(xm + lado * 0.25, 3.3, zm + 0.1 * frente)
      foco.target.position.set(xm, mesaY, zm - 0.1 * frente)
      foco.castShadow = true
      foco.shadow.mapSize.set(1024, 1024)
      foco.shadow.bias = -0.0005
      foco.shadow.radius = 6
      escena.add(foco, foco.target)
      const hazMesa = crearHaz(rec, { lados: 40, color: '#FFEBC8', opacidad: 0.035, motas: 160 })
      const radioHaz = Math.tan(0.42) * foco.position.distanceTo(foco.target.position)
      hazMesa.colocar(foco.position, foco.target.position, radioHaz, radioHaz)
      escena.add(hazMesa.grupo)

      // --- Monitor de presión sobre la mesa, con pantalla que se dibuja en un canvas ---
      const lienzo = document.createElement('canvas')
      lienzo.width = 256; lienzo.height = 160
      const tex = new THREE.CanvasTexture(lienzo)
      tex.colorSpace = THREE.SRGBColorSpace
      texturas.push(tex)
      let textoPantalla = ''
      const pintar = (arriba: string, abajo: string, color: string) => {
        const t = `${arriba}|${abajo}|${color}`
        if (t === textoPantalla) return
        textoPantalla = t
        const g = lienzo.getContext('2d')!
        g.fillStyle = '#0B1A14'; g.fillRect(0, 0, 256, 160)
        g.fillStyle = color; g.textAlign = 'center'
        g.font = 'bold 64px "JetBrains Mono", monospace'; g.fillText(arriba, 128, 88)
        g.font = '600 24px "JetBrains Mono", monospace'; g.fillStyle = '#7FB8A0'; g.fillText(abajo, 128, 132)
        tex.needsUpdate = true
      }
      const monitor = crearMonitorPresion(rec, tex, C.ok)
      monitor.position.set(mano.x - lado * 0.16, mesaY, mano.z + 0.2 * frente)
      // el texto se lee desde el lado de la cámara
      monitor.rotation.y = lado * Math.PI / 2
      escena.add(monitor)
      pintar('--/--', 'listo', '#4ADE9A')

      // --- Brazalete: tela azul marino, bordes cian, marca de arteria y tubo ---
      const brazalete = new THREE.Group()
      const telaMat = new THREE.MeshStandardMaterial({ color: '#1F3A5F', roughness: 0.8, metalness: 0.05, transparent: true, side: THREE.DoubleSide })
      const tela = malla(new THREE.CylinderGeometry(1, 1, ANCHO_BRAZALETE, 48, 1, true), telaMat)
      const bordeMat = new THREE.MeshStandardMaterial({ color: C.accent, emissive: C.accent, emissiveIntensity: 0.35, roughness: 0.4 })
      mats.push(bordeMat)
      const bordes = [-1, 1].map((k) => {
        const t = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), bordeMat)
        geos.push(t.geometry)
        t.rotation.x = Math.PI / 2
        t.position.y = (k * ANCHO_BRAZALETE) / 2
        return t
      })
      brazalete.add(tela, ...bordes)
      escena.add(brazalete)
      const marca = malla(new THREE.ConeGeometry(0.013, 0.026, 3), new THREE.MeshStandardMaterial({ color: C.ok, emissive: C.ok, emissiveIntensity: 0.6 }))
      escena.add(marca)

      const colocar = (pos: THREE.Vector3, dir: THREE.Vector3, r: number) => {
        brazalete.position.copy(pos)
        brazalete.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        tela.scale.set(r, 1, r)
        bordes.forEach((b) => b.scale.setScalar(r))
      }

      // Marca ▼ en la cara interna, junto al borde de abajo, apuntando al codo
      const ponerMarca = (r: number) => {
        marca.position.copy(centro).addScaledVector(arteriaLado, r + 0.004).addScaledVector(eje, -ANCHO_BRAZALETE / 2 + 0.02)
        marca.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eje.clone().negate())
      }

      // Tubo del brazalete al monitor
      const salida = centro.clone().addScaledVector(arteriaLado, R_AJUSTADO).addScaledVector(eje, -ANCHO_BRAZALETE / 2 + 0.02)
      const llegada = monitor.position.clone().add(new THREE.Vector3(0, 0.03, 0))
      const curvaTubo = new THREE.CatmullRomCurve3([
        salida,
        salida.clone().add(new THREE.Vector3(0, -0.04, 0)).addScaledVector(interna, 0.05),
        new THREE.Vector3((salida.x + llegada.x) / 2, mesaY + 0.02, (salida.z + llegada.z) / 2),
        llegada,
      ])
      const tubo = malla(new THREE.TubeGeometry(curvaTubo, 40, 0.006, 8), new THREE.MeshStandardMaterial({ color: '#B8C4D4', roughness: 0.5 }))
      escena.add(tubo)

      // Arteria braquial por la cara interna (se ve en el paso de la marca)
      const arteriaMat = new THREE.MeshStandardMaterial({ color: C.crit, emissive: C.crit, emissiveIntensity: 0.8, transparent: true })
      const curvaArteria = new THREE.CatmullRomCurve3([
        hombro.clone().addScaledVector(eje, -0.05).addScaledVector(arteriaLado, R_BRAZO + 0.012),
        centro.clone().addScaledVector(arteriaLado, R_BRAZO + 0.013),
        codo.clone().addScaledVector(arteriaLado, R_BRAZO + 0.01),
        codo.clone().addScaledVector(dirAnteBien, 0.08).addScaledVector(new THREE.Vector3(0, 1, 0), 0.035),
      ])
      const arteria = malla(new THREE.TubeGeometry(curvaArteria, 48, 0.007, 8), arteriaMat)
      arteria.castShadow = false
      escena.add(arteria)

      // Línea de la altura del corazón y el corazón que late
      const corazonMat = new THREE.MeshStandardMaterial({ color: C.crit, emissive: C.crit, emissiveIntensity: 0.9 })
      const corazonM = malla(new THREE.SphereGeometry(0.028, 20, 16), corazonMat)
      corazonM.position.copy(corazon)
      // se ve a través del traje, como en el holograma del Inicio
      corazonMat.depthTest = false
      corazonM.renderOrder = 10
      corazonM.castShadow = false
      escena.add(corazonM)
      const lineaMat = new THREE.MeshBasicMaterial({ color: C.warn, transparent: true, opacity: 0.9 })
      const linea = malla(new THREE.CylinderGeometry(0.004, 0.004, 1.3, 8), lineaMat)
      linea.castShadow = false
      linea.rotation.x = Math.PI / 2
      linea.position.set(centro.x + lado * 0.09, corazon.y, cad.z + 0.25 * frente)
      escena.add(linea)
      // Anillo que señala dónde va el brazalete (paso 2)
      const anilloMat = new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0.85 })
      const anillo = new THREE.Mesh(new THREE.TorusGeometry(R_BRAZO + 0.01, 0.005, 8, 40), anilloMat)
      geos.push(anillo.geometry); mats.push(anilloMat)
      escena.add(anillo)

      // Dos dedos (paso 5)
      const piel = new THREE.MeshStandardMaterial({ color: '#D9A982', roughness: 0.7 })
      mats.push(piel)
      const dedos = [-1, 1].map(() => {
        const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.06, 4, 10), piel)
        geos.push(d.geometry)
        d.castShadow = true
        escena.add(d)
        return d
      })
      const lateral = new THREE.Vector3().crossVectors(eje, arribaBrazo).normalize()

      // Indicador en el piso: pies planos (paso 1)
      const piesMat = new THREE.MeshBasicMaterial({ color: C.ok, transparent: true, opacity: 0, side: THREE.DoubleSide })
      const pies = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.18, 48), piesMat)
      geos.push(pies.geometry); mats.push(piesMat)
      pies.rotation.x = -Math.PI / 2
      const pieMedio = hu.pieI.getWorldPosition(v()).add(hu.pieD.getWorldPosition(v())).multiplyScalar(0.5)
      pies.position.set(pieMedio.x, 0.004, pieMedio.z + 0.05 * frente)
      escena.add(pies)

      // --- Planos de cámara por paso: [posición, a dónde mira] ---
      const L = new THREE.Vector3(lado, 0, 0), F = new THREE.Vector3(0, 0, frente), Y = new THREE.Vector3(0, 1, 0)
      const punto = (base: THREE.Vector3, x: number, y: number, z: number) => base.clone().addScaledVector(L, x).addScaledVector(Y, y).addScaledVector(F, z)
      const centroCuerpo = new THREE.Vector3(cad.x, 0.75, cad.z + 0.2 * frente)
      const planos: [THREE.Vector3, THREE.Vector3][] = [
        [punto(centroCuerpo, 2.0, 0.65, 1.95), centroCuerpo],
        [punto(corazon, 1.9, 0.12, 0.2), punto(corazon, 0, 0.02, 0.2)],
        [punto(centro, 0.85, 0.32, 0.6), punto(centro, 0, -0.04, 0.14)],
        [punto(centro, 0.5, 0.62, 0.75), punto(centro, 0, -0.04, 0.08)],
        [punto(centro, 0.7, 0.4, 0.25), punto(centro, 0, 0.01, 0)],
        [punto(centro, 0.95, 0.6, 0.55), punto(centro, -0.08, -0.08, 0.2)],
      ]
      camara.position.copy(planos[0][0])
      const mira = planos[0][1].clone()

      const reloj = new THREE.Clock()
      let acumulado = 0
      let t = 0
      let pasoAnt = -1
      let playAnt = estado.current.play

      const hud = (r: Hud, extra = '') => {
        if (textoRef.current) textoRef.current.textContent = r.texto
        if (okRef.current) {
          okRef.current.style.opacity = r.ok === null ? '0' : '1'
          okRef.current.textContent = r.ok ? '✓' : '✕'
          okRef.current.style.background = r.ok ? C.ok : C.crit
        }
        if (extraRef.current) {
          extraRef.current.textContent = extra
          extraRef.current.style.opacity = extra ? '1' : '0'
        }
      }

      const cuadro = (dt: number) => {
        const { paso: p, ms: dur, play: pl } = estado.current
        if (p !== pasoAnt || (pl && !playAnt)) { t = 0; pasoAnt = p }
        playAnt = pl
        if (pl) t += dt
        const f = reducido || !pl ? 1 : Math.min(1, (t * 1000) / dur)
        const latido = 0.5 + 0.5 * Math.exp(-((t * 1.15) % 1) * 6)

        // valores por defecto de cada cuadro
        brazo(1)
        const verBrazalete = p >= 2
        let rB = R_AJUSTADO, opTela = 1
        let posB = centro.clone(), dirB = eje.clone()
        tubo.visible = p >= 3
        arteria.visible = p === 3
        linea.visible = p === 1
        anillo.visible = false
        dedos.forEach((d) => (d.visible = false))
        marca.visible = p >= 3
        corazonM.visible = p <= 1 || p === 3
        corazonM.scale.setScalar(0.8 + 0.5 * latido)
        corazonMat.emissiveIntensity = 0.5 + 0.8 * latido
        piesMat.opacity = 0
        silla.respaldoMat.emissive.set('#000000')
        let r: Hud
        let extra = ''
        pintar('--/--', 'listo', '#4ADE9A')

        if (p === 0) {
          // Reposo: reloj de 5 min (acelerado), espalda apoyada, pies planos, sin hablar
          const seg = Math.round(300 * (1 - f))
          r = { texto: `Rest ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, ok: f >= 1 }
          extra = 'No talking · back supported · feet flat'
          piesMat.opacity = 0.35 + 0.5 * latido
          silla.respaldoMat.emissive.set(C.accent).multiplyScalar(0.25 + 0.25 * latido)
        } else if (p === 1) {
          // Primero colgando (mal: mide alto); luego sube a la mesa
          const k = suave(tramo(f, 0.25, 0.62))
          brazo(k)
          const bien = k > 0.98
          lineaMat.color.set(bien ? C.ok : C.warn)
          anillo.visible = true
          const c = hu.anteI.getWorldPosition(v())
          const e = hu.brazoI.getWorldPosition(v()).sub(c).normalize()
          anillo.position.copy(c).addScaledVector(e, DESDE_CODO)
          anillo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), e)
          anilloMat.color.set(bien ? C.ok : C.warn)
          r = bien ? { texto: 'Arm at heart level', ok: true } : { texto: 'Arm hanging: reads higher', ok: false }
        } else if (p === 2) {
          // El brazalete entra por la mano y sube hasta 2–3 cm arriba del codo
          const sAnt = suave(tramo(f, 0.05, 0.35)), sBra = suave(tramo(f, 0.35, 0.62))
          if (sBra <= 0) {
            posB = mano.clone().lerp(codo, sAnt * 0.92)
            dirB = codo.clone().sub(mano).normalize().negate()
            rB = R_FLOJO
          } else {
            posB = codo.clone().addScaledVector(eje, DESDE_CODO * sBra)
            dirB = eje.clone()
            rB = R_FLOJO + (R_AJUSTADO - R_FLOJO) * tramo(f, 0.62, 0.8)
          }
          const listo = f > 0.62
          r = listo ? { texto: '2–3 cm above the elbow', ok: true } : { texto: 'Slide the cuff up the arm', ok: null }
          extra = 'On bare skin, no sleeve'
        } else if (p === 3) {
          // La arteria late por la cara interna; la marca ▼ queda encima
          opTela = 0.5
          arteriaMat.opacity = 0.45 + 0.55 * latido
          arteriaMat.emissiveIntensity = 0.4 + 1.2 * latido
          r = { texto: '▼ mark over the artery', ok: f > 0.4 }
          extra = 'The tube comes out on the inner arm'
        } else if (p === 4) {
          // Se ajusta y luego entran dos dedos bajo el borde de arriba
          rB = R_FLOJO + (R_AJUSTADO - R_FLOJO) * suave(tramo(f, 0.05, 0.35))
          const entra = suave(tramo(f, 0.4, 0.72))
          dedos.forEach((d, n) => {
            d.visible = f > 0.36
            const borde = centro.clone().addScaledVector(eje, ANCHO_BRAZALETE / 2)
            d.position.copy(borde)
              .addScaledVector(arribaBrazo, R_AJUSTADO - 0.004)
              .addScaledVector(lateral, (n === 0 ? -1 : 1) * 0.0095)
              .addScaledVector(eje, 0.06 - entra * 0.065)
            d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eje)
          })
          r = f > 0.75 ? { texto: '2 fingers fit: snug', ok: true } : { texto: 'Tighten the cuff', ok: null }
          extra = 'Not too tight, not too loose'
        } else {
          // Dos mediciones con 1 minuto entre ellas; el brazalete se infla y se desinfla
          const m1 = tramo(f, 0.05, 0.3), espera = tramo(f, 0.35, 0.65), m2 = tramo(f, 0.7, 0.92)
          const inflar = (x: number) => (x > 0 && x < 1 ? Math.sin(Math.min(1, x * 1.6) * Math.PI * 0.5) * (x < 0.62 ? 1 : 1 - (x - 0.62) / 0.38) : 0)
          rB = R_AJUSTADO * (1 + 0.22 * Math.max(inflar(m1), inflar(m2)))
          const mmHg = Math.round(170 * Math.max(inflar(m1), inflar(m2)))
          if (m2 >= 1) {
            pintar('117/76', 'promedio', '#4ADE9A')
            r = { texto: 'Log the average: 117/76', ok: true }
            extra = '1.ª 118/76 · 2.ª 116/75'
          } else if (m2 > 0) {
            pintar(String(mmHg), 'measuring 2nd', '#7DD3FC')
            r = { texto: '2nd reading', ok: null }
            extra = '1.ª 118/76'
          } else if (espera > 0 && m1 >= 1) {
            const seg = Math.round(60 * (1 - espera))
            pintar('118/76', `wait 0:${String(seg).padStart(2, '0')}`, '#4ADE9A')
            r = { texto: 'Wait 1 minute', ok: null }
            extra = 'Don’t talk or move'
          } else if (m1 > 0) {
            pintar(m1 >= 1 ? '118/76' : String(mmHg), m1 >= 1 ? '1.ª' : 'measuring 1st', m1 >= 1 ? '#4ADE9A' : '#7DD3FC')
            r = { texto: '1st reading', ok: null }
            extra = 'Don’t talk or move'
          } else {
            r = { texto: 'Press start on the monitor', ok: null }
          }
        }

        brazalete.visible = verBrazalete
        telaMat.opacity = opTela
        colocar(posB, dirB, rB)
        ponerMarca(rB)

        // la cámara viaja suave al plano del paso
        const [pos, obj] = planos[Math.min(p, planos.length - 1)]
        const k = reducido ? 1 : 1 - Math.exp(-dt * 2.6) // por tiempo: igual de suave a cualquier FPS
        camara.position.lerp(pos, k)
        mira.lerp(obj, k)
        camara.lookAt(mira)
        hud(r, extra)
        estacion.animar(reloj.elapsedTime)
        hazMesa.animar(reloj.elapsedTime)
        renderer.render(escena, camara)
      }

      const animar = () => {
        frame = requestAnimationFrame(animar)
        const dt = reloj.getDelta()
        acumulado += dt
        if (acumulado < 1 / FPS) return
        cuadro(acumulado)
        acumulado = 0
      }
      animar()
    }).catch(() => { if (!cancelado) setFallo(true) })

    return () => {
      cancelado = true
      cancelAnimationFrame(frame)
      ro.disconnect()
      geos.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      texturas.forEach((x) => x.dispose())
      renderer.dispose()
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement)
    }
  }, [])

  if (fallo) return <>{fallback}</>

  return (
    <div className="relative h-full w-full" style={{ background: 'radial-gradient(ellipse at 50% 40%, #12304A 0%, #0A1626 55%, #060B16 100%)' }}>
      <div ref={caja} className="absolute inset-0" role="img" aria-label="3D astronaut measuring blood pressure with the cuff, step by step" />
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[80%] flex-col items-start gap-1.5">
        <span className="flex items-center gap-2 rounded-lg bg-[rgba(6,11,22,.82)] px-3 py-1.5">
          <span ref={okRef} className="grid h-6 w-6 place-items-center rounded-full text-[14px] font-bold text-void transition-opacity" style={{ opacity: 0 }} />
          <span ref={textoRef} className="num text-[17px] font-bold text-accent-soft" />
        </span>
        <span ref={extraRef} className="rounded-lg bg-[rgba(6,11,22,.75)] px-3 py-1 text-[14px] text-muted transition-opacity" style={{ opacity: 0 }} />
      </div>
    </div>
  )
}
