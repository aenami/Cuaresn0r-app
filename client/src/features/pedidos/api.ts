import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Comanda, ComentarioCuenta, DetalleComanda, Ficha, Pedido, Subcuenta } from '@/types/api'

export const fichasQuery = queryOptions({
  queryKey: ['fichas'],
  queryFn: () => api.get<Ficha[]>('/fichas'),
  refetchInterval: 15_000,
})

export const pedidosAbiertosQuery = queryOptions({
  queryKey: ['pedidos', 'abiertos'],
  queryFn: async () => {
    const [abiertos, enPreparacion, entregados] = await Promise.all([
      api.get<Pedido[]>('/orders?estado=ABIERTO'),
      api.get<Pedido[]>('/orders?estado=EN_PREPARACION'),
      api.get<Pedido[]>('/orders?estado=ENTREGADO'),
    ])
    return [...abiertos, ...enPreparacion, ...entregados]
  },
  refetchInterval: 15_000,
})

export function pedidoQuery(idPedido: number) {
  return queryOptions({
    queryKey: ['pedidos', idPedido],
    queryFn: () => api.get<Pedido>(`/orders/${idPedido}`),
    // Cocina/caja pueden mover estados desde otra estacion.
    refetchInterval: 10_000,
  })
}

// ---- payloads (espejo de CreateComandaDto del backend) ----

export interface PersonalizacionPayload {
  idIngrediente: number
  delta: number
}

export interface AdicionPayload {
  idProducto: number
  cantidad: number
}

export interface ComandaItemPayload {
  idProducto?: number
  idCombo?: number
  cantidad: number
  indicaciones?: string
  idSubcuenta?: number
  personalizaciones?: PersonalizacionPayload[]
  componentes?: {
    idProducto: number
    personalizaciones: PersonalizacionPayload[]
  }[]
  adiciones?: AdicionPayload[]
}

// ---- mutaciones ----

function useInvalidarPedidos() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['pedidos'] })
    void queryClient.invalidateQueries({ queryKey: ['salon'] })
    void queryClient.invalidateQueries({ queryKey: ['fichas'] })
    // Las comandas descuentan/reponen inventario.
    void queryClient.invalidateQueries({ queryKey: ['inventario'] })
  }
}

export function useAbrirPedido() {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (
      datos: {
        modalidadCuenta?: 'UNICA' | 'POR_CUENTA'
        nombresCuentas?: string[]
      } = {},
    ) => api.post<Pedido>('/orders', { tipo: 'LOCAL', ...datos }),
    onSuccess: invalidar,
  })
}

export interface NuevoDomicilio {
  nombreCliente: string
  telefonoCliente: string
  direccionCliente: string
}

// Abre un pedido de domicilio (sin ficha) con los datos de entrega del cliente.
export function useAbrirDomicilio() {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (datos: NuevoDomicilio) => api.post<Pedido>('/orders', { tipo: 'DOMICILIO', ...datos }),
    onSuccess: invalidar,
  })
}

export function useEnviarComanda(idPedido: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (items: ComandaItemPayload[]) => api.post<Comanda>(`/orders/${idPedido}/comandas`, { items }),
    onSuccess: invalidar,
  })
}

export function useDespacharComanda(idPedido: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (idComanda: number) => api.patch<Comanda>(`/orders/${idPedido}/comandas/${idComanda}/enviar`),
    onSuccess: async () => {
      invalidar()
      try {
        await fetch('http://localhost:3001/sync', { method: 'POST' })
      } catch {
        // El backend conserva la cola; el agente tambien sondea por su cuenta.
      }
    },
  })
}

export function useAsignarFicha(idPedido: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (idFicha: number) => api.patch<Pedido>(`/orders/${idPedido}/ficha`, { idFicha }),
    onSuccess: invalidar,
  })
}

export function useCrearFicha() {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (numero: string) => api.post<Ficha>('/fichas', { numero }),
    onSuccess: invalidar,
  })
}

export function useActualizarFicha() {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: number; numero?: string; activa?: boolean }) =>
      api.patch<Ficha>(`/fichas/${id}`, datos),
    onSuccess: invalidar,
  })
}

export function useEntregarComanda(idPedido: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (idComanda: number) => api.patch<Comanda>(`/orders/${idPedido}/comandas/${idComanda}/entregar`),
    onSuccess: invalidar,
  })
}

export function useEntregarItem(idPedido: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (idItem: number) => api.patch<DetalleComanda>(`/orders/${idPedido}/items/${idItem}/entregar`),
    onSuccess: invalidar,
  })
}

export function useCancelarItem(idPedido: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (idItem: number) => api.patch<DetalleComanda>(`/orders/${idPedido}/items/${idItem}/cancelar`),
    onSuccess: invalidar,
  })
}

export function useCancelarPedido(idPedido: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: () => api.patch<Pedido>(`/orders/${idPedido}/cancel`),
    onSuccess: invalidar,
  })
}

// ---- subcuentas (cuentas divididas) ----

// Crea una subcuenta adicional; el nombre es opcional (max 30 en el backend).
export function useCrearSubcuenta(idPedido: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (nombre?: string) => api.post<Subcuenta>(`/orders/${idPedido}/subcuentas`, nombre ? { nombre } : {}),
    onSuccess: invalidar,
  })
}

export function useCrearComentarioCuenta(idPedido: number, idSubcuenta: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (texto: string) =>
      api.post<ComentarioCuenta>(`/orders/${idPedido}/subcuentas/${idSubcuenta}/comentarios`, { texto }),
    onSuccess: invalidar,
  })
}

export function useResolverComentarioCuenta(idPedido: number, idSubcuenta: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: (idComentario: number) =>
      api.patch<ComentarioCuenta>(`/orders/${idPedido}/subcuentas/${idSubcuenta}/comentarios/${idComentario}/resolver`),
    onSuccess: invalidar,
  })
}

// Mueve un item completo a otra subcuenta (un header de combo arrastra a sus
// hijos; lo resuelve el backend). Falla con 409 si origen o destino ya tienen
// factura vigente.
export function useReasignarItem(idPedido: number) {
  const invalidar = useInvalidarPedidos()
  return useMutation({
    mutationFn: ({ idItem, idSubcuenta }: { idItem: number; idSubcuenta: number }) =>
      api.patch<DetalleComanda>(`/orders/${idPedido}/items/${idItem}/subcuenta`, { idSubcuenta }),
    onSuccess: invalidar,
  })
}
