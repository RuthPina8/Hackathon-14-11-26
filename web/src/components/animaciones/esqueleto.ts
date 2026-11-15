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

// Guarda en cada vértice cuánto pertenece a la zona blanca (casco, guantes y botas), según los huesos que lo mueven.
// El color NO se guarda por vértice: se decide píxel por píxel en el sombreador, para que la costura entre
// naranja y blanco salga nítida y no difuminada.
export function marcarZonas(malla: THREE.SkinnedMesh) {
  const geo = malla.geometry
  if (geo.getAttribute('zona')) return
  const idx = geo.getAttribute('skinIndex'), peso = geo.getAttribute('skinWeight')
  const n = geo.getAttribute('position').count
  const zona = new Float32Array(n)
  const esBlanco = (malla.skeleton?.bones ?? []).map((b) => ZONA_BLANCA.test(b.name))
  for (let i = 0; i < n; i++) {
    let w = 0
    if (idx && peso) for (let k = 0; k < 4; k++) if (esBlanco[idx.getComponent(i, k)]) w += peso.getComponent(i, k)
    zona[i] = w
  }
  geo.setAttribute('zona', new THREE.BufferAttribute(zona, 1))
}

function telaTraje() {
  const tela = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78, metalness: 0.02 })
  const u = { uNaranja: { value: new THREE.Color(TRAJE.naranja) }, uBlanco: { value: new THREE.Color(TRAJE.blanco) }, uCostura: { value: new THREE.Color('#3A4252') } }
  tela.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float zona;
varying float vZona;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vZona = zona;`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uNaranja;
uniform vec3 uBlanco;
uniform vec3 uCostura;
varying float vZona;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float anchoZ = max(fwidth(vZona), 1e-4);
        float z = smoothstep(0.5 - anchoZ, 0.5 + anchoZ, vZona);
        float costura = 1.0 - smoothstep(anchoZ * 1.2, anchoZ * 2.4, abs(vZona - 0.5));
        diffuseColor.rgb = mix(mix(uNaranja, uBlanco, z), uCostura, costura * 0.85);`)
  }
  tela.customProgramCacheKey = () => 'traje-astronauta'
  return tela
}

