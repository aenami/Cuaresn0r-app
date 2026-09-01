import { Prisma } from '../generated/prisma/client';
import { recalcularEstadoPedido } from './estado-pedido';

function detalle(estado: 'PENDIENTE' | 'PREPARANDO' | 'ENTREGADO', proporcionPagada = 0) {
  return {
    estado_dc: estado,
    precio_unitario_dc: new Prisma.Decimal(10000),
    cantidad_producto_dc: 1,
    facturasDetalle:
      proporcionPagada === 0
        ? []
        : [
            {
              proporcion_facturada_fd: new Prisma.Decimal(proporcionPagada),
              factura: { estado_factura: 'PAGADA' as const },
            },
          ],
  };
}

function setup(detalles: ReturnType<typeof detalle>[], fechaCierre: Date | null = null) {
  const update = jest.fn().mockResolvedValue({});
  const tx = {
    pedido: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id_pedido: 7, estado_pedido: 'ABIERTO', fecha_cierre_pedido: fechaCierre }),
      update,
    },
    detalleComanda: { findMany: jest.fn().mockResolvedValue(detalles) },
  };
  return { tx, update };
}

describe('recalcularEstadoPedido', () => {
  it('cierra y libera la ficha solo cuando todo fue entregado y pagado', async () => {
    const { tx, update } = setup([detalle('ENTREGADO', 1)]);
    await expect(recalcularEstadoPedido(tx as never, 7)).resolves.toBe('CERRADO');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado_pedido: 'CERRADO', fecha_cierre_pedido: expect.any(Date) }) }),
    );
  });

  it('deja ENTREGADO y bloquea nuevas adiciones si falta pago', async () => {
    const { tx, update } = setup([detalle('ENTREGADO')]);
    await expect(recalcularEstadoPedido(tx as never, 7)).resolves.toBe('ENTREGADO');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado_pedido: 'ENTREGADO', fecha_cierre_pedido: expect.any(Date) }) }),
    );
  });

  it('mantiene EN_PREPARACION mientras exista un producto en preparacion', async () => {
    const { tx, update } = setup([detalle('ENTREGADO', 1), detalle('PREPARANDO', 1)]);
    await expect(recalcularEstadoPedido(tx as never, 7)).resolves.toBe('EN_PREPARACION');
    expect(update).toHaveBeenCalledWith({ where: { id_pedido: 7 }, data: { estado_pedido: 'EN_PREPARACION' } });
  });
});
