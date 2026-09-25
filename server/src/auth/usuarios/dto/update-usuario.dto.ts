import { IsEmail, IsEnum, IsInt, IsOptional } from 'class-validator';
import { AreaNegocio } from '../../../generated/prisma/client';

// Reasignar id_empleado o cambiar la password no van aqui: son operaciones
// con implicaciones propias (ver AuthService.findUser y /me/password).
export class UpdateUsuarioDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  idRol?: number;

  @IsOptional()
  @IsEnum(AreaNegocio)
  area?: AreaNegocio;
}
