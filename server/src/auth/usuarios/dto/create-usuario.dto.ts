import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { AreaNegocio } from '../../../generated/prisma/client';

export class CreateUsuarioDto {
  @IsInt()
  idEmpleado!: number;

  @IsInt()
  idRol!: number;

  @IsOptional()
  @IsEnum(AreaNegocio)
  area?: AreaNegocio;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
