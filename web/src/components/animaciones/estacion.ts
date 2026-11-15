import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { C } from '../../lib/paleta'
import { crearHaz } from './utileria'

// Módulo de estación espacial para las animaciones 3D: paredes de paneles, costillas con tiras de luz,
// ventana con la Tierra y piso de cubierta. Todo se dibuja con código (sin descargar imágenes).
// Para que las líneas se vean nítidas: texturas grandes con filtrado anisótropo al máximo, y los detalles
// finos (anillos, marcos, tiras de luz) son geometría, no líneas de 1 píxel.

const RADIO = 6.5
export const ENTORNO = 0.55 // intensidad de los reflejos de entorno
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

  // Reflejos de entorno: los metales, el visor y el piso reflejan un cuarto iluminado (viene con three.js).
  // Es lo que hace que los materiales se vean reales y no como plastilina plana.
  const pmrem = new THREE.PMREMGenerator(renderer)
  const cuarto = new RoomEnvironment()
  const entorno = pmrem.fromScene(cuarto, 0.04).texture
  cuarto.dispose()
  pmrem.dispose()
  rec.texturas.push(entorno)
  escena.environment = entorno
  escena.environmentIntensity = ENTORNO

  // --- Luces: cenital blanca (con sombra), relleno frío y contorno azul que entra por la ventana ---
  const hemi = new THREE.HemisphereLight('#E6F0FF', '#1A2233', 0.75)
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

  // --- Ventanas al espacio: la Tierra gira, con nubes, atmósfera, línea de día y noche, y estrellas ---
  // Todo se calcula en el sombreador (sin imágenes). La vista se desplaza un poco con la cámara (paralaje),
  // así que se siente lejos y no pintada en la pared; el detalle es suave, como un fondo fuera de foco.
  const uVentana = { uT: { value: 0 }, uSol: { value: new THREE.Vector3(0.5, 0.45, 0.74).normalize() } }
  const matVentana = new THREE.ShaderMaterial({
    uniforms: uVentana,
    fog: false,
    vertexShader: `
      varying vec2 vUv; varying vec2 vParalaje;
      void main() {
        vUv = uv;
        vec3 camLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vParalaje = camLocal.xy / max(camLocal.z, 0.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uT; uniform vec3 uSol;
      varying vec2 vUv; varying vec2 vParalaje;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ruido(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * ruido(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        vec2 q = p - vParalaje * 0.22; // lo lejano se mueve con el observador
        // estrellas con parpadeo
        vec3 col = vec3(0.004, 0.006, 0.014);
        vec2 celda = floor(q * 46.0), dentro = fract(q * 46.0) - 0.5;
        float h = hash(celda);
        float estrella = step(0.93, h) * smoothstep(0.22, 0.0, length(dentro - (vec2(hash(celda + 3.1), hash(celda + 7.7)) - 0.5) * 0.5));
        col += estrella * (0.55 + 0.45 * sin(uT * (1.0 + h * 3.0) + h * 40.0)) * vec3(0.9, 0.95, 1.0);
        // la Tierra: un disco enorme del que solo se ve el horizonte curvo
        vec2 c = vec2(0.25, -2.42); float R = 2.3;
        vec2 s = (q - c) / R; float d = length(s);
        if (d < 1.0) {
          float z = sqrt(1.0 - d * d);
          vec3 n = vec3(s, z);
          float lon = atan(s.x, z) + uT * 0.012, lat = asin(clamp(s.y, -1.0, 1.0));
          vec2 m = vec2(lon * 2.2, lat * 2.6);
          float tierra = smoothstep(0.5, 0.62, fbm(m * 1.6 + 3.0));
          vec3 mar = mix(vec3(0.01, 0.07, 0.22), vec3(0.03, 0.2, 0.42), fbm(m * 3.0));
          vec3 suelo = mix(vec3(0.07, 0.2, 0.08), vec3(0.3, 0.24, 0.13), fbm(m * 4.0 + 9.0));
          vec3 sup = mix(mar, suelo, tierra);
          float nubes = smoothstep(0.5, 0.78, fbm(m * 2.4 + vec2(uT * 0.02, 5.0)));
          sup = mix(sup, vec3(0.95), nubes * 0.85);
          float dia = smoothstep(-0.15, 0.35, dot(n, uSol));
          vec3 noche = vec3(0.9, 0.7, 0.35) * step(0.72, fbm(m * 9.0)) * tierra * 0.35; // luces de ciudades
          sup = sup * (0.03 + dia) + noche * (1.0 - dia);
          sup += vec3(1.0, 0.95, 0.8) * pow(max(dot(reflect(-uSol, n), vec3(0, 0, 1)), 0.0), 60.0) * (1.0 - tierra) * dia * 0.6; // brillo del sol en el mar
          sup += vec3(0.25, 0.55, 1.0) * pow(1.0 - z, 3.0) * (0.25 + dia); // atmósfera en el borde
          col = sup;
        }
        // halo de la atmósfera por fuera del horizonte
        col += vec3(0.2, 0.5, 1.0) * exp(-max(d - 1.0, 0.0) * 55.0) * 0.9 * step(1.0, d);
        // vidrio: reflejo diagonal tenue y oscurecimiento hacia el marco
        col += vec3(0.5, 0.7, 1.0) * 0.045 * smoothstep(0.06, 0.0, abs(p.x * 0.7 + p.y - 0.35));
        col *= smoothstep(1.02, 0.86, length(p));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  rec.mats.push(matVentana)
  const matMarco = new THREE.MeshStandardMaterial({ color: '#C9D1DC', roughness: 0.3, metalness: 0.8 })
  const matMarcoLuz = new THREE.MeshBasicMaterial({ color: C.accent })
  rec.mats.push(matMarco, matMarcoLuz)
  const crearVentana = (ang: number, radio: number, y: number) => {
    const grupo = new THREE.Group()
    const piezas: THREE.Mesh[] = [
      new THREE.Mesh(new THREE.CircleGeometry(radio, 64), matVentana),
      new THREE.Mesh(new THREE.TorusGeometry(radio * 1.03, radio * 0.085, 16, 72), matMarco),
      new THREE.Mesh(new THREE.TorusGeometry(radio * 1.15, 0.012, 8, 72), matMarcoLuz),
    ]
    for (let k = 0; k < 8; k++) {
      // tornillos del marco
      const t = new THREE.Mesh(new THREE.CylinderGeometry(radio * 0.03, radio * 0.03, 0.03, 10), matMarco)
      t.position.set(Math.cos((k / 8) * Math.PI * 2) * radio * 1.03, Math.sin((k / 8) * Math.PI * 2) * radio * 1.03, radio * 0.08)
      t.rotation.x = Math.PI / 2
      piezas.push(t)
    }
    for (const m of piezas) { rec.geos.push(m.geometry); grupo.add(m) }
    grupo.position.set(Math.cos(ang) * (RADIO - 0.12), y, Math.sin(ang) * (RADIO - 0.12))
    grupo.lookAt(0, y, 0)
    escena.add(grupo)
    return grupo
  }
  const angV = Math.PI * 1.25
  const ventana = crearVentana(angV, 1.05, 1.75)
  crearVentana(Math.PI * 1.02, 0.5, 2.05) // ojos de buey más chicos entre las costillas
  crearVentana(Math.PI * 1.645, 0.5, 2.05)
  const luzVentana = new THREE.PointLight('#5FA8FF', 6, 9, 2)
  luzVentana.position.copy(ventana.position).multiplyScalar(0.8).setY(1.8)
  escena.add(luzVentana)

  // --- Sol: rayos que entran por la ventana grande, su mancha en el piso y una luz cálida ---
  const dentro = new THREE.Vector3(-Math.cos(angV), 0, -Math.sin(angV)) // de la ventana hacia el centro
  const origenSol = ventana.position.clone().addScaledVector(dentro, -3.2).add(new THREE.Vector3(0, 1.5, 0))
  const sueloSol = ventana.position.clone().addScaledVector(dentro, 3.6).setY(0)
  const rayos = crearHaz(rec, { lados: 40, color: '#FFE2B0', opacidad: 0.2, motas: 240, rayas: true })
  const largoSol = origenSol.distanceTo(sueloSol)
  const radioSol = 1.05 * (largoSol / origenSol.distanceTo(ventana.position)) * 0.8
  rayos.colocar(origenSol, sueloSol, radioSol, radioSol)
  escena.add(rayos.grupo)
  const [cMancha, gMancha] = lienzo(128, 128)
  const gradMancha = gMancha.createRadialGradient(64, 64, 4, 64, 64, 64)
  gradMancha.addColorStop(0, 'rgba(255,236,200,.9)'); gradMancha.addColorStop(0.55, 'rgba(255,225,170,.35)'); gradMancha.addColorStop(1, 'rgba(255,220,160,0)')
  gMancha.fillStyle = gradMancha; gMancha.fillRect(0, 0, 128, 128)
  const texMancha = new THREE.CanvasTexture(cMancha)
  rec.texturas.push(texMancha)
  const matMancha = new THREE.MeshBasicMaterial({ map: texMancha, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
  const mancha = malla(new THREE.CircleGeometry(1, 48), matMancha)
  mancha.rotation.x = -Math.PI / 2
  mancha.rotation.z = -Math.atan2(dentro.z, dentro.x)
  mancha.scale.set(radioSol * 2.1, radioSol * 1.25, 1)
  mancha.position.copy(sueloSol).setY(0.006)
  const sol = new THREE.DirectionalLight('#FFE3B8', 1.3)
  sol.position.copy(origenSol)
  sol.target.position.copy(sueloSol)
  escena.add(sol, sol.target)

  // --- Polvo en suspensión por toda la cabina: motas que derivan despacio y atrapan la luz ---
  const N_POLVO = 320
  const posPolvo = new Float32Array(N_POLVO * 3), basePolvo = new Float32Array(N_POLVO * 4)
  for (let i = 0; i < N_POLVO; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (RADIO - 0.6)
    basePolvo[i * 4] = Math.cos(a) * r; basePolvo[i * 4 + 1] = 0.15 + Math.random() * (ALTO - 0.4); basePolvo[i * 4 + 2] = Math.sin(a) * r; basePolvo[i * 4 + 3] = Math.random() * 100
  }
  const geoPolvo = new THREE.BufferGeometry()
  geoPolvo.setAttribute('position', new THREE.BufferAttribute(posPolvo, 3))
  const [cMota, gMota] = lienzo(48, 48)
  const gradMota = gMota.createRadialGradient(24, 24, 0, 24, 24, 24)
  gradMota.addColorStop(0, 'rgba(255,255,255,1)'); gradMota.addColorStop(0.4, 'rgba(255,255,255,.4)'); gradMota.addColorStop(1, 'rgba(255,255,255,0)')
  gMota.fillStyle = gradMota; gMota.fillRect(0, 0, 48, 48)
  const texMota = new THREE.CanvasTexture(cMota)
  rec.texturas.push(texMota)
  const matPolvo = new THREE.PointsMaterial({ color: '#DCE9FF', map: texMota, size: 0.013, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })
  rec.geos.push(geoPolvo); rec.mats.push(matPolvo)
  const polvo = new THREE.Points(geoPolvo, matPolvo)
  polvo.frustumCulled = false
  escena.add(polvo)

  // --- Consolas con telemetría en movimiento (una sola textura que se redibuja unas 6 veces por segundo) ---
  const [cCons, gCons] = lienzo(320, 200)
  const texCons = new THREE.CanvasTexture(cCons)
  texCons.colorSpace = THREE.SRGBColorSpace
  rec.texturas.push(texCons)
  const matCons = new THREE.MeshBasicMaterial({ map: texCons, toneMapped: false })
  const matCaja = new THREE.MeshStandardMaterial({ color: '#1C2636', roughness: 0.5, metalness: 0.5 })
  rec.mats.push(matCons, matCaja)
  const geoCons = new THREE.PlaneGeometry(0.86, 0.54), geoCaja = new THREE.BoxGeometry(0.96, 0.64, 0.06)
  rec.geos.push(geoCons, geoCaja)
  for (const ang of [Math.PI * 0.86, Math.PI * 1.49, Math.PI * 1.8]) {
    const grupo = new THREE.Group()
    const caja = new THREE.Mesh(geoCaja, matCaja)
    const pantalla = new THREE.Mesh(geoCons, matCons)
    pantalla.position.z = 0.032
    grupo.add(caja, pantalla)
    grupo.position.set(Math.cos(ang) * (RADIO - 0.14), 1.5, Math.sin(ang) * (RADIO - 0.14))
    grupo.lookAt(0, 1.5, 0)
    escena.add(grupo)
  }
  let ultimoDibujo = -1
  const dibujarConsola = (t: number) => {
    if (t - ultimoDibujo < 0.16) return
    ultimoDibujo = t
    const g = gCons
    g.fillStyle = '#061018'; g.fillRect(0, 0, 320, 200)
    g.strokeStyle = 'rgba(92,200,245,.18)'; g.lineWidth = 1
    for (let x = 0; x <= 320; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 200); g.stroke() }
    for (let y = 0; y <= 200; y += 25) { g.beginPath(); g.moveTo(0, y); g.lineTo(320, y); g.stroke() }
    // dos trazos que avanzan: uno tipo pulso y uno suave
    g.lineWidth = 3
    g.strokeStyle = C.ok; g.beginPath()
    for (let x = 0; x <= 320; x += 4) {
      const u = (x / 320) * 5 + t * 0.9, f = u - Math.floor(u)
      const y = 62 - (f > 0.42 && f < 0.5 ? 34 * Math.sin((f - 0.42) / 0.08 * Math.PI) : 0) + (f > 0.5 && f < 0.55 ? 12 : 0) - 5 * Math.sin(u * 6.28) * 0.3
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y)
    }
    g.stroke()
    g.strokeStyle = C.accent; g.beginPath()
    for (let x = 0; x <= 320; x += 6) { const y = 128 + 16 * Math.sin(x * 0.03 + t * 1.3) + 5 * Math.sin(x * 0.11 - t * 2.1); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y) }
    g.stroke()
    // barras de nivel
    for (let k = 0; k < 8; k++) {
      const v = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.6 + k * 0.17) + k * 1.9))
      g.fillStyle = k % 3 ? 'rgba(92,200,245,.75)' : 'rgba(61,220,151,.8)'
      g.fillRect(14 + k * 38, 192 - v * 30, 26, v * 30)
    }
    texCons.needsUpdate = true
  }

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
    // Cada cuadro: la Tierra gira, el sol sube y baja como en una órbita, el polvo deriva y las consolas
    // se actualizan. `atenuar` (0 a 1) baja el sol cuando la escena necesita oscurecer la cabina.
    animar(t: number, atenuar = 1) {
      uVentana.uT.value = t
      const a = t * 0.03
      uVentana.uSol.value.set(Math.sin(a) * 0.7, 0.45, 0.6 + 0.2 * Math.cos(a)).normalize()
      const dia = (0.55 + 0.45 * Math.sin(t * 0.09)) * atenuar
      rayos.opacidad = 0.05 * dia
      rayos.animar(t)
      matMancha.opacity = 0.22 * dia
      sol.intensity = 0.55 * dia
      for (let i = 0; i < N_POLVO; i++) {
        const f = basePolvo[i * 4 + 3]
        posPolvo[i * 3] = basePolvo[i * 4] + Math.sin(t * 0.11 + f) * 0.25
        posPolvo[i * 3 + 1] = basePolvo[i * 4 + 1] + Math.sin(t * 0.07 + f * 1.7) * 0.18
        posPolvo[i * 3 + 2] = basePolvo[i * 4 + 2] + Math.cos(t * 0.09 + f * 0.6) * 0.25
      }
      geoPolvo.attributes.position.needsUpdate = true
      dibujarConsola(t)
    },
  }
}
