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

// Traje blanco mate con articulaciones cian, igual que en Movimiento
export function vestir(modelo: THREE.Object3D, acento: string, mats: THREE.Material[], sombras: boolean) {
  const traje = new THREE.MeshStandardMaterial({ color: '#E6ECF5', roughness: 0.55, metalness: 0.08 })
  const juntas = new THREE.MeshStandardMaterial({ color: acento, roughness: 0.35, metalness: 0.2, emissive: acento, emissiveIntensity: 0.25 })
  mats.push(traje, juntas)
  modelo.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.material = m.name.includes('001') || m.name.toLowerCase().includes('joint') ? juntas : traje
    m.castShadow = sombras
    m.frustumCulled = false
  })
}
