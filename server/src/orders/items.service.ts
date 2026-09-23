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

      await tx.detalleComanda.updateMany({ where: { id_detalleComanda: idItem, estado_dc: 'PREPARANDO' }, data: { estado_dc: 'ENTREGADO', fecha_entrega_dc: new Date() } });
      await this.pedidosService.recalcularEstadoPedido(tx, idPedido);

      return tx.detalleComanda.findUniqueOrThrow({ where: { id_detalleComanda: idItem }, include: ITEM_INCLUDE });
    });
  }

  async actualizarIndicaciones(idPedido: number, idItem: number, indicaciones?: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await this.assertItemPerteneceAlPedido(tx, idPedido, idItem);
      if (item.estado_dc !== 'PENDIENTE') {
        throw new ConflictException('Las indicaciones solo se pueden cambiar antes de enviar el producto');
      }
      return tx.detalleComanda.update({
        where: { id_detalleComanda: idItem },
        data: { indicaciones_dc: indicaciones?.trim() || null },
        include: ITEM_INCLUDE,
      });
    });
  }

  // Cancelar solo esta permitido mientras el item sigue PREPARANDO (seccion 1).
  // Si es el header de un combo, cancela en cascada sus hijos activos, cada
  // uno con su propio reverso de inventario (seccion 8).
  async cancelar(idPedido: number, idItem: number) {
    return this.prisma.$transaction(async (tx) => {
      const item = await this.assertItemPerteneceAlPedido(tx, idPedido, idItem);
      if (item.estado_dc !== 'PENDIENTE' && item.estado_dc !== 'PREPARANDO') {
        throw new ConflictException(
          `No se puede cancelar: el item esta ${item.estado_dc}`,
        );
      }

      const idsFamilia = [idItem];
      const hijos = await tx.detalleComanda.findMany({
        where: { id_detalleComandaPadre_dc: idItem, estado_dc: { in: ['PENDIENTE', 'PREPARANDO'] } },
      });
      idsFamilia.push(...hijos.map((hijo) => hijo.id_detalleComanda));

      const facturado = await tx.facturaDetalle.findFirst({
        where: {
          id_detalleComanda_fd: { in: idsFamilia },
          factura: { estado_factura: { not: 'ANULADA' } },
        },
      });
      if (facturado) {
        throw new ConflictException('El producto ya esta facturado; anula la factura antes de cancelarlo');
      }

      for (const hijo of hijos) {
        await tx.detalleComanda.update({ where: { id_detalleComanda: hijo.id_detalleComanda }, data: { estado_dc: 'CANCELADO' } });
        if (hijo.estado_dc === 'PREPARANDO') {
          await this.inventoryService.revertirPorDetalleComanda(tx, hijo.id_detalleComanda);
        }
      }

      await tx.detalleComanda.update({ where: { id_detalleComanda: idItem }, data: { estado_dc: 'CANCELADO' } });
      if (item.estado_dc === 'PREPARANDO') await this.inventoryService.revertirPorDetalleComanda(tx, idItem);

      await this.pedidosService.recalcularEstadoPedido(tx, idPedido);

      return tx.detalleComanda.findUniqueOrThrow({ where: { id_detalleComanda: idItem }, include: ITEM_INCLUDE });
    });
  }
}
