import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  MaxLength,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';

export class CreateProductDto {
  @IsOptional() @IsInt() @Min(1) articuloCompartidoId?: number | null;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(1)
  precioInternoCompartido?: number | null;
  @IsOptional() @IsIn(['EJECUTIVO', 'BANDEJA']) tipoMenu?: string | null;
  @IsNotEmpty()
  @IsString()
  name!: string;
  @IsNotEmpty()
  @IsNumber()
  price!: number;
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsNumber()
  category?: number;
  // Ruta relativa devuelta por POST /catalog/uploads/imagen (p. ej.
  // "/uploads/productos/<uuid>.webp"), o una URL http(s) externa por
  // compatibilidad con datos previos.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  image?: string;
}
