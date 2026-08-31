import { IsInt, IsNumber, Min } from 'class-validator';

export class AbrirTurnoDto {
  @IsInt()
  idCaja!: number;

  // Efectivo con el que arranca la caja (base). Puede ser 0.
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  montoApertura!: number;
}
