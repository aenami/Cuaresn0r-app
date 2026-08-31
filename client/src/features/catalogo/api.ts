import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Categoria, Combo, DestinoImpresion, Producto } from '@/types/api'

// ---- lecturas ----

export const categoriasQuery = queryOptions({
  queryKey: ['catalogo', 'categorias'],
  queryFn: () => api.get<Categoria[]>('/catalog/categories'),
})

export const productosQuery = queryOptions({
  queryKey: ['catalogo', 'productos'],
  queryFn: () => api.get<Producto[]>('/catalog/products'),
})

export const combosQuery = queryOptions({
  queryKey: ['catalogo', 'combos'],
  queryFn: () => api.get<Combo[]>('/catalog/combos'),
})

// ---- payloads de mutacion (espejo de los DTOs del backend) ----

export interface CategoriaPayload {
  name: string
  description?: string
  destino?: DestinoImpresion
  esAdicion?: boolean
}

export interface ProductoPayload {
  name: string
  price: number
  description?: string
  category?: number
  image?: string
}

export interface ComboPayload {
  nombre: string
  precio: number
  componentes: { idProducto: number; cantidad: number }[]
}

// Invalida todo el catalogo tras cualquier mutacion: los combos muestran
// productos y los productos muestran categorias.
function useInvalidarCatalogo() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['catalogo'] })
}

// ---- categorias ----

export function useCrearCategoria() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: (payload: CategoriaPayload) => api.post<Categoria>('/catalog/categories', payload),
    onSuccess: invalidar,
  })
}

export function useActualizarCategoria() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: ({ id, ...payload }: CategoriaPayload & { id: number }) =>
      api.patch<Categoria>(`/catalog/categories/${id}`, payload),
    onSuccess: invalidar,
  })
}

export function useEliminarCategoria() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/catalog/categories/${id}`),
    onSuccess: invalidar,
  })
}

// ---- productos ----

export function useCrearProducto() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: (payload: ProductoPayload) => api.post<Producto>('/catalog/products', payload),
    onSuccess: invalidar,
  })
}

export function useActualizarProducto() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: ({ id, ...payload }: Partial<ProductoPayload> & { id: number }) =>
      api.patch<Producto>(`/catalog/products/${id}`, payload),
    onSuccess: invalidar,
  })
}

// Sube una imagen de producto y devuelve su ruta relativa (`/uploads/...`),
// que luego se guarda en el campo `image` del producto.
export function subirImagenProducto(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return api.postForm<{ url: string }>('/catalog/uploads/imagen', fd)
}

export function useSubirImagenProducto() {
  return useMutation({ mutationFn: subirImagenProducto })
}

// El "delete" del backend es soft: deshabilita. /enable lo re-habilita.
export function useCambiarHabilitadoProducto() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: ({ id, habilitar }: { id: number; habilitar: boolean }) =>
      habilitar ? api.patch<Producto>(`/catalog/products/${id}/enable`) : api.delete<Producto>(`/catalog/products/${id}`),
    onSuccess: invalidar,
  })
}

// ---- combos ----

export function useCrearCombo() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: (payload: ComboPayload) => api.post<Combo>('/catalog/combos', payload),
    onSuccess: invalidar,
  })
}

export function useActualizarCombo() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: ({ id, ...payload }: Partial<ComboPayload> & { id: number }) =>
      api.patch<Combo>(`/catalog/combos/${id}`, payload),
    onSuccess: invalidar,
  })
}

export function useCambiarActivoCombo() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: ({ id, activar }: { id: number; activar: boolean }) =>
      activar ? api.patch<Combo>(`/catalog/combos/${id}/enable`) : api.delete<Combo>(`/catalog/combos/${id}`),
    onSuccess: invalidar,
  })
}
