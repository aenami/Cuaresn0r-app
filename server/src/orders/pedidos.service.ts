import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoPedido,
  ModalidadCuentaPedido,
  Prisma,
  TipoPedido,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../recipes/inventory.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { recalcularEstadoPedido } from './estado-pedido';
import { PEDIDO_INCLUDE } from './orders.includes';

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(idMesero: number, dto: CreatePedidoDto) {
    const tipo = dto.tipo ?? TipoPedido.LOCAL;
    const modalidad =
      tipo === TipoPedido.DOMICILIO
        ? ModalidadCuentaPedido.UNICA
        : (dto.modalidadCuenta ?? ModalidadCuentaPedido.UNICA);
    const nombresCuentas =
      modalidad === ModalidadCuentaPedido.POR_CUENTA
        ? (dto.nombresCuentas ?? []).map((nombre) => nombre.trim())
        : ['Cuenta principal'];

    if (
      nombresCuentas.length === 0 ||
      nombresCuentas.some((nombre) => nombre.length === 0)
    ) {
      throw new ConflictException(
        'Agrega al menos una cuenta con nombre para organizar el pedido',
      );
    }
    const nombresNormalizados = nombresCuentas.map((nombre) =>
      nombre.toLocaleLowerCase('es-CO'),
    );
    if (new Set(nombresNormalizados).size !== nombresNormalizados.length) {
      throw new ConflictException(
        'Los nombres de las cuentas del pedido no pueden repetirse',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.create({
        data: {
          tipo_pedido: tipo,
          modalidad_cuenta_pedido: modalidad,
          mesero_pedido: idMesero,
          ...(tipo === TipoPedido.DOMICILIO && {
            nombre_cliente_pedido: dto.nombreCliente,
            telefono_cliente_pedido: dto.telefonoCliente,
            direccion_cliente_pedido: dto.direccionCliente,
          }),
        },
      });

      await tx.subcuenta.createMany({
        data: nombresCuentas.map((nombre) => ({
          id_pedido_subcuenta: pedido.id_pedido,
          nombre_subcuenta: nombre,
        })),
      });

      return tx.pedido.findUniqueOrThrow({
        where: { id_pedido: pedido.id_pedido },
        include: PEDIDO_INCLUDE,
      });
    });
  }

  async findAll(estado?: EstadoPedido, idFicha?: number, tipo?: TipoPedido) {
    return this.prisma.pedido.findMany({
      where: {
        ...(estado !== undefined && { estado_pedido: estado }),
        ...(idFicha !== undefined && { id_ficha_pedido: idFicha }),
        ...(tipo !== undefined && { tipo_pedido: tipo }),
      },
      include: PEDIDO_INCLUDE,
      orderBy: { id_pedido: 'desc' },
    });
  }

  async findOne(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id_pedido: id },
      include: PEDIDO_INCLUDE,
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return pedido;
  }

  async asignarFicha(idPedido: number, idFicha: number) {
    return this.prisma.$transaction(async (tx) => {
      const pedidos = await tx.$queryRaw<Array<{ id_pedido: number }>>`
        SELECT id_pedido FROM "Pedido" WHERE id_pedido = ${idPedido} FOR UPDATE
      `;
      if (!pedidos[0]) throw new NotFoundException('Pedido no encontrado');

      const fichas = await tx.$queryRaw<
        Array<{ id_ficha: number; ficha_activa: boolean }>
      >`
        SELECT id_ficha, ficha_activa FROM "Ficha" WHERE id_ficha = ${idFicha} FOR UPDATE
      `;
      const ficha = fichas[0];
      if (!ficha) throw new NotFoundException('Ficha no encontrada');
      if (!ficha.ficha_activa)
        throw new ConflictException('La ficha esta desactivada');

      const pedido = await tx.pedido.findUniqueOrThrow({
        where: { id_pedido: idPedido },
      });
      if (pedido.tipo_pedido !== 'LOCAL')
        throw new ConflictException('Los domicilios no usan ficha');
      if (
        pedido.estado_pedido === 'CERRADO' ||
        pedido.estado_pedido === 'CANCELADO'
      ) {
        throw new ConflictException(
          `No se puede asignar una ficha a un pedido ${pedido.estado_pedido.toLowerCase()}`,
        );
      }

      const ocupante = await tx.pedido.findFirst({
        where: {
          id_ficha_pedido: idFicha,
          id_pedido: { not: idPedido },
          estado_pedido: { notIn: ['CERRADO', 'CANCELADO'] },
        },
        select: { id_pedido: true },
      });
      if (ocupante)
        throw new ConflictException(
          `La ficha esta ocupada por el pedido #${ocupante.id_pedido}`,
        );

      await tx.pedido.update({
        where: { id_pedido: idPedido },
        data: { id_ficha_pedido: idFicha },
      });
      return tx.pedido.findUniqueOrThrow({
        where: { id_pedido: idPedido },
        include: PEDIDO_INCLUDE,
      });
    });
  }

  recalcularEstadoPedido(tx: Prisma.TransactionClient, idPedido: number) {
    return recalcularEstadoPedido(tx, idPedido);
  }

  async cancel(idPedido: number) {
    return this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id_pedido: idPedido },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (pedido.estado_pedido === 'CERRADO')
        throw new ConflictException('No se puede cancelar un pedido cerrado');
      if (pedido.estado_pedido === 'CANCELADO')
        throw new ConflictException('Este pedido ya esta cancelado');

      const facturaVigente = await tx.factura.findFirst({
        where: {
          subcuenta: { id_pedido_subcuenta: idPedido },
          estado_factura: { not: 'ANULADA' },
        },
      });
      if (facturaVigente) {
        throw new ConflictException(
          'Este pedido tiene facturas vigentes; anulalas antes de cancelarlo',
        );
      }

      const hayEntregados = await tx.detalleComanda.findFirst({
        where: {
          comanda: { id_pedido_comanda: idPedido },
          estado_dc: 'ENTREGADO',
        },
      });
      if (hayEntregados)
        throw new ConflictException(
          'Ya se entregaron productos de este pedido; no se puede cancelar completo',
        );

      const detalles = await tx.detalleComanda.findMany({
        where: {
          comanda: { id_pedido_comanda: idPedido },
          estado_dc: { in: ['PENDIENTE', 'PREPARANDO'] },
        },
      });
      for (const detalle of detalles) {
        await tx.detalleComanda.update({
          where: { id_detalleComanda: detalle.id_detalleComanda },
          data: { estado_dc: 'CANCELADO' },
        });
        if (detalle.estado_dc === 'PREPARANDO') {
          await this.inventoryService.revertirPorDetalleComanda(
            tx,
            detalle.id_detalleComanda,
          );
        }
      }

      await tx.pedido.update({
        where: { id_pedido: idPedido },
        data: { estado_pedido: 'CANCELADO', fecha_cierre_pedido: new Date() },
      });

      return tx.pedido.findUniqueOrThrow({
        where: { id_pedido: idPedido },
        include: PEDIDO_INCLUDE,
      });
    });
  }
}
