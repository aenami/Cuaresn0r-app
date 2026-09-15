import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Min,
} from 'class-validator';
import { TipoObjetivoProduccion } from '../../generated/prisma/client';

export class CreateInventoryCountDto {
  @IsDateString()
  fecha!: string;

  @IsEnum(TipoObjetivoProduccion)
  tipo!: TipoObjetivoProduccion;

  @IsInt()
  @IsPositive()
  idObjetivo!: number;

  // Solo se usa para iniciar el historial cuando aun no existe un cierre previo.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidadInicial?: number;
}
