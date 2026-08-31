import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Empleado, Rol, Usuario } from '@/types/api'

export const usuariosQuery = queryOptions({
  queryKey: ['auth', 'usuarios'],
  queryFn: () => api.get<Usuario[]>('/auth/usuarios'),
})

export const rolesQuery = queryOptions({
  queryKey: ['auth', 'roles'],
  queryFn: () => api.get<Rol[]>('/auth/roles'),
})

// Empleados activos para el desplegable al crear el acceso.
export const empleadosActivosQuery = queryOptions({
  queryKey: ['auth', 'empleados', 'ACTIVO'],
  queryFn: () => api.get<Empleado[]>('/auth/empleados?estado=ACTIVO'),
})

export interface CrearUsuarioPayload {
  idEmpleado: number
  idRol: number
  email: string
  password: string
}

function useInvalidarUsuarios() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['auth', 'usuarios'] })
}

export function useCrearUsuario() {
  const invalidar = useInvalidarUsuarios()
  return useMutation({
    mutationFn: (payload: CrearUsuarioPayload) => api.post<Usuario>('/auth/usuarios', payload),
    onSuccess: invalidar,
  })
}

export function useEditarUsuario() {
  const invalidar = useInvalidarUsuarios()
  return useMutation({
    // El backend solo acepta cambiar email y/o rol (no reasignar empleado ni clave).
    mutationFn: ({ id, ...payload }: { id: number; email?: string; idRol?: number }) =>
      api.patch<Usuario>(`/auth/usuarios/${id}`, payload),
    onSuccess: invalidar,
  })
}

export function useEliminarUsuario() {
  const invalidar = useInvalidarUsuarios()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/auth/usuarios/${id}`),
    onSuccess: invalidar,
  })
}

// Reseteo por ADMIN: fija una clave nueva sin pedir la actual.
export function useResetearPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) =>
      api.patch<{ message: string }>(`/auth/usuarios/${id}/password`, { newPassword }),
  })
}

// Cambio de la propia clave: exige la actual (endpoint /me/password).
export function useCambiarMiPassword() {
  return useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      api.patch<{ message: string }>('/auth/usuarios/me/password', payload),
  })
}
