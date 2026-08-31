import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Datos del negocio que encabezan la factura. Solo el nombre es obligatorio;
// NIT/direccion/telefono son opcionales (no todo negocio los pone en el recibo).
export class UpdateNegocioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;
}
