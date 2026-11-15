import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Herramientas compartidas por las animaciones 3D con el astronauta del Inicio (mismo modelo con esqueleto).

export const MODELO = '/models/humano.glb'
export const ALTURA = 1.8 // metros: el modelo se escala a esta estatura

let carga: Promise<GLTF> | null = null
export const cargarModelo = () => (carga ??= new GLTFLoader().loadAsync(MODELO))

export const v = () => new THREE.Vector3()
export const q = () => new THREE.Quaternion()

// Gira un hueso (en espacio de mundo) para que su hijo quede en la dirección pedida
export function apuntar(hueso: THREE.Object3D, hijo: THREE.Object3D, dir: THREE.Vector3) {
  const a = hueso.getWorldPosition(v())
  const actual = hijo.getWorldPosition(v()).sub(a).normalize()
  const giro = q().setFromUnitVectors(actual, dir.clone().normalize())
  const qMundo = hueso.getWorldQuaternion(q())
  const qPadre = hueso.parent!.getWorldQuaternion(q())
  hueso.quaternion.copy(qPadre.invert().multiply(giro.multiply(qMundo)))
  hueso.updateMatrixWorld(true)
}

// Gira un hueso alrededor de un eje de mundo
export function girarMundo(hueso: THREE.Object3D, eje: THREE.Vector3, ang: number) {
  const qMundo = hueso.getWorldQuaternion(q())
  const qPadre = hueso.parent!.getWorldQuaternion(q())
  const r = q().setFromAxisAngle(eje, ang)
  hueso.quaternion.copy(qPadre.invert().multiply(r.multiply(qMundo)))
  hueso.updateMatrixWorld(true)
}

// Busca un hueso de Mixamo con o sin los dos puntos (three.js los quita al cargar)
export const buscarHueso = (modelo: THREE.Object3D) => (n: string) =>
  modelo.getObjectByName(`mixamorig${n}`) ?? modelo.getObjectByName(`mixamorig:${n}`)!

// --- Traje de astronauta naranja con blanco ---
// El naranja es el "naranja internacional" de los trajes de lanzamiento; es más rojo que el ámbar de
// "atención" de la paleta para que nunca se confunda con un estado.
export const TRAJE = { naranja: '#F0641E', blanco: '#F2F4F7', gris: '#C9D1DC', visor: '#0B1524' }

const ZONA_BLANCA = /Head|Neck|Eye|Hand|Foot|Toe/

// Pinta cada vértice según los huesos que lo mueven: casco, guantes y botas en blanco; lo demás en naranja.
// Se guarda en la geometría (compartida entre copias del modelo), así que se calcula una sola vez.
export function pintarTraje(malla: THREE.SkinnedMesh) {
  const geo = malla.geometry
  if (geo.getAttribute('color')) return
  const idx = geo.getAttribute('skinIndex'), peso = geo.getAttribute('skinWeight')
  const n = geo.getAttribute('position').count
  const colores = new Float32Array(n * 3)
  const naranja = new THREE.Color(TRAJE.naranja), blanco = new THREE.Color(TRAJE.blanco)
  const huesos = malla.skeleton?.bones ?? []
  const esBlanco = huesos.map((b) => ZONA_BLANCA.test(b.name))
  const c = new THREE.Color()
  for (let i = 0; i < n; i++) {
    let w = 0
    if (idx && peso) for (let k = 0; k < 4; k++) if (esBlanco[idx.getComponent(i, k)]) w += peso.getComponent(i, k)
    // borde marcado entre zonas, como una costura
    c.copy(naranja).lerp(blanco, THREE.MathUtils.smoothstep(w, 0.42, 0.58))
    colores[i * 3] = c.r; colores[i * 3 + 1] = c.g; colores[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3))
}

// Viste el modelo: tela naranja y blanca, anillos de las articulaciones en blanco metálico y visor oscuro en el casco
export function vestir(modelo: THREE.Object3D, _acento: string, mats: THREE.Material[], sombras: boolean, geos: THREE.BufferGeometry[] = []) {
  const tela = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 })
  const anillos = new THREE.MeshStandardMaterial({ color: TRAJE.gris, roughness: 0.32, metalness: 0.65 })
  mats.push(tela, anillos)
  modelo.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isMesh) return
    const esJunta = m.name.includes('001') || m.name.toLowerCase().includes('joint')
    if (!esJunta && m.isSkinnedMesh) pintarTraje(m)
    m.material = esJunta ? anillos : tela
    m.castShadow = sombras
    m.frustumCulled = false
  })

  // Visor: una media esfera oscura y brillante pegada al hueso de la cabeza
  const h = buscarHueso(modelo)
  const cabeza = h('Head'), tope = h('HeadTop_End'), punta = h('LeftToeBase'), pie = h('LeftFoot')
  if (!cabeza || !tope) return
  modelo.updateMatrixWorld(true)
  const a = cabeza.getWorldPosition(v()), b = tope.getWorldPosition(v())
  const alto = a.distanceTo(b)
  const frente = punta && pie ? Math.sign(punta.getWorldPosition(v()).z - pie.getWorldPosition(v()).z) || 1 : 1
  const visorMat = new THREE.MeshPhysicalMaterial({ color: TRAJE.visor, roughness: 0.08, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#1B4B6B', emissiveIntensity: 0.25 })
  const visorGeo = new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5)
  mats.push(visorMat); geos.push(visorGeo)
  const visor = new THREE.Mesh(visorGeo, visorMat)
  visor.name = 'visor'
  visor.scale.set(alto * 0.4, alto * 0.2, alto * 0.47)
  visor.position.copy(a).lerp(b, 0.52).add(new THREE.Vector3(0, 0, alto * 0.3 * frente))
  visor.rotation.x = (frente * Math.PI) / 2 // la cúpula mira al frente
  visor.castShadow = false
  escalaMundo(modelo, visor)
  cabeza.attach(visor)
}

// three.js conserva la pose de mundo al usar attach; solo hace falta que el objeto esté en la escena del modelo
function escalaMundo(modelo: THREE.Object3D, o: THREE.Object3D) {
  let raiz: THREE.Object3D = modelo
  while (raiz.parent) raiz = raiz.parent
  raiz.add(o)
  o.updateMatrixWorld(true)
}
