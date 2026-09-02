import { FacturasService } from './facturas.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { Prisma } from '../generated/prisma/client';

// FacturasService.emitir snapshotea subtotal + servicio (propina) + impuestos.
// La propina se fija por porcentaje del subtotal o como monto EXACTO en pesos;
// el monto exacto manda. Se prueba el calculo con un prisma simulado (subcuenta
// con un item entregado de 10.000).

function setup(
  config: { servicio: number; impuestos: number } = {
    servicio: 10,
    impuestos: 19,
  },
) {
  const facturaCreate = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve(args.data),
  );
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id_subcuenta: 1 }]),
    subcuenta: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id_pedido_subcuenta: 5,
        pedido: { estado_pedido: 'ENTREGADO' },
      }),
    },
    factura: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: facturaCreate,
    },
    detalleComanda: {
      findFirst: jest.fn().mockResolvedValue(null), // nada sin asignar
      findMany: jest.fn().mockResolvedValue([
        {
          id_detalleComanda: 1,
          precio_unitario_dc: new Prisma.Decimal(10000),
          cantidad_producto_dc: 1,
          estado_dc: 'ENTREGADO',
          facturasDetalle: [],
        },
      ]),
    },
    subcuentaDetalleComanda: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  } as unknown as PrismaService;
  const billingConfig = {
    findActiva: jest.fn().mockResolvedValue({
      porcentaje_servicio: new Prisma.Decimal(config.servicio),
      porcentaje_impuestos: new Prisma.Decimal(config.impuestos),
    }),
  } as unknown as BillingConfigService;
  return { svc: new FacturasService(prisma, billingConfig), facturaCreate };
}

async function emitirData(
  svc: FacturasService,
  facturaCreate: jest.Mock,
  ...args: [porcentaje?: number, monto?: number]
) {
  await svc.emitir(1, ...args);
  return facturaCreate.mock.calls[0][0].data as Record<string, Prisma.Decimal>;
}

describe('FacturasService.emitir (propina por porcentaje)', () => {
  it('usa el porcentaje_servicio de la config cuando no se especifica', async () => {
    const { svc, facturaCreate } = setup();
    const data = await emitirData(svc, facturaCreate);
    expect(data.subtotal_factura.toString()).toBe('10000');
    expect(data.monto_servicio_factura.toString()).toBe('1000'); // 10% de 10.000
    expect(data.monto_impuestos_factura.toString()).toBe('1900'); // 19%
    expect(data.monto_total_factura.toString()).toBe('12900');
  });

  it('respeta el porcentaje elegido al cobrar', async () => {
    const { svc, facturaCreate } = setup();
    const data = await emitirData(svc, facturaCreate, 15);
    expect(data.monto_servicio_factura.toString()).toBe('1500');
    expect(data.monto_total_factura.toString()).toBe('13400');
  });

  it('permite declinar la propina con 0%', async () => {
    const { svc, facturaCreate } = setup();
    const data = await emitirData(svc, facturaCreate, 0);
    expect(data.monto_servicio_factura.toString()).toBe('0');
    expect(data.monto_total_factura.toString()).toBe('11900');
  });
});

describe('FacturasService.emitir (propina como monto exacto)', () => {
  it('guarda el monto exacto de propina en pesos', async () => {
    const { svc, facturaCreate } = setup();
    const data = await emitirData(svc, facturaCreate, undefined, 3333);
    expect(data.monto_servicio_factura.toString()).toBe('3333');
    expect(data.monto_total_factura.toString()).toBe('15233'); // 10000 + 3333 + 1900
  });

  it('el monto exacto manda sobre el porcentaje si llegaran ambos', async () => {
    const { svc, facturaCreate } = setup();
    const data = await emitirData(svc, facturaCreate, 15, 3333);
    expect(data.monto_servicio_factura.toString()).toBe('3333');
  });

  it('acepta 0 como sin propina', async () => {
    const { svc, facturaCreate } = setup();
    const data = await emitirData(svc, facturaCreate, undefined, 0);
    expect(data.monto_servicio_factura.toString()).toBe('0');
    expect(data.monto_total_factura.toString()).toBe('11900');
  });
});

