import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { UpdatePropinasConfigDto } from './dto/update-propinas-config.dto';

@Injectable()
export class PropinasConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // Acepta tx externo para que el reparto lea la config vigente dentro de su
  // propia transaccion. Sin config (nunca se creo), no se retiene nada.
  async findActiva(tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const config = await client.configuracionPropinas.findFirst({ where: { configuracion_activa: true } });
    return config ?? { retiene_casa: false, porcentaje_casa: null };
  }

  // Nueva version (nunca UPDATE): un reparto pasado ya quedo con los montos
  // snapshoteados en sus devengos, y eso no se recalcula.
  async crearVersion(dto: UpdatePropinasConfigDto) {
    if (dto.retieneCasa && (dto.porcentajeCasa === undefined || dto.porcentajeCasa <= 0)) {
      throw new BadRequestException('Con la retencion activa, porcentajeCasa debe ser mayor que 0');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.configuracionPropinas.updateMany({
        where: { configuracion_activa: true },
        data: { configuracion_activa: false },
      });
      return tx.configuracionPropinas.create({
        data: {
          retiene_casa: dto.retieneCasa,
          porcentaje_casa: dto.retieneCasa ? dto.porcentajeCasa : null,
        },
      });
    });
  }
}
