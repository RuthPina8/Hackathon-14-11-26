import type { Organo } from '../inicio/useSalud'

// Misión de entrenamiento: cada módulo enseña una acción REAL de la app.
// Tres momentos por módulo: por qué importa -> la acción con un foco que señala dónde tocar -> el resultado explicado.
// Los datos de la NASA son los mismos que ya están documentados en el proyecto (api/docs/motor.md y la auditoría).

export type ModuloId = 'camara' | 'atencion' | 'presion' | 'registro' | 'movimiento' | 'alerta'
export type Insignia = 'presion' | 'estres' | 'movimiento'

export interface Pista {
  selector: string // a qué elemento de la pantalla real apunta el foco
  texto: string
}

export interface Modulo {
  id: ModuloId
  titulo: string
  ruta: string
  minutos: number
  enciende: Organo[]
  insignias: Insignia[]
  porQue: string
  dato: string
  pistas: Pista[]
  resultado: string
}

export const MODULOS: Modulo[] = [
  {
    id: 'camara', titulo: 'Chequeo con cámara', ruta: '/camera?paso=0', minutos: 2,
    enciende: ['corazon', 'pulmones'], insignias: [],
    porQue: 'Sin gravedad, los líquidos suben a la cabeza y el corazón trabaja distinto. Tu ritmo en reposo es la primera señal de que algo cambia.',
    dato: 'La cámara mide tu pulso por los cambios mínimos de color de la piel (rPPG), sin sensores puestos.',
    pistas: [
      { selector: '[data-tour="chequeo-iniciar"]', texto: 'Siéntate con luz de frente y toca "Iniciar medición". Mantén la cara dentro del óvalo 60 segundos.' },
      { selector: '[aria-labelledby="hr"]', texto: 'Aquí aparece tu ritmo en vivo. Si la señal es débil, la app te dice qué corregir (luz, movimiento, encuadre).' },
    ],
    resultado: 'Este es tu ritmo de hoy. Con cada chequeo el sistema aprende TU normal; una alerta sale cuando te alejas de ti mismo, no de un promedio.',
  },
  {
    id: 'atencion', titulo: 'Prueba de atención', ruta: '/camera?paso=1', minutos: 3,
    enciende: ['cerebro'], insignias: [],
    porQue: 'El cansancio y la falta de sueño hacen más lentas tus reacciones antes de que lo notes.',
    dato: 'Es la misma idea que la Reaction Self Test de la ISS: una prueba de vigilancia de 3 minutos (PVT-B).',
    pistas: [
      { selector: '[data-tour="atencion-empezar"]', texto: 'Toca "Empezar" y presiona en cuanto aparezca el estímulo. No te adelantes: los falsos arranques cuentan.' },
    ],
    resultado: 'Tu tiempo de reacción queda como referencia. Las 3 primeras sesiones son de práctica y no cuentan para tu normal.',
  },
  {
    id: 'presion', titulo: 'Presión arterial', ruta: '/camera?paso=2', minutos: 1,
    enciende: [], insignias: ['presion'],
    porQue: 'La redistribución de líquidos también mueve tu presión. Se registra a mano cuando hay brazalete.',
    dato: 'En la ISS hay un brazalete en el kit médico. La cámara NO mide presión: aquí solo aprendes cómo capturarla.',
    pistas: [
      { selector: '[data-tour="presion-guardar"]', texto: 'Si tienes brazalete, escribe tus valores. Si no, puedes saltar este paso. Toca "Guardar y seguir".' },
    ],
    resultado: 'Así se captura la presión. Arriba de 140/90 es "atención" y arriba de 180/120 es una alerta roja.',
  },
  {
    id: 'registro', titulo: 'Ánimo, sueño y síntomas', ruta: '/camera?paso=3', minutos: 2,
    enciende: ['ojos', 'inmune'], insignias: ['estres'],
    porQue: 'Lo que tú reportas es tan importante como lo que mide la cámara: el sueño, el estrés y los síntomas explican muchos cambios.',
    dato: 'La NASA programa 8.5 h de sueño, pero en la ISS el promedio fue de unas 6 h (Barger 2014). Los síntomas inmunes son de lo más común en vuelo (Crucian 2016).',
    pistas: [
      { selector: '[aria-labelledby="animo"]', texto: 'Elige cómo te sientes y mueve el deslizador de estrés.' },
      { selector: '[aria-labelledby="sueno"]', texto: 'Ajusta tu sueño con + y −. Viene precargado: solo cambia lo distinto.' },
      { selector: '[aria-labelledby="sint"]', texto: 'Marca Sí solo en lo que tengas hoy.' },
      { selector: '[data-tour="registro-guardar"]', texto: 'Toca "Guardar y ver resumen".' },
    ],
    resultado: 'Con esto se calculan tu sueño (horas y eficiencia), tu estrés y el estado inmune. Si duermes menos de 6 h tres noches seguidas, el sistema te avisa.',
  },
  {
    id: 'movimiento', titulo: 'Movimiento (ASTRA-MOVE)', ruta: '/movement', minutos: 2,
    enciende: [], insignias: ['movimiento'],
    porQue: 'En microgravedad los músculos y huesos que cargan peso se debilitan si no se ejercitan.',
    dato: 'La cámara cuenta repeticiones con tu pose corporal. Es una estimación funcional: no mide fuerza ni diagnostica.',
    pistas: [
      { selector: '[data-tour="movimiento-brazos"]', texto: 'Elige "Elevación de brazos": funciona sentado frente a la laptop.' },
      { selector: '[data-tour="movimiento-planb"]', texto: 'Si la cámara falla, aquí está el plan B con sesiones preparadas.' },
    ],
    resultado: 'Tus repeticiones quedan comparadas contra tu propia línea base. Si bajan 20% o más, Inteligencia de misión lo revisa junto con el ambiente.',
  },
  {
    id: 'alerta', titulo: 'Atender una alerta roja', ruta: '/alerts', minutos: 1,
    enciende: [], insignias: [],
    porQue: 'Hacia Marte un mensaje tarda hasta 22 minutos en llegar. Tú decides primero; Tierra apoya después.',
    dato: 'Se genera una alerta roja de práctica (dato de demo). Es la acción más importante que debes saber hacer.',
    pistas: [
      { selector: '[data-tour="alerta-que-hacer"]', texto: 'Lee qué cambió y qué hacer ahora. Marca las tareas conforme las hagas.' },
      { selector: '[data-tour="alerta-escalar"]', texto: 'Toca "Escalar a Tierra". Tienes 5 segundos para deshacer si te equivocas.' },
    ],
    resultado: 'La alerta viaja en la cola hacia Tierra con prioridad alta. Mientras siga activa, tu línea base queda congelada para no aprender lo anormal.',
  },
]

export const moduloPorId = (id: ModuloId) => MODULOS.find((m) => m.id === id)!
