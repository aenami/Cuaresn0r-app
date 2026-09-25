import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { MetodoPago, TurnoResumen, Turno, TipoTurno, Producto, Ingrediente } from '@/types/api'

export type TipoArticulo = 'PANADERIA' | 'EXTERNO' | 'INSUMO'
export type UnidadInventario = 'UNIDADES' | 'kg' | 'g' | 'dg' | 'mg' | 'ml' | 'L'

export interface ArticuloPanaderia {
  id: number
  nombre: string
  tipo: TipoArticulo
  unidad: UnidadInventario
  precioVenta: string
  existencia: string
  activo: boolean
}

export interface ConteoPanaderia {
  id: number
  articuloId: number
  cantidadInicial: string
  entradas: string
  ventasRegistradas: string
  transferencias: string
  mermas: string
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
  fecha: string
  totalArticulos: number
  faltantes: string[]
  recontar: string[]
  completo: boolean
  valorDiferencia: string
  proyeccion: {
    articuloId: number
    cantidadInicial: string
    entradas: string
    ventasRegistradas: string
    transferencias: string
    mermas: string
    consumoReceta: string
  }[]
  detalle: ConteoPanaderia[]
}

export interface VentaPanaderia {
  id: number
  fecha: string
  turnoId: number
  total: string
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

export interface TransferenciaPanaderia {
  id: number
  cantidad: string
  precioUnitario: string
  montoTotal: string
  concepto: string
  fechaSalida: string
  fechaRecepcion: string | null
  fechaPago: string | null
  articulo: ArticuloPanaderia
  producto: Producto | null
  ingrediente: Ingrediente | null
  cuentaPorPagar: {
    id_cuentaPorPagar: number
    pagos: {
      id_pagoCuentaPorPagar: number
      monto_pagoCuentaPorPagar: string
      metodo_pagoCuentaPorPagar: MetodoPago
    }[]
  } | null
  pagos: { pagoCuentaPorPagarId: number; monto: string }[]
}

export interface CajaPanaderia {
  id_caja: number
  nombre_caja: string
  turnos: { id_turno: number }[]
}

export interface RecetaPanaderia {
  id: number
  articuloId: number
  nombre: string
  activa: boolean
  fechaCreacion: string
  articulo: ArticuloPanaderia
  detalles: { id: number; insumoId: number; cantidadUnidad: string; insumo: ArticuloPanaderia }[]
}

export interface TransferenciaRestaurantePanaderia {
  id: number
  ingredienteId: number
  articuloDestinoId: number
  cantidad: string
  precioUnitario: string
  montoTotal: string
  concepto: string
  fechaSalida: string
  fechaRecepcion: string | null
  fechaPago: string | null
  fechaConfirmacionIngreso: string | null
  metodoPago: MetodoPago | null
  ingrediente: Ingrediente
  articuloDestino: ArticuloPanaderia
}

export const bakeryKeys = {
  all: ['bakery'] as const,
  articulos: ['bakery', 'articulos'] as const,
  conteo: ['bakery', 'conteo'] as const,
  ventas: ['bakery', 'ventas'] as const,
  transferencias: ['bakery', 'transferencias'] as const,
  transferenciasRestaurante: ['bakery', 'transferencias-restaurante'] as const,
  cajas: ['bakery', 'cajas'] as const,
  turno: ['bakery', 'turno'] as const,
  historial: ['bakery', 'historial'] as const,
  recetas: ['bakery', 'recetas'] as const,
}

export const articulosQuery = queryOptions({
  queryKey: bakeryKeys.articulos,
  queryFn: () => api.get<ArticuloPanaderia[]>('/bakery/articulos'),
})
export const recetasPanaderiaQuery = queryOptions({
  queryKey: bakeryKeys.recetas,
  queryFn: () => api.get<RecetaPanaderia[]>('/bakery/recetas'),
})
export const conteoQuery = queryOptions({
  queryKey: bakeryKeys.conteo,
  queryFn: () => api.get<EstadoConteoPanaderia>('/bakery/conteo'),
  refetchInterval: 15_000,
})
export const ventasQuery = queryOptions({
  queryKey: bakeryKeys.ventas,
  queryFn: () => api.get<VentaPanaderia[]>('/bakery/ventas'),
})
export const transferenciasQuery = queryOptions({
  queryKey: bakeryKeys.transferencias,
  queryFn: () => api.get<TransferenciaPanaderia[]>('/bakery/transferencias'),
})
export const transferenciasRestauranteQuery = queryOptions({
  queryKey: bakeryKeys.transferenciasRestaurante,
  queryFn: () => api.get<TransferenciaRestaurantePanaderia[]>('/interarea/restaurante-panaderia'),
})
export const cajasPanaderiaQuery = queryOptions({
  queryKey: bakeryKeys.cajas,
  queryFn: () => api.get<CajaPanaderia[]>('/bakery/cajas'),
})
export const turnoPanaderiaQuery = queryOptions({
  queryKey: bakeryKeys.turno,
  queryFn: async () => {
    try { return await api.get<TurnoResumen>('/billing/turnos/actual?area=PANADERIA') }
    catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 404) return null
      throw error
    }
  },
  refetchInterval: 15_000,
})
export const historialPanaderiaQuery = queryOptions({
  queryKey: bakeryKeys.historial,
  queryFn: () => api.get<Turno[]>('/billing/turnos?area=PANADERIA&estado=CERRADO'),
})

