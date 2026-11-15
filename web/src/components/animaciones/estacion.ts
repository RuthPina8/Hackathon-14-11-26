import * as THREE from 'three'
import { C } from '../../lib/paleta'

// Módulo de estación espacial para las animaciones 3D: paredes de paneles, costillas con tiras de luz,
// ventana con la Tierra y piso de cubierta. Todo se dibuja con código (sin descargar imágenes).
// Para que las líneas se vean nítidas: texturas grandes con filtrado anisótropo al máximo, y los detalles
// finos (anillos, marcos, tiras de luz) son geometría, no líneas de 1 píxel.

const RADIO = 6.5
const ALTO = 3.6

export interface Recursos { geos: THREE.BufferGeometry[]; mats: THREE.Material[]; texturas: THREE.Texture[] }

function lienzo(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return [c, c.getContext('2d')!] as const
}

// Paredes: paneles con juntas, tornillos, pasamanos y pantallas pequeñas. Devuelve color y luz propia.
function texturaPared() {
  const W = 2048, H = 1024
  const [c, g] = lienzo(W, H)
  const [ce, ge] = lienzo(W, H)
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H)
  g.fillStyle = '#1A2433'; g.fillRect(0, 0, W, H)
  const cols = 8, filas = [0, 150, 470, 790, 1024]
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < filas.length - 1; j++) {
      const x = (i * W) / cols, y = filas[j], w = W / cols, h = filas[j + 1] - y
      const tono = (i * 7 + j * 3) % 3
      g.fillStyle = ['#222E40', '#1F2A3B', '#263347'][tono]
      g.fillRect(x + 6, y + 6, w - 12, h - 12)
      // bisel claro arriba y oscuro abajo: da relieve sin líneas borrosas
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 6, y + 6, w - 12, 4)
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 6, y + h - 10, w - 12, 4)
      g.fillStyle = '#5B6B82'
      for (const [tx, ty] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]]) { g.beginPath(); g.arc(x + tx, y + ty, 4, 0, 7); g.fill() }
      if (j === 1 && i % 2 === 0) {
        // pantalla de estado
        const px = x + 46, py = y + 60, pw = w - 92, ph = 150
        g.fillStyle = '#060B16'; g.fillRect(px, py, pw, ph)
        ge.fillStyle = '#0B2A3A'; ge.fillRect(px, py, pw, ph)
        for (let k = 0; k < 5; k++) {
          const largo = pw * (0.35 + (((i + 1) * (k + 3) * 37) % 50) / 100)
          for (const cx of [g, ge]) { cx.fillStyle = k === 1 ? C.ok : C.accent; cx.fillRect(px + 14, py + 18 + k * 26, largo - 28, 8) }
        }
      }
      if (j === 2 && i % 2 === 1) {
        // bolsas de carga sujetas con correas
        g.fillStyle = '#D9DEE6'; g.fillRect(x + 40, y + 50, w - 80, h - 110)
        g.fillStyle = '#AEB7C4'; g.fillRect(x + 40, y + 50 + (h - 110) / 2 - 3, w - 80, 6)
        g.fillStyle = '#F0641E'; g.fillRect(x + 60, y + 44, 18, h - 98); g.fillRect(x + w - 78, y + 44, 18, h - 98)
      }
    }
  }
  // pasamanos
  for (const y of [455, 775]) { g.fillStyle = '#8EA3BF'; g.fillRect(0, y, W, 10); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, y + 10, W, 5) }
  // tiras de luz continuas arriba y abajo
  for (const [y, h] of [[70, 26], [960, 14]] as const) {
    g.fillStyle = '#EAF4FF'; g.fillRect(0, y, W, h)
    ge.fillStyle = '#CFE6FF'; ge.fillRect(0, y, W, h)
  }
  return [c, ce] as const
}

// Piso de cubierta: placas con juntas marcadas y un anillo de plataforma
function texturaPiso() {
  const T = 2048
  const [c, g] = lienzo(T, T)
  g.fillStyle = '#131C2A'; g.fillRect(0, 0, T, T)
  const n = 16, p = T / n
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) % 2 ? '#18222F' : '#1B2636'
    g.fillRect(i * p + 3, j * p + 3, p - 6, p - 6)
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(i * p + 3, j * p + 3, p - 6, 3)
    g.fillStyle = '#44536A'
    for (const [tx, ty] of [[12, 12], [p - 12, 12], [12, p - 12], [p - 12, p - 12]]) { g.beginPath(); g.arc(i * p + tx, j * p + ty, 3, 0, 7); g.fill() }
  }
  return c
}

