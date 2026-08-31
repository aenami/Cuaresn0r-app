import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAreaDto } from './dto/area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAreaDto) {
    return this.prisma.zona.create({
      data: { nombre_zona: dto.name, identificador_zona: dto.identifier },
    });
  }

  async findAll() {
    return this.prisma.zona.findMany({ orderBy: { id_zona: 'asc' } });
  }

  async findOne(id: number) {
    const zona = await this.prisma.zona.findUnique({ where: { id_zona: id }, include: { mesas: true } });
    if (!zona) throw new NotFoundException('Zona no encontrada');
    return zona;
  }

  async update(id: number, dto: UpdateAreaDto) {
    await this.findOne(id);
    return this.prisma.zona.update({
      where: { id_zona: id },
      data: {
        ...(dto.name !== undefined && { nombre_zona: dto.name }),
        ...(dto.identifier !== undefined && { identificador_zona: dto.identifier }),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    try {
      await this.prisma.zona.delete({ where: { id_zona: id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Esta zona todavia tiene mesas asignadas; reasignalas o eliminalas primero');
      }
      throw error;
    }
  }
}
