import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { UpdateNegocioDto } from './dto/update-negocio.dto';

@Injectable()
export class NegocioConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // Datos del negocio vigentes para el encabezado de la factura. Si el admin
  // no ha configurado nada (el seed crea una fila inicial), devuelve null y el
  // que imprime decide el fallback.
  findActiva(tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.configuracionNegocio.findFirst({ where: { configuracion_activa: true } });
  }

  // Mismo versionado que ConfiguracionFacturacion: se desactiva la vigente y se
  // inserta una nueva, nunca UPDATE sobre la existente.
  async crearVersion(dto: UpdateNegocioDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.configuracionNegocio.updateMany({
        where: { configuracion_activa: true },
        data: { configuracion_activa: false },
      });
      return tx.configuracionNegocio.create({
        data: {
          nombre_negocio: dto.nombre,
          nit_negocio: dto.nit ?? null,
          direccion_negocio: dto.direccion ?? null,
          telefono_negocio: dto.telefono ?? null,
        },
      });
    });
  }
}
