import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Estado, Organo } from './useSalud'

// Cuerpo holográfico en 3D que gira 360°. Cada órgano toma el color de su estado real
// y se mueve con tus datos: el corazón late a tu ritmo medido y los pulmones respiran
// a tu frecuencia medida. Se arrastra para girar y se toca un órgano para ver su detalle

const COLOR: Record<Estado, string> = { ok: '#3DDC97', warn: '#F5B544', crit: '#FF6B7A', none: '#5C7896' }
const CIAN = new THREE.Color('#5CC8F5')

type Props = {
  organos: Record<Organo, Estado>
  etiquetas: Record<Organo, string>
  bpm: number | null
  rpm: number | null
  seleccionado: Organo | null
  onSelect: (o: Organo | null) => void
  vista: number // se incrementa para pedir girar a frente (par) o espalda (impar)
  sexo: 'F' | 'M' | '' // de la ficha médica: ajusta las proporciones del cuerpo
}

// Proporciones del cuerpo femenino sobre el mismo esqueleto. Cada hueso hereda la escala del
// anterior, así que se escribe la escala que debe quedar en cada zona y aquí se convierte a relativa
// (x = ancho, y = alto, z = profundidad)
const FORMA_F: [string, string | null, [number, number, number]][] = [
  ['Hips', null, [1.24, 1, 1.12]], // cadera ancha
  ['LeftUpLeg', 'Hips', [1.02, 1, 1.02]], // muslos llenos sin engordar toda la pierna
  ['RightUpLeg', 'Hips', [1.02, 1, 1.02]],
  ['Spine', 'Hips', [0.8, 0.97, 0.9]], // cintura delgada
  ['Spine1', 'Spine', [0.86, 0.97, 1.0]],
  ['Spine2', 'Spine1', [0.8, 0.95, 1.04]], // pecho y hombros angostos
  ['LeftShoulder', 'Spine2', [0.88, 0.92, 0.92]],
  ['RightShoulder', 'Spine2', [0.88, 0.92, 0.92]],
  ['Neck', 'Spine2', [0.9, 0.98, 0.94]], // cuello y cabeza un poco más finos
]
const absoluta = Object.fromEntries(FORMA_F.map(([n, , a]) => [n, a]))
const PROPORCIONES_F: Record<string, [number, number, number]> = Object.fromEntries(
  FORMA_F.map(([n, padre, a]) => {
    const p = padre ? absoluta[padre] : [1, 1, 1]
    return [n, [a[0] / p[0], a[1] / p[1], a[2] / p[2]]]
  }),
)
const ESTATURA_F = 0.95 // un poco más baja

// Modelo humano: Xbot de Mixamo, incluido en los ejemplos oficiales de three.js
const MODELO = '/models/humano.glb'

// Contorno brillante tipo holograma: más luz en las orillas que en el centro.
// Lleva los pedazos de skinning de three.js para que siga la animación del esqueleto
const vertexRim = `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <beginnormal_vertex>
    #include <skinnormal_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vNormal = normalize(normalMatrix * objectNormal);
    vView = normalize(-mvPosition.xyz);
  }
`
const fragmentRim = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = 1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0);
    float a = pow(rim, 2.4) * uOpacity + 0.035;
    gl_FragColor = vec4(uColor * (0.55 + rim), a);
  }