// FacturasService.anular: la factura es inmutable, la correccion es anular +
// refacturar. Anular una factura con pagos en EFECTIVO es una devolucion total
// que sale de la caja (MovimientoCaja EGRESO en el turno abierto); tarjeta/
// transferencia se reversan por fuera y aqui solo se reportan.

interface PagoAnular {
  metodo_pago: string;
  monto_total_pago: Prisma.Decimal;
  monto_excedente_pago: Prisma.Decimal;
}

const pagoEfectivo = (monto: number, excedente = 0): PagoAnular => ({
  metodo_pago: 'EFECTIVO',
  monto_total_pago: new Prisma.Decimal(monto),
  monto_excedente_pago: new Prisma.Decimal(excedente),
});
const pagoTarjeta = (monto: number): PagoAnular => ({
  metodo_pago: 'TARJETA',
  monto_total_pago: new Prisma.Decimal(monto),
  monto_excedente_pago: new Prisma.Decimal(0),
});

function setupAnular(
  opts: {
    estadoFactura?: string;
    pagos?: PagoAnular[];
    turnoPropio?: unknown;
    turnosAbiertos?: unknown[];
    esperado?: Prisma.Decimal;
    estadoPedido?: string;
  } = {},
) {
  const {
    estadoFactura = 'PAGADA',
    pagos = [],
    turnoPropio = { id_turno: 3 },
    turnosAbiertos,
    esperado = new Prisma.Decimal(1000000),
    estadoPedido = 'CERRADO',
  } = opts;

  const spies = {
    queryRaw: jest.fn().mockResolvedValue([{ id_factura: 1 }]),
    facturaFind: jest
      .fn()
      .mockResolvedValue({
        estado_factura: estadoFactura,
        id_subcuenta_factura: 7,
        pagos,
      }),
    facturaUpdate: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id_factura: 1, ...args.data }),
    ),
    turnoFindFirst: jest.fn().mockResolvedValue(turnoPropio),
    turnoFindMany: jest
      .fn()
      .mockResolvedValue(turnosAbiertos ?? (turnoPropio ? [turnoPropio] : [])),
    turnoFind: jest
      .fn()
      .mockResolvedValue({
        id_turno: 3,
        monto_cierre_esperado: esperado,
        monto_apertura_turno: new Prisma.Decimal(0),
      }),
    turnoUpdate: jest.fn().mockResolvedValue({}),
    movimientoCreate: jest.fn().mockResolvedValue({}),
    subFind: jest.fn().mockResolvedValue({ id_pedido_subcuenta: 5 }),
    pedidoFind: jest
      .fn()
      .mockResolvedValue({
        id_pedido: 5,
        estado_pedido: estadoPedido,
        fecha_cierre_pedido: new Date(),
      }),
    pedidoUpdate: jest.fn().mockResolvedValue({}),
    dcFindMany: jest.fn().mockResolvedValue([
      {
        estado_dc: 'ENTREGADO',
        precio_unitario_dc: new Prisma.Decimal(10000),
        cantidad_producto_dc: 1,
        facturasDetalle: [],
      },
    ]),
    comandaFindMany: jest.fn().mockResolvedValue([]),
    comandaUpdateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const tx = {
    $queryRaw: spies.queryRaw,
    factura: {
      findUniqueOrThrow: spies.facturaFind,
      update: spies.facturaUpdate,
    },
    turno: {
      findFirst: spies.turnoFindFirst,
      findMany: spies.turnoFindMany,
      findUniqueOrThrow: spies.turnoFind,
      update: spies.turnoUpdate,
    },
    movimientoCaja: { create: spies.movimientoCreate },
    subcuenta: { findUniqueOrThrow: spies.subFind },
    pedido: { findUniqueOrThrow: spies.pedidoFind, update: spies.pedidoUpdate },
    detalleComanda: { findMany: spies.dcFindMany },
    comanda: {
      findMany: spies.comandaFindMany,
      updateMany: spies.comandaUpdateMany,
    },
  };
  const prisma = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  } as unknown as PrismaService;
  return {
    svc: new FacturasService(prisma, {} as unknown as BillingConfigService),
    spies,
  };
}

