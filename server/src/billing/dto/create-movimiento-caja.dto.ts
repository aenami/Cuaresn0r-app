import { IsEnum, IsNotEmpty, IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';
import { TipoMovimientoCaja } from '../../generated/prisma/client';

// Dinero que entra/sale de caja SIN estar ligado a una venta (retiros del
// dueno, reposicion de caja menor, compra de insumos en efectivo, etc.).
export class CreateMovimientoCajaDto {
  @IsEnum(TipoMovimientoCaja)
  tipo!: TipoMovimientoCaja;

  // Siempre positivo: la direccion la define `tipo`, nunca el signo.
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  monto!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  concepto!: string;
}
