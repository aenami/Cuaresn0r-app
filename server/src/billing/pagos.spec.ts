import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PagosService } from './pagos.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { Prisma } from '../generated/prisma/client';

// PagosService.registrar es el corazon del cobro: prorratea cada pago en
// subtotal/servicio/impuestos, impide el sobrepago y suma el efectivo al cuadre
// del turno. Se prueba con un prisma simulado (la transaccion ejecuta el
// callback con un `tx` de dobles).

const dto = (monto: number, metodo = 'EFECTIVO') =>
  ({ monto, metodo }) as unknown as CreatePagoDto;

interface FacturaMock {
  estado_factura: string;
  monto_total_factura: Prisma.Decimal;
  subtotal_factura: Prisma.Decimal;
  monto_servicio_factura: Prisma.Decimal;
  id_subcuenta_factura: number;
  pagos: {
    monto_total_pago: Prisma.Decimal;
    subtotal_pago: Prisma.Decimal;
    monto_servicio_pago: Prisma.Decimal;
  }[];
}

function setup(
  facturaOverrides: Partial<FacturaMock> = {},
  turno: unknown = { id_turno: 3 },
) {
  const spies = {
    turnoFindFirst: jest.fn().mockResolvedValue(turno),
    facturaFind: jest.fn().mockResolvedValue({
      estado_factura: 'PENDIENTE',
      monto_total_factura: new Prisma.Decimal(119),
      subtotal_factura: new Prisma.Decimal(100),
      monto_servicio_factura: new Prisma.Decimal(10),
      id_subcuenta_factura: 7,
      pagos: [],
      ...facturaOverrides,
    } as FacturaMock),
    pagoCreate: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id_pago: 1, ...args.data }),
    ),
    turnoUpdate: jest.fn().mockResolvedValue({}),
    facturaUpdate: jest.fn().mockResolvedValue({}),
    subFindUnique: jest.fn().mockResolvedValue({ id_pedido_subcuenta: 7 }),
    subFindMany: jest.fn().mockResolvedValue([]), // sin subcuentas con items -> no marca el pedido
    pedidoFind: jest
      .fn()
      .mockResolvedValue({
        id_pedido: 7,
        estado_pedido: 'EN_PREPARACION',
        fecha_cierre_pedido: null,
      }),
    pedidoUpdate: jest.fn().mockResolvedValue({}),
    dcFindMany: jest.fn().mockResolvedValue([]),
    comandaFindMany: jest.fn().mockResolvedValue([]),
    comandaUpdateMany: jest.fn().mockResolvedValue({ count: 0 }),
    queryRaw: jest.fn().mockResolvedValue([{ id_factura: 1 }]),
  };
  const tx = {
    turno: { findFirst: spies.turnoFindFirst, update: spies.turnoUpdate },
    factura: {
      findUniqueOrThrow: spies.facturaFind,
      update: spies.facturaUpdate,
    },
    pago: { create: spies.pagoCreate },
    subcuenta: {
      findUniqueOrThrow: spies.subFindUnique,
      findMany: spies.subFindMany,
    },
    pedido: { findUniqueOrThrow: spies.pedidoFind, update: spies.pedidoUpdate },
    detalleComanda: { findMany: spies.dcFindMany },
    comanda: {
      findMany: spies.comandaFindMany,
      updateMany: spies.comandaUpdateMany,
    },
    $queryRaw: spies.queryRaw,
  };
  const prisma = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  } as unknown as PrismaService;
  return { svc: new PagosService(prisma), spies };
}

