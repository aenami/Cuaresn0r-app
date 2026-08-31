import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';

const WITH_COMPONENTES = {
  detallesCombo: { include: { producto: true } },
} as const;

@Injectable()
export class CombosService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertProductsExist(ids: number[]) {
    const unicos = [...new Set(ids)];
    const productos = await this.prisma.producto.findMany({ where: { id_producto: { in: unicos } } });
    if (productos.length !== unicos.length) {
      throw new UnprocessableEntityException('Uno o mas productos del combo no existen');
    }
  }

  async create(dto: CreateComboDto) {
    await this.assertProductsExist(dto.componentes.map((c) => c.idProducto));

    return this.prisma.$transaction(async (tx) => {
      const combo = await tx.combo.create({
        data: { nombre_combo: dto.nombre, precio_combo: dto.precio },
      });

      await tx.detalleCombo.createMany({
        data: dto.componentes.map((c) => ({
          id_combo_detalleCombo: combo.id_combo,
          id_producto_detalleCombo: c.idProducto,
          cantidad_detalleCombo: c.cantidad,
        })),
      });

      return tx.combo.findUniqueOrThrow({ where: { id_combo: combo.id_combo }, include: WITH_COMPONENTES });
    });
  }

  async findAll(activo?: boolean) {
    return this.prisma.combo.findMany({
      where: activo !== undefined ? { combo_activo: activo } : undefined,
      include: WITH_COMPONENTES,
      orderBy: { id_combo: 'asc' },
    });
  }

  async findOne(id: number) {
    const combo = await this.prisma.combo.findUnique({ where: { id_combo: id }, include: WITH_COMPONENTES });
    if (!combo) throw new NotFoundException('Combo no encontrado');
    return combo;
  }

  async update(id: number, dto: UpdateComboDto) {
    await this.findOne(id);
    if (dto.componentes) await this.assertProductsExist(dto.componentes.map((c) => c.idProducto));

    return this.prisma.$transaction(async (tx) => {
      await tx.combo.update({
        where: { id_combo: id },
        data: {
          ...(dto.nombre !== undefined && { nombre_combo: dto.nombre }),
          ...(dto.precio !== undefined && { precio_combo: dto.precio }),
          ...(dto.activo !== undefined && { combo_activo: dto.activo }),
        },
      });

      if (dto.componentes) {
        // Reemplazo completo: los pedidos ya "explotaron" el combo en filas
        // propias de DetalleComanda al venderlo, asi que editar la
        // composicion aqui no corrompe pedidos pasados.
        await tx.detalleCombo.deleteMany({ where: { id_combo_detalleCombo: id } });
        await tx.detalleCombo.createMany({
          data: dto.componentes.map((c) => ({
            id_combo_detalleCombo: id,
            id_producto_detalleCombo: c.idProducto,
            cantidad_detalleCombo: c.cantidad,
          })),
        });
      }

      return tx.combo.findUniqueOrThrow({ where: { id_combo: id }, include: WITH_COMPONENTES });
    });
  }

  // Soft: un combo desactivado ya no se vende, pero el historial de
  // DetalleComanda que lo uso sigue apuntando a el sin problema.
  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.combo.update({ where: { id_combo: id }, data: { combo_activo: false } });
  }

  async enable(id: number) {
    await this.findOne(id);
    return this.prisma.combo.update({ where: { id_combo: id }, data: { combo_activo: true } });
  }
}
