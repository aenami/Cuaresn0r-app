import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { exigirDisponible } from '../bakery/stock-compartido';
import { RemisionesService } from '../bakery/remisiones.service';

@Injectable()
export class StockCompartidoService {
  constructor(private readonly prisma: PrismaService) {}
  async reservar(
    tx: Prisma.TransactionClient,
    detalleId: number,
    articuloId: number,
    cantidad: number,
    precioInterno: Prisma.Decimal,
  ) {
    await tx.$queryRaw`SELECT id FROM "ArticuloPanaderia" WHERE id = ${articuloId} FOR UPDATE`;
    const articulo = await tx.articuloPanaderia.findUniqueOrThrow({
      where: { id: articuloId },
    });
    if (!articulo.activo || articulo.tipo === 'INSUMO')
      throw new ConflictException('El producto compartido no está disponible');
    await exigirDisponible(tx, articuloId, articulo.existencia, cantidad);
    await tx.reservaPanaderia.create({
      data: { detalleId, articuloId, cantidad, precioInterno },
    });
  }
  async liberar(tx: Prisma.TransactionClient, detalleId: number) {
    const reserva = await tx.reservaPanaderia.findUnique({
      where: { detalleId },
    });
    if (!reserva || reserva.estado !== 'RESERVADA') return;
    await tx.$queryRaw`SELECT id FROM "ArticuloPanaderia" WHERE id = ${reserva.articuloId} FOR UPDATE`;
    await tx.reservaPanaderia.updateMany({
      where: { detalleId, estado: 'RESERVADA' },
      data: { estado: 'LIBERADA' },
    });
  }
  async entregar(
    tx: Prisma.TransactionClient,
    detalleId: number,
    usuarioId: number,
  ) {
    const reserva = await tx.reservaPanaderia.findUnique({
      where: { detalleId },
    });
    if (!reserva || reserva.estado === 'CONSUMIDA') return;
    if (reserva.estado !== 'RESERVADA')
      throw new ConflictException('Esta reserva fue cancelada');
    await new RemisionesService(this.prisma).entregarCompartido(
      tx,
      reserva,
      usuarioId,
    );
    await tx.reservaPanaderia.update({
      where: { id: reserva.id },
      data: { estado: 'CONSUMIDA' },
    });
  }
}
