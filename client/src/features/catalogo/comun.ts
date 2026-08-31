import { ApiError } from '@/lib/api'

export function errorATexto(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Error de conexion'
}
