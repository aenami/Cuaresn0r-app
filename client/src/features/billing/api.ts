import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type {
  Caja,
  ConfiguracionFacturacion,
  ConfiguracionNegocio,
  CuentaPagada,
  DestinoExcedente,
  EstadoTurno,
  Factura,
  MetodoPago,
  MovimientoCaja,
  Pago,
  TipoMovimientoCaja,
  Turno,
  TurnoResumen,
} from '@/types/api'

// ---- queries ----

export const cajasQuery = queryOptions({
  queryKey: ['billing', 'cajas'],
  queryFn: () => api.get<Caja[]>('/billing/cajas'),
})

// Mi turno abierto (404 del backend = no tengo turno → null, no es error).
export const turnoActualQuery = queryOptions({
  queryKey: ['billing', 'turno-actual'],
  queryFn: async () => {
    try {
      return await api.get<TurnoResumen>('/billing/turnos/actual')
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  },
  refetchInterval: 20_000,
})

export const configFacturacionQuery = queryOptions({
  queryKey: ['billing', 'config'],
  queryFn: () => api.get<ConfiguracionFacturacion>('/billing/config'),
})

export const configHistorialQuery = queryOptions({
  queryKey: ['billing', 'config', 'historial'],
  queryFn: () => api.get<ConfiguracionFacturacion[]>('/billing/config/historial'),
})

// Datos del negocio (encabezado de la factura). null si el admin no configuro nada.
export const negocioConfigQuery = queryOptions({
  queryKey: ['billing', 'negocio'],
  queryFn: () => api.get<ConfiguracionNegocio | null>('/billing/negocio'),
})

export function turnosQuery(estado?: EstadoTurno) {
  return queryOptions({
    queryKey: ['billing', 'turnos', estado ?? 'todos'],
    queryFn: () => api.get<Turno[]>(`/billing/turnos${estado ? `?estado=${estado}` : ''}`),
  })
}

export function turnoQuery(idTurno: number) {
  return queryOptions({
    queryKey: ['billing', 'turno', idTurno],
    queryFn: () => api.get<TurnoResumen>(`/billing/turnos/${idTurno}`),
  })
}

// Facturas de un pedido (el backend filtra por la subcuenta a la que cuelgan).
export function facturasDePedidoQuery(idPedido: number) {
  return queryOptions({
    queryKey: ['billing', 'facturas', 'pedido', idPedido],
    queryFn: () => api.get<Factura[]>(`/billing/facturas?pedido=${idPedido}`),
    refetchInterval: 12_000,
  })
}

// Cuentas cobradas (facturas PAGADA) en un rango [desde, hasta] (ISO). El
// backend filtra por la fecha del pago final. La clave incluye el rango para cachear por dia.
export function cuentasPagadasQuery(desde: string, hasta: string) {
  return queryOptions({
    queryKey: ['billing', 'cuentas-pagadas', desde, hasta],
    queryFn: () =>
      api.get<CuentaPagada[]>(
        `/billing/facturas/pagadas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
      ),
    refetchInterval: 30_000,
  })
}

// ---- respuestas de mutaciones ----

export interface RespuestaPago {
  pago: Pago
  estadoFactura: Factura['estado_factura']
  saldoPendiente: string
}

export interface RespuestaAnulacion {
  factura: Factura
  devolucion: { efectivoDevuelto: string; devolverPorFuera: string }
}

// ---- invalidacion ----

function useInvalidarBilling() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: ['billing'] })
}

// Cobrar/anular puede cerrar el pedido y cambiar la disponibilidad de su ficha.
function useInvalidarCobro() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['billing'] })
    void queryClient.invalidateQueries({ queryKey: ['pedidos'] })
    void queryClient.invalidateQueries({ queryKey: ['salon'] })
  }
}

// ---- mutaciones: caja y turnos ----

export function useAbrirTurno() {
  const invalidar = useInvalidarBilling()
  return useMutation({
    mutationFn: (datos: { idCaja: number }) => api.post<Turno>('/billing/turnos', datos),
    onSuccess: invalidar,
  })
}

export function useCerrarTurno(idTurno: number) {
  const invalidar = useInvalidarBilling()
  return useMutation({
    mutationFn: (datos: { montoCierreReal: number; conteo?: Record<string, number> }) =>
      api.patch<Turno>(`/billing/turnos/${idTurno}/cerrar`, datos),
    onSuccess: invalidar,
  })
}

export function useRegistrarMovimiento() {
  const invalidar = useInvalidarBilling()
  return useMutation({
    mutationFn: (datos: { tipo: TipoMovimientoCaja; monto: number; concepto: string }) =>
      api.post<MovimientoCaja>('/billing/movimientos', datos),
    onSuccess: invalidar,
  })
}

export function useCrearCaja() {
  const invalidar = useInvalidarBilling()
  return useMutation({
    mutationFn: (nombre: string) => api.post<Caja>('/billing/cajas', { nombre }),
    onSuccess: invalidar,
  })
}

export function useRenombrarCaja(idCaja: number) {
  const invalidar = useInvalidarBilling()
  return useMutation({
    mutationFn: (nombre: string) => api.patch<Caja>(`/billing/cajas/${idCaja}`, { nombre }),
    onSuccess: invalidar,
  })
}

export function useGuardarConfig() {
  const invalidar = useInvalidarBilling()
  return useMutation({
    mutationFn: (datos: { porcentajeServicio: number; porcentajeImpuestos: number }) =>
      api.post<ConfiguracionFacturacion>('/billing/config', datos),
    onSuccess: invalidar,
  })
}

export function useGuardarNegocio() {
  const invalidar = useInvalidarBilling()
  return useMutation({
    mutationFn: (datos: { nombre: string; nit?: string; direccion?: string; telefono?: string }) =>
      api.post<ConfiguracionNegocio>('/billing/negocio', datos),
    onSuccess: invalidar,
  })
}

// Imprime la factura en la impresora termica del mostrador. Devuelve {ok} y, si
// fallo (sin impresora, sin red), el motivo — no lanza salvo error de red/HTTP.
export function useImprimirFactura() {
  return useMutation({
    mutationFn: (idFactura: number) => api.post<{ ok: boolean; motivo?: string }>(`/printing/facturas/${idFactura}`),
  })
}

// ---- mutaciones: facturas y pagos ----

// Emite la factura de una subcuenta. La propina se fija por porcentaje
// (porcentajePropina, % del subtotal; si se omite usa el de la config) o como
// monto exacto en pesos (montoServicio, que manda sobre el porcentaje). 0 = sin
// propina en cualquiera de los dos.
export function useEmitirFactura() {
  const invalidar = useInvalidarCobro()
  return useMutation({
    mutationFn: (datos: {
      idSubcuenta: number
      idsDetalle?: number[]
      porcentajePropina?: number
      montoServicio?: number
    }) => api.post<Factura>('/billing/facturas', datos),
    onSuccess: invalidar,
  })
}

export function useRegistrarPago(idFactura: number) {
  const invalidar = useInvalidarCobro()
  return useMutation({
    // excedente/destinoExcedente: solo cuando el cliente deja "el vuelto" (efectivo).
    mutationFn: (datos: {
      metodo: MetodoPago
      monto: number
      excedente?: number
      destinoExcedente?: DestinoExcedente
    }) => api.post<RespuestaPago>(`/billing/facturas/${idFactura}/pagos`, datos),
    onSuccess: invalidar,
  })
}

export function useAnularFactura(idFactura: number) {
  const invalidar = useInvalidarCobro()
  return useMutation({
    mutationFn: (motivo: string) =>
      api.patch<RespuestaAnulacion>(`/billing/facturas/${idFactura}/anular`, {
        motivo,
      }),
    onSuccess: invalidar,
  })
}
