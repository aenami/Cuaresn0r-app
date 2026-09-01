import { BadRequestException } from '@nestjs/common';
import { SubcuentasService } from './subcuentas.service';
import { PrismaService } from '../prisma/prisma.service';
import { RepartoDto } from './dto/split-item.dto';

// SubcuentasService reparte los items de un pedido entre cuentas divididas. El
// reparto proporcional (una pizza para 2) usa SubcuentaDetalleComanda con
// proporciones que deben sumar 1; la reasignacion directa mueve el padre y
// arrastra a sus hijos de combo. Se prueba con un prisma simulado.

const IDPEDIDO = 10;

// prisma con metodos directos (para las precondiciones) y un $transaction que
// ejecuta el callback con un `tx` de dobles.
function setup(opts: { item?: Record<string, unknown> | null; subcuentaPedido?: number; facturada?: boolean } = {}) {
  const { item = { id_detalleComanda: 1, comanda: { id_pedido_comanda: IDPEDIDO }, id_subcuenta_dc: null }, subcuentaPedido = IDPEDIDO, facturada = false } = opts;
  const txSpies = {
    dcUpdate: jest.fn().mockResolvedValue({}),
    dcUpdateMany: jest.fn().mockResolvedValue({ count: 1 }),
    dcFind: jest.fn().mockResolvedValue({ id_detalleComanda: 1, subcuentasReparto: [] }),
    sdcDeleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    sdcCreateMany: jest.fn().mockResolvedValue({ count: 2 }),
  };
  const tx = {
    detalleComanda: { update: txSpies.dcUpdate, updateMany: txSpies.dcUpdateMany, findUniqueOrThrow: txSpies.dcFind },
    subcuentaDetalleComanda: { deleteMany: txSpies.sdcDeleteMany, createMany: txSpies.sdcCreateMany },
  };
  const spies = {
    ...txSpies,
    dcFindUnique: jest.fn().mockResolvedValue(item),
    subFindUnique: jest.fn().mockResolvedValue({ id_subcuenta: 1, id_pedido_subcuenta: subcuentaPedido }),
    facturaDetalleFindFirst: jest.fn().mockResolvedValue(facturada ? { id_facturaDetalle: 1 } : null),
  };
  const prisma = {
    detalleComanda: { findUnique: spies.dcFindUnique },
    subcuenta: { findUnique: spies.subFindUnique },
    facturaDetalle: { findFirst: spies.facturaDetalleFindFirst },
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  } as unknown as PrismaService;
  return { svc: new SubcuentasService(prisma), spies };
}

const reparto = (pares: [number, number][]): RepartoDto[] => pares.map(([idSubcuenta, proporcion]) => ({ idSubcuenta, proporcion }));

describe('SubcuentasService.repartir (validacion)', () => {
  it('400 si las proporciones no suman exactamente 1', async () => {
    const { svc } = setup();
    await expect(svc.repartir(IDPEDIDO, 1, reparto([[1, 0.5]]))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 si se reparte dos veces hacia la misma subcuenta', async () => {
    const { svc } = setup();
    await expect(svc.repartir(IDPEDIDO, 1, reparto([[1, 0.5], [1, 0.5]]))).rejects.toThrow(/misma subcuenta/i);
  });
});

describe('SubcuentasService.repartir (persistencia)', () => {
  it('limpia la asignacion directa y crea el reparto proporcional', async () => {
    const { svc, spies } = setup();
    await svc.repartir(IDPEDIDO, 1, reparto([[1, 0.6], [2, 0.4]]));

    // El item deja de estar asignado directo (exclusion mutua con el reparto).
    expect(spies.dcUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { id_subcuenta_dc: null } }));
    expect(spies.sdcDeleteMany).toHaveBeenCalledTimes(1);
    const data = spies.sdcCreateMany.mock.calls[0][0].data as { id_subcuenta_sdc: number; proporcion_sdc: number }[];
    expect(data).toEqual([
      { id_detalleComanda_sdc: 1, id_subcuenta_sdc: 1, proporcion_sdc: 0.6 },
      { id_detalleComanda_sdc: 1, id_subcuenta_sdc: 2, proporcion_sdc: 0.4 },
    ]);
  });
});

describe('SubcuentasService.reasignar (arrastre de hijos)', () => {
  it('mover un padre de combo arrastra a sus hijos a la misma subcuenta', async () => {
    const { svc, spies } = setup({ item: { id_detalleComanda: 1, comanda: { id_pedido_comanda: IDPEDIDO }, id_subcuenta_dc: null } });
    await svc.reasignar(IDPEDIDO, 1, 2);

    // Primero se mueven los hijos (por id_detalleComandaPadre_dc), luego el padre.
    expect(spies.dcUpdateMany).toHaveBeenCalledWith({
      where: { id_detalleComandaPadre_dc: 1 },
      data: { id_subcuenta_dc: 2 },
    });
    expect(spies.dcUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id_detalleComanda: 1 }, data: { id_subcuenta_dc: 2 } }));
  });
});
