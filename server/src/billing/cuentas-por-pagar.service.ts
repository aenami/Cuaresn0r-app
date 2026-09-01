import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearCuentaPorPagarDto } from './dto/crear-cuenta-por-pagar.dto';
import { PagarCuentaPorPagarDto } from './dto/pagar-cuenta-por-pagar.dto';

const CUENTA_INCLUDE = {
  proveedor: true,
  detalles: { include: { ingrediente: true } },
  pagos: { include: { usuario: { select: { id_usuario: true, email_usuario: true } } }, orderBy: { fecha_pagoCuentaPorPagar: 'asc' as const } },
  usuarioRecibe: { select: { id_usuario: true, email_usuario: true } },
} satisfies Prisma.CuentaPorPagarInclude;

@Injectable()
export class CuentasPorPagarService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearCuentaPorPagarDto) {
    const proveedor = await this.prisma.proveedor.findUnique({ where: { id_proveedor: dto.idProveedor } });
    if (!proveedor || !proveedor.proveedor_activo) throw new UnprocessableEntityException('Proveedor inexistente o inactivo');

    const idsIngredientes = dto.detalles?.map((detalle) => detalle.idIngrediente) ?? [];
    if (new Set(idsIngredientes).size !== idsIngredientes.length) {
      throw new UnprocessableEntityException('Un ingrediente no puede repetirse en la misma cuenta');
    }
    if (idsIngredientes.length > 0) {
      const existentes = await this.prisma.ingrediente.count({ where: { id_ingrediente: { in: idsIngredientes } } });
      if (existentes !== idsIngredientes.length) throw new UnprocessableEntityException('Uno o mas ingredientes no existen');
    }

