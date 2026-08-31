import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ComandasService } from './comandas.service';
import { PrismaService } from '../prisma/prisma.service';
import { PedidosService } from './pedidos.service';
import { InventoryService } from '../recipes/inventory.service';
import { ImpresionService } from '../printing/impresion.service';
import { CreateComandaDto, ComandaItemDto } from './dto/create-comanda.dto';
import { Prisma } from '../generated/prisma/client';

// ComandasService.create arma una comanda con sus items, snapshotea precio y
// receta, y descuenta inventario dentro de la transaccion; la impresion es
// fire-and-forget fuera de ella. Se prueban las guardas del pedido, la
// validacion de items y el enganche con el inventario. Prisma simulado.

const comandaDto = (items: Partial<ComandaItemDto>[]): CreateComandaDto => ({ items }) as unknown as CreateComandaDto;

function setup(opts: {
  pedido?: Record<string, unknown> | null;
  producto?: Record<string, unknown> | null;
  receta?: { id_receta: number } | null;
} = {}) {
  const {
    pedido = { id_pedido: 10, estado_pedido: 'EN_PREPARACION' },
    producto = { id_producto: 5, nombre_producto: 'Pizza', habilitado_producto: true, precio_producto: new Prisma.Decimal(20000) },
    receta = { id_receta: 77 },
  } = opts;
  const spies = {
    pedidoFindUnique: jest.fn().mockResolvedValue(pedido),
    subFindFirst: jest.fn().mockResolvedValue({ id_subcuenta: 1, id_pedido_subcuenta: 10 }),
    comandaCreate: jest.fn().mockResolvedValue({ id_comanda: 100 }),
    comandaFind: jest.fn().mockResolvedValue({ id_comanda: 100, detalles: [] }),
    comandaFindUnique: jest.fn().mockResolvedValue({ id_comanda: 100, id_pedido_comanda: 10 }),
    comandaUpdateMany: jest.fn().mockResolvedValue({ count: 1 }),
    facturaFindFirst: jest.fn().mockResolvedValue(null),
    productoFindUnique: jest.fn().mockResolvedValue(producto),
    recetaFindFirst: jest.fn().mockResolvedValue(receta),
    dcCreate: jest.fn().mockResolvedValue({ id_detalleComanda: 500 }),
    recalcular: jest.fn().mockResolvedValue(undefined),
    descontar: jest.fn().mockResolvedValue(undefined),
    imprimir: jest.fn().mockResolvedValue(undefined),
  };
  const tx = {
    pedido: { findUnique: spies.pedidoFindUnique },
    subcuenta: { findFirstOrThrow: spies.subFindFirst },
    comanda: {
      create: spies.comandaCreate,
      findUniqueOrThrow: spies.comandaFind,
      findUnique: spies.comandaFindUnique,
    },
    detalleComanda: { create: spies.dcCreate, updateMany: spies.comandaUpdateMany },
    factura: { findFirst: spies.facturaFindFirst },
    producto: { findUnique: spies.productoFindUnique },
    receta: { findFirst: spies.recetaFindFirst },
  };
  const prisma = { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) } as unknown as PrismaService;
  const pedidos = { recalcularEstadoPedido: spies.recalcular } as unknown as PedidosService;
  const inventory = { descontarPorReceta: spies.descontar } as unknown as InventoryService;
  const impresion = { imprimirComanda: spies.imprimir } as unknown as ImpresionService;
  return { svc: new ComandasService(prisma, pedidos, inventory, impresion), spies };
}

describe('ComandasService.create (guardas del pedido)', () => {
  it('404 si el pedido no existe', async () => {
    const { svc } = setup({ pedido: null });
    await expect(svc.create(10, comandaDto([{ idProducto: 5, cantidad: 1 }]))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si el pedido ya esta PAGADO', async () => {
    const { svc } = setup({ pedido: { id_pedido: 10, estado_pedido: 'PAGADO' } });
    await expect(svc.create(10, comandaDto([{ idProducto: 5, cantidad: 1 }]))).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ComandasService.create (validacion de items)', () => {
  it('400 si un item no especifica exactamente uno de producto/combo', async () => {
    const { svc } = setup();
    await expect(svc.create(10, comandaDto([{ cantidad: 1 }]))).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create(10, comandaDto([{ idProducto: 5, idCombo: 2, cantidad: 1 }]))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 si un combo trae personalizaciones sueltas (van por componente)', async () => {
    const { svc } = setup();
    await expect(
      svc.create(10, comandaDto([{ idCombo: 2, cantidad: 1, personalizaciones: [{ idIngrediente: 1, delta: 1 }] }])),
    ).rejects.toThrow(/componente/i);
  });

  it('400 si un producto trae el campo componentes (solo aplica a combos)', async () => {
    const { svc } = setup();
    await expect(
      svc.create(10, comandaDto([{ idProducto: 5, cantidad: 1, componentes: [{ idProducto: 5, personalizaciones: [] }] }])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ComandasService.create (snapshot y descuento de inventario)', () => {
  it('snapshotea precio y receta activa, descuenta inventario y dispara la impresion', async () => {
    const { svc, spies } = setup();
    await svc.create(10, comandaDto([{ idProducto: 5, cantidad: 3 }]));

    const data = spies.dcCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.id_producto_dc).toBe(5);
    expect((data.precio_unitario_dc as Prisma.Decimal).toString()).toBe('20000'); // snapshot del precio de venta
    expect(data.id_receta_usada_dc).toBe(77); // snapshot de la receta activa
    expect(data.cantidad_producto_dc).toBe(3);

    expect(spies.descontar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idReceta: 77, cantidadProducto: 3, idDetalleComanda: 500 }),
    );
    expect(spies.recalcular).toHaveBeenCalledWith(expect.anything(), 10);
    expect(spies.imprimir).toHaveBeenCalledWith(100); // fire-and-forget fuera de la transaccion
  });

  it('un producto sin receta activa no intenta descontar inventario', async () => {
    const { svc, spies } = setup({ receta: null });
    await svc.create(10, comandaDto([{ idProducto: 5, cantidad: 1 }]));
    expect(spies.dcCreate.mock.calls[0][0].data.id_receta_usada_dc).toBeUndefined();
    expect(spies.descontar).not.toHaveBeenCalled();
  });

  it('422 si el producto esta deshabilitado', async () => {
    const { svc } = setup({ producto: { id_producto: 5, nombre_producto: 'Pizza', habilitado_producto: false, precio_producto: new Prisma.Decimal(20000) } });
    await expect(svc.create(10, comandaDto([{ idProducto: 5, cantidad: 1 }]))).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe('ComandasService.entregarComanda', () => {
  it('404 si la comanda no pertenece al pedido', async () => {
    const { svc, spies } = setup();
    spies.comandaFindUnique.mockResolvedValueOnce({ id_comanda: 100, id_pedido_comanda: 999 });
    await expect(svc.entregarComanda(10, 100)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marca ENTREGADO los items PREPARANDO de la comanda y recalcula el pedido', async () => {
    const { svc, spies } = setup();
    await svc.entregarComanda(10, 100);
    expect(spies.comandaUpdateMany).toHaveBeenCalledWith({
      where: { id_comanda_dc: 100, estado_dc: 'PREPARANDO' },
      data: { estado_dc: 'ENTREGADO' },
    });
    expect(spies.recalcular).toHaveBeenCalledWith(expect.anything(), 10);
  });
});
