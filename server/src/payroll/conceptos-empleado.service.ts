import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateConceptoEmpleadoDto } from './dto/create-concepto-empleado.dto';
import { fechaLocalSinHora } from './fechas';

@Injectable()
export class ConceptosEmpleadoService {
  constructor(private readonly prisma: PrismaService) {}

  // Aplicacion manual (incentivo, bono, descuento): id_jornada queda null
  // (seccion 13) y el devengo nace en la misma transaccion, negativo si el
  // concepto es DEDUCCION (asi resta del saldo en la cuenta corriente).
  async aplicar(idEmpleado: number, dto: CreateConceptoEmpleadoDto) {
    const empleado = await this.prisma.empleado.findUnique({ where: { id_empleado: idEmpleado } });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    if (empleado.estado_empleado !== 'ACTIVO') {
      throw new ConflictException('No se pueden aplicar conceptos a un empleado inactivo');
    }

    const concepto = await this.prisma.conceptoNomina.findUnique({ where: { id_conceptoNomina: dto.idConcepto } });
    if (!concepto) throw new NotFoundException('Concepto de nomina no encontrado');

    const valor = await this.prisma.valorConceptoNomina.findFirst({
      where: { id_concepto_valorConceptoNomina: dto.idConcepto, valor_activo: true },
    });
    if (!valor) {
      throw new UnprocessableEntityException(`El concepto "${concepto.nombre_conceptoNomina}" no tiene un valor activo configurado`);
    }

    const cantidad = new Prisma.Decimal(dto.cantidad ?? 1);
    // COP sin centavos: se redondea al peso entero hacia arriba, para que el
    // saldo quede siempre en enteros y se pueda pagar completo.
    const monto = valor.monto_valorConceptoNomina.times(cantidad).ceil();
    // YYYY-MM-DD ya es un dia calendario exacto (medianoche UTC al parsear);
    // solo el default "hoy" necesita convertirse desde el reloj local.
    const fecha = dto.fecha !== undefined ? new Date(dto.fecha) : fechaLocalSinHora(new Date());

    return this.prisma.$transaction(async (tx) => {
      const cne = await tx.conceptoNominaEmpleado.create({
        data: {
          id_concepto_cne: dto.idConcepto,
          id_empleado_cne: idEmpleado,
          fecha_cne: fecha,
          cantidad_cne: cantidad,
          valor_unitario_aplicado_cne: valor.monto_valorConceptoNomina,
          monto_cne: monto,
          ...(dto.observacion !== undefined && { observacion_cne: dto.observacion }),
        },
        include: { concepto: true },
      });

      const signo = concepto.tipo_conceptoNomina === 'DEDUCCION' ? -1 : 1;
      const devengo = await tx.devengoNomina.create({
        data: {
          id_empleado_devengoNomina: idEmpleado,
          id_conceptoNominaEmpleado_devengoNomina: cne.id_conceptoNominaEmpleado,
          monto_devengoNomina: monto.times(signo),
          fecha_devengoNomina: fecha,
        },
      });

      return { conceptoAplicado: cne, devengo };
    });
  }

  async findByEmpleado(idEmpleado: number) {
    const empleado = await this.prisma.empleado.findUnique({ where: { id_empleado: idEmpleado } });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    return this.prisma.conceptoNominaEmpleado.findMany({
      where: { id_empleado_cne: idEmpleado },
      include: { concepto: true },
      orderBy: { id_conceptoNominaEmpleado: 'desc' },
    });
  }
}
