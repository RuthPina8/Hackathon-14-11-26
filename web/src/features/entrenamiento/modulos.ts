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
    id: 'camara', titulo: 'Camera check-up', ruta: '/camera?paso=0', minutos: 1,
    enciende: ['corazon', 'pulmones'], insignias: [],
    porQue: 'Without gravity, fluids shift toward the head and the heart works differently. Your resting heart rate is the first sign that something is changing.',
    dato: 'The camera measures your pulse from tiny changes in skin color (rPPG), with no sensors attached.',
    pistas: [
      { selector: '[data-tour="chequeo-iniciar"]', texto: 'Sit with light facing you and tap "Start reading". Keep your face inside the oval for 20 seconds.' },
      { selector: '[aria-labelledby="hr"]', texto: 'Your live heart rate shows up here. If the signal is weak, the app tells you what to fix (light, movement, framing).' },
    ],
    resultado: 'This is your heart rate today. With every check-up the system learns YOUR normal; an alert fires when you drift from yourself, not from an average.',
  },
  {
    id: 'atencion', titulo: 'Attention test', ruta: '/camera?paso=1', minutos: 1,
    enciende: ['cerebro'], insignias: [],
    porQue: 'Fatigue and lack of sleep slow your reactions before you notice.',
    dato: 'Same idea as the ISS Reaction Self Test (a vigilance test, PVT-B), with a go/no-go twist: green = react, red = hold back.',
    pistas: [
      { selector: '[data-tour="atencion-empezar"]', texto: 'Tap "Start". Tap (or press space) the instant a green meteor appears. Never tap red debris, and don’t jump the gun: false starts count.' },
    ],
    resultado: 'Your reaction time is saved as a reference. The first 3 sessions are practice and don’t count toward your normal.',
  },
  {
    id: 'presion', titulo: 'Blood pressure', ruta: '/camera?paso=2', minutos: 1,
    enciende: [], insignias: ['presion'],
    porQue: 'The fluid shift also changes your blood pressure. It’s logged by hand when a cuff is available.',
    dato: 'The ISS medical kit has a cuff. The camera does NOT measure blood pressure: here you only learn how to log it.',
    pistas: [
      { selector: '[data-tour="presion-guardar"]', texto: 'If you have a cuff, enter your values. If not, you can skip this step. Tap "Save and continue".' },
    ],
    resultado: 'That’s how blood pressure is logged. Above 140/90 is "attention" and above 180/120 is a red alert.',
  },
  {
    id: 'registro', titulo: 'Mood, sleep and symptoms', ruta: '/camera?paso=3', minutos: 2,
    enciende: ['ojos', 'inmune'], insignias: ['estres'],
    porQue: 'What you report matters as much as what the camera measures: sleep, stress and symptoms explain many changes.',
    dato: 'NASA schedules 8.5 h of sleep, but on the ISS the average was about 6 h (Barger 2014). Immune symptoms are among the most common in flight (Crucian 2016).',
    pistas: [
      { selector: '[aria-labelledby="animo"]', texto: 'Choose how you feel and move the stress slider.' },
      { selector: '[aria-labelledby="sueno"]', texto: 'Adjust your sleep with + and −. It’s prefilled: only change what’s different.' },
      { selector: '[aria-labelledby="sint"]', texto: 'Tap only what you have today. Tap again to undo.' },
      { selector: '[data-tour="registro-guardar"]', texto: 'Tap "Save and see summary".' },
    ],
    resultado: 'This is used to compute your sleep (hours and efficiency), your stress and your immune status. If you sleep less than 6 h three nights in a row, the system warns you.',
  },
  {
    id: 'movimiento', titulo: 'Movement (ASTRA-MOVE)', ruta: '/movement', minutos: 2,
    enciende: [], insignias: ['movimiento'],
    porQue: 'In microgravity, weight-bearing muscles and bones weaken if they aren’t exercised.',
    dato: 'The camera counts reps from your body pose. It’s a functional estimate: it doesn’t measure strength or diagnose.',
    pistas: [
      { selector: '[data-tour="movimiento-brazos"]', texto: 'Choose "Front arm raise": arms forward up to shoulder height, seated in front of the laptop.' },
      { selector: '[data-tour="movimiento-planb"]', texto: 'If the camera fails, here’s plan B with prepared sessions.' },
    ],
    resultado: 'Your reps are compared against your own baseline. If they drop 20% or more, Mission intelligence reviews it together with the environment.',
  },
  {
    id: 'alerta', titulo: 'Handle a red alert', ruta: '/alerts', minutos: 1,
    enciende: [], insignias: [],
    porQue: 'On the way to Mars a message takes up to 22 minutes to arrive. You decide first; Earth supports afterward.',
    dato: 'A practice red alert is created (demo data). It’s the most important action you need to know.',
    pistas: [
      { selector: '[data-tour="alerta-que-hacer"]', texto: 'Read what changed and what to do now. Check off tasks as you do them.' },
      { selector: '[data-tour="alerta-escalar"]', texto: 'Tap "Escalate to Earth". You have 5 seconds to undo if you make a mistake.' },
    ],
    resultado: 'The alert travels in the queue to Earth with high priority. While it stays active, your baseline is frozen so it doesn’t learn the abnormal.',
  },
]

export const moduloPorId = (id: ModuloId) => MODULOS.find((m) => m.id === id)!
