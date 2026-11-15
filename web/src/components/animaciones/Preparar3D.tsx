import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { C } from '../../lib/paleta'
import { movimientoReducido } from '../../lib/efectos'
import { crearEstacion, ENTORNO } from './estacion'
import { ALTURA, apuntar, buscarHueso, cargarModelo, v, vestir } from './esqueleto'

// Cómo acomodar la cámara antes de un ejercicio, en 3D y dentro de la estación (misma familia que Demo3D).
// Una sola escena para los 3 pasos de preparación:
//   0. Cámara a la altura del pecho: la laptop sube sobre libros hasta que apunta al pecho.
//   1. Distancia: el astronauta se aleja hasta caber completo en el cuadro.
//   2. Luz de frente: una lámpara pasa de estar detrás (contraluz) a estar al frente.
// El recuadro "Lo que ve la cámara" es una segunda cámara puesta en la webcam de la laptop: muestra de verdad
// lo que se encuadra en cada momento. Sin WebGL se muestra la animación 2D del paso (`fallback`).

const FPS = 30
const redonda = (w: number, h: number, d: number) => new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.3)
const Z_LAPTOP = 1.25 // dónde está la mesa, frente al astronauta
const MESA = 0.72
const CAM_BAJA = MESA + 0.225 // altura de la webcam con la laptop directo en la mesa
const CAM_PECHO = 1.3
const FOV_WEBCAM = 62

const tramo = (f: number, a: number, b: number) => THREE.MathUtils.clamp((f - a) / (b - a), 0, 1)
const suave = (x: number) => x * x * (3 - 2 * x)

type Ejercicio = 'brazos' | 'sentadilla'

