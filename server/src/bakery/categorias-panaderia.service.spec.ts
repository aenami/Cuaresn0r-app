import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriasPanaderiaService } from './categorias-panaderia.service';

describe('CategoriasPanaderiaService', () => {
  const categoriaPanaderia = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const servicio = new CategoriasPanaderiaService({ categoriaPanaderia } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea una categoría de panes con el nombre normalizado', async () => {
    categoriaPanaderia.findMany.mockResolvedValue([]);
    categoriaPanaderia.create.mockResolvedValue({ id: 4, nombre: 'Pan integral', tipo: 'PANADERIA' });

    await expect(servicio.crear({ nombre: '  Pan integral  ', tipo: 'PANADERIA' }))
      .resolves.toMatchObject({ id: 4, nombre: 'Pan integral' });
    expect(categoriaPanaderia.create).toHaveBeenCalledWith({
      data: { nombre: 'Pan integral', tipo: 'PANADERIA' },
    });
  });

  it('impide duplicados de nombre dentro del mismo tipo incluso con distinta capitalización', async () => {
    categoriaPanaderia.findMany.mockResolvedValue([{ id: 1, nombre: 'Pan integral' }]);

    await expect(servicio.crear({ nombre: 'PAN INTEGRAL', tipo: 'PANADERIA' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(categoriaPanaderia.create).not.toHaveBeenCalled();
  });

  it('no acepta un nombre compuesto solo por espacios', async () => {
    await expect(servicio.crear({ nombre: '   ', tipo: 'PASTELERIA' }))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('desactiva una categoría sin eliminarla ni desasociar productos históricos', async () => {
    categoriaPanaderia.findUnique.mockResolvedValue({ id: 2, nombre: 'Tortas', tipo: 'PASTELERIA' });
    categoriaPanaderia.update.mockResolvedValue({ id: 2, nombre: 'Tortas', activa: false });

    await servicio.actualizar(2, { activa: false });

    expect(categoriaPanaderia.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { activa: false },
    });
  });

  it('requiere una categoría existente para editarla', async () => {
    categoriaPanaderia.findUnique.mockResolvedValue(null);
    await expect(servicio.actualizar(99, { nombre: 'Dulces' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
