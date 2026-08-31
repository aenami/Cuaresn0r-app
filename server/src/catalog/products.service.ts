import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCategoryExists(idCategoria: number) {
    const categoria = await this.prisma.categoria.findUnique({ where: { id_categoria: idCategoria } });
    if (!categoria) throw new UnprocessableEntityException('La categoria indicada no existe');
  }

  async create(dto: CreateProductDto) {
    if (dto.category !== undefined) await this.assertCategoryExists(dto.category);

    return this.prisma.producto.create({
      data: {
        nombre_producto: dto.name,
        precio_producto: dto.price,
        ...(dto.description !== undefined && { descripcion_producto: dto.description }),
        ...(dto.category !== undefined && { categoria_producto: dto.category }),
        ...(dto.image !== undefined && { imagen_producto: dto.image }),
      },
    });
  }

  async findAll(habilitado?: boolean) {
    return this.prisma.producto.findMany({
      where: habilitado !== undefined ? { habilitado_producto: habilitado } : undefined,
      include: { categoria: true },
      orderBy: { id_producto: 'asc' },
    });
  }

  async findOne(id: number) {
    const producto = await this.prisma.producto.findUnique({
      where: { id_producto: id },
      include: { categoria: true },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  async update(id: number, dto: UpdateProductDto) {
    await this.findOne(id);
    if (dto.category !== undefined) await this.assertCategoryExists(dto.category);

    return this.prisma.producto.update({
      where: { id_producto: id },
      data: {
        ...(dto.name !== undefined && { nombre_producto: dto.name }),
        ...(dto.price !== undefined && { precio_producto: dto.price }),
        ...(dto.description !== undefined && { descripcion_producto: dto.description }),
        ...(dto.category !== undefined && { categoria_producto: dto.category }),
        ...(dto.image !== undefined && { imagen_producto: dto.image }),
      },
    });
  }

  // "Eliminar" un producto = quitarlo del menu (soft), nunca borrado fisico:
  // preserva la trazabilidad de Recetas/Combos/DetalleComanda que ya lo referencian.
  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.producto.update({
      where: { id_producto: id },
      data: { habilitado_producto: false },
    });
  }

  async enable(id: number) {
    await this.findOne(id);
    return this.prisma.producto.update({
      where: { id_producto: id },
      data: { habilitado_producto: true },
    });
  }
}