describe('FacturasService.anular (guardas)', () => {
  it('409 si la factura ya esta anulada', async () => {
    const { svc } = setupAnular({ estadoFactura: 'ANULADA' });
    await expect(svc.anular(1, 'motivo', 5)).rejects.toThrow(
      /ya esta anulada/i,
    );
  });

  it('409 si hay efectivo por devolver y no hay ningun turno abierto', async () => {
    const { svc } = setupAnular({
      pagos: [pagoEfectivo(100)],
      turnoPropio: null,
      turnosAbiertos: [],
    });
    await expect(svc.anular(1, 'motivo', 5)).rejects.toThrow(/turno abierto/i);
  });

  it('422 si la caja no tiene efectivo suficiente para la devolucion', async () => {
    const { svc } = setupAnular({
      pagos: [pagoEfectivo(50000)],
      esperado: new Prisma.Decimal(100),
    });
    await expect(svc.anular(1, 'motivo', 5)).rejects.toThrow(
      /no tiene efectivo suficiente/i,
    );
  });
});

describe('FacturasService.anular (efecto sobre caja y pedido)', () => {
  it('sin pagos: marca ANULADA con motivo, no toca caja y deja el pedido como ENTREGADO', async () => {
    const { svc, spies } = setupAnular({ pagos: [] });
    const res = await svc.anular(1, 'error de digitacion', 5);

    expect(spies.facturaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado_factura: 'ANULADA',
          motivo_anulacion_factura: 'error de digitacion',
        }),
      }),
    );
    expect(spies.movimientoCreate).not.toHaveBeenCalled();
    expect(spies.pedidoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado_pedido: 'ENTREGADO' } }),
    );
    expect(res.devolucion.efectivoDevuelto.toString()).toBe('0');
    expect(res.devolucion.devolverPorFuera.toString()).toBe('0');
  });

  it('con efectivo: saca un EGRESO de la caja y decrementa el esperado del turno', async () => {
    const { svc, spies } = setupAnular({ pagos: [pagoEfectivo(50000)] });
    const res = await svc.anular(1, 'motivo', 5);

    const mov = spies.movimientoCreate.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(mov.tipo_mc).toBe('EGRESO');
    expect((mov.monto_mc as Prisma.Decimal).toString()).toBe('50000');
    const upd = spies.turnoUpdate.mock.calls[0][0].data as {
      monto_cierre_esperado: { decrement: Prisma.Decimal };
    };
    expect(upd.monto_cierre_esperado.decrement.toString()).toBe('50000');
    expect(res.devolucion.efectivoDevuelto.toString()).toBe('50000');
  });

  it('con excedente en efectivo: devuelve tambien el excedente que entro a la caja', async () => {
    const { svc, spies } = setupAnular({ pagos: [pagoEfectivo(40000, 10000)] });
    const res = await svc.anular(1, 'motivo', 5);
    const mov = spies.movimientoCreate.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect((mov.monto_mc as Prisma.Decimal).toString()).toBe('50000'); // 40k aplicado + 10k excedente
    expect(res.devolucion.efectivoDevuelto.toString()).toBe('50000');
  });

  it('con tarjeta: no toca la caja y reporta el monto a reversar por fuera', async () => {
    const { svc, spies } = setupAnular({ pagos: [pagoTarjeta(30000)] });
    const res = await svc.anular(1, 'motivo', 5);

    expect(spies.movimientoCreate).not.toHaveBeenCalled();
    expect(spies.turnoUpdate).not.toHaveBeenCalled();
    expect(res.devolucion.efectivoDevuelto.toString()).toBe('0');
    expect(res.devolucion.devolverPorFuera.toString()).toBe('30000');
  });

  it('recalcula el estado aunque el pedido ya estuviera entregado', async () => {
    const { svc, spies } = setupAnular({ estadoPedido: 'ENTREGADO' });
    await svc.anular(1, 'motivo', 5);
    expect(spies.pedidoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado_pedido: 'ENTREGADO' } }),
    );
  });
});

