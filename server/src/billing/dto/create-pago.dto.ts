import { IsEnum, IsNumber, IsOptional, IsPositive, Min, ValidateIf } from 'class-validator';
import { MetodoPago, DestinoExcedente } from '../../generated/prisma/client';

// Un pago puede cubrir la factura completa o solo una parte (pagos mixtos:
// ej. mitad efectivo + mitad tarjeta se registra como dos POST seguidos).
export class CreatePagoDto {
  @IsEnum(MetodoPago)
  metodo!: MetodoPago;

  // Monto aplicado a la factura (no incluye el excedente). Por defecto, el saldo.
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  monto!: number;

  // Excedente voluntario que el cliente deja al negocio ("quedese con el vuelto").
  // Solo aplica en efectivo y solo en el pago que salda la cuenta. 0 = sin excedente.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  excedente?: number;

  // A donde va el excedente: CASA (ingreso del negocio) o PROPINA (pool de
  // meseros). Obligatorio cuando hay excedente; se ignora si el excedente es 0.
  @ValidateIf((o: CreatePagoDto) => o.excedente !== undefined && o.excedente > 0)
  @IsEnum(DestinoExcedente)
  destinoExcedente!: DestinoExcedente;
}
