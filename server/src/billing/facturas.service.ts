import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, EstadoFactura } from '../generated/prisma/client';
import { BillingConfigService } from './billing-config.service';

const FACTURA_INCLUDE = {
  pagos: true,
  subcuenta: { include: { pedido: { select: { id_pedido: true, estado_pedido: true, mesa_pedido: true } } } },
} satisfies Prisma.FacturaInclude;

// Nombre para mostrar de un usuario: el del empleado si lo tiene, si no el email.
function nombreUsuario(
  usuario:
    | { email_usuario: string; empleado: { nombre_empleado: string; apellido_empleado: string } | null }
    | null
    | undefined,
): string | null {
  if (!usuario) return null;
  if (usuario.empleado) return `${usuario.empleado.nombre_empleado} ${usuario.empleado.apellido_empleado}`.trim();
  return usuario.email_usuario;
}

@Injectable()
export class FacturasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingConfigService: BillingConfigService,
  ) {}

  // Emite la factura de UNA subcuenta (la Factura cuelga de Subcuenta, no de
  // Pedido, para soportar cuentas divididas — seccion 6). Los montos quedan
  // snapshoteados: cambios posteriores de config no tocan facturas emitidas.
  //
  // `porcentajePropina` (opcional) es la propina/servicio elegida al cobrar,
  // como % del subtotal. Si se omite, se usa el porcentaje_servicio de la
  // config activa (el "servicio" de este dominio ES la propina sugerida). Se
  // guarda como monto_servicio_factura, asi el prorrateo de pagos y la
  // anulacion (que ya operan sobre esa columna) no necesitan cambios.
  async emitir(idSubcuenta: number, porcentajePropina?: number, montoServicio?: number) {
    return this.prisma.$transaction(async (tx) => {
      // Bloqueo: dos emisiones simultaneas sobre la misma subcuenta crearian
      // dos facturas vigentes (el chequeo de abajo pasaria en ambas).
      const filas = await tx.$queryRaw<{ id_subcuenta: number }[]>`
        SELECT id_subcuenta FROM "Subcuenta" WHERE id_subcuenta = ${idSubcuenta} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Subcuenta no encontrada');

      const subcuenta = await tx.subcuenta.findUniqueOrThrow({
        where: { id_subcuenta: idSubcuenta },
        include: { pedido: true },
      });
      if (subcuenta.pedido.estado_pedido === 'CANCELADO' || subcuenta.pedido.estado_pedido === 'PAGADO') {
        throw new ConflictException(`No se puede facturar: el pedido esta ${subcuenta.pedido.estado_pedido}`);
      }

      const vigente = await tx.factura.findFirst({
        where: { id_subcuenta_factura: idSubcuenta, estado_factura: { not: 'ANULADA' } },
      });
      if (vigente) {
        throw new ConflictException('Esta subcuenta ya tiene una factura vigente; anulala si necesitas refacturar');
      }

      // Defensa (seccion 5): ningun item del pedido puede quedar sin asignar
      // a una subcuenta. Con el flujo actual no deberia pasar (todo item nace
      // asignado o repartido), pero si pasara la plata se perderia en silencio.
      const sinAsignar = await tx.detalleComanda.findFirst({
        where: {
          comanda: { id_pedido_comanda: subcuenta.id_pedido_subcuenta },
          estado_dc: { not: 'CANCELADO' },
          id_subcuenta_dc: null,
          subcuentasReparto: { none: {} },
        },
      });
      if (sinAsignar) {
        throw new ConflictException('Hay items del pedido sin asignar a ninguna subcuenta; asignalos antes de facturar');
      }

      // Items que paga esta subcuenta: los asignados directo + su proporcion
      // de los compartidos. Se suman TODAS las filas no canceladas, padres e
      // hijos (seccion 15): los hijos de combo van en 0 pero podrian tener
      // precio propio en el futuro (adiciones catalogadas).
      const directos = await tx.detalleComanda.findMany({
        where: { id_subcuenta_dc: idSubcuenta, estado_dc: { not: 'CANCELADO' } },
      });
      const repartos = await tx.subcuentaDetalleComanda.findMany({
        where: { id_subcuenta_sdc: idSubcuenta, detalleComanda: { estado_dc: { not: 'CANCELADO' } } },
        include: { detalleComanda: true },
      });
      if (directos.length === 0 && repartos.length === 0) {
        throw new UnprocessableEntityException('Esta subcuenta no tiene items para facturar');
      }

      // Solo se factura comida ya entregada: lo pendiente se entrega o se
      // cancela primero (el pedido pasa a PAGADO despues de ENTREGADO).
      const hayPendientes =
        directos.some((d) => d.estado_dc === 'PREPARANDO') ||
        repartos.some((r) => r.detalleComanda.estado_dc === 'PREPARANDO');
      if (hayPendientes) {
        throw new ConflictException('Hay items de esta subcuenta aun en preparacion; entregalos o cancelalos antes de facturar');
      }

      let subtotal = new Prisma.Decimal(0);
      for (const d of directos) {
        subtotal = subtotal.plus(d.precio_unitario_dc.times(d.cantidad_producto_dc));
      }
      for (const r of repartos) {
        subtotal = subtotal.plus(
          r.detalleComanda.precio_unitario_dc.times(r.detalleComanda.cantidad_producto_dc).times(r.proporcion_sdc),
        );
      }
      subtotal = subtotal.toDecimalPlaces(4);
      if (subtotal.isZero()) {
        throw new UnprocessableEntityException('El total a facturar de esta subcuenta es 0');
      }

      const config = await this.billingConfigService.findActiva(tx);
      // La propina (servicio) puede fijarse como monto EXACTO en pesos o como %
      // del subtotal. El monto exacto manda; si no, el % elegido al cobrar y en
      // su defecto el porcentaje_servicio de la config.
      const servicio =
        montoServicio !== undefined
          ? new Prisma.Decimal(montoServicio).toDecimalPlaces(4)
          : subtotal.times(porcentajePropina ?? config.porcentaje_servicio).dividedBy(100).toDecimalPlaces(4);
      const impuestos = subtotal.times(config.porcentaje_impuestos).dividedBy(100).toDecimalPlaces(4);
      const total = subtotal.plus(servicio).plus(impuestos);

      return tx.factura.create({
        data: {
          id_subcuenta_factura: idSubcuenta,
          subtotal_factura: subtotal,
          monto_servicio_factura: servicio,
          monto_impuestos_factura: impuestos,
          monto_total_factura: total,
        },
        include: FACTURA_INCLUDE,
      });
    });
  }

  // La Factura es inmutable: la correccion es SIEMPRE anular + refacturar
  // (seccion 6). Si ya tiene pagos, anularla es una DEVOLUCION TOTAL: la
  // parte pagada en EFECTIVO sale de la caja como MovimientoCaja EGRESO en
  // el turno abierto; tarjeta/transferencia se reversa por fuera (banco/
  // datafono) y aqui solo se reporta cuanto. Devoluciones parciales no
  // existen: para "quitar un item" se anula y se refactura.
  async anular(idFactura: number, motivo: string, idUsuario: number) {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ id_factura: number }[]>`
        SELECT id_factura FROM "Factura" WHERE id_factura = ${idFactura} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Factura no encontrada');

      const factura = await tx.factura.findUniqueOrThrow({
        where: { id_factura: idFactura },
        include: { pagos: true },
      });
      if (factura.estado_factura === 'ANULADA') throw new ConflictException('Esta factura ya esta anulada');

      const cero = new Prisma.Decimal(0);
      // El efectivo que salio de la caja incluye el excedente voluntario: al
      // anular se devuelve todo lo que fisicamente entro por esos pagos.
      const efectivo = factura.pagos
        .filter((p) => p.metodo_pago === 'EFECTIVO')
        .reduce((acc, p) => acc.plus(p.monto_total_pago).plus(p.monto_excedente_pago), cero);
      const noEfectivo = factura.pagos
        .filter((p) => p.metodo_pago !== 'EFECTIVO')
        .reduce((acc, p) => acc.plus(p.monto_total_pago), cero);

      if (efectivo.greaterThan(0)) {
        const turno = await this.resolverTurnoParaDevolucion(tx, idUsuario);
        await tx.$queryRaw`SELECT id_turno FROM "Turno" WHERE id_turno = ${turno.id_turno} FOR UPDATE`;
        const turnoActual = await tx.turno.findUniqueOrThrow({ where: { id_turno: turno.id_turno } });

        const esperado = turnoActual.monto_cierre_esperado ?? turnoActual.monto_apertura_turno;
        if (esperado.minus(efectivo).isNegative()) {
          throw new UnprocessableEntityException(
            `La caja no tiene efectivo suficiente para devolver ${efectivo.toFixed(2)} (esperado actual: ${esperado.toFixed(2)})`,
          );
        }

        await tx.movimientoCaja.create({
          data: {
            id_turno_mc: turno.id_turno,
            tipo_mc: 'EGRESO',
            monto_mc: efectivo,
            concepto_mc: `Devolucion factura #${idFactura} (anulacion)`,
          },
        });
        await tx.turno.update({
          where: { id_turno: turno.id_turno },
          data: { monto_cierre_esperado: { decrement: efectivo } },
        });
      }

      const anulada = await tx.factura.update({
        where: { id_factura: idFactura },
        data: { estado_factura: 'ANULADA', motivo_anulacion_factura: motivo },
        include: FACTURA_INCLUDE,
      });

      // El pedido deja de estar totalmente pagado: vuelve a ENTREGADO para
      // poder refacturar. La mesa NO se toca (ya se libero al pagar y puede
      // estar ocupada por otro pedido).
      const subcuenta = await tx.subcuenta.findUniqueOrThrow({ where: { id_subcuenta: factura.id_subcuenta_factura } });
      const pedido = await tx.pedido.findUniqueOrThrow({ where: { id_pedido: subcuenta.id_pedido_subcuenta } });
      if (pedido.estado_pedido === 'PAGADO') {
        await tx.pedido.update({ where: { id_pedido: pedido.id_pedido }, data: { estado_pedido: 'ENTREGADO' } });
      }

      return {
        factura: anulada,
        devolucion: {
          efectivoDevuelto: efectivo,
          devolverPorFuera: noEfectivo, // reversar en el datafono/banco
        },
      };
    });
  }

  // El efectivo de la devolucion sale del turno abierto de quien anula; si
  // no tiene, del unico turno abierto (supuesto de una sola caja activa,
  // seccion 20). Con varios abiertos no se adivina.
  private async resolverTurnoParaDevolucion(tx: Prisma.TransactionClient, idUsuario: number) {
    const propio = await tx.turno.findFirst({
      where: { id_usuario_turno: idUsuario, estado_turno: 'ABIERTO' },
    });
    if (propio) return propio;

    const abiertos = await tx.turno.findMany({ where: { estado_turno: 'ABIERTO' }, take: 2 });
    if (abiertos.length === 1) return abiertos[0];
    if (abiertos.length === 0) {
      throw new ConflictException('No hay un turno abierto para devolver el efectivo; abre un turno antes de anular');
    }
    throw new ConflictException('Hay varios turnos abiertos; anula desde el usuario del turno que devolvera el efectivo');
  }

  async findAll(estado?: EstadoFactura, desde?: string, hasta?: string, pedido?: number) {
    const rango: { gte?: Date; lte?: Date } = {};
    if (desde !== undefined) {
      const fecha = new Date(desde);
      if (isNaN(fecha.getTime())) throw new BadRequestException('Fecha "desde" invalida');
      rango.gte = fecha;
    }
    if (hasta !== undefined) {
      const fecha = new Date(hasta);
      if (isNaN(fecha.getTime())) throw new BadRequestException('Fecha "hasta" invalida');
      rango.lte = fecha;
    }

    return this.prisma.factura.findMany({
      where: {
        ...(estado !== undefined && { estado_factura: estado }),
        ...((rango.gte || rango.lte) && { fecha_emision_factura: rango }),
        // Facturas de un pedido: se filtra por la subcuenta a la que cuelgan.
        ...(pedido !== undefined && { subcuenta: { id_pedido_subcuenta: pedido } }),
      },
      include: FACTURA_INCLUDE,
      orderBy: { id_factura: 'desc' },
    });
  }

  async findOne(id: number) {
    const factura = await this.prisma.factura.findUnique({ where: { id_factura: id }, include: FACTURA_INCLUDE });
    if (!factura) throw new NotFoundException('Factura no encontrada');
    return factura;
  }

  // Cuentas cobradas (facturas PAGADA) con su detalle para el reporte de caja:
  // mesa, montos snapshoteados, metodos de pago y los productos de la cuenta.
  // El rango filtra por fecha_emision (en el flujo de cobro emitir y pagar
  // ocurren en la misma sesion, asi que equivale a "cobradas" en la ventana).
  // Se devuelve un shape ya aplanado para no acoplar el cliente al modelo.
  async findCuentasPagadas(desde?: string, hasta?: string) {
    const rango: { gte?: Date; lte?: Date } = {};
    if (desde !== undefined) {
      const fecha = new Date(desde);
      if (isNaN(fecha.getTime())) throw new BadRequestException('Fecha "desde" invalida');
      rango.gte = fecha;
    }
    if (hasta !== undefined) {
      const fecha = new Date(hasta);
      if (isNaN(fecha.getTime())) throw new BadRequestException('Fecha "hasta" invalida');
      rango.lte = fecha;
    }

    const facturas = await this.prisma.factura.findMany({
      where: {
        estado_factura: 'PAGADA',
        ...((rango.gte || rango.lte) && { fecha_emision_factura: rango }),
      },
      include: {
        pagos: {
          orderBy: { fecha_pago: 'asc' },
          // El cajero es el dueno del turno donde se registro el pago.
          include: {
            turno: {
              select: {
                usuario: {
                  select: {
                    email_usuario: true,
                    empleado: { select: { nombre_empleado: true, apellido_empleado: true } },
                  },
                },
              },
            },
          },
        },
        subcuenta: {
          include: {
            pedido: {
              select: {
                id_pedido: true,
                tipo_pedido: true,
                nombre_cliente_pedido: true,
                telefono_cliente_pedido: true,
                direccion_cliente_pedido: true,
                mesa: { select: { numero_mesa: true, zona: { select: { identificador_zona: true } } } },
                mesero: {
                  select: {
                    email_usuario: true,
                    empleado: { select: { nombre_empleado: true, apellido_empleado: true } },
                  },
                },
              },
            },
            // Items asignados directo a la cuenta (padres); los hijos (combo y
            // adiciones) anidados. La suma de padres + adiciones = subtotal.
            detallesComanda: {
              where: { estado_dc: { not: 'CANCELADO' }, id_detalleComandaPadre_dc: null },
              orderBy: { id_detalleComanda: 'asc' },
              include: {
                producto: { select: { nombre_producto: true } },
                combo: { select: { nombre_combo: true } },
                hijos: {
                  where: { estado_dc: { not: 'CANCELADO' } },
                  orderBy: { id_detalleComanda: 'asc' },
                  include: { producto: { select: { nombre_producto: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { fecha_emision_factura: 'desc' },
    });

    return facturas.map((f) => ({
      id_factura: f.id_factura,
      fecha: f.fecha_emision_factura,
      subtotal: f.subtotal_factura,
      servicio: f.monto_servicio_factura,
      impuestos: f.monto_impuestos_factura,
      total: f.monto_total_factura,
      nombre_cuenta: f.subcuenta.nombre_subcuenta,
      cajero: nombreUsuario(f.pagos[0]?.turno.usuario),
      pedido: {
        id_pedido: f.subcuenta.pedido.id_pedido,
        tipo: f.subcuenta.pedido.tipo_pedido,
        mesa_numero: f.subcuenta.pedido.mesa?.numero_mesa ?? null,
        zona: f.subcuenta.pedido.mesa?.zona?.identificador_zona ?? null,
        mesero: nombreUsuario(f.subcuenta.pedido.mesero),
        cliente:
          f.subcuenta.pedido.tipo_pedido === 'DOMICILIO'
            ? {
                nombre: f.subcuenta.pedido.nombre_cliente_pedido,
                telefono: f.subcuenta.pedido.telefono_cliente_pedido,
                direccion: f.subcuenta.pedido.direccion_cliente_pedido,
              }
            : null,
      },
      pagos: f.pagos.map((p) => ({
        metodo: p.metodo_pago,
        monto: p.monto_total_pago,
        fecha: p.fecha_pago,
        excedente: p.monto_excedente_pago,
        destino: p.destino_excedente_pago,
      })),
      items: f.subcuenta.detallesComanda.map((d) => ({
        id: d.id_detalleComanda,
        nombre: d.producto?.nombre_producto ?? d.combo?.nombre_combo ?? 'Item',
        cantidad: d.cantidad_producto_dc,
        precio_unitario: d.precio_unitario_dc,
        hijos: d.hijos.map((h) => ({
          id: h.id_detalleComanda,
          nombre: h.producto?.nombre_producto ?? 'Producto',
          cantidad: h.cantidad_producto_dc,
          precio_unitario: h.precio_unitario_dc,
        })),
      })),
    }));
  }
}
