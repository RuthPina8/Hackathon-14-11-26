import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

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

// Relieve de tela: pliegues horizontales y costuras, dibujado en un canvas y usado como mapa de relieve
let relieveTela: THREE.CanvasTexture | null = null
function texturaTela() {
  if (relieveTela) return relieveTela
  const T = 512
  const c = document.createElement('canvas')
  c.width = c.height = T
  const g = c.getContext('2d')!
  g.fillStyle = '#808080'; g.fillRect(0, 0, T, T)
  // pliegues anchos y suaves
  for (let i = 0; i < 26; i++) {
    const y = (i * 197) % T, alto = 10 + ((i * 53) % 22)
    const grad = g.createLinearGradient(0, y, 0, y + alto)
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,.28)'); grad.addColorStop(1, 'rgba(0,0,0,.22)')
    g.fillStyle = grad
    g.beginPath(); g.ellipse((i * 131) % T, y + alto / 2, 90 + ((i * 71) % 160), alto / 2, ((i % 5) - 2) * 0.05, 0, 7); g.fill()
  }
  // trama fina del tejido
  for (let y = 0; y < T; y += 4) { g.fillStyle = y % 8 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.035)'; g.fillRect(0, y, T, 2) }
  relieveTela = new THREE.CanvasTexture(c)
  relieveTela.wrapS = relieveTela.wrapT = THREE.RepeatWrapping
  relieveTela.repeat.set(6, 6)
  return relieveTela
}

// Tela del traje. Dos trucos de sombreador:
//  - el color (naranja o blanco) se decide por píxel con la zona del vértice: costura nítida;
//  - cada vértice se desplaza hacia afuera sobre su normal: el maniquí delgado se vuelve un traje acolchado,
//    más grueso en guantes y botas. Se hace ANTES del esqueleto, así que no afecta a las animaciones.
function telaTraje(grosor: number) {
  const tela = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0, bumpMap: texturaTela(), bumpScale: 1.4 })
  const u = { uNaranja: { value: new THREE.Color(TRAJE.naranja) }, uBlanco: { value: new THREE.Color(TRAJE.blanco) }, uCostura: { value: new THREE.Color('#3A4252') }, uGrosor: { value: grosor } }
  tela.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float zona;
varying float vZona;
uniform float uGrosor;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vZona = zona;
transformed += normalize(objectNormal) * uGrosor * (1.0 - 0.4 * zona);`)
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
  tela.customProgramCacheKey = () => 'traje-astronauta-2'
  return tela
}

// Material inflado sencillo (para los fuelles de las articulaciones)
function inflado(mat: THREE.MeshStandardMaterial, grosor: number, clave: string) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrosor = { value: grosor }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uGrosor;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed += normalize(objectNormal) * uGrosor;`)
  }
  mat.customProgramCacheKey = () => clave
  return mat
}

