import { IsEnum } from 'class-validator';
import { EstadoMetaProduccion } from '../../generated/prisma/client';

export class UpdateProductionPlanStatusDto {
  @IsEnum(EstadoMetaProduccion)
  estado!: EstadoMetaProduccion;
}
