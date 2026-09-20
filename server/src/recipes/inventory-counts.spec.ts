import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  EstadoConteoInventario,
  Prisma,
  TipoObjetivoProduccion,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryCountsService } from './inventory-counts.service';
import { InventoryCountsController } from './inventory-counts.controller';

function setup(
  overrides: {
    anterior?: Record<string, unknown> | null;
    conteo?: Record<string, unknown> | null;
    posteriores?: number;
    entradasIngrediente?: number;
    entradasProducto?: number;
  } = {},
) {
  const conteo = overrides.conteo ?? {
    id_conteoInventario: 4,
    fecha_conteoInventario: new Date('2026-09-14T00:00:00.000Z'),
    tipo_objetivo_conteoInventario: TipoObjetivoProduccion.INGREDIENTE,
    id_ingrediente_conteoInventario: 8,
    id_producto_conteoInventario: null,
    cantidad_anterior_conteoInventario: new Prisma.Decimal(10),
    estado_conteoInventario: EstadoConteoInventario.PENDIENTE,
  };
  const spies = {
    anterior: jest.fn().mockResolvedValue(overrides.anterior ?? null),
    crear: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id_conteoInventario: 4, ...args.data }),
    ),
    encontrar: jest.fn().mockResolvedValue(conteo),
    encontrarObligatorio: jest.fn().mockResolvedValue(conteo),
    actualizar: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id_conteoInventario: 4, ...args.data }),
    ),
    contar: jest.fn().mockResolvedValue(overrides.posteriores ?? 0),
    producto: jest.fn().mockResolvedValue({
      id_producto: 3,
      nombre_producto: 'Empanada',
      habilitado_producto: true,
    }),
    ingrediente: jest.fn().mockResolvedValue({
      id_ingrediente: 8,
      nombre_ingrediente: 'Queso',
      unidades_ingrediente: 'kg',
      stock_ingrediente: new Prisma.Decimal(6.5),
    }),
    entradasIngrediente: jest.fn().mockResolvedValue({
      _sum: {
        cantidad_movimiento: new Prisma.Decimal(
          overrides.entradasIngrediente ?? 2,
        ),
      },
    }),
    entradasProducto: jest.fn().mockResolvedValue({
      _sum: {
        cantidad_detalleCuenta: new Prisma.Decimal(
          overrides.entradasProducto ?? 5,
        ),
      },
    }),
    produccion: jest.fn().mockResolvedValue({
      _sum: { cantidad_objetivo_planProduccion: null },
    }),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id_conteoInventario: 4 }]),
    conteoInventarioDiario: {
      findUnique: spies.encontrar,
      findUniqueOrThrow: spies.encontrarObligatorio,
      update: spies.actualizar,
      count: spies.contar,
    },
    ingrediente: { findUnique: spies.ingrediente },
    movimientoInventario: { aggregate: spies.entradasIngrediente },
    detalleCuentaPorPagar: { aggregate: spies.entradasProducto },
    planProduccionDiaria: { aggregate: spies.produccion },
  };
  const prisma = {
    elementoConteoDiario: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1, activo: false }),
    },
    conteoInventarioDiario: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: spies.anterior,
      create: spies.crear,
      findUnique: spies.encontrar,
    },
    producto: { findUnique: spies.producto },
    ingrediente: { findUnique: spies.ingrediente },
    $transaction: (callback: (cliente: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaService;

  return { service: new InventoryCountsService(prisma), spies, prisma };
}

describe('Lista permanente de conteo', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-21T02:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('prepara el día colombiano sin duplicar elementos ya registrados', async () => {
    const { service, prisma } = setup();
    jest.spyOn(prisma.elementoConteoDiario, 'findMany').mockResolvedValue([
      {
        id: 1,
        tipo: 'PRODUCTO',
        idProducto: 3,
        idIngrediente: null,
        cantidadInicial: new Prisma.Decimal(10),
      },
      {
        id: 2,
        tipo: 'INGREDIENTE',
        idProducto: null,
        idIngrediente: 8,
        cantidadInicial: new Prisma.Decimal(4),
      },
    ] as never);
    jest
      .spyOn(prisma.conteoInventarioDiario, 'findMany')
      .mockResolvedValue([
        {
          tipo_objetivo_conteoInventario: 'PRODUCTO',
          id_producto_conteoInventario: 3,
        },
      ] as never);
    const crear = jest.spyOn(service, 'create').mockResolvedValue({} as never);
    jest.spyOn(service, 'findAll').mockResolvedValue([]);
    await service.prepare('2026-09-20', 2);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(crear).toHaveBeenCalledWith(
      {
        fecha: '2026-09-20',
        tipo: 'INGREDIENTE',
        idObjetivo: 8,
        cantidadInicial: 4,
      },
      2,
    );
  });

  it.each(['2026-09-19', '2026-09-21'])(
    'no genera registros al consultar %s',
    async (fecha) => {
      const { service, prisma } = setup();
      const listar = jest.spyOn(service, 'findAll').mockResolvedValue([]);
      await service.prepare(fecha, 2);
      expect(listar).toHaveBeenCalledWith(fecha);
      expect(prisma.elementoConteoDiario.findMany).not.toHaveBeenCalled();
    },
  );

  it('tolera que otro equipo cree el mismo conteo durante la preparación', async () => {
    const { service, prisma } = setup();
    jest
      .spyOn(prisma.elementoConteoDiario, 'findMany')
      .mockResolvedValue([
        {
          tipo: 'PRODUCTO',
          idProducto: 3,
          cantidadInicial: new Prisma.Decimal(10),
        },
      ] as never);
    jest.spyOn(service, 'create').mockRejectedValue(new ConflictException());
    const listar = jest.spyOn(service, 'findAll').mockResolvedValue([]);
    await expect(service.prepare('2026-09-20', 2)).resolves.toEqual([]);
    expect(listar).toHaveBeenCalled();
  });

  it('exige saldo inicial para elementos sin historial', async () => {
    const { service, prisma } = setup();
    await expect(
      service.addElement({ tipo: 'PRODUCTO', idObjetivo: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.elementoConteoDiario.upsert).not.toHaveBeenCalled();
  });

  it('permite configurar con el saldo del último cierre y rechaza fracciones de productos', async () => {
    const { service, prisma } = setup({
      anterior: { cantidad_fisica_conteoInventario: new Prisma.Decimal(7) },
    });
    await service.addElement({ tipo: 'PRODUCTO', idObjetivo: 3 });
    expect(prisma.elementoConteoDiario.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          cantidadInicial: new Prisma.Decimal(7),
          fechaInicio: new Date('2026-09-20'),
        }),
      }),
    );
    await expect(
      service.addElement({
        tipo: 'PRODUCTO',
        idObjetivo: 3,
        cantidadInicial: 0.5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retirar de la lista desactiva la configuración sin eliminar el historial', async () => {
    const { service, prisma } = setup();
    jest
      .spyOn(prisma.elementoConteoDiario, 'findUnique')
      .mockResolvedValue({ id: 1 } as never);
    await service.removeElement(1);
    expect(prisma.elementoConteoDiario.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: false },
    });
  });

  it('reserva la configuración y la selección manual al administrador', () => {
    for (const metodo of ['addElement', 'removeElement', 'create'] as const) {
      expect(
        Reflect.getMetadata(
          'roles',
          InventoryCountsController.prototype[metodo],
        ),
      ).toEqual(['ADMIN']);
    }
  });
});

