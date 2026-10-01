import { IsEnum, IsInt, IsString, IsUUID, Matches, Min } from 'class-validator';
import { EstadoMetaProduccion } from '../generated/prisma/client';

export class RegistrarEntradaHojaDto {
  @IsInt()
  @Min(1)
  articuloId!: number;

  @IsInt()
  @Min(1)
  cantidad!: number;

  @IsUUID()
  claveOperacion!: string;
}

export class CrearMetaPanaderiaDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;

  @IsInt()
  @Min(1)
  articuloId!: number;

  @IsInt()
  @Min(1)
  cantidadObjetivo!: number;
}

export class ActualizarMetaPanaderiaDto {
  @IsEnum(EstadoMetaProduccion)
  estado!: EstadoMetaProduccion;
}
