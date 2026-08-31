import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsPositive, Max, ValidateNested } from 'class-validator';

export class RepartoDto {
  @IsInt()
  idSubcuenta!: number;

  // La suma de todas las proporciones del reparto debe dar exactamente 1.0
  // (se valida en SubcuentasService, no solo por-fila aqui).
  @IsNumber()
  @IsPositive()
  @Max(1)
  proporcion!: number;
}

export class SplitItemDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => RepartoDto)
  reparto!: RepartoDto[];
}
