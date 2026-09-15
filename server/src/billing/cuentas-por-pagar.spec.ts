import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearCuentaPorPagarDto } from './dto/crear-cuenta-por-pagar.dto';
import { PagarCuentaPorPagarDto } from './dto/pagar-cuenta-por-pagar.dto';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';

const dto = (monto: number, metodo = 'TRANSFERENCIA') =>
  ({ monto, metodo }) as unknown as PagarCuentaPorPagarDto;

function setup() {
  const spies = {
    cuentaFind: jest.fn().mockResolvedValue({
      estado_cuentaPorPagar: 'PENDIENTE',
      monto_total_cuentaPorPagar: new Prisma.Decimal(100000),
      pagos: [],
      proveedor: { nombre_proveedor: 'Proveedor prueba' },
      concepto_cuentaPorPagar: 'Compra semanal',
    }),
    turnoFind: jest.fn().mockResolvedValue({ id_turno: 9 }),
    pagoCreate: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    ),
    cuentaUpdate: jest.fn().mockResolvedValue({}),
    movimientoCreate: jest.fn().mockResolvedValue({}),
    turnoUpdate: jest.fn().mockResolvedValue({}),
    queryRaw: jest.fn().mockResolvedValue([{ id_cuentaPorPagar: 4 }]),
  };
  const tx = {
    $queryRaw: spies.queryRaw,
    cuentaPorPagar: {
      findUnique: spies.cuentaFind,
      update: spies.cuentaUpdate,
    },
    turno: { findFirst: spies.turnoFind, update: spies.turnoUpdate },
    pagoCuentaPorPagar: { create: spies.pagoCreate },
    movimientoCaja: { create: spies.movimientoCreate },
  };
  const prisma = {
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaService;
  return { servicio: new CuentasPorPagarService(prisma), spies };
}

describe('CuentasPorPagarService.pagar', () => {
  it('registra la fecha exacta en el pago y al completar la cuenta', async () => {
    const { servicio, spies } = setup();

    await servicio.pagar(4, 2, dto(100000));

    const pago = spies.pagoCreate.mock.calls[0][0].data;
    const actualizacion = spies.cuentaUpdate.mock.calls[0][0].data;
    expect(pago.fecha_pagoCuentaPorPagar).toBeInstanceOf(Date);
    expect(actualizacion).toEqual({
      estado_cuentaPorPagar: 'PAGADA',
      fecha_pago_total_cuentaPorPagar: pago.fecha_pagoCuentaPorPagar,
    });
  });

  it('conserva la cuenta parcial sin asignar una fecha de pago total', async () => {
    const { servicio, spies } = setup();

    await servicio.pagar(4, 2, dto(25000));

    expect(spies.cuentaUpdate.mock.calls[0][0].data).toEqual({
      estado_cuentaPorPagar: 'PARCIAL',
    });
  });
});

describe('CuentasPorPagarService.mercancia', () => {
  it('permite registrar productos terminados en una cuenta por pagar', async () => {
    const crear = jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    );
    const prisma = {
      proveedor: {
        findUnique: jest.fn().mockResolvedValue({ proveedor_activo: true }),
      },
      ingrediente: { count: jest.fn().mockResolvedValue(0) },
      producto: { count: jest.fn().mockResolvedValue(1) },
      cuentaPorPagar: { create: crear },
    } as unknown as PrismaService;
    const servicio = new CuentasPorPagarService(prisma);

    await servicio.crear({
      idProveedor: 2,
      concepto: 'Compra de postres',
      montoTotal: 60000,
      detalles: [{ idProducto: 7, cantidad: 12, precioUnitario: 5000 }],
    } as CrearCuentaPorPagarDto);

    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          detalles: {
            create: [
              expect.objectContaining({
                id_producto_detalleCuenta: 7,
                id_ingrediente_detalleCuenta: undefined,
                cantidad_detalleCuenta: 12,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('confirma productos recibidos sin crear movimientos de ingrediente', async () => {
    const movimiento = jest.fn().mockResolvedValue({});
    const actualizarIngrediente = jest.fn().mockResolvedValue({});
    const actualizarCuenta = jest.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id_cuentaPorPagar: 5 }]),
      cuentaPorPagar: {
        findUnique: jest.fn().mockResolvedValue({
          estado_cuentaPorPagar: 'PENDIENTE',
          fecha_recepcion_mercancia: null,
          detalles: [
            {
              id_detalleCuentaPorPagar: 9,
              id_ingrediente_detalleCuenta: null,
              id_producto_detalleCuenta: 7,
              cantidad_detalleCuenta: new Prisma.Decimal(12),
            },
          ],
        }),
        update: actualizarCuenta,
      },
      movimientoInventario: { create: movimiento },
      ingrediente: { update: actualizarIngrediente },
    };
    const prisma = {
      $transaction: (callback: (cliente: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaService;
    const servicio = new CuentasPorPagarService(prisma);

    await servicio.recibirMercancia(5, 2);

    expect(movimiento).not.toHaveBeenCalled();
    expect(actualizarIngrediente).not.toHaveBeenCalled();
    expect(actualizarCuenta).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fecha_recepcion_mercancia: expect.any(Date),
          id_usuario_recibe_mercancia: 2,
        }),
      }),
    );
  });
});
