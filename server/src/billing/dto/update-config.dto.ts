import { IsNumber, Max, Min } from 'class-validator';

// Porcentajes sobre el subtotal (ej. 10 = 10%). Cada cambio crea una NUEVA
// version de ConfiguracionFacturacion y desactiva la anterior (nunca UPDATE).
export class UpdateConfigDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeServicio!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeImpuestos!: number;
}
