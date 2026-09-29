import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { esAdministrador, esGlobal, puedeCobrar } from '@/lib/acceso'

// Espejo del payload que genera TokenService en el backend.
// idRol/rolNombre son informativos para la UI: la autoridad real es la DB,
// que el backend consulta en cada request.
export interface SesionUsuario {
  id: number
  idRol: number
  rolNombre: string
  area: 'RESTAURANTE' | 'PANADERIA'
}

interface AuthState {
  token: string | null
  usuario: SesionUsuario | null
  areaSeleccionada: 'RESTAURANTE' | 'PANADERIA'
  seleccionarArea: (area: 'RESTAURANTE' | 'PANADERIA') => void
  actualizarUsuario: (usuario: SesionUsuario) => void
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
    return { id: payload.id, idRol: payload.idRol, rolNombre: payload.rolNombre, area: payload.area ?? 'RESTAURANTE' }
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
  return useAuthStore((s) => esAdministrador(s.usuario?.rolNombre))
}

// Roles con acceso a caja/facturacion (MESERO no entra a /billing).
export function useEsCaja(): boolean {
  return useAuthStore((s) => puedeCobrar(s.usuario?.rolNombre))
}

export function useEsGlobal(): boolean { return useAuthStore((s) => esGlobal(s.usuario?.rolNombre)) }
export function useAreaTrabajo() { return useAuthStore((s) => esGlobal(s.usuario?.rolNombre) ? s.areaSeleccionada : s.usuario?.area ?? 'RESTAURANTE') }
export function areaTrabajoActual() { const s = useAuthStore.getState(); return esGlobal(s.usuario?.rolNombre) ? s.areaSeleccionada : s.usuario?.area ?? 'RESTAURANTE' }

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      usuario: null,
      areaSeleccionada: 'RESTAURANTE',
      seleccionarArea: (areaSeleccionada) => set({ areaSeleccionada }),
      actualizarUsuario: (usuario) => set({ usuario }),
      iniciarSesion: (token) => { const usuario = decodificarPayload(token); set({ token, usuario, areaSeleccionada: usuario?.area ?? 'RESTAURANTE' }) },
      logout: () => set({ token: null, usuario: null }),
    }),
    { name: 'pos-auth' },
  ),
)
