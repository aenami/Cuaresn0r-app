import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/mesa.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { EstadoMesa } from '../generated/prisma/client';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertZoneExists(idZona: number) {
    const zona = await this.prisma.zona.findUnique({ where: { id_zona: idZona } });
    if (!zona) throw new UnprocessableEntityException('La zona indicada no existe');
  }

  async create(dto: CreateTableDto) {
    await this.assertZoneExists(dto.id_zona);
    return this.prisma.mesa.create({
      data: {
        numero_mesa: dto.numero_mesa,
        ...(dto.capacidad !== undefined && { capacidad_mesa: dto.capacidad }),
        id_zona_mesa: dto.id_zona,
        estado_mesa: 'LIBRE',
      },
    });
  }

  async findAll(idZona?: number, estado?: EstadoMesa) {
    return this.prisma.mesa.findMany({
      where: {
        ...(idZona !== undefined && { id_zona_mesa: idZona }),
        ...(estado !== undefined && { estado_mesa: estado }),
      },
      include: { zona: true },
      orderBy: { id_mesa: 'asc' },
    });
  }

  async findOne(id: number) {
    const mesa = await this.prisma.mesa.findUnique({ where: { id_mesa: id }, include: { zona: true } });
    if (!mesa) throw new NotFoundException('Mesa no encontrada');
    return mesa;
  }

  async update(id: number, dto: UpdateTableDto) {
    await this.findOne(id);
    if (dto.id_zona !== undefined) await this.assertZoneExists(dto.id_zona);

    return this.prisma.mesa.update({
      where: { id_mesa: id },
      data: {
        ...(dto.numero_mesa !== undefined && { numero_mesa: dto.numero_mesa }),
        ...(dto.capacidad !== undefined && { capacidad_mesa: dto.capacidad }),
        ...(dto.id_zona !== undefined && { id_zona_mesa: dto.id_zona }),
      },
    });
  }

  async reserve(id: number) {
    const mesa = await this.findOne(id);
    if (mesa.estado_mesa !== 'LIBRE') {
      throw new ConflictException(`No se puede reservar: la mesa esta ${mesa.estado_mesa}`);
    }
    return this.prisma.mesa.update({ where: { id_mesa: id }, data: { estado_mesa: 'RESERVADA' } });
  }

  async release(id: number) {
    const mesa = await this.findOne(id);
    if (mesa.estado_mesa === 'OCUPADA') {
      throw new ConflictException('No se puede liberar una mesa ocupada manualmente: debe completarse o cancelarse el pedido');
    }
    if (mesa.estado_mesa !== 'RESERVADA') {
      throw new ConflictException(`No hay nada que liberar: la mesa esta ${mesa.estado_mesa}`);
    }
    return this.prisma.mesa.update({ where: { id_mesa: id }, data: { estado_mesa: 'LIBRE' } });
  }

  // "Eliminar" una mesa = sacarla de servicio (soft), nunca borrado fisico:
  // preserva la trazabilidad de Pedido.mesa_pedido historico.
  async deactivate(id: number) {
    const mesa = await this.findOne(id);
    if (mesa.estado_mesa === 'OCUPADA') {
      throw new ConflictException('No se puede desactivar una mesa ocupada: debe completarse o cancelarse el pedido primero');
    }
    return this.prisma.mesa.update({ where: { id_mesa: id }, data: { estado_mesa: 'DESACTIVADA' } });
  }

  async activate(id: number) {
    const mesa = await this.findOne(id);
    if (mesa.estado_mesa !== 'DESACTIVADA') {
      throw new ConflictException(`La mesa ya esta en servicio (${mesa.estado_mesa})`);
    }
    return this.prisma.mesa.update({ where: { id_mesa: id }, data: { estado_mesa: 'LIBRE' } });
  }
}
