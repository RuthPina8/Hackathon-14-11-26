// Paleta central de AstroHealth. Una sola fuente de verdad para los colores:
// - En clases de Tailwind se usan los mismos nombres (text-muted, bg-warn-bg...), definidos en index.css @theme.
// - En código (estilos en línea, three.js, canvas) se importa C desde aquí.
// Cambiar un color = cambiarlo aquí y en index.css, en ningún otro archivo.
//
// Regla de significado (auditoría UX):
//   ámbar (warn)  -> SOLO "atención"
//   morado (exp)  -> experimental
//   violeta (demo)-> modo demo
//   gris (sim)    -> dato simulado o de ejemplo
export const C = {
  bg: '#070B14',
  void: '#04070E',
  deep: '#0A0F1B',
  panel: '#0E1422',
  raised: '#121B2E',
  hover: '#111A2C',
  sel: '#15233B',
  track: '#22314F',
  input: '#080C16',
  line: '#1C2740',
  line2: '#2F3F60',
  line3: '#46536F',

  text: '#E8ECF4',
  subtle: '#C5CEDF',
  muted: '#A3AEC4',
  faint: '#93A0B8',
  none: '#8A9BB8', // "no data": antes #5C7896 (contraste 4.1), ahora pasa 6:1 sobre el panel

  accent: '#5CC8F5',
  accentSoft: '#8AD9F8',
  accentBg: '#0B2636',
  accentLine: '#1F5A78',
  onAccent: '#04121C',

  ok: '#3DDC97',
  okSoft: '#8FF0C4',
  okBg: '#0E2A20',
  okLine: '#1E5A43',

  warn: '#F5B544',
  warnSoft: '#F5D79A',
  warnBg: '#241D0D',
  warnLine: '#5C4A1C',

  crit: '#FF6B7A',
  critSoft: '#FFB8BF',
  critBg: '#2A1218',
  critLine: '#5A2A33',

  self: '#B7A4FF',
  exp: '#C9B6FF',
  expBg: '#231B3D',
  demo: '#C084FC',
  demoBg: '#2A1840',
  demoLine: '#5B3A85',

  holoLine: '#1C2E4A',
  holoBg: '#060B16',
} as const

export type ColorPaleta = keyof typeof C
