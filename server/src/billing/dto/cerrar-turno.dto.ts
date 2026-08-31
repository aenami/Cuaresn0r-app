import { IsNumber, Min, IsObject, IsOptional } from 'class-validator';

export class CerrarTurnoDto {
  // Efectivo fisico contado por el cajero al cierre; la diferencia contra
  // monto_cierre_esperado revela faltante o sobrante (seccion 7 de la spec).
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  montoCierreReal!: number;

  // Desglose por denominacion del conteo (arqueo): { "100000": 2, "500": 10 }.
  // Opcional; se snapshotea en el turno tal cual para auditar el conteo.
  @IsOptional()
  @IsObject()
  conteo?: Record<string, number>;
}
