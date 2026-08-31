import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../recipes/inventory.service';
import { PedidosService } from './pedidos.service';
import { Prisma } from '../generated/prisma/client';
import { ITEM_INCLUDE } from './orders.includes';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidosService: PedidosService,
    private readonly inventoryService: InventoryService,
  ) {}

  private async assertItemPerteneceAlPedido(tx: Prisma.TransactionClient, idPedido: number, idItem: number) {
    const item = await tx.detalleComanda.findUnique({ where: { id_detalleComanda: idItem }, include: { comanda: true } });
    if (!item || item.comanda.id_pedido_comanda !== idPedido) throw new NotFoundException('Item no encontrado en este pedido');
    return item;
  }

  async entregar(idPedido: number, idItem: number) {
    return this.prisma.$transaction(async (tx) => {
      const item = await this.assertItemPerteneceAlPedido(tx, idPedido, idItem);
      if (item.estado_dc !== 'PREPARANDO') {
        throw new ConflictException(`No se puede marcar entregado: el item esta ${item.estado_dc}`);
      }

      await tx.detalleComanda.update({ where: { id_detalleComanda: idItem }, data: { estado_dc: 'ENTREGADO' } });
      await this.pedidosService.recalcularEstadoPedido(tx, idPedido);

      return tx.detalleComanda.findUniqueOrThrow({ where: { id_detalleComanda: idItem }, include: ITEM_INCLUDE });
    });
  }

  // Cancelar solo esta permitido mientras el item sigue PREPARANDO (seccion 1).
  // Si es el header de un combo, cancela en cascada sus hijos activos, cada
  // uno con su propio reverso de inventario (seccion 8).
  async cancelar(idPedido: number, idItem: number) {
    return this.prisma.$transaction(async (tx) => {
      const item = await this.assertItemPerteneceAlPedido(tx, idPedido, idItem);
      if (item.estado_dc !== 'PREPARANDO') {
        throw new ConflictException(
          `No se puede cancelar: el item esta ${item.estado_dc} (solo se puede cancelar mientras esta PREPARANDO)`,
        );
      }

      const hijos = await tx.detalleComanda.findMany({
        where: { id_detalleComandaPadre_dc: idItem, estado_dc: 'PREPARANDO' },
      });
      for (const hijo of hijos) {
        await tx.detalleComanda.update({ where: { id_detalleComanda: hijo.id_detalleComanda }, data: { estado_dc: 'CANCELADO' } });
        await this.inventoryService.revertirPorDetalleComanda(tx, hijo.id_detalleComanda);
      }

      await tx.detalleComanda.update({ where: { id_detalleComanda: idItem }, data: { estado_dc: 'CANCELADO' } });
      await this.inventoryService.revertirPorDetalleComanda(tx, idItem);

      await this.pedidosService.recalcularEstadoPedido(tx, idPedido);

      return tx.detalleComanda.findUniqueOrThrow({ where: { id_detalleComanda: idItem }, include: ITEM_INCLUDE });
    });
  }
}
