import { ImpresionService } from './impresion.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketBuilderService } from './ticket-builder.service';

describe('ImpresionService: rutas de caja y preparacion', () => {
  const factura = {
    id_factura: 42,
    pagos: [],
  };
  const impresoraCaja = {
    id_impresora: 2,
    destino_impresora: 'CAJA',
    ancho_papel_impresora: 80,
  };
  const impresoraGeneral = {
    id_impresora: 1,
    destino_impresora: 'GENERAL',
    ancho_papel_impresora: 80,
  };

  function preparar() {
    const prisma = {
      factura: { findUnique: jest.fn().mockResolvedValue(factura) },
      impresora: { findFirst: jest.fn() },
      configuracionNegocio: { findFirst: jest.fn().mockResolvedValue(null) },
      trabajoImpresion: {
        create: jest.fn().mockResolvedValue({ id_trabajoImpresion: 7 }),
        upsert: jest.fn().mockResolvedValue({ id_trabajoImpresion: 8 }),
      },
      impresionComanda: {
        upsert: jest.fn().mockResolvedValue({ id_impresionComanda: 9 }),
        update: jest.fn(),
      },
    };
    const tickets = {
      armarTicketFactura: jest.fn().mockReturnValue(Buffer.from([1, 2, 3])),
      armarTicketComanda: jest.fn().mockReturnValue(Buffer.from([4, 5, 6])),
    };
    const servicio = new ImpresionService(
      prisma as unknown as PrismaService,
      tickets as unknown as TicketBuilderService,
    );
    return { prisma, tickets, servicio };
  }

  it('nunca envia una factura a GENERAL cuando no hay impresora de caja', async () => {
    const { prisma, tickets, servicio } = preparar();
    prisma.impresora.findFirst.mockResolvedValue(null);

    await expect(servicio.imprimirFactura(42)).resolves.toEqual({
      ok: false,
      motivo: 'No hay una impresora activa de Caja para imprimir facturas',
    });
    expect(prisma.impresora.findFirst).toHaveBeenCalledWith({
      where: { impresora_activa: true, destino_impresora: 'CAJA' },
    });
    expect(tickets.armarTicketFactura).not.toHaveBeenCalled();
    expect(prisma.trabajoImpresion.create).not.toHaveBeenCalled();
  });

  it('encola la factura solo para la impresora de caja', async () => {
    const { prisma, tickets, servicio } = preparar();
    prisma.impresora.findFirst.mockResolvedValue(impresoraCaja);

    await expect(servicio.imprimirFactura(42)).resolves.toEqual({
      ok: true,
      enCola: true,
      idTrabajo: 7,
    });
    expect(tickets.armarTicketFactura).toHaveBeenCalledWith(
      factura,
      null,
      null,
      80,
    );
    expect(prisma.trabajoImpresion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo_trabajo: 'FACTURA',
        destino_trabajo: 'CAJA',
        id_impresora_trabajo: impresoraCaja.id_impresora,
      }),
    });
  });

  it('mantiene las comandas de cocina en la impresora GENERAL de preparacion', async () => {
    const { prisma, servicio } = preparar();
    const comanda = {
      id_comanda: 13,
      detalles: [
        {
          estado_dc: 'PREPARANDO',
          id_detalleComandaPadre_dc: null,
          id_combo_dc: null,
          hijos: [],
          producto: { categoria: { destino_categoria: 'COCINA' } },
        },
      ],
    };
    (prisma as unknown as { comanda: { findUnique: jest.Mock } }).comanda = {
      findUnique: jest.fn().mockResolvedValue(comanda),
    };
    prisma.impresora.findFirst.mockResolvedValue(impresoraCaja);
    (prisma.impresora as unknown as { findMany: jest.Mock }).findMany = jest
      .fn()
      .mockResolvedValue([impresoraCaja, impresoraGeneral]);

    await servicio.imprimirComanda(13);

    expect(prisma.trabajoImpresion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tipo_trabajo: 'COMANDA',
          destino_trabajo: 'COCINA',
          id_impresora_trabajo: impresoraGeneral.id_impresora,
        }),
      }),
    );
  });

  it('nunca usa la impresora de caja como respaldo de una comanda', async () => {
    const { prisma, servicio } = preparar();
    const comanda = {
      id_comanda: 14,
      detalles: [
        {
          estado_dc: 'PREPARANDO',
          id_detalleComandaPadre_dc: null,
          id_combo_dc: null,
          hijos: [],
          producto: { categoria: { destino_categoria: 'BARRA' } },
        },
      ],
    };
    (prisma as unknown as { comanda: { findUnique: jest.Mock } }).comanda = {
      findUnique: jest.fn().mockResolvedValue(comanda),
    };
    (prisma.impresora as unknown as { findMany: jest.Mock }).findMany = jest
      .fn()
      .mockResolvedValue([impresoraCaja]);

    await servicio.imprimirComanda(14);

    expect(prisma.trabajoImpresion.upsert).not.toHaveBeenCalled();
    expect(prisma.impresionComanda.update).toHaveBeenCalledWith({
      where: { id_impresionComanda: 9 },
      data: expect.objectContaining({
        estado_impresion: 'FALLIDA',
        motivo_fallo: 'No hay impresora activa para BARRA ni impresora GENERAL',
      }),
    });
  });
});
