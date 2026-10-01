import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriasPanaderiaService } from './categorias-panaderia.service';

describe('CategoriasPanaderiaService', () => {
  const categoriaPanaderia = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const articuloPanaderia = { count: jest.fn() };
  const servicio = new CategoriasPanaderiaService({ categoriaPanaderia, articuloPanaderia } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea una categoría plana con el nombre normalizado', async () => {
    categoriaPanaderia.findFirst.mockResolvedValue(null);
    categoriaPanaderia.create.mockResolvedValue({ id: 4, nombre: 'Pan integral' });

    await expect(servicio.crear({ nombre: '  Pan integral  ' }))
      .resolves.toMatchObject({ id: 4, nombre: 'Pan integral' });
    expect(categoriaPanaderia.create).toHaveBeenCalledWith({
      data: { nombre: 'Pan integral' },
    });
  });

  it('impide duplicados de nombre globalmente incluso con distinta capitalización', async () => {
    categoriaPanaderia.findFirst.mockResolvedValue({ id: 1 });

    await expect(servicio.crear({ nombre: 'PAN INTEGRAL' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(categoriaPanaderia.create).not.toHaveBeenCalled();
    expect(categoriaPanaderia.findFirst).toHaveBeenCalledWith({
      where: { nombre: { equals: 'PAN INTEGRAL', mode: 'insensitive' } },
      select: { id: true },
    });
  });

  it('no acepta un nombre compuesto solo por espacios', async () => {
    await expect(servicio.crear({ nombre: '   ' }))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('desactiva una categoría sin eliminarla ni desasociar productos históricos', async () => {
    categoriaPanaderia.findUnique.mockResolvedValue({ id: 2, nombre: 'Tortas' });
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

  it('permite eliminar una categoría sin productos asociados', async () => {
    categoriaPanaderia.findUnique.mockResolvedValue({ id: 7, nombre: 'Temporales' });
    articuloPanaderia.count.mockResolvedValue(0);
    categoriaPanaderia.delete.mockResolvedValue({ id: 7, nombre: 'Temporales' });

    await expect(servicio.eliminar(7)).resolves.toMatchObject({ id: 7 });
    expect(articuloPanaderia.count).toHaveBeenCalledWith({ where: { categoriaId: 7 } });
    expect(categoriaPanaderia.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('protege una categoría con artículos incluso si estos están desactivados', async () => {
    categoriaPanaderia.findUnique.mockResolvedValue({ id: 7, nombre: 'Panes' });
    articuloPanaderia.count.mockResolvedValue(1);

    await expect(servicio.eliminar(7)).rejects.toThrow('reasígnalos antes de eliminarla');
    expect(categoriaPanaderia.delete).not.toHaveBeenCalled();
  });

  it('traduce a conflicto una referencia creada concurrentemente antes del DELETE', async () => {
    categoriaPanaderia.findUnique.mockResolvedValue({ id: 7, nombre: 'Panes' });
    articuloPanaderia.count.mockResolvedValue(0);
    categoriaPanaderia.delete.mockRejectedValue({ code: 'P2003' });

    await expect(servicio.eliminar(7)).rejects.toBeInstanceOf(ConflictException);
  });

  it('requiere una categoría existente para eliminarla', async () => {
    categoriaPanaderia.findUnique.mockResolvedValue(null);
    await expect(servicio.eliminar(99)).rejects.toBeInstanceOf(NotFoundException);
    expect(categoriaPanaderia.delete).not.toHaveBeenCalled();
  });
});
