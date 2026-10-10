import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  ConteoInventarioDiario,
  ElementoConteoDiario,
  EstadoMetaProduccion,
  Ingrediente,
  MovimientoInventario,
  PlanProduccionDiaria,
  Producto,
  Receta,
  TipoObjetivoProduccion,
  UnidadIngrediente,
} from '@/types/api'

export type ProductoInventario = Pick<Producto, 'id_producto' | 'nombre_producto' | 'habilitado_producto'> & {
  categoria?: Pick<NonNullable<Producto['categoria']>, 'id_categoria' | 'nombre_categoria'>
}
// Lectura mínima propia de inventario: no concede acceso al catálogo.
export const productosInventarioQuery = queryOptions({
  queryKey: ['inventario', 'productos-objetivo'],
  queryFn: () => api.get<ProductoInventario[]>('/recipes/inventory-counts/targets'),
})

export const ingredientesQuery = queryOptions({
  queryKey: ['inventario', 'ingredientes'],
  queryFn: () => api.get<Ingrediente[]>('/recipes/ingredients'),
})

// Todas las versiones (activas e historicas) para la vista de recetas.
export const recetasQuery = queryOptions({
  queryKey: ['inventario', 'recetas'],
  queryFn: () => api.get<Receta[]>('/recipes?activas=false'),
})

export interface SalidaRestaurante {
  id: string
  tipo: 'PRODUCTO' | 'INGREDIENTE'
  clase?: 'MERMA' | 'SALIDA_MANUAL'
  objetivoId: number
  nombre: string
  cantidad: string
  unidad: UnidadIngrediente
  motivo: string
  fecha: string
  usuario: string
}

export function salidasRestauranteQuery(fecha: string) {
  return queryOptions({
    queryKey: ['inventario', 'salidas', fecha],
    queryFn: () => api.get<SalidaRestaurante[]>(`/recipes/inventory-exits?date=${fecha}`),
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

export function planProduccionQuery(fecha: string) {
  return queryOptions({
    queryKey: ['inventario', 'produccion', fecha],
    queryFn: () => api.get<PlanProduccionDiaria[]>(`/recipes/production-plans?date=${fecha}`),
  })
}

export function conteoInventarioQuery(fecha: string, prepararHoy: boolean) {
  return queryOptions({
    queryKey: ['inventario', 'conteo-diario', fecha],
    // Solo la jornada actual se prepara. Consultar el historial nunca escribe datos.
    queryFn: () => prepararHoy
      ? api.post<ConteoInventarioDiario[]>(`/recipes/inventory-counts/prepare?date=${fecha}`)
      : api.get<ConteoInventarioDiario[]>(`/recipes/inventory-counts?date=${fecha}`),
    refetchInterval: 15_000,
  })
}

export const elementosConteoQuery = queryOptions({
  queryKey: ['inventario', 'elementos-conteo'],
  queryFn: () => api.get<ElementoConteoDiario[]>('/recipes/inventory-counts/elements'),
})

export function useAgregarElementoConteo() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: (payload: Omit<ConteoInventarioPayload, 'fecha'>) => api.post('/recipes/inventory-counts/elements', payload),
    onSuccess: invalidar,
  })
}

export function useRetirarElementoConteo() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/recipes/inventory-counts/elements/${id}`),
    onSuccess: invalidar,
  })
}

export interface MovimientoPayload {
  tipo: 'ENTRADA' | 'MERMA' | 'SALIDA_MANUAL' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO'
  cantidad: number
  motivo?: string
}

export interface RecetaPayload {
  id_product_recipe: number
  name: string
  ingredients: { id_ingredient: number; quantity_ingredient: number }[]
}

export interface MetaProduccionPayload {
  fecha: string
  tipo: TipoObjetivoProduccion
  idObjetivo: number
  cantidad: number
}

export interface ConteoInventarioPayload {
  fecha: string
  tipo: TipoObjetivoProduccion
  idObjetivo: number
  cantidadInicial?: number
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

export function useRegistrarSalidaProducto() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: (payload: { productoId: number; cantidad: number; motivo: string }) =>
      api.post('/recipes/inventory-exits/products', payload),
    onSuccess: invalidar,
  })
}

export function useCrearMetaProduccion() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: (payload: MetaProduccionPayload) =>
      api.post<PlanProduccionDiaria>('/recipes/production-plans', payload),
    onSuccess: invalidar,
  })
}

export function useCambiarEstadoMetaProduccion() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: EstadoMetaProduccion }) =>
      api.patch<PlanProduccionDiaria>(`/recipes/production-plans/${id}/status`, { estado }),
    onSuccess: invalidar,
  })
}

export function useEliminarMetaProduccion() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/recipes/production-plans/${id}`),
    onSuccess: invalidar,
  })
}

export function useFinalizarConteoInventario() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: ({ id, cantidadFisica }: { id: number; cantidadFisica: number }) =>
      api.patch<ConteoInventarioDiario>(`/recipes/inventory-counts/${id}/finalize`, { cantidadFisica }),
    onSuccess: invalidar,
  })
}

export function useReabrirConteoInventario() {
  const invalidar = useInvalidarInventario()
  return useMutation({
    mutationFn: (id: number) => api.patch<ConteoInventarioDiario>(`/recipes/inventory-counts/${id}/reopen`),
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
