import { ConflictException, NotFoundException } from '@nestjs/common';
import { ItemsService } from './items.service';
import { PrismaService } from '../prisma/prisma.service';
import { PedidosService } from './pedidos.service';
import { InventoryService } from '../recipes/inventory.service';

// ItemsService entrega/cancela items sueltos. Solo se puede cancelar mientras
// el item sigue PREPARANDO, y cancelar el header de un combo cae en cascada
// sobre sus hijos, cada uno con su propio reverso de inventario. Prisma
// simulado; recalcularEstadoPedido y el inventario se mockean.

function setup(opts: { item?: Record<string, unknown> | null; hijos?: { id_detalleComanda: number }[] } = {}) {
  const { item = { id_detalleComanda: 1, estado_dc: 'PREPARANDO', comanda: { id_pedido_comanda: 10 } }, hijos = [] } = opts;
  const spies = {
    dcFindUnique: jest.fn().mockResolvedValue(item),
    dcUpdate: jest.fn().mockResolvedValue({}),
    dcFindMany: jest.fn().mockResolvedValue(hijos),
    dcFind: jest.fn().mockResolvedValue({ id_detalleComanda: 1 }),
    facturaDetalleFindFirst: jest.fn().mockResolvedValue(null),
    recalcular: jest.fn().mockResolvedValue(undefined),
    revertir: jest.fn().mockResolvedValue(undefined),
  };
  const tx = {
    detalleComanda: {
      findUnique: spies.dcFindUnique,
      update: spies.dcUpdate,
      updateMany: spies.dcUpdate,
      findMany: spies.dcFindMany,
      findUniqueOrThrow: spies.dcFind,
    },
    facturaDetalle: { findFirst: spies.facturaDetalleFindFirst },
  };
  const prisma = { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) } as unknown as PrismaService;
  const pedidos = { recalcularEstadoPedido: spies.recalcular } as unknown as PedidosService;
  const inventory = { revertirPorDetalleComanda: spies.revertir } as unknown as InventoryService;
  return { svc: new ItemsService(prisma, pedidos, inventory), spies };
}

describe('ItemsService.entregar', () => {
  it('404 si el item no pertenece al pedido', async () => {
    const { svc } = setup({ item: { id_detalleComanda: 1, estado_dc: 'PREPARANDO', comanda: { id_pedido_comanda: 999 } } });
    await expect(svc.entregar(10, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si el item ya no esta PREPARANDO', async () => {
    const { svc } = setup({ item: { id_detalleComanda: 1, estado_dc: 'ENTREGADO', comanda: { id_pedido_comanda: 10 } } });
    await expect(svc.entregar(10, 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('marca ENTREGADO y recalcula el estado del pedido', async () => {
    const { svc, spies } = setup();
    await svc.entregar(10, 1);
    expect(spies.dcUpdate).toHaveBeenCalledWith({ where: { id_detalleComanda: 1, estado_dc: 'PREPARANDO' }, data: { estado_dc: 'ENTREGADO', fecha_entrega_dc: expect.any(Date) } });
    expect(spies.recalcular).toHaveBeenCalledWith(expect.anything(), 10);
  });
});

describe('ItemsService.cancelar', () => {
  it('409 si el item ya fue entregado (solo se cancela PREPARANDO)', async () => {
    const { svc } = setup({ item: { id_detalleComanda: 1, estado_dc: 'ENTREGADO', comanda: { id_pedido_comanda: 10 } } });
    await expect(svc.cancelar(10, 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancela un item simple y revierte su inventario', async () => {
    const { svc, spies } = setup();
    await svc.cancelar(10, 1);
    expect(spies.dcUpdate).toHaveBeenCalledTimes(1);
    expect(spies.dcUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { estado_dc: 'CANCELADO' } }));
    expect(spies.revertir).toHaveBeenCalledTimes(1);
    expect(spies.revertir).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('cancela en cascada los hijos del combo y revierte los que ya estaban preparando', async () => {
    const { svc, spies } = setup({
      hijos: [
        { id_detalleComanda: 2, estado_dc: 'PREPARANDO' },
        { id_detalleComanda: 3, estado_dc: 'PREPARANDO' },
      ],
    });
    await svc.cancelar(10, 1);
    // 2 hijos + el header = 3 updates a CANCELADO y 3 reversos de inventario.
    expect(spies.dcUpdate).toHaveBeenCalledTimes(3);
    expect(spies.revertir).toHaveBeenCalledTimes(3);
    expect(spies.revertir).toHaveBeenCalledWith(expect.anything(), 2);
    expect(spies.revertir).toHaveBeenCalledWith(expect.anything(), 3);
    expect(spies.revertir).toHaveBeenCalledWith(expect.anything(), 1);
  });
});
