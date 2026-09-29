import { Prisma } from '../generated/prisma/client';
import { BakeryService, resumenConteo } from './bakery.service';
import { PrismaService } from '../prisma/prisma.service';

const decimal = (valor: number) => new Prisma.Decimal(valor);

function conteoFixture({
  existencia = 20,
  previo = null,
  anteriores = [],
  movimientos = [],
  movimientosPrevios = [],
  tipo = 'PANADERIA',
  unidad = 'UNIDADES',
}: {
  existencia?: number;
  previo?: { cantidadInicial: Prisma.Decimal } | null;
  anteriores?: {
    articuloId: number;
    cantidadFisica: Prisma.Decimal;
    fechaRegistro: Date;
  }[];
  movimientos?: {
    id: number;
    articuloId: number;
    tipo: string;
    cantidad: Prisma.Decimal;
    existenciaAntes: Prisma.Decimal;
    fecha: Date;
  }[];
  movimientosPrevios?: {
    articuloId: number;
    tipo: string;
    existenciaAntes: Prisma.Decimal;
    existenciaDespues: Prisma.Decimal;
    fecha: Date;
  }[];
  tipo?: string;
  unidad?: string;
} = {}) {
  const articulo = {
    id: 1,
    nombre: 'Pan',
    activo: true,
    tipo,
    unidad,
    existencia: decimal(existencia),
    precioVenta: decimal(2500),
    costoReferencia: decimal(500),
  };
  const guardar = jest.fn(
    ({
      create,
      update,
    }: {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) =>
      Promise.resolve({
        ...(previo ? update : create),
        articulo,
        articuloId: 1,
      }),
  );
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 1 }]),
    articuloPanaderia: {
      findMany: jest.fn().mockResolvedValue([articulo]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(articulo),
      update: jest.fn(),
    },
    conteoPanaderia: {
      findUnique: jest.fn().mockResolvedValue(previo),
      findMany: jest.fn(
        ({ where }: { where: { fecha: Date | { lt: Date } } }) =>
          Promise.resolve(where.fecha instanceof Date ? [] : anteriores),
      ),
      upsert: guardar,
    },
    movimientoPanaderia: {
      findMany: jest.fn(({ where }: { where: { fecha: { gt?: Date } } }) =>
        Promise.resolve(where.fecha.gt ? movimientosPrevios : movimientos),
      ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: (callback: (db: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaService;
  return { servicio: new BakeryService(prisma), guardar, tx };
}

describe('conciliacion de inventario de panaderia', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T22:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('inicia el primer conteo sin movimientos con la existencia real del inventario', async () => {
    const { servicio, guardar, tx } = conteoFixture({ existencia: 17 });
    await servicio.registrarConteo(1, 2, { cantidadFisica: 17 });
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ cantidadInicial: decimal(17) }),
      }),
    );
    expect(tx.articuloPanaderia.update).not.toHaveBeenCalled();
  });

  it('el primer conteo conserva apertura del libro, no vuelve a sumar la entrada al stock actual', async () => {
    const { servicio, guardar } = conteoFixture({
      existencia: 80,
      movimientos: [
        {
          id: 1,
          articuloId: 1,
          tipo: 'RECEPCION',
          cantidad: decimal(20),
          existenciaAntes: decimal(70),
          fecha: new Date('2026-09-29T10:00:00Z'),
        },
        {
          id: 2,
          articuloId: 1,
          tipo: 'VENTA',
          cantidad: decimal(10),
          existenciaAntes: decimal(90),
          fecha: new Date('2026-09-29T12:00:00Z'),
        },
      ],
    });
    const conteo = await servicio.registrarConteo(1, 2, { cantidadFisica: 80 });
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          cantidadInicial: decimal(70),
          entradas: decimal(20),
          ventasRegistradas: decimal(10),
        }),
      }),
    );
    expect(conteo.conciliacion.diferenciaUnidades).toBe('0');
    expect(conteo.valoracion.perdidaEstimada).toBe('0');
    expect(conteo.valoracion.ingresoEstimado).toBe('25000');
  });

  it('acepta la apertura fraccionaria de un insumo y distingue consumo de receta', async () => {
    const { servicio, guardar } = conteoFixture({
      tipo: 'INSUMO',
      unidad: 'kg',
      existencia: 6.125,
      movimientos: [
        {
          id: 1,
          articuloId: 1,
          tipo: 'RECEPCION',
          cantidad: decimal(2.5),
          existenciaAntes: decimal(4.125),
          fecha: new Date('2026-09-29T10:00:00Z'),
        },
        {
          id: 2,
          articuloId: 1,
          tipo: 'CONSUMO_RECETA',
          cantidad: decimal(0.5),
          existenciaAntes: decimal(6.625),
          fecha: new Date('2026-09-29T12:00:00Z'),
        },
      ],
    });
    const conteo = await servicio.registrarConteo(1, 2, {
      cantidadFisica: 6.125,
    });
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          cantidadInicial: decimal(4.125),
          entradas: decimal(2.5),
        }),
      }),
    );
    expect(conteo.valoracion.costoConsumido).toBe('250');
    expect(conteo.valoracion.perdidaEstimada).toBe('0');
    expect(conteo.valoracion.ingresoEstimado).toBe('0');
  });

  it('un reconteo conserva la apertura congelada aunque cambie la existencia', async () => {
    const { servicio, guardar, tx } = conteoFixture({
      existencia: 99,
      previo: { cantidadInicial: decimal(17) },
    });
    await servicio.registrarConteo(1, 2, { cantidadFisica: 17 });
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ cantidadInicial: decimal(17) }),
      }),
    );
    expect(tx.conteoPanaderia.findMany).not.toHaveBeenCalled();
  });

  it('encadena al conteo físico anterior aunque la existencia cacheada no haya sido ajustada', async () => {
    const { servicio, guardar, tx } = conteoFixture({
      existencia: 20,
      anteriores: [
        {
          articuloId: 1,
          cantidadFisica: decimal(17),
          fechaRegistro: new Date('2026-09-28T22:00:00Z'),
        },
      ],
    });
    const proyeccion = await servicio.estadoConteo();
    expect(proyeccion.proyeccion[0].cantidadInicial!.toString()).toBe('17');
    const contado = await servicio.registrarConteo(1, 2, {
      cantidadFisica: 17,
    });
    expect(contado.cantidadInicial!.toString()).toBe('17');
    expect(contado.valoracion.perdidaEstimada).toBe('0');
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ cantidadInicial: decimal(17) }),
      }),
    );
    expect(tx.articuloPanaderia.update).not.toHaveBeenCalled();
  });

  it('incluye entradas y salidas posteriores al cierre previo, incluso días omitidos', async () => {
    const { servicio } = conteoFixture({
      existencia: 99,
      anteriores: [
        {
          articuloId: 1,
          cantidadFisica: decimal(17),
          fechaRegistro: new Date('2026-09-26T22:00:00Z'),
        },
      ],
      movimientosPrevios: [
        {
          articuloId: 1,
          tipo: 'RECEPCION',
          existenciaAntes: decimal(20),
          existenciaDespues: decimal(25),
          fecha: new Date('2026-09-27T12:00:00Z'),
        },
        {
          articuloId: 1,
          tipo: 'VENTA',
          existenciaAntes: decimal(25),
          existenciaDespues: decimal(23),
          fecha: new Date('2026-09-28T23:00:00Z'),
        },
      ],
    });
    const proyeccion = await servicio.estadoConteo();
    expect(proyeccion.proyeccion[0].cantidadInicial!.toString()).toBe('20');
    const contado = await servicio.registrarConteo(1, 2, {
      cantidadFisica: 20,
    });
    expect(contado.cantidadInicial!.toString()).toBe('20');
    expect(contado.valoracion.perdidaEstimada).toBe('0');
  });

  it('no aplica dos veces el ajuste de stock producido por aquel conteo físico', async () => {
    const { servicio, tx } = conteoFixture({
      existencia: 20,
      anteriores: [
        {
          articuloId: 1,
          cantidadFisica: decimal(17),
          fechaRegistro: new Date('2026-09-28T22:00:00Z'),
        },
      ],
      movimientosPrevios: [
        {
          articuloId: 1,
          tipo: 'AJUSTE_CONTEO',
          existenciaAntes: decimal(20),
          existenciaDespues: decimal(17),
          fecha: new Date('2026-09-28T22:01:00Z'),
        },
        {
          articuloId: 1,
          tipo: 'RECEPCION',
          existenciaAntes: decimal(17),
          existenciaDespues: decimal(22),
          fecha: new Date('2026-09-28T23:00:00Z'),
        },
        {
          articuloId: 1,
          tipo: 'VENTA',
          existenciaAntes: decimal(22),
          existenciaDespues: decimal(20),
          fecha: new Date('2026-09-29T04:59:00Z'),
        },
        {
          articuloId: 1,
          tipo: 'RECEPCION',
          existenciaAntes: decimal(10),
          existenciaDespues: decimal(99),
          fecha: new Date('2026-09-28T21:00:00Z'),
        },
      ],
    });
    const contado = await servicio.registrarConteo(1, 2, {
      cantidadFisica: 20,
    });
    expect(contado.cantidadInicial!.toString()).toBe('20');
    expect(tx.movimientoPanaderia.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          articuloId: { in: [1] },
          fecha: {
            gt: new Date('2026-09-28T22:00:00Z'),
            lt: new Date('2026-09-29T05:00:00Z'),
          },
          tipo: { not: 'AJUSTE_CONTEO' },
        },
      }),
    );
  });

  it('solo consulta conteos previos que ya existían al iniciar la fecha seleccionada', async () => {
    const { servicio, tx } = conteoFixture();
    await servicio.estadoConteo(new Date('2026-09-28'));
    expect(tx.conteoPanaderia.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          articuloId: { in: [1] },
          fecha: { lt: new Date('2026-09-28') },
          fechaRegistro: { lte: new Date('2026-09-28T05:00:00Z') },
        },
      }),
    );
  });

  it('resuelve las bases de varios artículos con consultas por lote, no por artículo', async () => {
    const anteriores = [
      {
        articuloId: 1,
        cantidadFisica: decimal(17),
        fechaRegistro: new Date('2026-09-28T22:00:00Z'),
      },
      {
        articuloId: 2,
        cantidadFisica: decimal(9),
        fechaRegistro: new Date('2026-09-28T23:00:00Z'),
      },
    ];
    const previos = [
      {
        articuloId: 1,
        tipo: 'RECEPCION',
        existenciaAntes: decimal(20),
        existenciaDespues: decimal(22),
        fecha: new Date('2026-09-28T22:30:00Z'),
      },
      {
        articuloId: 2,
        tipo: 'RECEPCION',
        existenciaAntes: decimal(10),
        existenciaDespues: decimal(30),
        fecha: new Date('2026-09-28T22:30:00Z'),
      },
      {
        articuloId: 2,
        tipo: 'VENTA',
        existenciaAntes: decimal(30),
        existenciaDespues: decimal(29),
        fecha: new Date('2026-09-28T23:30:00Z'),
      },
    ];
    const prisma = {
      articuloPanaderia: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, nombre: 'Pan', existencia: decimal(22) },
          { id: 2, nombre: 'Postre', existencia: decimal(29) },
        ]),
      },
      conteoPanaderia: {
        findMany: jest.fn(
          ({ where }: { where: { fecha: Date | { lt: Date } } }) =>
            Promise.resolve(where.fecha instanceof Date ? [] : anteriores),
        ),
      },
      movimientoPanaderia: {
        findMany: jest.fn(({ where }: { where: { fecha: { gt?: Date } } }) =>
          Promise.resolve(where.fecha.gt ? previos : []),
        ),
      },
    } as unknown as PrismaService;
    const estado = await new BakeryService(prisma).estadoConteo();
    expect(
      estado.proyeccion.map((fila) => fila.cantidadInicial!.toString()),
    ).toEqual(['19', '8']);
    expect(prisma.conteoPanaderia.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.movimientoPanaderia.findMany).toHaveBeenCalledTimes(2);
  });

  it.each(['2026-09-28', '2026-09-30'])(
    'no presenta stock actual como saldo de otra fecha sin historial: %s',
    async (fecha) => {
      const prisma = {
        articuloPanaderia: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 1, nombre: 'Pan', existencia: decimal(99) },
            ]),
        },
        conteoPanaderia: { findMany: jest.fn().mockResolvedValue([]) },
        movimientoPanaderia: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;
      const estado = await new BakeryService(prisma).estadoConteo(
        new Date(fecha),
      );
      expect(estado.proyeccion[0].cantidadInicial).toBeNull();
    },
  );

  it('la proyección de hoy sin movimientos usa existencia, sin escribir un conteo', async () => {
    const prisma = {
      articuloPanaderia: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 1, nombre: 'Pan', existencia: decimal(21) },
          ]),
      },
      conteoPanaderia: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      movimientoPanaderia: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const estado = await new BakeryService(prisma).estadoConteo();
    expect(estado.proyeccion[0].cantidadInicial!.toString()).toBe('21');
    expect(prisma.conteoPanaderia.upsert).not.toHaveBeenCalled();
  });

  it('muestra como diferencia lo que falta frente a las ventas registradas', () => {
    expect(
      resumenConteo({
        cantidadInicial: decimal(20),
        entradas: decimal(10),
        ventasRegistradas: decimal(7),
        transferencias: decimal(2),
        mermas: decimal(1),
        cantidadFisica: decimal(17),
        precioReferencia: decimal(2500),
      }),
    ).toEqual({
      salidaFisica: '13',
      ventaFisicaEstimada: '10',
      diferenciaUnidades: '3',
      valorDiferencia: '7500',
    });
  });

  it('no confunde una merma o traslado registrado con una venta', () => {
    expect(
      resumenConteo({
        cantidadInicial: decimal(10),
        entradas: decimal(0),
        ventasRegistradas: decimal(4),
        transferencias: decimal(2),
        mermas: decimal(1),
        cantidadFisica: decimal(3),
        precioReferencia: decimal(3000),
      }).diferenciaUnidades,
    ).toBe('0');
  });

  it('descuenta el consumo de receta de la salida física antes de estimar ventas', () => {
    expect(
      resumenConteo({
        cantidadInicial: decimal(5),
        entradas: decimal(2.5),
        ventasRegistradas: decimal(0),
        transferencias: decimal(0),
        mermas: decimal(0),
        consumoReceta: decimal(1),
        cantidadFisica: decimal(6.5),
        precioReferencia: decimal(0),
      }).diferenciaUnidades,
    ).toBe('0');
  });

  it('requiere recontar si hubo una salida despues del conteo', async () => {
    const fechaRegistro = new Date('2026-09-24T22:00:00Z');
    const articulo = {
      id: 1,
      nombre: 'Pan',
      activo: true,
      existencia: decimal(10),
      precioVenta: decimal(2500),
    };
    const conteo = {
      articuloId: 1,
      articulo,
      cantidadInicial: decimal(12),
      entradas: decimal(3),
      ventasRegistradas: decimal(5),
      transferencias: decimal(0),
      mermas: decimal(0),
      cantidadFisica: decimal(10),
      precioReferencia: decimal(2500),
      fechaRegistro,
    };
    const prisma = {
      articuloPanaderia: { findMany: jest.fn().mockResolvedValue([articulo]) },
      conteoPanaderia: { findMany: jest.fn().mockResolvedValue([conteo]) },
      movimientoPanaderia: {
        findMany: jest.fn().mockResolvedValue([
          {
            articuloId: 1,
            tipo: 'VENTA',
            cantidad: decimal(1),
            existenciaAntes: decimal(11),
            fecha: new Date('2026-09-24T22:05:00Z'),
          },
        ]),
      },
    } as unknown as PrismaService;
    const servicio = new BakeryService(prisma);
    const estado = await servicio.estadoConteo(
      new Date('2026-09-24T05:00:00Z'),
    );
    expect(estado.completo).toBe(false);
    expect(estado.recontar).toEqual(['Pan']);
    expect(estado.proyeccion[0].cantidadInicial.toString()).toBe('12');
  });
});
