import {
  IsNumber,
  Min,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
export class CorregirCuadreDto {
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) montoCierreReal!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) transferenciaReal?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) tarjetaReal?: number;
  @IsString() @MinLength(3) @MaxLength(300) motivo!: string;
}