function facturaPagadaParaReporte(fechaPrimerPago: Date, fechaPagoFinal: Date) {
  const turno = (id: number, apertura: Date, caja: string, email: string) => ({
    id_turno: id,
    fecha_apertura_turno: apertura,
    fecha_cierre_turno: null,
    caja: { id_caja: id, nombre_caja: caja },
    usuario: { email_usuario: email, empleado: null },
  });
  return {
    id_factura: 41,
    fecha_emision_factura: new Date('2026-09-01T08:30:00-05:00'),
    subtotal_factura: new Prisma.Decimal(50000),
    monto_servicio_factura: new Prisma.Decimal(5000),
    monto_impuestos_factura: new Prisma.Decimal(0),
    monto_total_factura: new Prisma.Decimal(55000),
    pagos: [
      {
        metodo_pago: 'EFECTIVO',
        monto_total_pago: new Prisma.Decimal(20000),
        monto_excedente_pago: new Prisma.Decimal(0),
        destino_excedente_pago: null,
        fecha_pago: fechaPrimerPago,
        turno: turno(10, new Date('2026-09-01T07:00:00-05:00'), 'Caja mañana', 'manana@pos.local'),
      },
      {
        metodo_pago: 'TRANSFERENCIA',
        monto_total_pago: new Prisma.Decimal(35000),
        monto_excedente_pago: new Prisma.Decimal(0),
        destino_excedente_pago: null,
        fecha_pago: fechaPagoFinal,
        turno: turno(11, new Date('2026-09-01T14:00:00-05:00'), 'Caja tarde', 'tarde@pos.local'),
      },
    ],
    subcuenta: {
      nombre_subcuenta: 'Ana',
      pedido: {
        id_pedido: 7,
        tipo_pedido: 'LOCAL',
        nombre_cliente_pedido: null,
        telefono_cliente_pedido: null,
        direccion_cliente_pedido: null,
        ficha: { numero_ficha: '01' },
        mesero: { email_usuario: 'mesero@pos.local', empleado: null },
      },
    },
    detalles: [
      {
        proporcion_facturada_fd: new Prisma.Decimal(1),
        subtotal_facturado_fd: new Prisma.Decimal(50000),
        detalleComanda: {
          id_detalleComanda: 3,
          cantidad_producto_dc: 1,
          precio_unitario_dc: new Prisma.Decimal(50000),
          producto: { nombre_producto: 'Producto prueba' },
          combo: null,
        },
      },
    ],
  };
}

describe('FacturasService.findCuentasPagadas', () => {
  it('asigna la cuenta al turno del pago que termino de saldarla', async () => {
    const primerPago = new Date('2026-09-01T09:00:00-05:00');
    const pagoFinal = new Date('2026-09-01T15:00:00-05:00');
    const prisma = {
      factura: { findMany: jest.fn().mockResolvedValue([facturaPagadaParaReporte(primerPago, pagoFinal)]) },
    } as unknown as PrismaService;
    const servicio = new FacturasService(prisma, {} as BillingConfigService);

    const cuentas = await servicio.findCuentasPagadas(
      '2026-09-01T14:00:00-05:00',
      '2026-09-01T16:00:00-05:00',
    );

    expect(cuentas).toHaveLength(1);
    expect(cuentas[0]).toMatchObject({ fecha: pagoFinal, cajero: 'tarde@pos.local' });
    expect(cuentas[0].turno).toMatchObject({ id: 11, caja: 'Caja tarde', cajero: 'tarde@pos.local' });
  });

  it('excluye la cuenta si el pago final ocurrio fuera del rango solicitado', async () => {
    const prisma = {
      factura: {
        findMany: jest.fn().mockResolvedValue([
          facturaPagadaParaReporte(
            new Date('2026-09-01T09:00:00-05:00'),
            new Date('2026-09-01T17:00:00-05:00'),
          ),
        ]),
      },
    } as unknown as PrismaService;
    const servicio = new FacturasService(prisma, {} as BillingConfigService);

    await expect(
      servicio.findCuentasPagadas('2026-09-01T08:00:00-05:00', '2026-09-01T16:00:00-05:00'),
    ).resolves.toEqual([]);
  });
});
