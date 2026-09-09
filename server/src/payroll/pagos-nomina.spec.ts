import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePagoNominaDto } from './dto/create-pago-nomina.dto';
import { PagosNominaService } from './pagos-nomina.service';

function setup(turno: Record<string, unknown> | null) {
  const spies = {
    pagoCreate: jest.fn().mockResolvedValue({ id_pagoNomina: 12 }),
    detalleCreateMany: jest.fn().mockResolvedValue({ count: 1 }),
    movimientoCreate: jest.fn(),
    turnoUpdate: jest.fn(),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 1 }]),
    empleado: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id_empleado: 4,
        nombre_empleado: 'Ana',
        apellido_empleado: 'Perez',
      }),
    },
    devengoNomina: {
      findMany: jest.fn().mockResolvedValue([
        {
          id_devengoNomina: 9,
          monto_devengoNomina: new Prisma.Decimal(100000),
          pagoNominaDetalles: [],
        },
      ]),
    },
    turno: {
      findFirst: jest.fn().mockResolvedValue(turno),
      findUniqueOrThrow: jest.fn().mockResolvedValue(turno),
      update: spies.turnoUpdate,
    },
    pagoNomina: {
      create: spies.pagoCreate,
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id_pagoNomina: 12 }),
    },
    pagoNominaDetalle: { createMany: spies.detalleCreateMany },
    movimientoCaja: { create: spies.movimientoCreate },
  };
  const prisma = {
    $transaction: (callback: (cliente: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaService;
  return { service: new PagosNominaService(prisma), spies };
}

const dtoTransferencia = {
  monto: 50000,
  metodo: 'TRANSFERENCIA',
  observacion: 'Pago parcial',
} as CreatePagoNominaDto;

describe('PagosNominaService.registrar (asociacion al cuadre)', () => {
  it('asocia una transferencia al turno abierto sin afectar el efectivo', async () => {
    const turno = {
      id_turno: 7,
      estado_turno: 'ABIERTO',
      monto_apertura_turno: new Prisma.Decimal(300000),
      monto_cierre_esperado: new Prisma.Decimal(300000),
    };
    const { service, spies } = setup(turno);

    await service.registrar(4, 2, dtoTransferencia);

    expect(spies.pagoCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id_turno_pagoNomina: 7,
        metodo_pagoNomina: 'TRANSFERENCIA',
      }),
    });
    expect(spies.movimientoCreate).not.toHaveBeenCalled();
    expect(spies.turnoUpdate).not.toHaveBeenCalled();
  });

  it('permite una transferencia sin turno y la deja fuera de cualquier cuadre', async () => {
    const { service, spies } = setup(null);

    await service.registrar(4, 2, dtoTransferencia);

    expect(spies.pagoCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ id_turno_pagoNomina: null }),
    });
    expect(spies.movimientoCreate).not.toHaveBeenCalled();
  });
});
