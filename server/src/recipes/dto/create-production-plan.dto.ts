import { IsEnum, IsInt, IsNumber, Matches, Max, Min } from 'class-validator';
import { TipoObjetivoProduccion } from '../../generated/prisma/client';

export class CreateProductionPlanDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  fecha!: string;

  @IsEnum(TipoObjetivoProduccion)
  tipo!: TipoObjetivoProduccion;

  @IsInt()
  @Min(1)
  idObjetivo!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(9999999999999999)
  cantidad!: number;
}
