import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Espejo del payload que genera TokenService en el backend.
// idRol/rolNombre son informativos para la UI: la autoridad real es la DB,
// que el backend consulta en cada request.
export interface SesionUsuario {
  id: number
  idRol: number
  rolNombre: string
}

interface AuthState {
  token: string | null
  usuario: SesionUsuario | null
  iniciarSesion: (token: string) => void
  logout: () => void
}

function decodificarBase64Url(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(base64)) as Record<string, unknown>
}

function decodificarPayload(token: string): SesionUsuario | null {
  try {
    const payload = decodificarBase64Url(token) as unknown as SesionUsuario
    return { id: payload.id, idRol: payload.idRol, rolNombre: payload.rolNombre }
  } catch {
    return null
  }
}

// El token expira a la hora (backend). Chequearlo aca evita entrar al shell
// con una sesion muerta y rebotar en el primer request.
export function tokenVigente(token: string | null): boolean {
  if (!token) return false
  try {
    const { exp } = decodificarBase64Url(token) as { exp?: number }
    return exp === undefined || exp * 1000 > Date.now()
  } catch {
    return false
  }
}

// Solo para decidir que UI mostrar: la autorizacion real la hace el backend.
export function useEsAdmin(): boolean {
  return useAuthStore((s) => s.usuario?.rolNombre === 'ADMIN')
}

// Roles con acceso a caja/facturacion (MESERO no entra a /billing).
export function useEsCaja(): boolean {
  return useAuthStore((s) => s.usuario?.rolNombre === 'ADMIN' || s.usuario?.rolNombre === 'CAJERO')
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      usuario: null,
      iniciarSesion: (token) => set({ token, usuario: decodificarPayload(token) }),
      logout: () => set({ token: null, usuario: null }),
    }),
    { name: 'pos-auth' },
  ),
)
