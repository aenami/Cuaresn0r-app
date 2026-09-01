import { IsInt } from 'class-validator';

export class AbrirTurnoDto {
  @IsInt()
  idCaja!: number;

}
