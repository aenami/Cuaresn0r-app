import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreatePagoNominaDto } from './dto/create-pago-nomina.dto';

type DevengoConSaldo = {
  devengo: Prisma.DevengoNominaGetPayload<{
    include: { pagoNominaDetalles: true };
  }>;
  aplicado: Prisma.Decimal;
  restante: Prisma.Decimal;
};

@Injectable()
export class PagosNominaService {
  constructor(private readonly prisma: PrismaService) {}

  private async findEmpleado(
    client: Prisma.TransactionClient | PrismaService,
    idEmpleado: number,
  ) {
    const empleado = await client.empleado.findUnique({
      where: { id_empleado: idEmpleado },
    });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    return empleado;
  }

  // Estado de pago de cada devengo, calculado SIEMPRE al vuelo contra
  // PagoNominaDetalle (seccion 14) — nunca se persiste como columna.
  private async devengosConSaldo(
    client: Prisma.TransactionClient | PrismaService,
    idEmpleado: number,
  ): Promise<DevengoConSaldo[]> {
    const devengos = await client.devengoNomina.findMany({
      where: { id_empleado_devengoNomina: idEmpleado },
      include: { pagoNominaDetalles: true },
      orderBy: [{ fecha_devengoNomina: 'asc' }, { id_devengoNomina: 'asc' }],
    });
    const cero = new Prisma.Decimal(0);
    return devengos.map((devengo) => {
      const aplicado = devengo.pagoNominaDetalles.reduce(
        (acc, d) => acc.plus(d.monto_aplicado_pnd),
        cero,
      );
      return {
        devengo,
        aplicado,
        restante: devengo.monto_devengoNomina.minus(aplicado),
      };
    });
  }

  async saldo(idEmpleado: number) {
    const empleado = await this.findEmpleado(this.prisma, idEmpleado);
    const filas = await this.devengosConSaldo(this.prisma, idEmpleado);
    const cero = new Prisma.Decimal(0);

    const totalDevengado = filas.reduce(
      (acc, f) => acc.plus(f.devengo.monto_devengoNomina),
      cero,
    );
    const totalPagado = filas.reduce((acc, f) => acc.plus(f.aplicado), cero);

    return {
      empleado: {
        id_empleado: empleado.id_empleado,
        nombre_empleado: empleado.nombre_empleado,
        apellido_empleado: empleado.apellido_empleado,
        estado_empleado: empleado.estado_empleado,
      },
      totalDevengado,
      totalPagado,
      saldoPendiente: totalDevengado.minus(totalPagado),
      devengos: filas
        .map((f) => ({
          ...f.devengo,
          pagado: f.aplicado,
          restante: f.restante,
          estadoPago: f.restante.isZero()
            ? 'PAGADO'
            : f.aplicado.isZero()
              ? 'PENDIENTE'
              : 'PARCIAL',
        }))
        .reverse(), // mas reciente primero para lectura
    };
  }

