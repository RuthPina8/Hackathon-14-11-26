// Abre la cámara física de la compu, saltando cámaras virtuales (DroidCam, OBS, etc.)
// que Windows a veces pone por defecto y dejan el video en negro
const VIRTUALES = /droidcam|obs|virtual|manycam|snap camera|xsplit|iriun|epoccam|camo/i

export async function abrirCamaraReal(ancho = 640, alto = 480): Promise<MediaStream> {
  // Primero pedimos permiso para que el navegador nos diga los nombres de las cámaras
  const permiso = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  const actual = permiso.getVideoTracks()[0]?.label ?? ''

  const dispositivos = await navigator.mediaDevices.enumerateDevices()
  const camaras = dispositivos.filter((d) => d.kind === 'videoinput')
  const real = camaras.find((c) => !VIRTUALES.test(c.label))

  // Si la que abrió ya es real (o no hay otra), nos quedamos con esa
  if (!real || !VIRTUALES.test(actual)) return permiso

  permiso.getTracks().forEach((t) => t.stop())
  return navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: real.deviceId }, width: ancho, height: alto },
    audio: false,
  })
}
