import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateMovimientoCajaDto } from './dto/create-movimiento-caja.dto';

@Injectable()
export class MovimientosCajaService {
  constructor(private readonly prisma: PrismaService) {}

  // Siempre contra el turno ABIERTO del usuario autenticado (seccion 9): la
  // trazabilidad de quien lo registro queda implicita via Turno.
  async registrar(idUsuario: number, dto: CreateMovimientoCajaDto) {
    return this.prisma.$transaction(async (tx) => {
      const turno = await tx.turno.findFirst({
        where: { id_usuario_turno: idUsuario, estado_turno: 'ABIERTO' },
      });
      if (!turno) {
        throw new ConflictException('No tienes un turno abierto; abre uno antes de registrar movimientos de caja');
      }

      // Bloqueo del turno: serializa contra otros movimientos/pagos/cierre.
      await tx.$queryRaw`SELECT id_turno FROM "Turno" WHERE id_turno = ${turno.id_turno} FOR UPDATE`;
      const turnoActual = await tx.turno.findUniqueOrThrow({ where: { id_turno: turno.id_turno } });

      const monto = new Prisma.Decimal(dto.monto);
      const delta = dto.tipo === 'INGRESO' ? monto : monto.negated();
      const esperadoActual = turnoActual.monto_cierre_esperado ?? turnoActual.monto_apertura_turno;
      const nuevoEsperado = esperadoActual.plus(delta);
      if (nuevoEsperado.isNegative()) {
        throw new UnprocessableEntityException(
          `El egreso dejaria la caja en negativo (efectivo esperado actual: ${esperadoActual.toFixed(2)})`,
        );
      }

      const movimiento = await tx.movimientoCaja.create({
        data: {
          id_turno_mc: turno.id_turno,
          tipo_mc: dto.tipo,
          monto_mc: dto.monto,
          concepto_mc: dto.concepto,
        },
      });

      // Cache de cierre esperado actualizado en la MISMA transaccion que el
      // movimiento (seccion 7); la fuente de verdad sigue siendo la suma.
      await tx.turno.update({
        where: { id_turno: turno.id_turno },
        data: { monto_cierre_esperado: nuevoEsperado },
      });

      return movimiento;
    });
  }
}
