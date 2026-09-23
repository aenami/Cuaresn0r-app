import { IsEnum, IsInt } from 'class-validator';
import { TipoTurno } from '../../generated/prisma/client';

export class AbrirTurnoDto {
  @IsInt()
  idCaja!: number;

  @IsEnum(TipoTurno)
  tipo!: TipoTurno;
}
