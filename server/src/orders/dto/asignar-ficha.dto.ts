import { IsInt, IsPositive } from 'class-validator';

export class AsignarFichaDto {
  @IsInt()
  @IsPositive()
  idFicha!: number;
}
