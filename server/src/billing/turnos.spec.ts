import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TurnosService } from './turnos.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto';
import { Prisma } from '../generated/prisma/client';
import { BakeryService } from '../bakery/bakery.service';

// TurnosService gobierna la caja: una sola caja/usuario con turno abierto a la
// vez (apertura), y al cerrar recalcula el efectivo esperado desde la fuente de
// verdad (apertura + pagos EFECTIVO + INGRESO - EGRESO), nunca desde el cache.
// Se prueban las guardas y ese recalculo con un prisma simulado.

// ---- abrir ----

const abrirDto = (idCaja = 1) => ({ idCaja, tipo: 'MANANA' }) as AbrirTurnoDto;

function setupAbrir(
  opts: { caja?: unknown; turnoUsuario?: unknown; turnoCaja?: unknown } = {},
) {
  const { caja = { id_caja: 1, area: 'RESTAURANTE' }, turnoUsuario = null, turnoCaja = null } = opts;
  const spies = {
    queryRaw: jest.fn().mockResolvedValue(caja ? [caja] : []),
    // Los dos findFirst comparten metodo; se distinguen por el filtro.
    turnoFindFirst: jest.fn(
      (args: {
        where: { id_usuario_turno?: number; id_caja_turno?: number };
      }) => {
        if (args.where.id_usuario_turno !== undefined)
          return Promise.resolve(turnoUsuario);
        return Promise.resolve(turnoCaja);
      },
    ),
    turnoCreate: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id_turno: 9, ...args.data }),
    ),
  };
  const tx = {
    $queryRaw: spies.queryRaw,
    turno: { findFirst: spies.turnoFindFirst, create: spies.turnoCreate },
  };
  const prisma = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  } as unknown as PrismaService;
  return { svc: new TurnosService(prisma, {} as BakeryService), spies };
}

describe('TurnosService.abrir (guardas)', () => {
  it('404 si la caja no existe', async () => {
    const { svc } = setupAbrir({ caja: null });
    await expect(svc.abrir(1, abrirDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('409 si el usuario ya tiene un turno abierto', async () => {
    const { svc } = setupAbrir({ turnoUsuario: { id_turno: 1 } });
    await expect(svc.abrir(1, abrirDto())).rejects.toThrow(
      /ya tienes un turno abierto/i,
    );
  });

  it('409 si la caja ya tiene un turno abierto', async () => {
    const { svc } = setupAbrir({ turnoCaja: { id_turno: 2 } });
    await expect(svc.abrir(1, abrirDto())).rejects.toThrow(
      /caja ya tiene un turno/i,
    );
  });
});

describe('TurnosService.abrir (creacion)', () => {
  it('siempre recibe la base fija de 300.000 COP', async () => {
    const { svc, spies } = setupAbrir();
    await svc.abrir(5, abrirDto(1));
    const data = spies.turnoCreate.mock.calls[0][0].data;
    expect(data.monto_apertura_turno.toString()).toBe('300000');
    expect(data.monto_cierre_esperado.toString()).toBe('300000');
    expect(data.id_usuario_turno).toBe(5);
    expect(data.tipo_turno).toBe('MANANA');
  });
});

// ---- cerrar ----

const cerrarDto = (montoCierreReal = 165000) =>
  ({ montoCierreReal, tipo: 'MANANA' }) as CerrarTurnoDto;

function setupCerrar(
  opts: {
    turno?: Record<string, unknown> | null;
    encontrado?: boolean;
    efectivo?: Prisma.Decimal | null;
    excedente?: Prisma.Decimal | null;
    ingresos?: Prisma.Decimal | null;
    egresos?: Prisma.Decimal | null;
    facturasPendientes?: Array<Record<string, unknown>>;
    conteos?: Array<Record<string, unknown>>;
    elementos?: Array<Record<string, unknown>>;
    entregados?: Array<Record<string, unknown>>;
  } = {},
) {
  const {
    turno = {
      id_turno: 3,
      estado_turno: 'ABIERTO',
      id_usuario_turno: 1,
      monto_apertura_turno: new Prisma.Decimal(100000),
    },
    encontrado = true,
    efectivo = new Prisma.Decimal(50000),
    excedente = new Prisma.Decimal(0),
    ingresos = new Prisma.Decimal(20000),
    egresos = new Prisma.Decimal(5000),
    facturasPendientes = [],
  } = opts;
  const spies = {
    queryRaw: jest.fn().mockResolvedValue(encontrado ? [{ id_turno: 3 }] : []),
    turnoFind: jest.fn().mockResolvedValue(turno && { caja: { area: 'RESTAURANTE' }, ...turno }),
    turnoUpdate: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id_turno: 3, ...args.data }),
    ),
    pagoAggregate: jest.fn().mockResolvedValue({
      _sum: { monto_total_pago: efectivo, monto_excedente_pago: excedente },
    }),
    pagoPanaderiaAggregate: jest.fn().mockResolvedValue({ _sum: { monto: null } }),
    movimientoAggregate: jest.fn((args: { where: { tipo_mc: string } }) =>
      Promise.resolve({
        _sum: {
          monto_mc: args.where.tipo_mc === 'INGRESO' ? ingresos : egresos,
        },
      }),
    ),
    cuentasFindMany: jest.fn().mockResolvedValue(facturasPendientes),
    estabilizarInventario: jest.fn().mockResolvedValue(0),
    conteos: jest.fn().mockResolvedValue(opts.conteos ?? []),
  };
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.estabilizarInventario,
    turno: { findUniqueOrThrow: spies.turnoFind, update: spies.turnoUpdate },
    pago: { aggregate: spies.pagoAggregate },
    pagoVentaPanaderia: { aggregate: spies.pagoPanaderiaAggregate },
    movimientoCaja: { aggregate: spies.movimientoAggregate },
    cuentaPorPagar: { findMany: spies.cuentasFindMany },
    conteoInventarioDiario: { findMany: spies.conteos },
    elementoConteoDiario: {
      findMany: jest.fn().mockResolvedValue(opts.elementos ?? []),
    },
    detalleComanda: {
      findMany: jest.fn().mockResolvedValue(opts.entregados ?? []),
    },
    transferenciaRestaurantePanaderia: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const prisma = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  } as unknown as PrismaService;
  const bakery = { aplicarConteoCierre: jest.fn().mockResolvedValue({ completo: true, fecha: '2026-09-22', valorDiferencia: '3000', detalle: [] }) };
  return { svc: new TurnosService(prisma, bakery as unknown as BakeryService), spies, bakery };
}