// Ventana: el espacio con estrellas y la curva de la Tierra con su atmósfera
function texturaVentana() {
  const T = 1024
  const [c, g] = lienzo(T, T)
  g.fillStyle = '#02040A'; g.fillRect(0, 0, T, T)
  for (let i = 0; i < 260; i++) {
    const x = (i * 7919) % T, y = (i * 104729) % (T * 0.62), r = 0.6 + ((i * 31) % 10) / 9
    g.fillStyle = `rgba(255,255,255,${0.35 + ((i * 17) % 60) / 100})`
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
  }
  const cx = T * 0.5, cy = T * 2.05, R = T * 1.55
  const atm = g.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.06)
  atm.addColorStop(0, 'rgba(120,200,255,.95)'); atm.addColorStop(0.35, 'rgba(70,150,255,.45)'); atm.addColorStop(1, 'rgba(40,110,255,0)')
  g.fillStyle = atm; g.beginPath(); g.arc(cx, cy, R * 1.06, 0, 7); g.fill()
  const tierra = g.createRadialGradient(cx, cy - R * 0.5, R * 0.2, cx, cy, R)
  tierra.addColorStop(0, '#2B7BD6'); tierra.addColorStop(0.7, '#1553A6'); tierra.addColorStop(1, '#0B2F6B')
  g.fillStyle = tierra; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill()
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip()
  // continentes y nubes simples
  g.fillStyle = 'rgba(58,128,104,.5)'
  for (const [x, y, rx, ry, a] of [[300, 760, 190, 70, -0.2], [690, 830, 230, 90, 0.25], [520, 960, 160, 60, 0]]) { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill() }
  g.fillStyle = 'rgba(255,255,255,.3)'
  for (let i = 0; i < 18; i++) { g.beginPath(); g.ellipse((i * 163) % T, 640 + ((i * 97) % 380), 60 + ((i * 41) % 90), 9 + ((i * 13) % 12), ((i % 5) - 2) * 0.12, 0, 7); g.fill() }
  g.restore()
  return c
}

