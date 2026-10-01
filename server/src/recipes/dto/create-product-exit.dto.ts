import { IsInt, IsNotEmpty, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateProductExitDto {
  @IsInt()
  @IsPositive()
  productoId!: number;

  @IsInt()
  @IsPositive()
  cantidad!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  motivo!: string;
}