    return this.prisma.cuentaPorPagar.create({
      data: {
        id_proveedor_cuentaPorPagar: dto.idProveedor,
        concepto_cuentaPorPagar: dto.concepto,
        documento_cuentaPorPagar: dto.documento,
        fecha_emision_cuentaPorPagar: dto.fechaEmision ? new Date(dto.fechaEmision) : new Date(),
        fecha_vencimiento_cuentaPorPagar: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
        monto_total_cuentaPorPagar: dto.montoTotal,
        observacion_cuentaPorPagar: dto.observacion,
        detalles: {
          create: (dto.detalles ?? []).map((detalle) => ({
            id_ingrediente_detalleCuenta: detalle.idIngrediente,
            cantidad_detalleCuenta: detalle.cantidad,
            precio_unitario_detalleCuenta: detalle.precioUnitario,
          })),
        },
      },
      include: CUENTA_INCLUDE,
    });
  }

  listar() {
    return this.prisma.cuentaPorPagar.findMany({ include: CUENTA_INCLUDE, orderBy: { id_cuentaPorPagar: 'desc' } });
  }

  async obtener(idCuenta: number) {
    const cuenta = await this.prisma.cuentaPorPagar.findUnique({ where: { id_cuentaPorPagar: idCuenta }, include: CUENTA_INCLUDE });
    if (!cuenta) throw new NotFoundException('Cuenta por pagar no encontrada');
    const pagado = cuenta.pagos.reduce((total, pago) => total.plus(pago.monto_pagoCuentaPorPagar), new Prisma.Decimal(0));
    return { ...cuenta, saldo: cuenta.monto_total_cuentaPorPagar.minus(pagado) };
  }

  async recibirMercancia(idCuenta: number, idUsuario: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id_cuentaPorPagar" FROM "CuentaPorPagar" WHERE "id_cuentaPorPagar" = ${idCuenta} FOR UPDATE`;
      const cuenta = await tx.cuentaPorPagar.findUnique({
        where: { id_cuentaPorPagar: idCuenta },
        include: { detalles: true },
      });
      if (!cuenta) throw new NotFoundException('Cuenta por pagar no encontrada');
      if (cuenta.estado_cuentaPorPagar === 'ANULADA') throw new ConflictException('La cuenta esta anulada');
      if (cuenta.fecha_recepcion_mercancia !== null) throw new ConflictException('La mercancia ya fue recibida');

      for (const detalle of cuenta.detalles) {
        await tx.movimientoInventario.create({
          data: {
            id_ingrediente_movimiento: detalle.id_ingrediente_detalleCuenta,
            id_usuario_movimiento: idUsuario,
            id_detalleCuentaPorPagar_movimiento: detalle.id_detalleCuentaPorPagar,
            tipo_movimiento: 'ENTRADA',
            cantidad_movimiento: detalle.cantidad_detalleCuenta,
            motivo_movimiento: `Recepcion cuenta por pagar #${idCuenta}`,
          },
        });
        await tx.ingrediente.update({
          where: { id_ingrediente: detalle.id_ingrediente_detalleCuenta },
          data: { stock_ingrediente: { increment: detalle.cantidad_detalleCuenta } },
        });
      }

      return tx.cuentaPorPagar.update({
        where: { id_cuentaPorPagar: idCuenta },
        data: { fecha_recepcion_mercancia: new Date(), id_usuario_recibe_mercancia: idUsuario },
        include: CUENTA_INCLUDE,
      });
    });
  }

  async pagar(idCuenta: number, idUsuario: number, dto: PagarCuentaPorPagarDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id_cuentaPorPagar" FROM "CuentaPorPagar" WHERE "id_cuentaPorPagar" = ${idCuenta} FOR UPDATE`;
      const cuenta = await tx.cuentaPorPagar.findUnique({
        where: { id_cuentaPorPagar: idCuenta },
        include: { pagos: true, proveedor: true },
      });
      if (!cuenta) throw new NotFoundException('Cuenta por pagar no encontrada');
      if (cuenta.estado_cuentaPorPagar === 'PAGADA' || cuenta.estado_cuentaPorPagar === 'ANULADA') {
        throw new ConflictException(`La cuenta esta ${cuenta.estado_cuentaPorPagar.toLowerCase()}`);
      }

      const turno = await tx.turno.findFirst({ where: { id_usuario_turno: idUsuario, estado_turno: 'ABIERTO' } });
      if (!turno) throw new ConflictException('Debes tener un turno abierto para registrar el pago');

      const pagado = cuenta.pagos.reduce((total, pago) => total.plus(pago.monto_pagoCuentaPorPagar), new Prisma.Decimal(0));
      const monto = new Prisma.Decimal(dto.monto);
      const saldo = cuenta.monto_total_cuentaPorPagar.minus(pagado);
      if (monto.greaterThan(saldo)) throw new UnprocessableEntityException(`El pago supera el saldo de ${saldo.toFixed(2)}`);

      const pago = await tx.pagoCuentaPorPagar.create({
        data: {
          id_cuentaPorPagar_pago: idCuenta,
          id_turno_pagoCuentaPorPagar: turno.id_turno,
          id_usuario_pagoCuentaPorPagar: idUsuario,
          metodo_pagoCuentaPorPagar: dto.metodo,
          monto_pagoCuentaPorPagar: monto,
        },
      });

      if (dto.metodo === 'EFECTIVO') {
        await tx.movimientoCaja.create({
          data: {
            id_turno_mc: turno.id_turno,
            id_cuentaPorPagar_mc: idCuenta,
            tipo_mc: 'EGRESO',
            monto_mc: monto,
            concepto_mc: `Pago a ${cuenta.proveedor.nombre_proveedor}: ${cuenta.concepto_cuentaPorPagar}`,
          },
        });
        await tx.turno.update({
          where: { id_turno: turno.id_turno },
          data: { monto_cierre_esperado: { decrement: monto } },
        });
      }

      const nuevoSaldo = saldo.minus(monto);
      await tx.cuentaPorPagar.update({
        where: { id_cuentaPorPagar: idCuenta },
        data: { estado_cuentaPorPagar: nuevoSaldo.isZero() ? 'PAGADA' : 'PARCIAL' },
      });
      return { pago, saldo: nuevoSaldo };
    });
  }
}