export function crearEstacion(escena: THREE.Scene, renderer: THREE.WebGLRenderer, rec: Recursos, opciones: { plataforma?: number; sombras?: boolean } = {}) {
  const { plataforma = 0.72, sombras = true } = opciones
  const aniso = renderer.capabilities.getMaxAnisotropy()
  const tex = (c: HTMLCanvasElement, repX = 1, repY = 1) => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = aniso
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repX, repY)
    rec.texturas.push(t)
    return t
  }
  const malla = (g: THREE.BufferGeometry, m: THREE.Material) => {
    rec.geos.push(g); rec.mats.push(m)
    const o = new THREE.Mesh(g, m)
    escena.add(o)
    return o
  }

  escena.fog = new THREE.Fog('#070D18', 9, 22)

  // --- Luces: cenital blanca (con sombra), relleno frío y contorno azul que entra por la ventana ---
  const hemi = new THREE.HemisphereLight('#E6F0FF', '#1A2233', 1.25)
  escena.add(hemi)
  const clave = new THREE.DirectionalLight('#FFFFFF', 2.2)
  clave.position.set(2.2, 5, 3)
  clave.castShadow = sombras
  clave.shadow.mapSize.set(2048, 2048)
  clave.shadow.camera.left = -2.5; clave.shadow.camera.right = 2.5
  clave.shadow.camera.top = 2.5; clave.shadow.camera.bottom = -2.5
  clave.shadow.camera.near = 0.5; clave.shadow.camera.far = 12
  clave.shadow.bias = -0.0004
  clave.shadow.radius = 5
  escena.add(clave)
  const contorno = new THREE.DirectionalLight('#7FC4FF', 1.9)
  contorno.position.set(-4, 2.6, -4)
  escena.add(contorno)

  // --- Paredes ---
  const [cPared, cLuz] = texturaPared()
  const pared = malla(
    new THREE.CylinderGeometry(RADIO, RADIO, ALTO, 96, 1, true),
    new THREE.MeshStandardMaterial({ map: tex(cPared, 4, 1), emissiveMap: tex(cLuz, 4, 1), emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.7, metalness: 0.25, side: THREE.BackSide }),
  )
  pared.position.y = ALTO / 2

  // --- Techo y piso ---
  const techo = malla(new THREE.CircleGeometry(RADIO, 96), new THREE.MeshStandardMaterial({ color: '#141C29', roughness: 0.8, metalness: 0.2 }))
  techo.rotation.x = Math.PI / 2
  techo.position.y = ALTO
  const piso = malla(new THREE.CircleGeometry(RADIO, 96), new THREE.MeshStandardMaterial({ map: tex(texturaPiso(), 2.5, 2.5), roughness: 0.75, metalness: 0.2 }))
  piso.rotation.x = -Math.PI / 2
  piso.receiveShadow = true

  // --- Costillas del módulo con tira de luz, solo del lado lejano a las cámaras ---
  const matCostilla = new THREE.MeshStandardMaterial({ color: '#2C3A50', roughness: 0.45, metalness: 0.6 })
  const matLuz = new THREE.MeshBasicMaterial({ color: '#D9ECFF' })
  rec.mats.push(matCostilla, matLuz)
  const geoCostilla = new THREE.BoxGeometry(0.34, ALTO, 0.3)
  const geoLuz = new THREE.BoxGeometry(0.07, ALTO * 0.8, 0.02)
  rec.geos.push(geoCostilla, geoLuz)
  for (let k = 0; k < 9; k++) {
    const ang = Math.PI * (0.62 + k * 0.158) // de ~110° a ~340°: detrás del astronauta visto desde las cámaras
    if (Math.abs(ang - Math.PI * 1.25) < 0.12) continue // hueco para la ventana
    const grupo = new THREE.Group()
    const costilla = new THREE.Mesh(geoCostilla, matCostilla)
    const luz = new THREE.Mesh(geoLuz, matLuz)
    luz.position.z = 0.16
    grupo.add(costilla, luz)
    grupo.position.set(Math.cos(ang) * (RADIO - 0.16), ALTO / 2, Math.sin(ang) * (RADIO - 0.16))
    grupo.lookAt(0, ALTO / 2, 0)
    escena.add(grupo)
  }

  // --- Ventana con la Tierra ---
  const angV = Math.PI * 1.25
  const ventana = new THREE.Group()
  const texV = tex(texturaVentana())
  texV.wrapS = texV.wrapT = THREE.ClampToEdgeWrapping
  const vidrio = new THREE.Mesh(new THREE.CircleGeometry(1.05, 64), new THREE.MeshBasicMaterial({ map: texV, fog: false }))
  const marco = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.09, 16, 72), new THREE.MeshStandardMaterial({ color: '#C9D1DC', roughness: 0.3, metalness: 0.8 }))
  const marcoLuz = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.015, 8, 72), new THREE.MeshBasicMaterial({ color: C.accent }))
  for (const m of [vidrio, marco, marcoLuz]) { rec.geos.push(m.geometry); rec.mats.push(m.material as THREE.Material) }
  ventana.add(vidrio, marco, marcoLuz)
  ventana.position.set(Math.cos(angV) * (RADIO - 0.12), 1.75, Math.sin(angV) * (RADIO - 0.12))
  ventana.lookAt(0, 1.75, 0)
  escena.add(ventana)
  const luzVentana = new THREE.PointLight('#5FA8FF', 6, 9, 2)
  luzVentana.position.copy(ventana.position).multiplyScalar(0.8).setY(1.8)
  escena.add(luzVentana)

  // --- Plataforma bajo el astronauta: anillos de geometría (nítidos a cualquier distancia) ---
  if (plataforma > 0) {
    const base = malla(new THREE.CylinderGeometry(plataforma, plataforma + 0.04, 0.02, 96), new THREE.MeshStandardMaterial({ color: '#1A2433', roughness: 0.7, metalness: 0.25 }))
    base.position.y = 0.01
    base.receiveShadow = true
    for (const [r, grosor, color] of [[plataforma - 0.03, 0.012, C.accent], [plataforma + 0.14, 0.006, C.accentLine]] as const) {
      const anillo = malla(new THREE.RingGeometry(r - grosor, r + grosor, 128), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
      anillo.rotation.x = -Math.PI / 2
      anillo.position.y = r < plataforma ? 0.022 : 0.003
    }
  }

  return {
    alturaPiso: plataforma > 0 ? 0.02 : 0,
    luces: { hemi, clave, contorno, ventana: luzVentana },
    // la Tierra gira despacio en la ventana
    animar(t: number) { vidrio.rotation.z = Math.sin(t * 0.05) * 0.08 },
  }
}
