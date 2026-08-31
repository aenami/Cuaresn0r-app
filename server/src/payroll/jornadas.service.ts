import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, EstadoJornada, TipoMarcacion } from '../generated/prisma/client';
import { NominaConfigService } from './nomina-config.service';
import { MarcarDto } from './dto/marcar.dto';
import { fechaLocalSinHora, horasEnFranjaNocturna, tiempoDbAMinutos } from './fechas';

const JORNADA_INCLUDE = {
  empleado: { select: { id_empleado: true, nombre_empleado: true, apellido_empleado: true } },
  marcaciones: { orderBy: { fecha_hora_marcacion: 'asc' } },
} satisfies Prisma.JornadaInclude;

// El peso colombiano no tiene centavos en circulacion: cada devengo se redondea
// al peso entero (hacia arriba, favoreciendo al empleado). Asi el saldo pendiente
// es siempre un entero y se puede pagar completo sin dejar centavos colgando.
export function aPesoEntero(monto: Prisma.Decimal): Prisma.Decimal {
  return monto.isNegative() ? monto.abs().ceil().negated() : monto.ceil();
}

@Injectable()
export class JornadasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nominaConfigService: NominaConfigService,
  ) {}

  // Registra ENTRADA o SALIDA alternando automaticamente; si el empleado no
  // tiene jornada ABIERTA, la crea (con fecha = dia local de la marcacion).
  async marcar(dto: MarcarDto) {
    return this.prisma.$transaction(async (tx) => {
      // Lock del empleado: dos marcaciones simultaneas del mismo empleado
      // crearian dos jornadas abiertas o romperian la alternancia.
      const filas = await tx.$queryRaw<{ id_empleado: number; estado_empleado: string }[]>`
        SELECT id_empleado, estado_empleado FROM "Empleado" WHERE id_empleado = ${dto.idEmpleado} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Empleado no encontrado');
      if (filas[0].estado_empleado !== 'ACTIVO') {
        throw new ConflictException('No se pueden registrar marcaciones de un empleado inactivo');
      }

      const instante = dto.fechaHora !== undefined ? new Date(dto.fechaHora) : new Date();
      if (instante.getTime() > Date.now() + 60_000) {
        throw new BadRequestException('La marcacion no puede estar en el futuro');
      }

      let jornada = await tx.jornada.findFirst({
        where: { id_empleado_jornada: dto.idEmpleado, estado_jornada: 'ABIERTA' },
        include: { marcaciones: { orderBy: { fecha_hora_marcacion: 'asc' } } },
      });

      let tipo: TipoMarcacion;
      if (!jornada) {
        jornada = await tx.jornada.create({
          data: { id_empleado_jornada: dto.idEmpleado, fecha_jornada: fechaLocalSinHora(instante) },
          include: { marcaciones: true },
        });
        tipo = 'ENTRADA';
      } else {
        const ultima = jornada.marcaciones[jornada.marcaciones.length - 1];
        if (ultima && instante.getTime() <= ultima.fecha_hora_marcacion.getTime()) {
          throw new BadRequestException(
            `La marcacion debe ser posterior a la ultima registrada (${ultima.fecha_hora_marcacion.toISOString()})`,
          );
        }
        // Alternancia estricta ENTRADA/SALIDA (seccion 11), por construccion.
        tipo = ultima?.tipo_marcacion === 'ENTRADA' ? 'SALIDA' : 'ENTRADA';
      }

      const marcacion = await tx.marcacion.create({
        data: { id_jornada_marcacion: jornada.id_jornada, tipo_marcacion: tipo, fecha_hora_marcacion: instante },
      });

      return {
        marcacion,
        jornada: await tx.jornada.findUniqueOrThrow({ where: { id_jornada: jornada.id_jornada }, include: JORNADA_INCLUDE }),
      };
    });
  }

  // Cierra la jornada y genera los devengos: el de horas trabajadas
  // (ordinarias + recargo nocturno) y los de conceptos automaticos por dia
  // trabajado (ej. auxilio de transporte) — todo en una sola transaccion.
  async cerrar(idJornada: number) {
    return this.prisma.$transaction(async (tx) => {
      // Lock: que no entre una marcacion ni otro cierre a mitad de calculo.
      const filas = await tx.$queryRaw<{ id_jornada: number }[]>`
        SELECT id_jornada FROM "Jornada" WHERE id_jornada = ${idJornada} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Jornada no encontrada');

      const jornada = await tx.jornada.findUniqueOrThrow({
        where: { id_jornada: idJornada },
        include: { marcaciones: { orderBy: { fecha_hora_marcacion: 'asc' } }, empleado: true },
      });
      if (jornada.estado_jornada === 'CERRADA') throw new ConflictException('Esta jornada ya esta cerrada');

      const marcaciones = jornada.marcaciones;
      const ultima = marcaciones[marcaciones.length - 1];
      if (!ultima || ultima.tipo_marcacion !== 'SALIDA') {
        throw new ConflictException('La jornada solo se puede cerrar cuando la ultima marcacion es una SALIDA');
      }

      const tarifa = await tx.tarifaEmpleado.findFirst({
        where: { id_empleado_tarifaEmpleado: jornada.id_empleado_jornada, tarifa_activa: true },
      });
      if (!tarifa) {
        throw new ConflictException(
          'El empleado no tiene una tarifa activa; asignala antes de cerrar la jornada para poder liquidarla',
        );
      }

      const config = await this.nominaConfigService.findActiva(tx);
      const hayRecargo =
        config.aplica_recargo_nocturno && config.hora_inicio_nocturno !== null && config.hora_fin_nocturno !== null;
      const inicioMin = hayRecargo ? tiempoDbAMinutos(config.hora_inicio_nocturno!) : 0;
      const finMin = hayRecargo ? tiempoDbAMinutos(config.hora_fin_nocturno!) : 0;

      // Pares (ENTRADA, SALIDA): la alternancia la garantizo marcar().
      let horasTotales = 0;
      let horasNocturnas = 0;
      for (let i = 0; i + 1 < marcaciones.length; i += 2) {
        const entrada = marcaciones[i].fecha_hora_marcacion;
        const salida = marcaciones[i + 1].fecha_hora_marcacion;
        horasTotales += (salida.getTime() - entrada.getTime()) / 3600000;
        if (hayRecargo) horasNocturnas += horasEnFranjaNocturna(entrada, salida, inicioMin, finMin);
      }

      const horasRecargo = new Prisma.Decimal(horasNocturnas).toDecimalPlaces(2);
      const horasOrdinarias = new Prisma.Decimal(horasTotales - horasNocturnas).toDecimalPlaces(2);
      const valorHora = tarifa.valor_hora_tarifaEmpleado;
      const porcentaje = hayRecargo ? config.porcentaje_recargo_nocturno : null;
      const factorRecargo = porcentaje ? new Prisma.Decimal(1).plus(porcentaje.dividedBy(100)) : new Prisma.Decimal(1);
      const monto = aPesoEntero(
        valorHora.times(horasOrdinarias).plus(valorHora.times(horasRecargo).times(factorRecargo)),
      );

      const devengoJornada = await tx.devengoNomina.create({
        data: {
          id_empleado_devengoNomina: jornada.id_empleado_jornada,
          id_jornada_devengoNomina: jornada.id_jornada,
          horas_ordinarias_devengoNomina: horasOrdinarias,
          horas_recargo_devengoNomina: horasRecargo,
          valor_hora_aplicado_devengoNomina: valorHora,
          porcentaje_recargo_aplicado_devengoNomina: porcentaje,
          monto_devengoNomina: monto,
          fecha_devengoNomina: jornada.fecha_jornada,
        },
      });

      // Conceptos automaticos por dia trabajado (seccion 13): una fila de
      // ConceptoNominaEmpleado por jornada cerrada + su devengo, con el
      // valor vigente snapshoteado.
      const automaticos = await tx.conceptoNomina.findMany({ where: { aplica_automaticamente: true } });
      const devengosConceptos = [];
      for (const concepto of automaticos) {
        const valor = await tx.valorConceptoNomina.findFirst({
          where: { id_concepto_valorConceptoNomina: concepto.id_conceptoNomina, valor_activo: true },
        });
        if (!valor) {
          throw new ConflictException(
            `El concepto automatico "${concepto.nombre_conceptoNomina}" no tiene un valor activo; configuralo o desactiva su aplicacion automatica`,
          );
        }

        const montoConcepto = aPesoEntero(valor.monto_valorConceptoNomina);
        const cne = await tx.conceptoNominaEmpleado.create({
          data: {
            id_concepto_cne: concepto.id_conceptoNomina,
            id_empleado_cne: jornada.id_empleado_jornada,
            id_jornada_cne: jornada.id_jornada,
            fecha_cne: jornada.fecha_jornada,
            cantidad_cne: 1,
            valor_unitario_aplicado_cne: valor.monto_valorConceptoNomina,
            monto_cne: montoConcepto,
          },
        });

        const signo = concepto.tipo_conceptoNomina === 'DEDUCCION' ? -1 : 1;
        devengosConceptos.push(
          await tx.devengoNomina.create({
            data: {
              id_empleado_devengoNomina: jornada.id_empleado_jornada,
              id_conceptoNominaEmpleado_devengoNomina: cne.id_conceptoNominaEmpleado,
              monto_devengoNomina: montoConcepto.times(signo),
              fecha_devengoNomina: jornada.fecha_jornada,
            },
          }),
        );
      }

      await tx.jornada.update({ where: { id_jornada: idJornada }, data: { estado_jornada: 'CERRADA' } });

      return {
        jornada: await tx.jornada.findUniqueOrThrow({ where: { id_jornada: idJornada }, include: JORNADA_INCLUDE }),
        devengos: [devengoJornada, ...devengosConceptos],
      };
    });
  }

  // Deshace la ultima marcacion de una jornada ABIERTA (el "ctrl+z" del
  // cajero que marco por error). Si la jornada queda sin marcaciones, se
  // elimina completa. Una jornada CERRADA se corrige reabriendola primero.
  async deshacerUltimaMarcacion(idJornada: number) {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ id_jornada: number }[]>`
        SELECT id_jornada FROM "Jornada" WHERE id_jornada = ${idJornada} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Jornada no encontrada');

      const jornada = await tx.jornada.findUniqueOrThrow({
        where: { id_jornada: idJornada },
        include: { marcaciones: { orderBy: { fecha_hora_marcacion: 'desc' }, take: 1 } },
      });
      if (jornada.estado_jornada === 'CERRADA') {
        throw new ConflictException('La jornada esta cerrada; reabrela antes de corregir marcaciones');
      }

      const ultima = jornada.marcaciones[0];
      if (!ultima) throw new ConflictException('La jornada no tiene marcaciones para deshacer');

      await tx.marcacion.delete({ where: { id_marcacion: ultima.id_marcacion } });

      const restantes = await tx.marcacion.count({ where: { id_jornada_marcacion: idJornada } });
      if (restantes === 0) {
        await tx.jornada.delete({ where: { id_jornada: idJornada } });
        return { marcacionEliminada: ultima, jornadaEliminada: true as const };
      }

      return {
        marcacionEliminada: ultima,
        jornadaEliminada: false as const,
        jornada: await tx.jornada.findUniqueOrThrow({ where: { id_jornada: idJornada }, include: JORNADA_INCLUDE }),
      };
    });
  }

  // Reabre una jornada CERRADA para corregirla (solo ADMIN): elimina los
  // devengos que genero el cierre (horas + conceptos automaticos) y vuelve
  // a ABIERTA para deshacer/remarcar y recerrar. Solo es posible mientras
  // NINGUN devengo tenga pagos aplicados: si ya se pago, la historia no se
  // toca y la diferencia se compensa con un concepto manual de ajuste.
  async reabrir(idJornada: number) {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ id_jornada: number }[]>`
        SELECT id_jornada FROM "Jornada" WHERE id_jornada = ${idJornada} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Jornada no encontrada');

      const jornada = await tx.jornada.findUniqueOrThrow({ where: { id_jornada: idJornada } });
      if (jornada.estado_jornada === 'ABIERTA') throw new ConflictException('Esta jornada ya esta abierta');

      // El indice parcial jornada_abierta_por_empleado lo rechazaria igual,
      // pero con este chequeo el error le dice al usuario que hacer.
      const otraAbierta = await tx.jornada.findFirst({
        where: { id_empleado_jornada: jornada.id_empleado_jornada, estado_jornada: 'ABIERTA' },
      });
      if (otraAbierta) {
        throw new ConflictException(
          `El empleado tiene otra jornada abierta (#${otraAbierta.id_jornada}); cierrala o corrigela antes de reabrir esta`,
        );
      }

      // Devengos del cierre: el de horas (directo) + los de conceptos
      // automaticos (via ConceptoNominaEmpleado con id_jornada_cne).
      const devengos = await tx.devengoNomina.findMany({
        where: {
          OR: [
            { id_jornada_devengoNomina: idJornada },
            { conceptoNominaEmpleado: { id_jornada_cne: idJornada } },
          ],
        },
        include: { pagoNominaDetalles: true },
      });
      if (devengos.some((d) => d.pagoNominaDetalles.length > 0)) {
        throw new ConflictException(
          'Los devengos de esta jornada ya tienen pagos aplicados; no se puede reabrir. Compensa la diferencia con un concepto manual de ajuste',
        );
      }

      // Orden de borrado por FKs: devengos -> conceptos automaticos.
      await tx.devengoNomina.deleteMany({
        where: { id_devengoNomina: { in: devengos.map((d) => d.id_devengoNomina) } },
      });
      await tx.conceptoNominaEmpleado.deleteMany({ where: { id_jornada_cne: idJornada } });

      return tx.jornada.update({
        where: { id_jornada: idJornada },
        data: { estado_jornada: 'ABIERTA' },
        include: JORNADA_INCLUDE,
      });
    });
  }

  async findAll(idEmpleado?: number, estado?: EstadoJornada) {
    return this.prisma.jornada.findMany({
      where: {
        ...(idEmpleado !== undefined && { id_empleado_jornada: idEmpleado }),
        ...(estado !== undefined && { estado_jornada: estado }),
      },
      include: JORNADA_INCLUDE,
      orderBy: { id_jornada: 'desc' },
    });
  }

  async findOne(id: number) {
    const jornada = await this.prisma.jornada.findUnique({
      where: { id_jornada: id },
      include: { ...JORNADA_INCLUDE, devengos: true, conceptosNomina: { include: { concepto: true } } },
    });
    if (!jornada) throw new NotFoundException('Jornada no encontrada');
    return jornada;
  }
}
