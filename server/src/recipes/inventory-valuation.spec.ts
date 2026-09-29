import { Prisma } from '../generated/prisma/client';
import { crearValoracion, presentarValoracion } from './inventory-valuation';
import {
  agregarValoraciones,
  InventoryValuationService,
  rangoFechas,
  rangoMes,
} from './inventory-valuation.service';
import {
  actividadRestauranteEnRango,
  compararConteo,
} from './inventory-reconciliation';
import { accessContext } from '../auth/access-context';
import { PrismaService } from '../prisma/prisma.service';

const referencia = (
  cambios: Partial<Parameters<typeof crearValoracion>[0]> = {},
) =>
  crearValoracion({
    tipoReferencia: 'PRECIO_VENTA',
    precioReferencia: 2500,
    nombre: 'Agua',
    unidad: 'UNIDADES',
    salidaFisica: 10,
    cantidadCorroborada: 7,
    fechaValoracion: new Date('2026-09-30T03:00:00Z'),
    ...cambios,
  });

describe('Valoración conservadora de conteos', () => {
  it('separa siete ventas corroboradas de tres unidades desaparecidas, sin cobrar ni crear ventas', () => {
    expect(referencia()).toMatchObject({
      estado: 'VALIDA',
      cantidadReconocida: '7',
      cantidadFaltante: '3',
      cantidadSobrante: '0',
      ingresoEstimado: '17500',
      perdidaEstimada: '7500',
      valorSobrante: '0',
      costoConsumido: '0',
    });
  });

  it('no atribuye ingresos a transferencias, mermas ni consumo de receta', () => {
    expect(
      referencia({
        salidaFisica: 10,
        cantidadCorroborada: 5,
        salidasNoValorables: 5,
      }),
    ).toMatchObject({
      ingresoEstimado: '12500',
      perdidaEstimada: '0',
      cantidadReconocida: '5',
    });
  });

  it('valora ingredientes fraccionarios a costo; consumo reconocido no es ingreso', () => {
    expect(
      referencia({
        tipoReferencia: 'COSTO_UNITARIO',
        precioReferencia: 12500,
        salidaFisica: '2.5',
        cantidadCorroborada: '1.25',
        salidasNoValorables: '0.75',
      }),
    ).toMatchObject({
      cantidadReconocida: '1.25',
      cantidadFaltante: '0.5',
      costoConsumido: '15625',
      ingresoEstimado: '0',
      perdidaEstimada: '6250',
    });
  });

  it('para harina, reconoce receta y distingue faltante después de traspasos y merma', () => {
    expect(
      referencia({
        tipoReferencia: 'COSTO_UNITARIO',
        precioReferencia: 2000,
        salidaFisica: 4,
        cantidadCorroborada: 2,
        salidasNoValorables: 1,
      }),
    ).toMatchObject({
      costoConsumido: '4000',
      perdidaEstimada: '2000',
      cantidadFaltante: '1',
    });
  });

  it('no convierte sobrantes ni salidas negativas en ingresos o pérdidas negativas', () => {
    expect(
      referencia({ salidaFisica: 5, cantidadCorroborada: 7 }),
    ).toMatchObject({
      cantidadReconocida: '5',
      ingresoEstimado: '12500',
      perdidaEstimada: '0',
      valorSobrante: '5000',
      cantidadSobrante: '2',
    });
    expect(
      referencia({ salidaFisica: -2, cantidadCorroborada: 0 }),
    ).toMatchObject({
      cantidadReconocida: '0',
      ingresoEstimado: '0',
      perdidaEstimada: '0',
      valorSobrante: '5000',
    });
  });

  it('costo cero es válido, sin costo no significa valor cero', () => {
    expect(
      referencia({ tipoReferencia: 'COSTO_UNITARIO', precioReferencia: 0 }),
    ).toMatchObject({
      estado: 'VALIDA',
      costoConsumido: '0',
      perdidaEstimada: '0',
    });
    expect(
      referencia({ tipoReferencia: 'COSTO_UNITARIO', precioReferencia: null }),
    ).toMatchObject({
      estado: 'SIN_REFERENCIA',
      precioReferencia: null,
      costoConsumido: null,
      perdidaEstimada: null,
    });
  });

  it('no presenta valores financieros para día no comparable o para historia sin snapshot', () => {
    expect(
      referencia({ motivoNoComparable: 'Falta cierre anterior' }),
    ).toMatchObject({
      estado: 'NO_COMPARABLE',
      ingresoEstimado: null,
      perdidaEstimada: null,
    });
    expect(presentarValoracion(null)).toMatchObject({
      estado: 'SIN_VALORACION_HISTORICA',
      ingresoEstimado: null,
      perdidaEstimada: null,
    });
  });

  it.each(['PENDIENTE', 'RECONTAR', 'NO_COMPARABLE'])(
    'oculta snapshot anterior cuando estado operativo es %s',
    (estado) => {
      expect(presentarValoracion(referencia(), estado)).toMatchObject({
        estado,
        ingresoEstimado: null,
        perdidaEstimada: null,
      });
    },
  );

  it('conserva referencia histórica y separa acumulados de producto, ingrediente y sobrantes', () => {
    const anterior = referencia();
    const nuevo = referencia({ precioReferencia: 4000 });
    const costo = referencia({
      tipoReferencia: 'COSTO_UNITARIO',
      precioReferencia: 1000,
    });
    const sobrante = referencia({ salidaFisica: 5 });
    const resumen = agregarValoraciones([
      { tipo: 'PRODUCTO', idObjetivo: 1, valoracion: anterior },
      { tipo: 'PRODUCTO', idObjetivo: 1, valoracion: nuevo },
      { tipo: 'INGREDIENTE', idObjetivo: 1, valoracion: costo },
      { tipo: 'PRODUCTO', idObjetivo: 1, valoracion: sobrante },
    ]);
    expect(resumen.filas.find((f) => f.tipo === 'PRODUCTO')).toMatchObject({
      diasValorados: 3,
      ingresoEstimado: '58000',
      perdidaEstimada: '19500',
      valorSobrante: '5000',
    });
    expect(resumen.totales).toMatchObject({
      ingresoEstimado: '58000',
      costoConsumido: '7000',
      perdidaProductos: '19500',
      perdidaIngredientes: '3000',
      sobranteProductos: '5000',
    });
    expect(anterior.precioReferencia).toBe('2500');
  });

  it('cuenta exclusiones sin sumarlas ni compensar pérdidas con sobrantes', () => {
    const entradas = [
      'sinValoracion',
      'pendientes',
      'noComparables',
      'sinReferencia',
      'recontar',
    ].map((exclusion) => ({
      tipo: 'PRODUCTO' as const,
      idObjetivo: 1,
      valoracion: referencia(),
      exclusion: exclusion as 'sinValoracion',
    }));
    const resumen = agregarValoraciones(entradas);
    expect(resumen.filas).toEqual([]);
    expect(resumen.totales.ingresoEstimado).toBe('0');
    expect(Object.values(resumen.excluidos)).toEqual([1, 1, 1, 1, 1]);
  });

  it('valida mes completo y reconoce cambio de año sin incluir el mes siguiente', () => {
    expect(rangoMes('2026-12')).toEqual({
      fechaInicio: new Date('2026-12-01'),
      fechaFin: new Date('2027-01-01'),
    });
    for (const mes of ['2026-00', '2026-13', '2026-9', '2026-09-01'])
      expect(() => rangoMes(mes)).toThrow();
  });

  it('incluye los extremos de un rango entre meses y años', () => {
    expect(rangoFechas('2026-12-29', '2027-01-04')).toEqual({
      fechaInicio: new Date('2026-12-29'),
      fechaFin: new Date('2027-01-05'),
    });
    expect(rangoFechas('2026-09-29', '2026-09-29')).toEqual({
      fechaInicio: new Date('2026-09-29'),
      fechaFin: new Date('2026-09-30'),
    });
    expect(rangoFechas('2024-02-29', '2024-02-29').fechaInicio).toEqual(
      new Date('2024-02-29'),
    );
    expect(rangoFechas('9998-12-31', '9998-12-31').fechaFin).toEqual(
      new Date('9999-01-01'),
    );
  });

  it.each([
    [undefined, undefined],
    ['2026-09-01', undefined],
    [undefined, '2026-09-07'],
    ['', '2026-09-07'],
    ['2026-9-1', '2026-09-07'],
    ['2026-09-01T00:00:00Z', '2026-09-07'],
    ['2026-02-29', '2026-03-01'],
    ['2026-04-31', '2026-05-01'],
    ['1999-12-31', '2000-01-01'],
    ['9999-01-01', '9999-01-02'],
    ['2026-09-07', '2026-09-01'],
    ['2024-01-01', '2025-01-01'],
  ])(
    'rechaza rango inválido %s / %s antes de consultar datos',
    (desde, hasta) => {
      expect(() => rangoFechas(desde, hasta)).toThrow();
    },
  );

  it('permite un año bisiesto completo de 366 días, pero no 367 días', () => {
    expect(rangoFechas('2024-01-01', '2024-12-31')).toEqual({
      fechaInicio: new Date('2024-01-01'),
      fechaFin: new Date('2025-01-01'),
    });
    expect(() => rangoFechas('2024-01-01', '2025-01-01')).toThrow();
  });

  it('el rango de panadería conserva varias referencias históricas y fracciones sin mezclar ingreso con costo', async () => {
    const conteos = jest.fn().mockResolvedValue([
      {
        articuloId: 1,
        fecha: new Date('2026-12-31'),
        fechaRegistro: new Date('2027-01-01T03:00:00Z'),
        valoracion: referencia(),
      },
      {
        articuloId: 1,
        fecha: new Date('2027-01-01'),
        fechaRegistro: new Date('2027-01-02T03:00:00Z'),
        valoracion: referencia({ precioReferencia: 3000 }),
      },
      {
        articuloId: 2,
        fecha: new Date('2027-01-01'),
        fechaRegistro: new Date('2027-01-02T03:00:00Z'),
        valoracion: referencia({
          tipoReferencia: 'COSTO_UNITARIO',
          precioReferencia: '1234.5678',
          salidaFisica: '1.75',
          cantidadCorroborada: '1.25',
          nombre: 'Harina',
          unidad: 'kg',
        }),
      },
    ]);
    const movimientos = jest.fn().mockResolvedValue([]);
    const soloRestaurante = jest.fn();
    const prisma = {
      conteoPanaderia: { findMany: conteos },
      movimientoPanaderia: { findMany: movimientos },
      conteoInventarioDiario: { findMany: soloRestaurante },
    } as unknown as PrismaService;
    const respuesta = await accessContext.run(
      { area: 'PANADERIA', user: { rolNombre: 'ADMIN_GLOBAL' } } as never,
      () =>
        new InventoryValuationService(prisma).range('2026-12-29', '2027-01-04'),
    );
    expect(respuesta).toMatchObject({
      desde: '2026-12-29',
      hasta: '2027-01-04',
      area: 'PANADERIA',
      totales: {
        ingresoEstimado: '38500',
        costoConsumido: '1543.2098',
        perdidaProductos: '16500',
        perdidaIngredientes: '617.2839',
      },
    });
    expect(respuesta.filas.find((f) => f.idObjetivo === 1)).toMatchObject({
      diasValorados: 2,
      ingresoEstimado: '38500',
    });
    expect(conteos).toHaveBeenCalledTimes(1);
    expect(conteos.mock.calls[0][0].where.fecha).toEqual({
      gte: new Date('2026-12-29'),
      lt: new Date('2027-01-05'),
    });
    expect(movimientos).toHaveBeenCalledTimes(1);
    expect(movimientos.mock.calls[0][0].where.fecha).toEqual({
      gte: new Date('2026-12-29T05:00:00Z'),
      lt: new Date('2027-01-05T05:00:00Z'),
    });
    expect(soloRestaurante).not.toHaveBeenCalled();
  });

  it('el rango restaurante utiliza consultas constantes y mantiene todas las exclusiones', async () => {
    const datos = (id: number) => ({
      id_producto_conteoInventario: id,
      id_ingrediente_conteoInventario: null,
      tipo_objetivo_conteoInventario: 'PRODUCTO',
      fecha_conteoInventario: new Date('2026-12-31'),
      fecha_anterior_conteoInventario: null,
      estado_conteoInventario: 'FINALIZADO',
      cantidad_salida_conteoInventario: new Prisma.Decimal(10),
      fecha_finalizacion_conteoInventario: new Date('2027-01-01T03:00:00Z'),
      valoracion: referencia(),
    });
    const conteos = jest.fn().mockResolvedValue([
      datos(1),
      { ...datos(2), estado_conteoInventario: 'PENDIENTE' },
      { ...datos(3), valoracion: null },
      { ...datos(4), valoracion: referencia({ precioReferencia: null }) },
      {
        ...datos(5),
        fecha_anterior_conteoInventario: new Date('2026-12-29'),
      },
      datos(6),
    ]);
    const movimientos = jest.fn().mockResolvedValue([]);
    const recepciones = jest.fn().mockResolvedValue([
      {
        id_producto_detalleCuenta: 6,
        cuentaPorPagar: {
          fecha_recepcion_mercancia: new Date('2027-01-01T04:00:00Z'),
        },
      },
    ]);
    const detalles = jest.fn().mockResolvedValue([]);
    const produccion = jest.fn().mockResolvedValue([]);
    const transferencias = jest.fn().mockResolvedValue([]);
    const soloPanaderia = jest.fn();
    const prisma = {
      conteoInventarioDiario: { findMany: conteos },
      detalleComanda: { findMany: detalles },
      transferenciaRestaurantePanaderia: { findMany: transferencias },
      movimientoInventario: { findMany: movimientos },
      planProduccionDiaria: { findMany: produccion },
      detalleCuentaPorPagar: { findMany: recepciones },
      conteoPanaderia: { findMany: soloPanaderia },
    } as unknown as PrismaService;
    const respuesta = await accessContext.run(
      { area: 'RESTAURANTE', user: { rolNombre: 'ADMIN_LOCAL' } } as never,
      () =>
        new InventoryValuationService(prisma).range('2026-12-29', '2027-01-04'),
    );
    expect(respuesta).toMatchObject({
      area: 'RESTAURANTE',
      excluidos: {
        pendientes: 1,
        sinValoracion: 1,
        sinReferencia: 1,
        noComparables: 1,
        recontar: 1,
      },
      totales: { ingresoEstimado: '17500', perdidaProductos: '7500' },
    });
    expect(respuesta.filas).toHaveLength(1);
    for (const consulta of [
      conteos,
      detalles,
      produccion,
      transferencias,
      recepciones,
    ])
      expect(consulta).toHaveBeenCalledTimes(1);
    expect(movimientos).toHaveBeenCalledTimes(2);
    expect(soloPanaderia).not.toHaveBeenCalled();
    expect(conteos.mock.calls[0][0].where.fecha_conteoInventario).toEqual({
      gte: new Date('2026-12-29'),
      lt: new Date('2027-01-05'),
    });
    expect(detalles.mock.calls[0][0].where.OR[0].fecha_entrega_dc).toEqual({
      gte: new Date('2026-12-29T05:00:00Z'),
      lt: new Date('2027-01-05T05:00:00Z'),
    });
  });

  it('una entrada posterior obliga a recontar aunque no haya nuevas entregas', async () => {
    const db = {
      movimientoInventario: {
        findMany: jest.fn().mockResolvedValue([
          {
            id_ingrediente_movimiento: 2,
            fecha_movimiento: new Date('2026-09-29T23:00:00Z'),
          },
        ]),
      },
      planProduccionDiaria: { findMany: jest.fn().mockResolvedValue([]) },
      detalleCuentaPorPagar: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Prisma.TransactionClient;
    const dias = await actividadRestauranteEnRango(
      db,
      new Date('2026-09-29T05:00:00Z'),
      new Date('2026-09-30T05:00:00Z'),
    );
    expect(
      compararConteo(
        {
          tipo_objetivo_conteoInventario: 'INGREDIENTE',
          id_ingrediente_conteoInventario: 2,
          id_producto_conteoInventario: null,
          fecha_conteoInventario: new Date('2026-09-29'),
          fecha_anterior_conteoInventario: null,
          cantidad_salida_conteoInventario: new Prisma.Decimal(0),
          estado_conteoInventario: 'FINALIZADO',
          fecha_finalizacion_conteoInventario: new Date('2026-09-29T22:00:00Z'),
        } as never,
        new Map(),
        dias.get('2026-09-29'),
      ),
    ).toMatchObject({ estado: 'RECONTAR', requiereReconteo: true });
  });

  it('el informe de panadería usa mes colombiano, excluye movimiento posterior y no revalora catálogo', async () => {
    const buscar = jest.fn().mockResolvedValue([
      {
        articuloId: 1,
        fecha: new Date('2026-09-01'),
        fechaRegistro: new Date('2026-09-02T03:00:00Z'),
        valoracion: referencia(),
      },
      {
        articuloId: 2,
        fecha: new Date('2026-09-01'),
        fechaRegistro: new Date('2026-09-02T03:00:00Z'),
        valoracion: referencia(),
      },
      {
        articuloId: 3,
        fecha: new Date('2026-09-01'),
        fechaRegistro: new Date('2026-09-02T03:00:00Z'),
        valoracion: null,
      },
    ]);
    const movimientos = jest
      .fn()
      .mockResolvedValue([
        { articuloId: 2, fecha: new Date('2026-09-02T04:00:00Z') },
      ]);
    const prisma = {
      conteoPanaderia: { findMany: buscar },
      movimientoPanaderia: { findMany: movimientos },
    } as unknown as PrismaService;
    const respuesta = await accessContext.run(
      { area: 'PANADERIA', user: { rolNombre: 'ADMIN_GLOBAL' } } as never,
      () => new InventoryValuationService(prisma).monthly('2026-09'),
    );
    expect(respuesta).toMatchObject({
      mes: '2026-09',
      area: 'PANADERIA',
      excluidos: { recontar: 1, sinValoracion: 1 },
      totales: { ingresoEstimado: '17500', perdidaProductos: '7500' },
    });
    expect(movimientos).toHaveBeenCalledTimes(1);
    expect(movimientos.mock.calls[0][0].where.fecha).toEqual({
      gte: new Date('2026-09-01T05:00:00Z'),
      lt: new Date('2026-10-01T05:00:00Z'),
    });
  });

  it('el informe restaurante excluye conteo invalidado por recepción posterior sin consultar precios actuales', async () => {
    const datos = (id: number) => ({
      id_producto_conteoInventario: id,
      id_ingrediente_conteoInventario: null,
      tipo_objetivo_conteoInventario: 'PRODUCTO',
      fecha_conteoInventario: new Date('2026-09-01'),
      fecha_anterior_conteoInventario: null,
      estado_conteoInventario: 'FINALIZADO',
      cantidad_salida_conteoInventario: new Prisma.Decimal(10),
      fecha_finalizacion_conteoInventario: new Date('2026-09-02T03:00:00Z'),
      valoracion: referencia(),
    });
    const recepciones = jest.fn().mockResolvedValue([
      {
        id_producto_detalleCuenta: 2,
        cuentaPorPagar: {
          fecha_recepcion_mercancia: new Date('2026-09-02T04:00:00Z'),
        },
      },
    ]);
    const prisma = {
      conteoInventarioDiario: {
        findMany: jest.fn().mockResolvedValue([datos(1), datos(2)]),
      },
      detalleComanda: { findMany: jest.fn().mockResolvedValue([]) },
      transferenciaRestaurantePanaderia: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      movimientoInventario: { findMany: jest.fn().mockResolvedValue([]) },
      planProduccionDiaria: { findMany: jest.fn().mockResolvedValue([]) },
      detalleCuentaPorPagar: { findMany: recepciones },
    } as unknown as PrismaService;
    const respuesta = await accessContext.run(
      { area: 'RESTAURANTE', user: { rolNombre: 'ADMIN_GLOBAL' } } as never,
      () => new InventoryValuationService(prisma).monthly('2026-09'),
    );
    expect(respuesta).toMatchObject({
      area: 'RESTAURANTE',
      excluidos: { recontar: 1 },
      totales: { ingresoEstimado: '17500', perdidaProductos: '7500' },
    });
    expect(respuesta.filas).toHaveLength(1);
    expect(recepciones).toHaveBeenCalledTimes(1);
  });
});