describe('TurnosService.cerrar (guardas)', () => {
  it('404 si el turno no existe', async () => {
    const { svc } = setupCerrar({ encontrado: false });
    await expect(
      svc.cerrar(3, 1, 'CAJERO', cerrarDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si el turno ya esta cerrado', async () => {
    const { svc } = setupCerrar({
      turno: {
        id_turno: 3,
        estado_turno: 'CERRADO',
        id_usuario_turno: 1,
        monto_apertura_turno: new Prisma.Decimal(0),
      },
    });
    await expect(
      svc.cerrar(3, 1, 'CAJERO', cerrarDto()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('403 si lo intenta cerrar otro cajero (no dueno, no ADMIN)', async () => {
    const { svc } = setupCerrar({
      turno: {
        id_turno: 3,
        estado_turno: 'ABIERTO',
        id_usuario_turno: 99,
        monto_apertura_turno: new Prisma.Decimal(0),
      },
    });
    await expect(
      svc.cerrar(3, 1, 'CAJERO', cerrarDto()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un ADMIN puede cerrar el turno de otro cajero', async () => {
    const { svc, spies } = setupCerrar({
      turno: {
        id_turno: 3,
        estado_turno: 'ABIERTO',
        id_usuario_turno: 99,
        monto_apertura_turno: new Prisma.Decimal(0),
      },
    });
    await svc.cerrar(3, 1, 'ADMIN', cerrarDto());
    expect(spies.turnoUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('TurnosService.cerrar (cuadre)', () => {
  it.each(['TARDE_NOCHE', 'UNICO'])(
    'exige conteo completo para %s incluso a un ADMIN',
    async (tipo) => {
      const { svc, spies } = setupCerrar({
        turno: {
          id_turno: 3,
          tipo_turno: tipo,
          fecha_apertura_turno: new Date('2026-09-22T15:00:00Z'),
          estado_turno: 'ABIERTO',
          id_usuario_turno: 1,
        },
      });
      // Enviar MANANA en el cierre no debe permitir evadir el tipo guardado.
      await expect(svc.cerrar(3, 1, 'ADMIN', cerrarDto())).rejects.toThrow(
        /conteo diario/,
      );
      expect(spies.turnoUpdate).not.toHaveBeenCalled();
    },
  );

  it('permite cierre nocturno con discrepancia y guarda el resultado del conteo', async () => {
    const { svc, spies } = setupCerrar({
      turno: {
        id_turno: 3,
        tipo_turno: 'TARDE_NOCHE',
        fecha_apertura_turno: new Date('2026-09-22T15:00:00Z'),
        estado_turno: 'ABIERTO',
        id_usuario_turno: 1,
        monto_apertura_turno: new Prisma.Decimal(300000),
      },
      conteos: [
        {
          id_conteoInventario: 1,
          nombre_objetivo_conteoInventario: 'Agua',
          tipo_objetivo_conteoInventario: 'PRODUCTO',
          id_producto_conteoInventario: 3,
          fecha_conteoInventario: new Date('2026-09-22'),
          fecha_anterior_conteoInventario: null,
          cantidad_salida_conteoInventario: new Prisma.Decimal(5),
          estado_conteoInventario: 'FINALIZADO',
        },
      ],
    });
    await svc.cerrar(3, 1, 'CAJERO', cerrarDto());
    expect(
      spies.turnoUpdate.mock.calls[0][0].data.conteo_inventario_cierre_turno,
    ).toMatchObject({ completo: true, inconsistencias: 1 });
  });

  it('mañana no exige conteo y un turno antiguo requiere clasificación explícita', async () => {
    const { svc, spies } = setupCerrar();
    await expect(
      svc.cerrar(3, 1, 'CAJERO', { montoCierreReal: 0 }),
    ).rejects.toThrow(/tipo/);
    await svc.cerrar(3, 1, 'CAJERO', cerrarDto());
    expect(spies.conteos).not.toHaveBeenCalled();
  });

  it('congela el esperado recalculado: apertura + efectivo + ingresos - egresos', async () => {
    const { svc, spies } = setupCerrar(); // 100000 + 50000 + 20000 - 5000
    await svc.cerrar(3, 1, 'CAJERO', cerrarDto(165000));
    const data = spies.turnoUpdate.mock.calls[0][0].data as Record<
      string,
      Prisma.Decimal | unknown
    >;
    expect((data.monto_cierre_esperado as Prisma.Decimal).toString()).toBe(
      '165000',
    );
    expect(data.estado_turno).toBe('CERRADO');
    expect(data.monto_cierre_real_turno).toBe(165000);
  });

  it('trata como 0 los agregados vacios (turno sin pagos ni movimientos)', async () => {
    const { svc, spies } = setupCerrar({
      efectivo: null,
      excedente: null,
      ingresos: null,
      egresos: null,
    });
    await svc.cerrar(3, 1, 'CAJERO', cerrarDto(100000));
    const data = spies.turnoUpdate.mock.calls[0][0].data as Record<
      string,
      Prisma.Decimal
    >;
    expect(data.monto_cierre_esperado.toString()).toBe('100000'); // solo la base
  });

  it('incluye el excedente en efectivo en el esperado', async () => {
    // 100000 base + 50000 efectivo + 3000 excedente + 20000 ingresos - 5000 egresos
    const { svc, spies } = setupCerrar({ excedente: new Prisma.Decimal(3000) });
    await svc.cerrar(3, 1, 'CAJERO', cerrarDto(168000));
    const data = spies.turnoUpdate.mock.calls[0][0].data as Record<
      string,
      Prisma.Decimal
    >;
    expect(data.monto_cierre_esperado.toString()).toBe('168000');
  });

  it('congela las facturas pendientes como informacion historica del cuadre', async () => {
    const { svc, spies } = setupCerrar({
      facturasPendientes: [
        {
          id_cuentaPorPagar: 8,
          concepto_cuentaPorPagar: 'Compra de verduras',
          documento_cuentaPorPagar: 'FV-22',
          fecha_vencimiento_cuentaPorPagar: new Date(
            '2026-09-10T00:00:00.000Z',
          ),
          monto_total_cuentaPorPagar: new Prisma.Decimal(120000),
          proveedor: { nombre_proveedor: 'La Huerta' },
          pagos: [{ monto_pagoCuentaPorPagar: new Prisma.Decimal(20000) }],
        },
      ],
    });

    await svc.cerrar(3, 1, 'CAJERO', cerrarDto());

    const snapshot = spies.turnoUpdate.mock.calls[0][0].data
      .facturas_pendientes_cierre_turno as {
      total: string;
      cuentas: Array<{ proveedor: string; saldoPendiente: string }>;
    };
    expect(snapshot.total).toBe('100000');
    expect(snapshot.cuentas).toEqual([
      expect.objectContaining({
        proveedor: 'La Huerta',
        saldoPendiente: '100000',
      }),
    ]);
  });

  it('separa cierre de panaderia y suma sus cobros en efectivo', async () => {
    const { svc, spies, bakery } = setupCerrar({
      turno: {
        id_turno: 3,
        tipo_turno: 'TARDE_NOCHE',
        fecha_apertura_turno: new Date('2026-09-22T15:00:00Z'),
        estado_turno: 'ABIERTO',
        id_usuario_turno: 1,
        monto_apertura_turno: new Prisma.Decimal(300000),
        caja: { area: 'PANADERIA' },
      },
      efectivo: new Prisma.Decimal(0), ingresos: new Prisma.Decimal(0), egresos: new Prisma.Decimal(0),
    });
    spies.pagoPanaderiaAggregate.mockResolvedValue({ _sum: { monto: new Prisma.Decimal(12000) } });
    await svc.cerrar(3, 1, 'CAJERO', cerrarDto(312000));
    expect(bakery.aplicarConteoCierre).toHaveBeenCalledTimes(1);
    expect(spies.turnoUpdate.mock.calls[0][0].data.conteo_panaderia_cierre_turno).toMatchObject({ valorDiferencia: '3000' });
    expect(spies.turnoUpdate.mock.calls[0][0].data.monto_cierre_esperado.toString()).toBe('312000');
  });
});
