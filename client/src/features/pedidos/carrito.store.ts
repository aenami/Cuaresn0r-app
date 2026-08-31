import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ComandaItemPayload } from '@/features/pedidos/api'

// Borrador de comanda por pedido (estado 100% de cliente): lo que el mesero
// va armando antes de enviar a cocina. Se persiste para sobrevivir un
// refresco de la tablet a mitad de la toma.

export interface PersonalizacionCarrito {
  idIngrediente: number
  nombre: string
  // Las personalizaciones solo QUITAN ingredientes; un "extra" con precio se
  // pide como adicion. Se conserva el campo por claridad del borrador.
  modo: 'sin'
  // Cantidad de la receta por unidad de producto: base del delta.
  cantidadReceta: number
}

export interface ComponenteCarrito {
  idProducto: number
  nombre: string
  // Unidades de este producto por unidad de combo (cantidad_detalleCombo).
  cantidadComponente: number
  personalizaciones: PersonalizacionCarrito[]
}

export interface AdicionCarrito {
  idProducto: number
  nombre: string
  precio: number
  cantidad: number
}

export interface ItemCarrito {
  uid: string
  tipo: 'producto' | 'combo'
  id: number
  nombre: string
  precioUnitario: number
  cantidad: number
  indicaciones?: string
  // Solo productos directos:
  personalizaciones: PersonalizacionCarrito[]
  // Solo combos:
  componentes: ComponenteCarrito[]
  adiciones: AdicionCarrito[]
}

interface CarritoState {
  carritos: Record<number, ItemCarrito[]>
  agregar: (idPedido: number, item: ItemCarrito) => void
  quitar: (idPedido: number, uid: string) => void
  limpiar: (idPedido: number) => void
}

export const useCarritoStore = create<CarritoState>()(
  persist(
    (set) => ({
      carritos: {},
      agregar: (idPedido, item) =>
        set((s) => ({
          carritos: { ...s.carritos, [idPedido]: [...(s.carritos[idPedido] ?? []), item] },
        })),
      quitar: (idPedido, uid) =>
        set((s) => ({
          carritos: {
            ...s.carritos,
            [idPedido]: (s.carritos[idPedido] ?? []).filter((i) => i.uid !== uid),
          },
        })),
      limpiar: (idPedido) =>
        set((s) => {
          const { [idPedido]: _, ...resto } = s.carritos
          return { carritos: resto }
        }),
    }),
    { name: 'pos-carritos' },
  ),
)

export function totalItemCarrito(item: ItemCarrito): number {
  const adiciones = item.adiciones.reduce((acc, a) => acc + a.precio * a.cantidad, 0)
  return item.precioUnitario * item.cantidad + adiciones
}

// Traduce el borrador al DTO del backend. Los deltas de ingredientes son
// TOTALES: cantidadReceta x unidades del producto en el item.
export function itemAPayload(item: ItemCarrito): ComandaItemPayload {
  const payload: ComandaItemPayload = {
    ...(item.tipo === 'producto' ? { idProducto: item.id } : { idCombo: item.id }),
    cantidad: item.cantidad,
    ...(item.indicaciones ? { indicaciones: item.indicaciones } : {}),
  }

  // Solo "sin": el delta siempre resta (negativo) la cantidad de receta.
  if (item.tipo === 'producto' && item.personalizaciones.length > 0) {
    payload.personalizaciones = item.personalizaciones.map((p) => ({
      idIngrediente: p.idIngrediente,
      delta: -p.cantidadReceta * item.cantidad,
    }))
  }

  if (item.tipo === 'combo') {
    const componentes = item.componentes
      .filter((c) => c.personalizaciones.length > 0)
      .map((c) => ({
        idProducto: c.idProducto,
        personalizaciones: c.personalizaciones.map((p) => ({
          idIngrediente: p.idIngrediente,
          delta: -p.cantidadReceta * c.cantidadComponente * item.cantidad,
        })),
      }))
    if (componentes.length > 0) payload.componentes = componentes
  }

  if (item.adiciones.length > 0) {
    payload.adiciones = item.adiciones.map((a) => ({ idProducto: a.idProducto, cantidad: a.cantidad }))
  }

  return payload
}