// Viste el modelo: tela naranja y blanca, anillos de las articulaciones en blanco metálico y visor oscuro en el casco
export function vestir(modelo: THREE.Object3D, acento: string, mats: THREE.Material[], sombras: boolean, geos: THREE.BufferGeometry[] = [], opciones: { mochila?: boolean } = {}) {
  const tela = telaTraje()
  // las articulaciones son fuelles de tela blanca, no metal: así el modelo deja de verse como un robot
  const anillos = new THREE.MeshStandardMaterial({ color: TRAJE.blanco, roughness: 0.6, metalness: 0.05 })
  mats.push(tela, anillos)
  modelo.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isMesh) return
    const esJunta = m.name.includes('001') || m.name.toLowerCase().includes('joint')
    if (!esJunta && m.isSkinnedMesh) marcarZonas(m)
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
  visor.scale.set(alto * 0.43, alto * 0.3, alto * 0.45)
  visor.position.copy(a).lerp(b, 0.52).add(new THREE.Vector3(0, 0, alto * 0.4 * frente))
  visor.rotation.x = (frente * Math.PI) / 2 // la cúpula mira al frente
  visor.castShadow = false
  escalaMundo(modelo, visor)
  cabeza.attach(visor)

  // --- Detalles del traje, pegados a los huesos para que se muevan con el cuerpo ---
  const pieza = (g: THREE.BufferGeometry, m: THREE.Material, hueso: THREE.Object3D, pos: THREE.Vector3, rot?: THREE.Euler) => {
    geos.push(g)
    const o = new THREE.Mesh(g, m)
    o.position.copy(pos)
    if (rot) o.rotation.copy(rot)
    o.castShadow = sombras
    escalaMundo(modelo, o)
    hueso.attach(o)
    return o
  }
  const blanco = new THREE.MeshStandardMaterial({ color: TRAJE.blanco, roughness: 0.5, metalness: 0.05 })
  const metal = new THREE.MeshStandardMaterial({ color: TRAJE.gris, roughness: 0.28, metalness: 0.85 })
  const oscuro = new THREE.MeshStandardMaterial({ color: '#1B2636', roughness: 0.5, metalness: 0.3 })
  const luz = new THREE.MeshBasicMaterial({ color: acento })
  const naranja = new THREE.MeshStandardMaterial({ color: TRAJE.naranja, roughness: 0.6 })
  mats.push(blanco, metal, oscuro, luz, naranja)
  const cuello = h('Neck'), pecho = h('Spine2'), hombroI = h('LeftArm'), hombroD = h('RightArm')
  if (!cuello || !pecho || !hombroI || !hombroD) return
  const pCuello = cuello.getWorldPosition(v()), pPecho = pecho.getWorldPosition(v())
  const anchoH = hombroI.getWorldPosition(v()).distanceTo(hombroD.getWorldPosition(v()))
  const F = new THREE.Vector3(0, 0, frente)

  // aro metálico donde el casco se une al traje
  pieza(new THREE.TorusGeometry(alto * 0.36, alto * 0.06, 12, 40), metal, cuello, pCuello.clone().add(new THREE.Vector3(0, alto * 0.12, alto * 0.05 * frente)), new THREE.Euler(Math.PI / 2, 0, 0))

  // unidad de control en el pecho: caja, pantalla y tres luces
  const yPecho = THREE.MathUtils.lerp(pPecho.y, pCuello.y, 0.25)
  const zPecho = pPecho.z + anchoH * 0.36 * frente
  const base = new THREE.Vector3(pPecho.x, yPecho, zPecho)
  pieza(new THREE.BoxGeometry(anchoH * 0.5, anchoH * 0.3, anchoH * 0.1), blanco, pecho, base)
  pieza(new THREE.BoxGeometry(anchoH * 0.26, anchoH * 0.13, 0.004), oscuro, pecho, base.clone().add(new THREE.Vector3(-anchoH * 0.08, anchoH * 0.04, 0)).addScaledVector(F, anchoH * 0.052))
  for (let k = 0; k < 3; k++) pieza(new THREE.SphereGeometry(anchoH * 0.018, 10, 8), luz, pecho, base.clone().add(new THREE.Vector3(anchoH * (0.12 + k * 0.055) - anchoH * 0.02, -anchoH * 0.09, 0)).addScaledVector(F, anchoH * 0.052))
  // franja naranja con el parche de misión
  pieza(new THREE.BoxGeometry(anchoH * 0.12, anchoH * 0.12, 0.004), naranja, pecho, base.clone().add(new THREE.Vector3(anchoH * 0.15, anchoH * 0.05, 0)).addScaledVector(F, anchoH * 0.052))

  // mochila de soporte vital (se omite cuando el astronauta se sienta contra un respaldo)
  if (opciones.mochila !== false) {
    const atras = new THREE.Vector3(pPecho.x, THREE.MathUtils.lerp(pPecho.y, pCuello.y, 0.1), pPecho.z - anchoH * 0.5 * frente)
    pieza(new THREE.BoxGeometry(anchoH * 0.82, anchoH * 1.05, anchoH * 0.34), blanco, pecho, atras)
    pieza(new THREE.BoxGeometry(anchoH * 0.6, anchoH * 0.1, anchoH * 0.36), metal, pecho, atras.clone().add(new THREE.Vector3(0, anchoH * 0.3, 0)))
    pieza(new THREE.BoxGeometry(anchoH * 0.6, anchoH * 0.1, anchoH * 0.36), metal, pecho, atras.clone().add(new THREE.Vector3(0, -anchoH * 0.3, 0)))
    pieza(new THREE.CylinderGeometry(anchoH * 0.09, anchoH * 0.09, anchoH * 0.7, 20), naranja, pecho, atras.clone().add(new THREE.Vector3(0, anchoH * 0.6, 0)), new THREE.Euler(0, 0, Math.PI / 2))
    pieza(new THREE.BoxGeometry(anchoH * 0.3, anchoH * 0.03, 0.004), luz, pecho, atras.clone().addScaledVector(F, -anchoH * 0.172))
  }
}

// three.js conserva la pose de mundo al usar attach; solo hace falta que el objeto esté en la escena del modelo
function escalaMundo(modelo: THREE.Object3D, o: THREE.Object3D) {
  let raiz: THREE.Object3D = modelo
  while (raiz.parent) raiz = raiz.parent
  raiz.add(o)
  o.updateMatrixWorld(true)
}
