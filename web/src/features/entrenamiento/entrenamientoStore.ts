import { create } from 'zustand'
import { setModoEntrenamiento, useChequeoStore, type Paso } from '../chequeo/chequeoStore'
import { MODULOS, type ModuloId } from './modulos'

// Progreso de la misión de entrenamiento, guardado por astronauta en este dispositivo.
// - activo: hay un módulo en curso (el chequeo usa su espacio de práctica y los envíos van con practica: true)
// - completados: módulos terminados (encienden órganos e insignias en el cuerpo 3D)

type Fase = 'por_que' | 'accion' | 'resultado'

interface Entrenamiento {
  usuario: string
  completados: ModuloId[]
  activo: ModuloId | null
  fase: Fase
  pista: number
  cargar: (usuario: string) => void
  empezar: (id: ModuloId) => void
  aAccion: () => void
  siguientePista: () => void
  completar: (id: ModuloId) => void
  cerrarResultado: () => void
  salir: () => void
  reiniciar: () => void
}

const PASO: Partial<Record<ModuloId, Paso>> = { camara: 'camara', atencion: 'cognitivo', presion: 'presion', registro: 'registro' }
const clave = (u: string) => `astro_entrenamiento_progreso_${u}`

const leer = (u: string): ModuloId[] => {
  try { return JSON.parse(localStorage.getItem(clave(u)) ?? '[]') as ModuloId[] } catch { return [] }
}
const escribir = (u: string, c: ModuloId[]) => {
  try { localStorage.setItem(clave(u), JSON.stringify(c)) } catch { /* sin storage */ }
}

export const useEntrenamiento = create<Entrenamiento>()((set, get) => ({
  usuario: '',
  completados: [],
  activo: null,
  fase: 'por_que',
  pista: 0,
  cargar: (usuario) => { if (usuario !== get().usuario) set({ usuario, completados: leer(usuario) }) },
  empezar: (id) => {
    setModoEntrenamiento(true)
    // Cada módulo empieza de cero: se borra ese paso del espacio de práctica
    const paso = PASO[id]
    if (paso) useChequeoStore.getState().limpiarPaso(paso)
    set({ activo: id, fase: 'por_que', pista: 0 })
  },
  aAccion: () => set({ fase: 'accion', pista: 0 }),
  siguientePista: () => set((s) => ({ pista: s.pista + 1 })),
  completar: (id) => {
    const { activo, completados, usuario } = get()
    if (activo !== id) return
    const c = completados.includes(id) ? completados : [...completados, id]
    escribir(usuario, c)
    set({ completados: c, fase: 'resultado' })
  },
  cerrarResultado: () => { setModoEntrenamiento(false); set({ activo: null, fase: 'por_que', pista: 0 }) },
  salir: () => { setModoEntrenamiento(false); set({ activo: null, fase: 'por_que', pista: 0 }) },
  reiniciar: () => { escribir(get().usuario, []); setModoEntrenamiento(false); set({ completados: [], activo: null, fase: 'por_que', pista: 0 }) },
}))

// Cuando el paso real del chequeo se guarda durante su módulo, el módulo queda completado
let previo = useChequeoStore.getState()
useChequeoStore.subscribe((s) => {
  const { activo, fase, completar } = useEntrenamiento.getState()
  if (activo && fase === 'accion') {
    if (activo === 'camara' && s.camara && s.camara !== previo.camara) completar('camara')
    if (activo === 'atencion' && s.cognitivo && s.cognitivo !== previo.cognitivo) completar('atencion')
    if (activo === 'presion' && s.presion && s.presion !== previo.presion) completar('presion')
    if (activo === 'registro' && s.registro && s.registro !== previo.registro) completar('registro')
  }
  previo = s
})

export const listoParaMision = (c: ModuloId[]) => MODULOS.every((m) => c.includes(m.id))
