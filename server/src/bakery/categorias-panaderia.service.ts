import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActualizarCategoriaPanaderiaDto,
  CrearCategoriaPanaderiaDto,
} from './categorias-panaderia.dto';

@Injectable()
export class CategoriasPanaderiaService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.categoriaPanaderia.findMany({
      orderBy: { nombre: 'asc' },
    });
  }

  async crear(dto: CrearCategoriaPanaderiaDto) {
    const nombre = this.validarNombre(dto.nombre);
    await this.exigirNombreDisponible(nombre);
    try {
      return await this.prisma.categoriaPanaderia.create({
        data: { nombre },
      });
    } catch (error) {
      this.traducirDuplicado(error);
      throw error;
    }
  }

  async actualizar(id: number, dto: ActualizarCategoriaPanaderiaDto) {
    const categoria = await this.prisma.categoriaPanaderia.findUnique({ where: { id } });
    if (!categoria) throw new NotFoundException('Categoría de panadería no encontrada');
    const nombre = dto.nombre === undefined ? undefined : this.validarNombre(dto.nombre);
    if (nombre !== undefined) await this.exigirNombreDisponible(nombre, id);
    try {
      return await this.prisma.categoriaPanaderia.update({
        where: { id },
        data: {
          ...(nombre !== undefined && { nombre }),
          ...(dto.activa !== undefined && { activa: dto.activa }),
        },
      });
    } catch (error) {
      this.traducirDuplicado(error);
      throw error;
    }
  }

  async eliminar(id: number) {
    const categoria = await this.prisma.categoriaPanaderia.findUnique({ where: { id } });
    if (!categoria) throw new NotFoundException('Categoría de panadería no encontrada');
    if (await this.prisma.articuloPanaderia.count({ where: { categoriaId: id } }))
      throw new ConflictException('La categoría tiene productos asociados; reasígnalos antes de eliminarla');
    try {
      return await this.prisma.categoriaPanaderia.delete({ where: { id } });
    } catch (error) {
      // La FK RESTRICT protege una asignación concurrente posterior al conteo.
      if (['P2003', 'P2014'].includes((error as { code?: string }).code ?? ''))
        throw new ConflictException('La categoría tiene productos asociados; reasígnalos antes de eliminarla');
      if ((error as { code?: string }).code === 'P2025')
        throw new NotFoundException('Categoría de panadería no encontrada');
      throw error;
    }
  }

  private validarNombre(nombre: string) {
    const limpio = nombre.trim();
    if (!limpio) throw new UnprocessableEntityException('Ingresa el nombre de la categoría');
    return limpio;
  }

  private async exigirNombreDisponible(nombre: string, excluirId?: number) {
    const categoria = await this.prisma.categoriaPanaderia.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excluirId !== undefined && { id: { not: excluirId } }),
      },
      select: { id: true },
    });
    if (categoria) throw new ConflictException('Ya existe una categoría con ese nombre');
  }

  private traducirDuplicado(error: unknown) {
    if ((error as { code?: string }).code === 'P2002')
      throw new ConflictException('Ya existe una categoría con ese nombre');
  }
}
