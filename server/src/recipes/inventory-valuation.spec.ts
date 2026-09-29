import { Prisma } from '../generated/prisma/client';
import { crearValoracion, presentarValoracion } from './inventory-valuation';
import {
  agregarValoraciones,
  InventoryValuationService,
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
    const recepciones = jest
      .fn()
      .mockResolvedValue([
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