describe('InventoryCountsService', () => {
  it('exige un saldo inicial cuando no existe un cierre anterior', async () => {
    const { service } = setup();

    await expect(
      service.create(
        {
          fecha: '2026-09-14',
          tipo: TipoObjetivoProduccion.INGREDIENTE,
          idObjetivo: 8,
        },
        2,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('encadena el conteo nuevo al ultimo cierre fisico', async () => {
    const anterior = {
      fecha_conteoInventario: new Date('2026-09-13T00:00:00.000Z'),
      cantidad_fisica_conteoInventario: new Prisma.Decimal(7.5),
    };
    const { service, spies } = setup({ anterior });

    await service.create(
      {
        fecha: '2026-09-14',
        tipo: TipoObjetivoProduccion.INGREDIENTE,
        idObjetivo: 8,
        cantidadInicial: 99,
      },
      2,
    );

    expect(spies.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cantidad_anterior_conteoInventario: new Prisma.Decimal(7.5),
          fecha_anterior_conteoInventario: anterior.fecha_conteoInventario,
        }),
      }),
    );
  });

  it('calcula la salida de ingrediente con saldo anterior, entradas y conteo fisico', async () => {
    const { service, spies } = setup({ entradasIngrediente: 2 });

    await service.finalize(4, 7, 11);

    expect(spies.actualizar).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cantidad_entradas_conteoInventario: new Prisma.Decimal(2),
          cantidad_fisica_conteoInventario: new Prisma.Decimal(7),
          cantidad_salida_conteoInventario: new Prisma.Decimal(5),
          stock_sistema_conteoInventario: new Prisma.Decimal(6.5),
          estado_conteoInventario: EstadoConteoInventario.FINALIZADO,
          id_usuario_cierra_conteoInventario: 11,
        }),
      }),
    );
  });

  it('toma las entradas de productos desde mercancia recibida', async () => {
    const { service, spies } = setup({
      entradasProducto: 6,
      conteo: {
        id_conteoInventario: 4,
        fecha_conteoInventario: new Date('2026-09-14T00:00:00.000Z'),
        tipo_objetivo_conteoInventario: TipoObjetivoProduccion.PRODUCTO,
        id_ingrediente_conteoInventario: null,
        id_producto_conteoInventario: 3,
        cantidad_anterior_conteoInventario: new Prisma.Decimal(10),
        estado_conteoInventario: EstadoConteoInventario.PENDIENTE,
      },
    });

    await service.finalize(4, 9, 11);

    expect(spies.entradasProducto).toHaveBeenCalled();
    expect(spies.actualizar).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cantidad_entradas_conteoInventario: new Prisma.Decimal(6),
          cantidad_salida_conteoInventario: new Prisma.Decimal(7),
          stock_sistema_conteoInventario: null,
        }),
      }),
    );
  });

  it('rechaza un conteo fraccionado para productos', async () => {
    const { service } = setup({
      conteo: {
        id_conteoInventario: 4,
        fecha_conteoInventario: new Date('2026-09-14T00:00:00.000Z'),
        tipo_objetivo_conteoInventario: TipoObjetivoProduccion.PRODUCTO,
        id_ingrediente_conteoInventario: null,
        id_producto_conteoInventario: 3,
        cantidad_anterior_conteoInventario: new Prisma.Decimal(10),
        estado_conteoInventario: EstadoConteoInventario.PENDIENTE,
      },
    });

    await expect(service.finalize(4, 2.5, 11)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('no reabre un cierre que ya alimenta un dia posterior', async () => {
    const { service } = setup({
      posteriores: 1,
      conteo: {
        id_conteoInventario: 4,
        fecha_conteoInventario: new Date('2026-09-14T00:00:00.000Z'),
        tipo_objetivo_conteoInventario: TipoObjetivoProduccion.INGREDIENTE,
        id_ingrediente_conteoInventario: 8,
        id_producto_conteoInventario: null,
        estado_conteoInventario: EstadoConteoInventario.FINALIZADO,
      },
    });

    await expect(service.reopen(4)).rejects.toBeInstanceOf(ConflictException);
  });
});
