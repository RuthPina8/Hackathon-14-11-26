import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Recursos } from './estacion'

// Utilería detallada para las escenas 3D: mesa, laptop, libros, lámpara de estudio y haces de luz
// volumétricos con polvo en suspensión. Cada objeto se arma con varias piezas (marcos, patas, tornillos,
// teclas, páginas) para que tenga relieve y no parezca un bloque. Todo en metros.

const redonda = (w: number, h: number, d: number, r = Math.min(w, h, d) * 0.3) => new RoundedBoxGeometry(w, h, d, 3, r)

function lienzo(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return [c, c.getContext('2d')!] as const
}

class Taller {
  rec: Recursos
  cache = new Map<string, THREE.Material>()
  constructor(rec: Recursos) { this.rec = rec }
  mat(clave: string, crear: () => THREE.Material) {
    let m = this.cache.get(clave)
    if (!m) { m = crear(); this.cache.set(clave, m); this.rec.mats.push(m) }
    return m
  }
  tex(c: HTMLCanvasElement) {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    this.rec.texturas.push(t)
    return t
  }
  pieza(g: THREE.BufferGeometry, m: THREE.Material, padre: THREE.Object3D, x = 0, y = 0, z = 0, sombra = true) {
    this.rec.geos.push(g)
    const o = new THREE.Mesh(g, m)
    o.position.set(x, y, z)
    o.castShadow = sombra
    o.receiveShadow = sombra
    padre.add(o)
    return o
  }
  metal = () => this.mat('metal', () => new THREE.MeshStandardMaterial({ color: '#AEBBCC', roughness: 0.25, metalness: 0.95 }))
  goma = () => this.mat('goma', () => new THREE.MeshStandardMaterial({ color: '#1B2230', roughness: 0.9 }))
  oscuro = () => this.mat('oscuro', () => new THREE.MeshStandardMaterial({ color: '#141C29', roughness: 0.45, metalness: 0.35 }))
}

// ---------- Mesa: cubierta con marco, faldón, patas tubulares con regatones y travesaños ----------
export function crearMesa(rec: Recursos, ancho: number, fondo: number, alto: number) {
  const t = new Taller(rec)
  const g = new THREE.Group()
  const cubierta = t.mat('cubierta', () => new THREE.MeshStandardMaterial({ color: '#31435C', roughness: 0.5, metalness: 0.3 }))
  const placa = t.mat('placa', () => new THREE.MeshStandardMaterial({ color: '#34496A', roughness: 0.65, metalness: 0.2 }))
  t.pieza(redonda(ancho, 0.03, fondo, 0.012), cubierta, g, 0, alto - 0.015, 0)
  // placa de trabajo hundida, con borde: da relieve a la cubierta
  t.pieza(redonda(ancho - 0.07, 0.006, fondo - 0.07, 0.002), placa, g, 0, alto + 0.001, 0)
  // canto metálico al frente y atrás
  for (const k of [-1, 1]) {
    const canto = t.pieza(new THREE.CylinderGeometry(0.008, 0.008, ancho - 0.04, 12), t.metal(), g, 0, alto - 0.015, k * (fondo / 2 - 0.002))
    canto.rotation.z = Math.PI / 2
  }
  // tornillos en las esquinas
  for (const kx of [-1, 1]) for (const kz of [-1, 1]) t.pieza(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12), t.metal(), g, kx * (ancho / 2 - 0.022), alto + 0.001, kz * (fondo / 2 - 0.022), false)
  // faldón
  const px = ancho / 2 - 0.05, pz = fondo / 2 - 0.05
  for (const k of [-1, 1]) {
    t.pieza(redonda(ancho - 0.1, 0.05, 0.016, 0.004), t.oscuro(), g, 0, alto - 0.055, k * pz)
    t.pieza(redonda(0.016, 0.05, fondo - 0.1, 0.004), t.oscuro(), g, k * px, alto - 0.055, 0)
  }
  // patas con regatón y casquillo
  const largo = alto - 0.03
  for (const kx of [-1, 1]) for (const kz of [-1, 1]) {
    t.pieza(new THREE.CylinderGeometry(0.019, 0.016, largo, 18), t.metal(), g, kx * px, largo / 2, kz * pz)
    t.pieza(new THREE.CylinderGeometry(0.026, 0.03, 0.02, 18), t.goma(), g, kx * px, 0.01, kz * pz)
    t.pieza(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 18), t.oscuro(), g, kx * px, largo - 0.03, kz * pz)
  }
  // travesaños laterales y uno central
  for (const k of [-1, 1]) {
    const lat = t.pieza(new THREE.CylinderGeometry(0.01, 0.01, pz * 2, 12), t.metal(), g, k * px, 0.16, 0)
    lat.rotation.x = Math.PI / 2
  }
  const centro = t.pieza(new THREE.CylinderGeometry(0.01, 0.01, px * 2, 12), t.metal(), g, 0, 0.16, 0)
  centro.rotation.z = Math.PI / 2
  return g
}

