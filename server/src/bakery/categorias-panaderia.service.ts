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
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });
  }

  async crear(dto: CrearCategoriaPanaderiaDto) {
    const nombre = this.validarNombre(dto.nombre);
    await this.exigirNombreDisponible(dto.tipo, nombre);
    try {
      return await this.prisma.categoriaPanaderia.create({
        data: { nombre, tipo: dto.tipo },
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
    if (nombre !== undefined && nombre !== categoria.nombre) {
      await this.exigirNombreDisponible(categoria.tipo, nombre, id);
    }
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

  private validarNombre(nombre: string) {
    const limpio = nombre.trim();
    if (!limpio) throw new UnprocessableEntityException('Ingresa el nombre de la categoría');
    return limpio;
  }

  private async exigirNombreDisponible(tipo: string, nombre: string, excluirId?: number) {
    const categorias = await this.prisma.categoriaPanaderia.findMany({
      where: { tipo: tipo as CrearCategoriaPanaderiaDto['tipo'] },
      select: { id: true, nombre: true },
    });
    if (categorias.some((categoria) =>
      categoria.id !== excluirId && categoria.nombre.toLocaleLowerCase('es-CO') === nombre.toLocaleLowerCase('es-CO')))
      throw new ConflictException('Ya existe una categoría con ese nombre en este tipo');
  }

  private traducirDuplicado(error: unknown) {
    if ((error as { code?: string }).code === 'P2002')
      throw new ConflictException('Ya existe una categoría con ese nombre en este tipo');
  }
}
