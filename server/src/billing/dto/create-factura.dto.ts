import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateFacturaDto {
  @IsInt()
  idSubcuenta!: number;

  // Propina (servicio) como % del subtotal, elegida al cobrar. Si se omite,
  // se usa el porcentaje_servicio de la config activa (comportamiento previo).
  // 0 = el cliente declina la propina.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajePropina?: number;

  // Alternativa al porcentaje: el monto EXACTO de propina/servicio en pesos que
  // el cliente decide dejar (para cuando no calza con ningun porcentaje). Si
  // viene, manda sobre porcentajePropina. 0 = sin propina.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  montoServicio?: number;
}