// ---------- Laptop: base con teclado y trackpad, bisagra, tapa con marco, pantalla y webcam ----------
function texturaTeclado() {
  const [c, g] = lienzo(512, 200)
  g.fillStyle = '#B9C2CF'; g.fillRect(0, 0, 512, 200)
  for (let f = 0; f < 5; f++) for (let k = 0; k < 14; k++) {
    const w = 512 / 14, h = 200 / 5
    if (f === 4 && k >= 4 && k <= 9) { if (k === 4) { g.fillStyle = '#232B38'; g.beginPath(); g.roundRect(k * w + 3, f * h + 4, w * 6 - 6, h - 8, 5); g.fill() } continue }
    g.fillStyle = '#232B38'; g.beginPath(); g.roundRect(k * w + 3, f * h + 4, w - 6, h - 8, 5); g.fill()
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(k * w + 6, f * h + 6, w - 12, 3)
  }
  return c
}
function texturaPantalla() {
  const [c, g] = lienzo(512, 320)
  const grad = g.createLinearGradient(0, 0, 0, 320)
  grad.addColorStop(0, '#0E3247'); grad.addColorStop(1, '#071826')
  g.fillStyle = grad; g.fillRect(0, 0, 512, 320)
  // vista previa de la cámara: esquinas de encuadre, silueta y barra inferior
  g.strokeStyle = '#5CC8F5'; g.lineWidth = 5
  for (const [x, y, sx, sy] of [[60, 40, 1, 1], [452, 40, -1, 1], [60, 250, 1, -1], [452, 250, -1, -1]]) { g.beginPath(); g.moveTo(x, y + sy * 34); g.lineTo(x, y); g.lineTo(x + sx * 34, y); g.stroke() }
  g.fillStyle = 'rgba(138,217,248,.55)'
  g.beginPath(); g.arc(256, 112, 30, 0, 7); g.fill()
  g.beginPath(); g.roundRect(206, 150, 100, 96, 26); g.fill()
  g.fillStyle = '#0A1320'; g.fillRect(0, 276, 512, 44)
  g.fillStyle = '#3DDC97'; g.beginPath(); g.arc(34, 298, 9, 0, 7); g.fill()
  g.fillStyle = '#C8D6E8'; g.font = '600 20px sans-serif'; g.fillText('ASTRA-MOVE · camera', 56, 305)
  return c
}

