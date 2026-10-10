import { expect } from '@jest/globals';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BakeryService } from './bakery.service';

describe('BakeryService categorias de articulos', () => {
  const categoriaPanaderia = { findUnique: jest.fn() };
  const articuloPanaderia = { create: jest.fn() };
  const servicio = new BakeryService({
    categoriaPanaderia,
    articuloPanaderia,
  } as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it.each(['PANADERIA', 'PASTELERIA', 'EXTERNO'] as const)(
    'asocia cualquier categoria activa al crear un producto %s',
    async (tipo) => {
      categoriaPanaderia.findUnique.mockResolvedValue({
        id: 2,
        nombre: 'Especiales',
        activa: true,
      });
      articuloPanaderia.create.mockResolvedValue({ id: 10, categoriaId: 2 });

      await expect(
        servicio.crearArticulo({
          nombre: 'Producto',
          tipo,
          precioVenta: 2500,
          categoriaId: 2,
        }),
      ).resolves.toMatchObject({ categoriaId: 2 });

      expect(articuloPanaderia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoriaId: 2 }),
          include: { categoria: true },
        }),
      );
    },
  );

  it.each([{ activa: false }, null])(
    'rechaza una categoria ausente o inactiva: %p',
    async (categoria) => {
      categoriaPanaderia.findUnique.mockResolvedValue(categoria);

      await expect(
        servicio.crearArticulo({
          nombre: 'Pan campesino',
          tipo: 'PANADERIA',
          precioVenta: 2500,
          categoriaId: 2,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(articuloPanaderia.create).not.toHaveBeenCalled();
    },
  );

  it('no permite asignar categorias comerciales a insumos', async () => {
    await expect(
      servicio.crearArticulo({
        nombre: 'Harina',
        tipo: 'INSUMO',
        precioVenta: 0,
        categoriaId: 2,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(categoriaPanaderia.findUnique).not.toHaveBeenCalled();
  });

  it('responde con conflicto si la categoría se elimina entre validación y creación', async () => {
    categoriaPanaderia.findUnique.mockResolvedValue({ id: 2, activa: true });
    articuloPanaderia.create.mockRejectedValue({ code: 'P2003' });

    await expect(
      servicio.crearArticulo({
        nombre: 'Pan campesino',
        tipo: 'PANADERIA',
        precioVenta: 2500,
        categoriaId: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(categoriaPanaderia.findUnique).toHaveBeenCalledWith({
      where: { id: 2 },
    });
    expect(articuloPanaderia.create).toHaveBeenCalledTimes(1);
  });

  it('responde con conflicto si la categoría se elimina entre validación y edición', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 10 }]),
      articuloPanaderia: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 10, tipo: 'PANADERIA' }),
        update: jest.fn().mockRejectedValue({ code: 'P2003' }),
      },
      categoriaPanaderia: {
        findUnique: jest.fn().mockResolvedValue({ id: 2, activa: true }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (cliente: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const servicioTransaccional = new BakeryService(prisma);

    await expect(
      servicioTransaccional.actualizarArticulo(10, { categoriaId: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.categoriaPanaderia.findUnique).toHaveBeenCalledWith({
      where: { id: 2 },
    });
    expect(tx.articuloPanaderia.update).toHaveBeenCalledTimes(1);
  });
});
