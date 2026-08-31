import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCajaDto } from './dto/create-caja.dto';
import { UpdateCajaDto } from './dto/update-caja.dto';

// Sin delete a proposito: una Caja con turnos historicos no puede borrarse
// (FK) y este negocio maneja una sola caja fisica; renombrar es suficiente.
@Injectable()
export class CajasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCajaDto) {
    return this.prisma.caja.create({ data: { nombre_caja: dto.nombre } });
  }

  async findAll() {
    return this.prisma.caja.findMany({
      orderBy: { id_caja: 'asc' },
      include: { turnos: { where: { estado_turno: 'ABIERTO' }, include: { usuario: { select: { id_usuario: true, email_usuario: true } } } } },
    });
  }

  async findOne(id: number) {
    const caja = await this.prisma.caja.findUnique({
      where: { id_caja: id },
      include: { turnos: { where: { estado_turno: 'ABIERTO' } } },
    });
    if (!caja) throw new NotFoundException('Caja no encontrada');
    return caja;
  }

  async update(id: number, dto: UpdateCajaDto) {
    await this.findOne(id);
    return this.prisma.caja.update({
      where: { id_caja: id },
      data: { ...(dto.nombre !== undefined && { nombre_caja: dto.nombre }) },
    });
  }
}