export function crearLaptop(rec: Recursos, frente: number, acento: string) {
  const t = new Taller(rec)
  const g = new THREE.Group()
  const aluminio = t.mat('aluminio', () => new THREE.MeshStandardMaterial({ color: '#C6CEDA', roughness: 0.3, metalness: 0.9 }))
  const W = 0.34, D = 0.235
  // base: la pantalla mira hacia -z·frente (hacia el astronauta); la bisagra queda del lado +z·frente
  t.pieza(redonda(W, 0.014, D, 0.006), aluminio, g, 0, 0.007, 0)
  const teclado = t.pieza(new THREE.PlaneGeometry(W - 0.05, 0.105), t.mat('teclado', () => new THREE.MeshStandardMaterial({ map: t.tex(texturaTeclado()), roughness: 0.6, metalness: 0.2 })), g, 0, 0.0146, 0.035 * frente, false)
  teclado.rotation.set(-Math.PI / 2, 0, frente > 0 ? Math.PI : 0)
  const pad = t.pieza(new THREE.PlaneGeometry(0.1, 0.06), t.mat('pad', () => new THREE.MeshStandardMaterial({ color: '#AEB7C4', roughness: 0.25, metalness: 0.6 })), g, 0, 0.0146, -0.07 * frente, false)
  pad.rotation.x = -Math.PI / 2
  for (const kx of [-1, 1]) for (const kz of [-1, 1]) t.pieza(new THREE.CylinderGeometry(0.008, 0.008, 0.003, 10), t.goma(), g, kx * (W / 2 - 0.03), -0.001, kz * (D / 2 - 0.03), false)
  // tapa
  const tapa = new THREE.Group()
  tapa.position.set(0, 0.014, (D / 2 - 0.004) * frente)
  g.add(tapa)
  const bisagra = t.pieza(new THREE.CylinderGeometry(0.007, 0.007, W - 0.06, 14), t.oscuro(), tapa, 0, 0, 0)
  bisagra.rotation.z = Math.PI / 2
  const H = 0.22
  t.pieza(redonda(W, H, 0.008, 0.004), aluminio, tapa, 0, H / 2, 0)
  const marco = t.pieza(new THREE.PlaneGeometry(W - 0.008, H - 0.008), t.mat('marco', () => new THREE.MeshStandardMaterial({ color: '#07090D', roughness: 0.2, metalness: 0.3 })), tapa, 0, H / 2, -0.0045 * frente, false)
  const pantalla = t.pieza(new THREE.PlaneGeometry(W - 0.03, H - 0.034), t.mat('pantalla', () => new THREE.MeshBasicMaterial({ map: t.tex(texturaPantalla()), toneMapped: false })), tapa, 0, H / 2 - 0.004, -0.0052 * frente, false)
  if (frente > 0) { marco.rotation.y = Math.PI; pantalla.rotation.y = Math.PI }
  // franja de acento en el dorso de la tapa
  t.pieza(new THREE.BoxGeometry(0.09, 0.006, 0.002), t.mat('acento' + acento, () => new THREE.MeshBasicMaterial({ color: acento })), tapa, 0, H / 2, 0.005 * frente, false)
  // webcam: aro y lente
  const yLente = H - 0.009
  t.pieza(new THREE.TorusGeometry(0.0055, 0.0014, 8, 20), t.metal(), tapa, 0, yLente, -0.0055 * frente, false)
  const lente = t.pieza(new THREE.SphereGeometry(0.0042, 12, 10), t.mat('lente', () => new THREE.MeshPhysicalMaterial({ color: '#0A1830', roughness: 0.05, metalness: 0.6, clearcoat: 1 })), tapa, 0, yLente, -0.0055 * frente, false)
  // brillo de la pantalla sobre la mesa y el astronauta
  const brillo = new THREE.PointLight('#7FD4FF', 0.5, 1.6, 2)
  brillo.position.set(0, H / 2, -0.12 * frente)
  tapa.add(brillo)
  return { grupo: g, tapa, lente, alturaLente: 0.014 + yLente }
}