`

const LISTA: Organo[] = ['cerebro', 'ojos', 'corazon', 'pulmones', 'inmune']
// Desplazamiento vertical de cada etiqueta para que no se encimen (px)
const DY: Record<Organo, number> = { cerebro: -26, ojos: 4, corazon: 6, pulmones: 0, inmune: -6 }

export default function Holograma({ organos, etiquetas, bpm, rpm, seleccionado, onSelect, vista, sexo }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const etiquetasRef = useRef<Partial<Record<Organo, HTMLButtonElement | null>>>({})
  const ladoRef = useRef<HTMLSpanElement>(null)
  // Valores que cambian sin volver a montar la escena
  const datos = useRef({ organos, bpm, rpm, seleccionado, onSelect, vista, sexo })
  useEffect(() => {
    datos.current = { organos, bpm, rpm, seleccionado, onSelect, vista, sexo }
  })

  useEffect(() => {
    const el = contenedor.current
    if (!el) return
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.style.cursor = 'grab'

    const escena = new THREE.Scene()
    const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
    camara.position.set(0, 0.1, 9)
    camara.lookAt(0, -0.12, 0)

    const geometrias: THREE.BufferGeometry[] = []
    const materiales: THREE.Material[] = []
    const g = <T extends THREE.BufferGeometry>(x: T) => {
      geometrias.push(x)
      return x
    }

    // ---------- cuerpo ----------
    const cuerpo = new THREE.Group()
    escena.add(cuerpo)
    const rim = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: CIAN.clone() }, uOpacity: { value: 0.85 } },
      vertexShader: vertexRim,
      fragmentShader: fragmentRim,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const rimSuave = rim.clone()
    ;(rimSuave.uniforms.uOpacity as { value: number }).value = 0.25
    materiales.push(rimSuave)
    const malla = new THREE.MeshBasicMaterial({ color: CIAN, wireframe: true, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false })
    materiales.push(rim, malla)

    // ---------- órganos ----------
    const organoMeshes: { o: Organo; mesh: THREE.Mesh; halo: THREE.Mesh; base: THREE.Vector3; baseHalo: THREE.Vector3 }[] = []
    const anclas: Partial<Record<Organo, THREE.Object3D>> = {}
    const matOrgano = {} as Record<Organo, THREE.MeshBasicMaterial>
    const matHalo = {} as Record<Organo, THREE.MeshBasicMaterial>
    for (const o of LISTA) {
      matOrgano[o] = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
      matHalo[o] = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
      materiales.push(matOrgano[o], matHalo[o])
    }
    let mixer: THREE.AnimationMixer | null = null
    const huesosForma: { hueso: THREE.Object3D; f: [number, number, number] }[] = []
    const busto: THREE.Mesh[] = []
    let estatura = 1

    new GLTFLoader().load(
      MODELO,
      (gltf) => {
        const modelo = gltf.scene
        // Altura real del modelo para escalarlo a 4 unidades con los pies en y = -2
        modelo.updateMatrixWorld(true)
        const caja = new THREE.Box3().setFromObject(modelo)
        const alto = caja.max.y - caja.min.y
        modelo.scale.setScalar(4 / alto)
        modelo.position.y = -2 - caja.min.y * (4 / alto)
        cuerpo.add(modelo)
        const mallas: THREE.Mesh[] = []
        modelo.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) mallas.push(o as THREE.Mesh)
        })
        for (const m of mallas) {
          const articulaciones = m.name.includes('Joints')
          m.material = articulaciones ? rimSuave : rim
          m.frustumCulled = false
          if (articulaciones) continue
          // Sirve con modelos con esqueleto (SkinnedMesh) y sin esqueleto (Mesh normal)
          const sk = m as THREE.SkinnedMesh
          let red: THREE.Mesh
          if (sk.isSkinnedMesh) {
            const r = new THREE.SkinnedMesh(sk.geometry, malla)
            r.bind(sk.skeleton, sk.bindMatrix)
            red = r
          } else {
            red = new THREE.Mesh(m.geometry, malla)
            red.position.copy(m.position)
            red.quaternion.copy(m.quaternion)
            red.scale.copy(m.scale)
          }
          red.frustumCulled = false
          m.parent?.add(red)
        }
        modelo.updateMatrixWorld(true)

        const hueso = (n: string) => modelo.getObjectByName(`mixamorig${n}`) ?? modelo.getObjectByName(`mixamorig:${n}`) ?? null

        // Si el modelo viene en pose de T, se bajan los brazos a una pose natural
        const idle = gltf.animations.find((a) => /idle/i.test(a.name))
        if (!idle) {
          for (const [lado, signo] of [['Left', 1], ['Right', -1]] as const) {
            const brazo = hueso(`${lado}Arm`)
            const codo = hueso(`${lado}ForeArm`)
            if (!brazo || !codo || !brazo.parent) continue
            const a = brazo.getWorldPosition(new THREE.Vector3())
            const b = codo.getWorldPosition(new THREE.Vector3())
            const actual = b.sub(a).normalize()
            const deseada = new THREE.Vector3(0.28 * Math.sign(actual.x || signo), -1, 0.06).normalize()
            const giro = new THREE.Quaternion().setFromUnitVectors(actual, deseada)
            const qMundo = brazo.getWorldQuaternion(new THREE.Quaternion())
            const qPadre = brazo.parent.getWorldQuaternion(new THREE.Quaternion())
            brazo.quaternion.copy(qPadre.invert().multiply(giro.multiply(qMundo)))
            brazo.updateMatrixWorld(true)
          }
        }
        modelo.updateMatrixWorld(true)

        // Los órganos se colocan desde los huesos, en proporción a la estatura del modelo
        const f = alto / 1.8
        const organo = (o: Organo, geo: THREE.BufferGeometry, padre: string, dx: number, dy: number, dz: number, s: [number, number, number] = [1, 1, 1]) => {
          const h = hueso(padre)
          // Sin esqueleto: se usa la altura típica de cada hueso como fracción de la estatura
          const FRACCION: Record<string, number> = { Head: 0.884, Neck: 0.83, Spine2: 0.739, Hips: 0.576 }
          const local = h
            ? modelo.worldToLocal(h.getWorldPosition(new THREE.Vector3()))
            : new THREE.Vector3((caja.min.x + caja.max.x) / 2, caja.min.y + alto * (FRACCION[padre] ?? 0.7), (caja.min.z + caja.max.z) / 2)
          local.add(new THREE.Vector3(dx * f, dy * f, dz * f))
          const mesh = new THREE.Mesh(g(geo), matOrgano[o])
          const halo = new THREE.Mesh(geo, matHalo[o])
          mesh.userData.organo = o
          halo.userData.organo = o
          if (o === 'corazon') mesh.renderOrder = 2
          for (const [x0, k] of [[mesh, 1], [halo, 1.6]] as const) {
            x0.position.copy(local)
            x0.scale.set(s[0] * k * f, s[1] * k * f, s[2] * k * f)
            modelo.add(x0)
            x0.updateMatrixWorld(true)
            h?.attach(x0)
          }
          organoMeshes.push({ o, mesh, halo, base: mesh.scale.clone(), baseHalo: halo.scale.clone() })
          if (!anclas[o]) anclas[o] = mesh
        }
        organo('cerebro', new THREE.SphereGeometry(0.06, 24, 18), 'Head', 0, 0.115, 0.01, [1, 0.78, 1.12])
        const ojo = new THREE.SphereGeometry(0.014, 12, 10)
        organo('ojos', ojo, 'Head', 0.032, 0.065, 0.09)
        organo('ojos', ojo, 'Head', -0.032, 0.065, 0.09)
        organo('corazon', new THREE.SphereGeometry(0.038, 20, 16), 'Spine2', 0.025, 0.03, 0.06, [1, 1.12, 0.9])
        const pulmon = new THREE.SphereGeometry(0.05, 20, 16)
        organo('pulmones', pulmon, 'Spine2', -0.072, 0.05, 0.012, [0.85, 1.45, 0.75])
        organo('pulmones', pulmon, 'Spine2', 0.072, 0.05, 0.012, [0.85, 1.45, 0.75])
        const ganglio = new THREE.SphereGeometry(0.013, 10, 8)
        organo('inmune', ganglio, 'Neck', 0.045, 0, 0.055)
        organo('inmune', ganglio, 'Neck', -0.045, 0, 0.055)
        organo('inmune', ganglio, 'Spine2', 0.14, 0.026, 0)
        organo('inmune', ganglio, 'Spine2', -0.14, 0.026, 0)
        organo('inmune', ganglio, 'Hips', 0.08, -0.06, 0.05)
        organo('inmune', ganglio, 'Hips', -0.08, -0.06, 0.05)

        // Busto: dos volúmenes con el mismo contorno de holograma, solo en el cuerpo femenino
        const pecho = hueso('Spine2')
        if (pecho) {
          const geo = g(new THREE.SphereGeometry(0.05 * f, 24, 18))
          const base = modelo.worldToLocal(pecho.getWorldPosition(new THREE.Vector3()))
          for (const lado of [-1, 1]) {
            for (const mat of [rim, malla]) {
              const m = new THREE.Mesh(geo, mat)
              m.position.copy(base).add(new THREE.Vector3(0.058 * lado * f, 0.02 * f, 0.075 * f))
              m.scale.set(1, 0.9, 0.75)
              m.visible = false
              modelo.add(m)
              m.updateMatrixWorld(true)
              pecho.attach(m)
              busto.push(m)
            }
          }
        }

        // Esqueleto visible por dentro, como en un escáner
        const esqueleto = new THREE.SkeletonHelper(modelo)
        const matHueso = esqueleto.material as THREE.LineBasicMaterial
        matHueso.color = CIAN.clone()
        matHueso.transparent = true
        matHueso.opacity = 0.35
        matHueso.blending = THREE.AdditiveBlending
        matHueso.depthWrite = false
        matHueso.depthTest = false
        ;(matHueso as THREE.LineBasicMaterial & { vertexColors: boolean }).vertexColors = false
        escena.add(esqueleto)
        materiales.push(matHueso)
        geometrias.push(esqueleto.geometry)

        for (const [n, f] of Object.entries(PROPORCIONES_F)) {
          const h = hueso(n)
          if (h) huesosForma.push({ hueso: h, f })
        }

        if (idle) {
          mixer = new THREE.AnimationMixer(modelo)
          mixer.clipAction(idle).play()
          if (reducido) mixer.timeScale = 0
        }
      },
      undefined,
      (e) => console.error('No se pudo cargar el modelo 3D', e),
    )

    // ---------- plataforma, escáner y partículas ----------
    const plataforma = new THREE.Group()
    plataforma.position.y = -2.05
    escena.add(plataforma)
    const anillos: THREE.Mesh[] = []
    for (const [r0, r1, op] of [[0.75, 0.78, 0.7], [0.95, 0.965, 0.4], [1.2, 1.215, 0.25]] as const) {
      const mat = new THREE.MeshBasicMaterial({ color: CIAN, transparent: true, opacity: op, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      materiales.push(mat)
      const a = new THREE.Mesh(g(new THREE.RingGeometry(r0, r1, 96, 1, 0, Math.PI * (r0 > 1 ? 1.5 : 2))), mat)
      a.rotation.x = -Math.PI / 2
      plataforma.add(a)
      anillos.push(a)
    }
    const discoMat = new THREE.MeshBasicMaterial({ color: CIAN, transparent: true, opacity: 0.08, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    materiales.push(discoMat)
    const disco = new THREE.Mesh(g(new THREE.CircleGeometry(0.75, 64)), discoMat)
    disco.rotation.x = -Math.PI / 2
    plataforma.add(disco)

    const escanerMat = new THREE.MeshBasicMaterial({ color: CIAN, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    materiales.push(escanerMat)
    const escaner = new THREE.Mesh(g(new THREE.RingGeometry(0.55, 0.57, 72)), escanerMat)
    escaner.rotation.x = -Math.PI / 2
    escena.add(escaner)

    const nPart = 160
    const pos = new Float32Array(nPart * 3)
    for (let i = 0; i < nPart; i++) {
      const ang = Math.random() * Math.PI * 2
      const r = 0.9 + Math.random() * 1.1
      pos[i * 3] = Math.cos(ang) * r
      pos[i * 3 + 1] = -2 + Math.random() * 4.2
      pos[i * 3 + 2] = Math.sin(ang) * r
    }
    const partGeo = g(new THREE.BufferGeometry())
    partGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const partMat = new THREE.PointsMaterial({ color: CIAN, size: 0.025, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    materiales.push(partMat)
    const particulas = new THREE.Points(partGeo, partMat)
    escena.add(particulas)

    // ---------- tamaño ----------
    const ajustar = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h)
      camara.aspect = w / h
      // En pantallas angostas se aleja la cámara para que quepa todo el cuerpo
      camara.position.z = w / h < 0.75 ? 11 : 9
      camara.updateProjectionMatrix()
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)

    // ---------- girar con el dedo o el mouse, tocar órganos ----------
    let arrastrando = false
    let movido = 0
    let ultimoX = 0
    let velocidad = 0
    let objetivo: number | null = null
    let ultimaVista = datos.current.vista
    const ray = new THREE.Raycaster()
    const puntero = new THREE.Vector2()
    const abajo = (e: PointerEvent) => {
      arrastrando = true
      movido = 0
      ultimoX = e.clientX
      objetivo = null
      renderer.domElement.setPointerCapture(e.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
    }
    const mover = (e: PointerEvent) => {
      if (!arrastrando) return
      const dx = e.clientX - ultimoX
      ultimoX = e.clientX
      movido += Math.abs(dx)
      velocidad = dx * 0.01
      cuerpo.rotation.y += velocidad
    }
    const arriba = (e: PointerEvent) => {
      arrastrando = false
      renderer.domElement.style.cursor = 'grab'
      if (movido > 6) return
      // Fue un toque, no un arrastre: ¿tocó un órgano?
      const r = renderer.domElement.getBoundingClientRect()
      puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(puntero, camara)
      const hit = ray.intersectObjects(organoMeshes.map((x) => x.halo))[0]
      const o = (hit?.object.userData.organo as Organo | undefined) ?? null
      datos.current.onSelect(o === datos.current.seleccionado ? null : o)
    }
    renderer.domElement.addEventListener('pointerdown', abajo)
    renderer.domElement.addEventListener('pointermove', mover)
    renderer.domElement.addEventListener('pointerup', arriba)

    // ---------- animación ----------
    const reloj = new THREE.Clock()
    const tmp = new THREE.Vector3()
    const color = new THREE.Color()
    let frame = 0
    const animar = () => {
      frame = requestAnimationFrame(animar)
      const dt = reloj.getDelta()
      const t = reloj.elapsedTime
      mixer?.update(dt)
      // Se aplica después de la animación en cada cuadro para que no la sobrescriba
      const mujer = datos.current.sexo === 'F'
      for (const { hueso: h, f } of huesosForma) {
        if (mujer) h.scale.set(f[0], f[1], f[2])
        else h.scale.set(1, 1, 1)
      }
      for (const b of busto) b.visible = mujer
      // Estatura: se escala todo el cuerpo con los pies fijos en la plataforma
      estatura += ((mujer ? ESTATURA_F : 1) - estatura) * 0.15
      cuerpo.scale.setScalar(estatura)
      cuerpo.position.y = -2 * (1 - estatura)
      const d = datos.current

      // Pedido de girar a frente o espalda
      if (d.vista !== ultimaVista) {
        ultimaVista = d.vista
        const vuelta = Math.round(cuerpo.rotation.y / (Math.PI * 2)) * Math.PI * 2
        objetivo = vuelta + (d.vista % 2 ? Math.PI : 0)
      }
      if (objetivo != null) {
        cuerpo.rotation.y += (objetivo - cuerpo.rotation.y) * 0.08
        if (Math.abs(objetivo - cuerpo.rotation.y) < 0.002) objetivo = null
      } else if (!arrastrando) {
        velocidad *= 0.94
        cuerpo.rotation.y += velocidad + (reducido || d.seleccionado ? 0 : 0.0035)
      }

      // Latido a tu ritmo medido y respiración a tu frecuencia medida (si no hay dato, valores de reposo)
      const faseLatido = (t * ((d.bpm ?? 60) / 60)) % 1
      const latido = 1 + 0.18 * Math.exp(-faseLatido * 9) + 0.08 * Math.exp(-Math.max(0, faseLatido - 0.18) * 12) * (faseLatido > 0.18 ? 1 : 0)
      const respiro = 1 + 0.09 * Math.sin(t * Math.PI * 2 * ((d.rpm ?? 14) / 60))
      const parpadeo = (t % 4.2) < 0.12 ? 0.15 : 1

      for (const { o, mesh, halo, base, baseHalo } of organoMeshes) {
        const estado = d.organos[o]
        color.set(COLOR[estado])
        matOrgano[o].color.copy(color)
        matHalo[o].color.copy(color)
        const activo = !d.seleccionado || d.seleccionado === o
        const alerta = estado === 'crit' ? 0.5 + 0.5 * Math.sin(t * 6) : 1
        matOrgano[o].opacity = (activo ? (o === 'pulmones' ? 0.4 : o === 'cerebro' ? 0.55 : 0.9) : 0.15) * (estado === 'none' ? 0.55 : 1) * alerta
        matHalo[o].opacity = (d.seleccionado === o ? 0.3 : activo ? 0.12 : 0.03) * alerta
        let k = 1
        if (o === 'corazon') k = latido
        if (o === 'pulmones') k = respiro
        mesh.scale.set(base.x * k, base.y * (o === 'ojos' ? parpadeo : k), base.z * k)
        halo.scale.set(baseHalo.x * k, baseHalo.y * k, baseHalo.z * k)
      }

      // Escáner que sube y baja
      const y = Math.sin(t * 0.6) * 1.95
      escaner.position.y = y
      const ancho = 0.5 + 0.35 * Math.cos((y / 2) * Math.PI * 0.5)
      escaner.scale.set(ancho / 0.56, ancho / 0.56, 1)
      escanerMat.opacity = 0.35 + 0.15 * Math.sin(t * 3)
      anillos.forEach((a, i) => (a.rotation.z = t * (i % 2 ? -0.25 : 0.4)))
      particulas.rotation.y = t * 0.05
      ;(rim.uniforms.uOpacity as { value: number }).value = 0.8 + 0.08 * Math.sin(t * 1.7)

      renderer.render(escena, camara)

      // Qué lado del cuerpo se está viendo, para no perderse al girar
      if (ladoRef.current) {
        const ang = ((cuerpo.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        const grados = Math.round((ang * 180) / Math.PI)
        const lado = grados < 45 || grados > 315 ? 'Frente' : grados < 135 ? 'Lado izquierdo' : grados < 225 ? 'Espalda' : 'Lado derecho'
        const texto = `${lado} · ${grados}°`
        if (ladoRef.current.textContent !== texto) ladoRef.current.textContent = texto
      }

      // Etiquetas que siguen a cada órgano en pantalla
      const w = el.clientWidth
      const h = el.clientHeight
      for (const o of LISTA) {
        const etiqueta = etiquetasRef.current[o]
        const ancla = anclas[o]
        if (!etiqueta) continue
        if (!ancla) {
          etiqueta.style.opacity = '0'
          continue
        }
        ancla.getWorldPosition(tmp)
        const atras = tmp.z < -0.05
        tmp.project(camara)
        const sx = (tmp.x * 0.5 + 0.5) * w
        const sy = (-tmp.y * 0.5 + 0.5) * h
        const derecha = sx >= w / 2
        etiqueta.style.transform = `translate(${derecha ? sx + 14 : sx - 14}px, ${sy + DY[o]}px) translate(${derecha ? '0' : '-100%'}, -50%)`
        etiqueta.style.opacity = atras ? '0.3' : '1'
        etiqueta.dataset.lado = derecha ? 'der' : 'izq'
      }
    }
    animar()

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', abajo)
      renderer.domElement.removeEventListener('pointermove', mover)
      renderer.domElement.removeEventListener('pointerup', arriba)
      geometrias.forEach((x) => x.dispose())
      materiales.forEach((x) => x.dispose())
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={contenedor} className="absolute inset-0" role="img" aria-label="Cuerpo en 3D con el estado de cada sistema, arrastra para girar" />
      <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#1C2E4A] bg-[#060B16]/80 px-3 py-1 font-mono text-[11px] text-[#8AD9F8]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5CC8F5]" />
        Viendo: <span ref={ladoRef}>Frente · 0°</span>
      </div>
      {LISTA.map((o) => (
        <button
          key={o}
          type="button"
          ref={(b) => {
            etiquetasRef.current[o] = b
          }}
          onClick={() => onSelect(seleccionado === o ? null : o)}
          className="absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-md border bg-[#060B16]/80 px-2 py-1 font-mono text-[11px] backdrop-blur-sm transition-opacity"
          style={{ borderColor: `${COLOR[organos[o]]}66`, color: COLOR[organos[o]], boxShadow: seleccionado === o ? `0 0 12px ${COLOR[organos[o]]}55` : undefined }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLOR[organos[o]] }} />
          {etiquetas[o]}
        </button>
      ))}
    </div>
  )
}
