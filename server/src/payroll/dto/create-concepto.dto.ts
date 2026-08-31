import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { TipoConceptoNomina, UnidadCalculoConceptoNomina } from '../../generated/prisma/client';

export class CreateConceptoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre!: string;

  @IsEnum(TipoConceptoNomina)
  tipo!: TipoConceptoNomina;

  // true = se genera solo con cada jornada cerrada (ej. auxilio de
  // transporte diario); requiere unidadCalculo.
  @IsOptional()
  @IsBoolean()
  aplicaAutomaticamente?: boolean;

  @IsOptional()
  @IsEnum(UnidadCalculoConceptoNomina)
  unidadCalculo?: UnidadCalculoConceptoNomina;

  // Comodidad: crea el concepto ya con su primer ValorConceptoNomina activo.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorInicial?: number;
}
