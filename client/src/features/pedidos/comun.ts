import { ApiError } from '@/lib/api'
import type { EstadoPedido } from '@/types/api'

// Helpers compartidos por las piezas de la pantalla de detalle de pedido
// (encabezado, menu, panel de comanda, vista por cuenta).

export const TEXTO_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  EN_PREPARACION: 'En preparacion',
  ENTREGADO: 'Entregado',
  PAGADO: 'Pagado',
  CANCELADO: 'Cancelado',
}

export function errorATexto(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Error de conexion'
}
