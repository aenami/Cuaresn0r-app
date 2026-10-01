import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ArticuloPanaderia } from './api'

export type EstadoMetaPanaderia = 'PENDIENTE' | 'PRODUCIDO' | 'NO_PRODUCIDO'

interface UsuarioMetaPanaderia {
  id_usuario: number
  email_usuario: string
}

export interface MetaProduccionPanaderia {
  id: number
  fecha: string
  articuloId: number
  nombreSnapshot: string
  tipoSnapshot: 'PANADERIA' | 'PASTELERIA'
  cantidadObjetivo: number
  estado: EstadoMetaPanaderia
  usuarioCrea: UsuarioMetaPanaderia | null
  usuarioResuelve: UsuarioMetaPanaderia | null
  fechaResolucion: string | null
  articulo: Pick<ArticuloPanaderia, 'id' | 'nombre' | 'tipo' | 'activo' | 'categoriaId'> | null
}

export const metasProduccionPanaderiaKeys = {
  all: ['bakery', 'production-goals'] as const,
  fecha: (fecha: string) => ['bakery', 'production-goals', fecha] as const,
}

export function metasProduccionPanaderiaQuery(fecha: string) {
  return queryOptions({
    queryKey: metasProduccionPanaderiaKeys.fecha(fecha),
    queryFn: () => api.get<MetaProduccionPanaderia[]>(`/bakery/production-goals?date=${encodeURIComponent(fecha)}`),
  })
}

export const metasProduccionPanaderiaApi = {
  crear: (body: { fecha: string; articuloId: number; cantidadObjetivo: number }) =>
    api.post<MetaProduccionPanaderia>('/bakery/production-goals', body),
  cambiarEstado: (id: number, estado: EstadoMetaPanaderia) =>
    api.patch<MetaProduccionPanaderia>(`/bakery/production-goals/${id}/status`, { estado }),
  eliminar: (id: number) => api.delete<void>(`/bakery/production-goals/${id}`),
}
