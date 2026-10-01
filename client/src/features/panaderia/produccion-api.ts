import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type FamiliaProduccion = 'PANADERIA' | 'PASTELERIA'
export type EstadoHojaProduccion = 'BORRADOR' | 'FINALIZADA'

export interface EntradaHojaProduccion {
  id: number
  articuloId: number
  nombreArticuloSnapshot: string
  tipoSnapshot: FamiliaProduccion
  cantidad: string
  precioUnitarioSnapshot: string
  subtotal: string
  fechaRegistro: string
}

export interface ResumenFamiliaProduccion {
  cantidad: string
  valor: string
}

export interface HojaProduccion {
  id: number
  fecha: string
  panaderoId: number
  estado: EstadoHojaProduccion
  fechaFinalizacion: string | null
  panadero: {
    id_usuario: number
    email_usuario: string
    empleado?: {
      nombre_empleado: string
      apellido_empleado: string
    } | null
  }
  entradas: EntradaHojaProduccion[]
  resumen: {
    PANADERIA: ResumenFamiliaProduccion
    PASTELERIA: ResumenFamiliaProduccion
    cantidadTotal: string
    valorTotal: string
  }
}

export const hojasProduccionKeys = {
  all: ['bakery', 'production-sheets'] as const,
  fecha: (fecha: string) => ['bakery', 'production-sheets', fecha] as const,
  detalle: (id: number) => ['bakery', 'production-sheets', 'detail', id] as const,
}

export const hojasProduccionFechaQuery = (fecha: string, esHoy: boolean) => queryOptions({
  queryKey: hojasProduccionKeys.fecha(fecha),
  queryFn: () => api.get<HojaProduccion[]>(`/bakery/production-sheets?date=${encodeURIComponent(fecha)}`),
  refetchInterval: esHoy ? 15_000 : false,
})

export const hojaProduccionDetalleQuery = (id: number) => queryOptions({
  queryKey: hojasProduccionKeys.detalle(id),
  queryFn: () => api.get<HojaProduccion>(`/bakery/production-sheets/${id}`),
})

export const hojasProduccionApi = {
  registrar: (body: { articuloId: number; cantidad: number; claveOperacion: string }) =>
    api.post<HojaProduccion>('/bakery/production-sheets/entries', body),
  finalizar: (id: number) => api.post<HojaProduccion>(`/bakery/production-sheets/${id}/finalize`, {}),
}
