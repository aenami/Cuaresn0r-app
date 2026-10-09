import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class TramoHorarioDto {
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i)
  entrada!: string;

  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i)
  salida!: string;
}

export class RegistrarHorarioDto {
  @IsInt()
  @Min(1)
  idEmpleado!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idJornada?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TramoHorarioDto)
  tramos!: TramoHorarioDto[];
}
