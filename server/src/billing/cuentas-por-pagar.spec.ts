import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
