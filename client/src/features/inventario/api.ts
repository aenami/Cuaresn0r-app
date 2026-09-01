import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Ingrediente, MovimientoInventario, Receta, UnidadIngrediente } from '@/types/api'

export const ingredientesQuery = queryOptions({
  queryKey: ['inventario', 'ingredientes'],
  queryFn: () => api.get<Ingrediente[]>('/recipes/ingredients'),
})

// Todas las versiones (activas e historicas) para la vista de recetas.
export const recetasQuery = queryOptions({
  queryKey: ['inventario', 'recetas'],
  queryFn: () => api.get<Receta[]>('/recipes?activas=false'),
})

export function movimientosQuery(idIngrediente: number) {
  return queryOptions({
    queryKey: ['inventario', 'ingredientes', idIngrediente, 'movimientos'],
    queryFn: () => api.get<MovimientoInventario[]>(`/recipes/ingredients/${idIngrediente}/movements`),
  })
}

export interface IngredientePayload {
  name: string
  units: UnidadIngrediente
  stock: number
  price: number
  lowThreshold?: number | null
  highThreshold?: number | null
}

export interface MovimientoPayload {
  tipo: 'ENTRADA' | 'MERMA' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO'
  cantidad: number
  motivo?: string
}

export interface RecetaPayload {
  id_product_recipe: number
  name: string
  ingredients: { id_ingredient: number; quantity_ingredient: number }[]
}

function useInvalidarInventario() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['inventario'] })
}

export function useCrearIngrediente() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: (payload: IngredientePayload) => api.post<Ingrediente>('/recipes/ingredients', payload),
    onSuccess: invalidar,
  })
}

export function useActualizarIngrediente() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: ({ id, ...payload }: Partial<IngredientePayload> & { id: number }) =>
      api.patch<Ingrediente>(`/recipes/ingredients/${id}`, payload),
    onSuccess: invalidar,
  })
}

export function useRegistrarMovimiento() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: ({ idIngrediente, ...payload }: MovimientoPayload & { idIngrediente: number }) =>
      api.post<MovimientoInventario>(`/recipes/ingredients/${idIngrediente}/movements`, payload),
    onSuccess: invalidar,
  })
}

// Crear una receta desactiva la version activa anterior del producto y deja
// esta como la vigente (versionado del backend).
export function useCrearReceta() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: (payload: RecetaPayload) => api.post<Receta>('/recipes', payload),
    onSuccess: invalidar,
  })
}
