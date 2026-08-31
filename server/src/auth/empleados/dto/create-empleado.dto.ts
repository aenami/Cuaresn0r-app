import { IsString, IsNotEmpty, IsOptional, IsDateString, MaxLength } from 'class-validator';

export class CreateEmpleadoDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  nombre!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  apellido!: string;

  // Si se omite, se asume que ingresa hoy.
  @IsOptional()
  @IsDateString()
  fechaIngreso?: string;
}
