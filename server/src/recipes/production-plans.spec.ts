import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoMetaProduccion, Prisma, TipoObjetivoProduccion } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionPlansService } from './production-plans.service';

function setup({ producto = null, ingrediente = null, plan = null }: {
  producto?: Record<string, unknown> | null;
  ingrediente?: Record<string, unknown> | null;
  plan?: Record<string, unknown> | null;
} = {}) {
  const spies = {
    producto: jest.fn().mockResolvedValue(producto),
    ingrediente: jest.fn().mockResolvedValue(ingrediente),
    planFind: jest.fn().mockResolvedValue(plan),
    planFindOrThrow: jest.fn().mockResolvedValue(plan),
    planFindMany: jest.fn().mockResolvedValue([]),
    planCreate: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id_planProduccion: 1, ...args.data })),
    planUpdate: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id_planProduccion: 1, ...args.data })),
    planDelete: jest.fn().mockResolvedValue({ id_planProduccion: 1 }),
  };
  const tx = {
    producto: { findUnique: spies.producto },
    ingrediente: { findUnique: spies.ingrediente },
    $queryRaw: jest.fn().mockResolvedValue([{ id_planProduccion: 1 }]),
    planProduccionDiaria: {
      findUnique: spies.planFind,
      findUniqueOrThrow: spies.planFindOrThrow,
      findMany: spies.planFindMany,
      create: spies.planCreate,
      update: spies.planUpdate,
      delete: spies.planDelete,
    },
  };
  const prisma = {
    ...tx,
    $transaction: (callback: (cliente: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaService;
  return { service: new ProductionPlansService(prisma), spies };
}

describe('ProductionPlansService', () => {
  it('rechaza una fecha inexistente', async () => {
    const { service } = setup();
    await expect(service.findAll('2026-02-30')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('crea una meta de producto completa y congela su nombre', async () => {
    const { service, spies } = setup({
      producto: { id_producto: 7, nombre_producto: 'Empanada', habilitado_producto: true },
    });
    await service.create(
      { fecha: '2026-09-01', tipo: TipoObjetivoProduccion.PRODUCTO, idObjetivo: 7, cantidad: 30 },
      4,
    );

    expect(spies.planCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id_producto_planProduccion: 7,
        nombre_objetivo_planProduccion: 'Empanada',
        unidad_objetivo_planProduccion: 'UNIDADES',
        cantidad_objetivo_planProduccion: new Prisma.Decimal(30),
        id_usuario_crea_planProduccion: 4,
      }),
    }));
  });

  it('impide cantidades parciales para productos', async () => {
    const { service, spies } = setup({
      producto: { id_producto: 7, nombre_producto: 'Empanada', habilitado_producto: true },
    });
    await expect(service.create(
      { fecha: '2026-09-01', tipo: TipoObjetivoProduccion.PRODUCTO, idObjetivo: 7, cantidad: 2.5 },
      4,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(spies.producto).not.toHaveBeenCalled();
  });

  it('permite cantidades decimales para ingredientes y conserva su unidad', async () => {
    const { service, spies } = setup({
      ingrediente: { id_ingrediente: 3, nombre_ingrediente: 'Salsa', unidades_ingrediente: 'L' },
    });
    await service.create(
      { fecha: '2026-09-01', tipo: TipoObjetivoProduccion.INGREDIENTE, idObjetivo: 3, cantidad: 2.5 },
      4,
    );
    expect(spies.planCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id_ingrediente_planProduccion: 3,
        nombre_objetivo_planProduccion: 'Salsa',
        unidad_objetivo_planProduccion: 'L',
      }),
    }));
  });

  it('no permite crear una meta con un producto deshabilitado', async () => {
    const { service } = setup({
      producto: { id_producto: 7, nombre_producto: 'Empanada', habilitado_producto: false },
    });
    await expect(service.create(
      { fecha: '2026-09-01', tipo: TipoObjetivoProduccion.PRODUCTO, idObjetivo: 7, cantidad: 30 },
      4,
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un empleado puede resolver una meta pendiente de forma completa', async () => {
    const { service, spies } = setup({
      plan: { id_planProduccion: 1, estado_planProduccion: EstadoMetaProduccion.PENDIENTE },
    });
    await service.actualizarEstado(1, EstadoMetaProduccion.PRODUCIDO, 8, false);
    expect(spies.planUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        estado_planProduccion: EstadoMetaProduccion.PRODUCIDO,
        id_usuario_resuelve_planProduccion: 8,
        fecha_resolucion_planProduccion: expect.any(Date),
      }),
    }));
  });

  it('un empleado no puede corregir una meta ya resuelta', async () => {
    const { service } = setup({
      plan: { id_planProduccion: 1, estado_planProduccion: EstadoMetaProduccion.PRODUCIDO },
    });
    await expect(
      service.actualizarEstado(1, EstadoMetaProduccion.NO_PRODUCIDO, 8, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un administrador puede reabrir una meta y limpiar la resolucion', async () => {
    const { service, spies } = setup({
      plan: { id_planProduccion: 1, estado_planProduccion: EstadoMetaProduccion.NO_PRODUCIDO },
    });
    await service.actualizarEstado(1, EstadoMetaProduccion.PENDIENTE, 1, true);
    expect(spies.planUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        estado_planProduccion: EstadoMetaProduccion.PENDIENTE,
        id_usuario_resuelve_planProduccion: null,
        fecha_resolucion_planProduccion: null,
      },
    }));
  });

  it('conserva las metas resueltas: deben reabrirse antes de eliminarlas', async () => {
    const { service } = setup({
      plan: { id_planProduccion: 1, estado_planProduccion: EstadoMetaProduccion.PRODUCIDO },
    });
    await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
  });
});
