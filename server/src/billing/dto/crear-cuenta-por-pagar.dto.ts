import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DetalleCompraDto {
  @IsInt() @IsPositive() idIngrediente!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() cantidad!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) precioUnitario!: number;
}

export class CrearCuentaPorPagarDto {
  @IsInt() @IsPositive() idProveedor!: number;
  @IsString() @IsNotEmpty() @MaxLength(150) concepto!: string;
  @IsOptional() @IsString() @MaxLength(50) documento?: string;
  @IsOptional() @IsDateString() fechaEmision?: string;
  @IsOptional() @IsDateString() fechaVencimiento?: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() montoTotal!: number;
  @IsOptional() @IsString() @MaxLength(300) observacion?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleCompraDto)
  detalles?: DetalleCompraDto[];
}
