import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BakeryService } from './bakery.service';
import { ProductionGoalsBakeryService, ProductionSheetsService } from './production.service';

const decimal = (n: number) => new Prisma.Decimal(n);
const hoy = new Date('2026-09-30T00:00:00.000Z');
const entradaDto = { articuloId: 4, cantidad: 12, claveOperacion: '5f32b60c-4bb0-4451-832c-a94db5580e01' };
const panadero = { id_usuario: 7, email_usuario: 'panadero@demo.local', empleado: { nombre_empleado: 'Eva', apellido_empleado: 'Rojas' } };

function hoja(entradas: Array<Record<string, unknown>> = []) {
  return {
    id: 3, fecha: hoy, panaderoId: 7, estado: 'BORRADOR',
    fechaCreacion: new Date('2026-09-30T12:00:00Z'), fechaFinalizacion: null,
    panadero, entradas,
  };
}

function sheetFixture() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 3 }]),
    hojaProduccionPanaderia: {
      upsert: jest.fn().mockResolvedValue(hoja()),
      findUnique: jest.fn().mockResolvedValue(hoja()),
      findUniqueOrThrow: jest.fn().mockResolvedValue(hoja()),
      findMany: jest.fn().mockResolvedValue([hoja()]),
      update: jest.fn().mockResolvedValue(hoja()),
    },
    entradaHojaProduccion: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 10 }),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const bakery = {
    registrarProduccionEnTransaccion: jest.fn().mockResolvedValue({
      articulo: { id: 4, nombre: 'Pan campesino', tipo: 'PANADERIA', precioVenta: decimal(2800) },
      movimiento: { id: 90 },
    }),
  } as unknown as BakeryService;
  return { tx, prisma, bakery, service: new ProductionSheetsService(prisma, bakery) };
}

describe('hojas de produccion de panaderia', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-30T18:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('resume panes y postres con precio congelado y restringe la lista del panadero', async () => {
    const { tx, service } = sheetFixture();
    tx.hojaProduccionPanaderia.findMany.mockResolvedValue([hoja([
      { id: 1, tipoSnapshot: 'PANADERIA', cantidad: decimal(10), subtotal: decimal(25000) },
      { id: 2, tipoSnapshot: 'PASTELERIA', cantidad: decimal(3), subtotal: decimal(21000) },
    ])]);
    const [reporte] = await service.listar('2026-09-30', 7, 'PANADERO');
    expect(tx.hojaProduccionPanaderia.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { fecha: hoy, panaderoId: 7 },
    }));
    expect(reporte.resumen).toEqual({
      PANADERIA: { cantidad: '10', valor: '25000' },
      PASTELERIA: { cantidad: '3', valor: '21000' },
      cantidadTotal: '13', valorTotal: '46000',
    });
    await service.listar(undefined, 8, 'ADMIN_GLOBAL');
    expect(tx.hojaProduccionPanaderia.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { fecha: hoy },
    }));
  });

  it('impide que un panadero vea o finalice la hoja de otra persona', async () => {
    const { service, tx } = sheetFixture();
    await expect(service.obtener(3, 8, 'PANADERO')).rejects.toThrow(ForbiddenException);
    await expect(service.finalizar(3, 8, 'PANADERO')).rejects.toThrow(ForbiddenException);
    await expect(service.finalizar(3, 7, 'ADMIN_GLOBAL')).rejects.toThrow(ForbiddenException);
    expect(tx.hojaProduccionPanaderia.update).not.toHaveBeenCalled();
  });

  it('registra una hornada y su movimiento una vez, con valor snapshot', async () => {
    const { service, tx, bakery } = sheetFixture();
    await service.agregar(7, 'PANADERO', entradaDto);
    expect(bakery.registrarProduccionEnTransaccion).toHaveBeenCalledWith(
      tx, 4, 7, 12, expect.stringContaining('Hoja #3'),
    );
    expect(tx.entradaHojaProduccion.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      hojaId: 3,
      articuloId: 4,
      movimientoId: 90,
      nombreArticuloSnapshot: 'Pan campesino',
      tipoSnapshot: 'PANADERIA',
      cantidad: 12,
      precioUnitarioSnapshot: decimal(2800),
      subtotal: decimal(33600),
    }) });
  });

  it('una clave repetida recupera la hoja sin consumir ingredientes otra vez', async () => {
    const { service, tx, bakery } = sheetFixture();
    tx.entradaHojaProduccion.findUnique.mockResolvedValueOnce({
      hoja: { id: 3, panaderoId: 7 }, articuloId: 4, cantidad: decimal(12),
    });
    await service.agregar(7, 'PANADERO', entradaDto);
    expect(bakery.registrarProduccionEnTransaccion).not.toHaveBeenCalled();
    expect(tx.hojaProduccionPanaderia.upsert).not.toHaveBeenCalled();
  });

  it('no permite reutilizar una clave para otra cantidad, ni escribir en hoja finalizada', async () => {
    const { service, tx, bakery } = sheetFixture();
    tx.entradaHojaProduccion.findUnique.mockResolvedValueOnce({
      hoja: { id: 3, panaderoId: 7 }, articuloId: 4, cantidad: decimal(5),
    });
    await expect(service.agregar(7, 'PANADERO', entradaDto)).rejects.toThrow(ConflictException);
    tx.hojaProduccionPanaderia.findUniqueOrThrow.mockResolvedValue({ ...hoja(), estado: 'FINALIZADA' });
    await expect(service.agregar(7, 'PANADERO', entradaDto)).rejects.toThrow(ConflictException);
    expect(bakery.registrarProduccionEnTransaccion).not.toHaveBeenCalled();
  });

  it('finaliza una sola vez la hoja con entradas y rechaza una vacia', async () => {
    const { service, tx } = sheetFixture();
    tx.entradaHojaProduccion.count.mockResolvedValueOnce(0);
    await expect(service.finalizar(3, 7, 'PANADERO')).rejects.toThrow(ConflictException);
    await service.finalizar(3, 7, 'PANADERO');
    expect(tx.hojaProduccionPanaderia.update).toHaveBeenCalledWith({
      where: { id: 3 }, data: { estado: 'FINALIZADA', fechaFinalizacion: expect.any(Date) },
    });
  });

  it('valida fechas reales y cantidad entera', async () => {
    const { service } = sheetFixture();
    await expect(service.listar('2026-02-30', 7, 'PANADERO')).rejects.toThrow(BadRequestException);
    await expect(service.agregar(7, 'PANADERO', { ...entradaDto, cantidad: 1.5 })).rejects.toThrow(BadRequestException);
  });
});

