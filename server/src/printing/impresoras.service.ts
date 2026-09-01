import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateImpresoraDto } from './dto/create-impresora.dto';
import { UpdateImpresoraDto } from './dto/update-impresora.dto';

@Injectable()
export class ImpresorasService {
  constructor(private readonly prisma: PrismaService) {}

  // A lo sumo una impresora activa por destino (indice parcial en la
  // migracion): activar una desactiva la anterior del mismo destino.
  async create(dto: CreateImpresoraDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.impresora.updateMany({
        where: { destino_impresora: dto.destino, impresora_activa: true },
        data: { impresora_activa: false },
      });
      return tx.impresora.create({
        data: {
          nombre_impresora: dto.nombre,
          destino_impresora: dto.destino,
          dispositivo_impresora: dto.dispositivo,
          ...(dto.host !== undefined && { host_impresora: dto.host }),
          ...(dto.puerto !== undefined && { puerto_impresora: dto.puerto }),
          ...(dto.anchoPapel !== undefined && { ancho_papel_impresora: dto.anchoPapel }),
        },
      });
    });
  }

  findAll() {
    return this.prisma.impresora.findMany({ orderBy: { id_impresora: 'asc' } });
  }

  async findOne(id: number) {
    const impresora = await this.prisma.impresora.findUnique({ where: { id_impresora: id } });
    if (!impresora) throw new NotFoundException('Impresora no encontrada');
    return impresora;
  }

  async update(id: number, dto: UpdateImpresoraDto) {
    const actual = await this.findOne(id);
    const destino = dto.destino ?? actual.destino_impresora;

    return this.prisma.$transaction(async (tx) => {
      // Si va a quedar activa, es LA activa de su destino.
      if (dto.activa !== false) {
        await tx.impresora.updateMany({
          where: { destino_impresora: destino, impresora_activa: true, id_impresora: { not: id } },
          data: { impresora_activa: false },
        });
      }
      return tx.impresora.update({
        where: { id_impresora: id },
        data: {
          ...(dto.nombre !== undefined && { nombre_impresora: dto.nombre }),
          ...(dto.destino !== undefined && { destino_impresora: dto.destino }),
          ...(dto.dispositivo !== undefined && { dispositivo_impresora: dto.dispositivo }),
          ...(dto.host !== undefined && { host_impresora: dto.host }),
          ...(dto.puerto !== undefined && { puerto_impresora: dto.puerto }),
          ...(dto.anchoPapel !== undefined && { ancho_papel_impresora: dto.anchoPapel }),
          ...(dto.activa !== undefined && { impresora_activa: dto.activa }),
        },
      });
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    try {
      return await this.prisma.impresora.delete({ where: { id_impresora: id } });
    } catch {
      throw new ConflictException('No se pudo eliminar la impresora');
    }
  }
}
