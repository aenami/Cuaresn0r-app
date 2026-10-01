import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BakeryService } from './bakery.service';

describe('BakeryService categorias de articulos', () => {
  const categoriaPanaderia = { findUnique: jest.fn() };
  const articuloPanaderia = { create: jest.fn() };
  const servicio = new BakeryService({ categoriaPanaderia, articuloPanaderia } as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('asocia una categoria activa del mismo tipo al crear un producto', async () => {
    categoriaPanaderia.findUnique.mockResolvedValue({ id: 2, tipo: 'PANADERIA', activa: true });
    articuloPanaderia.create.mockResolvedValue({ id: 10, categoriaId: 2 });

    await expect(servicio.crearArticulo({
      nombre: 'Pan campesino', tipo: 'PANADERIA', precioVenta: 2500, categoriaId: 2,
    })).resolves.toMatchObject({ categoriaId: 2 });

    expect(articuloPanaderia.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ categoriaId: 2 }),
      include: { categoria: true },
    }));
  });

  it.each([
    { tipo: 'PASTELERIA', activa: true },
    { tipo: 'PANADERIA', activa: false },
    null,
  ])('rechaza una categoria ausente, inactiva o de otro tipo: %p', async (categoria) => {
    categoriaPanaderia.findUnique.mockResolvedValue(categoria);

    await expect(servicio.crearArticulo({
      nombre: 'Pan campesino', tipo: 'PANADERIA', precioVenta: 2500, categoriaId: 2,
    })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(articuloPanaderia.create).not.toHaveBeenCalled();
  });

  it('no permite asignar categorias comerciales a insumos', async () => {
    await expect(servicio.crearArticulo({
      nombre: 'Harina', tipo: 'INSUMO', precioVenta: 0, categoriaId: 2,
    })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(categoriaPanaderia.findUnique).not.toHaveBeenCalled();
  });
});
