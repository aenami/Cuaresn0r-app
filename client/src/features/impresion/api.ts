import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DestinoImpresion, DestinoPreparacion, ImpresionComanda, Impresora } from '@/types/api'

export const impresorasQuery = queryOptions({
  queryKey: ['impresion', 'impresoras'],
  queryFn: () => api.get<Impresora[]>('/printing/impresoras'),
})

export interface ImpresoraPayload {
  nombre: string
  destino: DestinoImpresion
  dispositivo: string
  host?: string
  anchoPapel?: number
}

function useInvalidarImpresoras() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['impresion'] })
}

export function useCrearImpresora() {
  const invalidar = useInvalidarImpresoras()
  return useMutation({
    mutationFn: (payload: ImpresoraPayload) => api.post<Impresora>('/printing/impresoras', payload),
    onSuccess: invalidar,
  })
}

export function useActualizarImpresora() {
  const invalidar = useInvalidarImpresoras()
  return useMutation({
    mutationFn: ({ id, ...payload }: Partial<ImpresoraPayload> & { id: number; activa?: boolean }) =>
      api.patch<Impresora>(`/printing/impresoras/${id}`, payload),
    onSuccess: invalidar,
  })
}

export function useEliminarImpresora() {
  const invalidar = useInvalidarImpresoras()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/printing/impresoras/${id}`),
    onSuccess: invalidar,
  })
}

export function useProbarImpresora() {
  return useMutation({
    mutationFn: (id: number) => api.post<{ ok: boolean; motivo?: string }>(`/printing/impresoras/${id}/test`),
  })
}

export function useReimprimirComanda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ idComanda, destino }: { idComanda: number; destino?: DestinoPreparacion }) =>
      api.post<ImpresionComanda[]>(
        `/printing/comandas/${idComanda}/reimprimir${destino ? `?destino=${destino}` : ''}`,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pedidos'] }),
  })
}