// ---------- Libro: pastas, lomo, bloque de páginas y etiqueta ----------
function texturaPaginas() {
  const [c, g] = lienzo(64, 64)
  g.fillStyle = '#EDE7D8'; g.fillRect(0, 0, 64, 64)
  for (let y = 0; y < 64; y += 2) { g.fillStyle = y % 4 ? 'rgba(120,105,80,.22)' : 'rgba(255,255,255,.3)'; g.fillRect(0, y, 64, 1) }
  return c
}
export function crearLibro(rec: Recursos, color: string, ancho: number, grosor: number, fondo: number) {
  const t = new Taller(rec)
  const g = new THREE.Group()
  const pasta = t.mat('pasta' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.75 }))
  const hojas = t.mat('hojas', () => {
    const tx = t.tex(texturaPaginas())
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping
    tx.repeat.set(1, 6)
    return new THREE.MeshStandardMaterial({ map: tx, roughness: 0.9 })
  })
  const e = 0.006
  t.pieza(redonda(ancho, e, fondo, 0.002), pasta, g, 0, grosor / 2 - e / 2, 0)
  t.pieza(redonda(ancho, e, fondo, 0.002), pasta, g, 0, -grosor / 2 + e / 2, 0)
  t.pieza(redonda(e * 1.4, grosor, fondo, 0.003), pasta, g, -ancho / 2 + e * 0.7, 0, 0)
  t.pieza(new THREE.BoxGeometry(ancho - 0.02, grosor - e * 2, fondo - 0.014), hojas, g, 0.004, 0, 0)
  // etiqueta y filetes dorados en el lomo
  const etiqueta = t.mat('etiqueta', () => new THREE.MeshStandardMaterial({ color: '#E8EDF4', roughness: 0.6 }))
  const filete = t.mat('filete', () => new THREE.MeshStandardMaterial({ color: '#C9B27A', roughness: 0.35, metalness: 0.8 }))
  t.pieza(new THREE.BoxGeometry(0.002, grosor * 0.5, fondo * 0.34), etiqueta, g, -ancho / 2 - 0.0006, 0, 0, false)
  for (const k of [-1, 1]) t.pieza(new THREE.BoxGeometry(0.002, grosor * 0.86, 0.004), filete, g, -ancho / 2 - 0.0006, 0, k * fondo * 0.38, false)
  return g
}

