import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { C } from '../../lib/paleta'
import { movimientoReducido } from '../../lib/efectos'
import { crearEstacion, ENTORNO } from './estacion'
import { ALTURA, apuntar, buscarHueso, cargarModelo, girarMundo, v, vestir } from './esqueleto'
import { crearHaz, crearLampara, crearLaptop, crearLibro, crearMesa, crearPunteria } from './utileria'

// Cómo acomodar la cámara antes de un ejercicio, en 3D y dentro de la estación (misma familia que Demo3D).
// Una sola escena para los 3 pasos de preparación:
//   0. Cámara a la altura del pecho: la laptop sube sobre libros hasta que apunta al pecho.
//   1. Distancia: el astronauta se aleja hasta caber completo en el cuadro.
//   2. Luz de frente: una lámpara pasa de estar detrás (contraluz) a estar al frente.
// El recuadro "Lo que ve la cámara" es una segunda cámara puesta en la webcam de la laptop: muestra de verdad
// lo que se encuadra en cada momento. Sin WebGL se muestra la animación 2D del paso (`fallback`).

const FPS = 30
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
        cadera: h('Hips'), col: h('Spine'), cuello: h('Neck'), tope: h('HeadTop_End'),
        brazoI: h('LeftArm'), anteI: h('LeftForeArm'), manoI: h('LeftHand'),
        brazoD: h('RightArm'), anteD: h('RightForeArm'), manoD: h('RightHand'),
        musloI: h('LeftUpLeg'), piernaI: h('LeftLeg'), pieI: h('LeftFoot'), puntaI: h('LeftToeBase'),
        musloD: h('RightUpLeg'), piernaD: h('RightLeg'), pieD: h('RightFoot'), puntaD: h('RightToeBase'),
      }
      const reposo = new Map<THREE.Object3D, THREE.Quaternion>()
      modelo.traverse((o) => { if ((o as THREE.Bone).isBone) reposo.set(o, o.quaternion.clone()) })
      const lado = Math.sign(hu.brazoI.getWorldPosition(v()).x - hu.cadera.getWorldPosition(v()).x) || 1
      const frente = Math.sign(hu.puntaI.getWorldPosition(v()).z - hu.pieI.getWorldPosition(v()).z) || 1
      const zL = Z_LAPTOP * frente

      // --- Marcha hacia atrás, basada en cómo camina una persona ---
      // Referencias de biomecánica de la marcha (adulto sano):
      //  - ciclo: ~60 % apoyo y ~40 % balanceo por pierna, con doble apoyo entre un paso y otro;
      //  - hacia atrás el patrón es casi el de la marcha normal visto al revés: el pie se apoya primero con
      //    la PUNTA (tobillo en flexión plantar) y luego baja el talón; al despegar, el talón es lo último;
      //  - los pasos son más cortos y lentos que al frente (aquí 0.36 m por paso);
      //  - la pelvis baja ~3 cm en el doble apoyo (piernas abiertas) y sube en el apoyo medio, se desplaza
      //    ~2 cm hacia la pierna de apoyo y gira ~5° acompañando a la pierna que va hacia atrás;
      //  - el tronco gira en sentido contrario a la pelvis y los brazos se balancean cruzados con las
      //    piernas (brazo izquierdo con pierna derecha), con el codo ligeramente flexionado;
      //  - los pies NO resbalan: el pie de apoyo queda fijo en el piso y la pierna se resuelve con
      //    cinemática inversa (cadera → rodilla → tobillo), con la rodilla siempre hacia el frente.
      const ZANCADA = 0.72 // un ciclo completo = dos pasos
      const APOYO = 0.6
      const ALZA = 0.055 // cuánto se levanta el pie en el balanceo
      const largoMuslo = hu.musloI.getWorldPosition(v()).distanceTo(hu.piernaI.getWorldPosition(v()))
      const largoPierna = hu.piernaI.getWorldPosition(v()).distanceTo(hu.pieI.getWorldPosition(v()))
      const largoPie = hu.pieI.getWorldPosition(v()).distanceTo(hu.puntaI.getWorldPosition(v()))
      const cadera0 = hu.cadera.getWorldPosition(v())
      const caderaLocal0 = hu.cadera.position.clone()
      const piernas = ([[hu.musloI, hu.piernaI, hu.pieI, 0], [hu.musloD, hu.piernaD, hu.pieD, 0.5]] as const).map(([muslo, rodilla, pie, desfase]) => ({
        muslo, rodilla, pie, desfase, tobillo0: pie.getWorldPosition(v()), qPie0: pie.getWorldQuaternion(new THREE.Quaternion()),
      }))
      const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0)
      const rad = THREE.MathUtils.degToRad

      // Pierna con cinemática inversa de dos huesos en el plano de avance; el pie se orienta aparte
      const resolverPierna = (pn: (typeof piernas)[number], tobillo: THREE.Vector3, cabeceo: number) => {
        const cad = pn.muslo.getWorldPosition(v())
        const dz = (tobillo.z - cad.z) * frente, dy = tobillo.y - cad.y
        const dist = Math.min(Math.hypot(dz, dy), largoMuslo + largoPierna - 1e-4)
        const phi = Math.atan2(dy, dz)
        const a = Math.acos(THREE.MathUtils.clamp((largoMuslo ** 2 + dist ** 2 - largoPierna ** 2) / (2 * largoMuslo * dist), -1, 1))
        const c1 = phi + a, c2 = phi - a
        const ang = Math.cos(c1) > Math.cos(c2) ? c1 : c2 // la rodilla dobla hacia el frente
        const rodilla = new THREE.Vector3(cad.x + (tobillo.x - cad.x) * 0.5, cad.y + Math.sin(ang) * largoMuslo, cad.z + Math.cos(ang) * largoMuslo * frente)
        apuntar(pn.muslo, pn.rodilla, rodilla.clone().sub(cad))
        apuntar(pn.rodilla, pn.pie, tobillo.clone().sub(pn.rodilla.getWorldPosition(v())))
        // pie: orientación de pie parado más el cabeceo (positivo = punta arriba)
        const qMundo = new THREE.Quaternion().setFromAxisAngle(X, -cabeceo * frente).multiply(pn.qPie0)
        pn.pie.quaternion.copy(pn.pie.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qMundo))
        pn.pie.updateMatrixWorld(true)
      }

      // `za`: dónde está el astronauta; `fase`: avance del ciclo de marcha; `amp`: 0 = de pie, 1 = caminando
      const posar = (za: number, fase: number, amp: number) => {
        reposo.forEach((qq, b) => b.quaternion.copy(qq))
        hu.cadera.position.copy(caderaLocal0)
        modelo.position.z = za
        modelo.updateMatrixWorld(true)

        if (amp > 0.001) {
          const dos = Math.PI * 2
          // pelvis: baja en el doble apoyo, se carga hacia la pierna de apoyo, gira con la pierna que retrocede
          const baja = amp * (0.01 + 0.022 * (0.5 + 0.5 * Math.cos(2 * dos * fase - 0.2 * Math.PI)))
          const carga = lado * 0.02 * amp * Math.sin(dos * (fase - 0.05))
          const destino = cadera0.clone().add(new THREE.Vector3(carga, -baja, za))
          hu.cadera.position.copy(hu.cadera.parent!.worldToLocal(destino))
          modelo.updateMatrixWorld(true)
          const giro = lado * frente * amp * rad(5) * Math.cos(dos * (fase - 0.8))
          girarMundo(hu.cadera, Y, giro)
          girarMundo(hu.col, Y, -giro * 1.5) // el tronco contrarresta el giro de la pelvis
          girarMundo(hu.col, X, frente * amp * rad(3)) // ligera inclinación al frente para equilibrar
          girarMundo(hu.cuello, Y, giro * 0.5) // la cabeza se queda viendo a la cámara

          for (const pn of piernas) {
            const p = fase + pn.desfase
            const fr = p - Math.floor(p)
            let rel: number, alza = 0, cabeceo = 0
            if (fr < APOYO) {
              // apoyo: el pie está fijo en el piso y el cuerpo pasa por encima
              rel = (fr - 0.3) * ZANCADA
              if (fr < 0.1) cabeceo = -rad(14) * (1 - fr / 0.1) // contacto con la punta; el talón baja después
              else if (fr > 0.5) cabeceo = rad(10) * ((fr - 0.5) / 0.1) // la punta despega primero, el talón al final
            } else {
              // balanceo: el pie viaja hacia atrás, se levanta y llega con la punta hacia abajo
              const u = (fr - APOYO) / (1 - APOYO)
              rel = THREE.MathUtils.lerp(0.3, -0.3, suave(u)) * ZANCADA
              alza = ALZA * Math.sin(Math.PI * u)
              cabeceo = THREE.MathUtils.lerp(rad(10), -rad(14), suave(u))
            }
            // con la punta abajo el tobillo queda más alto (gira sobre la punta)
            const talon = cabeceo < 0 ? Math.sin(-cabeceo) * largoPie : 0
            const tobillo = pn.tobillo0.clone().add(new THREE.Vector3(0, amp * (alza + talon), za + amp * rel * frente))
            resolverPierna(pn, tobillo, amp * cabeceo)
          }
        }

        // brazos: balanceo cruzado con las piernas y codo un poco flexionado
        const vaiven = amp * Math.cos(Math.PI * 2 * (fase - 0.05))
        for (const [brazo, ante, mano, x, signo] of [[hu.brazoI, hu.anteI, hu.manoI, lado, 1], [hu.brazoD, hu.anteD, hu.manoD, -lado, -1]] as const) {
          const a = rad(16) * vaiven * signo
          const codo = a + rad(8) + rad(8) * amp
          apuntar(brazo, ante, new THREE.Vector3(x * 0.13, -Math.cos(a), Math.sin(a) * frente))
          const dAnte = new THREE.Vector3(x * 0.1, -Math.cos(codo), Math.sin(codo) * frente)
          apuntar(ante, mano, dAnte)
        }
      }

      // --- Mesa, libros y laptop (utilería detallada) ---
      const rec = { geos, mats, texturas }
      const mesa = crearMesa(rec, 0.9, 0.6, MESA)
      mesa.position.set(0, 0, zL + 0.2 * frente)
      escena.add(mesa)
      const SOBRE = MESA + 0.004 // superficie de la placa de trabajo
      const GROSOR = 0.09
      const libros = TONOS_LIBROS.map((color, n) => {
        const l = crearLibro(rec, color, 0.3 - n * 0.012, GROSOR - 0.004, 0.22 - n * 0.008)
        l.position.set(n % 2 ? 0.012 : -0.01, SOBRE + GROSOR * (n + 0.5), zL + 0.12 * frente)
        l.rotation.y = (n % 2 ? 1 : -1) * 0.07
        escena.add(l)
        return l
      })
      const lap = crearLaptop(rec, frente, C.accent)
      const laptop = lap.grupo, tapa = lap.tapa
      escena.add(laptop)

      // --- Guías (capa 1): campo de visión de la webcam como haz con polvo, puntería y marcas del piso ---
      const haz = crearHaz(rec, { lados: 4, color: C.warn, opacidad: 0.4, motas: 200, capa: 1 })
      escena.add(haz.grupo)
      const punteria = crearPunteria(rec, C.warn, 1)
      escena.add(punteria.grupo)
      const zFinal = (Z_LAPTOP - (ejercicio === 'sentadilla' ? 2 : 1)) * frente
      const marcaMat = new THREE.MeshBasicMaterial({ color: C.ok, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
      const marca = malla(new THREE.RingGeometry(0.3, 0.325, 64), marcaMat, true)
      marca.rotation.x = -Math.PI / 2
      marca.position.set(0, 0.004, zFinal)
      const regla = malla(new THREE.BoxGeometry(0.02, 0.004, 1), marcaMat, true)

      // --- Lámpara de estudio del paso de luz: foco real con sombras y haz de luz con polvo ---
      const lamp = crearLampara(rec)
      const lampara = lamp.grupo
      escena.add(lampara)
      const foco = new THREE.SpotLight('#FFF1D6', 0, 9, 0.55, 0.6, 1.3)
      foco.castShadow = true
      foco.shadow.mapSize.set(1024, 1024)
      foco.shadow.bias = -0.0005
      foco.shadow.radius = 6
      escena.add(foco, foco.target)
      const hazLuz = crearHaz(rec, { lados: 40, color: '#FFE7BE', opacidad: 0.22, motas: 260, capa: 1 })
      escena.add(hazLuz.grupo)

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
        let sube = 1, za = (Z_LAPTOP - 1) * frente, fase = 0, amp = 0, luz = 1
        if (p === 0) sube = suave(tramo(f, 0.25, 0.7))
        if (p === 1) {
          const k = suave(tramo(f, 0.2, 0.75))
          const zInicio = (Z_LAPTOP - 0.45) * frente
          za = THREE.MathUtils.lerp(zInicio, zFinal, k)
          // la fase de la marcha sale de la distancia recorrida: los pies no patinan
          const total = Math.abs(zFinal - zInicio), recorrido = Math.abs(za - zInicio)
          fase = recorrido / ZANCADA
          amp = suave(THREE.MathUtils.clamp(Math.min(recorrido, total - recorrido) / 0.16, 0, 1))
        }
        if (p >= 1 && p !== 1) za = zFinal
        if (p === 2) luz = suave(tramo(f, 0.3, 0.75))
        posar(za, fase, amp)

        // laptop sobre los libros que hagan falta
        const yCam = THREE.MathUtils.lerp(CAM_BAJA, CAM_PECHO, sube)
        const yBase = yCam - 0.225
        laptop.position.set(0, yBase, zL + 0.12 * frente)
        tapa.rotation.x = 0.14 * frente
        laptop.updateMatrixWorld(true)
        libros.forEach((l, n) => {
          const visible = THREE.MathUtils.clamp((yBase - SOBRE - GROSOR * n) / GROSOR, 0, 1)
          l.visible = visible > 0.02
          l.scale.setScalar(0.4 + 0.6 * visible)
        })

        // webcam: en el paso 0 mira recto; después se inclina para centrar el cuerpo
        const posWeb = lap.lente.getWorldPosition(new THREE.Vector3())
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
          lampara.updateMatrixWorld(true)
          const origen = lamp.cabeza.getWorldPosition(new THREE.Vector3())
          const blanco = new THREE.Vector3(0, 1.15, za)
          origen.addScaledVector(blanco.clone().sub(origen).normalize(), 0.04)
          foco.position.copy(origen)
          foco.target.position.copy(blanco)
          foco.intensity = 16
          const radio = Math.tan(0.5) * origen.distanceTo(blanco) * 1.35
          hazLuz.colocar(origen, origen.clone().lerp(blanco, 1.35), radio, radio)
          hazLuz.animar(reloj.elapsedTime)
        } else foco.intensity = 0
        hazLuz.grupo.visible = p === 2

        // --- qué tan bien quedó ---
        let bien: boolean, texto: string, etq: string, ancla: THREE.Vector3
        haz.grupo.visible = p <= 1
        punteria.grupo.visible = p === 0
        marca.visible = regla.visible = p === 1
        if (p === 0) {
          bien = sube > 0.97
          texto = bien ? 'Cámara a la altura del pecho' : 'Muy baja: apunta al abdomen'
          etq = bien ? 'altura del pecho' : 'muy baja'
          const fin = new THREE.Vector3(0, posWeb.y, za + 0.15 * frente)
          punteria.colocar(posWeb, fin, reloj.elapsedTime)
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
        punteria.mat.color.set(color)
        marcaMat.color.set(color)

        // campo de visión de la webcam: haz con polvo en suspensión hasta el astronauta
        if (haz.grupo.visible) {
          const largo = Math.max(0.2, posWeb.distanceTo(miraWeb))
          const mitad = Math.tan(THREE.MathUtils.degToRad(FOV_WEBCAM / 2)) * largo
          haz.colocar(posWeb, miraWeb, mitad * (4 / 3), mitad)
          haz.animar(reloj.elapsedTime, color)
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
        estacion.animar(reloj.elapsedTime, 1 - 0.85 * oscuro)
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
const TONOS_LIBROS = ['#3B5B7A', '#6B7A90', '#2F4A66', '#8494A8']
