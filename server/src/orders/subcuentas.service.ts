import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubcuentaDto } from './dto/create-subcuenta.dto';
import { RepartoDto } from './dto/split-item.dto';

@Injectable()
export class SubcuentasService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPedidoAbierto(idPedido: number) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id_pedido: idPedido } });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    if (pedido.estado_pedido === 'PAGADO' || pedido.estado_pedido === 'CANCELADO') {
      throw new ConflictException(`No se pueden modificar subcuentas: el pedido esta ${pedido.estado_pedido}`);
    }
    return pedido;
  }

  // Una subcuenta con Factura vigente queda congelada (seccion 5): la
  // correccion pasa por anular esa factura, nunca por mover items "por
  // debajo" de una ya emitida. Las ANULADAS no congelan: el flujo de
  // correccion es justamente anular -> reasignar -> refacturar.
  private async assertSubcuentaNoFacturada(idSubcuenta: number) {
    const factura = await this.prisma.factura.findFirst({
      where: { id_subcuenta_factura: idSubcuenta, estado_factura: { not: 'ANULADA' } },
    });
    if (factura) throw new ConflictException('Esta subcuenta ya tiene una factura vigente y no se puede modificar');
  }

  async create(idPedido: number, dto: CreateSubcuentaDto) {
    await this.assertPedidoAbierto(idPedido);
    return this.prisma.subcuenta.create({
      data: {
        id_pedido_subcuenta: idPedido,
        ...(dto.nombre !== undefined && { nombre_subcuenta: dto.nombre }),
      },
    });
  }

  async findAll(idPedido: number) {
    return this.prisma.subcuenta.findMany({ where: { id_pedido_subcuenta: idPedido }, orderBy: { id_subcuenta: 'asc' } });
  }

  private async findItemDelPedido(idPedido: number, idItem: number) {
    const item = await this.prisma.detalleComanda.findUnique({ where: { id_detalleComanda: idItem }, include: { comanda: true } });
    if (!item || item.comanda.id_pedido_comanda !== idPedido) throw new NotFoundException('Item no encontrado en este pedido');
    return item;
  }

  private async findSubcuentaDelPedido(idPedido: number, idSubcuenta: number) {
    const subcuenta = await this.prisma.subcuenta.findUnique({ where: { id_subcuenta: idSubcuenta } });
    if (!subcuenta || subcuenta.id_pedido_subcuenta !== idPedido) {
      throw new UnprocessableEntityException(`La subcuenta ${idSubcuenta} no pertenece a este pedido`);
    }
    return subcuenta;
  }

  // Reasignacion directa (todo el item a una sola subcuenta). Valida en
  // cualquier momento sin importar estado_dc (seccion 5), excepto si origen
  // o destino ya estan facturados.
  async reasignar(idPedido: number, idItem: number, idSubcuentaDestino: number) {
    const item = await this.findItemDelPedido(idPedido, idItem);
    await this.findSubcuentaDelPedido(idPedido, idSubcuentaDestino);

    if (item.id_subcuenta_dc !== null) await this.assertSubcuentaNoFacturada(item.id_subcuenta_dc);
    await this.assertSubcuentaNoFacturada(idSubcuentaDestino);

    return this.prisma.$transaction(async (tx) => {
      // Mover un padre de combo mueve tambien a sus hijos con el (seccion 4).
      await tx.detalleComanda.updateMany({
        where: { id_detalleComandaPadre_dc: idItem },
        data: { id_subcuenta_dc: idSubcuentaDestino },
      });
      return tx.detalleComanda.update({
        where: { id_detalleComanda: idItem },
        data: { id_subcuenta_dc: idSubcuentaDestino },
      });
    });
  }

  // Reparto proporcional para items compartidos (ej. una pizza para 2): usa
  // SubcuentaDetalleComanda en vez de partir el DetalleComanda (seccion 5).
  // Exclusion mutua con id_subcuenta_dc directo: nunca ambos a la vez.
  async repartir(idPedido: number, idItem: number, reparto: RepartoDto[]) {
    const item = await this.findItemDelPedido(idPedido, idItem);

    const suma = reparto.reduce((acc, r) => acc + r.proporcion, 0);
    if (Math.abs(suma - 1) > 0.0001) {
      throw new BadRequestException('Las proporciones del reparto deben sumar exactamente 1.0');
    }

    const idsSubcuentas = reparto.map((r) => r.idSubcuenta);
    if (new Set(idsSubcuentas).size !== idsSubcuentas.length) {
      throw new BadRequestException('No se puede repartir dos veces hacia la misma subcuenta');
    }
    for (const idSubcuenta of idsSubcuentas) {
      await this.findSubcuentaDelPedido(idPedido, idSubcuenta);
      await this.assertSubcuentaNoFacturada(idSubcuenta);
    }
    if (item.id_subcuenta_dc !== null) await this.assertSubcuentaNoFacturada(item.id_subcuenta_dc);

    return this.prisma.$transaction(async (tx) => {
      await tx.detalleComanda.update({ where: { id_detalleComanda: idItem }, data: { id_subcuenta_dc: null } });
      await tx.subcuentaDetalleComanda.deleteMany({ where: { id_detalleComanda_sdc: idItem } });
      await tx.subcuentaDetalleComanda.createMany({
        data: reparto.map((r) => ({
          id_detalleComanda_sdc: idItem,
          id_subcuenta_sdc: r.idSubcuenta,
          proporcion_sdc: r.proporcion,
        })),
      });

      return tx.detalleComanda.findUniqueOrThrow({
        where: { id_detalleComanda: idItem },
        include: { subcuentasReparto: true },
      });
    });
  }
}
