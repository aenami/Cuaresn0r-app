import { ApiError } from '@/lib/api'

// Helpers compartidos por las pestañas de nomina (directorio, asistencia,
// configuracion, propinas). Los helpers propios de una sola pestaña viven en su
// archivo.

export function errorApi(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Error de conexion'
}

export function nombreEmpleado(e: { nombre_empleado: string; apellido_empleado: string }): string {
  return `${e.apellido_empleado}, ${e.nombre_empleado}`
}

export function idCorto(id: number): string {
  return `#${String(id).padStart(3, '0')}`
}
