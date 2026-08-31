import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { MetodoPagoNomina } from '../../generated/prisma/client';

// EFECTIVO sale de la caja: exige turno abierto del usuario que registra y
// genera el MovimientoCaja EGRESO. TRANSFERENCIA es externa (sin turno).
export class CreatePagoNominaDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto!: number;

  @IsEnum(MetodoPagoNomina)
  metodo!: MetodoPagoNomina;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  observacion?: string;
}