export default function Preparar3D({ ejercicio, paso, ms, play, fallback }: { ejercicio: Ejercicio; paso: number; ms: number; play: boolean; fallback: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null)
  const textoRef = useRef<HTMLSpanElement>(null)
  const okRef = useRef<HTMLSpanElement>(null)
  const etqRef = useRef<HTMLSpanElement>(null)
  const marcoRef = useRef<HTMLDivElement>(null)
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
    renderer.autoClear = false
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'

    const escena = new THREE.Scene()
    const camara = new THREE.PerspectiveCamera(32, 1, 0.05, 50)
    camara.layers.enable(1) // la capa 1 son las guías (cono, líneas): no salen en el recuadro de la webcam
    const webcam = new THREE.PerspectiveCamera(FOV_WEBCAM, 4 / 3, 0.05, 50)
    const geos: THREE.BufferGeometry[] = []
    const mats: THREE.Material[] = []
    const texturas: THREE.Texture[] = []
    const estacion = crearEstacion(escena, renderer, { geos, mats, texturas }, { plataforma: 0 })
    const malla = <M extends THREE.Material>(g: THREE.BufferGeometry, m: M, guia = false) => {
      geos.push(g); mats.push(m)
      const o = new THREE.Mesh(g, m)
      o.castShadow = !guia
      o.receiveShadow = !guia
      if (guia) o.layers.set(1)
      escena.add(o)
      return o
    }

    let ancho = 1, alto = 1
    const ajustar = () => {
      ancho = el.clientWidth; alto = el.clientHeight
      renderer.setSize(ancho, alto)
      camara.aspect = ancho / alto
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
      vestir(modelo, C.accent, mats, true, geos)
      modelo.updateMatrixWorld(true)

      const h = buscarHueso(modelo)
      const hu = {
        cadera: h('Hips'), tope: h('HeadTop_End'),
        brazoI: h('LeftArm'), anteI: h('LeftForeArm'), manoI: h('LeftHand'),
        brazoD: h('RightArm'), anteD: h('RightForeArm'), manoD: h('RightHand'),
        musloI: h('LeftUpLeg'), piernaI: h('LeftLeg'), pieI: h('LeftFoot'), puntaI: h('LeftToeBase'),
        musloD: h('RightUpLeg'), piernaD: h('RightLeg'), pieD: h('RightFoot'), puntaD: h('RightToeBase'),
      }
      const reposo = new Map<THREE.Object3D, THREE.Quaternion>()
      modelo.traverse((o) => { if ((o as THREE.Bone).isBone) reposo.set(o, o.quaternion.clone()) })
      const lado = Math.sign(hu.brazoI.getWorldPosition(v()).x - hu.cadera.getWorldPosition(v()).x) || 1
      const frente = Math.sign(hu.puntaI.getWorldPosition(v()).z - hu.pieI.getWorldPosition(v()).z) || 1
      const dirPieI = hu.puntaI.getWorldPosition(v()).sub(hu.pieI.getWorldPosition(v()))
      const dirPieD = hu.puntaD.getWorldPosition(v()).sub(hu.pieD.getWorldPosition(v()))
      const zL = Z_LAPTOP * frente

      // De pie, con los brazos a los costados; `zancada` mueve las piernas al caminar hacia atrás
      const posar = (za: number, zancada: number) => {
        reposo.forEach((qq, b) => b.quaternion.copy(qq))
        modelo.position.z = za
        modelo.position.y = -bb.min.y * s + Math.abs(zancada) * 0.012
        modelo.updateMatrixWorld(true)
        for (const [brazo, ante, mano, x] of [[hu.brazoI, hu.anteI, hu.manoI, lado], [hu.brazoD, hu.anteD, hu.manoD, -lado]] as const) {
          const d = new THREE.Vector3(x * 0.13, -1, 0.04 * frente)
          apuntar(brazo, ante, d); apuntar(ante, mano, d)
        }
        for (const [muslo, pierna, pie, punta, k, dPie] of [[hu.musloI, hu.piernaI, hu.pieI, hu.puntaI, 1, dirPieI], [hu.musloD, hu.piernaD, hu.pieD, hu.puntaD, -1, dirPieD]] as const) {
          const d = new THREE.Vector3(0, -1, k * zancada * 0.3 * frente)
          apuntar(muslo, pierna, d); apuntar(pierna, pie, d); apuntar(pie, punta, dPie)
        }
      }

      // --- Mesa, libros y laptop ---
      const mueble = new THREE.MeshStandardMaterial({ color: '#2A3A52', roughness: 0.6, metalness: 0.35 })
      const metal = new THREE.MeshStandardMaterial({ color: '#8EA3BF', roughness: 0.3, metalness: 0.8 })
      mats.push(mueble, metal)
      const tabla = malla(redonda(0.9, 0.035, 0.6), mueble)
      tabla.position.set(0, MESA - 0.0175, zL + 0.2 * frente)
      const geoPata = new THREE.CylinderGeometry(0.018, 0.018, MESA - 0.035, 16)
      geos.push(geoPata)
      for (const dx of [-0.41, 0.41]) for (const dz of [-0.26, 0.26]) {
        const pata = new THREE.Mesh(geoPata, metal)
        pata.position.set(dx, (MESA - 0.035) / 2, zL + 0.2 * frente + dz)
        pata.castShadow = true
        escena.add(pata)
      }
      const GROSOR = 0.09
      const libros = [TRAJE_LIBROS[0], TRAJE_LIBROS[1], TRAJE_LIBROS[2], TRAJE_LIBROS[3]].map((color, n) => {
        const l = malla(redonda(0.3 - n * 0.012, GROSOR - 0.008, 0.22 - n * 0.008), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }))
        l.position.set((n % 2 ? 0.012 : -0.01), MESA + GROSOR * (n + 0.5), zL + 0.12 * frente)
        l.rotation.y = (n % 2 ? 1 : -1) * 0.06
        return l
      })
      const laptop = new THREE.Group()
      const cuerpoLap = new THREE.MeshStandardMaterial({ color: '#C9D1DC', roughness: 0.35, metalness: 0.75 })
      const pantallaMat = new THREE.MeshBasicMaterial({ color: '#0B2A3A' })
      mats.push(cuerpoLap, pantallaMat)
      const base = new THREE.Mesh(redonda(0.34, 0.016, 0.23), cuerpoLap)
      base.position.y = 0.008
      const tapa = new THREE.Group()
      const tapaM = new THREE.Mesh(redonda(0.34, 0.22, 0.01), cuerpoLap)
      tapaM.position.y = 0.11
      const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.19), pantallaMat)
      vidrio.position.set(0, 0.11, -0.006 * frente)
      vidrio.rotation.y = frente > 0 ? Math.PI : 0
      const lente = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), new THREE.MeshBasicMaterial({ color: C.accent }))
      lente.position.set(0, 0.212, -0.007 * frente)
      for (const m of [base, tapaM, vidrio, lente]) { geos.push(m.geometry); m.castShadow = m !== vidrio && m !== lente }
      mats.push(lente.material as THREE.Material)
      tapa.add(tapaM, vidrio, lente)
      tapa.position.set(0, 0.016, 0.115 * frente)
      laptop.add(base, tapa)
      escena.add(laptop)

      // --- Guías (capa 1): cono de visión, línea de puntería, marca del piso y regla de distancia ---
      const guiaMat = new THREE.MeshBasicMaterial({ color: C.warn, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false })
      const cono = malla(new THREE.ConeGeometry(1, 1, 4, 1, true), guiaMat, true)
      const lineaMat = new THREE.MeshBasicMaterial({ color: C.warn })
      const linea = malla(new THREE.CylinderGeometry(0.006, 0.006, 1, 8), lineaMat, true)
      const punto = malla(new THREE.SphereGeometry(0.03, 16, 12), lineaMat, true)
      const zFinal = (Z_LAPTOP - (ejercicio === 'sentadilla' ? 2 : 1)) * frente
      const marcaMat = new THREE.MeshBasicMaterial({ color: C.ok, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
      const marca = malla(new THREE.RingGeometry(0.3, 0.325, 64), marcaMat, true)
      marca.rotation.x = -Math.PI / 2
      marca.position.set(0, 0.004, zFinal)
      const regla = malla(new THREE.BoxGeometry(0.02, 0.004, 1), marcaMat, true)

      // --- Lámpara del paso de luz: panel sobre un poste con una luz puntual ---
      const lampara = new THREE.Group()
      const panelMat = new THREE.MeshBasicMaterial({ color: '#FFF4DC' })
      const panel = new THREE.Mesh(redonda(0.5, 0.36, 0.03), panelMat)
      panel.position.y = 1.75
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.6, 10), metal)
      poste.position.y = 0.8
      const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 24), metal)
      pie.position.y = 0.015
      for (const m of [panel, poste, pie]) geos.push(m.geometry)
      mats.push(panelMat)
      lampara.add(panel, poste, pie)
      const foco = new THREE.PointLight('#FFF1D6', 0, 8, 1.6)
      foco.position.set(0, 1.75, 0.1)
      lampara.add(foco)
      escena.add(lampara)

      // --- Planos de la cámara principal ---
      const medio = (zL + zFinal) / 2
      const lejos = ejercicio === 'sentadilla' ? 1.3 : 0
      const planos: [THREE.Vector3, THREE.Vector3][] = [
        [new THREE.Vector3(lado * 3.5, 1.45, zL * 0.55 + 0.9 * frente), new THREE.Vector3(0, 1.0, zL * 0.5)],
        [new THREE.Vector3(lado * (4.3 + lejos), 1.7 + lejos * 0.2, medio + 1.2 * frente), new THREE.Vector3(0, 0.9, medio)],
        [new THREE.Vector3(lado * (3.2 + lejos), 2.0, zL + 2.3 * frente), new THREE.Vector3(0, 1.05, medio)],
      ]
      camara.position.copy(planos[0][0])
      const mira = planos[0][1].clone()
      const miraWeb = new THREE.Vector3(0, CAM_BAJA, 0)

      const reloj = new THREE.Clock()
      let acumulado = 0, t = 0, pasoAnt = -1, playAnt = estado.current.play
      const { hemi, clave, contorno, ventana } = estacion.luces
      const base0 = { hemi: hemi.intensity, clave: clave.intensity, contorno: contorno.intensity, ventana: ventana.intensity }
      const pv = v()

      // ¿El punto de mundo sale dentro del cuadro de la webcam?
      const enCuadro = (o: THREE.Object3D, margen = 0.94) => {
        o.getWorldPosition(pv).project(webcam)
        return Math.abs(pv.x) < margen && Math.abs(pv.y) < margen && pv.z < 1
      }

      const cuadro = (dt: number) => {
        const { paso: p, ms: dur, play: pl } = estado.current
        if (p !== pasoAnt || (pl && !playAnt)) { t = 0; pasoAnt = p }
        playAnt = pl
        if (pl) t += dt
        const f = reducido || !pl ? 1 : Math.min(1, (t * 1000) / dur)

        // --- estado de cada paso ---
        let sube = 1, za = (Z_LAPTOP - 1) * frente, zancada = 0, luz = 1
        if (p === 0) sube = suave(tramo(f, 0.25, 0.7))
        if (p === 1) {
          const k = suave(tramo(f, 0.2, 0.75))
          za = THREE.MathUtils.lerp((Z_LAPTOP - 0.45) * frente, zFinal, k)
          zancada = k > 0 && k < 1 ? Math.sin(k * Math.PI * (ejercicio === 'sentadilla' ? 8 : 4)) : 0
        }
        if (p >= 1 && p !== 1) za = zFinal
        if (p === 2) luz = suave(tramo(f, 0.3, 0.75))
        posar(za, zancada)

        // laptop sobre los libros que hagan falta
        const yCam = THREE.MathUtils.lerp(CAM_BAJA, CAM_PECHO, sube)
        const yBase = yCam - 0.225
        laptop.position.set(0, yBase, zL + 0.12 * frente)
        tapa.rotation.x = -0.12 * frente
        libros.forEach((l, n) => {
          const visible = THREE.MathUtils.clamp((yBase - MESA - GROSOR * n) / GROSOR, 0, 1)
          l.visible = visible > 0.02
          l.scale.setScalar(0.4 + 0.6 * visible)
        })

        // webcam: en el paso 0 mira recto; después se inclina para centrar el cuerpo
        const posWeb = new THREE.Vector3(0, yCam, zL + 0.1 * frente)
        webcam.position.copy(posWeb)
        const objetivoY = p === 0 ? yCam : ejercicio === 'sentadilla' ? 0.95 : 1.25
        miraWeb.lerp(new THREE.Vector3(0, objetivoY, za), reducido ? 1 : 1 - Math.exp(-dt * 5))
        webcam.lookAt(miraWeb)
        webcam.updateMatrixWorld(true)

        // --- luces ---
        const oscuro = p === 2 ? 1 : 0
        hemi.intensity = base0.hemi * (1 - 0.8 * oscuro)
        escena.environmentIntensity = ENTORNO * (1 - 0.85 * oscuro)
        clave.intensity = base0.clave * (1 - 0.92 * oscuro)
        contorno.intensity = base0.contorno * (1 - 0.7 * oscuro)
        ventana.intensity = base0.ventana * (1 - 0.7 * oscuro)
        lampara.visible = p === 2
        if (p === 2) {
          // la lámpara rodea al astronauta: de atrás (contraluz) hasta el frente, junto a la laptop
          const ang = THREE.MathUtils.lerp(Math.PI * 0.93, Math.PI * 0.14, luz)
          lampara.position.set(Math.sin(ang) * 1.5 * -lado, 0, za + Math.cos(ang) * 1.6 * frente)
          lampara.lookAt(0, 0, za)
          foco.intensity = 26
        } else foco.intensity = 0

        // --- qué tan bien quedó ---
        let bien: boolean, texto: string, etq: string, ancla: THREE.Vector3
        cono.visible = p <= 1
        linea.visible = punto.visible = p === 0
        marca.visible = regla.visible = p === 1
        if (p === 0) {
          bien = sube > 0.97
          texto = bien ? 'Cámara a la altura del pecho' : 'Muy baja: apunta al abdomen'
          etq = bien ? 'altura del pecho' : 'muy baja'
          const fin = new THREE.Vector3(0, yCam, za + 0.13 * frente)
          linea.position.copy(posWeb).lerp(fin, 0.5)
          linea.scale.y = posWeb.distanceTo(fin)
          linea.rotation.x = Math.PI / 2
          punto.position.copy(fin)
          ancla = fin.clone().setX(lado * 0.2)
        } else if (p === 1) {
          const partes = ejercicio === 'sentadilla' ? [hu.tope, hu.manoI, hu.manoD, hu.puntaI, hu.puntaD] : [hu.tope, hu.manoI, hu.manoD, hu.cadera]
          bien = partes.every((o) => enCuadro(o))
          const d = Math.abs(zL - za)
          texto = bien ? 'Cabes completo en el cuadro' : 'Muy cerca: no cabes en el cuadro'
          etq = `≈ ${d.toFixed(1)} m`
          regla.position.set(lado * 0.45, 0.004, (zL + za) / 2)
          regla.scale.z = d
          ancla = new THREE.Vector3(lado * 0.45, 0.02, (zL + za) / 2)
        } else {
          bien = luz > 0.9
          texto = bien ? 'Luz de frente: la cámara te ve bien' : luz < 0.15 ? 'Contraluz: la cámara solo ve tu sombra' : 'Mueve la luz al frente'
          etq = bien ? 'luz de frente' : 'luz detrás'
          ancla = lampara.position.clone().setY(2.0)
        }
        const color = bien ? C.ok : C.warn
        guiaMat.color.set(color); lineaMat.color.set(color)
        marcaMat.color.set(color)

        // cono de visión de la webcam hasta el astronauta
        if (cono.visible) {
          const largo = Math.max(0.2, posWeb.distanceTo(miraWeb))
          const mitad = Math.tan(THREE.MathUtils.degToRad(FOV_WEBCAM / 2)) * largo
          const dir = miraWeb.clone().sub(posWeb).normalize()
          cono.position.copy(posWeb).addScaledVector(dir, largo / 2)
          cono.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
          cono.rotateY(Math.PI / 4)
          cono.scale.set(mitad * Math.SQRT2 * (4 / 3), largo, mitad * Math.SQRT2)
        }

        // --- cámara principal ---
        const [pos, obj] = planos[Math.min(p, planos.length - 1)]
        const k = reducido ? 1 : 1 - Math.exp(-dt * 2.6)
        camara.position.lerp(pos, k)
        mira.lerp(obj, k)
        camara.lookAt(mira)

        // --- textos ---
        if (textoRef.current) textoRef.current.textContent = texto
        if (okRef.current) { okRef.current.textContent = bien ? '✓' : '!'; okRef.current.style.background = color }
        if (marcoRef.current) marcoRef.current.style.borderColor = color
        if (etqRef.current) {
          ancla.project(camara)
          const visible = ancla.z < 1 && Math.abs(ancla.x) < 1 && Math.abs(ancla.y) < 1
          etqRef.current.style.opacity = visible ? '1' : '0'
          etqRef.current.style.transform = `translate(-50%, -130%) translate(${((ancla.x + 1) / 2) * ancho}px, ${((1 - ancla.y) / 2) * alto}px)`
          etqRef.current.textContent = etq
          etqRef.current.style.color = color
          etqRef.current.style.borderColor = color
        }

        // --- dibujo: escena completa y, encima, el recuadro con lo que ve la webcam ---
        estacion.animar(reloj.elapsedTime)
        renderer.setScissorTest(false)
        renderer.setViewport(0, 0, ancho, alto)
        renderer.clear()
        renderer.render(escena, camara)
        const w = Math.round(ancho * 0.3), hh = Math.round(w * 0.75), m = 12
        renderer.setScissorTest(true)
        renderer.setScissor(ancho - w - m, m, w, hh)
        renderer.setViewport(ancho - w - m, m, w, hh)
        renderer.clear()
        renderer.render(escena, webcam)
        renderer.setScissorTest(false)
      }

      const animar = () => {
        frame = requestAnimationFrame(animar)
        acumulado += reloj.getDelta()
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
  }, [ejercicio])

  if (fallo) return <>{fallback}</>

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 40%, #12304A 0%, #0A1626 55%, #060B16 100%)' }}>
      <div ref={caja} className="absolute inset-0" role="img" aria-label="Astronauta en 3D acomodando la laptop, la distancia y la luz antes del ejercicio" />
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[66%] items-center gap-2 rounded-lg bg-[rgba(6,11,22,.82)] px-3 py-1.5">
        <span ref={okRef} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[14px] font-bold text-void" />
        <span ref={textoRef} className="text-[16px] font-bold text-text" />
      </div>
      {/* etiqueta anclada a un punto de la escena */}
      <span ref={etqRef} className="num pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-md border bg-[rgba(6,11,22,.85)] px-2 py-0.5 text-[14px] font-bold transition-opacity" style={{ opacity: 0 }} />
      {/* marco del recuadro de la webcam: mismo tamaño que el viewport que dibuja three.js */}
      <div ref={marcoRef} className="pointer-events-none absolute rounded-md border-2" style={{ right: 12, bottom: 12, width: '30%', aspectRatio: '4 / 3' }}>
        <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-[rgba(6,11,22,.85)] px-1.5 text-[12px] font-semibold text-muted">Lo que ve la cámara</span>
      </div>
    </div>
  )
}

// Lomos de los libros: tonos apagados para que no compitan con el traje ni con los colores de estado
const TRAJE_LIBROS = ['#3B5B7A', '#6B7A90', '#2F4A66', '#8494A8']