export const bakeryApi = {
  crearArticulo: (body: { nombre: string; tipo: TipoArticulo; unidad: UnidadInventario; precioVenta: number }) => api.post<ArticuloPanaderia>('/bakery/articulos', body),
  crearReceta: (body: { articuloId: number; nombre: string; detalles: { insumoId: number; cantidadUnidad: number }[] }) => api.post<RecetaPanaderia>('/bakery/recetas', body),
  desactivarReceta: (id: number) => api.patch(`/bakery/recetas/${id}/desactivar`),
  actualizarArticulo: (id: number, body: { nombre?: string; precioVenta?: number; activo?: boolean }) => api.patch<ArticuloPanaderia>(`/bakery/articulos/${id}`, body),
  entrada: (id: number, body: { cantidad: number; concepto: string }) => api.post(`/bakery/articulos/${id}/entradas`, body),
  merma: (id: number, body: { cantidad: number; concepto: string }) => api.post(`/bakery/articulos/${id}/mermas`, body),
  venta: (body: { claveOperacion: string; lineas: { articuloId: number; cantidad: number }[]; pagos: { metodo: MetodoPago; monto: number }[] }) => api.post<VentaPanaderia>('/bakery/ventas', body),
  conteo: (id: number, cantidadFisica: number) => api.post(`/bakery/conteo/${id}`, { cantidadFisica }),
  crearCaja: (nombre: string) => api.post<CajaPanaderia>('/bakery/cajas', { nombre }),
  abrirTurno: (idCaja: number, tipo: TipoTurno) => api.post('/billing/turnos', { idCaja, tipo }),
  cerrarTurno: (id: number, montoCierreReal: number) => api.patch(`/billing/turnos/${id}/cerrar`, { montoCierreReal }),
  movimientoCaja: (body: { tipo: 'INGRESO' | 'EGRESO'; monto: number; concepto: string }) => api.post('/billing/movimientos', body),
  crearTransferencia: (body: { claveOperacion: string; articuloId: number; cantidad: number; precioUnitario: number; concepto: string; productoDestinoId?: number; ingredienteDestinoId?: number }) => api.post<TransferenciaPanaderia>('/bakery/transferencias', body),
  recibirTransferencia: (id: number) => api.post(`/bakery/transferencias/${id}/recibir`),
  confirmarIngreso: (id: number, pagoCuentaPorPagarId: number) => api.post(`/bakery/transferencias/${id}/confirmar-ingreso`, { pagoCuentaPorPagarId }),
  crearTransferenciaRestaurante: (body: { claveOperacion: string; ingredienteId: number; articuloDestinoId: number; cantidad: number; precioUnitario: number; concepto: string }) => api.post('/interarea/restaurante-panaderia', body),
  recibirTransferenciaRestaurante: (id: number) => api.post(`/interarea/restaurante-panaderia/${id}/recibir`),
  pagarTransferenciaRestaurante: (id: number, metodo: 'EFECTIVO' | 'TRANSFERENCIA') => api.post(`/interarea/restaurante-panaderia/${id}/pagar`, { metodo }),
  confirmarIngresoRestaurante: (id: number) => api.post(`/interarea/restaurante-panaderia/${id}/confirmar-ingreso`),
}
