import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearProveedorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsOptional() @IsString() @MaxLength(80) contacto?: string;
  @IsOptional() @IsString() @MaxLength(30) telefono?: string;
  @IsOptional() @IsString() @MaxLength(30) nit?: string;
}
