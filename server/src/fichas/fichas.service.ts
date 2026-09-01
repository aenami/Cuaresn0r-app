import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarFichaDto } from './dto/actualizar-ficha.dto';

@Injectable()
export class FichasService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizar(numero: string) {
    return numero.trim().toUpperCase();
  }

  async crear(numero: string) {
    try {
      return await this.prisma.ficha.create({ data: { numero_ficha: this.normalizar(numero) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una ficha con esa numeracion');
      }
      throw error;
    }
  }

  async listar() {
    const fichas = await this.prisma.ficha.findMany({
      include: {
        pedidos: {
          where: { estado_pedido: { notIn: ['CERRADO', 'CANCELADO'] } },
          select: { id_pedido: true, estado_pedido: true },
          take: 1,
        },
      },
      orderBy: { numero_ficha: 'asc' },
    });

    return fichas.map(({ pedidos, ...ficha }) => ({
      ...ficha,
      disponible: ficha.ficha_activa && pedidos.length === 0,
      pedidoActivo: pedidos[0] ?? null,
    }));
  }

  async actualizar(idFicha: number, dto: ActualizarFichaDto) {
    return this.prisma.$transaction(async (tx) => {
      const ficha = await tx.ficha.findUnique({ where: { id_ficha: idFicha } });
      if (!ficha) throw new NotFoundException('Ficha no encontrada');

      if (dto.activa === false) {
        const ocupante = await tx.pedido.findFirst({
          where: { id_ficha_pedido: idFicha, estado_pedido: { notIn: ['CERRADO', 'CANCELADO'] } },
          select: { id_pedido: true },
        });
        if (ocupante) throw new ConflictException(`No se puede desactivar: la usa el pedido #${ocupante.id_pedido}`);
      }

      try {
        return await tx.ficha.update({
          where: { id_ficha: idFicha },
          data: {
            ...(dto.numero !== undefined && { numero_ficha: this.normalizar(dto.numero) }),
            ...(dto.activa !== undefined && { ficha_activa: dto.activa }),
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Ya existe una ficha con esa numeracion');
        }
        throw error;
      }
    });
  }
}
