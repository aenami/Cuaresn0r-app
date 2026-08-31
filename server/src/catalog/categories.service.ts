import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    return this.prisma.categoria.create({
      data: {
        nombre_categoria: dto.name,
        ...(dto.description !== undefined && { descripcion_categoria: dto.description }),
        ...(dto.destino !== undefined && { destino_categoria: dto.destino }),
        ...(dto.esAdicion !== undefined && { es_adicion: dto.esAdicion }),
      },
    });
  }

  async findAll() {
    return this.prisma.categoria.findMany({ orderBy: { id_categoria: 'asc' } });
  }

  async findOne(id: number) {
    const categoria = await this.prisma.categoria.findUnique({ where: { id_categoria: id } });
    if (!categoria) throw new NotFoundException('Categoria no encontrada');
    return categoria;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOne(id);
    return this.prisma.categoria.update({
      where: { id_categoria: id },
      data: {
        ...(dto.name !== undefined && { nombre_categoria: dto.name }),
        ...(dto.description !== undefined && { descripcion_categoria: dto.description }),
        ...(dto.destino !== undefined && { destino_categoria: dto.destino }),
        ...(dto.esAdicion !== undefined && { es_adicion: dto.esAdicion }),
      },
    });
  }

  // Borrado real: los productos que la usaban quedan con categoria_producto = null (FK opcional).
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.categoria.delete({ where: { id_categoria: id } });
  }
}
