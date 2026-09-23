import { Prisma, ConteoInventarioDiario } from '../generated/prisma/client';
import {
  compararConteo,
  estadoConteoCierre,
  fechaColombia,
  rangoDia,
  salidasEntregadas,
} from './inventory-reconciliation';

const fecha = new Date('2026-09-22');
const conteo = (cambios = {}) =>
  ({
    id_conteoInventario: 1,
    tipo_objetivo_conteoInventario: 'PRODUCTO',
    id_producto_conteoInventario: 3,
    id_ingrediente_conteoInventario: null,
    nombre_objetivo_conteoInventario: 'Agua',
    fecha_conteoInventario: fecha,
    fecha_anterior_conteoInventario: new Date('2026-09-21'),
    cantidad_salida_conteoInventario: new Prisma.Decimal(5),
    estado_conteoInventario: 'FINALIZADO',
    fecha_finalizacion_conteoInventario: new Date('2026-09-23T03:00:00Z'),
    ...cambios,
  }) as ConteoInventarioDiario;

function setup(
  detalles: unknown[] = [],
  conteos: unknown[] = [conteo()],
  elementos: unknown[] = [],
) {
  const buscar = jest.fn().mockResolvedValue(detalles);
  const db = {
    detalleComanda: { findMany: buscar },
    conteoInventarioDiario: { findMany: jest.fn().mockResolvedValue(conteos) },
    elementoConteoDiario: { findMany: jest.fn().mockResolvedValue(elementos) },
  } as unknown as Prisma.TransactionClient;
  return { db, buscar };
}

describe('Conciliación por entregas', () => {
  it('usa el día colombiano, no UTC ni la zona del servidor', () => {
    expect(fechaColombia(new Date('2026-09-23T03:00:00Z'))).toEqual(fecha);
    expect(rangoDia(fecha)).toEqual({
      inicio: new Date('2026-09-22T05:00:00Z'),
      fin: new Date('2026-09-23T05:00:00Z'),
    });
  });

  it('consulta solo entregados por fecha de entrega, sin filtrar pagos, y suma productos/componentes y receta congelada', async () => {
    const { db, buscar } = setup([
      {
        id_producto_dc: 3,
        cantidad_producto_dc: 3,
        fecha_entrega_dc: new Date('2026-09-22T16:00:00Z'),
        movimientosInventario: [
          {
            id_ingrediente_movimiento: 8,
            cantidad_movimiento: new Prisma.Decimal('0.35'),
          },
        ],
      },
      {
        id_producto_dc: 3,
        cantidad_producto_dc: 2,
        fecha_entrega_dc: new Date('2026-09-22T17:00:00Z'),
        movimientosInventario: [],
      },
      {
        id_producto_dc: null,
        cantidad_producto_dc: 1,
        fecha_entrega_dc: new Date('2026-09-22T17:00:00Z'),
        movimientosInventario: [],
      },
    ]);
    const salidas = await salidasEntregadas(db, fecha);
    expect(buscar.mock.calls[0][0].where.estado_dc).toBe('ENTREGADO');
    expect(buscar.mock.calls[0][0].where.OR[0]).toEqual({
      fecha_entrega_dc: {
        gte: new Date('2026-09-22T05:00:00Z'),
        lt: new Date('2026-09-23T05:00:00Z'),
      },
    });
    expect(JSON.stringify(buscar.mock.calls[0][0])).not.toMatch(
      /pago|factura/i,
    );
    expect(salidas.get('PRODUCTO:3')?.cantidad.toString()).toBe('5');
    expect(salidas.get('INGREDIENTE:8')?.cantidad.toString()).toBe('0.35');
    expect(compararConteo(conteo(), salidas).estado).toBe('COINCIDE');
  });

  it.each([
    [6, '1'],
    [4, '-1'],
  ])('marca salida física %s como diferencia %s', (fisica, diferencia) => {
    const salidas = new Map([
      [
        'PRODUCTO:3',
        { cantidad: new Prisma.Decimal(5), ultima: null, sinFecha: false },
      ],
    ]);
    expect(
      compararConteo(
        conteo({
          cantidad_salida_conteoInventario: new Prisma.Decimal(fisica),
        }),
        salidas,
      ),
    ).toMatchObject({ estado: 'DIFERENCIA', diferencia });
  });

  it('requiere recontar si hubo entregas posteriores a la confirmación', () => {
    const salidas = new Map([
      [
        'PRODUCTO:3',
        {
          cantidad: new Prisma.Decimal(5),
          ultima: new Date('2026-09-23T04:00:00Z'),
          sinFecha: false,
        },
      ],
    ]);
    expect(compararConteo(conteo(), salidas)).toMatchObject({
      estado: 'RECONTAR',
      requiereReconteo: true,
    });
  });

  it('no inventa concordancia para datos antiguos sin fecha ni para saltos entre conteos', () => {
    expect(
      compararConteo(
        conteo(),
        new Map([
          [
            'PRODUCTO:3',
            { cantidad: new Prisma.Decimal(0), ultima: null, sinFecha: true },
          ],
        ]),
      ),
    ).toMatchObject({ estado: 'NO_COMPARABLE', diferencia: null });
    expect(
      compararConteo(
        conteo({ fecha_anterior_conteoInventario: new Date('2026-09-19') }),
        new Map(),
      ).estado,
    ).toBe('NO_COMPARABLE');
  });

  it('detecta elementos configurados que aún no tienen registro, incluso si nadie abrió inventario', async () => {
    const { db } = setup(
      [],
      [],
      [
        {
          tipo: 'PRODUCTO',
          idProducto: 3,
          idIngrediente: null,
          producto: { nombre_producto: 'Agua' },
        },
      ],
    );
    expect(await estadoConteoCierre(db, fecha)).toMatchObject({
      completo: false,
      faltantes: ['Agua'],
      total: 1,
    });
  });

  it('bloquea lista vacía y pendientes; permite diferencias si ya se contó', async () => {
    expect((await estadoConteoCierre(setup([], []).db, fecha)).completo).toBe(
      false,
    );
    expect(
      (
        await estadoConteoCierre(
          setup(
            [],
            [
              conteo({
                estado_conteoInventario: 'PENDIENTE',
                cantidad_salida_conteoInventario: null,
              }),
            ],
          ).db,
          fecha,
        )
      ).completo,
    ).toBe(false);
    expect(await estadoConteoCierre(setup().db, fecha)).toMatchObject({
      completo: true,
      inconsistencias: 1,
    });
  });
});
