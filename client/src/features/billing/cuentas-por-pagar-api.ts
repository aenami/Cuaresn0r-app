import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CuentaPorPagar, Proveedor } from '@/types/api'

export const proveedoresQuery = queryOptions({
  queryKey: ['billing', 'proveedores'],
  queryFn: () => api.get<Proveedor[]>('/billing/proveedores'),
})

export const cuentasPorPagarQuery = queryOptions({
  queryKey: ['billing', 'cuentas-por-pagar'],
  queryFn: () => api.get<CuentaPorPagar[]>('/billing/cuentas-por-pagar'),
  refetchInterval: 30_000,
})

function useInvalidar() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['billing'] })
    void queryClient.invalidateQueries({ queryKey: ['inventario'] })
  }
}

export function useCrearProveedor() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (datos: { nombre: string; contacto?: string; telefono?: string; nit?: string }) =>
      api.post<Proveedor>('/billing/proveedores', datos),
    onSuccess: invalidar,
  })
}

export function useCrearCuentaPorPagar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (datos: {
      idProveedor: number
      concepto: string
      documento?: string
      fechaVencimiento?: string
      montoTotal: number
      observacion?: string
      detalles?: { idIngrediente: number; cantidad: number; precioUnitario: number }[]
    }) => api.post<CuentaPorPagar>('/billing/cuentas-por-pagar', datos),
    onSuccess: invalidar,
  })
}

export function useRecibirCuentaPorPagar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (id: number) => api.patch<CuentaPorPagar>(`/billing/cuentas-por-pagar/${id}/recibir`),
    onSuccess: invalidar,
  })
}

export function usePagarCuentaPorPagar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: number; metodo: 'EFECTIVO' | 'TRANSFERENCIA'; monto: number }) =>
      api.post(`/billing/cuentas-por-pagar/${id}/pagos`, datos),
    onSuccess: invalidar,
  })
}
