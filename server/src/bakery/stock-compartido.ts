import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

// Toda salida bloquea primero el artículo; reservas y ventas usan el mismo lock.
export async function disponiblePanaderia(
  tx: Prisma.TransactionClient,
  articuloId: number,
  existencia: Prisma.Decimal,
) {
  const reservas = await tx.reservaPanaderia.aggregate({
    where: { articuloId, estado: 'RESERVADA' },
    _sum: { cantidad: true },
  });
  return existencia.minus(reservas._sum.cantidad ?? 0);
}
export async function exigirDisponible(
  tx: Prisma.TransactionClient,
  articuloId: number,
  existencia: Prisma.Decimal,
  cantidad: number | Prisma.Decimal,
) {
  if (
    (await disponiblePanaderia(tx, articuloId, existencia)).lessThan(cantidad)
  )
    throw new ConflictException(
      'Existencia disponible insuficiente; hay productos reservados para pedidos del restaurante',
    );
}
