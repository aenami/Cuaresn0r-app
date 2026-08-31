import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovementDto, TipoMovimientoManual } from './dto/create-movement.dto';
import { Prisma } from '../generated/prisma/client';

// InventoryService descuenta stock al enviar comandas a cocina y lo repone al
// cancelar (reverso), copiando la cantidad ORIGINAL (nunca recalculada desde la
// receta de hoy) y evitando el doble reverso. Los movimientos manuales validan
// motivo y que el stock no quede negativo. Prisma / tx simulados.

// ---- registrarMovimientoManual ----

const movDto = (over: Partial<CreateMovementDto>): CreateMovementDto =>
  ({ tipo: TipoMovimientoManual.ENTRADA, cantidad: 10, ...over }) as CreateMovementDto;

function setupManual(ingrediente: Record<string, unknown> | null) {
  const spies = {
    ingFindUnique: jest.fn().mockResolvedValue(ingrediente),
    ingUpdate: jest.fn().mockResolvedValue({}),
    movCreate: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id_movimiento: 1, ...args.data })),
  };
  const tx = {
    movimientoInventario: { create: spies.movCreate },
    ingrediente: { update: spies.ingUpdate },
  };
  const prisma = {
    ingrediente: { findUnique: spies.ingFindUnique, update: spies.ingUpdate },
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  } as unknown as PrismaService;
  return { svc: new InventoryService(prisma), spies };
}

describe('InventoryService.registrarMovimientoManual', () => {
  it('404 si el ingrediente no existe', async () => {
    const { svc } = setupManual(null);
    await expect(svc.registrarMovimientoManual(1, movDto({}), 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('400 si una MERMA no trae motivo', async () => {
    const { svc } = setupManual({ id_ingrediente: 1, stock_ingrediente: new Prisma.Decimal(100) });
    await expect(svc.registrarMovimientoManual(1, movDto({ tipo: TipoMovimientoManual.MERMA, cantidad: 5 }), 9)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('409 si la MERMA dejaria el stock en negativo', async () => {
    const { svc } = setupManual({ id_ingrediente: 1, stock_ingrediente: new Prisma.Decimal(3) });
    await expect(
      svc.registrarMovimientoManual(1, movDto({ tipo: TipoMovimientoManual.MERMA, cantidad: 5, motivo: 'se cayo' }), 9),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('una ENTRADA suma al stock', async () => {
    const { svc, spies } = setupManual({ id_ingrediente: 1, stock_ingrediente: new Prisma.Decimal(3) });
    await svc.registrarMovimientoManual(1, movDto({ tipo: TipoMovimientoManual.ENTRADA, cantidad: 10 }), 9);
    expect(spies.movCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo_movimiento: 'ENTRADA' }) }));
    expect(spies.ingUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { stock_ingrediente: { increment: 10 } } }));
  });
});

// ---- descontarPorReceta ----

function txDescontar(detalles: { id_ingrediente_detalleReceta: number; cantidad_ingrediente_detalleReceta: Prisma.Decimal }[]) {
  const spies = {
    detalleFindMany: jest.fn().mockResolvedValue(detalles),
    movCreate: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id_movimiento: 1, ...args.data })),
    ingUpdate: jest.fn().mockResolvedValue({}),
  };
  const tx = {
    detalleReceta: { findMany: spies.detalleFindMany },
    movimientoInventario: { create: spies.movCreate },
    ingrediente: { update: spies.ingUpdate },
  } as unknown as Prisma.TransactionClient;
  return { tx, spies };
}

describe('InventoryService.descontarPorReceta', () => {
  it('descuenta base*cantidad y aplica el delta de personalizacion (EXTRA)', async () => {
    const { tx, spies } = txDescontar([{ id_ingrediente_detalleReceta: 1, cantidad_ingrediente_detalleReceta: new Prisma.Decimal(2) }]);
    const svc = new InventoryService({} as PrismaService);
    // base = 2 * 3 = 6, delta +1 -> 7
    await svc.descontarPorReceta(tx, { idReceta: 77, cantidadProducto: 3, idDetalleComanda: 500, deltasPersonalizados: [{ idIngrediente: 1, delta: 1 }] });

    const data = spies.movCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.tipo_movimiento).toBe('SALIDA_RECETA');
    expect(data.cantidad_movimiento).toBe(7);
    expect(spies.ingUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { stock_ingrediente: { decrement: 7 } } }));
  });

  it('no genera movimiento si el delta (SIN) anula la cantidad', async () => {
    const { tx, spies } = txDescontar([{ id_ingrediente_detalleReceta: 1, cantidad_ingrediente_detalleReceta: new Prisma.Decimal(2) }]);
    const svc = new InventoryService({} as PrismaService);
    // base = 2 * 3 = 6, delta -6 -> 0 -> se omite
    await svc.descontarPorReceta(tx, { idReceta: 77, cantidadProducto: 3, idDetalleComanda: 500, deltasPersonalizados: [{ idIngrediente: 1, delta: -6 }] });
    expect(spies.movCreate).not.toHaveBeenCalled();
  });
});

// ---- revertirPorDetalleComanda ----

function txRevertir(movimientos: Record<string, unknown>[]) {
  const spies = {
    movFindMany: jest.fn().mockResolvedValue(movimientos),
    movCreate: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id_movimiento: 9, ...args.data })),
    ingUpdate: jest.fn().mockResolvedValue({}),
  };
  const tx = {
    movimientoInventario: { findMany: spies.movFindMany, create: spies.movCreate },
    ingrediente: { update: spies.ingUpdate },
  } as unknown as Prisma.TransactionClient;
  return { tx, spies };
}

describe('InventoryService.revertirPorDetalleComanda', () => {
  it('repone con un REVERSO por cada SALIDA no revertida, con la cantidad original', async () => {
    const { tx, spies } = txRevertir([
      { id_movimiento: 1, id_ingrediente_movimiento: 10, id_detalleComanda_movimiento: 500, cantidad_movimiento: new Prisma.Decimal(7), reversos: [] },
      { id_movimiento: 2, id_ingrediente_movimiento: 11, id_detalleComanda_movimiento: 500, cantidad_movimiento: new Prisma.Decimal(3), reversos: [{ id_movimiento: 99 }] },
    ]);
    const svc = new InventoryService({} as PrismaService);
    await svc.revertirPorDetalleComanda(tx, 500);

    // Solo el movimiento 1 (sin reverso previo) genera reverso.
    expect(spies.movCreate).toHaveBeenCalledTimes(1);
    const data = spies.movCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.tipo_movimiento).toBe('REVERSO');
    expect(data.id_movimiento_revertido).toBe(1);
    expect((data.cantidad_movimiento as Prisma.Decimal).toString()).toBe('7');
    expect(spies.ingUpdate).toHaveBeenCalledTimes(1);
    const upd = spies.ingUpdate.mock.calls[0][0].data as { stock_ingrediente: { increment: Prisma.Decimal } };
    expect(upd.stock_ingrediente.increment.toString()).toBe('7');
  });

  it('es idempotente: no genera un segundo reverso si ya existe', async () => {
    const { tx, spies } = txRevertir([
      { id_movimiento: 1, id_ingrediente_movimiento: 10, id_detalleComanda_movimiento: 500, cantidad_movimiento: new Prisma.Decimal(7), reversos: [{ id_movimiento: 50 }] },
    ]);
    const svc = new InventoryService({} as PrismaService);
    await svc.revertirPorDetalleComanda(tx, 500);
    expect(spies.movCreate).not.toHaveBeenCalled();
  });
});
