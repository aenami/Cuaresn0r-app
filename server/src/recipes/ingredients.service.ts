import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';

@Injectable()
export class IngredientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIngredientDto) {
    this.validarUmbrales(dto.lowThreshold, dto.highThreshold);
    const ingrediente = await this.prisma.ingrediente.create({
      data: {
        nombre_ingrediente: dto.name,
        stock_ingrediente: dto.stock,
        unidades_ingrediente: dto.units,
        precio_ingrediente: dto.price,
        umbral_bajo_ingrediente: dto.lowThreshold,
        umbral_alto_ingrediente: dto.highThreshold,
      },
    });
    return this.conEstado(ingrediente);
  }

  async findAll() {
    const ingredientes = await this.prisma.ingrediente.findMany({ orderBy: { id_ingrediente: 'asc' } });
    return ingredientes.map((ingrediente) => this.conEstado(ingrediente));
  }

  async findOne(id: number) {
    const ingrediente = await this.prisma.ingrediente.findUnique({ where: { id_ingrediente: id } });
    if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado');
    return this.conEstado(ingrediente);
  }

  // stock_ingrediente no se toca aqui: es cacheado, solo cambia via InventoryService.
  async update(id: number, dto: UpdateIngredientDto) {
    const actual = await this.prisma.ingrediente.findUnique({ where: { id_ingrediente: id } });
    if (!actual) throw new NotFoundException('Ingrediente no encontrado');
    const bajo = dto.lowThreshold === undefined ? actual.umbral_bajo_ingrediente : dto.lowThreshold;
    const alto = dto.highThreshold === undefined ? actual.umbral_alto_ingrediente : dto.highThreshold;
    this.validarUmbrales(bajo === null ? null : Number(bajo), alto === null ? null : Number(alto));

    const ingrediente = await this.prisma.ingrediente.update({
      where: { id_ingrediente: id },
      data: {
        ...(dto.name !== undefined && { nombre_ingrediente: dto.name }),
        ...(dto.units !== undefined && { unidades_ingrediente: dto.units }),
        ...(dto.price !== undefined && { precio_ingrediente: dto.price }),
        ...(dto.lowThreshold !== undefined && { umbral_bajo_ingrediente: dto.lowThreshold }),
        ...(dto.highThreshold !== undefined && { umbral_alto_ingrediente: dto.highThreshold }),
      },
    });
    return this.conEstado(ingrediente);
  }

  private validarUmbrales(bajo?: number | null, alto?: number | null) {
    if (bajo !== null && bajo !== undefined && alto !== null && alto !== undefined && bajo >= alto) {
      throw new BadRequestException('El umbral bajo debe ser menor que el umbral alto');
    }
  }

  private conEstado(ingrediente: {
    stock_ingrediente: Prisma.Decimal;
    umbral_bajo_ingrediente: Prisma.Decimal | null;
    umbral_alto_ingrediente: Prisma.Decimal | null;
    [campo: string]: unknown;
  }) {
    const stock = ingrediente.stock_ingrediente;
    const bajo = ingrediente.umbral_bajo_ingrediente;
    const alto = ingrediente.umbral_alto_ingrediente;
    const estado_stock = stock.lessThanOrEqualTo(0)
      ? 'AGOTADO'
      : bajo !== null && stock.lessThan(bajo)
        ? 'BAJO'
        : alto !== null && stock.greaterThan(alto)
          ? 'ALTO'
          : bajo !== null || alto !== null
            ? 'IDEAL'
            : 'SIN_UMBRALES';
    return { ...ingrediente, estado_stock };
  }

  async remove(id: number) {
    await this.findOne(id);
    try {
      await this.prisma.ingrediente.delete({ where: { id_ingrediente: id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'Este ingrediente esta en uso (recetas, movimientos o planes de produccion) y no se puede eliminar',
        );
      }
      throw error;
    }
  }
}
