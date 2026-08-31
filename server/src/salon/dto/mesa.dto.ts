import { IsNotEmpty, IsNumber, IsOptional } from "class-validator";

export class CreateTableDto {
  @IsNumber()
  @IsNotEmpty()
  numero_mesa!: number;
  @IsOptional()
  @IsNumber()
  capacidad?: number;
  @IsNotEmpty()
  @IsNumber()
  id_zona!: number;
}