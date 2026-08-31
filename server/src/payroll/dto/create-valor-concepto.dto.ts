import { IsNumber, IsPositive } from 'class-validator';

// Nueva version del valor (desactiva la vigente). Siempre positivo: el
// signo lo aporta el tipo del concepto (INGRESO/DEDUCCION) al devengar.
export class CreateValorConceptoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto!: number;
}
