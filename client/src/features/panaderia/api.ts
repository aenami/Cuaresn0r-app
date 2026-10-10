import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { MetodoPago } from '@/types/api'

export type TipoArticulo = 'PANADERIA' | 'PASTELERIA' | 'EXTERNO' | 'INSUMO'
export type UnidadInventario =
  'UNIDADES' | 'kg' | 'g' | 'dg' | 'mg' | 'ml' | 'L'

export interface CategoriaPanaderia {
  id: number
  nombre: string
  activa: boolean
  fechaCreacion: string
}

export interface ArticuloPanaderia {
  id: number
  nombre: string
  tipo: TipoArticulo
  unidad: UnidadInventario
  precioVenta: string
  costoReferencia?: string | null
  existencia: string
  reservado?: string
  compartido?: boolean
  disponible?: string
  activo: boolean
  categoriaId: number | null
}

export interface ConteoPanaderia {
  valoracion?:
    import('@/features/inventario/valoracion-types').ValoracionConteo | null
  id: number
  articuloId: number
  cantidadInicial: string
  entradas: string
  ventasRegistradas: string
  transferencias: string
  mermas: string
  salidasJustificadas?: string
  consumoReceta: string
  cantidadFisica: string
  precioReferencia: string
  fechaRegistro: string
  articulo: ArticuloPanaderia
  requiereReconteo: boolean
  conciliacion: {
    salidaFisica: string
    ventaFisicaEstimada: string
    diferenciaUnidades: string
    valorDiferencia: string
  }
}

export interface EstadoConteoPanaderia {
  articulosObligatorios?: ArticuloPanaderia[]
  fecha: string
  totalArticulos: number
  faltantes: string[]
  recontar: string[]
  completo: boolean
  valorDiferencia: string
  proyeccion: {
    articuloId: number
    cantidadInicial: string | null
    entradas: string
    ventasRegistradas: string
    transferencias: string
    mermas: string
    salidasJustificadas?: string
    consumoReceta: string
  }[]
  detalle: ConteoPanaderia[]
}

export interface VentaPanaderia {
  id: number
  fecha: string
  turnoId: number
  total: string
  turno?: {
    id_turno: number
    fecha_apertura_turno: string
    fecha_cierre_turno: string | null
    caja: { nombre_caja: string }
    usuario: {
      email_usuario: string
      empleado: { nombre_empleado: string; apellido_empleado: string } | null
    }
  }
  detalles: {
    id: number
    articuloId: number
    nombreSnapshot: string
    cantidad: string
    precioUnitario: string
    subtotal: string
  }[]
  pagos: { id: number; metodo: MetodoPago; monto: string }[]
}

export interface RecetaPanaderia {
  id: number
  articuloId: number
  nombre: string
  activa: boolean
  fechaCreacion: string
  articulo: ArticuloPanaderia
  detalles: {
    id: number
    insumoId: number
    cantidadUnidad: string
    insumo: ArticuloPanaderia
  }[]
}

export const bakeryKeys = {
  all: ['bakery'] as const,
  articulos: ['bakery', 'articulos'] as const,
  conteo: ['bakery', 'conteo'] as const,
  ventas: ['bakery', 'ventas'] as const,
  recetas: ['bakery', 'recetas'] as const,
  categorias: ['bakery', 'categorias'] as const,
}

export const articulosQuery = queryOptions({
  queryKey: bakeryKeys.articulos,
  queryFn: () => api.get<ArticuloPanaderia[]>('/bakery/articulos'),
  refetchInterval: 10000,
})
export const categoriasPanaderiaQuery = queryOptions({
  queryKey: bakeryKeys.categorias,
  queryFn: () => api.get<CategoriaPanaderia[]>('/bakery/categorias'),
})
export const recetasPanaderiaQuery = queryOptions({
  queryKey: bakeryKeys.recetas,
  queryFn: () => api.get<RecetaPanaderia[]>('/bakery/recetas'),
})
export const conteoPorFechaQuery = (fecha: string, esHoy: boolean) =>
  queryOptions({
    queryKey: [...bakeryKeys.conteo, fecha] as const,
    queryFn: () =>
      api.get<EstadoConteoPanaderia>(
        `/bakery/conteo?date=${encodeURIComponent(fecha)}`,
      ),
    refetchInterval: esHoy ? 15_000 : false,
  })
export const ventasQuery = queryOptions({
  queryKey: bakeryKeys.ventas,
  queryFn: () => api.get<VentaPanaderia[]>('/bakery/ventas'),
})
export const ventasPorFechaQuery = (fecha: string) =>
  queryOptions({
    queryKey: [...bakeryKeys.ventas, fecha],
    queryFn: () =>
      api.get<VentaPanaderia[]>(
        `/bakery/ventas?date=${encodeURIComponent(fecha)}`,
      ),
  })

export const bakeryApi = {
  crearCategoria: (body: { nombre: string }) =>
    api.post<CategoriaPanaderia>('/bakery/categorias', body),
  actualizarCategoria: (
    id: number,
    body: { nombre?: string; activa?: boolean },
  ) => api.patch<CategoriaPanaderia>(`/bakery/categorias/${id}`, body),
  eliminarCategoria: (id: number) => api.delete(`/bakery/categorias/${id}`),
  crearArticulo: (body: {
    nombre: string
    tipo: TipoArticulo
    unidad: UnidadInventario
    precioVenta: number
    categoriaId?: number
    costoReferencia?: number | null
  }) => api.post<ArticuloPanaderia>('/bakery/articulos', body),
  crearReceta: (body: {
    articuloId: number
    nombre: string
    detalles: { insumoId: number; cantidadUnidad: number }[]
  }) => api.post<RecetaPanaderia>('/bakery/recetas', body),
  desactivarReceta: (id: number) =>
    api.patch(`/bakery/recetas/${id}/desactivar`),
  actualizarArticulo: (
    id: number,
    body: {
      nombre?: string
      precioVenta?: number
      activo?: boolean
      costoReferencia?: number | null
      categoriaId?: number | null
    },
  ) => api.patch<ArticuloPanaderia>(`/bakery/articulos/${id}`, body),
  entrada: (id: number, body: { cantidad: number; concepto: string }) =>
    api.post(`/bakery/articulos/${id}/entradas`, body),
  merma: (id: number, body: { cantidad: number; concepto: string }) =>
    api.post(`/bakery/articulos/${id}/mermas`, body),
  venta: (body: {
    claveOperacion: string
    lineas: { articuloId: number; cantidad: number }[]
    pagos: { metodo: MetodoPago; monto: number }[]
  }) => api.post<VentaPanaderia>('/bakery/ventas', body),
  conteo: (id: number, cantidadFisica: number) =>
    api.post(`/bakery/conteo/${id}`, { cantidadFisica }),
}
