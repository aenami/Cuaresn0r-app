import { IsNotEmpty, IsString, IsNumber, IsEnum, Min } from 'class-validator';

export enum MeasureUnits {
  gr = 'g',
  kg = 'kg',
  dg = 'dg',
  mg = 'mg',
  ml = 'ml',
  l = 'L',
  Units = 'UNIDADES'
}

export class CreateIngredientDto {
  @IsNotEmpty()
  @IsString()
  name!: string;
  @IsNumber()
  @Min(0)
  stock!: number;
  @IsEnum(MeasureUnits)
  units!: MeasureUnits;
  @IsNumber()
  @Min(0)
  price!: number;
}
