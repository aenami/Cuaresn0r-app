import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../recipes/inventory.service';
import { Prisma, EstadoPedido, TipoPedido } from '../generated/prisma/client';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PEDIDO_INCLUDE } from './orders.includes';

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(idMesero: number, dto: CreatePedidoDto) {
    const esDomicilio = (dto.tipo ?? TipoPedido.MESA) === TipoPedido.DOMICILIO;
    return this.prisma.$transaction((tx) =>
      esDomicilio ? this.abrirDomicilio(tx, idMesero, dto) : this.abrirEnMesa(tx, idMesero, dto.idMesa!),
    );
  }

  // Pedido de salon: bloquea la mesa, exige que este LIBRE y la marca OCUPADA.
  private async abrirEnMesa(tx: Prisma.TransactionClient, idMesero: number, idMesa: number) {
    // Bloqueo de fila: evita que dos meseros tomen la misma mesa LIBRE a la
    // vez (ver seccion 16 de consideraciones - concurrencia).
    const filas = await tx.$queryRaw<{ id_mesa: number; estado_mesa: string }[]>`
      SELECT id_mesa, estado_mesa FROM "Mesa" WHERE id_mesa = ${idMesa} FOR UPDATE
    `;
    const mesa = filas[0];
    if (!mesa) throw new NotFoundException('Mesa no encontrada');
    if (mesa.estado_mesa !== 'LIBRE') {
      throw new ConflictException(`No se puede abrir un pedido: la mesa esta ${mesa.estado_mesa}`);
    }

    const pedido = await tx.pedido.create({
      data: { mesa_pedido: idMesa, mesero_pedido: idMesero },
    });
    await this.crearSubcuentaPorDefecto(tx, pedido.id_pedido);
    await tx.mesa.update({ where: { id_mesa: idMesa }, data: { estado_mesa: 'OCUPADA' } });

    return tx.pedido.findUniqueOrThrow({ where: { id_pedido: pedido.id_pedido }, include: PEDIDO_INCLUDE });
  }

  // Domicilio: no toca ninguna mesa (no hay bloqueo ni cambio de estado de mesa),
  // guarda los datos de entrega del cliente.
  private async abrirDomicilio(tx: Prisma.TransactionClient, idMesero: number, dto: CreatePedidoDto) {
    const pedido = await tx.pedido.create({
      data: {
        tipo_pedido: TipoPedido.DOMICILIO,
        mesero_pedido: idMesero,
        nombre_cliente_pedido: dto.nombreCliente,
        telefono_cliente_pedido: dto.telefonoCliente,
        direccion_cliente_pedido: dto.direccionCliente,
      },
    });
    await this.crearSubcuentaPorDefecto(tx, pedido.id_pedido);

    return tx.pedido.findUniqueOrThrow({ where: { id_pedido: pedido.id_pedido }, include: PEDIDO_INCLUDE });
  }

  // Toda Pedido crea automaticamente una Subcuenta por defecto, para no manejar
  // dos caminos de codigo distintos (pedido dividido o no).
  private crearSubcuentaPorDefecto(tx: Prisma.TransactionClient, idPedido: number) {
    return tx.subcuenta.create({
      data: { id_pedido_subcuenta: idPedido, nombre_subcuenta: 'Cuenta principal' },
    });
  }

  async findAll(estado?: EstadoPedido, idMesa?: number, tipo?: TipoPedido) {
    return this.prisma.pedido.findMany({
      where: {
        ...(estado !== undefined && { estado_pedido: estado }),
        ...(idMesa !== undefined && { mesa_pedido: idMesa }),
        ...(tipo !== undefined && { tipo_pedido: tipo }),
      },
      include: PEDIDO_INCLUDE,
      orderBy: { id_pedido: 'desc' },
    });
  }

  async findOne(id: number) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id_pedido: id }, include: PEDIDO_INCLUDE });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return pedido;
  }

  // Recalcula el estado agregado del pedido a partir de sus items no
  // cancelados. Se llama tras crear/entregar/cancelar items o comandas.
  // Nunca toca un pedido ya PAGADO/CANCELADO (estados finales).
  async recalcularEstadoPedido(tx: Prisma.TransactionClient, idPedido: number) {
    const pedido = await tx.pedido.findUniqueOrThrow({ where: { id_pedido: idPedido } });
    if (pedido.estado_pedido === 'PAGADO' || pedido.estado_pedido === 'CANCELADO') return;

    const total = await tx.detalleComanda.count({
      where: { comanda: { id_pedido_comanda: idPedido }, estado_dc: { not: 'CANCELADO' } },
    });
    const pendientes = await tx.detalleComanda.count({
      where: { comanda: { id_pedido_comanda: idPedido }, estado_dc: 'PREPARANDO' },
    });

    const nuevoEstado: EstadoPedido = total > 0 && pendientes === 0 ? 'ENTREGADO' : 'EN_PREPARACION';
    if (nuevoEstado !== pedido.estado_pedido) {
      await tx.pedido.update({ where: { id_pedido: idPedido }, data: { estado_pedido: nuevoEstado } });
    }
  }

  // Solo cancela pedidos donde nada se entrego todavia: el estado de
  // DetalleComanda no permite cancelar algo ya ENTREGADO (ver seccion 1).
  async cancel(idPedido: number) {
    return this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({ where: { id_pedido: idPedido } });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (pedido.estado_pedido === 'PAGADO') throw new ConflictException('No se puede cancelar un pedido ya pagado');
      if (pedido.estado_pedido === 'CANCELADO') throw new ConflictException('Este pedido ya esta cancelado');

      // Con una factura vigente de por medio, primero se anula la factura
      // (ADMIN) y despues se decide sobre el pedido; nunca al reves.
      const facturaVigente = await tx.factura.findFirst({
        where: {
          subcuenta: { id_pedido_subcuenta: idPedido },
          estado_factura: { not: 'ANULADA' },
        },
      });
      if (facturaVigente) {
        throw new ConflictException('Este pedido tiene facturas vigentes; anulalas antes de cancelar el pedido');
      }

      const hayEntregados = await tx.detalleComanda.findFirst({
        where: { comanda: { id_pedido_comanda: idPedido }, estado_dc: 'ENTREGADO' },
      });
      if (hayEntregados) {
        throw new ConflictException(
          'Ya se entregaron items de este pedido; cancela los items pendientes de forma individual en vez de cancelar todo el pedido',
        );
      }

      const pendientes = await tx.detalleComanda.findMany({
        where: { comanda: { id_pedido_comanda: idPedido }, estado_dc: 'PREPARANDO' },
      });
      for (const detalle of pendientes) {
        await tx.detalleComanda.update({ where: { id_detalleComanda: detalle.id_detalleComanda }, data: { estado_dc: 'CANCELADO' } });
        // El item ya descargo inventario al crearse (ver ComandasService); hay que revertirlo.
        await this.inventoryService.revertirPorDetalleComanda(tx, detalle.id_detalleComanda);
      }

      await tx.pedido.update({ where: { id_pedido: idPedido }, data: { estado_pedido: 'CANCELADO' } });
      // Un domicilio no ocupa mesa; solo se libera si el pedido estaba en una.
      if (pedido.mesa_pedido !== null) {
        await tx.mesa.update({ where: { id_mesa: pedido.mesa_pedido }, data: { estado_mesa: 'LIBRE' } });
      }

      return tx.pedido.findUniqueOrThrow({ where: { id_pedido: idPedido }, include: PEDIDO_INCLUDE });
    });
  }

  // Transferir un pedido a otra mesa (reubicacion fisica de la mesa). Las
  // subcuentas, comandas y facturas cuelgan del Pedido (por id_pedido), no de
  // la Mesa: basta con cambiar mesa_pedido y ajustar el estado de ambas mesas.
  // Solo se transfiere a una mesa LIBRE; la de origen queda LIBRE.
  async transferir(idPedido: number, idMesaDestino: number) {
    return this.prisma.$transaction(async (tx) => {
      // Bloqueo del pedido: que no lo cobren/cancelen a mitad de la transferencia.
      const filas = await tx.$queryRaw<{ id_pedido: number }[]>`
        SELECT id_pedido FROM "Pedido" WHERE id_pedido = ${idPedido} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Pedido no encontrado');

      const pedido = await tx.pedido.findUniqueOrThrow({ where: { id_pedido: idPedido } });
      // Solo un pedido abierto ocupa una mesa; PAGADO/CANCELADO ya la liberaron.
      if (pedido.estado_pedido === 'PAGADO' || pedido.estado_pedido === 'CANCELADO') {
        throw new ConflictException(`No se puede transferir un pedido ${pedido.estado_pedido.toLowerCase()}`);
      }
      // Un domicilio no esta en ninguna mesa: no hay nada que reubicar.
      if (pedido.mesa_pedido === null) {
        throw new ConflictException('Un domicilio no ocupa mesa; no se puede transferir');
      }

      const idMesaOrigen = pedido.mesa_pedido;
      if (idMesaOrigen === idMesaDestino) {
        throw new ConflictException('El pedido ya esta en esa mesa');
      }

      // Bloqueo de ambas mesas en orden ascendente (evita deadlocks con otra
      // transferencia/apertura concurrente sobre las mismas mesas).
      const [idBajo, idAlto] = idMesaOrigen < idMesaDestino ? [idMesaOrigen, idMesaDestino] : [idMesaDestino, idMesaOrigen];
      await tx.$queryRaw`
        SELECT id_mesa FROM "Mesa" WHERE id_mesa IN (${idBajo}, ${idAlto}) ORDER BY id_mesa FOR UPDATE
      `;

      const destino = await tx.mesa.findUnique({ where: { id_mesa: idMesaDestino } });
      if (!destino) throw new NotFoundException('Mesa destino no encontrada');
      if (destino.estado_mesa !== 'LIBRE') {
        throw new ConflictException(`No se puede transferir: la mesa destino esta ${destino.estado_mesa}`);
      }

      await tx.pedido.update({ where: { id_pedido: idPedido }, data: { mesa_pedido: idMesaDestino } });
      await tx.mesa.update({ where: { id_mesa: idMesaDestino }, data: { estado_mesa: 'OCUPADA' } });
      await tx.mesa.update({ where: { id_mesa: idMesaOrigen }, data: { estado_mesa: 'LIBRE' } });

      return tx.pedido.findUniqueOrThrow({ where: { id_pedido: idPedido }, include: PEDIDO_INCLUDE });
    });
  }
}
