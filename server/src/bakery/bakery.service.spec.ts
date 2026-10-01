import { Prisma } from '../generated/prisma/client';
import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { BakeryService, resumenConteo } from './bakery.service';
import { BakeryController } from './bakery.controller';
import { PrismaService } from '../prisma/prisma.service';

const decimal = (valor: number) => new Prisma.Decimal(valor);
const elemento = <T extends { id: number; nombre: string }>(articulo: T) => ({
  id: articulo.id,
  articuloId: articulo.id,
  activo: true,
  fechaInicio: new Date('2026-09-01'),
  fechaFin: null,
  articulo,
});

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
    elementoConteoPanaderia: {
      findFirst: jest.fn().mockResolvedValue(elemento(articulo)),
      findMany: jest.fn().mockResolvedValue([elemento(articulo)]),
      findUnique: jest.fn().mockResolvedValue(elemento(articulo)),
      create: jest.fn(),
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
      create: jest.fn().mockResolvedValue({ id: 42 }),
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

  it('no permite contar un articulo que el administrador retiro de la lista', async () => {
    const { servicio, tx } = conteoFixture();
    tx.elementoConteoPanaderia.findFirst.mockResolvedValue(null);
    await expect(servicio.registrarConteo(1, 2, { cantidadFisica: 12 }))
      .rejects.toThrow(ConflictException);
    expect(tx.conteoPanaderia.upsert).not.toHaveBeenCalled();
  });

  it('agrega y retira articulos existentes, conservando intervalo historico', async () => {
    const { servicio, tx } = conteoFixture();
    tx.elementoConteoPanaderia.findFirst.mockResolvedValue(null);
    await servicio.agregarElementoConteo(1);
    expect(tx.elementoConteoPanaderia.create).toHaveBeenCalledWith({
      data: { articuloId: 1, fechaInicio: new Date('2026-09-29') },
      include: { articulo: true },
    });
    await servicio.retirarElementoConteo(1);
    expect(tx.elementoConteoPanaderia.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: false, fechaFin: new Date('2026-09-29') },
    });
  });

  it('requiere que los articulos configurados historicamente esten contados al cerrar esa fecha', async () => {
    const { servicio, tx } = conteoFixture();
    const estado = await servicio.estadoConteo(new Date('2026-09-28'));
    expect(estado.proyeccion).toEqual([]);
    expect(estado.faltantes).toEqual(['Pan']);
    expect(estado.completo).toBe(false);
    expect(tx.elementoConteoPanaderia.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ fechaInicio: { lte: new Date('2026-09-28') } }),
    }));
  });

  it('registra una salida manual con razon sin confundirla con venta ni perdida', async () => {
    const { servicio, tx } = conteoFixture({
      existencia: 8,
      movimientos: [{
        id: 8, articuloId: 1, tipo: 'SALIDA_MANUAL', cantidad: decimal(2),
        existenciaAntes: decimal(10), fecha: new Date('2026-09-29T15:00:00Z'),
      }],
    });
    const conteo = await servicio.registrarConteo(1, 2, { cantidadFisica: 8 });
    expect(conteo.salidasJustificadas.toString()).toBe('2');
    expect(conteo.conciliacion.ventaFisicaEstimada).toBe('0');
    expect(conteo.valoracion.perdidaEstimada).toBe('0');
    await servicio.registrarSalidaManual(1, 2, { cantidad: 2, concepto: ' Degustacion ' });
    expect(tx.movimientoPanaderia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        articuloId: 1, tipo: 'SALIDA_MANUAL', cantidad: decimal(2), concepto: 'Degustacion',
        existenciaAntes: decimal(8), existenciaDespues: decimal(6),
      }),
    });
    await expect(servicio.registrarSalidaManual(1, 2, { cantidad: 20, concepto: 'Prueba' }))
      .rejects.toThrow(ConflictException);
    await expect(servicio.registrarSalidaManual(1, 2, { cantidad: 1, concepto: '   ' }))
      .rejects.toThrow(UnprocessableEntityException);
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

  it('no reconstruye saldos con la lista actual al consultar una fecha pasada', async () => {
    const { servicio, tx } = conteoFixture();
    await servicio.estadoConteo(new Date('2026-09-28'));
    expect(tx.conteoPanaderia.findMany).toHaveBeenCalledTimes(1);
    expect(tx.conteoPanaderia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fecha: new Date('2026-09-28') } }),
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
      elementoConteoPanaderia: { findMany: jest.fn().mockResolvedValue([
        elemento({ id: 1, nombre: 'Pan' }), elemento({ id: 2, nombre: 'Postre' }),
      ]) },
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
        elementoConteoPanaderia: { findMany: jest.fn().mockResolvedValue([
          elemento({ id: 1, nombre: 'Pan' }),
        ]) },
        conteoPanaderia: { findMany: jest.fn().mockResolvedValue([]) },
        movimientoPanaderia: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;
      const estado = await new BakeryService(prisma).estadoConteo(
        new Date(fecha),
      );
      if (fecha === '2026-09-28') {
        expect(estado.proyeccion).toEqual([]);
      } else {
        expect(estado.proyeccion[0].cantidadInicial).toBeNull();
      }
    },
  );

  it('usa las fotos contadas, incluso de articulos hoy inactivos, al consultar un dia pasado', async () => {
    const articuloContado = { id: 2, nombre: 'Pan antiguo', activo: false };
    const conteo = {
      articuloId: 2,
      articulo: articuloContado,
      cantidadInicial: decimal(12),
      entradas: decimal(3),
      ventasRegistradas: decimal(4),
      transferencias: decimal(0),
      mermas: decimal(0),
      consumoReceta: decimal(0),
      cantidadFisica: decimal(11),
      precioReferencia: decimal(2500),
      fechaRegistro: new Date('2026-09-28T22:00:00Z'),
    };
    const prisma = {
      articuloPanaderia: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, nombre: 'Pan nuevo', activo: true }]),
      },
      elementoConteoPanaderia: { findMany: jest.fn().mockResolvedValue([]) },
      conteoPanaderia: { findMany: jest.fn().mockResolvedValue([conteo]) },
      movimientoPanaderia: { findMany: jest.fn().mockResolvedValue([{
        articuloId: 2,
        tipo: 'VENTA',
        fecha: new Date('2026-09-28T22:30:00Z'),
      }]) },
    } as unknown as PrismaService;
    const estado = await new BakeryService(prisma).estadoConteo(new Date('2026-09-28'));
    expect(estado.detalle).toHaveLength(1);
    expect(estado.detalle[0].articulo.nombre).toBe('Pan antiguo');
    expect(estado.detalle[0].requiereReconteo).toBe(true);
    expect(estado.completo).toBe(false);
    expect(estado.recontar).toEqual(['Pan antiguo']);
    expect(estado.proyeccion).toEqual([expect.objectContaining({
      articuloId: 2,
      cantidadInicial: decimal(12),
      entradas: decimal(3),
      ventasRegistradas: decimal(4),
    })]);
    expect(prisma.conteoPanaderia.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.movimientoPanaderia.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ articuloId: { in: [2] } }),
    }));
  });

  it('no certifica un cierre anterior a la configuracion solo por una foto aislada', async () => {
    const conteo = {
      articuloId: 1,
      articulo: { id: 1, nombre: 'Pan' },
      cantidadInicial: decimal(10), entradas: decimal(0),
      ventasRegistradas: decimal(0), transferencias: decimal(0),
      mermas: decimal(0), salidasJustificadas: decimal(0), consumoReceta: decimal(0),
      cantidadFisica: decimal(10), precioReferencia: decimal(2000),
      fechaRegistro: new Date('2026-09-28T20:00:00Z'),
    };
    const prisma = {
      elementoConteoPanaderia: { findMany: jest.fn().mockResolvedValue([]) },
      conteoPanaderia: { findMany: jest.fn().mockResolvedValue([conteo]) },
      movimientoPanaderia: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const estado = await new BakeryService(prisma).estadoConteo(new Date('2026-09-28'));
    expect(estado.detalle).toHaveLength(1);
    expect(estado.faltantes).toEqual([]);
    expect(estado.completo).toBe(false);
  });

  it('proyecta la lista vigente para una fecha futura sin calcular saldos ni escribir conteos', async () => {
    const prisma = {
      articuloPanaderia: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, nombre: 'Pan', activo: true, existencia: decimal(12) }]),
      },
      elementoConteoPanaderia: { findMany: jest.fn().mockResolvedValue([
        elemento({ id: 1, nombre: 'Pan', existencia: decimal(21) }),
      ]) },
      conteoPanaderia: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      movimientoPanaderia: { findMany: jest.fn() },
    } as unknown as PrismaService;
    const estado = await new BakeryService(prisma).estadoConteo(new Date('2026-09-30'));
    expect(estado.proyeccion).toEqual([expect.objectContaining({ articuloId: 1, cantidadInicial: null })]);
    expect(prisma.conteoPanaderia.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.conteoPanaderia.upsert).not.toHaveBeenCalled();
    expect(prisma.movimientoPanaderia.findMany).not.toHaveBeenCalled();
  });

  it('valida la fecha de la consulta de conteos de panaderia', async () => {
    const servicio = { estadoConteo: jest.fn().mockResolvedValue({ detalle: [] }) };
    const controller = new BakeryController(servicio as unknown as BakeryService);
    await expect(controller.estadoConteo('2026-09-28')).resolves.toEqual({ detalle: [] });
    expect(servicio.estadoConteo).toHaveBeenCalledWith(new Date('2026-09-28'));
    expect(() => controller.estadoConteo('2026-02-30')).toThrow(BadRequestException);
    expect(() => controller.estadoConteo('30/09/2026')).toThrow(BadRequestException);
  });

  it('la proyección de hoy sin movimientos usa existencia, sin escribir un conteo', async () => {
    const prisma = {
      articuloPanaderia: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 1, nombre: 'Pan', existencia: decimal(21) },
          ]),
      },
      elementoConteoPanaderia: { findMany: jest.fn().mockResolvedValue([
        elemento({ id: 1, nombre: 'Pan', existencia: decimal(21) }),
      ]) },
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

  it('hoy solo exige articulos de la lista fija y conserva fotos de los retirados', async () => {
    const pan = { id: 1, nombre: 'Pan', existencia: decimal(10), activo: true };
    const retirado = { id: 2, nombre: 'Postre', existencia: decimal(3), activo: true };
    const conteoRetirado = {
      articuloId: 2, articulo: retirado, cantidadInicial: decimal(3),
      entradas: decimal(0), ventasRegistradas: decimal(0), transferencias: decimal(0),
      mermas: decimal(0), salidasJustificadas: decimal(0), consumoReceta: decimal(0),
      cantidadFisica: decimal(3), precioReferencia: decimal(5000), fechaRegistro: new Date(),
    };
    const prisma = {
      elementoConteoPanaderia: { findMany: jest.fn().mockResolvedValue([elemento(pan)]) },
      conteoPanaderia: { findMany: jest.fn(({ where }: { where: { fecha: Date | { lt: Date } } }) =>
        Promise.resolve(where.fecha instanceof Date ? [conteoRetirado] : [])) },
      movimientoPanaderia: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const estado = await new BakeryService(prisma).estadoConteo();
    expect(estado.proyeccion.map((fila) => fila.articuloId)).toEqual([1]);
    expect(estado.faltantes).toEqual(['Pan']);
    expect(estado.detalle.map((fila) => fila.articuloId)).toEqual([2]);
    expect(estado.articulosConfigurados).toEqual([1]);
    expect(estado.completo).toBe(false);
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
      elementoConteoPanaderia: { findMany: jest.fn().mockResolvedValue([elemento(articulo)]) },
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
    expect(estado.proyeccion[0].cantidadInicial!.toString()).toBe('12');
  });
});
