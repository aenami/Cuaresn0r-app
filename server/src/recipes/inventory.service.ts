import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateMovementDto, TipoMovimientoManual } from './dto/create-movement.dto';

const TIPOS_QUE_RESTAN: TipoMovimientoManual[] = [TipoMovimientoManual.MERMA, TipoMovimientoManual.AJUSTE_NEGATIVO];
const TIPOS_QUE_REQUIEREN_MOTIVO: TipoMovimientoManual[] = [
  TipoMovimientoManual.MERMA,
  TipoMovimientoManual.AJUSTE_POSITIVO,
  TipoMovimientoManual.AJUSTE_NEGATIVO,
];

export interface DeltaIngrediente {
  idIngrediente: number;
  delta: number;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------- Movimientos manuales (ENTRADA/MERMA/AJUSTE_*) -------------
  async registrarMovimientoManual(idIngrediente: number, dto: CreateMovementDto, idUsuario: number) {
    const ingrediente = await this.prisma.ingrediente.findUnique({ where: { id_ingrediente: idIngrediente } });
    if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado');

    if (TIPOS_QUE_REQUIEREN_MOTIVO.includes(dto.tipo) && !dto.motivo) {
      throw new BadRequestException(`El movimiento ${dto.tipo} requiere indicar un motivo`);
    }

    const resta = TIPOS_QUE_RESTAN.includes(dto.tipo);
    if (resta && ingrediente.stock_ingrediente.lessThan(dto.cantidad)) {
      throw new ConflictException('Ese movimiento dejaria el stock del ingrediente en negativo');
    }

    return this.prisma.$transaction(async (tx) => {
      const movimiento = await tx.movimientoInventario.create({
        data: {
          id_ingrediente_movimiento: idIngrediente,
          id_usuario_movimiento: idUsuario,
          tipo_movimiento: dto.tipo,
          cantidad_movimiento: dto.cantidad,
          ...(dto.motivo !== undefined && { motivo_movimiento: dto.motivo }),
        },
      });

      await tx.ingrediente.update({
        where: { id_ingrediente: idIngrediente },
        data: { stock_ingrediente: resta ? { decrement: dto.cantidad } : { increment: dto.cantidad } },
      });

      return movimiento;
    });
  }

  async findMovimientos(idIngrediente: number) {
    return this.prisma.movimientoInventario.findMany({
      where: { id_ingrediente_movimiento: idIngrediente },
      orderBy: { id_movimiento: 'desc' },
    });
  }

  // ------------- Helpers usados por el modulo Orders -------------
  // Se les pasa el `tx` de la transaccion de Orders para que crear el
  // DetalleComanda y descontar inventario sea una sola operacion atomica.

  // Al enviar una comanda a cocina (PREPARANDO): registra SALIDA_RECETA por
  // cada ingrediente de la receta y descuenta el stock cacheado.
  async descontarPorReceta(
    tx: Prisma.TransactionClient,
    params: {
      idReceta: number;
      cantidadProducto: number;
      idDetalleComanda: number;
      deltasPersonalizados?: DeltaIngrediente[];
    },
  ) {
    const detalles = await tx.detalleReceta.findMany({ where: { id_receta_detalleReceta: params.idReceta } });

    // Suma todos los deltas del mismo ingrediente antes de aplicarlos (evita
    // que dos personalizaciones del mismo ingrediente se pisen entre si).
    const deltasPorIngrediente = new Map<number, number>();
    for (const d of params.deltasPersonalizados ?? []) {
      deltasPorIngrediente.set(d.idIngrediente, (deltasPorIngrediente.get(d.idIngrediente) ?? 0) + d.delta);
    }

    for (const detalle of detalles) {
      const base = Number(detalle.cantidad_ingrediente_detalleReceta) * params.cantidadProducto;
      const delta = deltasPorIngrediente.get(detalle.id_ingrediente_detalleReceta) ?? 0;
      const cantidad = Math.max(0, base + delta);
      if (cantidad === 0) continue;

      await tx.movimientoInventario.create({
        data: {
          id_ingrediente_movimiento: detalle.id_ingrediente_detalleReceta,
          id_detalleComanda_movimiento: params.idDetalleComanda,
          tipo_movimiento: 'SALIDA_RECETA',
          cantidad_movimiento: cantidad,
        },
      });

      await tx.ingrediente.update({
        where: { id_ingrediente: detalle.id_ingrediente_detalleReceta },
        data: { stock_ingrediente: { decrement: cantidad } },
      });
    }
  }

  // Al cancelar un DetalleComanda que ya desconto inventario: inserta un
  // REVERSO por cada SALIDA_RECETA que no tenga ya uno asociado, copiando la
  // misma cantidad original (nunca recalculada desde la receta actual).
  async revertirPorDetalleComanda(tx: Prisma.TransactionClient, idDetalleComanda: number) {
    const movimientos = await tx.movimientoInventario.findMany({
      where: { id_detalleComanda_movimiento: idDetalleComanda, tipo_movimiento: 'SALIDA_RECETA' },
      include: { reversos: true },
    });

    for (const movimiento of movimientos) {
      if (movimiento.reversos.length > 0) continue; // ya revertido: evita doble reverso

      await tx.movimientoInventario.create({
        data: {
          id_ingrediente_movimiento: movimiento.id_ingrediente_movimiento,
          id_detalleComanda_movimiento: movimiento.id_detalleComanda_movimiento,
          id_movimiento_revertido: movimiento.id_movimiento,
          tipo_movimiento: 'REVERSO',
          cantidad_movimiento: movimiento.cantidad_movimiento,
        },
      });

      await tx.ingrediente.update({
        where: { id_ingrediente: movimiento.id_ingrediente_movimiento },
        data: { stock_ingrediente: { increment: movimiento.cantidad_movimiento } },
      });
    }
  }
}