  // Registra el pago y distribuye el monto entre los devengos pendientes
  // generando PagoNominaDetalle (seccion 14). Politica: las deducciones
  // pendientes se netean completas primero (una deuda del empleado se
  // descuenta en el primer pago que se le haga) y el resto va FIFO al dia
  // pendiente mas antiguo. Sin adelantos: el monto no puede superar el saldo.
  async registrar(
    idEmpleado: number,
    idUsuario: number,
    dto: CreatePagoNominaDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock del empleado: dos pagos concurrentes leerian los mismos
      // pendientes y los cubririan dos veces.
      const filasLock = await tx.$queryRaw<{ id_empleado: number }[]>`
        SELECT id_empleado FROM "Empleado" WHERE id_empleado = ${idEmpleado} FOR UPDATE
      `;
      if (!filasLock[0]) throw new NotFoundException('Empleado no encontrado');
      const empleado = await tx.empleado.findUniqueOrThrow({
        where: { id_empleado: idEmpleado },
      });
      // Ojo: NO se exige empleado ACTIVO — a un retirado se le paga su saldo.

      const monto = new Prisma.Decimal(dto.monto);
      const filas = await this.devengosConSaldo(tx, idEmpleado);
      const cero = new Prisma.Decimal(0);
      const saldoPendiente = filas.reduce(
        (acc, f) => acc.plus(f.restante),
        cero,
      );
      if (monto.greaterThan(saldoPendiente)) {
        throw new UnprocessableEntityException(
          `El monto excede el saldo pendiente del empleado (${saldoPendiente.toFixed(2)}); los adelantos no estan permitidos`,
        );
      }

      // Todo pago realizado durante un turno queda asociado a ese turno para
      // que aparezca en su cuadre, incluso si fue por transferencia. EFECTIVO
      // exige turno y ademas afecta fisicamente el saldo esperado de la caja.
      let turno = await tx.turno.findFirst({
        where: { id_usuario_turno: idUsuario, estado_turno: 'ABIERTO' },
      });
      if (!turno && dto.metodo === 'EFECTIVO') {
        throw new ConflictException(
          'No tienes un turno abierto; abre uno o registra el pago como TRANSFERENCIA',
        );
      }

      if (turno) {
        await tx.$queryRaw`SELECT id_turno FROM "Turno" WHERE id_turno = ${turno.id_turno} FOR UPDATE`;
        turno = await tx.turno.findUniqueOrThrow({
          where: { id_turno: turno.id_turno },
        });

        // El turno pudo cerrarse mientras se esperaba el bloqueo. Una
        // transferencia sigue siendo valida, pero ya no pertenece al turno;
        // un pago en efectivo no puede registrarse fuera de una caja abierta.
        if (turno.estado_turno !== 'ABIERTO') {
          if (dto.metodo === 'EFECTIVO') {
            throw new ConflictException(
              'El turno se cerro antes de registrar el pago',
            );
          }
          turno = null;
        }
      }

      if (turno && dto.metodo === 'EFECTIVO') {
        const esperadoActual =
          turno.monto_cierre_esperado ?? turno.monto_apertura_turno;
        if (esperadoActual.minus(monto).isNegative()) {
          throw new UnprocessableEntityException(
            `La caja no tiene efectivo suficiente (esperado actual: ${esperadoActual.toFixed(2)}); usa TRANSFERENCIA o un monto menor`,
          );
        }
      }

      const pago = await tx.pagoNomina.create({
        data: {
          id_empleado_pagoNomina: idEmpleado,
          id_turno_pagoNomina: turno?.id_turno ?? null,
          id_usuario_registra_pagoNomina: idUsuario,
          monto_pagoNomina: monto,
          metodo_pagoNomina: dto.metodo,
          ...(dto.observacion !== undefined && {
            observacion_pagoNomina: dto.observacion,
          }),
        },
      });

      // Distribucion: deducciones (restante negativo) completas primero —
      // amplian lo disponible para cubrir dias — y luego FIFO positivas.
      // Como monto <= saldo, al final restantePago queda exactamente en 0 y
      // SUM(monto_aplicado) del pago cuadra con monto_pagoNomina.
      let restantePago = monto;
      const detalles: {
        id_devengoNomina_pnd: number;
        monto_aplicado_pnd: Prisma.Decimal;
      }[] = [];
      for (const fila of filas) {
        if (fila.restante.isNegative()) {
          detalles.push({
            id_devengoNomina_pnd: fila.devengo.id_devengoNomina,
            monto_aplicado_pnd: fila.restante,
          });
          restantePago = restantePago.minus(fila.restante);
        }
      }
      for (const fila of filas) {
        if (restantePago.isZero()) break;
        if (!fila.restante.greaterThan(0)) continue;
        const aplicar = fila.restante.lessThan(restantePago)
          ? fila.restante
          : restantePago;
        detalles.push({
          id_devengoNomina_pnd: fila.devengo.id_devengoNomina,
          monto_aplicado_pnd: aplicar,
        });
        restantePago = restantePago.minus(aplicar);
      }

      await tx.pagoNominaDetalle.createMany({
        data: detalles.map((d) => ({
          id_pagoNomina_pnd: pago.id_pagoNomina,
          ...d,
        })),
      });

      if (turno && dto.metodo === 'EFECTIVO') {
        await tx.movimientoCaja.create({
          data: {
            id_turno_mc: turno.id_turno,
            tipo_mc: 'EGRESO',
            monto_mc: monto,
            concepto_mc: `Pago de nomina #${pago.id_pagoNomina} - ${empleado.nombre_empleado} ${empleado.apellido_empleado}`,
          },
        });
        await tx.turno.update({
          where: { id_turno: turno.id_turno },
          data: { monto_cierre_esperado: { decrement: monto } },
        });
      }

      return {
        pago: await tx.pagoNomina.findUniqueOrThrow({
          where: { id_pagoNomina: pago.id_pagoNomina },
          include: { detalles: { include: { devengoNomina: true } } },
        }),
        nuevoSaldo: saldoPendiente.minus(monto),
      };
    });
  }

  // Saldo pendiente de TODOS los empleados de una, para el directorio (evita
  // N+1). saldo = SUM(devengos) - SUM(pagos): las deducciones ya son devengos
  // negativos, y cada pago reparte su monto completo, asi que estas dos sumas
  // reproducen el saldoPendiente que calcula saldo() por empleado.
  async saldosTodos() {
    const cero = new Prisma.Decimal(0);
    const [devengos, pagos] = await Promise.all([
      this.prisma.devengoNomina.groupBy({
        by: ['id_empleado_devengoNomina'],
        _sum: { monto_devengoNomina: true },
      }),
      this.prisma.pagoNomina.groupBy({
        by: ['id_empleado_pagoNomina'],
        _sum: { monto_pagoNomina: true },
      }),
    ]);
    const porEmpleado = new Map<
      number,
      { devengado: Prisma.Decimal; pagado: Prisma.Decimal }
    >();
    for (const d of devengos) {
      porEmpleado.set(d.id_empleado_devengoNomina, {
        devengado: d._sum.monto_devengoNomina ?? cero,
        pagado: cero,
      });
    }
    for (const p of pagos) {
      const actual = porEmpleado.get(p.id_empleado_pagoNomina) ?? {
        devengado: cero,
        pagado: cero,
      };
      actual.pagado = p._sum.monto_pagoNomina ?? cero;
      porEmpleado.set(p.id_empleado_pagoNomina, actual);
    }
    return [...porEmpleado.entries()].map(
      ([id_empleado, { devengado, pagado }]) => ({
        id_empleado,
        saldoPendiente: devengado.minus(pagado),
      }),
    );
  }

  async findByEmpleado(idEmpleado: number) {
    await this.findEmpleado(this.prisma, idEmpleado);
    return this.prisma.pagoNomina.findMany({
      where: { id_empleado_pagoNomina: idEmpleado },
      include: {
        detalles: { include: { devengoNomina: true } },
        usuarioRegistra: { select: { id_usuario: true, email_usuario: true } },
      },
      orderBy: { id_pagoNomina: 'desc' },
    });
  }
}