// ---------- Lámpara de estudio: difusor, carcasa, horquilla, poste telescópico y trípode ----------
export function crearLampara(rec: Recursos) {
  const t = new Taller(rec)
  const g = new THREE.Group()
  const Y = 1.75
  const cabeza = new THREE.Group()
  cabeza.position.y = Y
  g.add(cabeza)
  const difusorMat = new THREE.MeshBasicMaterial({ color: '#FFF4DC' })
  rec.mats.push(difusorMat)
  t.pieza(redonda(0.56, 0.42, 0.05, 0.012), t.oscuro(), cabeza, 0, 0, 0)
  t.pieza(new THREE.PlaneGeometry(0.5, 0.36), difusorMat, cabeza, 0, 0, 0.0262, false)
  // rejilla del difusor: da relieve y evita que se vea como un rectángulo plano
  for (let k = -3; k <= 3; k++) t.pieza(new THREE.BoxGeometry(0.004, 0.36, 0.006), t.oscuro(), cabeza, k * 0.0714, 0, 0.029, false)
  for (let k = -2; k <= 2; k++) t.pieza(new THREE.BoxGeometry(0.5, 0.004, 0.006), t.oscuro(), cabeza, 0, k * 0.072, 0.029, false)
  // carcasa trasera con aletas de enfriamiento
  const carcasa = t.pieza(new THREE.CylinderGeometry(0.07, 0.24, 0.14, 4), t.oscuro(), cabeza, 0, 0, -0.095)
  carcasa.rotation.set(Math.PI / 2, Math.PI / 4, 0)
  for (let k = -2; k <= 2; k++) t.pieza(new THREE.BoxGeometry(0.1, 0.004, 0.05), t.metal(), cabeza, 0, k * 0.018, -0.19)
  // horquilla y perillas
  for (const k of [-1, 1]) {
    t.pieza(redonda(0.012, 0.2, 0.03, 0.004), t.metal(), cabeza, k * 0.295, -0.08, -0.01)
    const perilla = t.pieza(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 16), t.goma(), cabeza, k * 0.312, 0, -0.01)
    perilla.rotation.z = Math.PI / 2
  }
  t.pieza(redonda(0.6, 0.012, 0.03, 0.004), t.metal(), cabeza, 0, -0.18, -0.01)
  // poste telescópico
  t.pieza(new THREE.CylinderGeometry(0.011, 0.011, 0.75, 14), t.metal(), g, 0, Y - 0.18 - 0.375, -0.01)
  t.pieza(new THREE.CylinderGeometry(0.016, 0.016, 0.75, 14), t.oscuro(), g, 0, 0.82 - 0.2, -0.01)
  t.pieza(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 14), t.goma(), g, 0, 1.0, -0.01)
  // trípode
  const cubo = 0.36
  t.pieza(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 14), t.oscuro(), g, 0, cubo, -0.01)
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2 + Math.PI / 6
    const pie = new THREE.Vector3(Math.cos(ang) * 0.34, 0.012, Math.sin(ang) * 0.34 - 0.01)
    const arriba = new THREE.Vector3(0, cubo, -0.01)
    const pata = t.pieza(new THREE.CylinderGeometry(0.009, 0.009, pie.distanceTo(arriba), 10), t.metal(), g, (pie.x + arriba.x) / 2, (pie.y + arriba.y) / 2, (pie.z + arriba.z) / 2)
    pata.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arriba.clone().sub(pie).normalize())
    t.pieza(new THREE.SphereGeometry(0.016, 12, 10), t.goma(), g, pie.x, 0.014, pie.z)
  }
  return { grupo: g, cabeza, difusorMat, altura: Y }
}

// ---------- Haz de luz volumétrico con polvo en suspensión ----------
// Un cono con sombreado propio (más denso cerca de la fuente, bordes difuminados, sin caras duras) más
// partículas de polvo que flotan dentro del haz y brillan al cruzarlo. `lados` = 4 para el campo de visión
// de una cámara (pirámide) o 40 para una lámpara (cono redondo).
function texturaMota() {
  const [c, g] = lienzo(64, 64)
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  return c
}

