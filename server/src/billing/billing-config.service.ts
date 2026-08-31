import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { UpdateConfigDto } from './dto/update-config.dto';

@Injectable()
export class BillingConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // Acepta un tx externo para que FacturasService lea la tarifa vigente
  // dentro de su propia transaccion de emision. Si nadie configuro nada
  // todavia (el seed crea una fila inicial, esto es defensa extra), se
  // factura con 0/0 en vez de reventar.
  async findActiva(tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const config = await client.configuracionFacturacion.findFirst({ where: { configuracion_activa: true } });
    return (
      config ?? {
        porcentaje_servicio: new Prisma.Decimal(0),
        porcentaje_impuestos: new Prisma.Decimal(0),
      }
    );
  }

  // Mismo patron de versionado que Receta/ConfiguracionNomina: se desactiva
  // la vigente y se inserta una nueva, nunca UPDATE sobre la existente. Las
  // facturas ya emitidas no se ven afectadas (snapshotean sus montos).
  async crearVersion(dto: UpdateConfigDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.configuracionFacturacion.updateMany({
        where: { configuracion_activa: true },
        data: { configuracion_activa: false },
      });
      return tx.configuracionFacturacion.create({
        data: {
          porcentaje_servicio: dto.porcentajeServicio,
          porcentaje_impuestos: dto.porcentajeImpuestos,
        },
      });
    });
  }

  async findHistorial() {
    return this.prisma.configuracionFacturacion.findMany({ orderBy: { id_configuracionFacturacion: 'desc' } });
  }
}
