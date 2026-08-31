import { ConflictException, NotFoundException } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../recipes/inventory.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { TipoPedido } from '../generated/prisma/client';

// PedidosService abre pedidos de MESA (ocupan una mesa, bajo bloqueo) o de
// DOMICILIO (sin mesa, con datos del cliente). El domicilio no bloquea ni
// libera mesas: se prueba que ese camino no toca ninguna. Prisma simulado.

function inventoryMock() {
  return { revertirPorDetalleComanda: jest.fn() } as unknown as InventoryService;
}

// ---- create (MESA vs DOMICILIO) ----

function setupCreate(opts: { mesa?: { id_mesa: number; estado_mesa: string } | null } = {}) {
  const { mesa = { id_mesa: 4, estado_mesa: 'LIBRE' } } = opts;
  const spies = {
    queryRaw: jest.fn().mockResolvedValue(mesa ? [mesa] : []),
    pedidoCreate: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id_pedido: 7, ...args.data })),
    subcuentaCreate: jest.fn().mockResolvedValue({ id_subcuenta: 1 }),
    mesaUpdate: jest.fn().mockResolvedValue({}),
    pedidoFind: jest.fn().mockResolvedValue({ id_pedido: 7 }),
  };
  const tx = {
    $queryRaw: spies.queryRaw,
    pedido: { create: spies.pedidoCreate, findUniqueOrThrow: spies.pedidoFind },
    subcuenta: { create: spies.subcuentaCreate },
    mesa: { update: spies.mesaUpdate },
  };
  const prisma = { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) } as unknown as PrismaService;
  return { svc: new PedidosService(prisma, inventoryMock()), spies };
}

const dto = (d: Partial<CreatePedidoDto>) => d as unknown as CreatePedidoDto;

describe('PedidosService.create (domicilio)', () => {
  it('abre sin tocar ninguna mesa y guarda los datos del cliente', async () => {
    const { svc, spies } = setupCreate();
    await svc.create(5, dto({ tipo: TipoPedido.DOMICILIO, nombreCliente: 'Juan', telefonoCliente: '3001112233', direccionCliente: 'Calle 1 #2-3' }));

    const data = spies.pedidoCreate.mock.calls[0][0].data;
    expect(data.tipo_pedido).toBe('DOMICILIO');
    expect(data.mesero_pedido).toBe(5);
    expect(data.nombre_cliente_pedido).toBe('Juan');
    expect(data.direccion_cliente_pedido).toBe('Calle 1 #2-3');
    // Un domicilio no bloquea ni ocupa mesa.
    expect(spies.queryRaw).not.toHaveBeenCalled();
    expect(spies.mesaUpdate).not.toHaveBeenCalled();
  });
});

describe('PedidosService.create (mesa)', () => {
  it('por defecto es un pedido de MESA: la bloquea, la exige LIBRE y la marca OCUPADA', async () => {
    const { svc, spies } = setupCreate();
    await svc.create(5, dto({ idMesa: 4 }));

    expect(spies.queryRaw).toHaveBeenCalledTimes(1); // bloqueo FOR UPDATE
    expect(spies.pedidoCreate.mock.calls[0][0].data.mesa_pedido).toBe(4);
    expect(spies.mesaUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { estado_mesa: 'OCUPADA' } }));
  });

  it('409 si la mesa no esta LIBRE', async () => {
    const { svc } = setupCreate({ mesa: { id_mesa: 4, estado_mesa: 'OCUPADA' } });
    await expect(svc.create(5, dto({ idMesa: 4 }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('404 si la mesa no existe', async () => {
    const { svc } = setupCreate({ mesa: null });
    await expect(svc.create(5, dto({ idMesa: 99 }))).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---- cancel (liberacion de mesa condicional) ----

function setupCancel(pedido: Record<string, unknown>) {
  const spies = {
    pedidoFindUnique: jest.fn().mockResolvedValue(pedido),
    facturaFindFirst: jest.fn().mockResolvedValue(null),
    dcFindFirst: jest.fn().mockResolvedValue(null), // sin entregados
    dcFindMany: jest.fn().mockResolvedValue([]), // sin pendientes
    pedidoUpdate: jest.fn().mockResolvedValue({}),
    mesaUpdate: jest.fn().mockResolvedValue({}),
    pedidoFind: jest.fn().mockResolvedValue({ id_pedido: 7 }),
  };
  const tx = {
    pedido: { findUnique: spies.pedidoFindUnique, update: spies.pedidoUpdate, findUniqueOrThrow: spies.pedidoFind },
    factura: { findFirst: spies.facturaFindFirst },
    detalleComanda: { findFirst: spies.dcFindFirst, findMany: spies.dcFindMany },
    mesa: { update: spies.mesaUpdate },
  };
  const prisma = { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) } as unknown as PrismaService;
  return { svc: new PedidosService(prisma, inventoryMock()), spies };
}

describe('PedidosService.cancel', () => {
  it('cancelar un domicilio no intenta liberar ninguna mesa', async () => {
    const { svc, spies } = setupCancel({ id_pedido: 7, estado_pedido: 'EN_PREPARACION', mesa_pedido: null });
    await svc.cancel(7);
    expect(spies.pedidoUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { estado_pedido: 'CANCELADO' } }));
    expect(spies.mesaUpdate).not.toHaveBeenCalled();
  });

  it('cancelar un pedido de mesa la libera', async () => {
    const { svc, spies } = setupCancel({ id_pedido: 7, estado_pedido: 'EN_PREPARACION', mesa_pedido: 4 });
    await svc.cancel(7);
    expect(spies.mesaUpdate).toHaveBeenCalledWith({ where: { id_mesa: 4 }, data: { estado_mesa: 'LIBRE' } });
  });
});

// ---- transferir (no aplica a domicilios) ----

function setupTransferir(pedido: Record<string, unknown>) {
  const spies = {
    queryRaw: jest.fn().mockResolvedValue([{ id_pedido: 7 }]),
    pedidoFind: jest.fn().mockResolvedValue(pedido),
  };
  const tx = {
    $queryRaw: spies.queryRaw,
    pedido: { findUniqueOrThrow: spies.pedidoFind },
  };
  const prisma = { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) } as unknown as PrismaService;
  return { svc: new PedidosService(prisma, inventoryMock()), spies };
}

describe('PedidosService.transferir', () => {
  it('409 al intentar transferir un domicilio (no ocupa mesa)', async () => {
    const { svc } = setupTransferir({ id_pedido: 7, estado_pedido: 'EN_PREPARACION', mesa_pedido: null });
    await expect(svc.transferir(7, 4)).rejects.toThrow(/no ocupa mesa/i);
  });
});