describe('PagosService.registrar (guardas)', () => {
  it('exige un turno abierto', async () => {
    const { svc } = setup({}, null);
    await expect(svc.registrar(1, 5, dto(50))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('no permite pagar una factura anulada', async () => {
    const { svc } = setup({ estado_factura: 'ANULADA' });
    await expect(svc.registrar(1, 5, dto(50))).rejects.toThrow(/anulada/);
  });

  it('no permite pagar una factura ya pagada', async () => {
    const { svc } = setup({ estado_factura: 'PAGADA' });
    await expect(svc.registrar(1, 5, dto(50))).rejects.toThrow(
      /ya esta pagada/,
    );
  });

  it('rechaza el sobrepago con 422', async () => {
    const { svc } = setup(); // total 119, sin pagos previos
    await expect(svc.registrar(1, 5, dto(200))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('PagosService.registrar (prorrateo y cuadre)', () => {
  it('prorratea el pago parcial en subtotal/servicio/impuestos y suma el efectivo al turno', async () => {
    const { svc, spies } = setup(); // subtotal 100, servicio 10, total 119
    const res = await svc.registrar(1, 5, dto(59.5, 'EFECTIVO')); // mitad exacta

    const data = spies.pagoCreate.mock.calls[0][0].data as Record<
      string,
      Prisma.Decimal
    >;
    expect(data.subtotal_pago.toString()).toBe('50');
    expect(data.monto_servicio_pago.toString()).toBe('5');
    // impuestos absorbe el residuo: subtotal + servicio + impuestos = monto pagado
    expect(data.monto_impuestos_pago.toString()).toBe('4.5');
    expect(data.monto_total_pago.toString()).toBe('59.5');

    // Efectivo -> incrementa el esperado del turno; la factura sigue pendiente.
    expect(spies.turnoUpdate).toHaveBeenCalledTimes(1);
    expect(spies.facturaUpdate).not.toHaveBeenCalled();
    expect(res.estadoFactura).toBe('PENDIENTE');
    expect(res.saldoPendiente.toString()).toBe('59.5');
  });

  it('un pago con tarjeta NO toca el cuadre de caja', async () => {
    const { svc, spies } = setup();
    await svc.registrar(1, 5, dto(50, 'TARJETA'));
    expect(spies.turnoUpdate).not.toHaveBeenCalled();
  });

  it('el pago que completa la factura la marca como PAGADA', async () => {
    const { svc, spies } = setup(); // total 119, sin pagos previos
    const res = await svc.registrar(1, 5, dto(119, 'TARJETA'));

    expect(spies.facturaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado_factura: 'PAGADA' } }),
    );
    expect(res.estadoFactura).toBe('PAGADA');
    expect(res.saldoPendiente.toString()).toBe('0');
  });
});

// Excedente voluntario ("quedese con el vuelto"): el cliente paga de mas y deja
// el sobrante al negocio. No hace parte de la factura, pero si entra a la caja.
const dtoExc = (
  monto: number,
  excedente: number,
  destino?: string,
  metodo = 'EFECTIVO',
) =>
  ({
    monto,
    metodo,
    excedente,
    destinoExcedente: destino,
  }) as unknown as CreatePagoDto;

describe('PagosService.registrar (excedente)', () => {
  it('registra el excedente al saldar la cuenta y suma monto + excedente al cuadre de caja', async () => {
    const { svc, spies } = setup(); // total 119
    const res = await svc.registrar(1, 5, dtoExc(119, 10, 'CASA'));

    const data = spies.pagoCreate.mock.calls[0][0].data as Record<
      string,
      Prisma.Decimal | string
    >;
    expect((data.monto_excedente_pago as Prisma.Decimal).toString()).toBe('10');
    expect(data.destino_excedente_pago).toBe('CASA');
    // El total aplicado a la factura NO incluye el excedente.
    expect((data.monto_total_pago as Prisma.Decimal).toString()).toBe('119');
    // Caja: entra el efectivo aplicado + el excedente (129 fisicos en la caja).
    const inc = spies.turnoUpdate.mock.calls[0][0].data as {
      monto_cierre_esperado: { increment: Prisma.Decimal };
    };
    expect(inc.monto_cierre_esperado.increment.toString()).toBe('129');
    expect(res.estadoFactura).toBe('PAGADA');
  });

  it('guarda el destino PROPINA cuando el cliente lo deja para los meseros', async () => {
    const { svc, spies } = setup();
    await svc.registrar(1, 5, dtoExc(119, 10, 'PROPINA'));
    expect(spies.pagoCreate.mock.calls[0][0].data.destino_excedente_pago).toBe(
      'PROPINA',
    );
  });

  it('422 si el excedente llega en un pago que no salda la cuenta', async () => {
    const { svc } = setup(); // saldo 119
    await expect(svc.registrar(1, 5, dtoExc(50, 10, 'CASA'))).rejects.toThrow(
      /salda la cuenta/i,
    );
  });

  it('422 si el excedente llega en un metodo distinto de efectivo', async () => {
    const { svc } = setup();
    await expect(
      svc.registrar(1, 5, dtoExc(119, 10, 'CASA', 'TARJETA')),
    ).rejects.toThrow(/efectivo/i);
  });

  it('422 si hay excedente pero no se indica el destino', async () => {
    const { svc } = setup();
    await expect(
      svc.registrar(1, 5, dtoExc(119, 10, undefined)),
    ).rejects.toThrow(/destino/i);
  });
});
