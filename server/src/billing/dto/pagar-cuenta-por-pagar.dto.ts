import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { MetodoPagoCuentaPorPagar } from '../../generated/prisma/client';

export class PagarCuentaPorPagarDto {
  @IsEnum(MetodoPagoCuentaPorPagar)
  metodo!: MetodoPagoCuentaPorPagar;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  monto!: number;
}