function goalFixture() {
  const articulo = {
    id: 4, nombre: 'Pan campesino', tipo: 'PANADERIA', activo: true,
    categoria: { id: 1, activa: true },
  };
  const meta = {
    id: 1, fecha: hoy, articuloId: 4, nombreSnapshot: 'Pan campesino',
    tipoSnapshot: 'PANADERIA', cantidadObjetivo: 20, estado: 'PENDIENTE',
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 1 }]),
    metaProduccionPanaderia: {
      findUnique: jest.fn().mockResolvedValue(meta),
      findUniqueOrThrow: jest.fn().mockResolvedValue(meta),
      update: jest.fn().mockResolvedValue(meta),
      delete: jest.fn().mockResolvedValue(meta),
    },
  };
  const prisma = {
    articuloPanaderia: { findUnique: jest.fn().mockResolvedValue(articulo) },
    metaProduccionPanaderia: {
      findMany: jest.fn().mockResolvedValue([meta]),
      create: jest.fn().mockResolvedValue(meta),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  return { tx, prisma, service: new ProductionGoalsBakeryService(prisma), articulo, meta };
}

describe('metas completas de panaderia', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-30T18:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('crea solo metas enteras de productos activos con categoria activa', async () => {
    const { service, prisma, articulo } = goalFixture();
    await service.crear({ fecha: '2026-09-30', articuloId: 4, cantidadObjetivo: 20 }, 9);
    expect(prisma.metaProduccionPanaderia.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nombreSnapshot: 'Pan campesino', cantidadObjetivo: 20, usuarioCreaId: 9 }),
    }));
    await expect(service.crear({ fecha: '2026-09-30', articuloId: 4, cantidadObjetivo: 0.5 }, 9))
      .rejects.toThrow(BadRequestException);
    (prisma.articuloPanaderia.findUnique as jest.Mock).mockResolvedValue({ ...articulo, categoria: null });
    await expect(service.crear({ fecha: '2026-09-30', articuloId: 4, cantidadObjetivo: 2 }, 9))
      .rejects.toThrow(ConflictException);
  });

  it('solo panadero resuelve; solo administrador reabre, sin cantidades parciales', async () => {
    const { service, tx, meta } = goalFixture();
    await service.actualizarEstado(1, 'PRODUCIDO', 7, false);
    expect(tx.metaProduccionPanaderia.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { estado: 'PRODUCIDO', usuarioResuelveId: 7, fechaResolucion: expect.any(Date) },
    }));
    await expect(service.actualizarEstado(1, 'PRODUCIDO', 9, true)).rejects.toThrow(ForbiddenException);
    await expect(service.actualizarEstado(1, 'PENDIENTE', 7, false)).rejects.toThrow(ForbiddenException);
    tx.metaProduccionPanaderia.findUnique.mockResolvedValue({ ...meta, estado: 'PRODUCIDO' });
    await expect(service.actualizarEstado(1, 'NO_PRODUCIDO', 7, false)).rejects.toThrow(ForbiddenException);
    await service.actualizarEstado(1, 'PENDIENTE', 9, true);
    expect(tx.metaProduccionPanaderia.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { estado: 'PENDIENTE', usuarioResuelveId: null, fechaResolucion: null },
    }));
  });

  it('conserva metas resueltas y permite eliminar solo pendientes', async () => {
    const { service, tx, meta } = goalFixture();
    tx.metaProduccionPanaderia.findUnique.mockResolvedValueOnce({ ...meta, estado: 'PRODUCIDO' });
    await expect(service.eliminar(1)).rejects.toThrow(ConflictException);
    await service.eliminar(1);
    expect(tx.metaProduccionPanaderia.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    tx.metaProduccionPanaderia.findUnique.mockResolvedValue(null);
    await expect(service.eliminar(999)).rejects.toThrow(NotFoundException);
  });
});

