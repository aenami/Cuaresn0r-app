import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, EstadoFactura } from '../generated/prisma/client';
import { recalcularEstadoPedido } from '../orders/estado-pedido';
import { CreatePagoDto } from './dto/create-pago.dto';

@Injectable()
export class PagosService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(idFactura: number, idUsuario: number, dto: CreatePagoDto) {
    return this.prisma.$transaction(async (tx) => {
      // Ningun pago sin turno ABIERTO (seccion 7); siempre el del usuario
      // autenticado, asi cada peso cobrado queda trazado a su cajero.
      const turno = await tx.turno.findFirst({
        where: { id_usuario_turno: idUsuario, estado_turno: 'ABIERTO' },
      });
      if (!turno) throw new ConflictException('No tienes un turno abierto; abre uno antes de registrar pagos');
      const caja = await tx.caja.findUniqueOrThrow({ where: { id_caja: turno.id_caja_turno } });
      if (caja.area !== 'RESTAURANTE')
        throw new ConflictException('Las facturas de restaurante se cobran en su propia caja');

      // Bloqueo de la factura: dos pagos concurrentes leerian el mismo saldo
      // y la sobrepagarian.
      const filas = await tx.$queryRaw<{ id_factura: number }[]>`
        SELECT id_factura FROM "Factura" WHERE id_factura = ${idFactura} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Factura no encontrada');

      const factura = await tx.factura.findUniqueOrThrow({
        where: { id_factura: idFactura },
        include: { pagos: true },
      });
      if (factura.estado_factura === 'ANULADA') throw new ConflictException('No se puede pagar una factura anulada');
      if (factura.estado_factura === 'PAGADA') throw new ConflictException('Esta factura ya esta pagada');

      const monto = new Prisma.Decimal(dto.monto);
      const cero = new Prisma.Decimal(0);
      const pagadoPrevio = factura.pagos.reduce((acc, p) => acc.plus(p.monto_total_pago), cero);
      const saldo = factura.monto_total_factura.minus(pagadoPrevio);
      if (monto.greaterThan(saldo)) {
        throw new UnprocessableEntityException(`El monto excede el saldo pendiente de la factura (saldo: ${saldo.toFixed(4)})`);
      }

      // Excedente voluntario ("quedese con el vuelto"): NO hace parte de la
      // factura (el prorrateo de abajo sigue operando solo sobre `monto`). Solo
      // se acepta en efectivo y en el pago que salda la cuenta — dejar propina
      // "de mas" a mitad de una cuenta no tiene sentido de negocio.
      const excedente = new Prisma.Decimal(dto.excedente ?? 0);
      if (excedente.greaterThan(0)) {
        if (dto.metodo !== 'EFECTIVO') {
          throw new UnprocessableEntityException('El excedente solo se puede registrar en pagos en efectivo');
        }
        if (!pagadoPrevio.plus(monto).equals(factura.monto_total_factura)) {
          throw new UnprocessableEntityException('El excedente solo se registra en el pago que salda la cuenta');
        }
        if (dto.destinoExcedente === undefined) {
          throw new UnprocessableEntityException('Indica el destino del excedente (CASA o PROPINA)');
        }
      }

      // Prorrateo del pago en subtotal/servicio/impuestos, proporcional al
      // monto pagado (seccion 6). Telescopico contra lo YA almacenado en los
      // pagos previos: cuando el acumulado llega al total, la suma de cada
      // columna de Pago cuadra EXACTO con su columna de Factura, sin que el
      // redondeo de pagos intermedios descuadre nada.
      const acumulado = pagadoPrevio.plus(monto);
      const ratio = acumulado.dividedBy(factura.monto_total_factura);
      const subPrevio = factura.pagos.reduce((acc, p) => acc.plus(p.subtotal_pago), cero);
      const servPrevio = factura.pagos.reduce((acc, p) => acc.plus(p.monto_servicio_pago), cero);

      const subtotalPago = factura.subtotal_factura.times(ratio).toDecimalPlaces(4).minus(subPrevio);
      const servicioPago = factura.monto_servicio_factura.times(ratio).toDecimalPlaces(4).minus(servPrevio);
      // Impuestos absorbe el residuo de redondeo: subtotal + servicio +
      // impuestos = monto pagado, exacto en cada fila.
      const impuestosPago = monto.minus(subtotalPago).minus(servicioPago);

      const pago = await tx.pago.create({
        data: {
          id_factura_pago: idFactura,
          id_turno_pago: turno.id_turno,
          subtotal_pago: subtotalPago,
          monto_servicio_pago: servicioPago,
          monto_impuestos_pago: impuestosPago,
          monto_total_pago: monto,
          monto_excedente_pago: excedente,
          ...(excedente.greaterThan(0) && { destino_excedente_pago: dto.destinoExcedente }),
          metodo_pago: dto.metodo,
        },
      });

      // Solo el efectivo entra al cuadre de caja; tarjeta/transferencia se
      // concilian aparte contra el datafono (seccion 7). El excedente en
      // efectivo tambien esta fisicamente en la caja: suma al esperado.
      if (dto.metodo === 'EFECTIVO') {
        await tx.turno.update({
          where: { id_turno: turno.id_turno },
          data: { monto_cierre_esperado: { increment: monto.plus(excedente) } },
        });
      }

      let estadoFactura: EstadoFactura = factura.estado_factura;
      if (acumulado.equals(factura.monto_total_factura)) {
        estadoFactura = 'PAGADA';
        await tx.factura.update({ where: { id_factura: idFactura }, data: { estado_factura: 'PAGADA' } });
        const subcuenta = await tx.subcuenta.findUniqueOrThrow({
          where: { id_subcuenta: factura.id_subcuenta_factura },
        });
        await recalcularEstadoPedido(tx, subcuenta.id_pedido_subcuenta);
      }

      return {
        pago,
        estadoFactura,
        saldoPendiente: factura.monto_total_factura.minus(acumulado),
      };
    });
  }

  async findByFactura(idFactura: number) {
    const factura = await this.prisma.factura.findUnique({ where: { id_factura: idFactura } });
    if (!factura) throw new NotFoundException('Factura no encontrada');
    return this.prisma.pago.findMany({ where: { id_factura_pago: idFactura }, orderBy: { id_pago: 'asc' } });
  }

}
