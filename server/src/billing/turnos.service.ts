import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, EstadoTurno, Turno } from '../generated/prisma/client';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto';

const BASE_CAJA_COP = new Prisma.Decimal(300_000);

@Injectable()
export class TurnosService {
  constructor(private readonly prisma: PrismaService) {}

  async abrir(idUsuario: number, dto: AbrirTurnoDto) {
    return this.prisma.$transaction(async (tx) => {
      // Bloqueo de la caja: dos aperturas simultaneas sobre la misma caja
      // pasarian ambas los findFirst de abajo sin esto (mismo patron que Mesa).
      const filas = await tx.$queryRaw<{ id_caja: number }[]>`
        SELECT id_caja FROM "Caja" WHERE id_caja = ${dto.idCaja} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Caja no encontrada');

      const turnoUsuario = await tx.turno.findFirst({
        where: { id_usuario_turno: idUsuario, estado_turno: 'ABIERTO' },
      });
      if (turnoUsuario) {
        throw new ConflictException('Ya tienes un turno abierto; cierralo antes de abrir otro');
      }

      const turnoCaja = await tx.turno.findFirst({
        where: { id_caja_turno: dto.idCaja, estado_turno: 'ABIERTO' },
      });
      if (turnoCaja) throw new ConflictException('Esta caja ya tiene un turno abierto');

      // Todo turno recibe y debe dejar exactamente la base fija del local.
      // monto_cierre_esperado arranca igual a la base: es el cache que cada
      // Pago en EFECTIVO y cada MovimientoCaja iran actualizando en vivo.
      return tx.turno.create({
        data: {
          id_caja_turno: dto.idCaja,
          id_usuario_turno: idUsuario,
          monto_apertura_turno: BASE_CAJA_COP,
          monto_cierre_esperado: BASE_CAJA_COP,
        },
        include: { caja: true },
      });
    });
  }

  async cerrar(idTurno: number, idUsuario: number, rolNombre: string, dto: CerrarTurnoDto) {
    return this.prisma.$transaction(async (tx) => {
      // Bloqueo del turno: que no entre un pago/movimiento a mitad del cierre.
      const filas = await tx.$queryRaw<{ id_turno: number }[]>`
        SELECT id_turno FROM "Turno" WHERE id_turno = ${idTurno} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Turno no encontrado');

      const turno = await tx.turno.findUniqueOrThrow({ where: { id_turno: idTurno } });
      if (turno.estado_turno === 'CERRADO') throw new ConflictException('Este turno ya esta cerrado');
      if (turno.id_usuario_turno !== idUsuario && rolNombre !== 'ADMIN') {
        throw new ForbiddenException('Solo el cajero que abrio el turno (o un ADMIN) puede cerrarlo');
      }

      // Al cerrar se congela el esperado recalculado desde la fuente de
      // verdad (apertura + pagos EFECTIVO + INGRESO - EGRESO), no el cache:
      // asi un descuadre del cache nunca queda congelado en el historico.
      const esperado = await this.calcularCierreEsperado(tx, turno);

      return tx.turno.update({
        where: { id_turno: idTurno },
        data: {
          estado_turno: 'CERRADO',
          fecha_cierre_turno: new Date(),
          monto_cierre_esperado: esperado,
          monto_cierre_real_turno: dto.montoCierreReal,
          ...(dto.conteo !== undefined && { conteo_cierre_turno: dto.conteo }),
        },
        include: { caja: true },
      });
    });
  }

  private async calcularCierreEsperado(tx: Prisma.TransactionClient, turno: Turno) {
    // El efectivo incluye lo aplicado a las facturas y el excedente voluntario
    // ("quedese con el vuelto"): ambos estan fisicamente en la caja.
    const pagosEfectivo = await tx.pago.aggregate({
      where: { id_turno_pago: turno.id_turno, metodo_pago: 'EFECTIVO' },
      _sum: { monto_total_pago: true, monto_excedente_pago: true },
    });
    const ingresos = await tx.movimientoCaja.aggregate({
      where: { id_turno_mc: turno.id_turno, tipo_mc: 'INGRESO' },
      _sum: { monto_mc: true },
    });
    const egresos = await tx.movimientoCaja.aggregate({
      where: { id_turno_mc: turno.id_turno, tipo_mc: 'EGRESO' },
      _sum: { monto_mc: true },
    });

    return turno.monto_apertura_turno
      .plus(pagosEfectivo._sum.monto_total_pago ?? 0)
      .plus(pagosEfectivo._sum.monto_excedente_pago ?? 0)
      .plus(ingresos._sum.monto_mc ?? 0)
      .minus(egresos._sum.monto_mc ?? 0);
  }

