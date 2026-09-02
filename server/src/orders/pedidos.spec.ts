import { ConflictException, NotFoundException } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../recipes/inventory.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { ModalidadCuentaPedido, TipoPedido } from '../generated/prisma/client';

// Los pedidos locales empiezan sin ficha. La ficha se entrega al cobrar y se
// reutiliza solo cuando el pedido anterior ya cerro; las mesas no intervienen.

const dto = (d: Partial<CreatePedidoDto>) => d as unknown as CreatePedidoDto;

function setup(
  opts: {
    pedido?: Record<string, unknown> | null;
    ocupanteFicha?: Record<string, unknown> | null;
    detalles?: Record<string, unknown>[];
  } = {},
) {
  const {
    pedido = {
      id_pedido: 7,
      tipo_pedido: 'LOCAL',
      estado_pedido: 'ABIERTO',
      fecha_cierre_pedido: null,
    },
    ocupanteFicha = null,
    detalles = [],
  } = opts;
  const spies = {
    queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ id_pedido: 7 }])
      .mockResolvedValueOnce([{ id_ficha: 4, ficha_activa: true }]),
    pedidoCreate: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id_pedido: 7, ...args.data }),
    ),
    pedidoFind: jest.fn().mockResolvedValue(pedido),
    pedidoFindOrThrow: jest.fn().mockResolvedValue(pedido),
    pedidoFindFirst: jest.fn().mockResolvedValue(ocupanteFicha),
    pedidoUpdate: jest.fn().mockResolvedValue({}),
    pedidoFindIncluido: jest.fn().mockResolvedValue({ id_pedido: 7 }),
    subcuentaCreateMany: jest.fn().mockResolvedValue({ count: 1 }),
    facturaFindFirst: jest.fn().mockResolvedValue(null),
    dcFindFirst: jest.fn().mockResolvedValue(null),
    dcFindMany: jest.fn().mockResolvedValue(detalles),
    dcUpdate: jest.fn().mockResolvedValue({}),
    revertir: jest.fn().mockResolvedValue(undefined),
  };
  const tx = {
    $queryRaw: spies.queryRaw,
    pedido: {
      create: spies.pedidoCreate,
      findUnique: spies.pedidoFind,
      findUniqueOrThrow: spies.pedidoFindOrThrow,
      findFirst: spies.pedidoFindFirst,
      update: spies.pedidoUpdate,
    },
    subcuenta: { createMany: spies.subcuentaCreateMany },
    factura: { findFirst: spies.facturaFindFirst },
    detalleComanda: {
      findFirst: spies.dcFindFirst,
      findMany: spies.dcFindMany,
      update: spies.dcUpdate,
    },
  };
  const prisma = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
    pedido: { findUnique: spies.pedidoFindIncluido },
  } as unknown as PrismaService;
  const inventory = {
    revertirPorDetalleComanda: spies.revertir,
  } as unknown as InventoryService;
  return { svc: new PedidosService(prisma, inventory), spies };
}

describe('PedidosService.create', () => {
  it('abre un pedido LOCAL sin ficha ni mesa y crea su cuenta principal', async () => {
    const { svc, spies } = setup();
    await svc.create(5, dto({}));

    const data = spies.pedidoCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tipo_pedido: 'LOCAL',
      modalidad_cuenta_pedido: 'UNICA',
      mesero_pedido: 5,
    });
    expect(data.id_ficha_pedido).toBeUndefined();
    expect(spies.subcuentaCreateMany).toHaveBeenCalledWith({
      data: [{ id_pedido_subcuenta: 7, nombre_subcuenta: 'Cuenta principal' }],
    });
  });

  it('abre un pedido POR_CUENTA con cada cliente organizado desde el inicio', async () => {
    const { svc, spies } = setup();
    await svc.create(
      5,
      dto({
        modalidadCuenta: ModalidadCuentaPedido.POR_CUENTA,
        nombresCuentas: ['Ana', 'Luis'],
      }),
    );

    expect(spies.pedidoCreate.mock.calls[0][0].data).toMatchObject({
      modalidad_cuenta_pedido: 'POR_CUENTA',
    });
    expect(spies.subcuentaCreateMany).toHaveBeenCalledWith({
      data: [
        { id_pedido_subcuenta: 7, nombre_subcuenta: 'Ana' },
        { id_pedido_subcuenta: 7, nombre_subcuenta: 'Luis' },
      ],
    });
  });

  it('rechaza nombres de cuenta repetidos sin importar mayusculas', async () => {
    const { svc, spies } = setup();
    await expect(
      svc.create(
        5,
        dto({
          modalidadCuenta: ModalidadCuentaPedido.POR_CUENTA,
          nombresCuentas: ['Ana', 'ana'],
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(spies.pedidoCreate).not.toHaveBeenCalled();
  });

  it('conserva el flujo de domicilio con los datos de entrega', async () => {
    const { svc, spies } = setup();
    await svc.create(
      5,
      dto({
        tipo: TipoPedido.DOMICILIO,
        nombreCliente: 'Juan',
        telefonoCliente: '3001112233',
        direccionCliente: 'Calle 1 #2-3',
      }),
    );

    expect(spies.pedidoCreate.mock.calls[0][0].data).toMatchObject({
      tipo_pedido: 'DOMICILIO',
      nombre_cliente_pedido: 'Juan',
      telefono_cliente_pedido: '3001112233',
      direccion_cliente_pedido: 'Calle 1 #2-3',
    });
  });
});

describe('PedidosService.asignarFicha', () => {
  it('asigna una ficha activa a un pedido local sin cerrarlo', async () => {
    const { svc, spies } = setup();
    await svc.asignarFicha(7, 4);

    expect(spies.pedidoFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id_ficha_pedido: 4,
          estado_pedido: { notIn: ['CERRADO', 'CANCELADO'] },
        }),
      }),
    );
    expect(spies.pedidoUpdate).toHaveBeenCalledWith({
      where: { id_pedido: 7 },
      data: { id_ficha_pedido: 4 },
    });
  });

  it('409 si otro pedido aun activo ocupa la ficha', async () => {
    const { svc } = setup({ ocupanteFicha: { id_pedido: 99 } });
    await expect(svc.asignarFicha(7, 4)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('409 si se intenta asignar una ficha a domicilio', async () => {
    const { svc } = setup({
      pedido: {
        id_pedido: 7,
        tipo_pedido: 'DOMICILIO',
        estado_pedido: 'ABIERTO',
      },
    });
    await expect(svc.asignarFicha(7, 4)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('PedidosService.cancel', () => {
  it('cancela las rondas pendientes y revierte solamente lo que ya preparaba', async () => {
    const { svc, spies } = setup({
      detalles: [
        { id_detalleComanda: 1, estado_dc: 'PREPARANDO' },
        { id_detalleComanda: 2, estado_dc: 'PENDIENTE' },
      ],
    });
    await svc.cancel(7);

    expect(spies.dcUpdate).toHaveBeenCalledTimes(2);
    expect(spies.revertir).toHaveBeenCalledTimes(1);
    expect(spies.revertir).toHaveBeenCalledWith(expect.anything(), 1);
    expect(spies.pedidoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado_pedido: 'CANCELADO' }),
      }),
    );
  });

  it('404 si el pedido no existe', async () => {
    const { svc } = setup({ pedido: null });
    await expect(svc.cancel(7)).rejects.toBeInstanceOf(NotFoundException);
  });
});
