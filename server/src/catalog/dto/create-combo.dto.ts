import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ComboComponenteDto {
  @IsInt()
  idProducto!: number;

  @IsNumber()
  @IsPositive()
  cantidad!: number;
}

export class CreateComboDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  nombre!: string;

  @IsNumber()
  @IsPositive()
  precio!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboComponenteDto)
  componentes!: ComboComponenteDto[];
}