  // El turno abierto del usuario autenticado (el que usan pagos/movimientos).
  async findActual(idUsuario: number) {
    const turno = await this.prisma.turno.findFirst({
      where: { id_usuario_turno: idUsuario, estado_turno: 'ABIERTO' },
      include: { caja: true },
    });
    if (!turno) throw new NotFoundException('No tienes un turno abierto');
    return this.conResumen(turno.id_turno);
  }

  async findAll(estado?: EstadoTurno) {
    return this.prisma.turno.findMany({
      where: { ...(estado !== undefined && { estado_turno: estado }) },
      include: { caja: true, usuario: { select: { id_usuario: true, email_usuario: true } } },
      orderBy: { id_turno: 'desc' },
    });
  }

  async findOne(id: number) {
    const turno = await this.prisma.turno.findUnique({ where: { id_turno: id } });
    if (!turno) throw new NotFoundException('Turno no encontrado');
    return this.conResumen(id);
  }

  // Detalle con totales por metodo de pago: tarjeta/transferencia no entran
  // al cuadre de efectivo pero se reportan para conciliar contra el datafono.
  private async conResumen(idTurno: number) {
    const turno = await this.prisma.turno.findUniqueOrThrow({
      where: { id_turno: idTurno },
      include: {
        caja: true,
        usuario: { select: { id_usuario: true, email_usuario: true } },
        movimientosCaja: { orderBy: { id_mc: 'asc' } },
      },
    });

    const porMetodo = await this.prisma.pago.groupBy({
      by: ['metodo_pago'],
      where: { id_turno_pago: idTurno },
      _sum: { monto_total_pago: true },
      _count: { id_pago: true },
    });

    const nominaPorMetodo = await this.prisma.pagoNomina.groupBy({
      by: ['metodo_pagoNomina'],
      where: { id_turno_pagoNomina: idTurno },
      _sum: { monto_pagoNomina: true },
    });
    const cuentasPorMetodo = await this.prisma.pagoCuentaPorPagar.groupBy({
      by: ['metodo_pagoCuentaPorPagar'],
      where: { id_turno_pagoCuentaPorPagar: idTurno },
      _sum: { monto_pagoCuentaPorPagar: true },
    });

    // Pagos individuales para el registro de movimientos (ledger): cada venta
    // con su hora, metodo y el pedido al que pertenece (via factura->subcuenta).
    const pagos = await this.prisma.pago.findMany({
      where: { id_turno_pago: idTurno },
      select: {
        id_pago: true,
        metodo_pago: true,
        monto_total_pago: true,
        fecha_pago: true,
        factura: { select: { subcuenta: { select: { id_pedido_subcuenta: true } } } },
      },
      orderBy: { fecha_pago: 'asc' },
    });

    const totalVentas = (metodo: string) =>
      porMetodo.find((fila) => fila.metodo_pago === metodo)?._sum.monto_total_pago ?? new Prisma.Decimal(0);
    const totalNomina = (metodo: string) =>
      nominaPorMetodo.find((fila) => fila.metodo_pagoNomina === metodo)?._sum.monto_pagoNomina ?? new Prisma.Decimal(0);
    const totalCuentas = (metodo: string) =>
      cuentasPorMetodo.find((fila) => fila.metodo_pagoCuentaPorPagar === metodo)?._sum.monto_pagoCuentaPorPagar ??
      new Prisma.Decimal(0);

    return {
      ...turno,
      baseCaja: BASE_CAJA_COP,
      resumenCuadre: {
        ventas: {
          efectivo: totalVentas('EFECTIVO'),
          transferencia: totalVentas('TRANSFERENCIA'),
          tarjeta: totalVentas('TARJETA'),
        },
        egresos: {
          nominaEfectivo: totalNomina('EFECTIVO'),
          nominaTransferencia: totalNomina('TRANSFERENCIA'),
          cuentasEfectivo: totalCuentas('EFECTIVO'),
          cuentasTransferencia: totalCuentas('TRANSFERENCIA'),
        },
        netoTransferencias: totalVentas('TRANSFERENCIA')
          .minus(totalNomina('TRANSFERENCIA'))
          .minus(totalCuentas('TRANSFERENCIA')),
        efectivoEsperadoSinBase: (turno.monto_cierre_esperado ?? turno.monto_apertura_turno).minus(BASE_CAJA_COP),
      },
      pagosPorMetodo: porMetodo.map((m) => ({
        metodo: m.metodo_pago,
        cantidad: m._count.id_pago,
        total: m._sum.monto_total_pago,
      })),
      pagos: pagos.map((p) => ({
        id_pago: p.id_pago,
        metodo: p.metodo_pago,
        monto: p.monto_total_pago,
        fecha: p.fecha_pago,
        id_pedido: p.factura.subcuenta.id_pedido_subcuenta,
      })),
    };
  }
}