// Viste el modelo como un astronauta: traje acolchado naranja con blanco, casco con visor, aro del cuello,
// unidad de pecho, mochila de soporte vital y mangueras. Todo va pegado a los huesos y se mueve con el cuerpo.
export function vestir(modelo: THREE.Object3D, acento: string, mats: THREE.Material[], sombras: boolean, geos: THREE.BufferGeometry[] = [], opciones: { mochila?: boolean } = {}) {
  const h = buscarHueso(modelo)
  const cabeza = h('Head'), tope = h('HeadTop_End'), punta = h('LeftToeBase'), pie = h('LeftFoot')
  const cuello = h('Neck'), pecho = h('Spine2'), hombroI = h('LeftArm'), hombroD = h('RightArm')
  modelo.updateMatrixWorld(true)
  const escala = modelo.getWorldScale(v()).x || 1
  const GROSOR = 0.024 // metros de acolchado
  const tela = telaTraje(GROSOR / escala)
  const fuelles = inflado(new THREE.MeshStandardMaterial({ color: TRAJE.blanco, roughness: 0.7, metalness: 0, bumpMap: texturaTela(), bumpScale: 1.2 }), (GROSOR * 1.15) / escala, 'fuelles-traje')
  mats.push(tela, fuelles)
  modelo.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isMesh) return
    const esJunta = m.name.includes('001') || m.name.toLowerCase().includes('joint')
    if (!esJunta && m.isSkinnedMesh) marcarZonas(m)
    m.material = esJunta ? fuelles : tela
    m.castShadow = sombras
    m.frustumCulled = false
  })
  if (!cabeza || !tope || !cuello || !pecho || !hombroI || !hombroD) return

  const a = cabeza.getWorldPosition(v()), b = tope.getWorldPosition(v())
  const alto = a.distanceTo(b)
  const frente = punta && pie ? Math.sign(punta.getWorldPosition(v()).z - pie.getWorldPosition(v()).z) || 1 : 1
  const pCuello = cuello.getWorldPosition(v()), pPecho = pecho.getWorldPosition(v())
  const U = hombroI.getWorldPosition(v()).distanceTo(hombroD.getWorldPosition(v())) // ancho de hombros: unidad de medida
  const F = new THREE.Vector3(0, 0, frente)

  const pieza = <G extends THREE.BufferGeometry>(g: G, m: THREE.Material, hueso: THREE.Object3D, pos: THREE.Vector3, rot?: THREE.Euler, sombra = sombras) => {
    geos.push(g)
    const o = new THREE.Mesh(g, m)
    o.position.copy(pos)
    if (rot) o.rotation.copy(rot)
    o.castShadow = sombra
    escalaMundo(modelo, o)
    hueso.attach(o)
    return o
  }
  const blanco = new THREE.MeshStandardMaterial({ color: TRAJE.blanco, roughness: 0.45, metalness: 0.05 })
  const metal = new THREE.MeshStandardMaterial({ color: '#D5DCE6', roughness: 0.22, metalness: 0.95 })
  const oscuro = new THREE.MeshStandardMaterial({ color: '#141C29', roughness: 0.4, metalness: 0.4 })
  const goma = new THREE.MeshStandardMaterial({ color: '#2A3442', roughness: 0.85 })
  const luz = new THREE.MeshBasicMaterial({ color: acento })
  const naranja = new THREE.MeshStandardMaterial({ color: TRAJE.naranja, roughness: 0.55 })
  const visorMat = new THREE.MeshPhysicalMaterial({ color: '#1A1206', roughness: 0.06, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, emissive: '#3A2606', emissiveIntensity: 0.35 })
  mats.push(blanco, metal, oscuro, goma, luz, naranja, visorMat)

  // --- Casco: esfera blanca con visor dorado al frente y aro metálico en el cuello ---
  const R = alto * 0.86
  const centroCasco = a.clone().lerp(b, 0.5).addScaledVector(F, alto * 0.08)
  pieza(new THREE.SphereGeometry(R, 48, 32), blanco, cabeza, centroCasco)
  // visor: casquete de esfera un poco más grande, mirando al frente y ligeramente hacia abajo
  const APERTURA = Math.PI * 0.36
  pieza(new THREE.SphereGeometry(R * 1.015, 48, 24, 0, Math.PI * 2, 0, APERTURA), visorMat, cabeza, centroCasco, new THREE.Euler((frente * Math.PI) / 2 + frente * 0.12, 0, 0), false)
  const marco = pieza(new THREE.TorusGeometry(R * 1.015 * Math.sin(APERTURA), R * 0.035, 10, 64), metal, cabeza, centroCasco.clone().addScaledVector(F, R * 1.015 * Math.cos(APERTURA)).add(new THREE.Vector3(0, -R * 0.12, 0)))
  marco.rotateX(frente * 0.12)
  // luces laterales del casco
  for (const k of [-1, 1]) {
    pieza(new THREE.CylinderGeometry(R * 0.1, R * 0.1, R * 0.12, 16), oscuro, cabeza, centroCasco.clone().add(new THREE.Vector3(k * R * 0.98, R * 0.1, 0)), new THREE.Euler(0, 0, Math.PI / 2))
    pieza(new THREE.SphereGeometry(R * 0.05, 10, 8), luz, cabeza, centroCasco.clone().add(new THREE.Vector3(k * R * 1.06, R * 0.1, 0)))
  }
  // aro del cuello
  pieza(new THREE.TorusGeometry(R * 0.8, R * 0.13, 16, 56), metal, cuello, new THREE.Vector3(centroCasco.x, a.y - alto * 0.1, centroCasco.z - alto * 0.04 * frente), new THREE.Euler(Math.PI / 2, 0, 0))

  // --- Unidad de control en el pecho ---
  const yPecho = THREE.MathUtils.lerp(pPecho.y, pCuello.y, 0.15)
  const base = new THREE.Vector3(pPecho.x, yPecho, pPecho.z + (U * 0.36 + GROSOR) * frente)
  pieza(new RoundedBoxGeometry(U * 0.56, U * 0.34, U * 0.13, 4, U * 0.035), blanco, pecho, base)
  const cara = (x: number, y: number) => base.clone().add(new THREE.Vector3(x * U, y * U, 0)).addScaledVector(F, U * 0.066)
  pieza(new RoundedBoxGeometry(U * 0.26, U * 0.14, 0.006, 2, 0.003), oscuro, pecho, cara(-0.1, 0.05))
  pieza(new THREE.BoxGeometry(U * 0.18, U * 0.012, 0.008), luz, pecho, cara(-0.1, 0.07))
  pieza(new THREE.BoxGeometry(U * 0.12, U * 0.012, 0.008), luz, pecho, cara(-0.13, 0.03))
  for (let k = 0; k < 3; k++) pieza(new THREE.CylinderGeometry(U * 0.022, U * 0.022, 0.012, 14), k === 0 ? naranja : metal, pecho, cara(-0.18 + k * 0.075, -0.09), new THREE.Euler(Math.PI / 2, 0, 0))
  pieza(new RoundedBoxGeometry(U * 0.13, U * 0.13, 0.006, 2, 0.003), naranja, pecho, cara(0.15, 0.04))
  pieza(new THREE.CylinderGeometry(U * 0.035, U * 0.035, 0.014, 18), metal, pecho, cara(0.15, -0.09), new THREE.Euler(Math.PI / 2, 0, 0))

  // --- Mochila de soporte vital con tanque, correas y mangueras al pecho ---
  if (opciones.mochila !== false) {
    const atras = new THREE.Vector3(pPecho.x, THREE.MathUtils.lerp(pPecho.y, pCuello.y, 0.05), pPecho.z - (U * 0.52 + GROSOR) * frente)
    pieza(new RoundedBoxGeometry(U * 0.86, U * 1.1, U * 0.4, 5, U * 0.09), blanco, pecho, atras)
    pieza(new RoundedBoxGeometry(U * 0.62, U * 0.5, U * 0.06, 3, U * 0.025), oscuro, pecho, atras.clone().addScaledVector(F, -U * 0.2).add(new THREE.Vector3(0, -U * 0.12, 0)))
    pieza(new THREE.BoxGeometry(U * 0.3, U * 0.025, 0.006), luz, pecho, atras.clone().addScaledVector(F, -U * 0.232).add(new THREE.Vector3(0, U * 0.02, 0)))
    pieza(new THREE.CapsuleGeometry(U * 0.1, U * 0.5, 8, 20), naranja, pecho, atras.clone().add(new THREE.Vector3(0, U * 0.6, 0)), new THREE.Euler(0, 0, Math.PI / 2))
    for (const k of [-1, 1]) {
      const correa = new THREE.CatmullRomCurve3([
        atras.clone().add(new THREE.Vector3(k * U * 0.3, U * 0.5, 0)).addScaledVector(F, U * 0.18),
        new THREE.Vector3(pPecho.x + k * U * 0.3, pCuello.y + U * 0.02, pPecho.z),
        base.clone().add(new THREE.Vector3(k * U * 0.24, U * 0.2, 0)),
      ])
      pieza(new THREE.TubeGeometry(correa, 24, U * 0.032, 10), goma, pecho, new THREE.Vector3())
      // manguera de la mochila a la unidad del pecho, por el costado
      const manguera = new THREE.CatmullRomCurve3([
        atras.clone().add(new THREE.Vector3(k * U * 0.44, -U * 0.3, 0)),
        new THREE.Vector3(pPecho.x + k * (U * 0.62 + GROSOR), yPecho - U * 0.3, pPecho.z),
        base.clone().add(new THREE.Vector3(k * U * 0.34, -U * 0.14, 0)),
      ])
      pieza(new THREE.TubeGeometry(manguera, 28, U * 0.028, 10), k < 0 ? naranja : oscuro, pecho, new THREE.Vector3())
      pieza(new THREE.CylinderGeometry(U * 0.04, U * 0.04, U * 0.05, 14), metal, pecho, base.clone().add(new THREE.Vector3(k * U * 0.3, -U * 0.14, 0)), new THREE.Euler(0, 0, Math.PI / 2))
    }
  }
}

// three.js conserva la pose de mundo al usar attach; solo hace falta que el objeto esté en la escena del modelo
function escalaMundo(modelo: THREE.Object3D, o: THREE.Object3D) {
  let raiz: THREE.Object3D = modelo
  while (raiz.parent) raiz = raiz.parent
  raiz.add(o)
  o.updateMatrixWorld(true)
}