export function crearHaz(rec: Recursos, opciones: { lados: number; color: string; opacidad?: number; motas?: number; capa?: number; rayas?: boolean }) {
  const { lados, color, opacidad = 0.5, motas = 220, capa = 0, rayas = false } = opciones
  const grupo = new THREE.Group()
  const uniformes = { uColor: { value: new THREE.Color(color) }, uOpacidad: { value: opacidad }, uTiempo: { value: 0 }, uRayas: { value: rayas ? 1 : 0 } }
  const mat = new THREE.ShaderMaterial({
    uniforms: uniformes,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vUv = uv; vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacidad; uniform float uTiempo; uniform float uRayas;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float cerca = pow(vUv.y, 0.9);                       // más denso junto a la fuente
        float borde = pow(abs(dot(normalize(vN), normalize(vV))), 1.3); // las caras de canto se desvanecen
        float fin = smoothstep(0.0, 0.18, vUv.y);            // el final del haz se disuelve
        float bruma = 0.82 + 0.18 * sin(vP.y * 22.0 - uTiempo * 0.9 + vUv.x * 12.0); // bruma que se mueve despacio
        float a = uOpacidad * (0.22 + 0.78 * cerca) * (0.35 + 0.65 * borde) * fin * bruma;
        if (uRayas > 0.5) {
          // rayos de sol: densidad pareja a lo largo y franjas que cambian despacio alrededor del haz
          float ang = atan(vP.z, vP.x);
          float franja = 0.5 + 0.5 * sin(ang * 9.0 + 1.5 * sin(ang * 4.0 + uTiempo * 0.12));
          a = uOpacidad * (0.3 + 0.7 * borde) * fin * bruma * (0.35 + 0.65 * franja) * smoothstep(1.0, 0.7, vUv.y);
        }
        gl_FragColor = vec4(uColor, a);
      }`,
  })
  const geoCono = new THREE.ConeGeometry(1, 1, lados, 12, true)
  rec.geos.push(geoCono); rec.mats.push(mat)
  const cono = new THREE.Mesh(geoCono, mat)
  cono.renderOrder = 5
  if (lados === 4) cono.rotation.y = Math.PI / 4
  grupo.add(cono)

  // polvo: posiciones en el espacio del cono unitario (vértice en y=+0.5, base en y=-0.5)
  const pos = new Float32Array(motas * 3)
  const semilla = new Float32Array(motas * 3)
  for (let i = 0; i < motas; i++) { semilla[i * 3] = Math.random(); semilla[i * 3 + 1] = Math.random(); semilla[i * 3 + 2] = Math.random() }
  const geoPolvo = new THREE.BufferGeometry()
  geoPolvo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const tx = new THREE.CanvasTexture(texturaMota())
  rec.texturas.push(tx)
  const matPolvo = new THREE.PointsMaterial({ color, map: tx, size: 0.016, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
  rec.geos.push(geoPolvo); rec.mats.push(matPolvo)
  const polvo = new THREE.Points(geoPolvo, matPolvo)
  polvo.frustumCulled = false
  polvo.renderOrder = 6
  grupo.add(polvo)
  if (capa) grupo.traverse((o) => o.layers.set(capa))

  return {
    grupo,
    // coloca el haz: vértice en `origen`, apuntando a `destino`; `mitadX`/`mitadY` son los semianchos al final
    colocar(origen: THREE.Vector3, destino: THREE.Vector3, mitadX: number, mitadY: number) {
      const dir = destino.clone().sub(origen)
      const largo = Math.max(0.05, dir.length())
      dir.normalize()
      grupo.position.copy(origen).addScaledVector(dir, largo / 2)
      // el eje +Y del cono va de la base al vértice: debe apuntar hacia la fuente
      const arriba = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
      const x = new THREE.Vector3().crossVectors(arriba, dir).normalize()
      const z = new THREE.Vector3().crossVectors(x, dir.clone().negate()).normalize()
      grupo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, dir.clone().negate(), z))
      const k = lados === 4 ? Math.SQRT2 : 1
      grupo.scale.set(mitadX * k, largo, mitadY * k)
    },
    animar(t: number, colorNuevo?: string) {
      uniformes.uTiempo.value = t
      if (colorNuevo) { uniformes.uColor.value.set(colorNuevo); matPolvo.color.set(colorNuevo) }
      for (let i = 0; i < motas; i++) {
        // cada mota sube y deriva despacio; al salir del haz vuelve a entrar
        const a = semilla[i * 3], b = semilla[i * 3 + 1], c = semilla[i * 3 + 2]
        const h = (a + t * (0.012 + c * 0.02)) % 1 // 0 en el vértice, 1 en la base
        const ang = b * Math.PI * 2 + t * (0.08 + c * 0.1)
        const r = Math.sqrt(c) * h * 0.92 * (lados === 4 ? 0.7 : 1)
        pos[i * 3] = Math.cos(ang) * r
        pos[i * 3 + 1] = 0.5 - h
        pos[i * 3 + 2] = Math.sin(ang) * r
      }
      geoPolvo.attributes.position.needsUpdate = true
    },
    set opacidad(v: number) { uniformes.uOpacidad.value = v; matPolvo.opacity = Math.min(0.9, v * 1.8) },
  }
}

// ---------- Línea de puntos luminosa y retícula (para la puntería de la cámara) ----------
export function crearPunteria(rec: Recursos, color: string, capa = 0) {
  const grupo = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
  rec.mats.push(mat)
  const geoTramo = new THREE.CapsuleGeometry(0.005, 0.03, 4, 8)
  rec.geos.push(geoTramo)
  const N = 26
  const tramos = new THREE.InstancedMesh(geoTramo, mat, N)
  grupo.add(tramos)
  const reticula = new THREE.Group()
  for (const [r, grosor] of [[0.05, 0.004], [0.085, 0.0025]] as const) {
    const g = new THREE.TorusGeometry(r, grosor, 8, 48)
    rec.geos.push(g)
    reticula.add(new THREE.Mesh(g, mat))
  }
  for (let k = 0; k < 4; k++) {
    const g = new THREE.BoxGeometry(0.03, 0.004, 0.004)
    rec.geos.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set(Math.cos((k * Math.PI) / 2) * 0.085, Math.sin((k * Math.PI) / 2) * 0.085, 0)
    m.rotation.z = (k * Math.PI) / 2
    reticula.add(m)
  }
  grupo.add(reticula)
  if (capa) grupo.traverse((o) => o.layers.set(capa))
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), uno = new THREE.Vector3(1, 1, 1)
  return {
    grupo, mat,
    colocar(a: THREE.Vector3, b: THREE.Vector3, t: number) {
      const dir = b.clone().sub(a)
      const largo = dir.length()
      dir.normalize()
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      for (let i = 0; i < N; i++) {
        const f = ((i + (t * 0.6) % 1) / N) // los tramos avanzan hacia el objetivo
        m4.compose(a.clone().addScaledVector(dir, f * largo), q, uno)
        tramos.setMatrixAt(i, m4)
      }
      tramos.instanceMatrix.needsUpdate = true
      reticula.position.copy(b)
      reticula.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate())
      reticula.scale.setScalar(1 + 0.08 * Math.sin(t * 4))
    },
  }
}

// ---------- Silla: asiento y respaldo acolchados, estructura tubular y regatones ----------
// El origen queda en el piso, bajo el centro del asiento. El respaldo está del lado -z·frente.
export function crearSilla(rec: Recursos, altoAsiento: number, frente: number) {
  const t = new Taller(rec)
  const g = new THREE.Group()
  const tapiz = t.mat('tapiz', () => new THREE.MeshStandardMaterial({ color: '#2B3D57', roughness: 0.85 }))
  // el respaldo lleva su propio material: la guía lo ilumina en el paso de "espalda apoyada"
  const respaldoMat = new THREE.MeshStandardMaterial({ color: '#2B3D57', roughness: 0.85 })
  rec.mats.push(respaldoMat)
  const W = 0.48, D = 0.44
  // asiento: base rígida y cojín con costura central
  t.pieza(redonda(W, 0.02, D, 0.008), t.oscuro(), g, 0, altoAsiento - 0.05, 0)
  t.pieza(redonda(W - 0.02, 0.05, D - 0.02, 0.022), tapiz, g, 0, altoAsiento - 0.022, 0)
  t.pieza(new THREE.BoxGeometry(W - 0.08, 0.003, 0.004), t.oscuro(), g, 0, altoAsiento + 0.003, 0, false)
  // respaldo: marco tubular y cojín
  const zr = -(D / 2 + 0.01) * frente
  const altoR = 0.5
  for (const k of [-1, 1]) t.pieza(new THREE.CylinderGeometry(0.014, 0.014, altoR + 0.08, 14), t.metal(), g, k * (W / 2 - 0.03), altoAsiento + altoR / 2 - 0.02, zr - 0.02 * frente)
  const travesano = t.pieza(new THREE.CylinderGeometry(0.014, 0.014, W - 0.06, 14), t.metal(), g, 0, altoAsiento + altoR + 0.02, zr - 0.02 * frente)
  travesano.rotation.z = Math.PI / 2
  t.pieza(redonda(W - 0.04, altoR - 0.06, 0.045, 0.02), respaldoMat, g, 0, altoAsiento + altoR / 2 + 0.03, zr)
  for (const k of [-1, 0, 1]) t.pieza(new THREE.BoxGeometry(W - 0.1, 0.003, 0.004), t.oscuro(), g, 0, altoAsiento + altoR / 2 + 0.03 + k * 0.12, zr + 0.0235 * frente, false)
  // patas con regatón y travesaños
  const px = W / 2 - 0.035, pz = D / 2 - 0.035, largo = altoAsiento - 0.06
  for (const kx of [-1, 1]) for (const kz of [-1, 1]) {
    t.pieza(new THREE.CylinderGeometry(0.015, 0.013, largo, 14), t.metal(), g, kx * px, largo / 2, kz * pz)
    t.pieza(new THREE.CylinderGeometry(0.02, 0.023, 0.016, 14), t.goma(), g, kx * px, 0.008, kz * pz)
  }
  for (const k of [-1, 1]) {
    const lat = t.pieza(new THREE.CylinderGeometry(0.008, 0.008, pz * 2, 10), t.metal(), g, k * px, 0.14, 0)
    lat.rotation.x = Math.PI / 2
  }
  return { grupo: g, respaldoMat }
}

// ---------- Monitor de presión: cuerpo, pantalla inclinada, botones, puerto del tubo y patas ----------
// `textura` es la pantalla (la dibuja la escena). La pantalla se lee desde el lado +z del monitor.
export function crearMonitorPresion(rec: Recursos, textura: THREE.Texture, acento: string) {
  const t = new Taller(rec)
  const g = new THREE.Group()
  const carcasa = t.mat('carcasaMon', () => new THREE.MeshStandardMaterial({ color: '#E3E8EF', roughness: 0.4, metalness: 0.05 }))
  t.pieza(redonda(0.17, 0.04, 0.125, 0.012), carcasa, g, 0, 0.022, 0)
  // visera inclinada con la pantalla
  const visera = new THREE.Group()
  visera.position.set(0, 0.05, -0.012)
  visera.rotation.x = -Math.PI / 2 + 0.6
  g.add(visera)
  t.pieza(redonda(0.158, 0.1, 0.018, 0.006), carcasa, visera, 0, 0, -0.009)
  t.pieza(new THREE.PlaneGeometry(0.146, 0.088), t.mat('biselMon', () => new THREE.MeshStandardMaterial({ color: '#0A0D12', roughness: 0.2 })), visera, 0, 0, 0.0006, false)
  const pantallaMat = new THREE.MeshBasicMaterial({ map: textura, toneMapped: false })
  rec.mats.push(pantallaMat)
  t.pieza(new THREE.PlaneGeometry(0.132, 0.078), pantallaMat, visera, 0, 0, 0.0012, false)
  // botones al frente: inicio (acento) y dos de memoria
  const verde = t.mat('botonMon' + acento, () => new THREE.MeshStandardMaterial({ color: acento, roughness: 0.4, emissive: acento, emissiveIntensity: 0.25 }))
  const gris = t.mat('botonGris', () => new THREE.MeshStandardMaterial({ color: '#9AA6B6', roughness: 0.5 }))
  t.pieza(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 20), verde, g, 0.045, 0.045, 0.04)
  for (const k of [0, 1]) t.pieza(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16), gris, g, -0.02 - k * 0.028, 0.044, 0.042)
  // puerto del tubo y patas de goma
  const puerto = t.pieza(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 14), t.metal(), g, -0.088, 0.024, 0.02)
  puerto.rotation.z = Math.PI / 2
  for (const kx of [-1, 1]) for (const kz of [-1, 1]) t.pieza(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 10), t.goma(), g, kx * 0.065, 0.002, kz * 0.045, false)
  return g
}
