import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearCategoriaPanaderiaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre!: string;

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