function inventoryFixture(harina = 20) {
  const articulos = new Map([
    [4, { id: 4, nombre: 'Pan campesino', tipo: 'PANADERIA', activo: true, categoriaId: 1,
      unidad: 'UNIDADES', existencia: decimal(2), precioVenta: decimal(2800) }],
    [5, { id: 5, nombre: 'Harina', tipo: 'INSUMO', activo: true, categoriaId: null,
      unidad: 'kg', existencia: decimal(harina), precioVenta: decimal(0) }],
  ]);
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 4 }]),
    articuloPanaderia: {
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: number } }) => Promise.resolve(articulos.get(where.id))),
      update: jest.fn().mockResolvedValue({}),
    },
    categoriaPanaderia: { findUnique: jest.fn().mockResolvedValue({ id: 1, activa: true }) },
    recetaPanaderia: { findFirst: jest.fn().mockResolvedValue({ id: 12, detalles: [{ insumoId: 5, cantidadUnidad: decimal(0.5) }] }) },
    movimientoPanaderia: { create: jest.fn().mockResolvedValue({ id: 90 }) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  return { tx, bakery: new BakeryService(prisma) };
}

describe('hornadas y receta atomicas', () => {
  it('rechaza la antigua entrada directa de panes sin alterar existencias', async () => {
    const { bakery, tx } = inventoryFixture();
    await expect(bakery.registrarEntrada(4, 7, { cantidad: 12, concepto: 'Hornada' }))
      .rejects.toThrow(/hoja diaria/);
    expect(tx.articuloPanaderia.update).not.toHaveBeenCalled();
    expect(tx.movimientoPanaderia.create).not.toHaveBeenCalled();
  });

  it('descuenta la receta y registra la hornada en una sola transaccion', async () => {
    const { bakery, tx } = inventoryFixture();
    await bakery.registrarProduccionEnTransaccion(tx as unknown as Prisma.TransactionClient, 4, 7, 12, 'Hoja #3');
    expect(tx.movimientoPanaderia.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      articuloId: 5, tipo: 'CONSUMO_RECETA', cantidad: decimal(6),
      existenciaAntes: decimal(20), existenciaDespues: decimal(14), recetaId: 12,
    }) });
    expect(tx.movimientoPanaderia.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      articuloId: 4, tipo: 'PRODUCCION', cantidad: decimal(12),
      existenciaAntes: decimal(2), existenciaDespues: decimal(14), recetaId: 12,
    }) });
  });

  it('falla si el insumo no alcanza y no crea el movimiento de producto', async () => {
    const { bakery, tx } = inventoryFixture(5);
    await expect(bakery.registrarProduccionEnTransaccion(tx as unknown as Prisma.TransactionClient, 4, 7, 12, 'Hoja #3'))
      .rejects.toThrow(ConflictException);
    expect(tx.movimientoPanaderia.create).not.toHaveBeenCalled();
  });

  it('exige categoria activa y receta activa para crear una hornada', async () => {
    const { bakery, tx } = inventoryFixture();
    tx.categoriaPanaderia.findUnique.mockResolvedValueOnce({ id: 1, activa: false });
    await expect(bakery.registrarProduccionEnTransaccion(tx as unknown as Prisma.TransactionClient, 4, 7, 12, 'Hoja #3'))
      .rejects.toThrow(ConflictException);
    tx.recetaPanaderia.findFirst.mockResolvedValueOnce(null);
    await expect(bakery.registrarProduccionEnTransaccion(tx as unknown as Prisma.TransactionClient, 4, 7, 12, 'Hoja #3'))
      .rejects.toThrow(ConflictException);
    expect(tx.movimientoPanaderia.create).not.toHaveBeenCalled();
  });
});
