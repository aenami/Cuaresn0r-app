import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const tiposCategoriaPanaderia = ['PANADERIA', 'PASTELERIA', 'EXTERNO'] as const;

export class CrearCategoriaPanaderiaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre!: string;

  @IsIn(tiposCategoriaPanaderia)
  tipo!: (typeof tiposCategoriaPanaderia)[number];
}

export class ActualizarCategoriaPanaderiaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
