import { create } from 'zustand'
import { mockCrew, type CrewMember } from './mockData'

// Sesión del astronauta. Se entra solo con la cara (pages/Login.tsx).
// Las firmas faciales se guardan SOLO en este dispositivo (localStorage), nunca viajan a Tierra.
// TODO Back: POST /auth/face  -> { astronaut_id, token }   y   GET /auth/me
//            todas las mediciones y alertas se filtran por astronaut_id.

export type Rol = 'astronauta' | 'comandante'

export interface SessionUser {
  id: string
  nombre: string
  rol: Rol
  cargo: string
}

const FACES_KEY = 'astro_faces_v2' // huellas de face-api (128 números); v1 eran proporciones y ya no sirven
const SESSION_KEY = 'astro_session'

function readJSON<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export const crewForLogin = mockCrew.map((c: CrewMember): SessionUser => ({
  id: c.id,
  nombre: c.nombre,
  rol: c.rol === 'Commander' ? 'comandante' : 'astronauta',
  cargo: c.rol === 'You' ? 'Mission specialist' : c.rol,
}))

interface SessionState {
  user: SessionUser | null
  faces: Record<string, number[]> // id del tripulante -> huella facial promedio (128 números)
  login: (id: string) => void
  logout: () => void
  enroll: (id: string, signature: number[]) => void
  forget: (id: string) => void
}

export const useSession = create<SessionState>((set, get) => ({
  user: readJSON<SessionUser | null>(sessionStorage, SESSION_KEY, null),
  faces: readJSON<Record<string, number[]>>(localStorage, FACES_KEY, {}),

  login: (id) => {
    const user = crewForLogin.find((c) => c.id === id) ?? null
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)) } catch { /* sin storage */ }
    set({ user })
  },
  logout: () => {
    try { sessionStorage.removeItem(SESSION_KEY) } catch { /* sin storage */ }
    set({ user: null })
  },
  enroll: (id, signature) => {
    const faces = { ...get().faces, [id]: signature }
    try { localStorage.setItem(FACES_KEY, JSON.stringify(faces)) } catch { /* sin storage */ }
    set({ faces })
  },
  forget: (id) => {
    const faces = { ...get().faces }
    delete faces[id]
    try { localStorage.setItem(FACES_KEY, JSON.stringify(faces)) } catch { /* sin storage */ }
    set({ faces })
  },
}))
