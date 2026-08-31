import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { UpdateNominaConfigDto } from './dto/update-nomina-config.dto';
import { minutosATiempoDb } from './fechas';

@Injectable()
export class NominaConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // Acepta tx externo para que el cierre de jornada lea la config vigente
  // dentro de su propia transaccion. Sin config (el seed crea una inicial),
  // se liquida sin recargo en vez de reventar.
  async findActiva(tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const config = await client.configuracionNomina.findFirst({ where: { configuracion_activa: true } });
    return (
      config ?? {
        aplica_recargo_nocturno: false,
        porcentaje_recargo_nocturno: null,
        hora_inicio_nocturno: null,
        hora_fin_nocturno: null,
      }
    );
  }

  // Nueva version (nunca UPDATE): una jornada cerrada en el pasado quedo
  // liquidada con la config que regia ese dia, y eso no se toca.
  async crearVersion(dto: UpdateNominaConfigDto) {
    if (dto.aplicaRecargoNocturno) {
      if (dto.porcentajeRecargo === undefined || dto.horaInicio === undefined || dto.horaFin === undefined) {
        throw new BadRequestException('Con recargo nocturno activo, porcentajeRecargo, horaInicio y horaFin son obligatorios');
      }
      if (dto.horaInicio === dto.horaFin) {
        throw new BadRequestException('La franja nocturna no puede empezar y terminar a la misma hora');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.configuracionNomina.updateMany({
        where: { configuracion_activa: true },
        data: { configuracion_activa: false },
      });
      return tx.configuracionNomina.create({
        data: {
          aplica_recargo_nocturno: dto.aplicaRecargoNocturno,
          ...(dto.aplicaRecargoNocturno && {
            porcentaje_recargo_nocturno: dto.porcentajeRecargo,
            hora_inicio_nocturno: minutosATiempoDb(dto.horaInicio!),
            hora_fin_nocturno: minutosATiempoDb(dto.horaFin!),
          }),
        },
      });
    });
  }

  async findHistorial() {
    return this.prisma.configuracionNomina.findMany({ orderBy: { id_configuracionNomina: 'desc' } });
  }
}
