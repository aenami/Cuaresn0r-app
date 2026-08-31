import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';

@Injectable()
export class IngredientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIngredientDto) {
    return this.prisma.ingrediente.create({
      data: {
        nombre_ingrediente: dto.name,
        stock_ingrediente: dto.stock,
        unidades_ingrediente: dto.units,
        precio_ingrediente: dto.price,
      },
    });
  }

  async findAll() {
    return this.prisma.ingrediente.findMany({ orderBy: { id_ingrediente: 'asc' } });
  }

  async findOne(id: number) {
    const ingrediente = await this.prisma.ingrediente.findUnique({ where: { id_ingrediente: id } });
    if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado');
    return ingrediente;
  }

  // stock_ingrediente no se toca aqui: es cacheado, solo cambia via InventoryService.
  async update(id: number, dto: UpdateIngredientDto) {
    await this.findOne(id);
    return this.prisma.ingrediente.update({
      where: { id_ingrediente: id },
      data: {
        ...(dto.name !== undefined && { nombre_ingrediente: dto.name }),
        ...(dto.units !== undefined && { unidades_ingrediente: dto.units }),
        ...(dto.price !== undefined && { precio_ingrediente: dto.price }),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    try {
      await this.prisma.ingrediente.delete({ where: { id_ingrediente: id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Este ingrediente esta en uso (recetas o movimientos de inventario) y no se puede eliminar');
      }
      throw error;
    }
  }
}
