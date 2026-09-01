import { EstadoPedido, Prisma } from '../generated/prisma/client';

type DetalleConFacturacion = {
  estado_dc: 'PENDIENTE' | 'PREPARANDO' | 'ENTREGADO' | 'CANCELADO';
  precio_unitario_dc: Prisma.Decimal;
  cantidad_producto_dc: number;
  facturasDetalle: Array<{
    proporcion_facturada_fd: Prisma.Decimal;
    factura: { estado_factura: 'EMITIDA' | 'PAGADA' | 'ANULADA' };
  }>;
};

export function detalleEstaPagado(detalle: DetalleConFacturacion): boolean {
  if (detalle.precio_unitario_dc.times(detalle.cantidad_producto_dc).isZero()) return true;

  const proporcionPagada = detalle.facturasDetalle
    .filter((registro) => registro.factura.estado_factura === 'PAGADA')
    .reduce((total, registro) => total.plus(registro.proporcion_facturada_fd), new Prisma.Decimal(0));

  return proporcionPagada.greaterThanOrEqualTo(1);
}

/**
 * Deriva el estado operativo y financiero del pedido.
 *
 * - La entrega total cierra permanentemente el pedido para nuevas adiciones.
 * - La ficha solo queda disponible cuando el pedido esta ENTREGADO y PAGADO,
 *   representado por el estado CERRADO.
 * - Una anulacion puede reabrir el estado financiero a ENTREGADO, pero no
 *   borra fecha_cierre_pedido; por eso tampoco permite agregar otra ronda.
 */
export async function recalcularEstadoPedido(tx: Prisma.TransactionClient, idPedido: number) {
  const pedido = await tx.pedido.findUniqueOrThrow({ where: { id_pedido: idPedido } });
  if (pedido.estado_pedido === 'CANCELADO') return pedido.estado_pedido;

  const detalles = await tx.detalleComanda.findMany({
    where: {
      comanda: { id_pedido_comanda: idPedido },
      estado_dc: { not: 'CANCELADO' },
    },
    select: {
      estado_dc: true,
      precio_unitario_dc: true,
      cantidad_producto_dc: true,
      facturasDetalle: {
        select: {
          proporcion_facturada_fd: true,
          factura: { select: { estado_factura: true } },
        },
      },
    },
  });

  const hayDetalles = detalles.length > 0;
  const todosEntregados = hayDetalles && detalles.every((detalle) => detalle.estado_dc === 'ENTREGADO');
  const hayPreparando = detalles.some((detalle) => detalle.estado_dc === 'PREPARANDO');
  const todosPagados = detalles.every(detalleEstaPagado);

  let nuevoEstado: EstadoPedido = 'ABIERTO';
  if (todosEntregados) nuevoEstado = todosPagados ? 'CERRADO' : 'ENTREGADO';
  else if (hayPreparando) nuevoEstado = 'EN_PREPARACION';

  await tx.pedido.update({
    where: { id_pedido: idPedido },
    data: {
      estado_pedido: nuevoEstado,
      ...(todosEntregados && pedido.fecha_cierre_pedido === null && { fecha_cierre_pedido: new Date() }),
    },
  });

  return nuevoEstado;
}
