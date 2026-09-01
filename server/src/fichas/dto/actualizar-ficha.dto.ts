import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarFichaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  numero?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
