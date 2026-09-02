import { ApiError } from '@/lib/api'
import type { Comanda, DetalleComanda, EstadoPedido, Pedido } from '@/types/api'

// Helpers compartidos por las piezas de la pantalla de detalle de pedido
// (encabezado, menu, panel de comanda, vista por cuenta).

export const TEXTO_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  ABIERTO: 'Abierto',
  EN_PREPARACION: 'En preparacion',
  ENTREGADO: 'Entregado',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
}

export function errorATexto(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Error de conexion'
}

export function detalleEstaPagado(detalle: DetalleComanda): boolean {
  if (Number(detalle.precio_unitario_dc) * detalle.cantidad_producto_dc === 0) return true
  const proporcionPagada = (detalle.facturasDetalle ?? [])
    .filter((registro) => registro.factura.estado_factura === 'PAGADA')
    .reduce((total, registro) => total + Number(registro.proporcion_facturada_fd), 0)
  return proporcionPagada >= 1
}

export function comandaEstaPagada(comanda: Comanda): boolean {
  const detalles = (comanda.detalles ?? []).filter((detalle) => detalle.estado_dc !== 'CANCELADO')
  return detalles.length > 0 && detalles.every(detalleEstaPagado)
}

export function pedidoEstaPagado(pedido: Pedido): boolean {
  const detalles = (pedido.comandas ?? [])
    .flatMap((comanda) => comanda.detalles ?? [])
    .filter((detalle) => detalle.estado_dc !== 'CANCELADO')
  return detalles.length > 0 && detalles.every(detalleEstaPagado)
}
