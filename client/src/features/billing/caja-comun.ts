import { ApiError } from '@/lib/api'

// Helpers puros compartidos por las vistas de caja (flujo, cuentas, ajustes).
// Los componentes compartidos viven en caja-kpis.tsx.

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function errorApi(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Error de conexion'
}
